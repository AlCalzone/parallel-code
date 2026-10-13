/**
 * A tour as Markdown, in both directions: the Copy button's text and the
 * `.tour.md` file a reader saves into the worktree to revisit later. Each card
 * is a heading one level below its parent's, so the file reads as an outline
 * on GitHub and stays editable by hand or by the agent. What Markdown cannot
 * show (tone, form, the question a card answers) rides in one HTML comment per
 * card. See docs/tour-outline.md.
 */

import {
  TOUR_FILE_MAX_CHARS,
  TOUR_FILE_SUFFIX,
  TOUR_FORMS,
  TOUR_TONES,
} from '../../electron/shared/understanding-limits';
import { MAX_TOUR_DEPTH, countNodes, createNodeIds, type TourNode } from './tour-tree';
import type {
  TourCard,
  TourDiagram,
  TourForm,
  TourRef,
  TourSide,
  TourTone,
  UnderstandingTourKind,
} from './understanding-tour';

const TOUR_FILE_VERSION = 1;
const TOUR_FILE_MAX_CARDS = 200;

const KINDS: readonly UnderstandingTourKind[] = ['plan', 'file', 'document', 'agent'];
const WARNED = new Set<TourTone>(['risk', 'uncertainty']);
const META_PREFIX = '<!-- tour-card ';
const NOTES_OPEN = '<details><summary>Notes</summary>';
const NOTES_CLOSE = '</details>';
const SOURCE_PREFIX = '> Source: “';
const WHY_PREFIX = '> **Why this matters:** ';
const REFS_PREFIX = 'Refs: ';

export interface TourFile {
  subject: string;
  kind: UnderstandingTourKind;
  /** Worktree-relative path of the text or file the tour explains, when there is one. */
  source?: string;
  /** Headings of the source the tour left out on purpose. */
  omitted?: string[];
  roots: TourNode[];
}

export function isTourFilePath(path: string): boolean {
  return path.toLowerCase().endsWith(TOUR_FILE_SUFFIX);
}

/** A file name for a tour of `subject`: its last path segment, made safe. */
export function tourFileName(subject: string): string {
  const base = subject.split('/').pop() ?? subject;
  const slug = base
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'tour'}${TOUR_FILE_SUFFIX}`;
}

function oneLine(text: string): string {
  return text.replace(/\s*\n+\s*/g, ' ').trim();
}

/** Longer than any backtick run in the source, so a diagram cannot close its own fence. */
function fence(source: string): string {
  const longest = Math.max(2, ...(source.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(longest + 1);
}

const FENCE = /^(`{3,}|~{3,})(.*)$/;

/**
 * Calls `visit` with each line and whether it sits inside a fenced code block,
 * the fence lines themselves included.
 */
function eachLine(lines: string[], visit: (line: string, fenced: boolean) => void): void {
  let open: string | undefined;
  for (const line of lines) {
    const match = FENCE.exec(line);
    if (open) {
      visit(line, true);
      if (match && match[1][0] === open[0] && match[1].length >= open.length && !match[2].trim())
        open = undefined;
    } else if (match) {
      open = match[1];
      visit(line, true);
    } else visit(line, false);
  }
}

/** Card text never starts a heading of its own: it would split the card in two. */
function escapeHeadings(markdown: string): string {
  const out: string[] = [];
  eachLine(markdown.split('\n'), (line, fenced) =>
    out.push(!fenced && /^#/.test(line) ? `\\${line}` : line),
  );
  return out.join('\n');
}

function unescapeHeadings(markdown: string): string {
  const out: string[] = [];
  eachLine(markdown.split('\n'), (line, fenced) =>
    out.push(!fenced && /^\\#/.test(line) ? line.slice(1) : line),
  );
  return out.join('\n');
}

function refText(ref: TourRef): string {
  const range = ref.endLine === undefined ? `${ref.line}` : `${ref.line}-${ref.endLine}`;
  return `\`${ref.line === undefined ? ref.filePath : `${ref.filePath}:${range}`}\``;
}

/** JSON that cannot end the HTML comment it sits in. */
function commentJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function tableCell(text: string): string {
  return oneLine(text).replace(/\|/g, '\\|');
}

function cardMeta(node: TourNode): Record<string, unknown> {
  const { card } = node;
  return {
    ...(card.tone !== 'neutral' && { tone: card.tone }),
    ...(card.form && { form: card.form }),
    ...(node.question !== undefined && { question: node.question }),
    ...(card.questions && { questions: card.questions }),
    // Without points every list belongs to the body; see readCard().
    ...(!card.points && { prose: true }),
  };
}

function cardMarkdown(node: TourNode, depth: number, withMeta = true): string {
  const { card } = node;
  const parts = [`${'#'.repeat(depth + 1)} ${oneLine(card.title)}`];
  const label = `${WARNED.has(card.tone) ? '⚠ ' : ''}${oneLine(card.label).replace(/\*/g, '\\*')}`;
  const meta = withMeta ? cardMeta(node) : {};
  parts.push(
    [
      ...(Object.keys(meta).length ? [`${META_PREFIX}${commentJson(meta)} -->`] : []),
      ...(label ? [`**${label}**`] : []),
    ].join('\n'),
  );
  if (card.diagram) {
    const marks = fence(card.diagram.source);
    const lang = card.diagram.kind === 'mermaid' ? 'mermaid' : 'text';
    parts.push(`${marks}${lang}\n${card.diagram.source}\n${marks}`);
  }
  if (card.comparison) {
    const [left, right] = card.comparison;
    parts.push(
      `| ${tableCell(left.label)} | ${tableCell(right.label)} |\n| --- | --- |\n| ${tableCell(left.text)} | ${tableCell(right.text)} |`,
    );
  }
  if (card.body) parts.push(escapeHeadings(card.body));
  if (card.points) parts.push(card.points.map((point) => `- ${oneLine(point)}`).join('\n'));
  if (card.notes) parts.push(`${NOTES_OPEN}\n\n${escapeHeadings(card.notes)}\n\n${NOTES_CLOSE}`);
  if (card.source) parts.push(`${SOURCE_PREFIX}${oneLine(card.source)}”`);
  if (card.whyItMatters) parts.push(`${WHY_PREFIX}${oneLine(card.whyItMatters)}`);
  if (card.refs.length) parts.push(`${REFS_PREFIX}${card.refs.map(refText).join(', ')}`);
  return parts.filter(Boolean).join('\n\n');
}

function treeMarkdown(nodes: readonly TourNode[], depth: number): string[] {
  return nodes.flatMap((node) => [
    cardMarkdown(node, depth),
    ...treeMarkdown(node.children, depth + 1),
  ]);
}

/**
 * The tour as Markdown. A saved file carries front matter so the app can open
 * it as a tour again; copied text leaves it out and lists the omitted sections
 * in prose instead.
 */
export function serializeTour(tour: TourFile, options: { forFile: boolean }): string {
  const header = options.forFile
    ? [
        '---',
        `parallel-code-tour: ${TOUR_FILE_VERSION}`,
        `kind: ${tour.kind}`,
        `subject: ${JSON.stringify(tour.subject)}`,
        ...(tour.source ? [`source: ${JSON.stringify(tour.source)}`] : []),
        ...(tour.omitted?.length ? [`omitted: ${JSON.stringify(tour.omitted)}`] : []),
        '---',
        '',
        `# ${oneLine(tour.subject)}`,
      ]
    : [`# Tour: ${oneLine(tour.subject)}`];
  const omitted =
    !options.forFile && tour.omitted?.length ? [`_Not covered: ${tour.omitted.join(', ')}_`] : [];
  return `${[header.join('\n'), ...treeMarkdown(tour.roots, 1), ...omitted].join('\n\n')}\n`;
}

/**
 * One card for the agent chat: which tour, where in it, what the card says,
 * and the saved file the agent can read for the rest. Staged in the prompt,
 * never sent on its own.
 */
export function cardReference(input: {
  subject: string;
  savedPath?: string;
  /** The card and the cards above it, outermost first. */
  trail: readonly TourNode[];
}): string {
  const node = input.trail.at(-1);
  if (!node) return '';
  const lines = [
    `Tour card reference — tour: ${oneLine(input.subject)}`,
    `Position: ${input.trail.map((entry) => oneLine(entry.card.title)).join(' › ')}`,
  ];
  if (node.question !== undefined) lines.push(`Asked: ${oneLine(node.question)}`);
  if (input.savedPath)
    lines.push(
      `The whole tour is saved in ${input.savedPath}; read it for the cards around this one.`,
    );
  return `${lines.join('\n')}\n\n${cardMarkdown(node, 2, false)}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A front matter value: JSON when it parses, the bare text otherwise. */
function frontMatterValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function readFrontMatter(lines: string[]): { values: Map<string, unknown>; body: string[] } {
  const values = new Map<string, unknown>();
  if (lines[0]?.trim() !== '---') return { values, body: lines };
  const end = lines.indexOf('---', 1);
  if (end < 0) return { values, body: lines };
  for (const line of lines.slice(1, end)) {
    const match = /^([\w-]+):\s*(.*)$/.exec(line);
    if (match) values.set(match[1], frontMatterValue(match[2].trim()));
  }
  return { values, body: lines.slice(end + 1) };
}

function readMeta(line: string): Record<string, unknown> | undefined {
  if (!line.startsWith(META_PREFIX) || !line.endsWith('-->')) return undefined;
  try {
    return asRecord(JSON.parse(line.slice(META_PREFIX.length, -3).trim()));
  } catch {
    return undefined;
  }
}

function readRefs(line: string): TourRef[] {
  const refs: TourRef[] = [];
  for (const match of line.matchAll(/`([^`]+)`/g)) {
    const ref = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(match[1].trim());
    if (!ref?.[1]) continue;
    refs.push({
      filePath: ref[1],
      ...(ref[2] && { line: Number(ref[2]) }),
      ...(ref[3] && { endLine: Number(ref[3]) }),
    });
  }
  return refs;
}

function splitCells(row: string): string[] {
  return row
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function readComparison(rows: string[]): [TourSide, TourSide] | undefined {
  if (rows.length < 3) return undefined;
  const labels = splitCells(rows[0]);
  const texts = splitCells(rows[2]);
  if (labels.length !== 2 || texts.length !== 2) return undefined;
  return [
    { label: labels[0], text: texts[0] },
    { label: labels[1], text: texts[1] },
  ];
}

function readTone(value: unknown): TourTone {
  return (TOUR_TONES as readonly unknown[]).includes(value) ? (value as TourTone) : 'neutral';
}

function readForm(
  value: unknown,
  evidence: { diagram?: TourDiagram; comparison?: [TourSide, TourSide] },
): TourForm | undefined {
  if (!(TOUR_FORMS as readonly unknown[]).includes(value)) return undefined;
  if (value === 'flow' && !evidence.diagram) return undefined;
  if (value === 'comparison' && !evidence.comparison) return undefined;
  return value as TourForm;
}

function readQuestions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const questions = value.filter((entry): entry is string => typeof entry === 'string');
  return questions.length ? questions : undefined;
}

/**
 * One card from the lines under its heading. The blocks the writer emits are
 * recognised by their shape; anything else is body text, so a card edited by
 * hand keeps whatever was written into it.
 */
function readCard(title: string, lines: string[]): { card: TourCard; question?: string } {
  let index = 0;
  const skipBlank = () => {
    while (index < lines.length && !lines[index].trim()) index += 1;
  };
  skipBlank();
  const meta = readMeta(lines[index]?.trim() ?? '') ?? {};
  if (Object.keys(meta).length) index += 1;
  const prose = meta.prose === true;
  let label = '';
  let diagram: TourDiagram | undefined;
  let comparison: [TourSide, TourSide] | undefined;
  let notes: string | undefined;
  let source: string | undefined;
  let whyItMatters: string | undefined;
  let refs: TourRef[] = [];
  const points: string[] = [];
  const body: string[] = [];
  let labelAllowed = true;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      if (body.length && body.at(-1) !== '') body.push('');
      index += 1;
      continue;
    }
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const open = fenceMatch[1];
      const block = [line];
      index += 1;
      while (index < lines.length) {
        const close = FENCE.exec(lines[index]);
        block.push(lines[index]);
        index += 1;
        if (close && close[1][0] === open[0] && close[1].length >= open.length && !close[2].trim())
          break;
      }
      const lang = fenceMatch[2].trim();
      if (!diagram && (lang === 'text' || lang === 'mermaid') && block.length >= 2) {
        diagram = { kind: lang, source: block.slice(1, -1).join('\n') };
      } else body.push(...block);
      labelAllowed = false;
      continue;
    }
    if (trimmed === NOTES_OPEN) {
      const end = lines.findIndex((entry, at) => at > index && entry.trim() === NOTES_CLOSE);
      const stop = end < 0 ? lines.length : end;
      notes = unescapeHeadings(lines.slice(index + 1, stop).join('\n')).trim() || undefined;
      index = stop + 1;
      labelAllowed = false;
      continue;
    }
    const bold = /^\*\*(.+)\*\*$/.exec(trimmed);
    if (labelAllowed && bold) {
      label = bold[1].replace(/^⚠\s*/, '').replace(/\\\*/g, '*');
      labelAllowed = false;
      index += 1;
      continue;
    }
    labelAllowed = false;
    if (trimmed.startsWith(SOURCE_PREFIX) && trimmed.endsWith('”')) {
      source = trimmed.slice(SOURCE_PREFIX.length, -1);
    } else if (trimmed.startsWith(WHY_PREFIX)) {
      whyItMatters = trimmed.slice(WHY_PREFIX.length);
    } else if (trimmed.startsWith(REFS_PREFIX) && trimmed.includes('`')) {
      refs = readRefs(trimmed);
    } else if (trimmed.startsWith('|') && !comparison) {
      const rows: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(lines[index].trim());
        index += 1;
      }
      comparison = readComparison(rows);
      if (!comparison) body.push(...rows);
      continue;
    } else if (!prose && /^[-*+]\s+/.test(line)) {
      points.push(trimmed.replace(/^[-*+]\s+/, ''));
    } else if (!prose && points.length && /^\s+\S/.test(line) && body.at(-1) !== '') {
      // A hand-wrapped point continues on an indented line.
      points[points.length - 1] += ` ${trimmed}`;
    } else {
      body.push(line);
    }
    index += 1;
  }

  const text = unescapeHeadings(body.join('\n')).trim();
  const card: TourCard = {
    label,
    title,
    body: text,
    tone: readTone(meta.tone),
    refs,
    ...(points.length && { points }),
    ...(notes && { notes }),
    ...(diagram && { diagram }),
    ...(comparison && { comparison }),
    ...(whyItMatters && { whyItMatters }),
    ...(source && { source }),
  };
  const form = readForm(meta.form, card);
  const questions = readQuestions(meta.questions);
  return {
    card: { ...card, ...(form && { form }), ...(questions && { questions }) },
    ...(typeof meta.question === 'string' && { question: meta.question }),
  };
}

/**
 * Reads a saved tour. Throws with a reader-facing message when the text is not
 * one: no front matter marker, or no card under the title.
 */
export function parseTourFile(text: string): TourFile {
  if (text.length > TOUR_FILE_MAX_CHARS) throw new Error('The tour file is too large.');
  const { values, body } = readFrontMatter(text.replace(/\r\n?/g, '\n').split('\n'));
  if (!values.has('parallel-code-tour')) throw new Error('This file is not a saved tour.');
  const kindValue = values.get('kind');
  const kind = KINDS.find((entry) => entry === kindValue) ?? 'agent';

  let title = '';
  const sections: { depth: number; title: string; lines: string[] }[] = [];
  eachLine(body, (line, fenced) => {
    const heading = fenced ? null : /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
    if (heading && heading[1].length === 1 && !sections.length && !title) {
      title = heading[2];
      return;
    }
    if (heading && heading[1].length > 1) {
      sections.push({ depth: heading[1].length - 1, title: heading[2], lines: [] });
      return;
    }
    sections.at(-1)?.lines.push(line);
  });

  const nextId = createNodeIds();
  const roots: TourNode[] = [];
  const stack: TourNode[] = [];
  for (const section of sections) {
    if (!section.title.trim()) continue;
    const { card, question } = readCard(section.title.trim(), section.lines);
    const node: TourNode = {
      id: nextId(),
      card,
      ...(question !== undefined && { question }),
      children: [],
    };
    // A skipped heading level nests one level down, never more.
    const depth = Math.min(section.depth, stack.length + 1, MAX_TOUR_DEPTH);
    stack.length = depth - 1;
    (stack.at(-1)?.children ?? roots).push(node);
    stack.push(node);
  }
  if (!roots.length) throw new Error('The tour file has no cards.');
  if (countNodes(roots) > TOUR_FILE_MAX_CARDS) throw new Error('The tour file has too many cards.');

  const subjectValue = values.get('subject');
  const sourceValue = values.get('source');
  const omittedValue = values.get('omitted');
  const omitted = Array.isArray(omittedValue)
    ? omittedValue.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return {
    subject:
      (typeof subjectValue === 'string' && subjectValue.trim()) || title.trim() || 'Saved tour',
    kind,
    ...(typeof sourceValue === 'string' && sourceValue.trim() && { source: sourceValue.trim() }),
    ...(omitted.length && { omitted }),
    roots,
  };
}
