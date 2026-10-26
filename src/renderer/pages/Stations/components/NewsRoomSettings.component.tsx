import { AudioLines, ChevronDown, ListFilter, RadioTower, SlidersHorizontal } from 'lucide-react';
import { useRef } from 'react';

import { FilterSelect } from '../../../components/FilterSelect/FilterSelect.component';
import { ErrorNotice } from '../../../components/Shared';
import type { NewsRoomSettingsProps } from './NewsRoomSettings.types';

import './NewsRoomSettings.styles.css';

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
  save,
}: NewsRoomSettingsProps) {
  const recordingLimitInput = useRef<HTMLInputElement>(null);
  const host = djs.find((value) => value.id === room.djId);
  const selectedSources = sources.filter((source) => room.sourceIds.includes(source.id));
  const disabled = busy || !profile;

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
          <details className="news-room-settings-group">
            <summary>
              <span className="news-room-settings-group-icon">
                <RadioTower size={17} aria-hidden="true" />
              </span>
              <span className="news-room-settings-group-copy">
                <strong>Sources &amp; schedule</strong>
                <small>
                  {selectedSources.length} sources · every {workflow.everyHours} hours
                </small>
              </span>
              <ChevronDown className="news-room-settings-chevron" size={17} aria-hidden="true" />
            </summary>
            <div className="news-room-settings-fields">
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
                        <span>{source.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="news-room-settings-hint">No sources are available yet. Add one to prepare stories.</p>
                )}
                <button type="button" className="news-room-link" onClick={configureSources}>
                  Manage sources
                </button>
              </fieldset>

              <label htmlFor="bucket-check-interval">
                Check sources every
                <select
                  id="bucket-check-interval"
                  value={workflow.everyHours}
                  disabled={disabled}
                  onChange={(event) => updateWorkflow({ everyHours: Number(event.target.value) as 1 | 3 | 6 })}
                >
                  <option value={1}>1 hour</option>
                  <option value={3}>3 hours</option>
                  <option value={6}>6 hours</option>
                </select>
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
              <div className="news-room-preparation-status" role="status">
                <strong>{profileStatusUnknown ? 'Status unconfirmed' : preparationStatus}</strong>
                <span>{profileStatusUnknown ? 'Showing the last saved preparation state.' : preparationDetail}</span>
                {preparation && !profileStatusUnknown && (
                  <small>
                    {preparation.checks} / {preparation.checkLimit} checks · {preparation.recordings} /{' '}
                    {preparation.recordingLimit} recordings saved today
                  </small>
                )}
              </div>
            </div>
          </details>

          <details className="news-room-settings-group">
            <summary>
              <span className="news-room-settings-group-icon">
                <ListFilter size={17} aria-hidden="true" />
              </span>
              <span className="news-room-settings-group-copy">
                <strong>Selection</strong>
                <small>{workflow.importance === 'major' ? 'Major developments' : 'Relevant stories'}</small>
              </span>
              <ChevronDown className="news-room-settings-chevron" size={17} aria-hidden="true" />
            </summary>
            <div className="news-room-settings-fields">
              <label htmlFor="bucket-importance">
                News selection
                <select
                  id="bucket-importance"
                  value={workflow.importance}
                  disabled={disabled}
                  onChange={(event) => updateWorkflow({ importance: event.target.value as 'major' | 'relevant' })}
                >
                  <option value="major">Major developments only</option>
                  <option value="relevant">Relevant stories</option>
                </select>
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
              <span className="news-room-settings-group-icon">
                <AudioLines size={17} aria-hidden="true" />
              </span>
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
              <button type="button" className="news-room-link" onClick={configureDJ}>
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
              <span className="news-room-settings-group-icon">
                <SlidersHorizontal size={17} aria-hidden="true" />
              </span>
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
            <ErrorNotice error={saveError} />
            <button
              type="button"
              className="primary"
              disabled={saveDisabled}
              aria-disabled={saveDisabled || undefined}
              aria-busy={saving || undefined}
              onClick={submitSave}
            >
              {saving ? 'Saving…' : dirty ? 'Save setup' : 'Setup saved'}
            </button>
            {dirty && <p role="status">Unsaved room and preparation settings.</p>}
          </footer>
        </>
      )}
    </aside>
  );
}
