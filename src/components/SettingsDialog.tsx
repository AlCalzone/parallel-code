import { For, Show, createSignal, createEffect, createUniqueId, on } from 'solid-js';
import type { JSX } from 'solid-js';
import { Dialog } from './Dialog';
import { getAvailableTerminalFonts, fetchAvailableTerminalFonts } from '../lib/fonts';
import { theme } from '../lib/theme';
import { store, setDocumentWorkspacesEnabled } from '../store/store';
import { mod } from '../lib/platform';
import { SettingsCheckboxRow, SettingsSection, type SettingsTab } from './settings/settings-ui';
import { GeneralSettings } from './settings/GeneralSettings';
import { AppearanceSettings } from './settings/AppearanceSettings';
import { AgentSettings } from './settings/AgentSettings';
import { AiAssistSettings } from './settings/AiAssistSettings';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

function ensureSelectedFont(available: string[]): string[] {
  if (available.includes(store.terminalFont)) return available;
  return [store.terminalFont, ...available];
}

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'agents', label: 'Agents' },
  { id: 'ai', label: 'AI assist' },
  { id: 'experimental', label: 'Experimental' },
];

/** Tab index an arrow/Home/End key moves to, wrapping at the ends; null for other keys. */
function tabIndexForKey(key: string, current: number): number | null {
  const count = SETTINGS_TABS.length;
  if (key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowLeft') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

function SettingsTabPanel(props: { tab: SettingsTab; children: JSX.Element }) {
  return (
    <div
      id={`settings-tab-${props.tab}`}
      role="tabpanel"
      aria-labelledby={`settings-tabbutton-${props.tab}`}
      data-dialog-scroll
      style={{
        'min-height': '0',
        'overflow-y': 'auto',
        padding: '4px',
        display: 'flex',
        'flex-direction': 'column',
        gap: '18px',
      }}
    >
      {props.children}
    </div>
  );
}

export function SettingsDialog(props: SettingsDialogProps) {
  const titleId = createUniqueId();
  const [fonts, setFonts] = createSignal<string[]>(ensureSelectedFont(getAvailableTerminalFonts()));
  const [activeTab, setActiveTab] = createSignal<SettingsTab>('general');

  // Fetch system fonts when the dialog opens
  createEffect(
    on(
      () => props.open,
      (open) => {
        if (open) {
          fetchAvailableTerminalFonts().then((available) =>
            setFonts(ensureSelectedFont(available)),
          );
        }
      },
    ),
  );

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      width="640px"
      zIndex={1100}
      labelledBy={titleId}
      panelStyle={{
        'max-width': 'calc(100vw - 32px)',
        padding: '24px',
        gap: '18px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          'flex-shrink': '0',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
        }}
      >
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
          <h2
            id={titleId}
            style={{
              margin: '0',
              'font-size': '17px',
              color: theme.fg,
              'font-weight': '600',
            }}
          >
            Settings
          </h2>
          <span style={{ 'font-size': '13px', color: theme.fgSubtle }}>
            Customize your workspace. Shortcut:{' '}
            <kbd
              style={{
                background: theme.bgInput,
                border: `1px solid ${theme.border}`,
                'border-radius': 'var(--radius-xs)',
                padding: '1px 6px',
                'font-family': "'JetBrains Mono', monospace",
                color: theme.fgMuted,
              }}
            >
              {mod}+,
            </kbd>
          </span>
        </div>
        <button
          onClick={() => props.onClose()}
          aria-label="Close settings"
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.fgMuted,
            cursor: 'pointer',
            'font-size': '19px',
            padding: '0 4px',
            'line-height': '1',
          }}
        >
          &times;
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Settings tabs"
        style={{
          'flex-shrink': '0',
          display: 'flex',
          gap: '2px',
          'border-bottom': `1px solid ${theme.border}`,
          'padding-bottom': '0',
          'margin-bottom': '2px',
        }}
      >
        <For each={SETTINGS_TABS}>
          {(tab) => (
            <button
              role="tab"
              aria-selected={activeTab() === tab.id}
              aria-controls={`settings-tab-${tab.id}`}
              id={`settings-tabbutton-${tab.id}`}
              type="button"
              tabIndex={activeTab() === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => {
                const next = tabIndexForKey(e.key, SETTINGS_TABS.indexOf(tab));
                if (next === null) return;
                e.preventDefault();
                const nextId = SETTINGS_TABS[next].id;
                setActiveTab(nextId);
                document.getElementById(`settings-tabbutton-${nextId}`)?.focus();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                'border-bottom':
                  activeTab() === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent',
                color: activeTab() === tab.id ? theme.fg : theme.fgMuted,
                cursor: 'pointer',
                'font-size': '14px',
                'font-weight': activeTab() === tab.id ? '600' : '400',
                padding: '6px 14px',
                'margin-bottom': '-1px',
                'border-radius': '0',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      <Show when={activeTab() === 'general'}>
        <SettingsTabPanel tab="general">
          <GeneralSettings />
        </SettingsTabPanel>
      </Show>
      <Show when={activeTab() === 'appearance'}>
        <SettingsTabPanel tab="appearance">
          <AppearanceSettings fonts={fonts()} />
        </SettingsTabPanel>
      </Show>
      <Show when={activeTab() === 'agents'}>
        <SettingsTabPanel tab="agents">
          <AgentSettings />
        </SettingsTabPanel>
      </Show>
      <Show when={activeTab() === 'ai'}>
        <SettingsTabPanel tab="ai">
          <AiAssistSettings />
        </SettingsTabPanel>
      </Show>
      <Show when={activeTab() === 'experimental'}>
        <SettingsTabPanel tab="experimental">
          <SettingsSection title="Document workspaces">
            <SettingsCheckboxRow
              label="Document workspaces"
              checked={store.documentWorkspacesEnabled}
              onChange={setDocumentWorkspacesEnabled}
              description="Add document projects: a folder with one Markdown document, set up for you if it is not a Git repository yet. Select a passage, send the same instruction to one or more agents running headlessly in isolated worktrees, compare the proposals side by side, and accept one as a single readable commit. Adds Documents as an Open as choice when adding a project."
            />
          </SettingsSection>
        </SettingsTabPanel>
      </Show>
    </Dialog>
  );
}
