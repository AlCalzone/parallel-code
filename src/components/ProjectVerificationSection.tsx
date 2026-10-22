import { keepCheckIds } from '../lib/check-suggestion';
import { EvidenceSettingsFields } from './EvidenceSettingsFields';
import { SuggestChecksButton } from './SuggestChecksButton';
import { ProjectField, projectMonoInputStyle } from './ProjectDialogParts';
import type { ProjectSettingsForm } from './project-settings-form';

interface ProjectVerificationSectionProps {
  form: ProjectSettingsForm;
  projectRoot: string;
  /** Receives the verify input so the dialog can open focused on it. */
  verifyRef: (el: HTMLInputElement) => void;
}

/** Verify command, evidence checks and coverage: what proves a task's change works. */
export function ProjectVerificationSection(props: ProjectVerificationSectionProps) {
  const form = () => props.form;
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '18px' }}>
      <ProjectField
        label="Verify command"
        aside="runs in the task worktree"
        hint={
          <>
            Runs from the Finish dialog, when an agent calls <code>land_self</code>, and before the
            coordinator merges. A failure is advisory in the Finish dialog, but{' '}
            <code>land_self</code> and <code>merge_task</code> refuse to merge until it passes.{' '}
            <code>PARALLEL_CODE_TASK_ID</code> and <code>PARALLEL_CODE_BRANCH</code> are set for
            namespacing shared resources.
          </>
        }
      >
        {(id) => (
          <input
            id={id}
            ref={(el) => props.verifyRef(el)}
            class="input-field"
            type="text"
            value={form().verifyCommand()}
            onInput={(e) => form().setVerifyCommand(e.currentTarget.value)}
            placeholder="npm run typecheck && npm test"
            style={projectMonoInputStyle}
          />
        )}
      </ProjectField>
      <SuggestChecksButton
        projectRoot={props.projectRoot}
        model={form().evidenceModel()}
        onSuggest={(suggestion) => {
          // Keep what the user has when the model has nothing for a field.
          if (suggestion.verifyCommand) form().setVerifyCommand(suggestion.verifyCommand);
          if (suggestion.checks.length > 0)
            form().setEvidenceChecks(keepCheckIds(form().evidenceChecks(), suggestion.checks));
        }}
      />

      <EvidenceSettingsFields
        checks={form().evidenceChecks()}
        onChecksChange={(checks) => form().setEvidenceChecks(checks)}
        model={form().evidenceModel()}
        onModelChange={(model) => form().setEvidenceModel(model)}
        autoBuild={form().evidenceAutoBuild()}
        onAutoBuildChange={(autoBuild) => form().setEvidenceAutoBuild(autoBuild)}
      />

      <ProjectField
        label="Coverage report path"
        aside="relative to repo root"
        hint={
          <>
            Leave blank to try <code>coverage/coverage-summary.json</code>, then{' '}
            <code>coverage/lcov.info</code>.
          </>
        }
      >
        {(id) => (
          <input
            id={id}
            class="input-field"
            type="text"
            value={form().coverageReportPath()}
            onInput={(e) => form().setCoverageReportPath(e.currentTarget.value)}
            placeholder="coverage/coverage-summary.json"
            style={projectMonoInputStyle}
          />
        )}
      </ProjectField>
    </div>
  );
}
