import { Show, batch, createMemo, createSignal } from 'solid-js';
import { invoke } from '../lib/ipc';
import { IPC } from '../../electron/ipc/channels';
import { formatRelativeAge } from '../lib/relativeAge';
import { withViewTransition } from '../lib/viewTransition';
import { isTaskBackgrounded } from '../store/background-tasks';
import { store } from '../store/core';
import { getPrChecks } from '../store/pr-checks-state';
import { openBoardSidePanel } from '../store/project-pages';
import { getProject } from '../store/projects';
import { getTaskAttentionState, getTaskDotStatus, getTaskOpenQuestion } from '../store/taskStatus';
import { retryCloseTask, uncollapseTask } from '../store/tasks';
import type { Task } from '../store/types';
import { activityLine, kanbanNow, openTask, stateLabel, type CardTaskState } from './KanbanCard';
import { ContextMenu, type MoreMenuItem } from './chat/MoreMenu';
import { StatusDot } from './StatusDot';
import { boardTaskState, type BoardLaneId } from './task-board-lanes';
import { laterMenuItems } from './task-later-menu';
import { UndoIcon } from './icons';

const ASK_ACTION: Partial<Record<CardTaskState, string>> = {
  needs_input: 'Answer',
  error: 'Show error',
  review: 'Review',
};

const CHECK_LABELS: Record<string, string> = {
  success: 'Checks pass',
  failure: 'Checks fail',
  pending: 'Checks running',
};

function agentName(task: Task): string {
  return task.agentIds.map((id) => store.agents[id]?.def?.name).find(Boolean) ?? '';
}

function prNumber(url: string): string {
  return url.match(/\/pull\/(\d+)/)?.[1] ?? '';
}

/** Why the card is set aside: when its snooze ends, or that it is minimized. */
function setAsideLabel(task: Task): string {
  if (!isTaskBackgrounded(task.id)) return 'Minimized';
  if (task.snoozedUntil === undefined) return task.snoozedUntilCi ? 'Until CI finishes' : '';
  const until = new Date(task.snoozedUntil);
  return `Until ${until.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
}

function openBeside(task: Task): void {
  withViewTransition(() =>
    batch(() => {
      openBoardSidePanel();
      openTask(task);
    }),
  );
}

function cardMenuItems(task: Task): MoreMenuItem[] {
  const open = { label: 'Open', run: () => openBeside(task) };
  // A closing task is on its way out; setting it aside would race the teardown.
  if (task.closingStatus) return [open];
  // Snoozing a minimized task means nothing: its agents are already stopped.
  if (task.collapsed)
    return [
      open,
      {
        label: 'Restore (start agents)',
        icon: <UndoIcon size={14} />,
        run: () => uncollapseTask(task.id, { activate: false }),
      },
    ];
  return [open, ...laterMenuItems(task)];
}

/** Where a right-click opened the menu; a keyboard-opened one reports 0,0, so use the card. */
function menuPoint(event: MouseEvent): { x: number; y: number } {
  if (event.clientX || event.clientY) return { x: event.clientX, y: event.clientY };
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: rect.left, y: rect.bottom };
}

/** Offers another try at a close whose teardown failed; the error is the label's tooltip. */
function CloseFailed(props: { task: Task }) {
  return (
    <div class="task-board-ask">
      <span class="task-board-ask-label" title={props.task.closingError}>
        Close failed
      </span>
      <button
        type="button"
        class="task-board-act"
        onClick={() => void retryCloseTask(props.task.id)}
      >
        Retry
      </button>
    </div>
  );
}

function CardMeta(props: { task: Task; since: number | undefined; waiting: boolean }) {
  const project = () => getProject(props.task.projectId);
  return (
    <div class="task-board-meta">
      <Show when={project()}>
        {(p) => (
          <span class="task-board-project">
            <i style={{ background: p().color }} aria-hidden="true" />
            <span>{p().name}</span>
          </span>
        )}
      </Show>
      {/* Names the cause of a stopped card's spinner in the agent's slot, so the row never reflows. */}
      <Show
        when={getTaskAttentionState(props.task.id) === 'shell_busy'}
        fallback={<span class="task-board-agent">{agentName(props.task)}</span>}
      >
        <span class="task-board-agent" title={agentName(props.task)}>
          Terminal busy
        </span>
      </Show>
      <Show when={props.since}>
        {(since) => (
          // The card's "Needs input" row already says it waits; the age says how long.
          <span class="task-board-age" title={props.waiting ? 'Waiting for an answer' : undefined}>
            {formatRelativeAge(since(), kanbanNow())}
          </span>
        )}
      </Show>
    </div>
  );
}

function CardPr(props: { taskId: string; url: string }) {
  const checks = () => getPrChecks(props.taskId)?.overall;
  const label = () => CHECK_LABELS[checks() ?? ''] ?? '';
  return (
    <div class="task-board-row">
      <button
        type="button"
        class="task-board-chip"
        classList={{ failure: checks() === 'failure' }}
        title="Open pull request"
        onClick={() => void invoke(IPC.ShellOpenExternal, { url: props.url })}
      >
        PR #{prNumber(props.url)}
      </button>
      <span classList={{ 'task-board-fail': checks() === 'failure' }}>{label()}</span>
    </div>
  );
}

/** One task on the all-tasks board; clicking anywhere opens it beside the board. */
export function TaskBoardCard(props: { task: Task; lane: BoardLaneId }) {
  const state = createMemo(() => boardTaskState(props.task));
  const activity = createMemo(() => activityLine(props.task));
  // activityLine falls back to the agent's name, which the meta row already
  // shows; the branch says more and keeps the line from standing empty.
  const fromAgent = () => !activity().text || activity().text === agentName(props.task);
  const closing = () =>
    props.task.closingStatus === 'closing' || props.task.closingStatus === 'removing';
  const activityText = () => {
    if (closing()) return 'Closing…';
    return fromAgent() ? props.task.branchName : activity().text;
  };
  const shown = () => store.boardPeek && store.activeTaskId === props.task.id;
  const question = () => getTaskOpenQuestion(props.task.id);
  const ask = () =>
    props.lane === 'needs' && !props.task.closingStatus ? ASK_ACTION[state()] : undefined;
  const [menuAt, setMenuAt] = createSignal<{ x: number; y: number }>();
  return (
    <li
      class={`task-board-card state-${state()}`}
      data-board-task-id={props.task.id}
      classList={{
        failed: getPrChecks(props.task.id)?.overall === 'failure',
        'close-failed': props.task.closingStatus === 'error',
        shown: shown(),
        closing: closing(),
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuAt(menuPoint(event));
      }}
    >
      <button
        type="button"
        class="task-board-title"
        aria-current={shown() ? 'true' : undefined}
        title={props.task.name}
        onClick={() => openBeside(props.task)}
      >
        {/* Same glyph as the title-bar pills, which the board hides. */}
        <span class="task-board-glyph" aria-hidden="true">
          <StatusDot
            status={getTaskDotStatus(props.task.id)}
            taskId={props.task.id}
            size="sm"
            attention={getTaskAttentionState(props.task.id)}
          />
        </span>
        <span class="task-board-name">{props.task.name}</span>
      </button>
      <CardMeta
        task={props.task}
        since={question()?.since ?? activity().since}
        waiting={question() !== null}
      />
      {/* Always rendered so a task starting or stopping never changes the card's height. */}
      <p
        class="task-board-activity"
        classList={{ branch: fromAgent() && !closing() }}
        title={activityText()}
      >
        {activityText() || ' '}
      </p>
      <Show when={props.task.prUrl}>{(url) => <CardPr taskId={props.task.id} url={url()} />}</Show>
      <Show when={props.lane === 'snoozed' && setAsideLabel(props.task)}>
        {(label) => <p class="task-board-row">{label()}</p>}
      </Show>
      <Show when={props.task.closingStatus === 'error'}>
        <CloseFailed task={props.task} />
      </Show>
      <Show when={ask()}>
        {(action) => (
          <div class="task-board-ask">
            <span class="task-board-ask-label">{stateLabel(props.task, state())}</span>
            <button type="button" class="task-board-act" onClick={() => openBeside(props.task)}>
              {action()}
            </button>
          </div>
        )}
      </Show>
      <Show when={menuAt()}>
        {(at) => (
          <ContextMenu
            items={cardMenuItems(props.task)}
            at={at()}
            label={`Task ${props.task.name}`}
            onClose={() => setMenuAt(undefined)}
          />
        )}
      </Show>
    </li>
  );
}
