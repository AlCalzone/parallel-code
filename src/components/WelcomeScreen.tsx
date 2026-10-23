import { For, Show, createSignal, onMount } from 'solid-js';
import { isAgentInstalled } from '../lib/default-agent';
import { errMessage } from '../lib/log';
import { store } from '../store/core';
import { showNotification } from '../store/notification';
import { pickAndAddProject } from '../store/projects';
import { AppLogo } from './icons';
import './welcome.css';

const STEPS = [
  { title: 'Link a project', detail: 'Any folder with your code; a Git repository works best.' },
  { title: 'Start tasks', detail: 'Describe the work, and an agent takes it on its own branch.' },
  { title: 'Review and merge', detail: 'The board shows which tasks need you, and when.' },
];

/**
 * The first screen of a new install, whatever view is selected: the one step
 * that starts everything, with no other app UI around it. It gives way to the
 * workspace as soon as a project is linked.
 */
export function WelcomeScreen() {
  const [linking, setLinking] = createSignal(false);
  const agents = () => store.availableAgents.filter(isAgentInstalled).map((agent) => agent.name);
  let action: HTMLButtonElement | undefined;
  onMount(() => action?.focus());

  const link = async () => {
    setLinking(true);
    try {
      await pickAndAddProject();
    } catch (err) {
      showNotification(`Couldn't link the project: ${errMessage(err)}`);
    } finally {
      setLinking(false);
    }
  };

  return (
    <main class="welcome" aria-labelledby="welcome-title">
      <div class="welcome-content">
        <AppLogo class="welcome-logo" />
        <h1 id="welcome-title">Parallel Code</h1>
        <p class="welcome-lead">
          Run coding agents side by side. Each task gets its own agent and Git worktree, so they
          never step on each other.
        </p>
        <ol class="welcome-steps">
          <For each={STEPS}>
            {(step) => (
              <li>
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </li>
            )}
          </For>
        </ol>
        <button
          ref={action}
          type="button"
          class="welcome-action"
          disabled={linking()}
          onClick={() => void link()}
        >
          Link a project…
        </button>
        <p class="welcome-agents">
          <Show
            when={agents().length > 0}
            fallback="No coding agent found yet. Install one, such as Claude Code or Codex CLI, before you start a task."
          >
            Ready with {agents().join(', ')}.
          </Show>
        </p>
      </div>
    </main>
  );
}
