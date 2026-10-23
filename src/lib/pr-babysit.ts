import type { PrChecksOverall } from '../ipc/types';

/** Fix attempts in a row before babysitting stops, so a fix that keeps failing
 *  does not loop forever. A green run resets the count. */
export const MAX_BABYSIT_ATTEMPTS = 3;

/** Per-task babysitting progress; present while babysitting is on. */
export interface PrBabysit {
  /** Failure prompts sent since CI last passed. */
  attempts: number;
  /** Head commit whose failures were last sent, so each failing commit is sent once. */
  lastSentSha?: string;
}

/** The parts of a PR's checks state that babysitting reacts to. */
export interface BabysitChecks {
  overall: PrChecksOverall;
  headSha?: string;
  merged?: boolean;
}

export type BabysitStep =
  | { kind: 'wait' }
  | { kind: 'send'; headSha: string }
  | { kind: 'reset' }
  | { kind: 'give-up' }
  | { kind: 'done' };

/** What babysitting should do after a PR's latest checks update. */
export function nextBabysitStep(
  babysit: PrBabysit,
  checks: BabysitChecks | undefined,
): BabysitStep {
  if (!checks) return { kind: 'wait' };
  if (checks.merged) return { kind: 'done' };
  if (checks.overall === 'success')
    return babysit.attempts > 0 ? { kind: 'reset' } : { kind: 'wait' };
  // Pending wins over failed in the summary, so this waits for the whole run
  // and sends its failures together.
  if (checks.overall !== 'failure' || !checks.headSha) return { kind: 'wait' };
  if (checks.headSha === babysit.lastSentSha) return { kind: 'wait' };
  if (babysit.attempts >= MAX_BABYSIT_ATTEMPTS) return { kind: 'give-up' };
  return { kind: 'send', headSha: checks.headSha };
}
