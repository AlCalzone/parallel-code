/**
 * Draws a KANBAN.md board as a mind map: board title → columns → cards →
 * checklist items, with `depends:` lines as "waits for" links. The map is
 * derived on every render and never stored; KANBAN.md stays the only source.
 */
import type { MapData, MapLink, MapNode } from '../graph/model';
import {
  cardChecklist,
  cardSummary,
  findCardByTitle,
  isArchiveColumn,
  isCardDone,
  type KanbanBoard,
  type KanbanCardRef,
} from './kanban';

export interface KanbanMap {
  map: MapData;
  /** The board card each card node stands for. */
  cards: ReadonlyMap<string, KanbanCardRef>;
  /** Done cards and checked checklist items. */
  faded: ReadonlySet<string>;
  /** Branches that start folded: archive columns and cards with a checklist. */
  folded: ReadonlySet<string>;
}

export const KANBAN_MAP_ROOT = 'board';

/** FNV-1a: short, stable and within the graph ID pattern. */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(36);
}

/**
 * IDs come from titles rather than positions, so moving or reordering a card
 * keeps its node and only truly new cards get the canvas's arrival cue.
 */
function idMaker(): (prefix: string, key: string) => string {
  const used = new Set<string>();
  return (prefix, key) => {
    const base = `${prefix}-${hash(key)}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
}

/** The card links: each card that waits for another points at it. */
function dependencyLinks(board: KanbanBoard, refs: ReadonlyMap<string, KanbanCardRef>): MapLink[] {
  const ids = new Map([...refs].map(([id, ref]) => [`${ref.column}:${ref.card}`, id]));
  const links: MapLink[] = [];
  for (const [source, ref] of refs) {
    for (const title of board.columns[ref.column].cards[ref.card].depends) {
      const found = findCardByTitle(board, title);
      const target = found && ids.get(`${found.column}:${found.card}`);
      // A card may name the same dependency twice; draw it once.
      if (
        !target ||
        target === source ||
        links.some((l) => l.target === target && l.source === source)
      )
        continue;
      links.push({ id: `dep-${source}-${target}`, source, target, kind: 'waits for' });
    }
  }
  return links;
}

/**
 * The board as map data. `shown` lists the card indexes to include per column,
 * so the board's search and "Needs you" filters apply to the map too; omit it
 * to include every card.
 */
export function boardToMap(board: KanbanBoard, shown?: readonly (readonly number[])[]): KanbanMap {
  const id = idMaker();
  const records: MapNode[] = [
    { id: KANBAN_MAP_ROOT, title: board.title || 'Plan', detail: board.preamble.trim() },
  ];
  const cards = new Map<string, KanbanCardRef>();
  const faded = new Set<string>();
  const folded = new Set<string>();
  board.columns.forEach((column, columnIndex) => {
    const columnId = id('col', column.title);
    records.push({
      id: columnId,
      parent: KANBAN_MAP_ROOT,
      title: column.title,
      detail: column.notes.trim(),
    });
    if (isArchiveColumn(column.title)) folded.add(columnId);
    for (const cardIndex of shown?.[columnIndex] ?? column.cards.map((_, i) => i)) {
      const card = column.cards[cardIndex];
      if (!card) continue;
      const ref = { column: columnIndex, card: cardIndex };
      const cardId = id('card', card.title);
      records.push({ id: cardId, parent: columnId, title: card.title, detail: cardSummary(card) });
      cards.set(cardId, ref);
      if (isCardDone(board, ref)) faded.add(cardId);
      const checklist = cardChecklist(card);
      if (checklist.length > 0) folded.add(cardId);
      for (const item of checklist) {
        const itemId = id('item', `${cardId}\n${item.text}`);
        records.push({ id: itemId, parent: cardId, title: item.text, detail: '' });
        if (item.done) faded.add(itemId);
      }
    }
  });
  return { map: { records, relations: dependencyLinks(board, cards) }, cards, faded, folded };
}
