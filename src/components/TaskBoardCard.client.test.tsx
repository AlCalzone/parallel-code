import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reconcile } from 'solid-js/store';
import { render } from 'solid-js/web';
import { TaskBoardCard } from './TaskBoardCard';
import { store, setStore } from '../store/core';
import { bringTaskToFront, isTaskBackgrounded } from '../store/background-tasks';
import { invoke } from '../lib/ipc';
import type { Task } from '../store/types';

vi.mock('../lib/ipc', () => ({ invoke: vi.fn(), fireAndForget: vi.fn() }));

const task: Task = {
  id: 'one',
  name: 'one',
  projectId: 'project',
  branchName: 'one',
  worktreePath: '/tmp/one',
  agentIds: [],
  shellAgentIds: [],
  notes: '',
  lastPrompt: '',
  gitIsolation: 'worktree',
  baseBranch: 'main',
};

let container: HTMLDivElement;
let dispose: () => void;

beforeEach(() => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  bringTaskToFront('one');
  setStore('collapsedTaskOrder', []);
  setStore('tasks', reconcile({ one: { ...task } }));
  setStore('taskOrder', ['one']);
  container = document.createElement('div');
  document.body.append(container);
  dispose = render(() => <TaskBoardCard task={store.tasks.one} lane="working" />, container);
});

afterEach(() => {
  dispose();
  container.remove();
});

const rightClick = () =>
  container
    .querySelector('.task-board-card')
    ?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }));

const labels = () =>
  [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim());

const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (item) => item.textContent?.trim() === label,
  );

it('opens a context menu on right-click that snoozes the task', () => {
  rightClick();
  expect(document.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Task one');
  expect(labels()).toEqual([
    'Open',
    'Snooze until new activity',
    'Snooze · keep running',
    'Snooze · stop agents',
    'Minimize (stop agents)',
  ]);
  menuItem('Snooze until new activity')?.click();
  expect(isTaskBackgrounded('one')).toBe(true);
  expect(document.querySelector('[role="menu"]')).toBeNull();

  rightClick();
  menuItem('Restore to front')?.click();
  expect(isTaskBackgrounded('one')).toBe(false);
});

it('offers only restore for a minimized task', () => {
  setStore('tasks', 'one', { collapsed: true });
  setStore('collapsedTaskOrder', ['one']);
  rightClick();
  expect(labels()).toEqual(['Open', 'Restore (start agents)']);
  menuItem('Restore (start agents)')?.click();
  expect(store.tasks.one.collapsed).toBe(false);
});

it('offers no set-aside actions while the task closes', () => {
  setStore('tasks', 'one', { closingStatus: 'closing' });
  rightClick();
  expect(labels()).toEqual(['Open']);
});
