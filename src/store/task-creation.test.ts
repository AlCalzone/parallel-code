import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setStore, store } from './core';
import { createTaskInBackground, restoreFailedDraft } from './task-creation';

const draft = { prefill: { prompt: 'Do it', projectId: 'project' }, dropUrl: null };

beforeEach(() => {
  vi.useFakeTimers();
  setStore({ notification: null, newTaskPrefillPrompt: null, newTaskDropUrl: null });
});

afterEach(() => {
  vi.useRealTimers();
});

it('stops counting a creation as quick and announces it once a slow one is ready', async () => {
  let finish!: (taskId: string) => void;
  let quick!: () => boolean;
  const done = createTaskInBackground({
    name: 'Slow',
    create: (isQuick) => {
      quick = isQuick;
      return new Promise((resolve) => (finish = resolve));
    },
    onCreated: vi.fn(),
    draft,
  });
  expect(quick()).toBe(true);
  await vi.advanceTimersByTimeAsync(500);
  expect(quick()).toBe(false);
  expect(store.notification).toBe('Creating "Slow"…');
  finish('slow');
  await done;
  expect(store.notification).toBe('"Slow" is ready');
});

it('creates a quick task without any notice', async () => {
  await createTaskInBackground({
    name: 'Quick',
    create: async () => 'quick',
    onCreated: vi.fn(),
    draft,
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(store.notification).toBeNull();
});

it('reports a failing follow-up without rejecting or keeping the draft for a retry', async () => {
  await expect(
    createTaskInBackground({
      name: 'Made',
      create: async () => 'made',
      onCreated: () => {
        throw new Error('Link failed');
      },
      draft,
    }),
  ).resolves.toBeUndefined();
  expect(store.notification).toContain('Link failed');
  restoreFailedDraft();
  expect(store.newTaskPrefillPrompt).toBeNull();
});

it('does not offer an empty failed draft again', async () => {
  await createTaskInBackground({
    name: 'Task 3',
    create: () => Promise.reject(new Error('No worktree')),
    onCreated: vi.fn(),
    draft: { prefill: { prompt: ' ', name: '', projectId: 'project' }, dropUrl: null },
  });
  expect(store.notification).toContain('No worktree');
  expect(store.notification).not.toContain('open New Task');
  restoreFailedDraft();
  expect(store.newTaskPrefillPrompt).toBeNull();
});

it('leads a kept draft failure with the retry hint, without the IPC prefix', async () => {
  await createTaskInBackground({
    name: 'Task 4',
    create: () =>
      Promise.reject(
        new Error("Error invoking remote method 'create_task': Error: git worktree add failed"),
      ),
    onCreated: vi.fn(),
    draft: { prefill: { prompt: 'Fix it', projectId: 'project' }, dropUrl: null },
  });
  expect(store.notification).toBe(
    'Could not create "Task 4" (open New Task to retry): git worktree add failed',
  );
  restoreFailedDraft();
});
