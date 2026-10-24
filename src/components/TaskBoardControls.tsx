import { Show } from 'solid-js';
import { withViewTransition } from '../lib/viewTransition';
import { store } from '../store/core';
import { openKanban, openPlanView, planViewProjectId } from '../store/kanban';
import { toggleNewTaskPanel } from '../store/navigation';
import { boardShown } from '../store/project-pages';
import { PlanIcon } from './icons';
import { TaskProjectFilter } from './TaskProjectFilter';
import { ToggleButton, ToggleGroup } from './ToggleGroup';
import { focusBoardCard } from './task-board-keys';
import './task-board.css';

/** On while the plan shows, off for the running tasks. */
function PlanToggle() {
  const projectName = () => store.projects.find((p) => p.id === planViewProjectId())?.name;
  const open = () => !!store.kanbanProjectId;
  return (
    <ToggleGroup label="Board page">
      {/* Disabled rather than hidden for all projects, so the buttons never shift. */}
      <ToggleButton
        pressed={open()}
        disabled={!open() && !projectName()}
        title={
          open()
            ? 'Back to the running tasks'
            : projectName()
              ? `Planned work in ${projectName()}`
              : 'Select a project to see its plan'
        }
        onClick={() => withViewTransition(() => (open() ? openKanban(null) : openPlanView()))}
      >
        <PlanIcon size={14} />
        Plan
      </ToggleButton>
    </ToggleGroup>
  );
}

/**
 * The board's actions in the title bar's middle slot, which the task pills
 * leave empty while the board shows: a new task, the sidebar's project filter
 * while the sidebar is hidden, and the plan toggle for that project. The text
 * filter and each page's own tools sit in the board's heading row.
 */
export function TaskBoardControls() {
  return (
    <Show when={boardShown()}>
      <div
        class="task-board-controls"
        role="group"
        aria-label="Board"
        onDblClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          class="task-board-new"
          onClick={() => withViewTransition(() => toggleNewTaskPanel(true))}
        >
          + New task
        </button>
        {/* The plan follows the selected project, so it needs a picker in reach. */}
        <Show when={!store.sidebarVisible}>
          {/* Board keys only work from a card, so hand the keyboard back after a pick. */}
          <TaskProjectFilter hideLabel onPick={() => focusBoardCard(store.activeTaskId)} />
        </Show>
        <PlanToggle />
      </div>
    </Show>
  );
}
