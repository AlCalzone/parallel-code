import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IPC } from '../../electron/ipc/channels';
import { WEBGL_DETACH_DELAY_MS } from '../lib/terminalPaneVisibility';
import { withViewTransition } from '../lib/viewTransition';
import { setStore } from '../store/core';
import { TerminalView } from './TerminalView';

const { redrawAllTerminals, webglAttached } = vi.hoisted(() => ({
  redrawAllTerminals: vi.fn(),
  webglAttached: vi.fn(),
}));

vi.mock('../lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/platform')>()),
  isMac: true,
}));

// happy-dom has no WebGL; a stand-in addon is enough to put the pane on the
// WebGL path that keeps its context across a brief trip off screen.
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    activate(): void {
      webglAttached();
    }
    dispose(): void {}
    onContextLoss() {
      return { dispose() {} };
    }
  },
}));

vi.mock('../lib/terminalFitManager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/terminalFitManager')>()),
  redrawAllTerminals,
}));

let dispose: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  // happy-dom has no canvas; xterm's DOM renderer only measures glyph widths.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    measureText: () => ({ width: 8 }),
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal('OffscreenCanvas', undefined);
  vi.stubGlobal('electron', {
    ipcRenderer: {
      invoke: vi.fn((cmd: string) =>
        cmd === IPC.SpawnAgent ? new Promise(() => {}) : Promise.resolve(undefined),
      ),
      on: () => () => undefined,
    },
  });
  redrawAllTerminals.mockClear();
  webglAttached.mockClear();
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  setStore({ boardView: false, boardPeek: false, activeTaskId: null });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Renders a task's shell pane; the returned setter shows or hides its tab. */
function renderTerminal(taskId: string): (visible: boolean) => void {
  const [visible, setVisible] = createSignal(true);
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(
    () => (
      <TerminalView
        taskId={taskId}
        agentId={`agent-${taskId}`}
        command="codex"
        args={[]}
        cwd="/tmp"
        isShell
        visible={visible()}
      />
    ),
    host,
  );
  return setVisible;
}

/** Runs the next animation frame (16ms under fake timers) and the task it queues. */
async function paintFrame(): Promise<void> {
  await vi.advanceTimersByTimeAsync(20);
}

it('attaches WebGL after the frame that shows the pane, not inside it', async () => {
  renderTerminal('task-1');
  expect(webglAttached).not.toHaveBeenCalled();
  await paintFrame();
  expect(webglAttached).toHaveBeenCalledTimes(1);
});

it('waits for a running view change to finish animating before attaching WebGL', async () => {
  let finish = () => {};
  const finished = new Promise<void>((resolve) => (finish = resolve));
  Object.assign(document, {
    startViewTransition: (update: () => void) => {
      update();
      return { ready: Promise.resolve(), finished };
    },
  });
  try {
    withViewTransition(() => renderTerminal('task-1'));
    await paintFrame();
    await vi.advanceTimersByTimeAsync(300);
    expect(webglAttached).not.toHaveBeenCalled();

    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(webglAttached).toHaveBeenCalledTimes(1);
  } finally {
    Reflect.deleteProperty(document, 'startViewTransition');
  }
});

it('keeps panes under the board off WebGL when its side panel closes', async () => {
  setStore({ boardView: true, boardPeek: true, activeTaskId: 'task-1' });
  renderTerminal('task-2');
  await paintFrame();

  // Without its side panel the board hides every task, tiled ones included.
  setStore('boardPeek', false);
  await paintFrame();
  expect(webglAttached).not.toHaveBeenCalled();
});

it('repaints every terminal, not just its own, when a pane returns on macOS (issue #121)', async () => {
  const setVisible = renderTerminal('task-1');
  await paintFrame();

  setVisible(false);
  vi.advanceTimersByTime(WEBGL_DETACH_DELAY_MS / 2);
  expect(redrawAllTerminals).not.toHaveBeenCalled();
  setVisible(true);

  // The glyph atlas is shared, so a repaint must reset every terminal's model.
  expect(redrawAllTerminals).toHaveBeenCalledTimes(1);
});
