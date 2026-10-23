import { Match, Show, Switch, batch } from 'solid-js';
import { IPC } from '../../../electron/ipc/channels';
import { invoke } from '../../lib/ipc';
import { withViewTransition } from '../../lib/viewTransition';
import { getPrChecks, prBoardStatus } from '../../store/pr-checks-state';
import { store } from '../../store/core';
import { toggleNewTaskPanel } from '../../store/navigation';
import {
  boardSidePanelOpen,
  openBoardSidePanel,
  toggleBoardSidePanelSide,
} from '../../store/project-pages';
import { setOpenDraftAside } from '../../store/task-creation';
import { getTaskAttentionState, getTaskDotStatus } from '../../store/taskStatus';
import type { Task } from '../../store/types';
import { BabysitButton } from '../BabysitButton';
import { CheckIcon, GitMergeIcon } from '../icons';
import { StatusDot } from '../StatusDot';
import { openTask, type CardTaskState } from './task-state';

/** The button label for a task that waits on you, by its state. */
export const ASK_ACTION: Partial<Record<CardTaskState, string>> = {
  needs_input: 'Answer',
  error: 'Show error',
  review: 'Review',
};

function prNumber(url: string): string {
  return url.match(/\/pull\/(\d+)/)?.[1] ?? '';
}

/** Opens the task in the board's side panel, moving the panel across first when asked. */
export function openBeside(task: Task, otherSide = false, panel?: string | null): void {
  // Only a panel that stays put swaps its task; opening or moving it has its own motion.
  const switching = !otherSide && boardSidePanelOpen() && store.activeTaskId !== task.id;
  withViewTransition(
    () =>
      batch(() => {
        // The draft holds the side panel, so it steps aside and returns on the next New Task.
        if (store.showNewTaskPanel) {
          setOpenDraftAside();
          toggleNewTaskPanel(false);
        }
        if (otherSide) toggleBoardSidePanelSide();
        openBoardSidePanel();
        openTask(task, panel);
      }),
    switching ? ['task-switch'] : [],
  );
}

/** The task's status dot, the same glyph as the title-bar pills, which the board hides. */
export function TaskGlyph(props: { taskId: string }) {
  return (
    <span class="task-board-glyph" aria-hidden="true">
      <StatusDot
        status={getTaskDotStatus(props.taskId)}
        taskId={props.taskId}
        size="sm"
        attention={getTaskAttentionState(props.taskId)}
      />
    </span>
  );
}

/** The task's pull request and how its checks are doing. */
export function TaskPr(props: { taskId: string; url: string }) {
  const status = () => prBoardStatus(getPrChecks(props.taskId));
  const kind = () => status()?.kind;
  return (
    <div class="task-board-row">
      <button
        type="button"
        class="task-board-chip task-board-pr"
        classList={{
          failure: kind() === 'failed',
          ready: kind() === 'ready',
          merged: kind() === 'merged',
        }}
        title="Open pull request"
        onClick={() => void invoke(IPC.ShellOpenExternal, { url: props.url })}
      >
        <Switch>
          <Match when={kind() === 'ready'}>
            <CheckIcon size={11} />
          </Match>
          <Match when={kind() === 'merged'}>
            <GitMergeIcon size={11} />
          </Match>
        </Switch>
        PR #{prNumber(props.url)}
      </button>
      <span class={`task-board-pr-status ${kind() ?? ''}`}>{status()?.label ?? ''}</span>
      <Show when={getPrChecks(props.taskId) && !getPrChecks(props.taskId)?.merged}>
        <BabysitButton taskId={props.taskId} class="task-board-chip" />
      </Show>
    </div>
  );
}

/** What the task waits for, and the button that goes there. */
export function AskRow(props: { label: string; action: string; onAct: () => void }) {
  return (
    <div class="task-board-ask">
      <span class="task-board-ask-label">{props.label}</span>
      <button type="button" class="task-board-act" onClick={() => props.onAct()}>
        {props.action}
      </button>
    </div>
  );
}
