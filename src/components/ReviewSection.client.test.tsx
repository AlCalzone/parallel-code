import { render } from 'solid-js/web';
import { createStore, type SetStoreFunction } from 'solid-js/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCancel,
  mockDismiss,
  mockRate,
  mockRefreshCode,
  mockRestore,
  mockSetChecks,
  mockSetModel,
  mockStage,
} = vi.hoisted(() => ({
  mockSetModel: vi.fn(),
  mockCancel: vi.fn(),
  mockDismiss: vi.fn(),
  mockRate: vi.fn(),
  mockRefreshCode: vi.fn((_taskId: string) => Promise.resolve()),
  mockRestore: vi.fn(),
  mockSetChecks: vi.fn(),
  mockStage: vi.fn(() => true),
}));

vi.mock('../store/task-brief', () => ({ refreshCodeFingerprint: mockRefreshCode }));

vi.mock('../store/task-review', () => ({
  cancelTaskReview: mockCancel,
  reviewerName: () => 'opus',
  taskReviewModel: () => ({ provider: 'claude', model: 'opus' }),
  setTaskReviewModel: mockSetModel,
}));

// Stands in for the model call: answers with a fixed setup at once.
vi.mock('./SuggestChecksButton', () => ({
  SuggestChecksButton: (props: {
    label?: string;
    onSuggest: (suggestion: {
      verifyCommand: string;
      checks: { kind: 'static'; command: string; run: 'auto' }[];
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        props.onSuggest({
          verifyCommand: 'npm run check',
          checks: [
            { kind: 'static', command: 'npm run lint', run: 'auto' },
            { kind: 'static', command: 'npm test', run: 'auto' },
          ],
        })
      }
    >
      {props.label}
    </button>
  ),
}));

vi.mock('../store/review-run', () => ({ startReview: mockRate, setReviewChecks: mockSetChecks }));

vi.mock('../store/review', () => ({
  dismissReviewItem: mockDismiss,
  restoreReviewItem: mockRestore,
  setReviewDismissReason: vi.fn(),
  stageRework: mockStage,
}));

import { reviewItemId } from '../lib/review-summary';
import { setStore, store } from '../store/core';
import type { Project, Task } from '../store/types';
import { ReviewSection } from './ReviewSection';

/** A project whose review checks were picked before, unless a test says otherwise. */
function setProject(overrides: Partial<Project> = {}) {
  setStore('projects', [
    {
      id: 'project',
      name: 'Weather',
      path: '/repo',
      color: '#fff',
      verifyCommand: 'npm run check',
      evidenceChecks: [
        { id: 'unit', name: 'Unit', kind: 'unit', command: 'npm test', run: 'auto' },
        { id: 'e2e', name: 'E2E', kind: 'e2e', command: 'npm run e2e', run: 'on-demand' },
      ],
      reviewChecks: [],
      ...overrides,
    },
  ]);
}

let dispose: (() => void) | undefined;
beforeEach(() => setProject());
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.clearAllMocks();
});

const OPEN = 'Remember-me path not handled.';

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task',
    name: 'Fix login redirect',
    projectId: 'project',
    branchName: 'branch',
    worktreePath: '/repo',
    agentIds: ['agent'],
    shellAgentIds: [],
    notes: '',
    lastPrompt: '',
    gitIsolation: 'worktree',
    brief: {
      brief: {
        goal: 'Send people back after sign-in.',
        headline: '',
        unbacked: [],
        changed: [{ text: 'Sign-in lands on the requested page.' }],
        extra: [{ text: 'Renamed parseNext.' }],
        open: [{ text: OPEN }],
        decided: [{ text: 'Cookie lasts 5 minutes.' }],
      },
      generatedAt: 2_000,
      fingerprint: 'same',
      turns: [],
      decisions: {},
    },
    confidence: {
      scores: [
        { label: 'Correctness', score: 88, why: 'Tested.' },
        { label: 'Completeness', score: 50, why: 'Misses remember-me.' },
      ],
      findings: [],
      publishedAt: 3_000,
      fingerprint: 'same',
    },
    ...overrides,
  };
}

function mount(task: Task, verifyFailed = false) {
  const [state, setState] = createStore(task);
  const onReworkStaged = vi.fn();
  const onOpenFile = vi.fn();
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(
    () => (
      <ReviewSection
        task={state}
        verifyFailed={verifyFailed}
        onReworkStaged={onReworkStaged}
        onOpenFile={onOpenFile}
      />
    ),
    root,
  );
  return { root, setState, onReworkStaged, onOpenFile };
}

const buttons = (root: HTMLElement) => Array.from(root.querySelectorAll('button'));
const button = (root: HTMLElement, label: string | RegExp) => {
  const found = buttons(root).find((b) => {
    const text = b.textContent?.trim() ?? '';
    return typeof label === 'string' ? text === label : label.test(text);
  });
  if (!found) throw new Error(`Missing button ${String(label)}`);
  return found;
};

function dismiss(setState: SetStoreFunction<Task>, text: string, reason = '') {
  setState('reviewDismissed', { [reviewItemId('risk', text)]: { text, reason } });
}

/** The review's box in the follow-ups row: one action that runs, cancels or opens the review. */
const toggle = (root: HTMLElement) => {
  const found = root.querySelector<HTMLButtonElement>('.finish-followup .change-tour-action');
  if (!found) throw new Error('Missing review action');
  return found;
};
const heading = (root: HTMLElement) =>
  toggle(root).querySelector('.change-tour-action-label')?.firstChild?.textContent;
/** Opens the review unless it opened on its own. */
const expand = (root: HTMLElement) => {
  if (toggle(root).getAttribute('aria-expanded') !== 'true') toggle(root).click();
};
const settings = (root: HTMLElement) => button(root, 'Change settings');
/** Starts a review from the open settings. */
const start = (root: HTMLElement) => button(root, /Start review/).click();

describe('ReviewSection', () => {
  it('asks what to run on the first review in a project and saves the pick', () => {
    setProject({ reviewChecks: undefined });
    const { root } = mount(baseTask({ confidence: undefined }));
    toggle(root).click();
    expect(mockRate).not.toHaveBeenCalled();
    const boxes = [...root.querySelectorAll<HTMLInputElement>('fieldset input[type="checkbox"]')];
    const labels = boxes.map((box) => box.closest('label')?.textContent);
    expect(labels).toEqual([
      expect.stringContaining('What changed, risks and scores'),
      expect.stringContaining('npm run check'),
      expect.stringContaining('npm test'),
      expect.stringContaining('npm run e2e'),
    ]);
    // The reviewer always runs; on-demand checks start unpicked.
    expect(boxes.map((box) => [box.checked, box.disabled])).toEqual([
      [true, true],
      [true, false],
      [true, false],
      [false, false],
    ]);
    expect(root.querySelector('fieldset [aria-label^="Reviewer model"]')?.textContent).toBe('opus');
    boxes[2].click();
    button(root, /Start review/).click();
    expect(mockSetChecks).toHaveBeenCalledWith('task', {
      ids: ['verify'],
      verifyCommand: undefined,
      newChecks: [],
    });
    // The reviewer was left as it was, so the task keeps following Settings › Review.
    expect(mockSetModel).not.toHaveBeenCalled();
    expect(mockRate).toHaveBeenCalledWith('task');
    expect(root.querySelector('fieldset')).toBeNull();
  });

  it('sets up missing checks with AI, saving only the suggestions picked', () => {
    setProject({ reviewChecks: undefined, verifyCommand: undefined });
    const { root } = mount(baseTask({ confidence: undefined }));
    toggle(root).click();
    button(root, 'Set up checks with AI').click();
    const labels = [...root.querySelectorAll<HTMLInputElement>('fieldset input[type="checkbox"]')];
    const suggested = labels.filter((box) =>
      box.closest('label')?.textContent?.includes('suggested'),
    );
    // npm test is already the unit check, so only verify and lint are new; neither is picked yet.
    expect(suggested.map((box) => [box.closest('label')?.textContent, box.checked])).toEqual([
      [expect.stringContaining('npm run check'), false],
      [expect.stringContaining('npm run lint'), false],
    ]);
    expect(root.textContent).not.toContain('Set up checks with AI');
    suggested[1].click();
    button(root, /Start review/).click();
    expect(mockSetChecks).toHaveBeenCalledWith('task', {
      ids: ['unit', 'static-checks'],
      verifyCommand: undefined,
      newChecks: [
        {
          id: 'static-checks',
          name: 'Static checks',
          kind: 'static',
          command: 'npm run lint',
          run: 'auto',
        },
      ],
    });
  });

  it('says when there is no verify command, and Cancel runs nothing', () => {
    setProject({ reviewChecks: undefined, verifyCommand: undefined });
    const { root } = mount(baseTask({ confidence: undefined }));
    toggle(root).click();
    expect(root.querySelector('fieldset')?.textContent).toContain('No verify command set');
    button(root, 'Cancel').click();
    expect(root.querySelector('fieldset')).toBeNull();
    expect(mockSetChecks).not.toHaveBeenCalled();
    expect(mockRate).not.toHaveBeenCalled();
  });

  it('names a picked check that failed, and runs again with other settings', () => {
    setProject({ reviewChecks: ['verify', 'unit'] });
    const run = (checkId: string, status: 'passed' | 'failed') => ({
      checkId,
      name: checkId,
      kind: 'unit' as const,
      command: 'x',
      status,
      exitCode: status === 'passed' ? 0 : 1,
      headSha: 'h',
      dirty: false,
      startedAt: 'a',
      finishedAt: 'b',
      outputTail: '',
    });
    const { root } = mount(
      baseTask({
        evidence: {
          checks: [run('verify', 'passed'), run('unit', 'failed')],
          skipped: [],
        } as unknown as Task['evidence'],
      }),
    );
    expand(root);
    // Results sit in the readiness rows above; the review names what failed.
    expect(root.querySelector('[aria-label="Confidence"]')?.textContent).toContain(
      'Not ready to merge: Unit failed',
    );
    settings(root).click();
    const boxes = [...root.querySelectorAll<HTMLInputElement>('fieldset input[type="checkbox"]')];
    // It starts from the saved pick.
    expect(boxes.map((box) => box.checked)).toEqual([true, true, true, false]);
    boxes[3].click();
    button(root, /Start review/).click();
    expect(mockSetChecks).toHaveBeenCalledWith('task', {
      ids: ['verify', 'unit', 'e2e'],
      verifyCommand: undefined,
      newChecks: [],
    });
    expect(mockRate).toHaveBeenCalledWith('task');
  });

  it('shows what was asked, what changed and the key line from the reviewer alone', () => {
    const task = baseTask({ brief: undefined });
    const { root, onOpenFile } = mount({
      ...task,
      confidence: task.confidence && {
        ...task.confidence,
        asked: 'Keep ?next= through sign-in.',
        changes: [
          { now: 'You land where you were going', before: 'instead of /.', tested: 'unit' },
          { now: 'Lost return URLs are remembered' },
        ],
        keyLine: { file: 'src/auth.ts', line: 72, why: 'The only redirect guard.' },
      },
    });
    expand(root);
    const text = root.textContent ?? '';
    expect(text).toContain('Asked Keep ?next= through sign-in.');
    const items = [...root.querySelectorAll('ol li')].map((li) => li.textContent);
    expect(items).toEqual([
      'You land where you were going instead of /.unit',
      'Lost return URLs are remembereduntested',
    ]);
    expect(text).not.toContain('brief');
    button(root, 'src/auth.ts:72').click();
    expect(onOpenFile).toHaveBeenCalledWith('src/auth.ts', 72);
  });

  it('stays one follow-up until asked, and Run review asks what to run first', () => {
    const { root } = mount(baseTask({ confidence: undefined }));
    expect(root.querySelector('h3')?.textContent).toBe('Before you merge');
    expect(heading(root)).toBe('Run review');
    expect(toggle(root).title).toContain('Checks the work against what you asked');
    expect(root.textContent).not.toContain('Asked ');
    // Nothing to open yet, so the action is no disclosure.
    expect(toggle(root).hasAttribute('aria-expanded')).toBe(false);
    // Opening the dialog sends nothing.
    expect(mockRate).not.toHaveBeenCalled();
    toggle(root).click();
    // The task's first review shows its settings, from the saved pick, before it runs.
    expect(mockRate).not.toHaveBeenCalled();
    expect(toggle(root).getAttribute('aria-expanded')).toBe('true');
    expect(toggle(root).title).toBe('Close the review settings');
    toggle(root).click();
    expect(root.querySelector('fieldset')).toBeNull();
    toggle(root).click();
    start(root);
    expect(mockRate).toHaveBeenCalledWith('task');
  });

  it("picks the reviewer for this task in the review's settings", () => {
    setStore('reviewModel', { provider: 'claude', model: 'opus' });
    const { root } = mount(baseTask({ confidence: undefined }));
    // One model menu, inside the settings; the button itself has none.
    expect(root.querySelectorAll('[aria-haspopup="menu"]')).toHaveLength(0);
    toggle(root).click();
    const menu = root.querySelector<HTMLButtonElement>('fieldset [aria-label^="Reviewer model"]');
    if (!menu) throw new Error('Missing reviewer menu');
    expect(menu.textContent).toBe('opus');
    menu.click();
    const sonnet = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(
      (row) => row.textContent?.trim() === 'sonnet',
    );
    if (!sonnet) throw new Error('Missing sonnet row');
    sonnet.click();
    expect(mockSetModel).not.toHaveBeenCalled();
    button(root, /Start review/).click();
    expect(mockSetModel).toHaveBeenCalledWith('task', { provider: 'claude', model: 'sonnet' });
    // Settings › Review stays the default for other tasks.
    expect(store.reviewModel).toEqual({ provider: 'claude', model: 'opus' });
    expect(mockRate).toHaveBeenCalledWith('task');
  });

  it('says it runs in the background on the reviewer model, and can be cancelled', () => {
    const { root, setState } = mount(
      baseTask({ confidence: undefined, reviewStatus: { state: 'running', startedAt: 5_000 } }),
    );
    expect(heading(root)).toBe('Reviewing with opus');
    expect(toggle(root).textContent).toContain('You can close this dialog');
    expect(toggle(root).title).toBe('Cancel the review');
    expect(buttons(root).some((b) => /Run review/.test(b.textContent ?? ''))).toBe(false);
    toggle(root).click();
    expect(mockCancel).toHaveBeenCalledWith('task');
    const rated = baseTask().confidence;
    if (!rated) throw new Error('Missing rating');
    setState({ confidence: { ...rated, publishedAt: 6_000 }, reviewStatus: undefined });
    expect(heading(root)).toBe('Review · 50% · 1 open');
    expect(toggle(root).textContent).not.toContain('You can close this dialog');
  });

  it('says why a review failed and offers it again', () => {
    const { root } = mount(
      baseTask({ confidence: undefined, reviewStatus: { state: 'failed', message: 'No CLI' } }),
    );
    expect(heading(root)).toBe('Retry review');
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('The review failed: No CLI');
    toggle(root).click();
    start(root);
    expect(mockRate).toHaveBeenCalledWith('task');
  });

  it('keeps older scores after a failed review and says they are older', () => {
    const { root } = mount(baseTask({ reviewStatus: { state: 'failed', message: 'Timed out' } }));
    expect(heading(root)).toBe('Review · 50% · 1 open');
    expand(root);
    expect(root.textContent).toContain(
      'The last review failed, so these scores are older: Timed out',
    );
    button(root, 'Run review again').click();
    expect(mockRate).toHaveBeenCalledWith('task');
  });

  it('folds a review of older code into the verdict, and shows it on request', () => {
    const { root } = mount(baseTask({ codeFingerprint: { fingerprint: 'newer', at: 4_000 } }));
    expect(heading(root)).toBe('Review · 50% · 1 open');
    expect(root.querySelector('[aria-label="Confidence"]')).toBeNull();
    expand(root);
    expect(root.querySelector('[aria-label="Confidence"]')).not.toBeNull();
  });

  it('folds a review of the code as it is now until asked, then folds it on request', () => {
    const { root } = mount(baseTask({ codeFingerprint: { fingerprint: 'same', at: 4_000 } }), true);
    // The readiness row above says verify failed, so the review's line does not repeat it.
    expect(heading(root)).toBe('Review · 50% · 1 open');
    expect(toggle(root).getAttribute('aria-expanded')).toBe('false');
    toggle(root).click();
    expect(toggle(root).getAttribute('aria-expanded')).toBe('true');
    expect(root.textContent).toContain('Asked Send people back after sign-in.');
    // The weakest score stands for the whole; every score keeps its reason.
    const card = root.querySelector('[aria-label="Confidence"]');
    expect(card?.textContent).toContain('50%confident · held back by Completeness');
    expect([...(card?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
      'Correctness88%Tested.',
      'Completeness50%Misses remember-me.',
    ]);
    expect(root.textContent).not.toContain('Cookie lasts 5 minutes.');
    // A current rating can still be run again, say on another model; it is checked against the code as it is now.
    expect(button(root, 'Run review again').disabled).toBe(false);
    expect(mockRefreshCode).toHaveBeenCalledWith('task');
    expect(toggle(root).getAttribute('aria-expanded')).toBe('true');
    toggle(root).click();
    expect(toggle(root).getAttribute('aria-expanded')).toBe('false');
    expect(root.textContent).not.toContain('Asked ');
  });

  /** Makes the next code read wait until the test settles it, as a real diff read does. */
  function pendingCodeRead() {
    let finish: () => void = () => {};
    mockRefreshCode.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    return async () => {
      finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
  }

  it('stays folded when the code read confirms the rating is current', async () => {
    const settle = pendingCodeRead();
    const { root, setState } = mount(baseTask());
    setState('codeFingerprint', { fingerprint: 'same', at: 4_000 });
    await settle();
    expect(toggle(root).getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves a review the user folded while the code was read', async () => {
    const settle = pendingCodeRead();
    const { root, setState } = mount(baseTask());
    expand(root);
    toggle(root).click();
    setState('codeFingerprint', { fingerprint: 'same', at: 4_000 });
    await settle();
    expect(toggle(root).getAttribute('aria-expanded')).toBe('false');
  });

  it('opens a review that finishes while the dialog is open', () => {
    const { root, setState } = mount(
      baseTask({
        confidence: undefined,
        reviewStatus: { state: 'running', startedAt: 1 },
      }),
    );
    setState('confidence', baseTask().confidence);
    setState('codeFingerprint', { fingerprint: 'same', at: 4_000 });
    setState('reviewStatus', undefined);
    expect(toggle(root).getAttribute('aria-expanded')).toBe('true');
  });

  it('opens on its own for a claim the diff does not back, even unrated', () => {
    const task = baseTask({ confidence: undefined });
    const brief = task.brief;
    if (!brief) throw new Error('Missing brief');
    const unbacked = [{ text: 'Says the tests pass.' }];
    const { root } = mount({ ...task, brief: { ...brief, brief: { ...brief.brief, unbacked } } });
    expect(heading(root)).toBe('Review · 2 open risks');
    expect(toggle(root).getAttribute('aria-expanded')).toBe('true');
    expect(root.textContent).toContain('Says the tests pass.');
    button(root, 'Run review').click();
    start(root);
    expect(mockRate).toHaveBeenCalledWith('task');
  });

  it('collects picks into one staged rework prompt', () => {
    const { root, onReworkStaged } = mount(baseTask());
    expand(root);
    expect(button(root, 'Rework (0)').disabled).toBe(true);
    const icon = () => button(root, 'Fix').querySelector('svg path')?.getAttribute('d');
    const plus = icon();
    expect(plus).toBeTruthy();

    button(root, 'Fix').click();
    expect(icon()).toBeTruthy();
    expect(icon()).not.toBe(plus);
    button(root, 'Revert').click();
    expect(root.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);
    // The label stays put; only the pressed state and the icon change.
    expect(button(root, 'Fix').getAttribute('aria-pressed')).toBe('true');

    button(root, 'Rework (2)').click();
    expect(mockStage).toHaveBeenCalledWith('task', [
      expect.objectContaining({ text: OPEN }),
      expect.objectContaining({ text: 'Renamed parseNext.' }),
    ]);
    expect(onReworkStaged).toHaveBeenCalled();
  });

  it('keeps a dismissed risk in place with its reason field, and drops its pick', () => {
    const { root, setState } = mount(baseTask());
    expand(root);
    button(root, 'Fix').click();
    expect(button(root, 'Rework (1)')).toBeTruthy();

    button(root, 'Accept').click();
    expect(mockDismiss).toHaveBeenCalledWith(
      'task',
      expect.objectContaining({ id: reviewItemId('risk', OPEN) }),
    );
    dismiss(setState, OPEN);
    expect(heading(root)).toBe('Review · 50% · nothing open');
    expect(root.textContent).toContain(OPEN);
    expect(button(root, 'Rework (0)').disabled).toBe(true);
    expect(root.textContent).not.toContain('Accepted earlier');

    const input = root.querySelector<HTMLInputElement>('input[type="text"]');
    if (!input) throw new Error('Missing reason field');
    input.focus();
    // A store update while typing must not rebuild the field under the cursor.
    dismiss(setState, OPEN, 'Gone soon');
    expect(root.querySelector('input[type="text"]')).toBe(input);
    expect(document.activeElement).toBe(input);

    button(root, 'Undo').click();
    expect(mockRestore).toHaveBeenCalledWith('task', reviewItemId('risk', OPEN));
    setState('reviewDismissed', undefined);
    // Undo brings the risk back as it was, pick included.
    expect(button(root, 'Rework (1)').disabled).toBe(false);
  });

  it('folds risks dismissed before the dialog opened', () => {
    const task = baseTask({
      reviewDismissed: { [reviewItemId('risk', OPEN)]: { text: OPEN, reason: 'Gone soon' } },
    });
    const { root } = mount(task);
    expand(root);
    expect(root.textContent).toContain('Nothing left open.');
    expect(root.textContent).not.toContain(OPEN);
    button(root, 'Accepted earlier (1)').click();
    expect(root.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('Gone soon');
  });

  it('folds long lists behind a show-more button', () => {
    const task = baseTask();
    const brief = task.brief;
    if (!brief) throw new Error('Missing brief');
    const extra = Array.from({ length: 7 }, (_, i) => ({ text: `Extra ${i}.` }));
    const { root } = mount({ ...task, brief: { ...brief, brief: { ...brief.brief, extra } } });
    expand(root);
    expect(buttons(root).filter((b) => b.textContent?.includes('Revert'))).toHaveLength(5);
    button(root, 'Show 2 more').click();
    expect(buttons(root).filter((b) => b.textContent?.includes('Revert'))).toHaveLength(7);
  });

  it('offers a new rating once the code moved past the old one', () => {
    const { root, setState } = mount(
      baseTask({ codeFingerprint: { fingerprint: 'newer', at: 4_000 } }),
    );
    expand(root);
    expect(root.textContent).toContain('the code changed since');
    button(root, 'Run review again').click();
    expect(mockRate).toHaveBeenCalledWith('task');
    setState('reviewStatus', { state: 'running', startedAt: 5_000 });
    expect(heading(root)).toBe('Reviewing with opus');
    expect(button(root, 'Reviewing…').hasAttribute('disabled')).toBe(true);
  });

  it('shows no rework footer when there is nothing to pick', () => {
    const task = baseTask();
    const brief = task.brief;
    if (!brief) throw new Error('Missing brief');
    const { root } = mount({
      ...task,
      brief: { ...brief, brief: { ...brief.brief, open: [], extra: [] } },
      confidence: { ...task.confidence, scores: [], findings: [], publishedAt: 3_000 },
    });
    expand(root);
    expect(heading(root)).toBe('Review · No open risks');
    expect(buttons(root).some((b) => b.textContent?.startsWith('Rework'))).toBe(false);
  });
});
