import { For, type JSX } from 'solid-js';
import {
  setWorkspaceView,
  store,
  toggleSettingsDialog,
  toggleSidebar,
  workspaceView,
  type WorkspaceView,
} from '../store/store';
import { mod } from '../lib/platform';
import { withViewTransition } from '../lib/viewTransition';
import { IconButton } from './IconButton';
import { UpdateButton } from './UpdateButton';

function viewIcon(body: JSX.Element) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.25"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}

// Drawn to stay distinct at 16px: one pane in corner brackets, equal tall
// columns, and top-aligned lanes of unequal height.
const VIEWS: { view: WorkspaceView; title: string; icon: () => JSX.Element }[] = [
  {
    view: 'focus',
    title: `Focus: one task (${mod}+Shift+F)`,
    icon: () =>
      viewIcon(
        <>
          <path d="M2 5.5V3.75A1.75 1.75 0 0 1 3.75 2H5.5M10.5 2h1.75A1.75 1.75 0 0 1 14 3.75V5.5M14 10.5v1.75A1.75 1.75 0 0 1 12.25 14H10.5M5.5 14H3.75A1.75 1.75 0 0 1 2 12.25V10.5" />
          <rect x="5" y="5" width="6" height="6" rx="1" />
        </>,
      ),
  },
  {
    view: 'tiles',
    title: 'Tiles: tasks side by side',
    icon: () =>
      viewIcon(
        <>
          <rect x="2" y="3" width="3.2" height="10" rx="0.8" />
          <rect x="6.4" y="3" width="3.2" height="10" rx="0.8" />
          <rect x="10.8" y="3" width="3.2" height="10" rx="0.8" />
        </>,
      ),
  },
  {
    view: 'board',
    title: `Board: running tasks by state (${mod}+Shift+G)`,
    icon: () =>
      viewIcon(
        <>
          <rect x="2" y="2.5" width="3.2" height="11" rx="0.8" />
          <rect x="6.4" y="2.5" width="3.2" height="6.5" rx="0.8" />
          <rect x="10.8" y="2.5" width="3.2" height="8.5" rx="0.8" />
        </>,
      ),
  },
];

/** Focus, tiles or board: three views of the same tasks, one pressed at a time. */
function WorkspaceViewToggle() {
  return (
    <div class="workspace-view-toggle" role="group" aria-label="Workspace view">
      <For each={VIEWS}>
        {(item) => (
          <button
            type="button"
            title={item.title}
            aria-label={item.title}
            aria-pressed={workspaceView() === item.view}
            onClick={(event) => {
              event.stopPropagation();
              withViewTransition(() => setWorkspaceView(item.view));
            }}
          >
            {item.icon()}
          </button>
        )}
      </For>
    </div>
  );
}

export function WorkspaceControls() {
  return (
    <div
      class="workspace-controls"
      role="group"
      aria-label="Workspace controls"
      onDblClick={(event) => event.stopPropagation()}
    >
      <IconButton
        icon={
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ transform: store.sidebarVisible ? undefined : 'rotate(180deg)' }}
          >
            <path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L6.06 8l3.72 3.72a.75.75 0 0 1 0 1.06Z" />
          </svg>
        }
        onClick={() => toggleSidebar()}
        title={`${store.sidebarVisible ? 'Collapse' : 'Show'} sidebar (${mod}+B)`}
      />
      <IconButton
        icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2.25a.75.75 0 0 1 .73.56l.2.72a4.48 4.48 0 0 1 1.04.43l.66-.37a.75.75 0 0 1 .9.13l.75.75a.75.75 0 0 1 .13.9l-.37.66c.17.33.31.68.43 1.04l.72.2a.75.75 0 0 1 .56.73v1.06a.75.75 0 0 1-.56.73l-.72.2a4.48 4.48 0 0 1-.43 1.04l.37.66a.75.75 0 0 1-.13.9l-.75.75a.75.75 0 0 1-.9.13l-.66-.37a4.48 4.48 0 0 1-1.04.43l-.2.72a.75.75 0 0 1-.73.56H6.94a.75.75 0 0 1-.73-.56l-.2-.72a4.48 4.48 0 0 1-1.04-.43l-.66.37a.75.75 0 0 1-.9-.13l-.75-.75a.75.75 0 0 1-.13-.9l.37-.66a4.48 4.48 0 0 1-.43-1.04l-.72-.2a.75.75 0 0 1-.56-.73V7.47a.75.75 0 0 1 .56-.73l.72-.2c.11-.36.26-.71.43-1.04l-.37-.66a.75.75 0 0 1 .13-.9l.75-.75a.75.75 0 0 1 .9-.13l.66.37c.33-.17.68-.31 1.04-.43l.2-.72a.75.75 0 0 1 .73-.56H8Zm-.53 3.22a2.5 2.5 0 1 0 1.06 4.88 2.5 2.5 0 0 0-1.06-4.88Z" />
          </svg>
        }
        onClick={() => toggleSettingsDialog(true)}
        title={`Settings (${mod}+,)`}
      />
      <WorkspaceViewToggle />
      <UpdateButton />
    </div>
  );
}
