import { For, Index, Show, createMemo, createSignal, onCleanup } from 'solid-js';
import { withViewTransition } from '../lib/viewTransition';
import { toggleNewTaskPanel } from '../store/store';
import { useKanbanClock } from './KanbanCard';
import { TaskBoardCard } from './TaskBoardCard';
import { boardLanes, boardTasks, type BoardLane } from './task-board-lanes';
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
          onClick={() => setOpen(true)}
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

/** The workspace's board view: every open task, in lanes by what it needs. */
export function TaskBoard() {
  const [query, setQuery] = createSignal('');
  const tasks = createMemo(() => boardTasks(query()));
  const lanes = createMemo(() => boardLanes(tasks()));
  onCleanup(useKanbanClock());
  return (
    <section class="task-board" aria-labelledby="task-board-title">
      <header class="task-board-header">
        <h2 id="task-board-title">All tasks</h2>
        <span class="task-board-total">{tasks().length}</span>
        <input
          type="search"
          class="task-board-search"
          placeholder="Filter tasks"
          aria-label="Filter tasks"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query()) {
              e.stopPropagation();
              setQuery('');
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
      </header>
      <div class="task-board-lanes">
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
