import { debug, error } from './log';
import { shouldAnimateTaskAppearance } from './reducedMotion';

let settled: Promise<void> = Promise.resolve();

/**
 * Resolves once the running view change, if any, has finished animating.
 * Heavy follow-up work waits for it so it cannot stall the animation.
 */
export function viewTransitionSettled(): Promise<void> {
  return settled;
}

/**
 * Runs a workspace view change (focus, tiles, board, side panel) as a view
 * transition, so the layouts cross-fade and the task workspace glides to its
 * new box instead of jumping. Terminals resize once, under the animation.
 *
 * With animation the update runs a frame later, after the old layout is
 * captured: callers must not rely on the change having happened on return.
 */
export function withViewTransition(update: () => void): void {
  if (!shouldAnimateTaskAppearance() || !('startViewTransition' in document)) {
    update();
    return;
  }
  const transition = document.startViewTransition(() => {
    try {
      update();
    } catch (err) {
      error('view-transition', 'View change failed', err);
    }
  });
  settled = transition.finished.then(
    () => undefined,
    (err: unknown) => debug('view-transition', 'View change unfinished', { reason: String(err) }),
  );
  // Rejects when a newer view change skips this animation; the update still ran.
  transition.ready.catch((err: unknown) =>
    debug('view-transition', 'Animation skipped', { reason: String(err) }),
  );
}
