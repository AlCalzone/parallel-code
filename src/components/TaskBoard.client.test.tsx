import { render } from 'solid-js/web';
import { reconcile } from 'solid-js/store';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { store, setStore } from '../store/core';
import { boardSidePanelOpen } from '../store/project-pages';
import type { Task } from '../store/types';
import { BoardSidePanelBar } from './BoardSidePanel';
import { TaskBoard } from './TaskBoard';
import { WorkspaceControls } from './WorkspaceControls';

vi.mock('../lib/ipc', () => ({ invoke: vi.fn(async () => ({})) }));
vi.mock('../store/tasks', () => ({ uncollapseTask: vi.fn() }));

function task(id: string, name: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    name,
    projectId: 'web',
    branchName: id,
    worktreePath: `/repo/${id}`,
    agentIds: [],
    shellAgentIds: [],
    notes: '',
    lastPrompt: '',
    gitIsolation: 'worktree',
    ...extra,
  };
}

let host: HTMLDivElement;
let dispose: () => void;
const lane = (title: string) =>
  [...host.querySelectorAll('.task-board-lane')].find((el) =>
    el.querySelector('h3')?.textContent?.startsWith(title),
  );
const cardNames = (title: string) =>
  [...(lane(title)?.querySelectorAll('.task-board-name') ?? [])].map((el) => el.textContent);

beforeEach(() => {
  setStore(
    'tasks',
    reconcile({
      review: task('review', 'Fix login redirect', { needsReview: true }),
      pr: task('pr', 'Add dark mode', { prUrl: 'https://github.com/o/r/pull/42' }),
      idle: task('idle', 'Update docs'),
    }),
  );
  setStore('agents', reconcile({}));
  setStore('projects', [{ id: 'web', name: 'Website', path: '/repo', color: '#0af' }]);
  setStore('taskOrder', ['review', 'pr', 'idle']);
  setStore('collapsedTaskOrder', []);
  setStore('taskProjectFilter', null);
  setStore('activeTaskId', 'idle');
  setStore('focusMode', false);
  setStore('boardView', true);
  setStore('boardPeek', false);
  setStore('showNewTaskPanel', false);
  host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <TaskBoard />, host);
});
afterEach(() => {
  dispose();
  document.body.replaceChildren();
});

it('sorts tasks into lanes by what they need', () => {
  expect(cardNames('Needs you')).toEqual(['Fix login redirect']);
  expect(cardNames('In pull request')).toEqual(['Add dark mode']);
  expect(cardNames('Idle')).toEqual(['Update docs']);
  expect(lane('In pull request')?.textContent).toContain('PR #42');
});

it('filters cards by name or project', () => {
  const search = host.querySelector<HTMLInputElement>('.task-board-search');
  if (!search) throw new Error('missing search');
  search.value = 'dark';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  expect([...host.querySelectorAll('.task-board-name')].map((el) => el.textContent)).toEqual([
    'Add dark mode',
  ]);
  search.value = 'website';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  expect(host.querySelectorAll('.task-board-name')).toHaveLength(3);
});

it('says why the board is empty', () => {
  const search = host.querySelector<HTMLInputElement>('.task-board-search');
  if (!search) throw new Error('missing search');
  search.value = 'zzz ';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  expect(host.querySelector('.task-board-empty')?.textContent).toBe('No tasks match “zzz”');
  setStore('taskOrder', []);
  search.value = '';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  expect(host.querySelector('.task-board-empty')?.textContent).toBe('No open tasks');
});

it('shows the branch when a card has no agent activity', () => {
  const line = host.querySelector('.lane-idle .task-board-activity');
  expect(line?.textContent).toBe('idle');
  expect(line?.classList.contains('branch')).toBe(true);
});

it('opens a clicked task beside the board and marks its card', () => {
  host.querySelector<HTMLButtonElement>('.lane-pr .task-board-title')?.click();
  expect(store.activeTaskId).toBe('pr');
  expect(boardSidePanelOpen()).toBe(true);
  expect(host.querySelector('.lane-pr .task-board-title')?.getAttribute('aria-current')).toBe(
    'true',
  );

  host.querySelector<HTMLButtonElement>('.lane-idle .task-board-title')?.click();
  expect(store.activeTaskId).toBe('idle');
  expect(store.boardView).toBe(true);
});

it('closes the side panel from its bar and keeps the board', () => {
  host.querySelector<HTMLButtonElement>('.lane-pr .task-board-title')?.click();
  const bar = document.createElement('div');
  document.body.append(bar);
  const disposeBar = render(() => <BoardSidePanelBar />, bar);
  bar.querySelector<HTMLButtonElement>('button')?.click();
  expect(boardSidePanelOpen()).toBe(false);
  expect(store.boardView).toBe(true);
  disposeBar();
});

it('starts a new task beside the board', () => {
  [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.textContent?.includes('New task'))
    ?.click();
  expect(store.showNewTaskPanel).toBe(true);
  expect(store.boardView).toBe(true);
  expect(boardSidePanelOpen()).toBe(true);
});

it('switches views from the title-bar toggle in focus, tiles, board order', () => {
  const controls = document.createElement('div');
  document.body.append(controls);
  const disposeControls = render(() => <WorkspaceControls />, controls);
  const buttons = [
    ...controls.querySelectorAll<HTMLButtonElement>('[aria-label="Workspace view"] button'),
  ];
  expect(buttons.map((b) => b.title.split(':')[0])).toEqual(['Focus', 'Tiles', 'Board']);
  expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);

  buttons[0]?.click();
  expect(store.boardView).toBe(false);
  expect(store.focusMode).toBe(true);

  buttons[1]?.click();
  expect(store.focusMode).toBe(false);
  expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  disposeControls();
});
