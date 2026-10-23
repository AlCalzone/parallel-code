/** PR babysitting: sends a task's failing PR checks to its agent until CI passes. */
import { errMessage, warn as logWarn } from '../lib/log';
import { parseGitHubUrl } from '../lib/github-url';
import { MAX_BABYSIT_ATTEMPTS, nextBabysitStep, type PrBabysit } from '../lib/pr-babysit';
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

/** The task's first agent when it can take an automatic prompt now. */
function readyAgentId(taskId: string): string | null {
  const task = store.tasks[taskId];
  const agentId = task?.agentIds[0];
  const agent = agentId ? store.agents[agentId] : undefined;
  if (!task || !agentId || agent?.status !== 'running') return null;
  // A paused task holds all automatic input, babysit included.
  if (task.delegationPaused) return null;
  if (task.closingStatus === 'closing' || task.closingStatus === 'removing') return null;
  if (isLandedTaskState(task.landingState)) return null;
  if (!isAgentIdle(agentId) || isAgentAskingQuestion(agentId)) return null;
  return composerInputBlocker(task, true) === null ? agentId : null;
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
    return;
  }
  const agentId = readyAgentId(taskId);
  if (!agentId) return;
  const attempts = babysit.attempts + 1;
  // Recorded first so a slow send cannot overlap a second one for the same commit.
  setPrBabysit(taskId, { attempts, lastSentSha: headSha });
  await sendPrompt(taskId, agentId, prompt, { appPrompt: true });
  showNotification(`Babysit sent CI failures to the agent (${attempts}/${MAX_BABYSIT_ATTEMPTS}).`);
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
