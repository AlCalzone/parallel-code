import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setStore, store } from '../store/core';
import { TaskBoardControls } from './TaskBoardControls';

let dispose: (() => void) | undefined;

function mount(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <TaskBoardControls />, host);
  return host;
}

function button(host: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name,
  );
}

beforeEach(() => {
  setStore({
    projects: [{ id: 'p1', name: 'weather-app', color: '#abc', path: '/w' }],
    taskProjectFilter: null,
    kanbanProjectId: null,
    githubIssuesProjectId: null,
    boardView: true,
    taskOrder: [],
    activeTaskId: null,
  });
});

afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

describe('TaskBoardControls', () => {
  it('names the project the running tasks are filtered to, and clears it', () => {
    setStore('taskProjectFilter', 'p1');
    const host = mount();
    expect(host.textContent).toContain('weather-app');
    button(host, 'Show all projects')?.click();
    expect(store.taskProjectFilter).toBeNull();
    expect(host.textContent).not.toContain('weather-app');
  });

  it("opens the filtered project's plan", () => {
    setStore('taskProjectFilter', 'p1');
    const host = mount();
    button(host, 'Plan')?.click();
    expect(store.kanbanProjectId).toBe('p1');
  });

  it('shows neither while all projects show', () => {
    const host = mount();
    expect(button(host, 'Plan')).toBeUndefined();
    expect(button(host, 'Show all projects')).toBeUndefined();
  });

  it("goes from a plan to its project's running tasks", () => {
    setStore('kanbanProjectId', 'p1');
    const host = mount();
    expect(button(host, 'Plan')).toBeUndefined();
    button(host, 'Running tasks')?.click();
    expect(store.kanbanProjectId).toBeNull();
    expect(store.taskProjectFilter).toBe('p1');
  });
});
