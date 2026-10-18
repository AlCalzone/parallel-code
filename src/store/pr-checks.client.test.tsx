import { createRoot } from 'solid-js';
import { reconcile } from 'solid-js/store';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IPC } from '../../electron/ipc/channels';
import { fireAndForget, invoke } from '../lib/ipc';
import { setStore } from './core';
import { startPrChecksSubscription } from './pr-checks';
import { extraPrWatchId, getTaskExtraPrs, setTaskExtraPrs } from './pr-checks-state';
import type { Task } from './types';

vi.mock('../lib/ipc', () => ({ invoke: vi.fn(), fireAndForget: vi.fn() }));
vi.mock('./persistence', () => ({ saveState: vi.fn(() => Promise.resolve()) }));

const primaryUrl = 'https://github.com/acme/app/pull/12';
const apiUrl = 'https://github.com/acme/api/pull/7';
const flushPromises = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Task',
    projectId: 'project-1',
    branchName: 'task/task-1',
    worktreePath: '/repo/.worktrees/task-1',
    agentIds: [],
    shellAgentIds: [],
    notes: '',
    lastPrompt: '',
    gitIsolation: 'worktree',
    prUrl: primaryUrl,
    ...overrides,
  };
}

let dispose: (() => void) | undefined;

beforeEach(() => {
  vi.mocked(invoke).mockResolvedValue({ url: primaryUrl, extras: [{ url: apiUrl, repo: 'api' }] });
  vi.stubGlobal('electron', { ipcRenderer: { on: () => () => {} } });
  setStore('taskOrder', ['task-1']);
  setStore('collapsedTaskOrder', []);
  setStore('tasks', reconcile({ 'task-1': task() }));
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  setTaskExtraPrs('task-1', []);
  setStore('taskOrder', []);
  setStore('tasks', reconcile({}));
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function startWithExtraPr(): Promise<void> {
  createRoot((d) => {
    dispose = d;
    startPrChecksSubscription();
  });
  await flushPromises();
  expect(getTaskExtraPrs('task-1')).toEqual([{ url: apiUrl, repo: 'api' }]);
  vi.mocked(fireAndForget).mockClear();
}

const stopApi = { watchId: extraPrWatchId('task-1', apiUrl) };

it('stops watching a removed task’s additional PRs', async () => {
  await startWithExtraPr();

  setStore('taskOrder', []);
  setStore('tasks', reconcile({}));

  expect(fireAndForget).toHaveBeenCalledWith(IPC.StopPrChecksWatcher, stopApi);
  expect(getTaskExtraPrs('task-1')).toEqual([]);
});

it('stops watching additional PRs once the task leaves its worktree', async () => {
  await startWithExtraPr();

  setStore('tasks', 'task-1', 'gitIsolation', 'direct');

  expect(fireAndForget).toHaveBeenCalledWith(IPC.StopPrChecksWatcher, stopApi);
  expect(getTaskExtraPrs('task-1')).toEqual([]);
});
