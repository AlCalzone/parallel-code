import { For, Index, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { isTypingTarget } from '../lib/tour-keys';
import { withViewTransition } from '../lib/viewTransition';
import { store } from '../store/core';
import { boardSidePanelOpen, toggleBoardShowMinimized } from '../store/project-pages';
import {
  getTaskFocusedPanel,
  registerFocusFn,
  setTaskFocusedPanel,
  toggleNewTaskPanel,
  unregisterFocusFn,
} from '../store/store';
import { useKanbanClock } from './KanbanCard';
import { TaskBoardCard } from './TaskBoardCard';
import { useCardMotion } from './task-board-motion';
import { boardLanes, boardTasks, minimizedTaskCount, type BoardLane } from './task-board-lanes';
import {
  BOARD_KEY_MOVES,
  boardHasFocus,
  claimBoardFocus,
  focusBoardCard,
  focusBoardFilter,
  focusedBoardItem,
  moveBoardFocus,
} from './task-board-keys';
import './task-board.css';

function Lane(props: { lane: BoardLane }) {
  const headingId = () => `task-board-lane-${props.lane.id}`;
  return (
    <section class={`task-board-lane lane-${props.lane.id}`} aria-labelledby={headingId()}>
      <h3 id={headingId()} class="task-board-lane-title">
        {props.lane.title}
        <span class="task-board-count">{props.lane.tasks.length}</span>
      </h3>
      <ol class="task-board-cards">
        <For each={props.lane.tasks}>
          {(task) => <TaskBoardCard task={task} lane={props.lane.id} />}
        </For>
      </ol>
    </section>
  );
}

/** Snoozed work stays out of the way: a narrow rail until asked for. */
function SnoozedLane(props: { lane: BoardLane }) {
  const [open, setOpen] = createSignal(false);
  return (
    <Show
      when={open()}
      fallback={
        <button
          type="button"
          class="task-board-rail"
          title="Show snoozed tasks"
          onClick={(e) => {
            const lanes = e.currentTarget.parentElement;
            setOpen(true);
            // The rail is gone; keep the keyboard on what it opened.
            lanes?.querySelector<HTMLElement>('.lane-snoozed .task-board-title')?.focus();
          }}
        >
          <span class="task-board-rail-title">{props.lane.title}</span>
          <span class="task-board-count">{props.lane.tasks.length}</span>
        </button>
      }
    >
      <Lane lane={props.lane} />
    </Show>
  );
}

/**
 * Arrows and hjkl move between cards and up from the first row to the filter,
 * Home/End to a lane's ends, `/` to the filter.
 */
function onBoardKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
  if (e.key === '/') {
    e.preventDefault();
    focusBoardFilter();
    return;
  }
  const move = BOARD_KEY_MOVES[e.key];
  if (!move || !focusedBoardItem()) return;
  e.preventDefault();
  if (!moveBoardFocus(move) && move === 'up') focusBoardFilter();
}

/** The board takes the keyboard when it opens and hands it to the active task when it closes. */
function useBoardFocus(): void {
  // An empty board has no card to take the keyboard; its filter does instead.
  const focusBoard = () => {
    if (!focusBoardCard(store.activeTaskId)) focusBoardFilter();
  };
  onMount(() => {
    registerFocusFn('task-board', focusBoard);
    // A draft opened beside the board keeps its focus.
    if (!boardSidePanelOpen()) focusBoard();
  });
  onCleanup(() => {
    unregisterFocusFn('task-board', focusBoard);
    // Only when the board closed while it had the keyboard (focus falls to
    // body as its DOM goes). Hidden behind a project page, it stays open; a
    // sidebar click or a focus-mode expand has already placed focus.
    if (store.boardView || !(boardHasFocus() || document.activeElement === document.body)) return;
    queueMicrotask(() => {
      const id = store.activeTaskId;
      if (id && !store.boardView) setTaskFocusedPanel(id, getTaskFocusedPanel(id));
    });
  });
}

/** The workspace's board view: every open task, in lanes by what it needs. */
export function TaskBoard() {
  const [query, setQuery] = createSignal('');
  const tasks = createMemo(() => boardTasks(query()));
  const lanes = createMemo(() => boardLanes(tasks()));
  let lanesEl: HTMLDivElement | undefined;
  useCardMotion(
    () => lanesEl,
    () => lanes(),
  );
  onCleanup(useKanbanClock());
  useBoardFocus();
  return (
    <section
      class="task-board"
      aria-labelledby="task-board-title"
      onKeyDown={onBoardKeyDown}
      onFocusIn={claimBoardFocus}
    >
      <header class="task-board-header">
        <h2 id="task-board-title">All tasks</h2>
        <span class="task-board-total">{tasks().length}</span>
        <input
          type="search"
          class="task-board-search"
          placeholder="Filter tasks"
          aria-label="Filter tasks"
          aria-keyshortcuts="/"
          title="Filter tasks (/). Down goes to the cards, Enter opens the first."
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // A second Escape returns to the cards rather than closing the board.
              e.stopPropagation();
              if (query()) setQuery('');
              else focusBoardCard(store.activeTaskId);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              focusBoardCard(null);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget
                .closest('.task-board')
                ?.querySelector<HTMLElement>('.task-board-lane .task-board-title')
                ?.click();
            }
          }}
        />
        {/* Always there, even with none minimized, so the header never shifts. */}
        <button
          type="button"
          class="task-board-new task-board-minimized"
          aria-pressed={store.boardShowMinimized}
          title={store.boardShowMinimized ? 'Hide minimized tasks' : 'Show minimized tasks too'}
          onClick={toggleBoardShowMinimized}
        >
          Minimized <span class="task-board-count">{minimizedTaskCount()}</span>
        </button>
        <button
          type="button"
          class="task-board-new"
          onClick={() => withViewTransition(() => toggleNewTaskPanel(true))}
        >
          + New task
        </button>
      </header>
      <div class="task-board-lanes" ref={lanesEl}>
        <Show when={tasks().length === 0}>
          <p class="task-board-empty">
            {query().trim() ? `No tasks match “${query().trim()}”` : 'No open tasks'}
          </p>
        </Show>
        {/* Index, not For: lanes are rebuilt on every change but keep their place,
            so a lane's cards and the snoozed rail's open state survive updates. */}
        <Index each={lanes()}>
          {(lane) => (
            <Show when={lane().id === 'snoozed'} fallback={<Lane lane={lane()} />}>
              <Show when={lane().tasks.length > 0}>
                <SnoozedLane lane={lane()} />
              </Show>
            </Show>
          )}
        </Index>
      </div>
    </section>
  );
}
