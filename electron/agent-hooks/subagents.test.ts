import { describe, expect, it } from 'vitest';
import { mapClaudeHookPayload } from './status.js';
import { createSubagentGate } from './subagents.js';

/** Replays raw hook payloads for one launch; returns the updates that pass the gate. */
function replay(payloads: Record<string, unknown>[], launchId = 'launch-1') {
  const gate = createSubagentGate();
  return payloads.map((payload) => gate(launchId, payload, mapClaudeHookPayload(payload)));
}

const start = (id: string) => ({ hook_event_name: 'SubagentStart', agent_id: id });
const stop = (id: string) => ({ hook_event_name: 'SubagentStop', agent_id: id });
const turnEnd = { hook_event_name: 'Stop', last_assistant_message: 'started' };
const idle = { hook_event_name: 'Notification', notification_type: 'idle_prompt' };
const bash = (id: string) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: id });

describe('createSubagentGate', () => {
  it('holds the turn open while a background sub-agent runs', () => {
    // Recorded from Claude Code 2.1.312, including a stop with no matching start.
    const out = replay([
      { hook_event_name: 'PreToolUse', tool_name: 'Agent' },
      start('a1'),
      turnEnd,
      stop('internal'),
      bash('a1'),
      idle,
      stop('a1'),
      turnEnd,
    ]);
    expect(out.map((update) => update?.state ?? null)).toEqual([
      'working',
      null,
      'working',
      null,
      'working',
      'working',
      null,
      'done',
    ]);
    // Flagged while the sub-agent runs, so keys typed at the lead's prompt read as no interrupt.
    expect(out.map((update) => update?.background ?? false)).toEqual([
      false,
      false,
      true,
      false,
      true,
      true,
      false,
      false,
    ]);
    // The lead's reply survives on the held turn end.
    expect(out[2]).toMatchObject({ event: 'SubagentRunning', lastAssistantMessage: 'started' });
  });

  it('keeps sub-agents of one launch from holding another open', () => {
    const gate = createSubagentGate();
    gate('launch-1', start('a1'), null);
    expect(gate('launch-2', turnEnd, mapClaudeHookPayload(turnEnd))).toMatchObject({
      state: 'done',
    });
    expect(gate('launch-2', turnEnd, mapClaudeHookPayload(turnEnd))?.background).toBeUndefined();
  });

  it('forgets open sub-agents when a new session starts', () => {
    const startup = { hook_event_name: 'SessionStart', source: 'clear' };
    const out = replay([start('a1'), startup, turnEnd]);
    expect(out.map((update) => update?.state ?? null)).toEqual([null, 'done', 'done']);
  });

  it("resyncs open sub-agents from Claude's background task list", () => {
    // Recorded: a helper's stop lists the sub-agents still running, and a
    // sub-agent's own stop still lists itself.
    const running = (id: string) => [
      { id, type: 'subagent', status: 'running' },
      { id: 'shell-1', type: 'bash', status: 'running' },
    ];
    const lost = replay([start('a1'), { ...stop('helper'), background_tasks: [] }, turnEnd]);
    expect(lost[2]?.state).toBe('done');
    const unseen = replay([{ ...stop('helper'), background_tasks: running('a1') }, turnEnd]);
    expect(unseen[1]?.state).toBe('working');
    const own = replay([start('a1'), { ...stop('a1'), background_tasks: running('a1') }, turnEnd]);
    expect(own[2]?.state).toBe('done');
  });

  it('flags only a lead that ended its turn, so Esc can still interrupt a live one', () => {
    const leadTool = { hook_event_name: 'PreToolUse', tool_name: 'Read' };
    const out = replay([
      { hook_event_name: 'PreToolUse', tool_name: 'Agent' },
      start('a1'),
      bash('a1'),
      turnEnd,
      bash('a1'),
      leadTool,
      bash('a1'),
    ]);
    expect(out.map((update) => update?.background ?? false)).toEqual([
      false,
      false,
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  it('passes questions through while a sub-agent runs', () => {
    const ask = { hook_event_name: 'Notification', notification_type: 'permission_prompt' };
    expect(replay([start('a1'), ask])[1]?.state).toBe('waiting');
  });
});
