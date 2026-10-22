import { debug, error } from './log';
import { shouldAnimateTaskAppearance } from './reducedMotion';

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
  // Rejects when a newer view change skips this animation; the update still ran.
  transition.ready.catch((err: unknown) =>
    debug('view-transition', 'Animation skipped', { reason: String(err) }),
  );
}
