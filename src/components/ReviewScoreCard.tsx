import { For, Show } from 'solid-js';
import { sf } from '../lib/fontScale';
import type { ReviewScores } from '../lib/review-summary';
import { theme } from '../lib/theme';

/** What stands between the task and merging, in one sentence; undefined when nothing does. */
function blockingLine(failedChecks: readonly string[], open: number): string | undefined {
  const parts = [
    ...failedChecks.map((name) => `${name} failed`),
    open > 0 && `${open} ${open === 1 ? 'item is' : 'items are'} open`,
  ].filter((part): part is string => !!part);
  if (parts.length === 0) return undefined;
  const last = parts.pop();
  return parts.length > 0 ? `${parts.join(', ')} and ${last}` : last;
}

/**
 * The rating at a glance, as a confidence audit reads: the weakest score
 * stands for the whole, each score keeps the reason it is not higher, and one
 * line says what still blocks the merge. Colour goes only to a score below the
 * bar and to a failed check, so a routine review stays quiet.
 */
export function ReviewScoreCard(props: {
  scores: ReviewScores;
  failedChecks: readonly string[];
  /** Risks and gaps still open. */
  open: number;
  /** A claim the diff does not back is open. */
  urgent: boolean;
}) {
  const weakest = () => props.scores.weakest;
  const blocking = () => blockingLine(props.failedChecks, props.open);
  const alarming = () => props.failedChecks.length > 0 || props.scores.low || props.urgent;
  return (
    <section
      aria-label="Confidence"
      style={{
        display: 'flex',
        'flex-direction': 'column',
        gap: '14px',
        opacity: props.scores.stale ? '0.7' : '1',
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'baseline', gap: '10px', 'flex-wrap': 'wrap' }}>
        <Show when={weakest()}>
          {(entry) => (
            <>
              <span
                style={{
                  'font-size': sf(22),
                  'font-weight': '600',
                  'font-variant-numeric': 'tabular-nums',
                  'line-height': '1',
                  color: props.scores.low ? theme.warning : theme.fg,
                }}
              >
                {entry().score}%
              </span>
              <span style={{ flex: '1', 'min-width': '0', color: theme.fgMuted }}>
                confident
                <Show when={entry().score < 100 && props.scores.all.length > 1}>
                  {' '}
                  · held back by{' '}
                  <strong style={{ 'font-weight': '600', color: theme.fg }}>{entry().label}</strong>
                </Show>
              </span>
            </>
          )}
        </Show>
        <span style={{ 'font-size': sf(12), color: theme.fgSubtle }}>
          {[props.scores.source, props.scores.stale && 'the code changed since']
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <p style={{ margin: '0', color: alarming() ? theme.warning : theme.fgMuted }}>
        {blocking() ? `Not ready to merge: ${blocking()}.` : 'Nothing left open.'}
      </p>
      <Show when={props.scores.all.length > 0}>
        <ul
          style={{
            margin: '0',
            padding: '4px 0 0',
            'list-style': 'none',
            display: 'grid',
            'grid-template-columns': 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '24px',
          }}
        >
          <For each={props.scores.all}>
            {(entry) => {
              const flagged = () => props.scores.low && entry === weakest();
              return (
                <li style={{ display: 'flex', 'flex-direction': 'column', gap: '5px' }}>
                  <span style={{ display: 'flex', gap: '8px', 'align-items': 'baseline' }}>
                    <span style={{ flex: '1', 'min-width': '0', color: theme.fgMuted }}>
                      {entry.label}
                    </span>
                    <span
                      style={{
                        'font-weight': '600',
                        'font-variant-numeric': 'tabular-nums',
                        color: flagged() ? theme.warning : theme.fg,
                      }}
                    >
                      {entry.score}%
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      height: '3px',
                      'border-radius': '2px',
                      background: `linear-gradient(to right, ${
                        flagged() ? theme.warning : theme.fgMuted
                      } ${entry.score}%, ${theme.borderSubtle} 0)`,
                    }}
                  />
                  <span style={{ 'font-size': sf(12), color: theme.fgMuted }}>{entry.why}</span>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </section>
  );
}
