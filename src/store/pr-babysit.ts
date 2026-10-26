/** PR babysitting: sends a task's failing PR checks to its agent until CI passes. */
import { errMessage, warn as logWarn } from '../lib/log';
import { parseGitHubUrl } from '../lib/github-url';
import {
  MAX_BABYSIT_ATTEMPTS,
  babysitCiWaitReason,
  nextBabysitStep,
  type PrBabysit,
} from '../lib/pr-babysit';
import { setStore, store } from './core';
import { composerInputBlocker } from './delegation';
import { getPullRequestDetails, loadFailedChecksPrompt } from './github';
import { isLandedTaskState } from './landing';
import { showNotification } from './notification';
import { saveState } from './persistence';
import { getPrChecks } from './pr-checks-state';
import { taskPrUrl } from './pr-checks';
import { isAgentAskingQuestion, isAgentIdle } from './taskStatus';
import { sendPrompt } from './tasks';

// shortcut: polling store reads is cheap and CI moves in minutes; an effect
// plus timers for typing holds would only matter if latency did.
const BABYSIT_TICK_MS = 5_000;
// An agent starts a turn within a second or two of Enter; fixing CI takes far longer.
const START_CHECK_MS = 10_000;

export function getPrBabysit(taskId: string): PrBabysit | undefined {
  return store.tasks[taskId]?.prBabysit;
}

/**
 * Turns babysitting on for the task's PR. Only PRs the signed-in GitHub user
 * opened qualify: their CI logs come from the user's own code, which is what
 * makes sending them unreviewed acceptable. Returns whether it was turned on.
 */
export async function startPrBabysit(taskId: string): Promise<boolean> {
  const task = store.tasks[taskId];
  const prUrl = task ? taskPrUrl(task) : null;
  if (!prUrl) return false;
  const details = await getPullRequestDetails(prUrl);
  if (details.authoredByViewer !== true) {
    showNotification(
      details.authoredByViewer === false
        ? 'Babysit is only available for pull requests you opened.'
        : 'Could not confirm you opened this pull request. Is gh signed in?',
    );
    return false;
  }
  if (!store.tasks[taskId]) return false;
  setPrBabysit(taskId, { attempts: 0 });
  return true;
}

export function stopPrBabysit(taskId: string): void {
  if (getPrBabysit(taskId)) setPrBabysit(taskId, undefined);
}

function setPrBabysit(taskId: string, next: PrBabysit | undefined): void {
  // Replace rather than merge, so a reset drops `lastSentSha` cleanly.
  setStore('tasks', taskId, 'prBabysit', next === undefined ? undefined : { ...next });
  void saveState();
}

/** Why the task's first agent cannot take an automatic prompt now; null when it can. */
export function babysitAgentBlocker(taskId: string): string | null {
  const task = store.tasks[taskId];
  const agentId = task?.agentIds[0];
  const agent = agentId ? store.agents[agentId] : undefined;
  if (!task || !agentId || agent?.status !== 'running') return 'The agent is not running';
  // A paused task holds all automatic input, babysit included.
  if (task.delegationPaused) return 'The task is paused';
  if (task.closingStatus === 'closing' || task.closingStatus === 'removing')
    return 'The task is closing';
  if (isLandedTaskState(task.landingState)) return 'The task has landed';
  if (!isAgentIdle(agentId)) return 'The agent is busy';
  if (isAgentAskingQuestion(agentId)) return 'The agent seems to be waiting for an answer';
  return composerInputBlocker(task, true);
}

/** The task's first agent when it can take an automatic prompt now. */
function readyAgentId(taskId: string): string | null {
  return babysitAgentBlocker(taskId) === null ? (store.tasks[taskId]?.agentIds[0] ?? null) : null;
}

/** What babysitting is waiting for, shown on its toggle; null when it is off. */
export function prBabysitStatus(taskId: string): string | null {
  const babysit = getPrBabysit(taskId);
  if (!babysit) return null;
  const ciReason = babysitCiWaitReason(babysit, getPrChecks(taskId));
  if (ciReason) return ciReason;
  const blocker = babysitAgentBlocker(taskId);
  return blocker ? `CI failed; waiting: ${blocker}` : 'Sending CI failures to the agent';
}

async function deliverFailures(taskId: string, headSha: string): Promise<void> {
  const task = store.tasks[taskId];
  const prUrl = task ? taskPrUrl(task) : null;
  const number = prUrl ? parseGitHubUrl(prUrl)?.number : undefined;
  if (!prUrl || !number) return;
  const prompt = await loadFailedChecksPrompt({ number: Number(number), url: prUrl });
  // Collecting logs takes seconds; anything may have changed meanwhile.
  const babysit = store.tasks[taskId]?.prBabysit;
  if (!babysit || getPrChecks(taskId)?.headSha !== headSha) return;
  if (prompt === null) {
    // Nothing the agent can act on, such as only a merge conflict; skip this commit.
    setPrBabysit(taskId, { ...babysit, lastSentSha: headSha });
    showNotification(
      'Babysit could not load a failing check to send (a merge conflict alone has none). It waits for the next push.',
    );
    return;
  }
  const agentId = readyAgentId(taskId);
  if (!agentId) return;
  const attempts = babysit.attempts + 1;
  // Recorded first so a slow send cannot overlap a second one for the same commit.
  setPrBabysit(taskId, { attempts, lastSentSha: headSha });
  await sendPrompt(taskId, agentId, prompt, { appPrompt: true });
  showNotification(`Babysit sent CI failures to the agent (${attempts}/${MAX_BABYSIT_ATTEMPTS}).`);
  // A paste the agent holds instead of submitting would otherwise fail silently.
  // shortcut: one late look — a turn that ends inside the window is a false alarm.
  await new Promise((r) => setTimeout(r, START_CHECK_MS));
  if (store.agents[agentId]?.status === 'running' && isAgentIdle(agentId)) {
    const name = store.tasks[taskId]?.name ?? 'the task';
    showNotification(
      `Babysit pasted CI failures into “${name}”, but the agent did not start. Check its terminal; it may need Enter.`,
    );
  }
}

/** Watches babysat tasks; returns a stop function. */
export function startPrBabysitWatcher(): () => void {
  const inFlight = new Set<string>();

  const tick = (): void => {
    for (const [taskId, task] of Object.entries(store.tasks)) {
      const babysit = task?.prBabysit;
      if (!babysit || inFlight.has(taskId)) continue;
      const step = nextBabysitStep(babysit, getPrChecks(taskId));
      if (step.kind === 'done') stopPrBabysit(taskId);
      else if (step.kind === 'reset') setPrBabysit(taskId, { attempts: 0 });
      else if (step.kind === 'give-up') {
        stopPrBabysit(taskId);
        showNotification(
          `Babysit stopped: CI still fails after ${MAX_BABYSIT_ATTEMPTS} fix attempts.`,
        );
      } else if (step.kind === 'send' && readyAgentId(taskId)) {
        inFlight.add(taskId);
        deliverFailures(taskId, step.headSha)
          .catch((err: unknown) => {
            // Retrying every tick would hammer GitHub, so stop and tell the user.
            stopPrBabysit(taskId);
            logWarn('pr-babysit', 'Sending CI failures failed', { err: errMessage(err) });
            showNotification(`Babysit stopped: ${errMessage(err)}`);
          })
          .finally(() => inFlight.delete(taskId));
      }
    }
  };

  const timer = window.setInterval(tick, BABYSIT_TICK_MS);
  tick();
  return () => clearInterval(timer);
}
