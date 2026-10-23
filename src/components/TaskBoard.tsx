import { For, Index, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { isTypingTarget } from '../lib/tour-keys';
import { store } from '../store/core';
import { boardSidePanelOpen } from '../store/project-pages';
import {
  getTaskFocusedPanel,
  registerFocusFn,
  setTaskFocusedPanel,
  unregisterFocusFn,
} from '../store/store';
import { BoardLane, BoardRail } from './board/BoardLane';
import { useBoardClock } from './board/task-state';
import { TaskBoardCard } from './TaskBoardCard';
import { forgetWorkingHolds } from './task-board-hold';
import { boardQuery, setBoardQuery } from './TaskBoardControls';
import { useCardMotion } from './task-board-motion';
import { boardLanes, boardTasks, type BoardLane as LaneData } from './task-board-lanes';
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

function Lane(props: { lane: LaneData }) {
  const headingId = () => `task-board-lane-${props.lane.id}`;
  return (
    <BoardLane
      class={`lane-${props.lane.id}`}
      aria-labelledby={headingId()}
      headingId={headingId()}
      title={props.lane.title}
      count={props.lane.tasks.length}
    >
      <For each={props.lane.tasks}>
        {(task) => <TaskBoardCard task={task} lane={props.lane.id} />}
      </For>
    </BoardLane>
  );
}

/** Snoozed and minimized work stays out of the way: a narrow rail until asked for. */
function SnoozedLane(props: { lane: LaneData }) {
  const [open, setOpen] = createSignal(false);
  return (
    <Show
      when={open()}
      fallback={
        <BoardRail
          title="Show snoozed and minimized tasks"
          label={props.lane.title}
          count={props.lane.tasks.length}
          onClick={(e) => {
            const lanes = e.currentTarget.parentElement;
            setOpen(true);
            // The rail is gone; keep the keyboard on what it opened.
            lanes?.querySelector<HTMLElement>('.lane-snoozed .task-board-title')?.focus();
          }}
        />
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

/** The workspace's board view: running tasks, not planned work, in lanes by what they need. */
export function TaskBoard() {
  const tasks = createMemo(() => boardTasks(boardQuery()));
  const lanes = createMemo(() => boardLanes(tasks()));
  let lanesEl: HTMLDivElement | undefined;
  useCardMotion(
    () => lanesEl,
    () => lanes(),
  );
  onCleanup(useBoardClock());
  onCleanup(forgetWorkingHolds);
  // A reopened board starts unfiltered, as when the filter lived inside it.
  onCleanup(() => setBoardQuery(''));
  useBoardFocus();
  return (
    <section
      class="task-board"
      aria-labelledby="task-board-title"
      onKeyDown={onBoardKeyDown}
      onFocusIn={claimBoardFocus}
    >
      {/* The filter and actions sit in the title bar; see TaskBoardControls. */}
      <h2 id="task-board-title" class="dialog-sr-only">
        Running tasks
      </h2>
      <div class="task-board-lanes" ref={lanesEl}>
        <Show when={tasks().length === 0}>
          <p class="task-board-empty">
            {boardQuery().trim() ? `No tasks match “${boardQuery().trim()}”` : 'No running tasks'}
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
