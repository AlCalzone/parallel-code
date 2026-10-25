import { isConfidenceOutdated, type TaskConfidence } from './task-confidence';
import type { TaskBriefRecord } from './task-brief';

export type FinishReportKind = 'review' | 'screens';

/** A report Finish can show that still describes the task's latest code. */
export interface FinishReport {
  kind: FinishReportKind;
  label: string;
}

export interface FinishReportsInput {
  confidence?: TaskConfidence;
  codeFingerprint?: { fingerprint: string; at: number };
  brief?: TaskBriefRecord;
  /** The latest finished capture, and how many screens it took. */
  screens?: CapturedScreens & { count: number };
  /** The task's current commit; unknown counts as unchanged, as for verify runs. */
  headSha?: string | null;
}

/** When a capture ran, and on what code: the commit, and the diff it saw then. */
export interface CapturedScreens {
  headSha: string;
  capturedAt: number;
  fingerprint?: string;
}

/**
 * Whether the code moved on since the capture: a new commit, or a newer read of
 * the diff that differs (uncommitted edits). Unknown counts as unchanged.
 */
export function areScreensOutdated(
  screens: CapturedScreens,
  code: Pick<FinishReportsInput, 'codeFingerprint' | 'brief' | 'headSha'>,
): boolean {
  if (code.headSha && screens.headSha !== code.headSha) return true;
  const capture = { publishedAt: screens.capturedAt, fingerprint: screens.fingerprint };
  return isConfidenceOutdated(capture, code.codeFingerprint, code.brief);
}

function reviewLabel(confidence: TaskConfidence): string {
  const scores = confidence.scores.map((entry) => entry.score);
  return scores.length ? `Review (lowest score ${Math.min(...scores)}%)` : 'Review';
}

/** The reports that are current for the task's latest code, in Finish's order. */
export function finishReports(input: FinishReportsInput): FinishReport[] {
  const reports: FinishReport[] = [];
  const { confidence, screens } = input;
  if (confidence && !isConfidenceOutdated(confidence, input.codeFingerprint, input.brief)) {
    reports.push({ kind: 'review', label: reviewLabel(confidence) });
  }
  if (screens && screens.count > 0 && !areScreensOutdated(screens, input)) {
    const noun = screens.count === 1 ? 'screen' : 'screens';
    reports.push({ kind: 'screens', label: `Before & after (${screens.count} ${noun})` });
  }
  return reports;
}

/** The Finish button's tooltip: the reports that are still current, and those being generated. */
export function finishReportsTitle(
  base: string,
  reports: FinishReport[],
  generating: string[] = [],
): string {
  const lines = [base];
  if (reports.length) {
    lines.push('Current for the latest commit:', ...reports.map((r) => `· ${r.label}`));
  }
  if (generating.length) lines.push(`Generating: ${generating.join(', ')}`);
  return lines.join('\n');
}
