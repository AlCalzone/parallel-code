import { Show, createMemo, createSignal } from 'solid-js';
import { IPC } from '../../electron/ipc/channels';
import { invoke } from '../lib/ipc';
import { formatRelativeAge } from '../lib/relativeAge';
import { isTaskBackgrounded } from '../store/background-tasks';
import { store } from '../store/core';
import { getPrChecks } from '../store/pr-checks-state';
import { getProject } from '../store/projects';
import { ProjectSwatch } from './ProjectSwatch';
import { getTaskAttentionState, getTaskOpenQuestion } from '../store/taskStatus';
import { setPendingAction } from '../store/focus';
import { isLandedTaskState } from '../store/landing';
import { retryCloseTask, uncollapseTask } from '../store/tasks';
import type { Task } from '../store/types';
import { activityLine, agentName, boardNow, stateLabel } from './board/task-state';
import { ASK_ACTION, AskRow, TaskGlyph, TaskPr, openBeside } from './board/TaskStatus';
import { ContextMenu, type MoreMenuItem } from './chat/MoreMenu';
import { boardTaskState, type BoardLaneId } from './task-board-lanes';
import { laterMenuItems } from './task-later-menu';
import { CloseTaskDialog } from './CloseTaskDialog';
import { CloseIcon, ExternalLinkIcon, GitMergeIcon, UndoIcon } from './icons';

/** Why the card is set aside: when its snooze ends, or that it is minimized. */
function setAsideLabel(task: Task): string {
  if (!isTaskBackgrounded(task.id)) return 'Minimized';
  if (task.snoozedUntil === undefined) return task.snoozedUntilCi ? 'Until CI finishes' : '';
  const until = new Date(task.snoozedUntil);
  return `Until ${until.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
}

/** Ending actions: Finish runs in the task's panel, so it opens the task first; Close confirms in place. */
function endMenuItems(task: Task, confirmClose: () => void): MoreMenuItem[] {
  const canFinish = task.gitIsolation === 'worktree' && !isLandedTaskState(task.landingState);
  // Finishing usually ends the task, so the menu pre-checks closing it. Where the Finish
  // dialog cannot (imported worktrees, coordinated tasks), it offers a plain Finish.
  const closeAfter = !task.externalWorktree && !task.delegationParent && !task.coordinatorMode;
  const finish = {
    label: closeAfter ? 'Finish and close' : 'Finish',
    title: closeAfter
      ? 'Opens Finish with deleting the branch and worktree after merge checked.'
      : undefined,
    icon: <GitMergeIcon size={14} />,
    run: () => {
      openBeside(task);
      setPendingAction({ type: 'finish', taskId: task.id, closeAfter });
    },
  };
  return [
    ...(canFinish ? [finish] : []),
    { label: 'Close', icon: <CloseIcon size={14} />, run: confirmClose },
  ];
}

function cardMenuItems(task: Task, confirmClose: () => void): MoreMenuItem[] {
  // Moving the panel lives here rather than on the panel, which rarely needs it.
  const opens = [
    { label: 'Open', run: () => openBeside(task) },
    {
      label: `Open on the ${store.boardSidePanelLeft ? 'right' : 'left'}`,
      run: () => openBeside(task, true),
    },
    ...(task.prUrl
      ? [
          {
            label: 'Open PR in browser',
            icon: <ExternalLinkIcon size={14} />,
            run: () => void invoke(IPC.ShellOpenExternal, { url: task.prUrl }),
          },
        ]
      : []),
  ];
  // A closing task is on its way out; setting it aside would race the teardown.
  if (task.closingStatus) return opens;
  // Snoozing a minimized task means nothing: its agents are already stopped.
  if (task.collapsed)
    return [
      ...opens,
      {
        label: 'Restore (start agents)',
        icon: <UndoIcon size={14} />,
        run: () => uncollapseTask(task.id, { activate: false }),
      },
      ...endMenuItems(task, confirmClose),
    ];
  return [...opens, ...laterMenuItems(task), ...endMenuItems(task, confirmClose)];
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
          <span class="task-board-project" title={p().name}>
            <Show
              when={p().icon}
              fallback={<i style={{ background: p().color }} aria-hidden="true" />}
            >
              {(icon) => <ProjectSwatch color={p().color} icon={icon()} size={8} />}
            </Show>
            <span>{p().name}</span>
          </span>
        )}
      </Show>
      {/* Names the cause of a stopped card's spinner in the agent's slot, so the row never reflows. */}
      <Show
        when={getTaskAttentionState(props.task.id) === 'shell_busy'}
        fallback={<span class="task-board-agent">{agentName(props.task)}</span>}
      >
        <span class="task-board-agent busy" title={agentName(props.task)}>
          Terminal busy
        </span>
      </Show>
      <Show when={props.since}>
        {(since) => (
          // The card's "Needs input" row already says it waits; the age says how long.
          <span class="task-board-age" title={props.waiting ? 'Waiting for an answer' : undefined}>
            {formatRelativeAge(since(), boardNow())}
          </span>
        )}
      </Show>
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
  const closeErrorText = () =>
    props.task.closingStatus === 'error' ? props.task.closingError : undefined;
  const activityText = () => {
    if (closing()) return 'Closing…';
    // Spelled out on the card, not only in a tooltip, so keyboard users see why.
    const closeError = closeErrorText();
    if (closeError) return closeError;
    return fromAgent() ? props.task.branchName : activity().text;
  };
  const shown = () => store.boardPeek && store.activeTaskId === props.task.id;
  const question = () => getTaskOpenQuestion(props.task.id);
  const ask = () =>
    props.lane === 'needs' && !props.task.closingStatus ? ASK_ACTION[state()] : undefined;
  const [menuAt, setMenuAt] = createSignal<{ x: number; y: number }>();
  const [confirmingClose, setConfirmingClose] = createSignal(false);
  return (
    <li
      class={`task-board-card state-${state()}`}
      data-board-card={props.task.id}
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
        <TaskGlyph taskId={props.task.id} />
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
        classList={{ branch: fromAgent() && !closing() && !closeErrorText() }}
        title={activityText()}
      >
        {activityText() || ' '}
      </p>
      <Show when={props.task.prUrl}>{(url) => <TaskPr taskId={props.task.id} url={url()} />}</Show>
      <Show when={props.lane === 'snoozed' && setAsideLabel(props.task)}>
        {(label) => <p class="task-board-row">{label()}</p>}
      </Show>
      <Show when={props.task.closingStatus === 'error'}>
        <CloseFailed task={props.task} />
      </Show>
      <Show when={ask()}>
        {(action) => (
          <AskRow
            label={stateLabel(props.task, state())}
            action={action()}
            onAct={() => openBeside(props.task)}
          />
        )}
      </Show>
      <Show when={menuAt()}>
        {(at) => (
          <ContextMenu
            items={cardMenuItems(props.task, () => setConfirmingClose(true))}
            at={at()}
            label={`Task ${props.task.name}`}
            onClose={() => setMenuAt(undefined)}
          />
        )}
      </Show>
      <CloseTaskDialog
        open={confirmingClose()}
        task={props.task}
        onDone={() => setConfirmingClose(false)}
      />
    </li>
  );
}
