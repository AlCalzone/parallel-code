import { beforeEach, expect, it } from 'vitest';
import { setStore } from './core';
import { isSoloTaskColumn, isTaskColumnHighlighted } from './focused-panel';

beforeEach(() => {
  setStore({
    activeTaskId: 'task-1',
    newTaskPanelFocused: false,
    focusMode: false,
    showNewTaskPanel: false,
    boardView: false,
    boardPeek: false,
  });
});

it('highlights only the active task column', () => {
  expect(isTaskColumnHighlighted('task-1')).toBe(true);
  expect(isTaskColumnHighlighted('task-2')).toBe(false);
});

it('dims the active task column while the new-task draft holds focus', () => {
  setStore('newTaskPanelFocused', true);
  expect(isTaskColumnHighlighted('task-1')).toBe(false);
});

it('highlights nothing for a column without a task id', () => {
  setStore('activeTaskId', null);
  expect(isTaskColumnHighlighted(null)).toBe(false);
});

it('treats focus mode and the board side panel as a single column', () => {
  expect(isSoloTaskColumn()).toBe(false);
  setStore('focusMode', true);
  expect(isSoloTaskColumn()).toBe(true);
  setStore({ focusMode: false, boardView: true, boardPeek: true });
  expect(isSoloTaskColumn()).toBe(true);
});

it('keeps focus mode a single column while the draft shows', () => {
  setStore({ focusMode: true, showNewTaskPanel: true });
  expect(isSoloTaskColumn()).toBe(true);
});
