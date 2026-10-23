import { Show, createSignal, type JSX } from 'solid-js';
import { IPC } from '../../electron/ipc/channels';
import { invoke } from '../lib/ipc';
import { setPendingAction } from '../store/focus';
import { isLandedTaskState } from '../store/landing';
import { uncollapseTask } from '../store/tasks';
import type { Task } from '../store/types';
import { ContextMenu, type MoreMenuItem } from './chat/MoreMenu';
import { CloseTaskDialog } from './CloseTaskDialog';
import { CloseIcon, ExternalLinkIcon, GitMergeIcon, UndoIcon } from './icons';
import { laterMenuItems } from './task-later-menu';

interface TaskMenuActions {
  /** Shows the task where it was right-clicked; Finish runs in the task's panel, so it opens it first. */
  open: () => void;
  confirmClose: () => void;
}

/** Ending actions: Finish opens the task with its dialog requested; Close confirms in place. */
function endMenuItems(task: Task, actions: TaskMenuActions): MoreMenuItem[] {
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
      actions.open();
      setPendingAction({ type: 'finish', taskId: task.id, closeAfter });
    },
  };
  return [
    ...(canFinish ? [finish] : []),
    { label: 'Close', icon: <CloseIcon size={14} />, run: actions.confirmClose },
  ];
}

function taskMenuItems(task: Task, actions: TaskMenuActions): MoreMenuItem[] {
  const pr: MoreMenuItem[] = task.prUrl
    ? [
        {
          label: 'Open PR in browser',
          icon: <ExternalLinkIcon size={14} />,
          run: () => void invoke(IPC.ShellOpenExternal, { url: task.prUrl }),
        },
      ]
    : [];
  // A closing task is on its way out; setting it aside would race the teardown.
  if (task.closingStatus) return pr;
  // Snoozing a minimized task means nothing: its agents are already stopped.
  const setAside: MoreMenuItem[] = task.collapsed
    ? [
        {
          label: 'Restore (start agents)',
          icon: <UndoIcon size={14} />,
          run: () => uncollapseTask(task.id, { activate: false }),
        },
      ]
    : laterMenuItems(task);
  return [...pr, ...setAside, ...endMenuItems(task, actions)];
}

const stop = (event: Event) => event.stopPropagation();

/** Where a right-click opened the menu; a keyboard-opened one reports 0,0, so use the element. */
function menuPoint(event: MouseEvent): { x: number; y: number } {
  if (event.clientX || event.clientY) return { x: event.clientX, y: event.clientY };
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: rect.left, y: rect.bottom };
}

/**
 * A task's right-click menu: PR link, set-aside actions, Finish and Close.
 * `leading` adds items above them, such as the board's ways to open the task.
 */
export function createTaskContextMenu(options: {
  task: () => Task;
  open: () => void;
  leading?: () => MoreMenuItem[];
}): { onContextMenu: (event: MouseEvent) => void; Menu: () => JSX.Element } {
  const [at, setAt] = createSignal<{ x: number; y: number }>();
  // Outlives the menu, which closes as soon as Close is picked.
  const [confirmingClose, setConfirmingClose] = createSignal(false);
  const actions = { open: options.open, confirmClose: () => setConfirmingClose(true) };
  return {
    onContextMenu: (event) => {
      event.preventDefault();
      setAt(menuPoint(event));
    },
    // Solid forwards delegated events from portals to the DOM around them, so the
    // wrapper keeps menu and dialog clicks and keys from also activating the row.
    Menu: () => (
      <div style={{ display: 'contents' }} onClick={stop} onKeyDown={stop} onContextMenu={stop}>
        <Show when={at()}>
          {(point) => (
            <ContextMenu
              items={[...(options.leading?.() ?? []), ...taskMenuItems(options.task(), actions)]}
              at={point()}
              label={`Task ${options.task().name}`}
              onClose={() => setAt(undefined)}
            />
          )}
        </Show>
        <CloseTaskDialog
          open={confirmingClose()}
          task={options.task()}
          onDone={() => setConfirmingClose(false)}
        />
      </div>
    ),
  };
}
