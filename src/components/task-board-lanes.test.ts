import { describe, expect, it } from 'vitest';
import type { Task } from '../store/types';
import { groupSubtasks } from './task-board-lanes';

const task = (id: string, coordinatedBy?: string) => ({ id, coordinatedBy }) as Task;
const ids = (tasks: Task[]) => tasks.map((t) => t.id);

describe('groupSubtasks', () => {
  it('puts subtasks right after their coordinator', () => {
    const tasks = [task('a1', 'p'), task('x'), task('p'), task('a2', 'p')];
    expect(ids(groupSubtasks(tasks))).toEqual(['p', 'a1', 'a2', 'x']);
  });

  it('keeps siblings together when their coordinator is in another lane', () => {
    const tasks = [task('a1', 'p'), task('x'), task('a2', 'p')];
    expect(ids(groupSubtasks(tasks))).toEqual(['a1', 'a2', 'x']);
  });

  it('leaves unrelated tasks in order', () => {
    const tasks = [task('x'), task('y'), task('z')];
    expect(ids(groupSubtasks(tasks))).toEqual(['x', 'y', 'z']);
  });
});
