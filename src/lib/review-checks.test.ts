import { describe, expect, it } from 'vitest';
import type { EvidencePackage, ProjectCheck } from '../../electron/shared/evidence';
import { restoreReviewChecks, reviewCheckRows } from './review-checks';

const check = (id: string, run: ProjectCheck['run'] = 'auto'): ProjectCheck => ({
  id,
  name: id.toUpperCase(),
  kind: 'custom',
  command: `run ${id}`,
  run,
});

describe('restoreReviewChecks', () => {
  it('keeps valid ids once and tells "not picked yet" apart from "none"', () => {
    expect(restoreReviewChecks(['verify', 'unit', 'verify', 7, 'no spaces'])).toEqual([
      'verify',
      'unit',
    ]);
    expect(restoreReviewChecks([])).toEqual([]);
    expect(restoreReviewChecks(undefined)).toBeUndefined();
    expect(restoreReviewChecks('verify')).toBeUndefined();
  });
});

describe('reviewCheckRows', () => {
  const checks = [check('verify'), check('unit'), check('e2e', 'on-demand'), check('lint')];

  it('says how each picked check went, in the project order', () => {
    const pkg = {
      checks: [
        { checkId: 'unit', status: 'failed' },
        { checkId: 'verify', status: 'passed' },
      ],
      skipped: [{ checkId: 'e2e', name: 'E2E', kind: 'e2e', reason: 'docker' }],
    } as unknown as EvidencePackage;
    const rows = reviewCheckRows(['e2e', 'unit', 'verify', 'gone'], checks, pkg);
    expect(rows.map((row) => [row.id, row.failed])).toEqual([
      ['verify', false],
      ['unit', true],
      ['e2e', false],
    ]);
    expect(rows[0].outcome).toBe('passed');
    expect(rows[1].outcome).toBe('failed');
    // A skipped check says why rather than just "not run".
    expect(rows[2].outcome).not.toBe('not run');
  });

  it('waits while the package is assembling and says "not run" without one', () => {
    const assembling = { checks: [], skipped: [], assembling: true } as unknown as EvidencePackage;
    expect(reviewCheckRows(['lint'], checks, assembling)[0].outcome).toBe('waiting');
    expect(reviewCheckRows(['lint'], checks, undefined)[0].outcome).toBe('not run');
  });
});
