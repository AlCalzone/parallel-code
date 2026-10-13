/**
 * Controller for guided understanding tours: plan tours, file tours and tours
 * the coding agent publishes through MCP.
 * Owns generation, the tree of follow-up answers under each card and the
 * navigation through it; the tour lives in renderer memory only.
 * See docs/guided-understanding-plan.md.
 */

import { createSignal, onCleanup } from 'solid-js';
import { IPC } from '../../electron/ipc/channels';
import { invoke } from './ipc';
import { errMessage, warn as logWarn } from './log';
import { startUnderstandingRequest, type UnderstandingRequestKind } from './understanding-request';
import {
  GO_DEEPER_QUESTION,
  buildDocumentTourPrompt,
  buildFileTourPrompt,
  buildFollowUpPrompt,
  buildPlanTourPrompt,
  buildTopicTourPrompt,
  compactSpine,
  renderFileTourContext,
} from './understanding-prompt';
import {
  groundBranch,
  groundTour,
  parseTourBranch,
  parseUnderstandingTour,
  type FileTourContext,
  type UnderstandingTour,
  type UnderstandingTourKind,
} from './understanding-tour';
import { TOUR_FILE_CHANGED } from '../../electron/shared/understanding-limits';
import { serializeTour, tourFileName, type TourFile } from './tour-file';
import {
  MAX_TOUR_DEPTH,
  appendChildren,
  createNodeIds,
  findNode,
  nextNodeId,
  nodeTrail,
  nodesFromCards,
  pointQuestion,
  previousNodeId,
  rootIndexOf,
  type TourNode,
} from './tour-tree';

/**
 * Subject of a plan tour. The entry-point button compares it with the running
 * tour's subject, so both sides must derive it the same way. The worktree path
 * is preferred so a tour of the same file from the canvas shares the cache.
 */
export function planTourSubject(task: { planFileName?: string; planPath?: string }): string {
  return task.planPath ?? task.planFileName ?? 'plan';
}

/**
 * Which tour a canvas document gets: the task's own plan keeps its plan tour,
 * so both entry points share one cached tour; any other document gets a
 * document tour. Only the real plan path counts, never the file-name fallback
 * of planTourSubject(), which could name an unrelated document.
 */
export function documentTourKind(task: { planPath?: string }, path: string): 'plan' | 'document' {
  return task.planPath !== undefined && path === task.planPath ? 'plan' : 'document';
}

/** Hooks for background generation: the entry button is the only thing on screen. */
export interface UnderstandingTourOptions {
  onReady?: (subject: string) => void;
  onError?: (message: string) => void;
}

/** The reader's "Rework tour" request, carried so Retry repeats it. */
interface ReworkInstructions {
  instructions?: string;
}

export type UnderstandingTourInput = ReworkInstructions &
  (
    | {
        kind: 'plan';
        taskName: string;
        worktreePath: string;
        planContent: string;
        subject: string;
      }
    | { kind: 'file'; taskName: string; worktreePath: string; filePath: string }
    /** A Markdown document from the canvas, read fresh when the tour starts. */
    | {
        kind: 'document';
        taskName: string;
        worktreePath: string;
        content: string;
        subject: string;
      }
    /**
     * A tour the agent published. It is only regenerated when the reader
     * reworks it, from `context`: the material the agent summarised.
     */
    | { kind: 'agent'; taskName: string; worktreePath: string; subject: string; context?: string }
  );

/** The cache key's subject for one input; both entry buttons and open() need it. */
export function tourInputSubject(input: UnderstandingTourInput): string {
  return input.kind === 'file' ? input.filePath : input.subject;
}

/** A finished tour plus everything a follow-up needs to replay its context. */
interface CachedTour {
  tour: UnderstandingTour;
  context: string;
  cwd: string;
  input: UnderstandingTourInput;
  /** The cards with every answered follow-up under them, so reopening keeps them. */
  tree: TourNode[];
  /** Worktree-relative path of the text or file the tour explains. */
  source?: string;
  /** Where the reader saved the tour; later answers keep that file up to date. */
  savedPath?: string;
  /** The file's text as last written or read, to notice edits made outside the tour. */
  savedText?: string;
}

/** The worktree path a tour explains: what a saved file names as its source. */
function sourceOf(input: UnderstandingTourInput): string | undefined {
  if (input.kind === 'file') return input.filePath;
  return input.kind === 'agent' ? undefined : input.subject;
}

/** The tour's own cards as the roots of a fresh tree. */
function treeOf(tour: UnderstandingTour): TourNode[] {
  return nodesFromCards(tour.cards, createNodeIds());
}

/** The answers under one card, grouped by the question each answered, oldest first. */
function answersUnder(node: TourNode): { question: string; cards: UnderstandingTour['cards'] }[] {
  const groups: { question: string; cards: UnderstandingTour['cards'] }[] = [];
  for (const child of node.children) {
    if (child.question === undefined) continue;
    const last = groups.at(-1);
    if (last?.question === child.question) last.cards.push(child.card);
    else groups.push({ question: child.question, cards: [child.card] });
  }
  return groups;
}

function cacheKey(kind: UnderstandingTourKind, subject: string): string {
  return `${kind}:${subject}`;
}

/**
 * A tour reopened from its file is its own entry, so it never replaces a
 * generated tour of the same subject, answers the reader has not saved included.
 */
function savedKey(path: string): string {
  return `saved:${path}`;
}

/** A cached tour as the text of its saved file. */
function entryText(entry: CachedTour): string {
  return serializeTour(
    {
      subject: entry.tour.subject,
      kind: entry.tour.kind,
      ...(entry.source && { source: entry.source }),
      ...(entry.tour.omitted && { omitted: entry.tour.omitted }),
      roots: entry.tree,
    },
    { forFile: true },
  );
}

/**
 * Plan and document tours explain the text they were built from, so an edited
 * text needs a new tour. File tours are keyed by path only and checked after
 * they open, see checkFileFreshness().
 */
function isStale(cached: UnderstandingTourInput, input: UnderstandingTourInput): boolean {
  if (cached.kind === 'plan' && input.kind === 'plan')
    return cached.planContent !== input.planContent;
  if (cached.kind === 'document' && input.kind === 'document')
    return cached.content !== input.content;
  return false;
}

export function createUnderstandingTour(options: UnderstandingTourOptions = {}) {
  const [tour, setTour] = createSignal<UnderstandingTour | null>(null);
  const [kind, setKind] = createSignal<UnderstandingTourKind | null>(null);
  const [subject, setSubject] = createSignal('');
  /** The tour's cards with every answered follow-up nested under its card. */
  const [tree, setTree] = createSignal<TourNode[]>([]);
  /** The card on screen; empty while there is no tour. */
  const [currentId, setCurrentId] = createSignal('');
  /** The question in flight and the card it was asked on, or null when idle. */
  const [pending, setPending] = createSignal<{ question: string; nodeId: string } | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [asking, setAsking] = createSignal(false);
  const [error, setError] = createSignal('');
  const [progress, setProgress] = createSignal('');
  const [elapsedSeconds, setElapsedSeconds] = createSignal(0);
  const [receiving, setReceiving] = createSignal(false);
  /** The file behind the file tour on screen changed after the tour was made. */
  const [stale, setStale] = createSignal(false);
  /** Worktree-relative path the tour on screen is saved to, or ''. */
  const [savedPath, setSavedPath] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  // Finished tours, so starting a file tour does not discard a finished plan
  // tour. A signal (not a bare Map) keeps isReady() reactive for the buttons.
  const [cache, setCache] = createSignal<ReadonlyMap<string, CachedTour>>(new Map());

  let request: { cancel: () => void } | undefined;
  /** The exact context the tour was built from, replayed to follow-ups (D2). */
  let context = '';
  let cwd = '';
  let lastInput: UnderstandingTourInput | undefined;
  /** What the tour on screen explains, for its saved file. */
  let source: string | undefined;
  /** The cache entry of the tour on screen. */
  let shownKey = '';
  /** Its saved file's text as last written or read; '' while unsaved. */
  let savedText = '';
  /** Saves run one after another, so an older tree never lands last. */
  let writes: Promise<void> = Promise.resolve();
  /** Bumped by every cancel and every new run so late results are ignored. */
  let token = 0;

  function cancel(): void {
    token += 1;
    request?.cancel();
    request = undefined;
    setLoading(false);
    setAsking(false);
    setPending(null);
    setProgress('');
  }

  /** Clears what is on screen; finished tours stay in the cache. */
  function clearView(): void {
    setTour(null);
    setTree([]);
    setCurrentId('');
    setSavedPath('');
    shownKey = '';
    savedText = '';
    setError('');
    setElapsedSeconds(0);
    setReceiving(false);
    setStale(false);
  }

  function reset(): void {
    cancel();
    clearView();
    setKind(null);
    setSubject('');
    setCache(new Map());
    context = '';
    cwd = '';
    lastInput = undefined;
    source = undefined;
  }

  onCleanup(cancel);

  /**
   * Reports a failure. A follow-up's belongs to the card it was asked on, so
   * once the reader has moved on it is dropped — the same as navigating away
   * from a failed ask. A tour-level failure passes no card and always shows.
   */
  function reportError(message: string, nodeId?: string): void {
    if (nodeId !== undefined && nodeId !== currentId()) return;
    setError(message);
  }

  /** Puts a tour and its tree on screen, opening on the gist. */
  function show(shown: UnderstandingTour, shownTree: TourNode[]): void {
    setTour(shown);
    setTree(shownTree);
    setCurrentId(shownTree[0]?.id ?? '');
  }

  /**
   * Runs one request, returning its text, or `undefined` when it was cancelled
   * or superseded. Failures throw so callers report them through `error()`.
   */
  async function run(options: {
    prompt: string;
    request: UnderstandingRequestKind;
    active: number;
    /** The card a follow-up was asked on; its provider errors belong there. */
    nodeId?: string;
  }): Promise<string | undefined> {
    const { active } = options;
    const handle = startUnderstandingRequest({
      prompt: options.prompt,
      cwd,
      request: options.request,
      onElapsed: (seconds) => {
        if (active === token) setElapsedSeconds(seconds);
      },
      onReceiving: () => {
        if (active === token) setReceiving(true);
      },
      onProviderError: (message) => {
        if (active === token) reportError(message, options.nodeId);
      },
    });
    request = handle;
    const outcome = await handle.result;
    if (active !== token) return undefined;
    request = undefined;
    if (outcome.status === 'cancelled') return undefined;
    if (outcome.status === 'failed') throw new Error(outcome.message);
    return outcome.text;
  }

  /** Builds the prompt plus the context string replayed to follow-ups. */
  async function buildPrompt(
    input: UnderstandingTourInput,
  ): Promise<{ prompt: string; context: string }> {
    const { instructions } = input;
    if (input.kind === 'agent') {
      if (!input.context) throw new Error('This tour has nothing to regenerate it from.');
      return {
        prompt: buildTopicTourPrompt({
          taskName: input.taskName,
          subject: input.subject,
          context: input.context,
          instructions,
        }),
        context: input.context,
      };
    }
    if (input.kind === 'plan')
      return {
        prompt: buildPlanTourPrompt({
          taskName: input.taskName,
          planContent: input.planContent,
          instructions,
        }),
        context: input.planContent,
      };
    if (input.kind === 'document')
      return {
        prompt: buildDocumentTourPrompt({
          taskName: input.taskName,
          path: input.subject,
          content: input.content,
          instructions,
        }),
        context: input.content,
      };
    const bundle = await invoke<FileTourContext>(IPC.ReadFileTourContext, {
      worktreePath: input.worktreePath,
      filePath: input.filePath,
    });
    return {
      prompt: buildFileTourPrompt({ taskName: input.taskName, context: bundle, instructions }),
      context: renderFileTourContext(bundle),
    };
  }

  /** Runs in the background: nothing opens the viewer, so callers watch the hooks. */
  async function generate(input: UnderstandingTourInput): Promise<void> {
    cancel();
    clearView();
    const active = ++token;
    const tourSubject = tourInputSubject(input);
    lastInput = input;
    cwd = input.worktreePath;
    source = sourceOf(input);
    shownKey = cacheKey(input.kind, tourSubject);
    setKind(input.kind);
    setSubject(tourSubject);
    setLoading(true);
    setProgress(
      input.kind === 'file'
        ? 'Reading file…'
        : input.instructions
          ? 'Reworking tour…'
          : 'Generating tour…',
    );
    try {
      const built = await buildPrompt(input);
      if (active !== token) return;
      context = built.context;
      setProgress(input.instructions ? 'Reworking tour…' : 'Generating tour…');
      const text = await run({ prompt: built.prompt, request: 'tour', active });
      if (text === undefined) return;
      const parsed = groundTour(
        parseUnderstandingTour(text, input.kind, tourSubject),
        built.context,
      );
      const parsedTree = treeOf(parsed);
      setCache((prev) =>
        new Map(prev).set(shownKey, {
          tour: parsed,
          context: built.context,
          cwd: input.worktreePath,
          input,
          tree: parsedTree,
          source: sourceOf(input),
        }),
      );
      show(parsed, parsedTree);
      setError('');
      setLoading(false);
      setProgress('');
      options.onReady?.(tourSubject);
    } catch (cause) {
      if (active !== token) return;
      setLoading(false);
      setProgress('');
      const message = errMessage(cause);
      setError(message);
      options.onError?.(message);
    }
  }

  /**
   * Puts a tour the agent wrote straight on screen, no provider call. Published
   * tours are cached like generated ones, so follow-ups and reopening work the
   * same; without a context from the agent the cards themselves are replayed.
   */
  function publish(input: {
    subject: string;
    tour: UnderstandingTour;
    context: string;
    worktreePath: string;
  }): void {
    // cancel() bumps the token, so a request still in flight cannot overwrite this.
    cancel();
    clearView();
    const tourContext = input.context.trim() || compactSpine(input.tour);
    // A published tour is never generated, so the cached input carries no prompt
    // material; taskName only exists because every input shape has one.
    const cachedInput: UnderstandingTourInput = {
      kind: 'agent',
      taskName: input.subject,
      worktreePath: input.worktreePath,
      subject: input.subject,
      context: tourContext,
    };
    context = tourContext;
    cwd = input.worktreePath;
    lastInput = cachedInput;
    source = undefined;
    shownKey = cacheKey('agent', input.subject);
    const publishedTree = treeOf(input.tour);
    setCache((prev) =>
      new Map(prev).set(shownKey, {
        tour: input.tour,
        context: tourContext,
        cwd: input.worktreePath,
        input: cachedInput,
        tree: publishedTree,
      }),
    );
    setKind('agent');
    setSubject(input.subject);
    show(input.tour, publishedTree);
    options.onReady?.(input.subject);
  }

  /**
   * Shows an already generated tour without regenerating it. Returns false when
   * nothing usable is cached for that subject, so callers fall back to generate().
   */
  function open(input: UnderstandingTourInput): boolean {
    const tourKind = input.kind;
    const tourSubject = tourInputSubject(input);
    const key = cacheKey(tourKind, tourSubject);
    const cached = cache().get(key);
    if (!cached) return false;
    if (isStale(cached.input, input)) {
      setCache((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      return false;
    }
    // Reopening the tour already on screen keeps the reader's place in it.
    if (shownKey !== key || !tour()) showEntry(key, cached);
    void checkFileFreshness(cached);
    return true;
  }

  /** Puts a cached tour on screen, opening on its gist. */
  function showEntry(key: string, cached: CachedTour): void {
    cancel();
    clearView();
    context = cached.context;
    cwd = cached.cwd;
    lastInput = cached.input;
    source = cached.source;
    shownKey = key;
    savedText = cached.savedText ?? '';
    setKind(cached.input.kind);
    setSubject(tourInputSubject(cached.input));
    show(cached.tour, cached.tree);
    setSavedPath(cached.savedPath ?? '');
  }

  /**
   * Re-reads a file tour's context and flags the tour when it no longer matches
   * what the tour was built from. It flags rather than regenerates, so a changed
   * file never costs a provider call the reader did not ask for.
   */
  async function checkFileFreshness(cached: CachedTour): Promise<void> {
    const { input } = cached;
    if (input.kind !== 'file') return;
    const shown = tour();
    try {
      const bundle = await invoke<FileTourContext>(IPC.ReadFileTourContext, {
        worktreePath: input.worktreePath,
        filePath: input.filePath,
      });
      // The reader may have moved on to another tour while the file was read.
      if (tour() !== shown) return;
      setStale(renderFileTourContext(bundle) !== cached.context);
    } catch (error) {
      // A file that can no longer be read is as stale as one that changed.
      logWarn('understandingTour', 'Could not re-read the toured file', {
        error: errMessage(error),
      });
      if (tour() === shown) setStale(true);
    }
  }

  function isReady(tourKind: UnderstandingTourKind, tourSubject: string): boolean {
    return cache().has(cacheKey(tourKind, tourSubject));
  }

  function isLoading(tourKind: UnderstandingTourKind, tourSubject: string): boolean {
    return loading() && kind() === tourKind && subject() === tourSubject;
  }

  /** An error belongs to the run that produced it, not to every entry button. */
  function errorFor(tourKind: UnderstandingTourKind, tourSubject: string): string {
    return kind() === tourKind && subject() === tourSubject ? error() : '';
  }

  /** Re-runs the last generate input; used by Retry and by Regenerate on a stale tour. */
  function retry(): void {
    if (lastInput) void generate(lastInput);
  }

  /** Regenerates the tour on screen with the reader's request for how it should change. */
  function rework(instructions: string): void {
    if (lastInput && instructions.trim()) void generate({ ...lastInput, instructions });
  }

  /** The tour on screen as the file it saves to. */
  function currentFile(): TourFile | undefined {
    const shown = tour();
    if (!shown) return undefined;
    return {
      subject: subject(),
      kind: shown.kind,
      ...(source && { source }),
      ...(shown.omitted && { omitted: shown.omitted }),
      roots: tree(),
    };
  }

  /**
   * Records where a cached tour is saved and what its file holds, so reopening
   * it keeps saving there; no path forgets the file.
   */
  function cacheSaved(key: string, saved?: { path: string; text: string }): void {
    setCache((prev) => {
      const entry = prev.get(key);
      if (!entry) return prev;
      return new Map(prev).set(key, {
        ...entry,
        savedPath: saved?.path,
        savedText: saved?.text,
      });
    });
  }

  /**
   * Writes a tour's text to its file and returns where it landed. A first save
   * picks a free name from the subject; later ones replace that file. The text
   * and worktree are taken when the save starts, so a tour opened meanwhile
   * can never be written over this one's file.
   */
  function write(target: {
    worktreePath: string;
    path: string;
    content: string;
    replace: boolean;
    /** What the file should still hold; an edit made outside the tour refuses the write. */
    expected?: string;
  }) {
    return invoke<string>(IPC.SaveTourFile, target);
  }

  /** The tour on screen as the text of its saved file. */
  function fileText(): string | undefined {
    const file = currentFile();
    return file && serializeTour(file, { forFile: true });
  }

  /**
   * Saves the tour on screen into the worktree as Markdown, so it can be
   * reopened from the canvas, committed or handed to the agent. Once saved,
   * every new answer updates the file.
   */
  async function save(): Promise<void> {
    const shown = tour();
    const content = fileText();
    if (!shown || content === undefined || saving()) return;
    const key = shownKey;
    const existing = savedPath();
    setSaving(true);
    try {
      const path = await write({
        worktreePath: cwd,
        path: existing || tourFileName(subject()),
        content,
        replace: existing !== '',
        ...(existing && savedText && { expected: savedText }),
      });
      cacheSaved(key, { path, text: content });
      if (tour() === shown) {
        setSavedPath(path);
        savedText = content;
      }
    } catch (cause) {
      if (tour() === shown) forgetFile(key, existing, cause, 'Could not save the tour');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Reports a failed write. A file edited outside the tour is never written
   * over: the tour lets go of it, so the next save makes a new file.
   */
  function forgetFile(key: string, path: string, cause: unknown, failed: string): void {
    const message = errMessage(cause);
    if (!path || !message.includes(TOUR_FILE_CHANGED)) {
      setError(`${failed}: ${message}`);
      return;
    }
    cacheSaved(key);
    setSavedPath('');
    savedText = '';
    setError(
      `${path} changed outside the tour, so it was left as it is. Open it again from the canvas, or save this tour as a new file.`,
    );
  }

  /** Keeps a saved tour's file in step with its tree; unsaved tours stay in memory. */
  function persist(): void {
    const path = savedPath();
    const content = fileText();
    if (!path || content === undefined) return;
    const target = {
      worktreePath: cwd,
      path,
      content,
      replace: true,
      ...(savedText && { expected: savedText }),
    };
    // Writes queue up, so the next one expects what this one leaves behind.
    savedText = content;
    cacheSaved(shownKey, { path, text: content });
    const key = shownKey;
    const shown = tour();
    writes = writes.then(() => update(target, key, shown));
  }

  async function update(
    target: Parameters<typeof write>[0],
    key: string,
    shown: UnderstandingTour | null,
  ): Promise<void> {
    try {
      await write(target);
    } catch (cause) {
      if (tour() !== shown) {
        if (errMessage(cause).includes(TOUR_FILE_CHANGED)) cacheSaved(key);
        return;
      }
      // The file still holds what this write expected, unless a later write is queued.
      if (savedText === target.content) savedText = target.expected ?? '';
      forgetFile(key, target.path, cause, `Could not update ${target.path}`);
    }
  }

  /**
   * Shows a tour saved in the worktree, with every answer in it, without a
   * provider call. Follow-ups replay what it explains: the text passed in,
   * the file re-read, or the cards themselves when neither is there any more.
   * Reopening the file already on screen, unchanged, keeps the reader's place.
   */
  async function restore(input: {
    file: TourFile;
    /** The file's text as read, to tell whether it changed since it was shown. */
    text: string;
    savedPath: string;
    worktreePath: string;
    taskName: string;
    /** The plan or document the tour explains, read fresh; absent when gone. */
    sourceText?: string;
  }): Promise<void> {
    const shownFile = currentFile();
    if (
      shownFile &&
      savedPath() === input.savedPath &&
      serializeTour(shownFile, { forFile: true }) === input.text
    )
      return;
    // A cached tour that wrote exactly this file is the same tour: show it.
    for (const [key, entry] of cache()) {
      if (entry.savedPath === input.savedPath && entryText(entry) === input.text) {
        showEntry(key, entry);
        return;
      }
    }
    cancel();
    clearView();
    const active = token;
    const { file, taskName, worktreePath } = input;
    const cards = file.roots.map((node) => node.card);
    const fromCards = (): UnderstandingTourInput => ({
      kind: 'agent',
      taskName,
      worktreePath,
      subject: file.subject,
      context: compactSpine({ cards }),
    });
    let restoredInput: UnderstandingTourInput = fromCards();
    if (file.source && input.sourceText !== undefined && file.kind === 'plan')
      restoredInput = {
        kind: 'plan',
        taskName,
        worktreePath,
        planContent: input.sourceText,
        subject: file.source,
      };
    else if (file.source && input.sourceText !== undefined && file.kind === 'document')
      restoredInput = {
        kind: 'document',
        taskName,
        worktreePath,
        content: input.sourceText,
        subject: file.source,
      };
    let restoredContext =
      restoredInput.kind === 'plan'
        ? restoredInput.planContent
        : restoredInput.kind === 'document'
          ? restoredInput.content
          : compactSpine({ cards });
    if (file.kind === 'file' && file.source) {
      try {
        const bundle = await invoke<FileTourContext>(IPC.ReadFileTourContext, {
          worktreePath,
          filePath: file.source,
        });
        restoredInput = { kind: 'file', taskName, worktreePath, filePath: file.source };
        restoredContext = renderFileTourContext(bundle);
      } catch (error) {
        logWarn('understandingTour', 'Could not re-read the toured file', {
          error: errMessage(error),
        });
      }
      if (active !== token) return;
    }
    const restoredSubject = tourInputSubject(restoredInput);
    // The tour keeps the kind it was saved with, even when what it explains is
    // gone and follow-ups fall back to the cards, so the file never loses it.
    const restored: UnderstandingTour = {
      subject: restoredSubject,
      kind: file.kind,
      cards,
      ...(file.omitted && { omitted: file.omitted }),
    };
    context = restoredContext;
    cwd = worktreePath;
    lastInput = restoredInput;
    source = file.source;
    shownKey = savedKey(input.savedPath);
    savedText = input.text;
    setCache((prev) => {
      const next = new Map(prev);
      // Only one tour writes a file; any other that saved here lets go of it.
      for (const [key, entry] of next)
        if (entry.savedPath === input.savedPath)
          next.set(key, { ...entry, savedPath: undefined, savedText: undefined });
      return next.set(shownKey, {
        tour: restored,
        context: restoredContext,
        cwd: worktreePath,
        input: restoredInput,
        tree: file.roots,
        source: file.source,
        savedPath: input.savedPath,
        savedText: input.text,
      });
    });
    setKind(restoredInput.kind);
    setSubject(restoredSubject);
    show(restored, file.roots);
    setSavedPath(input.savedPath);
  }

  /** The card on screen. */
  function currentNode(): TourNode | undefined {
    return findNode(tree(), currentId());
  }

  /** The card on screen and the cards above it, outermost first. */
  function trail(): TourNode[] {
    return nodeTrail(tree(), currentId());
  }

  /** Index of the tour card the reader is under, for the progress strip. */
  function step(): number {
    return Math.max(0, rootIndexOf(tree(), currentId()));
  }

  /** Answers nest one level per question, down to MAX_TOUR_DEPTH. */
  function canAsk(): boolean {
    const depth = trail().length;
    return depth > 0 && depth < MAX_TOUR_DEPTH;
  }

  /**
   * The question waiting for an answer under the card on screen. The answer
   * lands under the card it was asked on, so no other card may show it
   * waiting — it would vanish from there the moment the answer arrived.
   */
  function pendingQuestion(): string {
    const inFlight = pending();
    return inFlight && inFlight.nodeId === currentId() ? inFlight.question : '';
  }

  /** Keeps the cache entry of the tour on screen in step with its tree. */
  function cacheTree(nextTree: TourNode[]): void {
    const key = shownKey;
    setCache((prev) => {
      const entry = prev.get(key);
      return entry ? new Map(prev).set(key, { ...entry, tree: nextTree }) : prev;
    });
  }

  /**
   * Asks about the card on screen. The answer's cards become its children,
   * and a reader still on that card is taken into the first of them; earlier
   * answers there are replayed so a second question builds on them.
   */
  async function ask(question: string): Promise<void> {
    const current = tour();
    const asked = currentNode();
    if (!current || !asked || !question.trim() || !canAsk()) return;
    request?.cancel();
    const active = ++token;
    const nodeId = asked.id;
    const path = trail();
    setAsking(true);
    setPending({ question, nodeId });
    setError('');
    setElapsedSeconds(0);
    setReceiving(false);
    try {
      const prompt = buildFollowUpPrompt({
        tour: current,
        currentIndex: rootIndexOf(tree(), nodeId),
        path: path.slice(1).map((node) => node.card),
        question,
        context,
        earlier: answersUnder(asked),
      });
      const text = await run({ prompt, request: 'follow-up', active, nodeId });
      if (text === undefined) return;
      const branch = groundBranch(
        parseTourBranch(text, rootIndexOf(tree(), nodeId), question),
        current.kind,
        context,
      );
      const answers = nodesFromCards(branch.cards, createNodeIds(tree()), question);
      const nextTree = appendChildren(tree(), nodeId, answers);
      setTree(nextTree);
      cacheTree(nextTree);
      persist();
      setAsking(false);
      setPending(null);
      // Provider stderr can arrive even on a request that then succeeded.
      setError('');
      if (currentId() === nodeId) setCurrentId(answers[0].id);
    } catch (cause) {
      if (active !== token) return;
      setAsking(false);
      setPending(null);
      reportError(errMessage(cause), nodeId);
    }
  }

  function goDeeper(): void {
    void ask(GO_DEEPER_QUESTION);
  }

  /** Digs into one point of the slide on screen. */
  function goDeeperOn(point: string): void {
    void ask(pointQuestion(point));
  }

  /** A failed ask belonged to the card it was asked on, not to the next one. */
  function clearError(): void {
    setError('');
  }

  /** Shows one card of the tree; an unknown id changes nothing. */
  function select(id: string | undefined): void {
    if (!id || !findNode(tree(), id) || id === currentId()) return;
    clearError();
    setCurrentId(id);
  }

  /** Shows one of the tour's own cards, clamped to the first and last. */
  function navigate(index: number): void {
    const roots = tree();
    if (roots.length === 0) return;
    select(roots[Math.min(Math.max(index, 0), roots.length - 1)].id);
  }

  /** The next card at this level, climbing out after the last child. */
  function next(): void {
    select(nextNodeId(tree(), currentId()));
  }

  /** The previous card at this level, or the parent from a first child. */
  function previous(): void {
    select(previousNodeId(tree(), currentId()));
  }

  /** Into the first answer under the card on screen. */
  function enter(): void {
    select(currentNode()?.children[0]?.id);
  }

  /** Back out to the card this one answers. */
  function leave(): void {
    const path = trail();
    select(path.at(-2)?.id);
  }

  /** Whether next() has anywhere to go; the last card offers Finish instead. */
  function hasNext(): boolean {
    return nextNodeId(tree(), currentId()) !== undefined;
  }

  function hasPrevious(): boolean {
    return previousNodeId(tree(), currentId()) !== undefined;
  }

  return {
    tour,
    kind,
    subject,
    tree,
    currentId,
    currentNode,
    trail,
    step,
    pending,
    pendingQuestion,
    canAsk,
    loading,
    asking,
    error,
    progress,
    elapsedSeconds,
    receiving,
    stale,
    savedPath,
    saving,
    generate,
    publish,
    open,
    restore,
    save,
    isReady,
    isLoading,
    errorFor,
    retry,
    rework,
    navigate,
    select,
    next,
    previous,
    enter,
    leave,
    hasNext,
    hasPrevious,
    ask,
    goDeeper,
    goDeeperOn,
    cancel,
    reset,
  };
}

export type UnderstandingTourController = ReturnType<typeof createUnderstandingTour>;

/** The slice entry-point buttons read to show their own subject's state. */
export type UnderstandingTourState = Pick<UnderstandingTourController, 'isReady' | 'isLoading'> &
  Partial<Pick<UnderstandingTourController, 'errorFor' | 'receiving' | 'elapsedSeconds'>>;
