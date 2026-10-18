import { batch } from 'solid-js';
import { store, setStore } from './core';

/** Whether the all-tasks board shows the active task, or a new-task draft, beside it. */
export function boardSidePanelOpen(): boolean {
  return store.boardView && (store.boardPeek || store.showNewTaskPanel);
}

/** Opens the board's side panel; the task to show is whichever becomes active. */
export function openBoardSidePanel(): void {
  setStore('boardPeek', true);
}

export function closeBoardSidePanel(): void {
  setStore('boardPeek', false);
}

export function closeBoard(): void {
  batch(() => {
    setStore('boardView', false);
    setStore('boardPeek', false);
  });
}

/**
 * Closes whichever page (GitHub issues, a project's Kanban board or the
 * all-tasks board) covers the task area. Every path that shows a task or
 * another workspace calls this, so a new page type only has to be added here.
 * The all-tasks board stays while its side panel is open, or with `keepBoard`:
 * the task or draft then shows in that panel.
 */
export function closeProjectPages(opts: { keepBoard?: boolean } = {}): void {
  batch(() => {
    setStore('githubIssuesProjectId', null);
    setStore('kanbanProjectId', null);
    if (!opts.keepBoard && !boardSidePanelOpen()) closeBoard();
  });
}
