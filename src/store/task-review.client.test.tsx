import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStartRequest } = vi.hoisted(() => ({ mockStartRequest: vi.fn() }));

vi.mock('../lib/evidence-model-request', () => ({ startEvidenceModelRequest: mockStartRequest }));
vi.mock('../lib/load-task-diff', () => ({
  loadTaskDiff: () => Promise.resolve({ rawDiff: '+change', cwd: '/wt' }),
  getTaskDiffBaseBranch: (_mode: string, base?: string) => base,
}));
vi.mock('./notification', () => ({ showNotification: vi.fn() }));
vi.mock('./tasks', () => ({ sendPrompt: vi.fn() }));
vi.mock('./projects', () => ({ getProjectPath: () => '/repo' }));

import { store, setStore } from './core';
import type { Task } from './types';
import { startTaskReview } from './task-review';

beforeEach(() => {
  setStore('tasks', {
    t1: {
      id: 't1',
      name: 'Fix login',
      projectId: 'p1',
      branchName: 'task/fix',
      worktreePath: '/wt',
      gitIsolation: 'worktree',
      agentIds: ['agent-1'],
      lastPrompt: 'Fix the redirect',
    } as unknown as Task,
  });
});

describe('startTaskReview', () => {
  it('stops the model call as soon as the task closes', async () => {
    let reject: (error: Error) => void = () => {};
    const cancel = vi.fn(() => reject(new Error('cancelled')));
    mockStartRequest.mockReturnValue({
      result: new Promise<string>((_, rej) => (reject = rej)),
      cancel,
    });
    const run = startTaskReview('t1');
    await vi.waitFor(() => expect(mockStartRequest).toHaveBeenCalled());
    setStore('tasks', 't1', 'closingStatus', 'closing');
    await run;
    expect(cancel).toHaveBeenCalled();
    expect(store.tasks.t1.reviewStatus).toBeUndefined();
  });
});
