import { Show } from 'solid-js';
import { render } from 'solid-js/web';
import { reconcile } from 'solid-js/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store, setStore } from '../store/core';
import { boardSidePanelOpen } from '../store/project-pages';
import {
  getTaskFocusedPanel,
  navigateColumn,
  registerFocusFn,
  setTaskFocusedPanel,
  unregisterFocusFn,
} from '../store/store';
import { navigateBoard, navigateBoardTask } from './task-board-keys';
import type { Task } from '../store/types';
import { BoardSidePanelBar } from './BoardSidePanel';
import { FocusModeTaskIndicators } from './FocusModeTaskIndicators';
import { TaskBoard } from './TaskBoard';
import { WORKING_HOLD_MS } from './task-board-hold';
import { WorkspaceControls } from './WorkspaceControls';

vi.mock('../lib/ipc', () => ({ invoke: vi.fn(async () => ({})) }));
vi.mock('../store/tasks', () => ({ uncollapseTask: vi.fn() }));
const snoozed = vi.hoisted(() => new Set<string>());
vi.mock('../store/background-tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../store/background-tasks')>()),
  isTaskBackgrounded: (id: string) => snoozed.has(id),
}));

// Lets a test force a task's attention state; agent activity is otherwise
// too far removed from the board to drive.
const attention = vi.hoisted(() => ({
  force: (_states: Record<string, string>): void => undefined,
}));
vi.mock('../store/taskStatus', async (importOriginal) => {
  const original = await importOriginal<typeof import('../store/taskStatus')>();
  const { createSignal } = await import('solid-js');
  const [forced, setForced] = createSignal<Record<string, string>>({});
  attention.force = setForced;
  return {
    ...original,
    getTaskAttentionState: (id: string) =>
      (forced()[id] as ReturnType<typeof original.getTaskAttentionState> | undefined) ??
      original.getTaskAttentionState(id),
  };
});

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
  setStore('taskGitStatus', reconcile({}));
  setStore('focusedPanel', reconcile({}));
  setStore('projects', [{ id: 'web', name: 'Website', path: '/repo', color: '#0af' }]);
  setStore('taskOrder', ['review', 'pr', 'idle']);
  setStore('collapsedTaskOrder', []);
  setStore('taskProjectFilter', null);
  setStore('activeTaskId', 'idle');
  setStore('focusMode', false);
  setStore('boardView', true);
  setStore('boardPeek', false);
  setStore('showNewTaskPanel', false);
  setStore('boardSidePanelLeft', false);
  host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <TaskBoard />, host);
});
afterEach(() => {
  dispose();
  document.body.replaceChildren();
  attention.force({});
  vi.useRealTimers();
});

it('sorts tasks into lanes by what they need', () => {
  expect(cardNames('Needs you')).toEqual(['Fix login redirect']);
  expect(cardNames('In pull request')).toEqual(['Add dark mode']);
  expect(cardNames('Stopped')).toEqual(['Update docs']);
  expect(lane('In pull request')?.textContent).toContain('PR #42');
});

it('puts the lanes that need attention next to each other', () => {
  const titles = [...host.querySelectorAll('.task-board-lane h3')].map((h) =>
    h.textContent?.replace(/\d+$/, ''),
  );
  expect(titles).toEqual(['Needs you', 'Stopped', 'Working', 'In pull request']);
});

it('keeps a card in Working through a short pause in work', () => {
  vi.useFakeTimers();
  attention.force({ idle: 'active' });
  expect(cardNames('Working')).toEqual(['Update docs']);
  attention.force({});
  expect(cardNames('Working')).toEqual(['Update docs']);
  expect(lane('Working')?.querySelector('.task-board-card')?.classList).toContain('state-active');
  vi.advanceTimersByTime(WORKING_HOLD_MS);
  expect(cardNames('Stopped')).toEqual(['Update docs']);
});

it('does not hold work that stopped while the board was closed', () => {
  vi.useFakeTimers();
  attention.force({ idle: 'active' });
  expect(cardNames('Working')).toEqual(['Update docs']);
  dispose();
  attention.force({});
  dispose = render(() => <TaskBoard />, host);
  expect(cardNames('Stopped')).toEqual(['Update docs']);
});

it('marks each card with the status glyph the title-bar pills use', () => {
  const glyph = lane('Needs you')?.querySelector<HTMLElement>('.task-board-title .status-glyph');
  expect(glyph?.title).toContain('Ready for review');
  // The glyph stays out of the card's accessible name.
  expect(host.querySelector('.task-board-title')?.getAttribute('title')).toBe('Fix login redirect');
  expect(glyph?.closest('[aria-hidden="true"]')).not.toBeNull();
});

it('hides the title-bar task pills while the board shows', () => {
  const bar = document.createElement('div');
  document.body.append(bar);
  const disposeBar = render(() => <FocusModeTaskIndicators />, bar);
  expect(bar.querySelector('.focus-mode-task-indicator')).toBeNull();

  setStore('boardView', false);
  expect(bar.querySelectorAll('.focus-mode-task-indicator')).toHaveLength(3);
  disposeBar();
});

it('lists finished work above idle tasks in the stopped lane', () => {
  setStore('tasks', 'done', task('done', 'Add search'));
  setStore('taskGitStatus', 'done', {
    has_committed_changes: true,
    has_uncommitted_changes: false,
    current_branch: 'done',
    base_branch: 'main',
    refreshedAt: Date.now(),
  });
  setStore('taskOrder', ['review', 'pr', 'idle', 'done']);
  expect(cardNames('Stopped')).toEqual(['Add search', 'Update docs']);
  expect(lane('Stopped')?.querySelector('.task-board-card')?.classList).toContain('state-ready');
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
  const line = host.querySelector('.lane-stopped .task-board-activity');
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

  host.querySelector<HTMLButtonElement>('.lane-stopped .task-board-title')?.click();
  expect(store.activeTaskId).toBe('idle');
  expect(store.boardView).toBe(true);
});

it('folds minimized and snoozed tasks into one lane unless they need you', () => {
  // Before the store changes: the mocked snooze set is not reactive.
  snoozed.add('pr');
  setStore('tasks', 'idle', 'collapsed', true);
  setStore('tasks', 'pr', 'collapsed', true);
  setStore('tasks', 'review', 'collapsed', true);
  setStore('taskOrder', []);
  setStore('collapsedTaskOrder', ['review', 'pr', 'idle']);
  try {
    const rail = host.querySelector<HTMLButtonElement>('.task-board-rail');
    expect(rail?.textContent).toBe('Snoozed & minimized2');
    rail?.click();
    const lane = [...host.querySelectorAll<HTMLElement>('.lane-snoozed [data-board-task-id]')];
    expect(lane.map((el) => el.dataset.boardTaskId)).toEqual(['pr', 'idle']);
    expect(lane[1]?.textContent).toContain('Minimized');
    expect(cardNames('Needs you')).toEqual(['Fix login redirect']);
  } finally {
    snoozed.clear();
  }
});

it('closes the side panel from its bar and keeps the board', () => {
  host.querySelector<HTMLButtonElement>('.lane-pr .task-board-title')?.click();
  const bar = document.createElement('div');
  document.body.append(bar);
  const disposeBar = render(() => <BoardSidePanelBar />, bar);
  bar.querySelector<HTMLButtonElement>('[title^="Close side panel"]')?.click();
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

describe('keyboard', () => {
  const card = (id: string) =>
    host.querySelector<HTMLButtonElement>(`[data-board-task-id="${id}"] .task-board-title`);
  const focusedId = () =>
    document.activeElement?.closest<HTMLElement>('[data-board-task-id]')?.dataset.boardTaskId;
  const press = (key: string, target: Element | null = document.activeElement) =>
    target?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  beforeEach(() => {
    snoozed.clear();
    setStore('sidebarVisible', true);
    setStore('sidebarFocused', false);
    setStore('newTaskPanelFocused', false);
  });

  it('puts the keyboard on the active task card when the board opens', () => {
    expect(focusedId()).toBe('idle');
  });

  it('moves between cards and lanes with arrows and hjkl', () => {
    setStore('tasks', 'idle2', task('idle2', 'Tidy styles'));
    setStore('taskOrder', ['review', 'idle', 'idle2', 'pr']);
    press('ArrowDown');
    expect(focusedId()).toBe('idle2');
    press('h');
    expect(focusedId()).toBe('review');
    press('ArrowLeft');
    expect(focusedId()).toBe('review');
    press('l');
    press('l');
    expect(focusedId()).toBe('pr');
    press('h');
    press('End');
    expect(focusedId()).toBe('idle2');
    press('Home');
    expect(focusedId()).toBe('idle');
  });

  it('goes from the filter to the cards and opens the first match', () => {
    press('/');
    const search = host.querySelector<HTMLInputElement>('.task-board-search');
    expect(document.activeElement).toBe(search);
    press('ArrowDown');
    expect(focusedId()).toBe('review');
    search?.focus();
    press('ArrowUp', card('review'));
    expect(document.activeElement).toBe(search);
    search?.focus();
    press('Escape');
    expect(focusedId()).toBe('idle');
    search?.focus();
    press('Enter');
    expect(store.activeTaskId).toBe('review');
    expect(boardSidePanelOpen()).toBe(true);
  });

  it('leaves the board with Alt+Arrows: left to the sidebar, right into the side panel', () => {
    card('review')?.focus();
    expect(navigateBoard('left')).toBe(true);
    expect(store.sidebarFocused).toBe(true);

    navigateColumn('right');
    expect(store.sidebarFocused).toBe(false);
    expect(focusedId()).toBe('idle');

    setStore('boardPeek', true);
    expect(navigateBoard('right')).toBe(true);
    expect(focusedId()).toBe('pr');
    const panel = vi.fn();
    registerFocusFn('idle:ai-terminal', panel);
    expect(navigateBoard('right')).toBe(true);
    return Promise.resolve().then(() => {
      expect(panel).toHaveBeenCalled();
      unregisterFocusFn('idle:ai-terminal', panel);
    });
  });

  it("moves through the side panel task's panes, then on to the cards past their edge", () => {
    setStore('tasks', 'idle2', task('idle2', 'Tidy styles'));
    setStore('taskOrder', ['review', 'idle', 'idle2', 'pr']);
    setStore('boardPeek', true);
    setStore('activeTaskId', 'idle2');
    setTaskFocusedPanel('idle2', 'notes');
    (document.activeElement as HTMLElement | null)?.blur();
    // Focus is deferred, so only the last task's pane is focused.
    const panel = vi.fn();
    registerFocusFn('review:title', panel);
    // Lanes: Needs you [review], Stopped [idle, idle2], In pull request [pr].
    expect(navigateBoard('right')).toBe(true);
    expect(getTaskFocusedPanel('idle2')).toBe('changed-files');
    expect(navigateBoard('up')).toBe(true);
    expect(store.activeTaskId).toBe('idle2');
    expect(getTaskFocusedPanel('idle2')).toBe('title');
    // Past the top pane: the card above, on the same pane.
    expect(navigateBoard('up')).toBe(true);
    expect(store.activeTaskId).toBe('idle');
    expect(getTaskFocusedPanel('idle')).toBe('title');
    expect(navigateBoard('left')).toBe(true);
    expect(store.activeTaskId).toBe('review');
    expect(boardSidePanelOpen()).toBe(true);
    expect(focusedId()).toBeUndefined();
    return Promise.resolve().then(() => {
      expect(panel).toHaveBeenCalled();
      unregisterFocusFn('review:title', panel);
    });
  });

  it("hands the keyboard to the card at the side panel's edge facing the board", () => {
    setStore('boardPeek', true);
    setStore('activeTaskId', 'review');
    (document.activeElement as HTMLElement | null)?.blur();
    expect(navigateBoard('left')).toBe(true);
    expect(focusedId()).toBe('review');

    // On the board's left, the panel's edge facing it is the right one.
    setStore('boardSidePanelLeft', true);
    setStore('activeTaskId', 'pr');
    (document.activeElement as HTMLElement | null)?.blur();
    expect(navigateBoard('right')).toBe(true);
    expect(focusedId()).toBe('pr');
    // And the board's first lane leads into that panel.
    card('review')?.focus();
    const panel = vi.fn();
    registerFocusFn('pr:ai-terminal', panel);
    expect(navigateBoard('left')).toBe(true);
    return Promise.resolve().then(() => {
      expect(panel).toHaveBeenCalled();
      unregisterFocusFn('pr:ai-terminal', panel);
    });
  });

  it('steps through tasks in board order, on the board and in the side panel', () => {
    card('review')?.focus();
    navigateBoardTask('right');
    expect(focusedId()).toBe('idle');

    setStore('boardPeek', true);
    setStore('activeTaskId', 'idle');
    (document.activeElement as HTMLElement | null)?.blur();
    navigateBoardTask('right');
    expect(store.activeTaskId).toBe('pr');
    expect(store.boardView).toBe(true);
  });

  it("jumps a whole card up or down, on the board and past the side panel's panes", () => {
    setStore('tasks', 'idle2', task('idle2', 'Tidy styles'));
    setStore('taskOrder', ['review', 'idle', 'idle2', 'pr']);
    card('idle')?.focus();
    navigateBoardTask('down');
    expect(focusedId()).toBe('idle2');

    setStore('boardPeek', true);
    setStore('activeTaskId', 'idle2');
    setTaskFocusedPanel('idle2', 'changed-files');
    (document.activeElement as HTMLElement | null)?.blur();
    navigateBoardTask('up');
    expect(store.activeTaskId).toBe('idle');
    expect(getTaskFocusedPanel('idle')).toBe('changed-files');
    // At the lane's top there is nowhere to go, not even a pane up.
    navigateBoardTask('up');
    expect(store.activeTaskId).toBe('idle');
    expect(getTaskFocusedPanel('idle')).toBe('changed-files');
  });

  it('hands the keyboard to the active task when the board closes', async () => {
    dispose();
    dispose = render(
      () => (
        <Show when={store.boardView}>
          <TaskBoard />
        </Show>
      ),
      host,
    );
    const panel = vi.fn();
    registerFocusFn('idle:ai-terminal', panel);
    setStore('boardView', false);
    await Promise.resolve();
    await Promise.resolve();
    expect(panel).toHaveBeenCalled();
    unregisterFocusFn('idle:ai-terminal', panel);
  });
});

describe('keyboard edge cases', () => {
  const focusedId = () =>
    document.activeElement?.closest<HTMLElement>('[data-board-task-id]')?.dataset.boardTaskId;
  const press = (key: string, target: Element | null = document.activeElement) =>
    target?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const search = () => host.querySelector<HTMLInputElement>('.task-board-search');

  beforeEach(() => {
    snoozed.clear();
    setStore('sidebarVisible', true);
    setStore('sidebarFocused', false);
    setStore('newTaskPanelFocused', false);
  });

  it('clears the filter before a second Escape returns to the cards', () => {
    const input = search();
    if (!input) throw new Error('missing search');
    input.focus();
    input.value = 'dark';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    press('Escape');
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    press('Escape');
    expect(focusedId()).toBe('idle');
  });

  it('lets the board take the keyboard from the sidebar, clearing its flag', () => {
    // The sidebar, not the board, has DOM focus.
    (document.activeElement as HTMLElement | null)?.blur();
    setStore('sidebarFocused', true);
    expect(navigateBoardTask('right')).toBe(true);
    expect(store.activeTaskId).toBe('idle');
    expect(store.boardView).toBe(true);
    expect(store.sidebarFocused).toBe(false);
    expect(focusedId()).toBe('idle');
  });

  it('sends an empty board to its filter and back out to the sidebar', () => {
    const input = search();
    if (!input) throw new Error('missing search');
    input.value = 'zzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setStore('sidebarFocused', true);
    navigateColumn('right');
    expect(document.activeElement).toBe(input);
    expect(store.sidebarFocused).toBe(false);
    expect(navigateBoard('left')).toBe(true);
    expect(store.sidebarFocused).toBe(true);
  });

  it('skips snoozed tasks when switching the side panel', () => {
    snoozed.add('pr');
    // The mocked snooze set is not reactive; a new order recomputes the lanes.
    setStore('taskOrder', ['review', 'pr', 'idle']);
    host.querySelector<HTMLButtonElement>('.task-board-rail')?.click();
    expect(focusedId()).toBe('pr');
    setStore('boardPeek', true);
    // Board order is review, idle, then the snoozed lane's pr.
    setStore('activeTaskId', 'idle');
    (document.activeElement as HTMLElement | null)?.blur();
    navigateBoardTask('right');
    expect(store.activeTaskId).toBe('idle');
  });

  it('leaves a draft beside the board its focus when the board mounts', () => {
    dispose();
    setStore('showNewTaskPanel', true);
    const draft = document.createElement('textarea');
    document.body.append(draft);
    draft.focus();
    dispose = render(() => <TaskBoard />, host);
    expect(document.activeElement).toBe(draft);
  });
});
