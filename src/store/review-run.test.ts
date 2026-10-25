import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockBuild, mockReview } = vi.hoisted(() => ({
  mockBuild: vi.fn(() => Promise.resolve()),
  mockReview: vi.fn(() => Promise.resolve()),
}));

vi.mock('./evidence', () => ({ buildEvidence: mockBuild }));
vi.mock('./task-review', () => ({ startTaskReview: mockReview }));

import { setStore, store } from './core';
import type { Project, Task } from './types';
import { setReviewChecks, startReview } from './review-run';

function setup(reviewChecks: string[] | undefined, task: Partial<Task> = {}) {
  setStore('projects', [
    {
      id: 'p1',
      name: 'Weather',
      path: '/repo',
      color: '#fff',
      verifyCommand: 'npm run check',
      evidenceChecks: [{ id: 'e2e', name: 'E2E', kind: 'e2e', command: 'e2e', run: 'on-demand' }],
      reviewChecks,
    } as Project,
  ]);
  setStore('tasks', { t1: { id: 't1', projectId: 'p1', ...task } as Task });
}

beforeEach(() => vi.clearAllMocks());

describe('startReview', () => {
  it('runs the picked checks that still exist alongside the reviewer', () => {
    setup(['e2e', 'removed']);
    startReview('t1');
    expect(mockBuild).toHaveBeenCalledWith('t1', { trigger: 'manual', only: ['e2e'] });
    expect(mockReview).toHaveBeenCalledWith('t1');
  });

  it('runs the reviewer alone when nothing is picked', () => {
    setup([]);
    startReview('t1');
    expect(mockBuild).not.toHaveBeenCalled();
    expect(mockReview).toHaveBeenCalledWith('t1');
  });

  it('starts nothing while a review runs', () => {
    setup(['verify'], { reviewStatus: { state: 'running', startedAt: 1 } });
    startReview('t1');
    expect(mockBuild).not.toHaveBeenCalled();
    expect(mockReview).not.toHaveBeenCalled();
  });
});

describe('setReviewChecks', () => {
  it('saves the pick on the task project', () => {
    setup(undefined);
    setReviewChecks('t1', { ids: ['verify'] });
    expect(store.projects[0].reviewChecks).toEqual(['verify']);
    expect(store.projects[0].evidenceChecks).toHaveLength(1);
  });

  it('adds the suggested checks the user picked, keeping a verify command already set', () => {
    setup(undefined);
    const lint = {
      id: 'static-checks',
      name: 'Static checks',
      kind: 'static',
      command: 'npm run lint',
      run: 'auto',
    } as const;
    setReviewChecks('t1', {
      ids: ['static-checks'],
      newChecks: [lint],
      verifyCommand: 'make check',
    });
    expect(store.projects[0].evidenceChecks?.map((check) => check.id)).toEqual([
      'e2e',
      'static-checks',
    ]);
    expect(store.projects[0].verifyCommand).toBe('npm run check');
    setStore('projects', 0, 'verifyCommand', undefined);
    setReviewChecks('t1', { ids: ['verify'], verifyCommand: 'make check' });
    expect(store.projects[0].verifyCommand).toBe('make check');
  });
});
