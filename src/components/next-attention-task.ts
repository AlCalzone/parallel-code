import { store } from '../store/core';
import { boardShown } from '../store/project-pages';
import type { Task } from '../store/types';
import { openTask } from './KanbanCard';
import { openBeside } from './TaskBoardCard';
import { boardLanes, boardTasks } from './task-board-lanes';

/**
 * Tasks waiting on you, in board order: Needs you, then Stopped. Tasks being
 * closed sit in Stopped but are already on their way out.
 */
export function attentionQueue(): Task[] {
  const lanes = boardLanes(boardTasks(''));
  return ['needs', 'stopped']
    .flatMap((id) => lanes.find((lane) => lane.id === id)?.tasks ?? [])
    .filter((task) => task.closingStatus !== 'closing' && task.closingStatus !== 'removing');
}

/**
 * The task after the current one, wrapping around; the first when the current
 * one is not waiting. An answered task leaves the queue, so the next press
 * starts again from the most urgent.
 */
export function nextInQueue(queue: Task[], currentId: string | null): Task | undefined {
  const at = queue.findIndex((task) => task.id === currentId);
  const next = queue[(at + 1) % queue.length];
  return next?.id === currentId ? undefined : next;
}

/** Opens the next waiting task, beside the board while it is shown, on the panel that asks. */
export function openNextAttentionTask(): void {
  const task = nextInQueue(attentionQueue(), store.activeTaskId);
  if (!task) return;
  if (boardShown()) openBeside(task);
  else openTask(task);
}
