import {
  CHECK_ID_PATTERN,
  type EvidencePackage,
  type ProjectCheck,
} from '../../electron/shared/evidence';
import { skipReasonText } from './evidence-plan';

/**
 * Which project checks a review runs besides the reviewer, and how they went.
 * The choice is saved per project as check ids; the results are the task's
 * evidence package, so the gate that holds risky checks back still applies.
 */

const MAX_REVIEW_CHECKS = 32;

/** Restores a saved pick; unset means the user has not picked yet. */
export function restoreReviewChecks(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.filter(
    (id): id is string => typeof id === 'string' && CHECK_ID_PATTERN.test(id),
  );
  return [...new Set(ids)].slice(0, MAX_REVIEW_CHECKS);
}

export interface ReviewCheckRow {
  id: string;
  name: string;
  /** Plain words: passed, failed, running, or why it did not run. */
  outcome: string;
  failed: boolean;
}

/** One row per picked check that still exists, in the project's order. */
export function reviewCheckRows(
  picked: readonly string[],
  checks: readonly ProjectCheck[],
  pkg: EvidencePackage | undefined,
): ReviewCheckRow[] {
  return checks
    .filter((check) => picked.includes(check.id))
    .map((check) => {
      const run = pkg?.checks.find((entry) => entry.checkId === check.id);
      const skipped = pkg?.skipped.find((entry) => entry.checkId === check.id);
      const failed = !!run && ['failed', 'timed_out', 'error'].includes(run.status);
      const outcome = run
        ? failed
          ? 'failed'
          : run.status === 'passed' || run.status === 'running'
            ? run.status
            : 'stopped'
        : skipped
          ? skipReasonText(skipped.reason)
          : pkg?.assembling
            ? 'waiting'
            : 'not run';
      return { id: check.id, name: check.name, outcome, failed };
    });
}
