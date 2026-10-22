import { Show, createSignal } from 'solid-js';
import { withViewTransition } from '../lib/viewTransition';
import { store } from '../store/core';
import { boardShown } from '../store/project-pages';
import { toggleNewTaskPanel } from '../store/store';
import { TaskProjectFilter } from './TaskProjectFilter';
import { claimBoardFocus, focusBoardCard } from './task-board-keys';
import './task-board.css';

// Shared with the board below: the controls live in the title bar, the cards don't.
const [boardQuery, setBoardQuery] = createSignal('');
export { boardQuery, setBoardQuery };

/**
 * The board's project and text filters and new-task action, in the title bar's middle slot that the
 * task pills leave empty while the board shows.
 */
export function TaskBoardControls() {
  return (
    <Show when={boardShown()}>
      <div
        class="task-board-controls"
        role="group"
        aria-label="Board controls"
        onFocusIn={claimBoardFocus}
        onDblClick={(event) => event.stopPropagation()}
      >
        {/* Board keys only work from a card, so hand the keyboard back after a pick. */}
        <TaskProjectFilter hideLabel onPick={() => focusBoardCard(store.activeTaskId)} />
        <input
          type="search"
          class="task-board-search"
          placeholder="Filter tasks"
          aria-label="Filter tasks"
          aria-keyshortcuts="/"
          title="Filter tasks (/). Down goes to the cards, Enter opens the first."
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
