import { For, Show } from 'solid-js';
import { formatRelativeAge } from '../lib/relativeAge';
import { boardIdeas, ideasLaneShown, removeTaskIdea, startTaskIdea } from '../store/ideas';
import type { TaskIdea } from '../store/types';
import { BoardLane } from './board/BoardLane';
import { boardNow } from './board/task-state';
import { PlayIcon, TrashIcon } from './icons';
import { BoardProjectLabel } from './TaskBoardCard';
import { ideaCount } from './TaskBoardIdeas';

/** Hands the keyboard to the next idea (else the previous) before this one goes. */
function deleteIdea(id: string, from: HTMLElement): void {
  const card = from.closest('li');
  const neighbour = card?.nextElementSibling ?? card?.previousElementSibling;
  neighbour?.querySelector<HTMLElement>('.task-board-title')?.focus();
  removeTaskIdea(id);
}

function IdeaCard(props: { idea: TaskIdea }) {
  return (
    <li class="task-board-card task-board-idea" data-board-idea={props.idea.id}>
      <button
        type="button"
        class="task-board-title"
        title={props.idea.text}
        aria-label={`Start a task from idea: ${props.idea.text}`}
        onClick={() => startTaskIdea(props.idea.id)}
        onKeyDown={(e) => {
          if (e.key === 'Delete') deleteIdea(props.idea.id, e.currentTarget);
        }}
      >
        {/* A hollow ring where tasks show their state: not started yet. */}
        <span class="task-board-glyph" aria-hidden="true">
          <span class="task-board-idea-ring" />
        </span>
        <span class="task-board-name">{props.idea.text}</span>
      </button>
      <p class="task-board-meta">
        <BoardProjectLabel projectId={props.idea.projectId} />
        <span class="task-board-age" title="Noted">
          {formatRelativeAge(props.idea.createdAt, boardNow())}
        </span>
      </p>
      <div class="task-board-idea-actions">
        <button
          type="button"
          class="task-board-idea-action"
          title="Start a task from this idea"
          aria-label={`Start task: ${props.idea.text}`}
          onClick={() => startTaskIdea(props.idea.id)}
        >
          <PlayIcon size={12} />
        </button>
        <button
          type="button"
          class="task-board-idea-action"
          title="Delete idea"
          aria-label={`Delete idea: ${props.idea.text}`}
          onClick={(e) => deleteIdea(props.idea.id, e.currentTarget)}
        >
          <TrashIcon size={12} />
        </button>
      </div>
    </li>
  );
}

/**
 * Tasks not yet started, leftmost on the board while its toggle is on. Picking
 * one opens the new-task form prefilled; the idea goes once the task exists.
 */
export function IdeasLane(props: { query: string }) {
  const ideas = () => boardIdeas(props.query);
  return (
    <Show when={ideasLaneShown() && boardIdeas('').length > 0}>
      <BoardLane
        class="lane-ideas"
        aria-labelledby="task-board-lane-ideas"
        headingId="task-board-lane-ideas"
        title="Ideas"
        count={ideas().length}
        listLabel={ideaCount(ideas().length)}
      >
        <For each={ideas()}>{(idea) => <IdeaCard idea={idea} />}</For>
      </BoardLane>
    </Show>
  );
}
