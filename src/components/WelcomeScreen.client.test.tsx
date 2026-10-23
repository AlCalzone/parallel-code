import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentDef } from '../../electron/ipc/shared-types';
import { setStore, store } from '../store/core';
import { pickAndAddProject } from '../store/projects';
import { WelcomeScreen } from './WelcomeScreen';

vi.mock('../lib/ipc', () => ({ invoke: vi.fn(async () => undefined) }));
vi.mock('../store/projects', () => ({ pickAndAddProject: vi.fn(async () => null) }));

function agent(name: string, available: boolean): AgentDef {
  return {
    id: name,
    name,
    command: name,
    args: [],
    resume_args: [],
    skip_permissions_args: [],
    description: '',
    available,
  };
}

let dispose = (): void => undefined;
function mount(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const stop = render(() => <WelcomeScreen />, host);
  dispose = () => {
    stop();
    host.remove();
  };
  return host;
}

afterEach(() => {
  dispose();
  setStore('availableAgents', []);
  setStore('notification', null);
  vi.mocked(pickAndAddProject).mockReset();
});

describe('WelcomeScreen', () => {
  it('offers linking a project as the one thing to do, with the keyboard on it', async () => {
    const host = mount();
    const button = host.querySelector<HTMLButtonElement>('.welcome-action');
    expect(host.querySelector('h1')?.textContent).toBe('Parallel Code');
    expect(host.querySelectorAll('button')).toHaveLength(1);
    expect(document.activeElement).toBe(button);

    let finish: (value: null) => void = () => undefined;
    vi.mocked(pickAndAddProject).mockReturnValueOnce(new Promise((r) => (finish = r)));
    button?.click();
    expect(pickAndAddProject).toHaveBeenCalledTimes(1);
    // Busy while the folder dialog is open, so a second click opens no second dialog.
    expect(button?.disabled).toBe(true);
    finish(null);
    await vi.waitFor(() => expect(button?.disabled).toBe(false));
  });

  it('says why linking failed', async () => {
    vi.mocked(pickAndAddProject).mockRejectedValueOnce(new Error('Not a folder'));
    mount().querySelector<HTMLButtonElement>('.welcome-action')?.click();
    await vi.waitFor(() => expect(store.notification).toContain('Not a folder'));
  });

  it('names the installed agents, or says one is needed', () => {
    setStore('availableAgents', [agent('Claude Code', true), agent('Codex CLI', false)]);
    const host = mount();
    expect(host.querySelector('.welcome-agents')?.textContent).toBe('Ready with Claude Code.');
    setStore('availableAgents', [agent('Codex CLI', false)]);
    expect(host.querySelector('.welcome-agents')?.textContent).toContain('No coding agent found');
  });
});
