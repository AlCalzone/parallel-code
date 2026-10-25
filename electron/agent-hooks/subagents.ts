import type { AgentHookStatusUpdate } from './status.js';

/** Hook update after the gate; null drops the event. */
type SubagentGate = (
  launchId: string,
  payload: unknown,
  update: AgentHookStatusUpdate | null,
) => AgentHookStatusUpdate | null;

function field(payload: unknown, key: string): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Sub-agents Claude lists as running; undefined when the payload has no list. */
function runningSubagents(payload: unknown): Set<string> | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const tasks = (payload as Record<string, unknown>).background_tasks;
  if (!Array.isArray(tasks)) return undefined;
  const running = tasks.filter(
    (task) => field(task, 'type') === 'subagent' && field(task, 'status') === 'running',
  );
  return new Set(running.map((task) => field(task, 'id')).filter((id) => id !== undefined));
}

/** The launch's open sub-agents after this event. */
function track(open: Set<string>, payload: unknown): Set<string> {
  const event = field(payload, 'hook_event_name');
  const id = field(payload, 'agent_id');
  // Claude's own list wins when present, healing a stop we never saw. A
  // sub-agent's stop still lists itself, so its own event applies after.
  const next = runningSubagents(payload) ?? new Set(open);
  if (event === 'SubagentStart' && id) next.add(id);
  if (event === 'SubagentStop' && id) next.delete(id);
  // A new session starts with no sub-agents; a lost stop must not pin `working`.
  if (event === 'SessionStart' && field(payload, 'source') !== 'compact') next.clear();
  return next;
}

/**
 * Keeps an agent `working` while a background sub-agent it started still runs.
 * Claude Code ends the lead turn (`Stop`, later `idle_prompt`) as soon as a
 * background sub-agent is launched, which would report the task finished for
 * the sub-agent's whole run. So that end is held as `working`, and updates are
 * flagged `background` while the lead sits at its prompt. Unmatched
 * `SubagentStop`s occur (Claude's own helpers), so sub-agents are tracked by id.
 */
export function createSubagentGate(): SubagentGate {
  // shortcut: entries of a launch that dies mid-sub-agent are never removed —
  // a few ids per crashed launch; hook retireAgentLaunch if that ever matters.
  const launches = new Map<string, { open: Set<string>; leadIdle: boolean }>();
  return (launchId, payload, update) => {
    const prev = launches.get(launchId);
    const open = track(prev?.open ?? new Set(), payload);
    if (open.size === 0) {
      launches.delete(launchId);
      return update;
    }
    // The lead's turn end becomes a hold that keeps its reply for the card.
    if (update?.state === 'done') {
      launches.set(launchId, { open, leadIdle: true });
      const { lastAssistantMessage } = update;
      return { state: 'working', event: 'SubagentRunning', lastAssistantMessage, background: true };
    }
    // Only sub-agent events carry an agent id; anything else from the lead means
    // it is working again, and Esc can interrupt it.
    const leadIdle = !!prev?.leadIdle && (!update || field(payload, 'agent_id') !== undefined);
    launches.set(launchId, { open, leadIdle });
    return update && leadIdle ? { ...update, background: true } : update;
  };
}
