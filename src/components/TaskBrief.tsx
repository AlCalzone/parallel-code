import { Show, createSignal, onCleanup, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { theme } from '../lib/theme';
import { sf } from '../lib/fontScale';
import { createAnchorEffect, placeBelow } from '../lib/floating';
import { formatRelativeAge } from '../lib/relativeAge';
import { refreshTaskBrief } from '../store/task-brief';
import { isTaskWorking } from '../store/taskStatus';
import type { Task } from '../store/types';

const CARD_WIDTH = 480;

const sectionLabel: JSX.CSSProperties = {
  'font-size': sf(10),
  'letter-spacing': '0.06em',
  'text-transform': 'uppercase',
  color: theme.fgMuted,
  'padding-top': '2px',
};

// Routine actions: a plain border and muted text; .btn-secondary adds the hover fill.
const cardButton: JSX.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${theme.border}`,
  'border-radius': 'var(--radius-sm)',
  padding: '3px 10px',
  color: theme.fgMuted,
  'font-size': sf(11),
  'font-family': 'inherit',
  cursor: 'pointer',
};

/**
 * The brief's question for the user, or '' once the agent is working again:
 * briefs are only rewritten after a turn, so the last one still asks a
 * question the user may have just answered.
 */
function needsYouNow(task: Task): string {
  const needsYou = task.brief?.brief.needsYou;
  return needsYou && !isTaskWorking(task.id) ? needsYou : '';
}

interface TaskBriefBarProps {
  task: Task;
  onWalkThrough?: () => void;
  walkThroughDisabled?: boolean;
}

/**
 * The task brief under the task title: up to three lines of the goal, or of
 * what the agent needs from the user, that open the goal and current step in
 * a card below it.
 */
export function TaskBriefBar(props: TaskBriefBarProps) {
  let anchor: HTMLButtonElement | undefined;
  let card: HTMLDivElement | undefined;
  const [open, setOpen] = createSignal(false);
  const [place, setPlace] = createSignal({ top: 0, right: 0, maxHeight: 400 });

  createAnchorEffect(open, () => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(CARD_WIDTH, window.innerWidth - 24);
    setPlace(
      placeBelow({ top: rect.top, right: rect.right, bottom: rect.bottom }, width, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  });

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (target && (card?.contains(target) || anchor?.contains(target))) return;
    // close(), not setOpen(false): a document listener left behind would swallow
    // Escape everywhere, terminals included, and pull focus back to the bar.
    close();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
    anchor?.focus();
  };
  const toggle = () => {
    const next = !open();
    setOpen(next);
    if (next) {
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKeyDown, true);
      // Move focus into the card so keyboard users land on its controls.
      queueMicrotask(() => card?.querySelector<HTMLElement>('button, textarea')?.focus());
    } else {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    }
  };
  const close = () => {
    if (open()) toggle();
  };
  onCleanup(() => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
  });
  // Routine briefs stay quiet; an agent waiting on the user needs a look now.
  const urgent = () => needsYouNow(props.task) !== '';

  const headline = () => {
    const brief = props.task.brief?.brief;
    if (brief) return needsYouNow(props.task) || brief.goal || brief.now;
    if (props.task.briefStatus?.state === 'generating') return 'Writing the brief…';
    return 'The brief appears after the agent finishes a turn';
  };
  const headlineLabel = () => {
    const brief = props.task.brief?.brief;
    if (!brief) return '';
    return urgent() ? 'Needs you' : brief.goal ? 'Goal' : 'Now';
  };
  const statusNote = () => {
    const status = props.task.briefStatus;
    if (status?.state === 'generating' && props.task.brief) return 'updating';
    if (status?.state === 'failed') return 'brief failed';
    return '';
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        class="task-brief-bar"
        data-urgent={urgent() ? '' : undefined}
        aria-haspopup="dialog"
        aria-expanded={open()}
        title={
          props.task.briefStatus?.state === 'failed' ? props.task.briefStatus.message : undefined
        }
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        style={{
          display: 'flex',
          // Baseline, so the label and status sit on the first line when the text wraps.
          'align-items': 'baseline',
          gap: '8px',
          // A subtitle under the task title, indented like it. Unboxed, since a
          // brief is routine; the hover fill and chevron live in styles.css.
          width: '100%',
          // One line's height before the first brief, so it only grows when one arrives.
          'min-height': '28px',
          'min-width': '0',
          padding: '5px 12px 5px 16px',
          border: 'none',
          // Full-strength text: the line is read at a glance, so it must not be faint.
          color: props.task.brief ? theme.fg : theme.fgMuted,
          'font-size': sf(13),
          'line-height': '1.4',
          'font-family': 'inherit',
          'text-align': 'left',
          cursor: 'pointer',
          overflow: 'hidden',
          'white-space': 'nowrap',
        }}
      >
        {/* Names the field shown, so the line reads as Goal or Needs you at a glance. */}
        <Show when={headlineLabel()}>
          <span
            style={{
              ...sectionLabel,
              color: urgent() ? theme.warning : theme.fgMuted,
              'padding-top': '0',
              'flex-shrink': '0',
            }}
          >
            {headlineLabel()}
          </span>
        </Show>
        {/* Up to three lines, so a 15-word brief fits even in narrow columns. */}
        <span
          style={{
            flex: '1',
            'min-width': '0',
            overflow: 'hidden',
            'white-space': 'normal',
            'overflow-wrap': 'anywhere',
            display: '-webkit-box',
            '-webkit-line-clamp': '3',
            '-webkit-box-orient': 'vertical',
          }}
        >
          {headline()}
        </span>
        <Show when={statusNote()}>
          <span style={{ 'flex-shrink': '0', color: theme.fgSubtle }}>{statusNote()}</span>
        </Show>
        <span
          class="task-brief-chevron"
          aria-hidden="true"
          style={{ 'flex-shrink': '0', color: theme.fgMuted }}
        >
          {open() ? '▴' : '▾'}
        </span>
      </button>
      <Show when={open()}>
        <Portal>
          <div
            ref={card}
            role="dialog"
            aria-label="Task brief"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${place().top}px`,
              right: `${place().right}px`,
              width: `${Math.min(CARD_WIDTH, window.innerWidth - 24)}px`,
              'max-height': `${place().maxHeight}px`,
              overflow: 'auto',
              'z-index': 'var(--z-modal)',
              background: theme.bgElevated,
              border: `1px solid ${theme.border}`,
              'border-radius': 'var(--radius-md)',
              'box-shadow': '0 8px 24px rgba(0, 0, 0, 0.35)',
              color: theme.fg,
            }}
          >
            <TaskBriefCard
              task={props.task}
              onWalkThrough={
                props.onWalkThrough
                  ? () => {
                      close();
                      props.onWalkThrough?.();
                    }
                  : undefined
              }
              walkThroughDisabled={props.walkThroughDisabled}
            />
          </div>
        </Portal>
      </Show>
    </>
  );
}

function TaskBriefCard(props: {
  task: Task;
  onWalkThrough?: () => void;
  walkThroughDisabled?: boolean;
}) {
  // Keeps the relative times current while the card stays open.
  const [now, setNow] = createSignal(Date.now());
  const ticker = setInterval(() => setNow(Date.now()), 30_000);
  onCleanup(() => clearInterval(ticker));
  const brief = () => props.task.brief?.brief;

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column' }}>
      <div
        style={{
          padding: '14px 16px 12px',
          display: 'flex',
          'flex-direction': 'column',
          gap: '8px',
          'border-bottom': `1px solid ${theme.borderSubtle}`,
        }}
      >
        <span style={{ 'font-size': sf(14), 'font-weight': '600' }}>{props.task.name}</span>
        <Show
          when={brief()}
          fallback={
            <span style={{ 'font-size': sf(13), color: theme.fgMuted, 'line-height': '1.45' }}>
              {props.task.briefStatus?.state === 'failed'
                ? `The brief could not be written: ${props.task.briefStatus.message}`
                : 'The brief is written after each agent turn.'}
            </span>
          }
        >
          {(b) => (
            <dl
              style={{
                margin: '0',
                display: 'grid',
                'grid-template-columns': 'auto minmax(0, 1fr)',
                gap: '6px 12px',
                'align-items': 'baseline',
              }}
            >
              <BriefRow label="Goal" text={b().goal} />
              <BriefRow label="Now" text={b().now} />
              <BriefRow label="Needs you" text={needsYouNow(props.task)} color={theme.warning} />
            </dl>
          )}
        </Show>
      </div>

      <div
        style={{
          padding: '8px 16px 10px',
          'border-top': `1px solid ${theme.borderSubtle}`,
          display: 'flex',
          'flex-wrap': 'wrap',
          gap: '8px',
          'align-items': 'center',
        }}
      >
        <span style={{ 'font-size': sf(10), color: theme.fgMuted, flex: '1', 'min-width': '0' }}>
          {props.task.briefStatus?.state === 'generating'
            ? 'Updating…'
            : props.task.brief
              ? `Updated ${formatRelativeAge(props.task.brief.generatedAt, now())}`
              : ''}
        </span>
        <button
          type="button"
          class="btn-secondary"
          style={cardButton}
          disabled={props.task.briefStatus?.state === 'generating'}
          onClick={() => void refreshTaskBrief(props.task.id, { force: true })}
        >
          Update now
        </button>
        <Show when={props.onWalkThrough}>
          <button
            type="button"
            class="btn-secondary"
            style={cardButton}
            disabled={props.walkThroughDisabled}
            onClick={() => props.onWalkThrough?.()}
          >
            Walk me through
          </button>
        </Show>
      </div>
    </div>
  );
}

/** One brief field as a label and its text; nothing when the brief leaves it empty. */
function BriefRow(props: { label: string; text: string | undefined; color?: string }) {
  return (
    <Show when={props.text}>
      <dt style={{ ...sectionLabel, color: props.color ?? theme.fgMuted }}>{props.label}</dt>
      <dd style={{ margin: '0', 'font-size': sf(13), 'line-height': '1.45' }}>{props.text}</dd>
    </Show>
  );
}

/** One quiet line for the sidebar row: what the agent needs, else the goal. */
export function TaskBriefLine(props: { task: Task }) {
  const line = () => {
    const brief = props.task.brief?.brief;
    return needsYouNow(props.task) || brief?.goal || brief?.now;
  };
  return (
    <Show when={line()}>
      {(headline) => (
        <div
          class="task-brief-line"
          title={headline()}
          style={{
            color: theme.fgSubtle,
            'font-size': sf(11),
            'line-height': '1.4',
            overflow: 'hidden',
            'text-overflow': 'ellipsis',
            'white-space': 'nowrap',
            'min-width': '0',
          }}
        >
          {headline()}
        </div>
      )}
    </Show>
  );
}
