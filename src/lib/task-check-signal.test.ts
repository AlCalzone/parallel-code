import { describe, expect, it } from 'vitest';
import type { EvidenceConfidenceLevel } from '../../electron/shared/evidence-confidence';
import type {
  EvidenceFlag,
  EvidenceFlagCategory,
  EvidencePackage,
} from '../../electron/shared/evidence';
import type { VerificationRun } from '../ipc/types';
import { taskCheckSignal } from './task-check-signal';
import { theme } from './theme';

const HEAD = 'a'.repeat(40);

function run(overrides: Partial<VerificationRun> = {}): VerificationRun {
  return {
    command: 'npm test',
    headSha: HEAD,
    dirty: false,
    startedAt: '2026-10-06T10:00:00.000Z',
    finishedAt: '2026-10-06T10:01:00.000Z',
    status: 'passed',
    exitCode: 0,
    outputTail: '',
    ...overrides,
  };
}

function runSignal(overrides: Partial<VerificationRun>, headSha = HEAD) {
  return taskCheckSignal({
    verificationRun: run(overrides),
    verifyCommandConfigured: true,
    headSha,
  });
}

function evidencePackage(opts: {
  flags: EvidenceFlag[];
  acceptedFlags?: Record<string, string>;
}): EvidencePackage {
  return {
    id: 'p1',
    createdAt: '2026-10-06T10:00:00.000Z',
    trigger: 'agent',
    assembling: false,
    scan: {
      headSha: HEAD,
      baseSha: 'b'.repeat(40),
      dirty: false,
      files: [],
      flags: opts.flags,
      tests: [],
      coveringTests: [],
      sourceWithoutTests: [],
    },
    checks: [],
    skipped: [],
    acceptedFlags: opts.acceptedFlags ?? {},
    dismissedFindings: [],
  };
}

describe('taskCheckSignal', () => {
  it.each<[EvidenceConfidenceLevel, string, string]>([
    ['not-checked', 'Re-run checks', theme.warning],
    ['low', 'Review checks', theme.error],
    ['medium', 'Review checks', theme.warning],
  ])('names the next step for evidence level %s: "%s"', (level, label, color) => {
    const signal = taskCheckSignal({
      evidence: { level, reasons: [] },
      verifyCommandConfigured: true,
    });
    expect(signal).toMatchObject({ label, color });
  });

  // The header has room for what needs you; a pass or a run in progress asks nothing.
  it.each<EvidenceConfidenceLevel>(['checking', 'high'])(
    'shows nothing for evidence level %s',
    (level) => {
      expect(
        taskCheckSignal({ evidence: { level, reasons: [] }, verifyCommandConfigured: true }),
      ).toBeUndefined();
    },
  );

  it('names the action for open flags', () => {
    const flag = (id: string, category: EvidenceFlagCategory) => ({
      id,
      category,
      rule: id,
      file: `${id}.ts`,
      detail: 'detail',
    });
    const label = (pkg: EvidencePackage) =>
      taskCheckSignal({
        evidence: { level: 'medium', reasons: [] },
        evidencePackage: pkg,
        verifyCommandConfigured: true,
      })?.label;
    const flagged = evidencePackage({
      flags: [flag('a', 'needs-decision'), flag('b', 'needs-decision')],
    });
    expect(label(flagged)).toBe('Review 2 flagged changes');
    const weakened = evidencePackage({ flags: [flag('w', 'test-weakened')] });
    expect(label(weakened)).toBe('Review 1 weakened test');
    // Failed and skipped checks: see evidence-display.test.ts.
  });

  it('lets evidence win over a failed verify run and lists its reasons on hover', () => {
    const signal = taskCheckSignal({
      evidence: { level: 'not-checked', reasons: [{ level: 'not-checked', text: 'New commits.' }] },
      verificationRun: run({ status: 'failed', exitCode: 1 }),
      verifyCommandConfigured: true,
      headSha: HEAD,
    });
    expect(signal?.label).toBe('Re-run checks');
    expect(signal?.title).toBe('Checks outdated\nNew commits.');
  });

  it('names each open flag on hover, leaving out accepted and info flags', () => {
    const flag = (id: string, category: EvidenceFlagCategory, file: string) => ({
      id,
      category,
      rule: id,
      file,
      detail: `${id} detail`,
    });
    const signal = taskCheckSignal({
      evidence: { level: 'medium', reasons: [{ level: 'medium', text: '2 change(s) need it.' }] },
      evidencePackage: evidencePackage({
        flags: [
          flag('ci', 'needs-decision', 'ci.yml'),
          flag('seen', 'needs-decision', 'seen.ts'),
          flag('note', 'info', 'note.ts'),
        ],
        acceptedFlags: { seen: 'intended' },
      }),
      verifyCommandConfigured: true,
    });
    expect(signal?.title).toBe('Medium confidence\n2 change(s) need it.\nci.yml: ci detail');
  });

  it('caps the flags named on hover', () => {
    const flags = Array.from({ length: 7 }, (_, i) => ({
      id: `snap${i}`,
      category: 'needs-decision' as const,
      rule: 'snapshot-updated',
      file: `s${i}.snap`,
      detail: 'Snapshot file was updated.',
    }));
    const signal = taskCheckSignal({
      evidence: { level: 'medium', reasons: [] },
      evidencePackage: evidencePackage({ flags }),
      verifyCommandConfigured: true,
    });
    const lines = signal?.title.split('\n') ?? [];
    expect(lines).toHaveLength(7);
    expect(lines.at(-1)).toBe('…and 2 more');
  });

  it('falls back to the verify run without evidence', () => {
    expect(runSignal({ status: 'failed', exitCode: 1 })?.label).toBe('Verify failed');
    expect(runSignal({}, 'b'.repeat(40))?.label).toBe('Re-run verify');
    expect(runSignal({ dirty: true })?.label).toBe('Re-run verify');
  });

  it('stays silent while verify runs or after it passed', () => {
    expect(runSignal({})).toBeUndefined();
    expect(runSignal({ status: 'running', finishedAt: undefined })).toBeUndefined();
  });

  it('points a failure at the last pass', () => {
    const signal = taskCheckSignal({
      verificationRun: run({ status: 'failed', exitCode: 1 }),
      verifyCommandConfigured: true,
      headSha: HEAD,
      lastVerifyPass: { command: run().command, headSha: 'c'.repeat(40), finishedAt: 'x' },
    });
    expect(signal?.color).toBe(theme.error);
    expect(signal?.title).toContain('\nLast passed at ccccccc.');
  });

  it('stays silent for a cancelled run', () => {
    expect(runSignal({ status: 'cancelled', exitCode: null })).toBeUndefined();
  });

  it('keeps using a past run after the verify command is removed', () => {
    const signal = taskCheckSignal({
      verificationRun: run({ status: 'failed', exitCode: 1 }),
      verifyCommandConfigured: false,
      headSha: HEAD,
    });
    expect(signal?.label).toBe('Verify failed');
  });

  it('uses the agent report only when no verify command or run exists', () => {
    const blocked = {
      checks: [{ name: 'Unit', command: 'npm test', result: 'blocked' as const, reason: 'no db' }],
    };
    expect(taskCheckSignal({ verification: blocked, verifyCommandConfigured: false })).toEqual({
      label: 'Review blocked verify',
      color: theme.warning,
      title: 'Unit: npm test\nno db',
    });
    expect(
      taskCheckSignal({ verification: blocked, verifyCommandConfigured: true }),
    ).toBeUndefined();

    const passed = { checks: [{ name: 'Unit', command: 'npm test', result: 'passed' as const }] };
    expect(
      taskCheckSignal({ verification: passed, verifyCommandConfigured: false }),
    ).toBeUndefined();
  });

  it('shows nothing when there is nothing to report', () => {
    expect(taskCheckSignal({ verifyCommandConfigured: false })).toBeUndefined();
  });
});
