import { For, Show, createEffect, createSignal, createUniqueId, on, onCleanup } from 'solid-js';
import { Dialog } from './Dialog';
import {
  BookmarkIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ListIcon,
  MentionIcon,
  PencilIcon,
  RedoIcon,
  SyncIcon,
} from './icons';
import { TourAskBar } from './understanding/TourAskBar';
import { TourCard } from './understanding/TourCard';
import { TourCopyButton } from './understanding/TourCopyButton';
import { TourDeeper, questionLabel } from './understanding/TourDeeper';
import { TourIconButton } from './understanding/TourIconButton';
import { TourOutline } from './understanding/TourOutline';
import { TourProgress } from './understanding/TourProgress';
import { TourReworkBar } from './understanding/TourReworkBar';
import { cardReference, serializeTour } from '../lib/tour-file';
import { questionPoint } from '../lib/tour-tree';
import type { UnderstandingTourController } from '../lib/create-understanding-tour';
import type { TourRef } from '../lib/understanding-tour';
import { errMessage, warn as logWarn } from '../lib/log';
import { openFileInEditor } from '../lib/shell';
import { isTypingTarget } from '../lib/tour-keys';
import { store } from '../store/store';

/** The panel is only a layout box here: the card inside it is the one surface. */
const PANEL_STYLE = {
  width: 'auto',
  padding: '0',
  gap: '0',
  background: 'transparent',
  border: 'none',
  'box-shadow': 'none',
  overflow: 'hidden',
} as const;

/** Reading one card is the whole task, so the rest of the app goes dark. */
const OVERLAY_STYLE = {
  background: 'rgba(0,0,0,0.78)',
  'backdrop-filter': 'blur(6px) saturate(1.1)',
} as const;

/** Three lines standing in for the card that is still generating. */
const SKELETON_WIDTHS = ['100%', '92%', '64%'];

/**
 * Viewer for a generated understanding tour: one card at a time, with the
 * tour's outline beside it when the window has room. Answers to the reader's
 * questions become cards under the card they were asked on.
 */
export function UnderstandingTourDialog(props: {
  tour: UnderstandingTourController;
  open: boolean;
  onClose: () => void;
  worktreePath: string;
  /** Raised above another open dialog, e.g. when started from the plan viewer. */
  zIndex?: number;
  /** Hands the card on screen to the task's agent chat; absent where there is none. */
  onReference?: (reference: string) => void;
}) {
  const headingId = createUniqueId();
  /** The action the reader is most likely to press next; see the focus effect. */
  let primaryRef: HTMLButtonElement | undefined;
  const controller = () => props.tour;
  const tour = () => props.tour.tour();
  const roots = () => props.tour.tree();
  const node = () => props.tour.currentNode();
  const parent = () => props.tour.trail().at(-2);
  const onLastCard = () => !props.tour.hasNext();
  /** Tour cards with answers under them, for the progress markers. */
  const answered = () =>
    new Set(roots().flatMap((root, index) => (root.children.length > 0 ? [index] : [])));
  const [reworking, setReworking] = createSignal(false);
  const [overview, setOverview] = createSignal(false);
  /** The finished tour on screen, when there is one to copy or rework. */
  const shownTour = () => (props.tour.loading() ? null : tour());

  function markdown(): string {
    const shown = tour();
    return serializeTour(
      {
        subject: props.tour.subject(),
        kind: shown?.kind ?? 'agent',
        omitted: shown?.omitted,
        roots: roots(),
      },
      { forFile: false },
    );
  }

  function reference(): void {
    const text = cardReference({
      subject: props.tour.subject(),
      savedPath: props.tour.savedPath() || undefined,
      trail: props.tour.trail(),
    });
    if (text) props.onReference?.(text);
  }

  function rework(instructions: string): void {
    setReworking(false);
    controller().rework(instructions);
  }

  // Give the primary action focus as soon as a tour is on screen, so Enter and
  // the arrow keys move on without reaching for the pointer.
  createEffect(() => {
    if (props.open && tour() && !props.tour.loading()) primaryRef?.focus();
  });

  // Moving to a card, from the overview or otherwise, shows that card.
  createEffect(
    on(
      () => props.tour.currentId(),
      () => setOverview(false),
      { defer: true },
    ),
  );

  function openRef(ref: TourRef): void {
    const at = { line: ref.line, editorCommand: store.editorCommand.trim() };
    void openFileInEditor(props.worktreePath, ref.filePath, at).catch((error) =>
      logWarn('understandingTour', 'Could not open reference', { error: errMessage(error) }),
    );
  }

  /** Digs into one point, or opens the answer it already has. */
  function onPoint(point: string): void {
    const answer = node()?.children.find((child) => questionPoint(child.question) === point);
    if (answer) controller().select(answer.id);
    else controller().goDeeperOn(point);
  }

  function hasPointAnswer(point: string): boolean {
    return node()?.children.some((child) => questionPoint(child.question) === point) ?? false;
  }

  /**
   * Left and right step through the cards at one level; down enters the
   * answers under a card and up leaves them. Down and up keep scrolling a
   * long card where there is nowhere to go. Returns whether the key moved.
   */
  function move(key: string): boolean {
    switch (key) {
      case 'ArrowLeft':
        controller().previous();
        return true;
      case 'ArrowRight':
        controller().next();
        return true;
      case 'ArrowDown':
        if (!node()?.children.length) return false;
        controller().enter();
        return true;
      case 'ArrowUp':
        if (!parent()) return false;
        controller().leave();
        return true;
      case 'Home':
        controller().navigate(0);
        return true;
      case 'End':
        controller().navigate(roots().length - 1);
        return true;
      default:
        return false;
    }
  }

  /** Never while typing: the keys move the caret there. */
  function onKeyDown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target) || !tour()) return;
    if (move(event.key)) event.preventDefault();
  }

  // Reading means clicking on the card, which hands focus to the dialog panel
  // rather than to a control inside it, so the keys are listened for on the
  // document instead of on this component.
  createEffect(() => {
    if (!props.open) return;
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  function outline() {
    return (
      <TourOutline
        roots={roots()}
        currentId={props.tour.currentId()}
        pending={props.tour.pending()}
        onSelect={(id) => controller().select(id)}
      />
    );
  }

  /**
   * The card on screen, under a line that is always laid out, so a tour card
   * and an answer start at the same height. On an answer the line names the
   * question and leads back to the card it answers.
   */
  function CardView() {
    const blocked = () => props.tour.asking() || !props.tour.canAsk();
    return (
      <Show when={node()}>
        {(current) => (
          <>
            <p class="understanding-crumb">
              <Show when={parent()}>
                {(above) => (
                  <button
                    type="button"
                    title={`Back to: ${above().card.title}`}
                    onClick={() => controller().leave()}
                  >
                    ↳ {questionLabel(current().question ?? '', above().card.title)}
                  </button>
                )}
              </Show>
            </p>
            <TourCard
              card={current().card}
              onOpenRef={openRef}
              onAsk={(question) => void controller().ask(question)}
              asking={blocked()}
              answeredQuestions={current().children.flatMap((child) =>
                child.question === undefined ? [] : [child.question],
              )}
              omitted={roots().at(-1)?.id === current().id ? tour()?.omitted : undefined}
              points={{ open: hasPointAnswer, disabled: blocked(), onPoint }}
              deeper={
                <TourDeeper
                  answers={current().children}
                  pendingQuestion={props.tour.pendingQuestion()}
                  parentTitle={current().card.title}
                  onSelect={(id) => controller().select(id)}
                />
              }
            />
          </>
        )}
      </Show>
    );
  }

  function closeButton() {
    return (
      <TourIconButton label="Close tour" tooltip="Close" onClick={() => props.onClose()}>
        <CloseIcon size={14} />
      </TourIconButton>
    );
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      zIndex={props.zIndex}
      panelStyle={PANEL_STYLE}
      overlayStyle={OVERLAY_STYLE}
      labelledBy={headingId}
    >
      <div class="understanding-dialog">
        <div class="understanding-main">
          {/* No visible header: the card carries every word the reader needs. The
              heading exists so the dialog still has an accessible name. */}
          <h1 id={headingId} class="dialog-sr-only">
            Understanding tour of {props.tour.subject()}
          </h1>

          <div class="understanding-top">
            <Show
              when={!props.tour.loading() && tour()}
              fallback={<span class="understanding-footer-fill" />}
            >
              <TourProgress
                subject={props.tour.subject()}
                titles={roots().map((root) => root.card.title)}
                current={props.tour.step()}
                onSelect={(index) => controller().navigate(index)}
                answered={answered()}
              />
            </Show>
            <Show when={shownTour()}>
              {/* The outline stands beside the card where the window has room;
                  this shows it in the card's place where it has not. */}
              <TourIconButton
                class="understanding-outline-toggle"
                label={overview() ? 'Hide outline' : 'Show outline'}
                tooltip="All cards at a glance"
                onClick={() => setOverview((open) => !open)}
              >
                <ListIcon size={14} />
              </TourIconButton>
              <TourCopyButton markdown={markdown} />
              <TourIconButton
                label={props.tour.savedPath() ? 'Tour saved' : 'Save tour'}
                tooltip={
                  props.tour.savedPath()
                    ? `Saved as ${props.tour.savedPath()} · new answers update it`
                    : 'Save to the worktree as Markdown, to reopen or share'
                }
                pressed={props.tour.savedPath() !== ''}
                disabled={props.tour.saving()}
                onClick={() => void controller().save()}
              >
                <BookmarkIcon size={14} />
              </TourIconButton>
              <Show when={props.onReference}>
                <TourIconButton
                  label="Reference in chat"
                  tooltip="Reference this card in the agent chat"
                  onClick={reference}
                >
                  <MentionIcon size={14} />
                </TourIconButton>
              </Show>
              <TourIconButton
                label="Rework tour"
                tooltip="Rework tour with your own instructions"
                onClick={() => setReworking((open) => !open)}
              >
                <PencilIcon size={14} />
              </TourIconButton>
            </Show>
            {closeButton()}
          </div>

          <Show when={reworking() && shownTour()}>
            <TourReworkBar onSubmit={rework} onCancel={() => setReworking(false)} />
          </Show>

          <Show when={shownTour() && props.tour.stale()}>
            <div class="understanding-notice" role="status">
              <span>This file changed after the tour was made.</span>
              <button
                type="button"
                class="understanding-notice-action btn-with-icon"
                onClick={() => controller().retry()}
              >
                <SyncIcon size={12} />
                Regenerate
              </button>
            </div>
          </Show>

          <Show when={props.tour.loading()}>
            <div class="understanding-stage" aria-busy="true">
              <div class="understanding-card understanding-card--message">
                <p class="understanding-status">
                  <span class="inline-spinner" aria-hidden="true" />
                  {props.tour.progress()}
                </p>
                <p role="status" class="understanding-substatus">
                  {props.tour.receiving() ? 'Receiving response' : 'Waiting for provider'} ·{' '}
                  {props.tour.elapsedSeconds()}s
                </p>
                <div class="understanding-skeleton" aria-hidden="true">
                  <For each={SKELETON_WIDTHS}>{(width) => <span style={{ width }} />}</For>
                </div>
              </div>
            </div>
            <div class="understanding-footer">
              <span class="understanding-footer-fill" />
              <TourIconButton
                label="Cancel generation"
                tooltip="Cancel generation"
                onClick={() => controller().cancel()}
              >
                <CloseIcon size={14} />
              </TourIconButton>
            </div>
          </Show>

          <Show when={!tour() && !props.tour.loading()}>
            <div class="understanding-stage understanding-stage--message">
              <div class="understanding-card understanding-card--message">
                <Show
                  when={props.tour.error()}
                  fallback={<p class="understanding-status">Generation cancelled.</p>}
                >
                  {(message) => (
                    <p role="alert" class="understanding-alert">
                      {message()}
                    </p>
                  )}
                </Show>
              </div>
            </div>
            {/* Cancelling was deliberate, so only a failure offers another attempt. */}
            <Show when={props.tour.error()}>
              <div class="understanding-footer">
                <span class="understanding-footer-fill" />
                <TourIconButton
                  primary
                  label="Retry"
                  tooltip="Retry"
                  onClick={() => controller().retry()}
                >
                  <RedoIcon />
                </TourIconButton>
              </div>
            </Show>
          </Show>

          {/* A failed follow-up keeps the tour on screen, so its message sits above the card. */}
          <Show when={tour() && !props.tour.loading() ? props.tour.error() : ''}>
            {(message) => (
              <div class="understanding-alert-row">
                <p role="alert" class="understanding-alert">
                  {message()}
                </p>
              </div>
            )}
          </Show>

          <Show when={!props.tour.loading() && node()}>
            {/* The outline replaces the card only where it has no room beside it,
                so widening the window with it open brings the card back. */}
            <div class="understanding-stage" data-overview={overview() ? '' : undefined}>
              {/* A fresh card per card, so it opens scrolled to the top with its
                  notes closed; the footer stays and keeps its focus. */}
              <Show when={props.tour.currentId()} keyed>
                {(_id) => <CardView />}
              </Show>
              <Show when={overview()}>
                <div class="understanding-card understanding-outline-card">{outline()}</div>
              </Show>
            </div>
            <div class="understanding-footer">
              <TourIconButton
                label="Previous card"
                tooltip="Previous card · ↑ ↓ go into and out of answers"
                disabled={!props.tour.hasPrevious()}
                onClick={() => controller().previous()}
              >
                <ChevronLeftIcon />
              </TourIconButton>
              <TourAskBar
                disabled={props.tour.asking() || !props.tour.canAsk()}
                asking={props.tour.pendingQuestion() !== ''}
                onAsk={(question) => void controller().ask(question)}
                onGoDeeper={() => controller().goDeeper()}
                onCancel={() => controller().cancel()}
              />
              <TourIconButton
                primary
                ref={(element) => (primaryRef = element)}
                label={onLastCard() ? 'Finish tour' : 'Next card'}
                tooltip={onLastCard() ? 'Finish' : 'Next card · Arrow keys navigate'}
                onClick={() => (onLastCard() ? props.onClose() : controller().next())}
              >
                <Show when={onLastCard()} fallback={<ChevronRightIcon />}>
                  <CheckIcon />
                </Show>
              </TourIconButton>
            </div>
          </Show>
        </div>

        <Show when={!props.tour.loading() && node()}>
          <aside class="understanding-aside">{outline()}</aside>
        </Show>
      </div>
    </Dialog>
  );
}
