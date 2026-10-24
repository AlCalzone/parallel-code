import { createSignal } from 'solid-js';
import { store } from '../store/core';
import { SearchIcon } from './icons';
import { focusBoardCard } from './task-board-keys';
import './task-board.css';

// One query for both boards, so it survives switching between running tasks and the plan.
const [boardQuery, setBoardQuery] = createSignal('');
export { boardQuery, setBoardQuery };

/**
 * The text filter in a board's heading row, an icon button until used.
 * `what` names what it searches: running tasks or the plan's cards.
 */
export function BoardSearch(props: { what: string }) {
  return (
    <span class="task-board-search-box">
      <SearchIcon size={14} />
      <input
        type="search"
        class="task-board-search"
        placeholder={`Filter ${props.what}`}
        aria-label={`Filter ${props.what}`}
        aria-keyshortcuts="/"
        title={`Filter ${props.what} (/). Down goes to the cards, Enter opens the first.`}
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
            document
              .querySelector<HTMLElement>('.task-board-lane:not(.lane-ideas) .task-board-title')
              ?.click();
          }
        }}
      />
    </span>
  );
}
