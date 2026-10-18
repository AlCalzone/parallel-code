import { isHiddenAgentTaskId } from '../documents/task-id';
import { store } from '../store/core';
import { isTaskBackgrounded } from '../store/background-tasks';
import { getProject } from '../store/projects';
import { matchesTaskProjectFilter } from '../store/task-project-filter';
import { getTaskOpenQuestion } from '../store/taskStatus';
import type { Task } from '../store/types';
import { cardTaskState } from './KanbanCard';

export type BoardLaneId = 'needs' | 'working' | 'ready' | 'pr' | 'idle' | 'snoozed';

export interface BoardLane {
  id: BoardLaneId;
  title: string;
  tasks: Task[];
}

const LANE_TITLES: Record<BoardLaneId, string> = {
  needs: 'Needs you',
  working: 'Working',
  ready: 'Ready',
  pr: 'In pull request',
  idle: 'Idle',
  snoozed: 'Snoozed',
};

/** Where a task sits on the board: the first lane, left to right, that claims it. */
export function boardLaneOf(task: Task): BoardLaneId {
  // Snoozed tasks wake on their own when they need attention.
  if (isTaskBackgrounded(task.id)) return 'snoozed';
  const state = cardTaskState(task);
  if (state === 'needs_input' || state === 'error' || state === 'review') return 'needs';
  if (state === 'active') return 'working';
  if (task.prUrl) return 'pr';
  return state === 'ready' ? 'ready' : 'idle';
}

function matchesQuery(task: Task, query: string): boolean {
  if (!query) return true;
  const haystack = [task.name, task.branchName, getProject(task.projectId)?.name]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

/** Open tasks in sidebar order, honouring the sidebar's project filter. */
export function boardTasks(query: string): Task[] {
  const needle = query.trim().toLowerCase();
  return [...new Set([...store.taskOrder, ...store.collapsedTaskOrder])]
    .filter((id) => !isHiddenAgentTaskId(id) && matchesTaskProjectFilter(id))
    .map((id) => store.tasks[id])
    .filter((task): task is Task => task !== undefined && matchesQuery(task, needle));
}

/** The longest-waiting question first; failures and reviews follow in sidebar order. */
function byLongestWait(tasks: Task[]): Task[] {
  const since = (task: Task) => getTaskOpenQuestion(task.id)?.since ?? Number.MAX_SAFE_INTEGER;
  return [...tasks].sort((a, b) => since(a) - since(b));
}

export function boardLanes(tasks: Task[]): BoardLane[] {
  const lanes = (Object.keys(LANE_TITLES) as BoardLaneId[]).map((id) => ({
    id,
    title: LANE_TITLES[id],
    tasks: [] as Task[],
  }));
  for (const task of tasks) lanes.find((lane) => lane.id === boardLaneOf(task))?.tasks.push(task);
  const needs = lanes[0];
  if (needs) needs.tasks = byLongestWait(needs.tasks);
  return lanes;
}
