import { ChevronDown } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';

import { FilterSelect } from '../../../components/FilterSelect/FilterSelect.component';
import { Select } from '../../../components/Select/Select.component';
import { ErrorNotice } from '../../../components/Shared';
import type { NewsRoomSettingsProps } from './NewsRoomSettings.types';

import './NewsRoomSettings.styles.css';

const paidProviderConsent =
  'Saving while enabled authorizes OpenAI and ElevenLabs requests. Source checks can incur text-generation charges even when no story qualifies; voice generation stops at the daily recording limit.';

export function NewsRoomSettings({
  profile,
  sources,
  djs,
  room,
  mood,
  interests,
  workflow,
  preparationStatus,
  preparationDetail,
  profileStatusUnknown,
  preparation,
  workflowReady,
  workflowStatusLoading,
  workflowStatusError,
  workflowIssues,
  resumePending,
  resumeError,
  stopping,
  stopError,
  enablingRoomProfile,
  enableRoomError,
  resumeDisabled,
  stopDisabled,
  retryWorkflowStatus,
  resumeWorkflow,
  turnOffWorkflow,
  busy,
  saving,
  dirty,
  saveDisabled,
  saveError,
  setRoom,
  setMood,
  setInterests,
  updateWorkflow,
  configureSources,
  configureDJ,
  configureProviders,
  enableRoomProfile,
  save,
}: NewsRoomSettingsProps) {
  const recordingLimitInput = useRef<HTMLInputElement>(null);
  const automationSection = useRef<HTMLElement>(null);
  const automationToggle = useRef<HTMLInputElement>(null);
  const resumeButton = useRef<HTMLButtonElement>(null);
  const turnOffButton = useRef<HTMLButtonElement>(null);
  const enableRoomButton = useRef<HTMLButtonElement>(null);
  const enableRoomFeedback = useRef<HTMLDivElement>(null);
  const resumeFeedback = useRef<HTMLDivElement>(null);
  const stopFeedback = useRef<HTMLDivElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const savedStatus = useRef<HTMLSpanElement>(null);
  const saveFeedback = useRef<HTMLDivElement>(null);
  const saveFocus = useRef(false);
  const focusedAction = useRef<{
    action: 'resume' | 'stop' | 'availability';
    element: HTMLButtonElement;
  } | null>(null);
  const previousActionState = useRef({
    resumePending,
    stopping,
    enablingRoomProfile,
    resumeError,
    stopError,
    enableRoomError,
  });
  const previousSaveState = useRef({ dirty, saving, saveError });
  const host = djs.find((value) => value.id === room.djId);
  const selectedSources = sources.filter((source) => room.sourceIds.includes(source.id));
  const disabled = busy || saving || !profile;
  const isEnabled = !!workflow.newsEnabled;
  const savedEnabled = !!profile?.workflowDraft.newsEnabled;
  const canEnable =
    workflowReady && !workflowStatusLoading && !workflowStatusError && !profileStatusUnknown && !!profile?.enabled;
  const paused =
    !!profile?.enabled &&
    savedEnabled &&
    (!!profile.workflowDraft.newsWorkflowError || !!profile.workflowDraft.newsWorkflowPaused);
  const canResume = paused && canEnable && !resumeDisabled && !dirty;
  const canTurnOff = savedEnabled && !stopDisabled && !stopping;
  const providerIssues = workflowIssues.filter((issue) => issue.action?.label === 'Provider keys');
  const setupIssues = workflowIssues.filter(
    (issue) => issue.action?.label !== 'Provider keys' && issue.action?.label !== 'Review room options',
  );
  const activationLabel = profileStatusUnknown
    ? 'Status unconfirmed'
    : profile?.enabled === false
      ? preparationStatus
      : isEnabled && !savedEnabled
        ? 'Starts after saving'
        : !isEnabled && savedEnabled && dirty
          ? 'Turns off after saving'
          : isEnabled
            ? preparationStatus
            : 'Preparation off';

  useLayoutEffect(() => {
    const previous = previousSaveState.current;
    previousSaveState.current = { dirty, saving, saveError };
    if (!saveFocus.current) return;
    if (saveError && previous.saveError !== saveError) {
      const activeElement = document.activeElement;
      if (
        (activeElement === saveButton.current || activeElement === document.body) &&
        document.visibilityState === 'visible' &&
        document.hasFocus()
      )
        saveFeedback.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      saveFocus.current = false;
      return;
    }
    if (previous.saving && !saving && !dirty && !saveError) {
      const canRestoreFocus =
        document.activeElement === document.body &&
        document.visibilityState === 'visible' &&
        document.hasFocus() &&
        !!savedStatus.current?.getClientRects().length &&
        !document.querySelector('dialog[open], :popover-open');
      if (canRestoreFocus) savedStatus.current?.focus({ preventScroll: true });
      saveFocus.current = false;
    }
  }, [dirty, saveError, saving]);

  useLayoutEffect(() => {
    const previous = previousActionState.current;
    previousActionState.current = {
      resumePending,
      stopping,
      enablingRoomProfile,
      resumeError,
      stopError,
      enableRoomError,
    };
    const ownedAction = focusedAction.current;
    if (!ownedAction) return;

    const errorChanged =
      (ownedAction.action === 'resume' && resumeError && previous.resumeError !== resumeError) ||
      (ownedAction.action === 'stop' && stopError && previous.stopError !== stopError) ||
      (ownedAction.action === 'availability' && enableRoomError && previous.enableRoomError !== enableRoomError);
    if (errorChanged) {
      const activeElement = document.activeElement;
      if (
        (activeElement === ownedAction.element || activeElement === document.body) &&
        document.visibilityState === 'visible' &&
        document.hasFocus()
      ) {
        const feedback =
          ownedAction.action === 'resume'
            ? resumeFeedback.current
            : ownedAction.action === 'stop'
              ? stopFeedback.current
              : enableRoomFeedback.current;
        feedback?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      focusedAction.current = null;
      return;
    }

    const completed =
      ownedAction.action === 'resume'
        ? previous.resumePending && !resumePending && !resumeError
        : ownedAction.action === 'stop'
          ? previous.stopping && !stopping && !stopError
          : previous.enablingRoomProfile && !enablingRoomProfile && !enableRoomError;
    if (completed) {
      const focusTarget =
        automationToggle.current?.getClientRects().length && !automationToggle.current.disabled
          ? automationToggle.current
          : automationSection.current;
      const canRestoreFocus =
        document.activeElement === document.body &&
        document.visibilityState === 'visible' &&
        document.hasFocus() &&
        !!focusTarget?.getClientRects().length &&
        !document.querySelector('dialog[open], :popover-open');
      if (canRestoreFocus) focusTarget?.focus({ preventScroll: true });
      focusedAction.current = null;
    }
  }, [resumePending, stopping, enablingRoomProfile, resumeError, stopError, enableRoomError]);

  function runFocusedAction(action: 'resume' | 'stop' | 'availability') {
    if (action === 'resume' && (resumePending || !canResume)) return;
    if (action === 'stop' && (stopping || !canTurnOff)) return;
    if (action === 'availability' && (busy || enablingRoomProfile)) return;
    const element =
      action === 'resume' ? resumeButton.current : action === 'stop' ? turnOffButton.current : enableRoomButton.current;
    if (element && document.activeElement === element) focusedAction.current = { action, element };
    if (action === 'resume') {
      resumeWorkflow();
    } else if (action === 'stop') {
      turnOffWorkflow();
    } else {
      enableRoomProfile();
    }
  }

  function submitSave() {
    if (saveDisabled) return;
    const limit = recordingLimitInput.current;
    if (!limit) return;
    if (!limit.checkValidity()) {
      const group = limit.closest('details');
      if (group) group.open = true;
      limit.reportValidity();
      limit.focus();
      return;
    }
    saveFocus.current = document.activeElement === saveButton.current;
    save();
  }

  return (
    <aside className="news-room-settings" aria-label="Room settings">
      <div className="news-room-settings-heading">
        <h2>Room settings</h2>
      </div>

      {!profile ? (
        <p className="news-room-settings-empty">
          Choose a room above to see and edit its sources, host, and writing setup.
        </p>
      ) : (
        <>
          <section
            ref={automationSection}
            className="news-room-automation"
            aria-labelledby="bucket-automation-title"
            tabIndex={-1}
          >
            <div className="news-room-automation-heading">
              <div>
                <h3 id="bucket-automation-title">Automatic preparation</h3>
                <p>Check your sources and prepare recordings while the app is running.</p>
              </div>
              <span className={`news-room-automation-state ${isEnabled ? 'is-enabled' : ''}`}>{activationLabel}</span>
            </div>
            <label className="news-room-automation-toggle">
              <input
                type="checkbox"
                ref={automationToggle}
                checked={isEnabled}
                disabled={disabled || saving || (!isEnabled && !canEnable)}
                onChange={(event) => updateWorkflow({ newsEnabled: event.target.checked })}
              />
              <span>Automatically prepare news</span>
            </label>
            <p className="news-room-automation-detail">
              {profileStatusUnknown
                ? 'Preparation status could not be confirmed. Check again before enabling.'
                : !profile.enabled
                  ? preparationDetail
                  : paused
                    ? 'Automatic preparation is paused for this room. Resume it when the setup is ready.'
                    : isEnabled && !savedEnabled
                      ? 'Preparation stays off until you save this room.'
                      : !isEnabled && savedEnabled && dirty
                        ? 'Automatic preparation stays on until you save this room.'
                        : !isEnabled
                          ? 'Saved recordings remain available. Turn this on and save to start automatic checks.'
                          : preparationDetail}
            </p>
            {workflowStatusLoading && (
              <p className="news-room-automation-detail" role="status">
                Checking provider access…
              </p>
            )}
            {!!workflowStatusError && (
              <div className="news-room-automation-readiness">
                <strong>Provider access could not be confirmed.</strong>
                <button type="button" className="news-room-link" onClick={retryWorkflowStatus}>
                  Check provider access again
                </button>
              </div>
            )}
            {!canEnable && !workflowStatusError && !profileStatusUnknown && !workflowStatusLoading && (
              <div className="news-room-automation-readiness">
                <strong>
                  {isEnabled ? 'Preparation needs attention.' : 'Finish setup before enabling preparation.'}
                </strong>
                {workflowIssues.length > 0 ? (
                  <ul>
                    {providerIssues.length > 0 && (
                      <li key="provider-keys">{providerIssues.map((issue) => issue.message).join(' ')}</li>
                    )}
                    {setupIssues.map((issue) => (
                      <li key={issue.message}>
                        <span>{issue.message}</span>
                        {issue.action && (
                          <button type="button" className="news-room-link" onClick={issue.action.run}>
                            {issue.action.label}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Make this room available and complete its news setup.</p>
                )}
                {!profile.enabled && (
                  <div className="news-room-automation-actions">
                    <button
                      ref={enableRoomButton}
                      type="button"
                      aria-disabled={busy || enablingRoomProfile || undefined}
                      aria-busy={enablingRoomProfile || undefined}
                      onClick={() => runFocusedAction('availability')}
                    >
                      {enablingRoomProfile ? 'Making room available…' : 'Make room available'}
                    </button>
                    <span>This also makes the room available for DJ playback.</span>
                    <div ref={enableRoomFeedback}>
                      <ErrorNotice error={enableRoomError} />
                    </div>
                  </div>
                )}
              </div>
            )}
            <button type="button" className="news-room-link" disabled={saving} onClick={configureProviders}>
              Provider keys
            </button>
            {isEnabled && (dirty || saving) ? (
              <p className="news-room-paid-consent" role="note">
                {paidProviderConsent}
              </p>
            ) : isEnabled ? (
              <details className="news-room-paid-consent-disclosure">
                <summary>Provider usage and costs</summary>
                <p className="news-room-paid-consent" role="note">
                  {paidProviderConsent}
                </p>
              </details>
            ) : null}
            {dirty && isEnabled && !savedEnabled && (
              <p className="news-room-settings-hint" role="status">
                Preparation remains off until you save this setup.
              </p>
            )}
            {paused && isEnabled && (
              <div className="news-room-automation-actions">
                <button
                  ref={resumeButton}
                  type="button"
                  aria-disabled={!canResume || resumePending || undefined}
                  aria-busy={resumePending || undefined}
                  onClick={() => runFocusedAction('resume')}
                >
                  {resumePending ? 'Resuming…' : 'Resume preparation'}
                </button>
                {dirty && <span>Save your setup changes before resuming.</span>}
                <div ref={resumeFeedback}>
                  <ErrorNotice error={resumeError} />
                </div>
              </div>
            )}
            {savedEnabled && (
              <div className="news-room-automation-actions">
                <button
                  ref={turnOffButton}
                  type="button"
                  className="news-room-link"
                  aria-disabled={!canTurnOff || stopping || undefined}
                  aria-busy={stopping || undefined}
                  onClick={() => runFocusedAction('stop')}
                >
                  {stopping ? 'Turning off…' : 'Turn off now'}
                </button>
                <div ref={stopFeedback}>
                  <ErrorNotice error={stopError} />
                </div>
                <span>Stops future checks now. A provider request already sent may still finish.</span>
              </div>
            )}
            {preparation && !profileStatusUnknown && (
              <p className="news-room-automation-usage">
                {preparation.checks} of {preparation.checkLimit} checks · {preparation.recordings} of{' '}
                {preparation.recordingLimit} recordings today
              </p>
            )}
          </section>

          <details className="news-room-settings-group">
            <summary>
              <span className="news-room-settings-group-copy">
                <strong>Sources &amp; schedule</strong>
                <small>
                  {selectedSources.length} sources · every {workflow.everyHours} hours
                </small>
              </span>
              <ChevronDown className="news-room-settings-chevron" size={17} aria-hidden="true" />
            </summary>
            <div className="news-room-settings-fields news-room-sources-fields">
              <fieldset disabled={disabled}>
                <legend>News sources</legend>
                {sources.length ? (
                  <div className="news-room-source-list">
                    {sources.map((source) => (
                      <label key={source.id} htmlFor={`bucket-source-${source.id}`}>
                        <input
                          id={`bucket-source-${source.id}`}
                          type="checkbox"
                          checked={room.sourceIds.includes(source.id)}
                          disabled={room.sourceIds.length >= 20 && !room.sourceIds.includes(source.id)}
                          onChange={() =>
                            setRoom({
                              ...room,
                              sourceIds: room.sourceIds.includes(source.id)
                                ? room.sourceIds.filter((id) => id !== source.id)
                                : [...room.sourceIds, source.id],
                            })
                          }
                        />
                        <span className="news-room-source-name">{source.name}</span>
                        <small className="news-room-source-kind">
                          {source.kind === 'twitter' ? 'X' : source.kind === 'hacker-news' ? 'Hacker News' : 'RSS'}
                        </small>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="news-room-settings-hint">No sources are available yet. Add one to prepare stories.</p>
                )}
                <button id="bucket-manage-sources" type="button" className="news-room-link" onClick={configureSources}>
                  Manage sources
                </button>
              </fieldset>

              <label htmlFor="bucket-check-interval">
                Check sources every
                <Select
                  id="bucket-check-interval"
                  value={workflow.everyHours}
                  disabled={disabled}
                  onChange={(event) => updateWorkflow({ everyHours: Number(event.target.value) as 1 | 3 | 6 })}
                >
                  <option value={1}>1 hour</option>
                  <option value={3}>3 hours</option>
                  <option value={6}>6 hours</option>
                </Select>
              </label>
              <label htmlFor="bucket-recording-limit">
                Automatic recordings per day
                <input
                  ref={recordingLimitInput}
                  id="bucket-recording-limit"
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={workflow.maxNewsClipsPerDay}
                  disabled={disabled}
                  onChange={(event) => updateWorkflow({ maxNewsClipsPerDay: Number(event.target.value) })}
                />
              </label>
            </div>
          </details>

          <details className="news-room-settings-group">
            <summary>
              <span className="news-room-settings-group-copy">
                <strong>Selection</strong>
                <small>{workflow.importance === 'major' ? 'Major developments' : 'Relevant stories'}</small>
              </span>
              <ChevronDown className="news-room-settings-chevron" size={17} aria-hidden="true" />
            </summary>
            <div className="news-room-settings-fields">
              <label htmlFor="bucket-importance">
                News selection
                <Select
                  id="bucket-importance"
                  value={workflow.importance}
                  disabled={disabled}
                  onChange={(event) => updateWorkflow({ importance: event.target.value as 'major' | 'relevant' })}
                >
                  <option value="major">Major developments only</option>
                  <option value="relevant">Relevant stories</option>
                </Select>
              </label>
              <label htmlFor="bucket-interests">
                News interests · Optional
                <textarea
                  id="bucket-interests"
                  rows={3}
                  maxLength={4000}
                  value={interests}
                  disabled={disabled}
                  onChange={(event) => setInterests(event.target.value)}
                  placeholder="Topics to include or skip. Leave empty for any story from selected sources."
                />
              </label>
            </div>
          </details>

          <details className="news-room-settings-group" open>
            <summary>
              <span className="news-room-settings-group-copy">
                <strong>Writing</strong>
                <small>
                  {host?.name ?? 'Choose a host'} · {mood || 'No mood'}
                </small>
              </span>
              <ChevronDown className="news-room-settings-chevron" size={17} aria-hidden="true" />
            </summary>
            <div className="news-room-settings-fields">
              <FilterSelect
                label="DJ"
                value={room.djId ?? ''}
                emptyLabel="Choose a DJ"
                choices={djs.map((value) => ({ value: value.id, label: value.name }))}
                disabled={disabled}
                onChange={(djId) => setRoom({ ...room, djId: djId || null })}
              />
              <label htmlFor="bucket-mood">
                Mood
                <textarea
                  id="bucket-mood"
                  rows={3}
                  maxLength={4000}
                  value={mood}
                  disabled={disabled}
                  onChange={(event) => setMood(event.target.value)}
                  placeholder="Relaxed, curious, and low-key."
                />
              </label>
              {host && (
                <details className="news-room-host-summary">
                  <summary>Host instructions and exclusions</summary>
                  <p>
                    <strong>Personality</strong> · {host.personality || 'None saved.'}
                  </p>
                  <p>
                    <strong>Instructions</strong> · {host.instructions || 'None saved.'}
                  </p>
                  <p>
                    <strong>Exclusions</strong> · {host.exclusions || 'None saved.'}
                  </p>
                </details>
              )}
              <button
                id="bucket-manage-djs"
                type="button"
                className="news-room-link"
                disabled={disabled}
                onClick={configureDJ}
              >
                Manage hosts and host instructions
              </button>
              <details className="news-room-writing-policy">
                <summary>Fixed writing policy</summary>
                <p>
                  Scripts use facts from one selected story, attribute its source, and default to 25–45 spoken words.
                  They stay within 55 words and 700 characters, with no URL, formal greeting, or sign-off.
                </p>
              </details>
            </div>
          </details>

          <details className="news-room-settings-group news-room-memory">
            <summary>
              <span className="news-room-settings-group-copy">
                <strong>Playback memory</strong>
                <small>Started and played stories are held out</small>
              </span>
              <ChevronDown className="news-room-settings-chevron" size={17} aria-hidden="true" />
            </summary>
            <p>
              Playback and editorial review are separate. This list marks a story heard only after completed playback;
              in-progress and interrupted playback remain distinct.
            </p>
          </details>

          <footer className="news-room-settings-save">
            <div ref={saveFeedback}>
              <ErrorNotice error={saveError} />
            </div>
            {dirty || saving ? (
              <button
                ref={saveButton}
                type="button"
                className="primary"
                disabled={saveDisabled}
                aria-disabled={saveDisabled || undefined}
                aria-busy={saving || undefined}
                onClick={submitSave}
              >
                {saving ? 'Saving…' : 'Save setup'}
              </button>
            ) : (
              <span ref={savedStatus} className="news-room-settings-saved" role="status" tabIndex={-1}>
                Setup saved
              </span>
            )}
            {dirty && <p role="status">Unsaved room and preparation settings.</p>}
          </footer>
        </>
      )}
    </aside>
  );
}
