import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setStore, store } from '../store/core';
import { openKanban } from '../store/kanban';
import { setTaskProjectFilter } from '../store/navigation';
import { TaskBoardControls } from './TaskBoardControls';

let dispose: (() => void) | undefined;

function mount(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <TaskBoardControls />, host);
  return host;
}

function planToggle(host: HTMLElement): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>('[aria-label="Board page"] button');
  if (!found) throw new Error('missing plan toggle');
  return found;
}

beforeEach(() => {
  setStore({
    projects: [{ id: 'p1', name: 'weather-app', color: '#abc', path: '/w' }],
    taskProjectFilter: null,
    kanbanProjectId: null,
    githubIssuesProjectId: null,
    boardView: true,
    sidebarVisible: true,
    taskOrder: [],
    activeTaskId: null,
  });
});

afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

describe('TaskBoardControls', () => {
  it("toggles between the running tasks and the selected project's plan", () => {
    const host = mount();
    expect(planToggle(host).disabled).toBe(true);

    setTaskProjectFilter('p1');
    expect(planToggle(host).disabled).toBe(false);
    planToggle(host).click();
    expect(store.kanbanProjectId).toBe('p1');
    expect(planToggle(host).getAttribute('aria-pressed')).toBe('true');

    planToggle(host).click();
    expect(store.kanbanProjectId).toBeNull();
    expect(store.boardView).toBe(true);
    expect(store.taskProjectFilter).toBe('p1');
  });

  it('shows the project filter only while the sidebar, which has its own, is hidden', () => {
    const host = mount();
    expect(host.querySelector('.task-project-filter')).toBeNull();
    setStore('sidebarVisible', false);
    expect(host.querySelector('.task-project-filter')).not.toBeNull();
  });

  it('keeps a plan on the selected project, and shows the running tasks for all projects', () => {
    setStore('projects', 1, { id: 'p2', name: 'api', color: '#def', path: '/a' });
    openKanban('p1');
    expect(store.taskProjectFilter).toBe('p1');
    setTaskProjectFilter('p2');
    expect(store.kanbanProjectId).toBe('p2');

    setTaskProjectFilter(null);
    expect(store.kanbanProjectId).toBeNull();
    expect(store.boardView).toBe(true);
  });
});
