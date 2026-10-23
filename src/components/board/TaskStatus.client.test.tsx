import { render } from 'solid-js/web';
import { afterEach, expect, it, vi } from 'vitest';
import { removePrChecks, setPrChecks, type PrChecksState } from '../../store/pr-checks-state';
import { TaskPr } from './TaskStatus';

vi.mock('../../lib/ipc', () => ({ invoke: vi.fn(async () => ({})) }));

// A fresh object each time: the store merges later writes into the one it was given.
const green = (): PrChecksState => ({
  overall: 'success',
  merged: false,
  isDraft: false,
  reviewDecision: null,
  mergeable: 'MERGEABLE',
  passing: 2,
  pending: 0,
  failing: 0,
  checks: [],
  checkedAt: '2026-01-01T00:00:00Z',
});

let dispose: () => void = () => undefined;
afterEach(() => {
  dispose();
  removePrChecks('t');
  document.body.innerHTML = '';
});

const status = () => document.querySelector('.task-board-pr-status');

it('shows a green, mergeable PR as ready to merge, then as merged', () => {
  setPrChecks('t', green());
  dispose = render(() => <TaskPr taskId="t" url="https://github.com/o/r/pull/7" />, document.body);
  expect(document.body.textContent).toContain('PR #7');
  expect(status()?.textContent).toBe('Ready to merge');
  expect(document.querySelector('.task-board-pr.ready')).not.toBeNull();

  setPrChecks('t', { ...green(), overall: 'none', merged: true });
  expect(status()?.textContent).toBe('Merged');
  expect(document.querySelector('.task-board-pr.merged')).not.toBeNull();
  expect(document.querySelector('.task-board-pr.ready')).toBeNull();
});

it('marks failed CI on the PR chip as well', () => {
  setPrChecks('t', { ...green(), overall: 'failure', failing: 1 });
  dispose = render(() => <TaskPr taskId="t" url="https://github.com/o/r/pull/7" />, document.body);
  expect(status()?.textContent).toBe('CI failed');
  expect(document.querySelector('.task-board-chip.failure')).not.toBeNull();
});
