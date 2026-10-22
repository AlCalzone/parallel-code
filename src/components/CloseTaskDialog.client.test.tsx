import { render } from 'solid-js/web';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setStore } from '../store/core';
import { boardSidePanelOpen } from '../store/project-pages';
import { closeTask } from '../store/store';
import type { Task } from '../store/types';
import { CloseTaskDialog } from './CloseTaskDialog';

vi.mock('../lib/ipc', () => ({ invoke: vi.fn(async () => ({})) }));
vi.mock('../store/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../store/store')>()),
  armSpCompletion: vi.fn(),
  closeTask: vi.fn(),
}));

const task: Task = {
  id: 'shown',
  name: 'Shown task',
  projectId: 'web',
  branchName: 'shown',
  worktreePath: '/repo',
  agentIds: [],
  shellAgentIds: [],
  notes: '',
  lastPrompt: '',
  gitIsolation: 'direct',
};

let dispose: (() => void) | undefined;

function confirmClose(): void {
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <CloseTaskDialog open task={task} onDone={() => {}} />, host);
  [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.textContent?.trim() === 'Close')
    ?.click();
}

beforeEach(() => {
  setStore('tasks', 'shown', task);
  setStore({ boardView: true, boardPeek: true, showNewTaskPanel: false });
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  setStore({ boardView: false, boardPeek: false, activeTaskId: null });
  vi.mocked(closeTask).mockClear();
});

it('closes the board side panel at once when its task is closed', () => {
  setStore('activeTaskId', 'shown');
  confirmClose();
  expect(closeTask).toHaveBeenCalledWith('shown');
  expect(boardSidePanelOpen()).toBe(false);
});

it('leaves the side panel open when another task is closed', () => {
  setStore('activeTaskId', 'other');
  confirmClose();
  expect(closeTask).toHaveBeenCalledWith('shown');
  expect(boardSidePanelOpen()).toBe(true);
});
