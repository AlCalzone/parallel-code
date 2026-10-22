import { createSignal } from 'solid-js';
import {
  DEFAULT_EVIDENCE_MODEL,
  parseEvidenceModelSettings,
} from '../../electron/shared/evidence-settings';
import { sanitizeBranchPrefix } from '../lib/branch-name';
import type { GitIsolationMode, Project, TerminalBookmark } from '../store/types';
import { finalizeChecks, type CheckDraft } from './EvidenceSettingsFields';

function hueFromColor(color: string): number {
  const match = color.match(/hsl\((\d+)/);
  return match ? Number(match[1]) : 0;
}

export function colorFromHue(hue: number): string {
  return `hsl(${hue}, 70%, 75%)`;
}

/** Editable copy of a project's settings, saved only when the dialog saves. */
export function createProjectSettingsForm() {
  const [name, setName] = createSignal('');
  const [hue, setHue] = createSignal(0);
  const [allowPeerAccess, setAllowPeerAccess] = createSignal(false);
  const [branchPrefix, setBranchPrefix] = createSignal('task');
  const [deleteBranchOnClose, setDeleteBranchOnClose] = createSignal(true);
  const [defaultGitIsolation, setDefaultGitIsolation] = createSignal<GitIsolationMode>('worktree');
  const [defaultBaseBranch, setDefaultBaseBranch] = createSignal('');
  const [coverageReportPath, setCoverageReportPath] = createSignal('');
  const [verifyCommand, setVerifyCommand] = createSignal('');
  const [evidenceChecks, setEvidenceChecks] = createSignal<CheckDraft[]>([]);
  const [evidenceModel, setEvidenceModel] = createSignal(DEFAULT_EVIDENCE_MODEL);
  const [evidenceAutoBuild, setEvidenceAutoBuild] = createSignal(false);
  const [bookmarks, setBookmarks] = createSignal<TerminalBookmark[]>([]);

  function load(p: Project) {
    setName(p.name);
    setHue(hueFromColor(p.color));
    setAllowPeerAccess(p.allowPeerAccess === true);
    setBranchPrefix(sanitizeBranchPrefix(p.branchPrefix ?? 'task'));
    setDeleteBranchOnClose(p.deleteBranchOnClose ?? true);
    setDefaultGitIsolation(p.defaultGitIsolation ?? 'worktree');
    setDefaultBaseBranch(p.defaultBaseBranch ?? '');
    setCoverageReportPath(p.coverageReportPath ?? '');
    setVerifyCommand(p.verifyCommand ?? '');
    setEvidenceChecks(p.evidenceChecks ? [...p.evidenceChecks] : []);
    setEvidenceModel(p.evidenceModel ?? DEFAULT_EVIDENCE_MODEL);
    setEvidenceAutoBuild(p.evidenceAutoBuild === true);
    setBookmarks(p.terminalBookmarks ? [...p.terminalBookmarks] : []);
  }

  /** The fields `updateProject` stores; peer access saves separately. */
  function updates() {
    return {
      name: name().trim(),
      color: colorFromHue(hue()),
      branchPrefix: sanitizeBranchPrefix(branchPrefix()),
      deleteBranchOnClose: deleteBranchOnClose(),
      defaultGitIsolation: defaultGitIsolation(),
      defaultBaseBranch: defaultBaseBranch() || undefined,
      coverageReportPath: coverageReportPath().trim() || undefined,
      verifyCommand: verifyCommand().trim() || undefined,
      evidenceChecks: finalizeChecks(evidenceChecks()),
      evidenceModel: parseEvidenceModelSettings(evidenceModel()),
      evidenceAutoBuild: evidenceAutoBuild(),
      terminalBookmarks: bookmarks(),
    };
  }

  return {
    name,
    setName,
    hue,
    setHue,
    allowPeerAccess,
    setAllowPeerAccess,
    branchPrefix,
    setBranchPrefix,
    deleteBranchOnClose,
    setDeleteBranchOnClose,
    defaultGitIsolation,
    setDefaultGitIsolation,
    defaultBaseBranch,
    setDefaultBaseBranch,
    coverageReportPath,
    setCoverageReportPath,
    verifyCommand,
    setVerifyCommand,
    evidenceChecks,
    setEvidenceChecks,
    evidenceModel,
    setEvidenceModel,
    evidenceAutoBuild,
    setEvidenceAutoBuild,
    bookmarks,
    setBookmarks,
    load,
    updates,
  };
}

export type ProjectSettingsForm = ReturnType<typeof createProjectSettingsForm>;
