import { Show, createSignal } from 'solid-js';
import { withViewTransition } from '../lib/viewTransition';
import { store } from '../store/core';
import { openKanban, showPlanTasks } from '../store/kanban';
import { boardShown } from '../store/project-pages';
import { isDocumentProject, isProjectMissing } from '../store/projects';
import { toggleNewTaskPanel } from '../store/store';
import { taskProjectFilter } from '../store/task-project-filter';
import { PlanIcon } from './icons';
import { TaskProjectFilter } from './TaskProjectFilter';
import { claimBoardFocus, focusBoardCard, releaseBoardFocus } from './task-board-keys';
import './task-board.css';

// Shared with the board below: the controls live in the title bar, the cards don't.
const [boardQuery, setBoardQuery] = createSignal('');
export { boardQuery, setBoardQuery };

/** The filtered project's plan, one click away from its running tasks. */
function PlanLink() {
  const project = () => store.projects.find((p) => p.id === taskProjectFilter());
  const plannable = () => {
    const p = project();
    return p && !isDocumentProject(p) && !isProjectMissing(p.id) ? p : undefined;
  };
  return (
    <Show when={plannable()}>
      {(p) => (
        <button
          type="button"
          class="task-board-new task-board-plan"
          title={`Plan for ${p().name}`}
          onClick={() => withViewTransition(() => openKanban(p().id))}
        >
          <PlanIcon size={14} /> Plan
        </button>
      )}
    </Show>
  );
}

/**
 * The board's project and text filters and new-task action, in the title bar's
 * middle slot that the task pills leave empty while the board shows. On a
 * project's plan, a way to that project's running tasks replaces the project
 * filter, and the text filter searches the cards.
 */
export function TaskBoardControls() {
  // Named apart on purpose: the plan holds planned work, the board running tasks.
  const what = () => (store.kanbanProjectId ? 'plan' : 'running tasks');
  const planProject = () => store.projects.find((p) => p.id === store.kanbanProjectId)?.name;
  return (
    <Show when={boardShown()}>
      <div
        class="task-board-controls"
        role="group"
        aria-label="Board controls"
        onFocusIn={claimBoardFocus}
        onFocusOut={releaseBoardFocus}
        onDblClick={(event) => event.stopPropagation()}
      >
        <Show
          when={store.kanbanProjectId}
          fallback={
            <>
              {/* Board keys only work from a card, so hand the keyboard back after a pick. */}
              <TaskProjectFilter hideLabel onPick={() => focusBoardCard(store.activeTaskId)} />
              <PlanLink />
            </>
          }
        >
          <button
            type="button"
            class="task-board-new"
            title={`Running Parallel Code tasks in ${planProject() ?? 'this project'} (Esc)`}
            onClick={() => withViewTransition(showPlanTasks)}
          >
            Running tasks
          </button>
        </Show>
        <input
          type="search"
          class="task-board-search"
          placeholder={`Filter ${what()}`}
          aria-label={`Filter ${what()}`}
          aria-keyshortcuts="/"
          title={`Filter ${what()} (/). Down goes to the cards, Enter opens the first.`}
          value={boardQuery()}
          onInput={(e) => setBoardQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // A second Escape returns to the cards rather than closing the board.
              e.stopPropagation();
              if (boardQuery()) setBoardQuery('');
              else focusBoardCard(store.activeTaskId);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              focusBoardCard(null);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              document.querySelector<HTMLElement>('.task-board-lane .task-board-title')?.click();
            }
          }}
        />
        <button
          type="button"
          class="task-board-new"
          onClick={() => withViewTransition(() => toggleNewTaskPanel(true))}
        >
          + New task
        </button>
      </div>
    </Show>
  );
}
