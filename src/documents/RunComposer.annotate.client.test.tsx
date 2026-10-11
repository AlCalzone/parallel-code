import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStore } from '../store/core';
import { RunComposer } from './RunComposer';
import type { DocumentBlock } from './markdown-blocks';
import { setDocumentComposerDraft, type DocumentSelection } from './store';
import { workspaceUi, resetWorkspaceUi } from './workspace-ui';

const { addDocumentAnnotation, saveDocumentNoteDraft } = vi.hoisted(() => ({
  addDocumentAnnotation: vi.fn(async () => ({ id: 'saved-1' })),
  saveDocumentNoteDraft: vi.fn(async () => {
    setDocumentComposerDraft(null);
    return true;
  }),
}));

vi.mock('./agent-task', () => ({
  sendToDocumentAgent: vi.fn(() => Promise.resolve()),
}));

vi.mock('./store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./store')>()),
  addDocumentAnnotation,
  saveDocumentNoteDraft,
}));

const disposers: Array<() => void> = [];

beforeEach(() => {
  setStore('availableAgents', [
    {
      id: 'codex',
      name: 'Codex',
      command: 'codex',
      args: [],
      resume_args: [],
      skip_permissions_args: [],
      description: '',
    },
  ]);
});

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  document.body.replaceChildren();
  setStore({ projects: [], availableAgents: [] });
  setDocumentComposerDraft(null);
  resetWorkspaceUi();
  vi.clearAllMocks();
});

const blocks: DocumentBlock[] = [
  {
    index: 0,
    type: 'paragraph',
    raw: 'Body text.\n',
    html: '<p>Body text.</p>',
    startLine: 1,
    endLine: 1,
  },
];

const passage: DocumentSelection = {
  startBlock: 0,
  endBlock: 0,
  startLine: 1,
  endLine: 1,
  quote: 'Body text.',
  heading: undefined,
  wholeDocument: false,
};

function type(host: HTMLElement, text: string): HTMLTextAreaElement {
  const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
  textarea.value = text;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  return textarea;
}

function askButton(host: HTMLElement): HTMLButtonElement | null {
  return (
    Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ask') ?? null
  );
}

function pressEnter(textarea: HTMLTextAreaElement, ctrlKey = false): void {
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ctrlKey }));
}

describe('RunComposer while an input method is composing', () => {
  it('leaves Enter to the IME instead of saving a half-typed note', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    disposers.push(
      render(() => <RunComposer selection={passage} blocks={blocks} onClose={() => {}} />, host),
    );
    setDocumentComposerDraft({ text: '', mode: 'note' });
    const textarea = type(host, '注意');

    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
    );
    await Promise.resolve();
    expect(saveDocumentNoteDraft).not.toHaveBeenCalled();

    pressEnter(textarea);
    expect(saveDocumentNoteDraft).not.toHaveBeenCalled();
    pressEnter(textarea, true);
    await vi.waitFor(() => expect(saveDocumentNoteDraft).toHaveBeenCalledOnce());
  });
});

describe('RunComposer after a comment or question is saved', () => {
  it('asks an agent from the Ask composer and drops a comment draft it took over', async () => {
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    disposers.push(
      render(() => <RunComposer selection={passage} blocks={blocks} onClose={onClose} />, host),
    );

    setDocumentComposerDraft({ text: '', mode: 'question' });
    const textarea = type(host, 'Why is this here?');
    askButton(host)?.click();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(addDocumentAnnotation).toHaveBeenCalledWith(
      'question',
      'Why is this here?',
      expect.anything(),
      { askWith: expect.objectContaining({ id: 'codex' }) },
    );
    // The comment is not also autosaved on the way out.
    expect(saveDocumentNoteDraft).not.toHaveBeenCalled();
    expect(textarea.value).toBe('');
    expect(workspaceUi.focusedAnnotationId).toBe('saved-1');
  });

  it('keeps Ask off until there is text for it', () => {
    const host = document.createElement('div');
    document.body.append(host);
    disposers.push(
      render(() => <RunComposer selection={passage} blocks={blocks} onClose={() => {}} />, host),
    );
    setDocumentComposerDraft({ text: '', mode: 'question' });

    expect(askButton(host)?.disabled).toBe(true);
    type(host, 'Why?');
    expect(askButton(host)?.disabled).toBe(false);
  });

  it('saves a comment with the existing shortcut and offers no Ask beside it', async () => {
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    disposers.push(
      render(() => <RunComposer selection={passage} blocks={blocks} onClose={onClose} />, host),
    );

    setDocumentComposerDraft({ text: '', mode: 'note' });
    const textarea = type(host, 'Revisit this paragraph.');
    expect(host.querySelector('details')).toBeNull();
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(host.querySelector('.docws-composer-quote')).toBeNull();
    expect(host.querySelector('.docws-composer-scope')).toBeNull();
    expect(Array.from(host.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual([
      '',
    ]);
    pressEnter(textarea, true);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(saveDocumentNoteDraft).toHaveBeenCalledOnce();
    expect(addDocumentAnnotation).not.toHaveBeenCalled();
  });

  it('keeps the text when saving failed, so nothing typed is lost', async () => {
    addDocumentAnnotation.mockResolvedValueOnce(null as never);
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    disposers.push(
      render(() => <RunComposer selection={passage} blocks={blocks} onClose={onClose} />, host),
    );

    setDocumentComposerDraft({ text: '', mode: 'question' });
    const textarea = type(host, 'Why is this here?');
    askButton(host)?.click();
    await vi.waitFor(() => expect(addDocumentAnnotation).toHaveBeenCalled());

    expect(onClose).not.toHaveBeenCalled();
    expect(textarea.value).toBe('Why is this here?');
  });

  it('sends a question with the save shortcut and never autosaves it as a comment', async () => {
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    disposers.push(
      render(() => <RunComposer selection={passage} blocks={blocks} onClose={onClose} />, host),
    );

    setDocumentComposerDraft({ text: '', mode: 'question' });
    expect(host.querySelector('[aria-label="Ask about this passage"]')).not.toBeNull();
    const textarea = type(host, 'Is this still true?');
    textarea.dispatchEvent(new FocusEvent('blur'));
    pressEnter(textarea, true);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(addDocumentAnnotation).toHaveBeenCalledWith(
      'question',
      'Is this still true?',
      expect.anything(),
      { askWith: expect.objectContaining({ id: 'codex' }) },
    );
    expect(saveDocumentNoteDraft).not.toHaveBeenCalled();
  });
});
