import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  CODEX_MODEL_PATTERN,
  isAskCodeEffort,
  type CodexModelChoice,
} from '../shared/ask-code-models.js';
import { warn as logWarn } from '../log.js';

/** The cache is a few hundred kB of model metadata; more means the path is wrong. */
const MAX_CACHE_BYTES = 8 * 1024 * 1024;

function codexHome(): string {
  const configured = process.env.CODEX_HOME?.trim();
  return configured ? configured : path.join(os.homedir(), '.codex');
}

/**
 * One cache entry, if it names a model the CLI itself would list. `visibility`
 * is how Codex hides retired and internal models, so entries that are not
 * `list` are dropped rather than offered.
 */
function toChoice(entry: unknown): CodexModelChoice[] {
  if (typeof entry !== 'object' || entry === null) return [];
  const model = entry as Record<string, unknown>;
  if (model.visibility !== 'list') return [];
  const slug = model.slug;
  if (typeof slug !== 'string' || !CODEX_MODEL_PATTERN.test(slug)) return [];
  const displayName = model.display_name;
  const efforts = supportedEfforts(model.supported_reasoning_levels);
  // A missing or malformed name must not lose the model; the slug reads fine.
  return [
    {
      slug,
      displayName: typeof displayName === 'string' && displayName ? displayName : slug,
      ...(efforts.length > 0 ? { efforts } : {}),
    },
  ];
}

/**
 * The levels a model lists that the app knows how to pass. Levels the app does
 * not know, such as Codex's delegating `ultra`, are left out rather than guessed at.
 */
function supportedEfforts(levels: unknown): string[] {
  if (!Array.isArray(levels)) return [];
  return levels.flatMap((level: unknown) => {
    const effort = (level as { effort?: unknown } | null)?.effort;
    return isAskCodeEffort('codex', effort) ? [effort] : [];
  });
}

/**
 * The Codex models the CLI knows about, read from the cache it writes itself
 * (`$CODEX_HOME/models_cache.json`). An unreadable or unparsable cache is not
 * an error the user can act on here, so it yields an empty list and a warning:
 * without a model the CLI still runs with its own default.
 */
export function listCodexModels(): CodexModelChoice[] {
  const file = path.join(codexHome(), 'models_cache.json');
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error('not a regular file');
    if (stat.size > MAX_CACHE_BYTES) throw new Error(`too large (${stat.size} bytes)`);
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    const models = (parsed as { models?: unknown }).models;
    if (!Array.isArray(models)) throw new Error('no models array');
    return models.flatMap(toChoice);
  } catch (error) {
    logWarn('codexModels', 'Could not read the Codex model cache', {
      file,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
