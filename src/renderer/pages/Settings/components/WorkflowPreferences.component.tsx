import type { RoomProfile } from '../../../../shared/types';
import type { WorkflowDraft } from '../../../../shared/workflow';
import { type FormEvent, useLayoutEffect, useRef, useState } from 'react';
import { ErrorNotice, errorMessage } from '../../../components/Shared';
import { useNewsRecovery } from '../../../NewsRecovery';
import { newsPreparationStatus } from '../../../../shared/news-preparation-status';
import './WorkflowPreferences.styles.css';

export type PreparationIssue = { message: string; action?: { label: string; run: () => void } };
type Props = {
  room?: RoomProfile;
  value: WorkflowDraft;
  dirty: boolean;
  disabled: boolean;
  saving: boolean;
  saveError: unknown;
  activationReady: boolean;
  statusLoading: boolean;
  statusError: unknown;
  profileStatusUnknown: boolean;
  issues: PreparationIssue[];
  onChange: (patch: Partial<WorkflowDraft>) => void;
  onSave: () => void;
  onResume: () => void;
  onTurnOff: () => void;
  stopping: boolean;
  stopDisabled: boolean;
  onRetryStatus: () => void;
};

export function WorkflowPreferences({ room, value, dirty, disabled, saving, saveError, activationReady, statusLoading, statusError, profileStatusUnknown, issues, onChange, onSave, onResume, onTurnOff, stopping, stopDisabled, onRetryStatus }: Props) {
  const saveButton = useRef<HTMLButtonElement>(null);
  const saveFeedback = useRef<HTMLDivElement>(null);
  const [ownsSaveFocus, setOwnsSaveFocus] = useState(false);
  const recovery = useNewsRecovery();
  const recoveryReady = recovery.status.phase === 'ready';
  const status = room ? newsPreparationStatus(room) : null;
  const activating = !!value.newsEnabled && !room?.workflowDraft.newsEnabled;
  const mayEnable = recoveryReady && activationReady && !statusLoading && !statusError;
  const canTurnOn = mayEnable || !!room?.workflowDraft.newsEnabled;
  const blockedActivation = activating && !mayEnable;
  const blockedSave = value.newsEnabled && !mayEnable;
  const needsRepair = !!room?.workflowDraft.newsEnabled && blockedSave;
  const saveUnavailable = !recoveryReady || blockedSave;
  const saveDisabled = !saving && (saveUnavailable || disabled || (!dirty && !ownsSaveFocus));
  const saveAriaDisabled = saveUnavailable || disabled || saving || !dirty;
  const saveErrorMessage = saveError ? errorMessage(saveError) : '';
  const lastSaveErrorMessage = useRef(saveErrorMessage);

  useLayoutEffect(() => {
    if (lastSaveErrorMessage.current === saveErrorMessage) return;
    lastSaveErrorMessage.current = saveErrorMessage;
    const button = saveButton.current;
    if (!saveErrorMessage || !button || document.activeElement !== button || button.getClientRects().length === 0
      || document.visibilityState !== 'visible' || !document.hasFocus()
      || document.querySelector('dialog[open], :popover-open')) return;
    saveFeedback.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [saveErrorMessage]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recoveryReady || saving || disabled || !dirty || blockedSave) return;

    const form = event.currentTarget;
    if (form.contains(document.activeElement)
      && document.visibilityState === 'visible'
      && document.hasFocus()
      && !document.querySelector('dialog[open], :popover-open')) {
      saveButton.current?.focus({ preventScroll: true });
      saveButton.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    onSave();
  }

  return <div className="settings-workflow">
    <h2>Automatic news preparation</h2>
    <p className="settings-description">Prepare stories automatically while the app is running and your Mac is awake. Quitting stops checks; closing the window can leave the app running.</p>
    {room && <form key={room.id} onSubmit={submit}>
      <fieldset className="news-workflow-fields" disabled={!recoveryReady || disabled || saving}>
        <label className="news-workflow-toggle"><input type="checkbox" checked={value.newsEnabled ?? false} disabled={!value.newsEnabled && !canTurnOn} onChange={event => onChange({ newsEnabled: event.target.checked })} /> Automatically prepare news</label>
        <label>Check sources every<select value={value.everyHours} onChange={event => onChange({ everyHours: Number(event.target.value) as 1 | 3 | 6 })}><option value={1}>1 hour</option><option value={3}>3 hours</option><option value={6}>6 hours</option></select></label>
        <label>News selection<select value={value.importance} onChange={event => onChange({ importance: event.target.value as 'major' | 'relevant' })}><option value="major">Major developments only</option><option value="relevant">Relevant stories</option></select></label>
        <label>Maximum automatic recordings per day<input type="number" min={1} max={10} required value={value.maxNewsClipsPerDay} onChange={event => onChange({ maxNewsClipsPerDay: Number(event.target.value) })} /></label>
        <p className="settings-description">Up to {Math.ceil(24 / value.everyHours)} scheduled checks per local day for this profile. Checks can use paid text generation even when no story qualifies. Automatic voice generation stops at the recording limit. Manual preparation and voice previews are outside these limits and can use additional provider credits.</p>
        <p className="settings-description">Saving an enabled workflow authorizes OpenAI and ElevenLabs requests. X sources also require an X bearer token. Music keeps playing while news is prepared.</p>
        {dirty && <p className="notice" role="status">Unsaved profile changes. {activating ? 'Preparation stays off until you save.' : 'Your changes apply after you save.'}</p>}
        {!recoveryReady && <div className="news-workflow-readiness"><strong>News data is {recovery.status.phase === 'recovering' ? 'recovering' : 'unavailable'}.</strong><p>Preparation controls are unavailable. A saved enabled setting will remain paused after recovery until you choose Resume.</p></div>}
        {recoveryReady && ((!mayEnable && !value.newsEnabled) || blockedActivation) ? <div className="news-workflow-readiness">
          <strong role="status">Finish setup before enabling preparation</strong>
          {statusLoading && <p role="status">Checking provider key status…</p>}
          {!!issues.length && <ul>{issues.map((issue, index) => <li key={`${issue.message}-${index}`}><span>{issue.message}</span>{issue.action && <button type="button" onClick={issue.action.run}>{issue.action.label}</button>}</li>)}</ul>}
        </div> : null}
        {recoveryReady && needsRepair && <div className="news-workflow-readiness"><strong role="status">Preparation cannot run with the current setup</strong><p>Restore the missing requirements, or turn preparation off and save this profile.</p>{!!issues.length && <ul>{issues.map((issue, index) => <li key={`${issue.message}-${index}`}><span>{issue.message}</span>{issue.action && <button type="button" onClick={issue.action.run}>{issue.action.label}</button>}</li>)}</ul>}</div>}
      </fieldset>
      <div ref={saveFeedback} className="news-workflow-save-feedback">
        <ErrorNotice error={saveError} />
        <button ref={saveButton} className="primary settings-save news-workflow-save" disabled={saveDisabled} aria-disabled={saveAriaDisabled || undefined} aria-busy={saving || undefined} onFocus={() => setOwnsSaveFocus(true)} onBlur={() => setOwnsSaveFocus(false)}>{saving ? 'Saving…' : activating ? 'Save setup and enable preparation' : 'Save setup'}</button>
      </div>
      {!room.enabled && <p className="notice">This profile is unavailable for playback. You can save preparation as off; make the profile available before enabling it.</p>}
      {room.workflowDraft.newsEnabled && <div className="news-workflow-stop">
        <button type="button" disabled={!recoveryReady || stopping || stopDisabled} onClick={onTurnOff}>{stopping ? 'Turning off…' : 'Turn off automatic preparation'}</button>
        <p className="form-hint">Takes effect immediately and asks this profile's automatic check to stop. Other unsaved edits stay here. A provider request already sent may still complete.</p>
      </div>}
      {status && <p className="settings-description">{!recoveryReady
        ? `Saved automatic setting: ${room.workflowDraft.newsEnabled ? 'on, paused' : 'off'}. News data recovery is required before its status can be confirmed.`
        : profileStatusUnknown
          ? <>Current automatic preparation status could not be confirmed. Last saved automatic setting: {room.workflowDraft.newsEnabled ? 'on' : 'off'}. Retry the failed status check above.</>
          : <>{status.label}. {status.detail}</>}</p>}
      {room.enabled && room.workflowDraft.newsEnabled && (room.workflowDraft.newsWorkflowError || room.workflowDraft.newsWorkflowPaused) && <button type="button" disabled={!recoveryReady || disabled || saving || dirty || !mayEnable} onClick={onResume}>Resume preparation</button>}
      {dirty && (room.workflowDraft.newsWorkflowError || room.workflowDraft.newsWorkflowPaused) && <p className="form-hint">Save your changes before resuming preparation. Resume remains a separate action.</p>}
      {!dirty && !mayEnable && room.enabled && room.workflowDraft.newsEnabled && (room.workflowDraft.newsWorkflowError || room.workflowDraft.newsWorkflowPaused) && <p className="form-hint">Resolve the listed setup or key issues before resuming preparation.</p>}
      <ErrorNotice error={statusError ? new Error('Provider key status could not be checked.') : null} />
      {Boolean(statusError) && <button type="button" onClick={onRetryStatus}>Retry key status</button>}
    </form>}
  </div>;
}
