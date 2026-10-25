import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { createStore, type SetStoreFunction } from 'solid-js/store';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../store/task-brief', () => ({ refreshTaskBrief: vi.fn() }));
const [working, setWorking] = createSignal(false);
vi.mock('../store/taskStatus', () => ({ isTaskWorking: () => working() }));

import type { Task } from '../store/types';
import { TaskBriefBar, TaskBriefLine } from './TaskBrief';

let dispose: (() => void) | undefined;
let lastSetState: SetStoreFunction<Task> | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  setWorking(false);
  vi.clearAllMocks();
});

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task',
    name: 'Move billing webhooks onto a queue',
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
        goal: 'Stop webhook timeouts.',
        now: 'Two events queued; moving the other nine next.',
      },
      generatedAt: 2_000,
      fingerprint: 'new',
    },
    confidence: {
      scores: [
        { label: 'Correct', score: 70, why: 'Happy path tested.', verified: ['read the worker'] },
        { label: 'Complete', score: 40, why: 'No dedupe.' },
      ],
      findings: [{ kind: 'extra', text: 'Added Redis to production compose.' }],
      source: 'review skill',
      publishedAt: 1_000,
      fingerprint: 'old',
    },
    ...overrides,
  };
}

function mount(task: Task) {
  const [state, setState] = createStore(task);
  lastSetState = setState;
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(() => <TaskBriefBar task={state} />, root);
  const bar = root.querySelector<HTMLButtonElement>('.task-brief-bar');
  if (!bar) throw new Error('Missing brief bar');
  return { bar };
}

const card = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Task brief"]');
const button = (label: string) =>
  Array.from(card()?.querySelectorAll('button') ?? []).find((b) => b.textContent === label);

describe('TaskBriefBar', () => {
  it('leads with the goal', () => {
    const { bar } = mount(baseTask());
    expect(bar.textContent).toContain('Stop webhook timeouts.');
    expect(bar.textContent).not.toContain('Two events queued');
    // Labelled, so the line can be read without opening the card.
    expect(bar.textContent).toContain('Goal');
    expect(bar.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the goal and the current step, and leaves ratings to the Finish review', () => {
    const { bar } = mount(baseTask());
    // The fixture carries a rating, which belongs to finishing rather than to the brief.
    expect(bar.textContent).not.toContain('%');
    expect(bar.textContent).not.toContain('out of date');
    bar.click();
    expect(bar.getAttribute('aria-expanded')).toBe('true');
    const terms = Array.from(card()?.querySelectorAll('dt') ?? []).map((dt) => dt.textContent);
    expect(terms).toEqual(['Goal', 'Now']);
    const text = card()?.textContent ?? '';
    expect(text).toContain('Stop webhook timeouts.');
    expect(text).toContain('Two events queued; moving the other nine next.');
    expect(text).not.toContain('Happy path tested.');
    expect(button('Run review')).toBeUndefined();
    expect(button('Review again')).toBeUndefined();
  });

  it('leads with what the agent needs and flags it on the bar', () => {
    const { bar } = mount(baseTask());
    expect(bar.textContent).not.toContain('Needs you');
    lastSetState?.('brief', 'brief', 'needsYou', 'Deduplicate by event ID or invoice ID?');
    expect(bar.textContent).toContain('Needs you');
    expect(bar.textContent).toContain('Deduplicate by event ID or invoice ID?');
    expect(bar.textContent).not.toContain('Stop webhook timeouts.');
    bar.click();
    const terms = Array.from(card()?.querySelectorAll('dt') ?? []).map((dt) => dt.textContent);
    expect(terms).toEqual(['Goal', 'Now', 'Needs you']);
  });

  it('drops a question the agent has moved past while it works on the answer', () => {
    const { bar } = mount(baseTask());
    lastSetState?.('brief', 'brief', 'needsYou', 'Deduplicate by event ID or invoice ID?');
    setWorking(true);
    expect(bar.hasAttribute('data-urgent')).toBe(false);
    expect(bar.textContent).not.toContain('Needs you');
    expect(bar.textContent).toContain('Stop webhook timeouts.');
    bar.click();
    const terms = Array.from(card()?.querySelectorAll('dt') ?? []).map((dt) => dt.textContent);
    expect(terms).toEqual(['Goal', 'Now']);
  });

  it('closes on Escape', () => {
    const { bar } = mount(baseTask());
    bar.click();
    expect(card()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(card()).toBeNull();
  });

  it('leaves Escape to the focused element once closed by a click outside', () => {
    const { bar } = mount(baseTask());
    const terminal = document.createElement('textarea');
    document.body.append(terminal);
    bar.click();
    terminal.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(card()).toBeNull();

    terminal.focus();
    const reached = vi.fn();
    terminal.addEventListener('keydown', reached);
    terminal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(reached).toHaveBeenCalled();
    expect(document.activeElement).toBe(terminal);
    terminal.remove();
  });

  it('explains the empty state before the first brief', () => {
    const { bar } = mount(baseTask({ brief: undefined }));
    expect(bar.textContent).toContain('The brief appears after the agent finishes a turn');
  });
});

describe('TaskBriefLine', () => {
  it('shows what the agent needs, else the goal, and nothing without a brief', () => {
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(
      () => (
        <>
          <TaskBriefLine task={baseTask()} />
          <TaskBriefLine task={baseTask({ brief: undefined })} />
          <TaskBriefLine
            task={baseTask({
              brief: {
                brief: { goal: 'g', now: 'n', needsYou: 'Which queue?' },
                generatedAt: 0,
                fingerprint: '',
              },
            })}
          />
        </>
      ),
      root,
    );
    const lines = Array.from(root.querySelectorAll('.task-brief-line'), (el) => el.textContent);
    expect(lines).toEqual(['Stop webhook timeouts.', 'Which queue?']);
  });
});
