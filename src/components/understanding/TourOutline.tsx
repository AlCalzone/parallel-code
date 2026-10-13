import { For, Show, createEffect, createSignal } from 'solid-js';
import { nodeTrail, type TourNode } from '../../lib/tour-tree';

/**
 * The tour as a quiet tree of card titles: where you are, what is above and
 * below, and every answer you dug into. Titles are claims, so the outline reads
 * as the tour's whole argument. The path to the card on screen is always open;
 * other branches open on request.
 */
export function TourOutline(props: {
  roots: TourNode[];
  currentId: string;
  /** The question in flight and the card it was asked on. */
  pending?: { question: string; nodeId: string } | null;
  onSelect: (id: string) => void;
}) {
  /** Branches the reader opened or closed against the default. */
  const [toggled, setToggled] = createSignal<ReadonlySet<string>>(new Set());
  const onPath = () => new Set(nodeTrail(props.roots, props.currentId).map((node) => node.id));
  const expanded = (node: TourNode) => onPath().has(node.id) !== toggled().has(node.id);
  let navRef: HTMLElement | undefined;

  function toggle(id: string): void {
    setToggled((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  // Moving to a card, from the outline or anywhere else, keeps its row in view.
  createEffect(() => {
    const id = props.currentId;
    const row = navRef?.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
    row?.scrollIntoView?.({ block: 'nearest' });
  });

  function Item(itemProps: { node: TourNode }) {
    const node = () => itemProps.node;
    const hasChildren = () => node().children.length > 0;
    const waiting = () => (props.pending?.nodeId === node().id ? props.pending.question : '');
    const open = () => expanded(node()) && (hasChildren() || waiting() !== '');
    return (
      <li class="tour-outline-item">
        <div class="tour-outline-row">
          <Show when={hasChildren()} fallback={<span class="tour-outline-twisty" />}>
            <button
              type="button"
              class="tour-outline-twisty"
              aria-label={`${expanded(node()) ? 'Collapse' : 'Expand'} ${node().card.title}`}
              aria-expanded={expanded(node())}
              onClick={() => toggle(node().id)}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                <path d="M2.5 1.5 5.5 4l-3 2.5" fill="none" stroke="currentColor" />
              </svg>
            </button>
          </Show>
          <button
            type="button"
            class="tour-outline-link"
            data-node-id={node().id}
            aria-current={node().id === props.currentId ? 'location' : undefined}
            title={node().card.title}
            onClick={() => props.onSelect(node().id)}
          >
            {node().card.title}
          </button>
        </div>
        <Show when={open()}>
          <ol class="tour-outline-list">
            <For each={node().children}>{(child) => <Item node={child} />}</For>
            <Show when={waiting()}>
              {(question) => (
                <li class="tour-outline-item tour-outline-pending" aria-busy="true">
                  <span class="inline-spinner" aria-hidden="true" />
                  <span title={question()}>Answering…</span>
                </li>
              )}
            </Show>
          </ol>
        </Show>
      </li>
    );
  }

  return (
    <nav class="tour-outline" aria-label="Tour outline" ref={navRef}>
      <ol class="tour-outline-list tour-outline-roots">
        <For each={props.roots}>{(node) => <Item node={node} />}</For>
      </ol>
    </nav>
  );
}
