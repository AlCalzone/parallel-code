import { ASK_CODE_CLAUDE_MODELS, askCodeEfforts } from '../../electron/shared/ask-code-models';
import { reasoningEffortLabel } from '../../electron/shared/chat-messages';
import { effortToRun, modelToRun } from '../lib/ask-code-model';
import { codexModels, loadCodexModels } from '../lib/codex-models';
import type { ReviewModelSettings } from '../lib/task-review';
import { ModelMenu } from './ModelMenu';

/** Picks the model a review runs on: provider, model and reasoning level in one menu. */
export function ReviewerMenu(props: {
  value: ReviewModelSettings;
  onChange: (model: ReviewModelSettings) => void;
  class?: string;
}) {
  const provider = () => props.value.provider;
  const model = () => modelToRun(provider(), props.value.model ?? '');
  const effort = () => effortToRun(provider(), model(), props.value.effort ?? '');
  return (
    <ModelMenu
      label="Reviewer model"
      title={`Reviewer: ${model()}${effort() ? ` · ${reasoningEffortLabel(effort())}` : ''}`}
      class={props.class}
      text={model()}
      value={`${provider()}:${model()}`}
      groups={[
        {
          heading: 'Claude Code',
          choices: ASK_CODE_CLAUDE_MODELS.map((m) => ({ value: `claude:${m}`, label: m })),
        },
        {
          heading: 'Codex',
          choices: codexModels().map((m) => ({
            value: `codex:${m.slug}`,
            label: m.displayName,
            title: m.slug,
          })),
          empty: 'No Codex models found',
        },
      ]}
      section={{
        heading: 'Reasoning',
        choices: askCodeEfforts(provider()).map((value) => ({
          value,
          label: reasoningEffortLabel(value),
        })),
        value: effort(),
        onSelect: (value) => props.onChange({ ...props.value, effort: value }),
      }}
      onOpen={loadCodexModels}
      onSelect={(value) => {
        const [picked, slug] = value.split(':', 2);
        const next = picked === 'codex' ? 'codex' : 'claude';
        // Levels differ by provider, so a switch starts from the model's own default.
        const keep = next === provider() ? props.value.effort : undefined;
        props.onChange({ provider: next, model: slug, ...(keep && { effort: keep }) });
      }}
    />
  );
}
