import { describe, expect, it } from 'vitest';
import { finishReports, finishReportsTitle } from './finish-reports';
import type { TaskConfidence } from './task-confidence';

const confidence = (fingerprint: string): TaskConfidence => ({
  scores: [
    { label: 'Correct', score: 82, why: '' },
    { label: 'Complete', score: 90, why: '' },
  ],
  findings: [],
  publishedAt: 100,
  fingerprint,
});

describe('finishReports', () => {
  it('lists a review and screens taken at the current commit', () => {
    const reports = finishReports({
      confidence: confidence('a'),
      codeFingerprint: { fingerprint: 'a', at: 200 },
      screens: { headSha: 'h1', count: 3, capturedAt: 50 },
      headSha: 'h1',
    });
    expect(reports).toEqual([
      { kind: 'review', label: 'Review (lowest score 82%)' },
      { kind: 'screens', label: 'Before & after (3 screens)' },
    ]);
  });

  it('drops a review of older code and screens of an older commit', () => {
    const reports = finishReports({
      confidence: confidence('a'),
      codeFingerprint: { fingerprint: 'b', at: 200 },
      screens: { headSha: 'h1', count: 3, capturedAt: 50 },
      headSha: 'h2',
    });
    expect(reports).toEqual([]);
  });

  it('drops screens of code that changed since, even without a commit', () => {
    const screens = { headSha: 'h1', count: 2, capturedAt: 100, fingerprint: 'a' };
    const changed = { fingerprint: 'b', at: 200 };
    expect(finishReports({ screens, codeFingerprint: changed, headSha: 'h1' })).toEqual([]);
    const same = { fingerprint: 'a', at: 200 };
    expect(finishReports({ screens, codeFingerprint: same, headSha: 'h1' })).toHaveLength(1);
  });

  it('does not count a capture that found nothing to show', () => {
    expect(
      finishReports({ screens: { headSha: 'h1', count: 0, capturedAt: 50 }, headSha: 'h1' }),
    ).toEqual([]);
  });

  it('keeps screens while the current commit is unknown', () => {
    expect(finishReports({ screens: { headSha: 'h1', count: 1, capturedAt: 50 } })).toEqual([
      { kind: 'screens', label: 'Before & after (1 screen)' },
    ]);
  });
});

describe('finishReportsTitle', () => {
  it('appends the current reports to the button tooltip', () => {
    expect(finishReportsTitle('Finish', [{ kind: 'review', label: 'Review' }])).toBe(
      'Finish\nCurrent for the latest commit:\n· Review',
    );
    expect(finishReportsTitle('Finish', [])).toBe('Finish');
  });

  it('names the reports still being generated', () => {
    expect(finishReportsTitle('Finish', [], ['Review', 'Before & after'])).toBe(
      'Finish\nGenerating: Review, Before & after',
    );
  });
});
