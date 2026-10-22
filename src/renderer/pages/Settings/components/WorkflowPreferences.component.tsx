import { type FormEvent, useLayoutEffect, useRef, useState } from 'react';

import { newsPreparationStatus } from '../../../../shared/news-preparation-status';
import { ErrorNotice, errorMessage } from '../../../components/Shared';
import { useNewsRecovery } from '../../../NewsRecovery';
import type { WorkflowPreferencesProps } from './WorkflowPreferences.types';

import './WorkflowPreferences.styles.css';

export function WorkflowPreferences({
  active,
  resuming,
  resumeError,
  stopError,
  room,
  value,
  dirty,
  disabled,
  saving,
  saveError,
  activationReady,
  statusLoading,
  statusError,
  profileStatusUnknown,
  issues,
  onChange,
  onSave,
  onResume,
  onTurnOff,
  stopping,
  stopDisabled,
  onRetryStatus,
}: WorkflowPreferencesProps) {
  const saveButton = useRef<HTMLButtonElement>(null);
  const saveFeedback = useRef<HTMLDivElement>(null);
  const [ownsSaveFocus, setOwnsSaveFocus] = useState(false);
  const stopButton = useRef<HTMLButtonElement>(null);
  const resumeButton = useRef<HTMLButtonElement>(null);
  const [focusedAction, setFocusedAction] = useState<{ key: 'off' | 'resume'; element: HTMLButtonElement } | null>(
    null,
  );
  const ownsAction = (key: 'off' | 'resume') =>
    active && focusedAction?.key === key && document.activeElement === focusedAction.element;
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
  const saveDisabled = !saving && !ownsSaveFocus && (saveUnavailable || disabled || !dirty);
  const saveAriaDisabled = saveUnavailable || disabled || saving || !dirty;
  const needsResume =
    !!room?.enabled &&
    !!room.workflowDraft.newsEnabled &&
    !!(room.workflowDraft.newsWorkflowError || room.workflowDraft.newsWorkflowPaused);
  const resumeAllowed = needsResume && recoveryReady && !disabled && !saving && !dirty && mayEnable && !resuming;
  const stopAllowed = recoveryReady && !!room?.workflowDraft.newsEnabled && !stopping && !stopDisabled;
  const preparationResumed = !!room?.enabled && !!room.workflowDraft.newsEnabled && !needsResume;
  const stopErrorMessage = stopError ? errorMessage(stopError) : '';
  const resumeErrorMessage = resumeError ? errorMessage(resumeError) : '';

  useLayoutEffect(() => {
    const focused = document.activeElement;
    if (
      !(focused instanceof HTMLElement) ||
      !focused.checkVisibility() ||
      document.visibilityState !== 'visible' ||
      !document.hasFocus()
    )
      return;
    if (
      (stopErrorMessage && focused === stopButton.current) ||
      (resumeErrorMessage && focused === resumeButton.current)
    ) {
      focused.closest('.news-workflow-action')?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }, [stopErrorMessage, resumeErrorMessage]);

  const saveErrorMessage = saveError ? errorMessage(saveError) : '';
  const lastSaveErrorMessage = useRef(saveErrorMessage);

  useLayoutEffect(() => {
    if (lastSaveErrorMessage.current === saveErrorMessage) return;
    lastSaveErrorMessage.current = saveErrorMessage;
    const button = saveButton.current;
    if (
      !saveErrorMessage ||
      !button ||
      document.activeElement !== button ||
      button.getClientRects().length === 0 ||
      document.visibilityState !== 'visible' ||
      !document.hasFocus() ||
      document.querySelector('dialog[open], :popover-open')
    )
      return;
    saveFeedback.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [saveErrorMessage]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recoveryReady || saving || disabled || !dirty || blockedSave) return;

    const form = event.currentTarget;
    if (
      form.contains(document.activeElement) &&
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      !document.querySelector('dialog[open], :popover-open')
    ) {
      saveButton.current?.focus({ preventScroll: true });
      saveButton.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    onSave();
  }

  return (
    <div className="settings-workflow">
      <h2>Automatic news preparation</h2>
      <p className="settings-description">
        Runs while the app is running and your Mac is awake. Quitting stops checks; closing the window may leave the app
        running.
      </p>
      {room && (
        <form key={room.id} onSubmit={submit}>
          <fieldset className="news-workflow-fields" disabled={!recoveryReady || disabled || saving}>
            <label className="news-workflow-toggle">
              <input
                type="checkbox"
                checked={value.newsEnabled ?? false}
                disabled={!value.newsEnabled && !canTurnOn}
                onChange={(event) => onChange({ newsEnabled: event.target.checked })}
              />{' '}
              Automatically prepare news
            </label>
            <label>
              Check sources every
              <select
                value={value.everyHours}
                onChange={(event) => onChange({ everyHours: Number(event.target.value) as 1 | 3 | 6 })}
              >
                <option value={1}>1 hour</option>
                <option value={3}>3 hours</option>
                <option value={6}>6 hours</option>
              </select>
            </label>
            <label>
              News selection
              <select
                value={value.importance}
                onChange={(event) => onChange({ importance: event.target.value as 'major' | 'relevant' })}
              >
                <option value="major">Major developments only</option>
                <option value="relevant">Relevant stories</option>
              </select>
            </label>
            <label>
              Maximum automatic recordings per day
              <input
                type="number"
                min={1}
                max={10}
                required
                value={value.maxNewsClipsPerDay}
                onChange={(event) => onChange({ maxNewsClipsPerDay: Number(event.target.value) })}
              />
            </label>
            <div className="news-workflow-disclosures">
              <p className="settings-description">
                Up to {Math.ceil(24 / value.everyHours)} checks per local day for this profile. Checks may incur paid
                text-generation charges even when no story qualifies. Automatic voice generation stops at the daily
                recording limit; host voice previews are outside the limit and may use extra provider credits.
              </p>
              <p className="settings-description">
                Saving while enabled authorizes OpenAI and ElevenLabs requests. X sources require an X bearer token.
                Music keeps playing during preparation.
              </p>
            </div>
            {dirty && (
              <p className="notice" role="status">
                Unsaved profile changes.{' '}
                {activating ? 'Preparation stays off until you save.' : 'Your changes apply after you save.'}
              </p>
            )}
            {!recoveryReady && (
              <div className="news-workflow-readiness">
                <strong>News data is {recovery.status.phase === 'recovering' ? 'recovering' : 'unavailable'}.</strong>
                <p>
                  Preparation controls are unavailable. A saved enabled setting will remain paused after recovery until
                  you choose Resume.
                </p>
              </div>
            )}
            {recoveryReady && ((!mayEnable && !value.newsEnabled) || blockedActivation) ? (
              <div className="news-workflow-readiness">
                <strong role="status">Finish setup before enabling preparation</strong>
                {statusLoading && <p role="status">Checking provider key status…</p>}
                {!!issues.length && (
                  <ul>
                    {issues.map((issue, index) => (
                      <li key={`${issue.message}-${index}`}>
                        <span>{issue.message}</span>
                        {issue.action && (
                          <button type="button" onClick={issue.action.run}>
                            {issue.action.label}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
            {recoveryReady && needsRepair && (
              <div className="news-workflow-readiness">
                <strong role="status">Preparation cannot run with the current setup</strong>
                <p>Restore the missing requirements, or turn preparation off and save this profile.</p>
                {!!issues.length && (
                  <ul>
                    {issues.map((issue, index) => (
                      <li key={`${issue.message}-${index}`}>
                        <span>{issue.message}</span>
                        {issue.action && (
                          <button type="button" onClick={issue.action.run}>
                            {issue.action.label}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </fieldset>
          <div ref={saveFeedback} className="news-workflow-save-feedback">
            <ErrorNotice error={saveError} />
            <button
              ref={saveButton}
              className="primary settings-save news-workflow-save"
              disabled={saveDisabled}
              aria-disabled={saveAriaDisabled || undefined}
              aria-busy={saving || undefined}
              onFocus={() => setOwnsSaveFocus(true)}
              onBlur={() => setOwnsSaveFocus(false)}
            >
              {saving ? 'Saving…' : activating ? 'Save setup and enable preparation' : 'Save setup'}
            </button>
          </div>
          {!room.enabled && (
            <p className="notice">
              This profile is unavailable for playback. You can save preparation as off; make the profile available
              before enabling it.
            </p>
          )}
          {(room.workflowDraft.newsEnabled || ownsAction('off') || Boolean(stopError)) && (
            <div className="news-workflow-stop news-workflow-action">
              <button
                ref={stopButton}
                type="button"
                disabled={!stopAllowed && !ownsAction('off')}
                aria-disabled={!stopAllowed || undefined}
                aria-busy={stopping || undefined}
                onFocus={(event) => setFocusedAction({ key: 'off', element: event.currentTarget })}
                onBlur={() => setFocusedAction(null)}
                onClick={() => {
                  if (stopAllowed) onTurnOff();
                }}
              >
                {stopping
                  ? 'Turning off…'
                  : room.workflowDraft.newsEnabled
                    ? 'Turn off automatic preparation'
                    : 'Automatic preparation off'}
              </button>
              <ErrorNotice error={stopError} />
              <p className="form-hint">
                Takes effect immediately and asks this profile's automatic check to stop. Other unsaved edits stay here.
                A provider request already sent may still complete.
              </p>
            </div>
          )}
          {status && (
            <p className="settings-description">
              {!recoveryReady ? (
                `Saved automatic setting: ${room.workflowDraft.newsEnabled ? 'on, paused' : 'off'}. News data recovery is required before its status can be confirmed.`
              ) : profileStatusUnknown ? (
                <>
                  Current automatic preparation status could not be confirmed. Last saved automatic setting:{' '}
                  {room.workflowDraft.newsEnabled ? 'on' : 'off'}. Retry the failed status check above.
                </>
              ) : (
                <>
                  {status.label}. {status.detail}
                </>
              )}
            </p>
          )}
          {(needsResume || ownsAction('resume') || Boolean(resumeError)) && (
            <div className="news-workflow-action">
              <button
                ref={resumeButton}
                type="button"
                disabled={!resumeAllowed && !ownsAction('resume')}
                aria-disabled={!resumeAllowed || undefined}
                aria-busy={resuming || undefined}
                onFocus={(event) => setFocusedAction({ key: 'resume', element: event.currentTarget })}
                onBlur={() => setFocusedAction(null)}
                onClick={() => {
                  if (resumeAllowed) onResume();
                }}
              >
                {resuming ? 'Resuming…' : preparationResumed ? 'Preparation resumed' : 'Resume preparation'}
              </button>
              <ErrorNotice error={resumeError} />
            </div>
          )}
          {dirty && (room.workflowDraft.newsWorkflowError || room.workflowDraft.newsWorkflowPaused) && (
            <p className="form-hint">
              Save your changes before resuming preparation. Resume remains a separate action.
            </p>
          )}
          {!dirty &&
            !mayEnable &&
            room.enabled &&
            room.workflowDraft.newsEnabled &&
            (room.workflowDraft.newsWorkflowError || room.workflowDraft.newsWorkflowPaused) && (
              <p className="form-hint">Resolve the listed setup or key issues before resuming preparation.</p>
            )}
          <ErrorNotice error={statusError ? new Error('Provider key status could not be checked.') : null} />
          {Boolean(statusError) && (
            <button type="button" onClick={onRetryStatus}>
              Retry key status
            </button>
          )}
        </form>
      )}
    </div>
  );
}
