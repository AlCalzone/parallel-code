import { reconcile } from 'solid-js/store';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setStore, store } from './core';
import { getPullRequestDetails, loadFailedChecksPrompt } from './github';
import { showNotification } from './notification';
import { startPrBabysit, startPrBabysitWatcher } from './pr-babysit';
import { removePrChecks, setPrChecks, type PrChecksState } from './pr-checks-state';
import { sendPrompt } from './tasks';
import type { PullRequestDetails } from '../ipc/types';
import type { Agent, Task } from './types';

vi.mock('../lib/ipc', () => ({ invoke: vi.fn(), fireAndForget: vi.fn() }));
vi.mock('./persistence', () => ({ saveState: vi.fn(() => Promise.resolve()) }));
vi.mock('./notification', () => ({ showNotification: vi.fn() }));
vi.mock('./tasks', () => ({ sendPrompt: vi.fn(() => Promise.resolve()) }));
vi.mock('./taskStatus', () => ({ isAgentIdle: () => true, isAgentAskingQuestion: () => false }));
vi.mock('./github', () => ({
  getPullRequestDetails: vi.fn(),
  loadFailedChecksPrompt: vi.fn(() => Promise.resolve('fix CI')),
}));

const prUrl = 'https://github.com/acme/app/pull/12';
let stop: (() => void) | undefined;

function failing(headSha: string): PrChecksState {
  return {
    overall: 'failure',
    headSha,
    passing: 1,
    pending: 0,
    failing: 1,
    checks: [{ name: 'test', bucket: 'fail' }],
    checkedAt: '2026-10-23T00:00:00Z',
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Task',
    projectId: 'project-1',
    branchName: 'task/task-1',
    worktreePath: '/repo/.worktrees/task-1',
    agentIds: ['agent-1'],
    shellAgentIds: [],
    notes: '',
    lastPrompt: '',
    gitIsolation: 'worktree',
    prUrl,
    prBabysit: { attempts: 0 },
    ...overrides,
  };
}

async function tick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(5_000);
}

beforeEach(() => {
  vi.useFakeTimers();
  setStore('tasks', reconcile({ 'task-1': task() }));
  setStore(
    'agents',
    reconcile({ 'agent-1': { id: 'agent-1', taskId: 'task-1', status: 'running' } as Agent }),
  );
});

afterEach(() => {
  stop?.();
  stop = undefined;
  removePrChecks('task-1');
  setStore('tasks', reconcile({}));
  setStore('agents', reconcile({}));
  vi.clearAllMocks();
  vi.useRealTimers();
});

it('sends each failing commit to the agent once', async () => {
  setPrChecks('task-1', failing('a'));
  stop = startPrBabysitWatcher();
  await tick();
  await tick();
  expect(sendPrompt).toHaveBeenCalledTimes(1);
  expect(sendPrompt).toHaveBeenCalledWith('task-1', 'agent-1', 'fix CI', { appPrompt: true });

  setPrChecks('task-1', failing('b'));
  await tick();
  expect(sendPrompt).toHaveBeenCalledTimes(2);
  expect(store.tasks['task-1']?.prBabysit).toEqual({ attempts: 2, lastSentSha: 'b' });
});

it('holds the failures while the user has an unsent draft', async () => {
  setStore('tasks', 'task-1', 'promptDraft', 'half-typed');
  setPrChecks('task-1', failing('a'));
  stop = startPrBabysitWatcher();
  await tick();
  expect(sendPrompt).not.toHaveBeenCalled();

  setStore('tasks', 'task-1', 'promptDraft', undefined);
  await tick();
  expect(sendPrompt).toHaveBeenCalledTimes(1);
});

it('stops and tells the user after the last attempt fails', async () => {
  setStore('tasks', 'task-1', 'prBabysit', { attempts: 3, lastSentSha: 'c' });
  setPrChecks('task-1', failing('d'));
  stop = startPrBabysitWatcher();
  await tick();
  expect(sendPrompt).not.toHaveBeenCalled();
  expect(store.tasks['task-1']?.prBabysit).toBeUndefined();
  expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('3 fix attempts'));
});

it('stops when collecting the failures fails instead of retrying', async () => {
  vi.mocked(loadFailedChecksPrompt).mockRejectedValueOnce(new Error('gh offline'));
  setPrChecks('task-1', failing('a'));
  stop = startPrBabysitWatcher();
  await tick();
  expect(store.tasks['task-1']?.prBabysit).toBeUndefined();
  expect(showNotification).toHaveBeenCalledWith('Babysit stopped: gh offline');
});

it('only turns on for pull requests the user opened', async () => {
  setStore('tasks', 'task-1', 'prBabysit', undefined);
  vi.mocked(getPullRequestDetails).mockResolvedValueOnce({
    authoredByViewer: false,
  } as PullRequestDetails);
  expect(await startPrBabysit('task-1')).toBe(false);
  expect(store.tasks['task-1']?.prBabysit).toBeUndefined();

  vi.mocked(getPullRequestDetails).mockResolvedValueOnce({
    authoredByViewer: true,
  } as PullRequestDetails);
  expect(await startPrBabysit('task-1')).toBe(true);
  expect(store.tasks['task-1']?.prBabysit).toEqual({ attempts: 0 });
});
