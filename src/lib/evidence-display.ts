import type { EvidenceFlag, EvidencePackage } from '../../electron/shared/evidence';
import type {
  EvidenceConfidence,
  EvidenceConfidenceLevel,
} from '../../electron/shared/evidence-confidence';
import { theme } from './theme';

/** Shared by the Finish dialog and the title bar badge so they agree. */
export const EVIDENCE_LEVEL: Record<EvidenceConfidenceLevel, { label: string; color: string }> = {
  checking: { label: 'Checking', color: theme.fgMuted },
  'not-checked': { label: 'Checks outdated', color: theme.warning },
  low: { label: 'Low confidence', color: theme.error },
  medium: { label: 'Medium confidence', color: theme.warning },
  high: { label: 'High confidence', color: theme.success },
};

/** The Finish dialog headline, plus the next step when there is one: the task
 *  header shows only that, so a pass or a run in progress shows nothing there. */
export interface EvidenceSummary {
  headline: string;
  action?: string;
}

/** Flags that still need the user: not informational and not yet accepted. */
export function openEvidenceFlags(pkg: EvidencePackage): EvidenceFlag[] {
  return pkg.scan.flags.filter(
    (flag) => flag.category !== 'info' && !(flag.id in pkg.acceptedFlags),
  );
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Facts first; freshness always takes precedence over historical results. */
export function evidenceSummary(
  confidence: EvidenceConfidence,
  pkg?: EvidencePackage,
): EvidenceSummary {
  if (confidence.level === 'checking') return { headline: 'Checking…' };
  if (confidence.level === 'not-checked')
    return { headline: 'Checks outdated', action: 'Re-run checks' };
  if (!pkg)
    return confidence.level === 'high'
      ? { headline: 'Checks passed' }
      : { headline: 'Needs attention', action: 'Review checks' };
  const failed = pkg.checks.filter((run) =>
    ['failed', 'timed_out', 'error'].includes(run.status),
  ).length;
  if (failed)
    return {
      headline: `${count(failed, 'check')} failed`,
      action: `Fix ${count(failed, 'failed check')}`,
    };
  const open = openEvidenceFlags(pkg);
  // A weakened test undermines the passing checks, so it outranks a routine confirmation.
  const weakened = open.filter((flag) => flag.category === 'test-weakened').length;
  if (weakened)
    return {
      headline: `${count(weakened, 'test')} weakened`,
      action: `Review ${count(weakened, 'weakened test')}`,
    };
  if (open.length)
    return {
      headline: `${count(open.length, 'change')} to confirm`,
      action: `Review ${count(open.length, 'flagged change')}`,
    };
  const notRun = pkg.skipped.length + pkg.checks.filter((run) => run.status === 'cancelled').length;
  if (notRun)
    return {
      headline: `${count(notRun, 'check')} not run`,
      action: `Run ${count(notRun, 'skipped check')}`,
    };
  if (confidence.level !== 'high') return { headline: 'Needs review', action: 'Review checks' };
  return { headline: 'All configured checks passed' };
}

export function evidenceHeadline(confidence: EvidenceConfidence, pkg?: EvidencePackage): string {
  return evidenceSummary(confidence, pkg).headline;
}

/** Counts every configured check, including checks still queued or never started. */
export function evidenceCheckOutcomes(pkg: EvidencePackage): string {
  const counts = { passed: 0, failed: 0, running: 0, waiting: 0, 'not run': 0 };
  const ids = new Set([
    ...(pkg.configuredChecks ?? []).map((check) => check.id),
    ...pkg.checks.map((check) => check.checkId),
    ...pkg.skipped.map((check) => check.checkId),
  ]);
  for (const id of ids) {
    const run = pkg.checks.find((check) => check.checkId === id);
    if (run?.status === 'passed') counts.passed++;
    else if (run?.status === 'running') counts.running++;
    else if (run && ['failed', 'timed_out', 'error'].includes(run.status)) counts.failed++;
    else if (!run && pkg.assembling && !pkg.skipped.some((check) => check.checkId === id))
      counts.waiting++;
    else counts['not run']++;
  }
  return (
    Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([label, value]) => `${value} ${label}`)
      .join(' · ') || 'No checks configured'
  );
}
