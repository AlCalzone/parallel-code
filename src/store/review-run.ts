import type { ProjectCheck } from '../../electron/shared/evidence';
import { errMessage, warn as logWarn } from '../lib/log';
import { store } from './core';
import { buildEvidence } from './evidence';
import { getTaskChecks } from './evidence-state';
import { getProject, updateProject } from './projects';
import { startTaskReview } from './task-review';

/**
 * Saves which checks reviews run in the task's project, adding the suggested
 * checks the user picked to the project's own.
 */
export function setReviewChecks(
  taskId: string,
  pick: { ids: readonly string[]; newChecks?: readonly ProjectCheck[]; verifyCommand?: string },
): void {
  const task = store.tasks[taskId];
  const project = task && getProject(task.projectId);
  if (!project) return;
  updateProject(project.id, {
    reviewChecks: [...pick.ids],
    ...(pick.newChecks?.length && {
      evidenceChecks: [...(project.evidenceChecks ?? []), ...pick.newChecks],
    }),
    ...(pick.verifyCommand &&
      !project.verifyCommand?.trim() && { verifyCommand: pick.verifyCommand }),
  });
}

/**
 * Starts a review: the reviewer model, plus the checks picked for the project
 * as one evidence build, so the gate that holds risky checks back still
 * decides what runs. Both run in the background.
 */
export function startReview(taskId: string): void {
  const task = store.tasks[taskId];
  // A second start while one runs would restart the checks under it.
  if (!task || task.reviewStatus?.state === 'running') return;
  const picked = getProject(task.projectId)?.reviewChecks ?? [];
  const only = getTaskChecks(taskId)
    .map((check) => check.id)
    .filter((id) => picked.includes(id));
  if (only.length > 0)
    buildEvidence(taskId, { trigger: 'manual', only }).catch((error: unknown) => {
      logWarn('taskReview', 'Review checks failed', { taskId, error: errMessage(error) });
    });
  void startTaskReview(taskId);
}
