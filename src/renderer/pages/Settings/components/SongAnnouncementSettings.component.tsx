import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { normalizeDJPlaybackSettings, type DJPlaybackSettings } from '../../../../shared/dj-playback';
import { announcementStyles } from '../../../../shared/song-announcements';
import { unwrap } from '../../../api';
import { SectionHeading } from '../../../components/SectionHeading/SectionHeading.component';
import { ErrorNotice } from '../../../components/Shared';
import { useNewsRecovery } from '../../../NewsRecovery';
import { useRetryFocus } from '../../../useRetryFocus';
import { useSettingsEdits } from '../SettingsEdits';
import { SettingsSubsection } from './SettingsSubsection.component';
import { SongAnnouncementPreferences } from './SongAnnouncementPreferences.component';

export function SongAnnouncementSettings() {
  const recoveryReady = useNewsRecovery().status.phase === 'ready';
  const state = useQuery({
    queryKey: ['localState'],
    queryFn: async () => unwrap(await window.wave.getLocalState()),
    enabled: recoveryReady,
  });
  const summary = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const [saveFocused, setSaveFocused] = useState(false);
  const retryFocus = useRetryFocus({
    ownerKey: 'settings:playback:announcements',
    target: () =>
      toggle.current?.checkVisibility() && !toggle.current.matches(':disabled') ? toggle.current : summary.current,
    canFocusSuccess: () => recoveryReady && !state.isError && !state.isFetching && !!state.data,
  });
  const edit = useSettingsEdits().announcements;
  const { draft, save } = edit;
  const settings = draft ?? normalizeDJPlaybackSettings(state.data?.djPlayback);
  const styleName = announcementStyles.find((option) => option.value === settings.announcementStyle)?.label;
  function change(patch: Partial<DJPlaybackSettings>) {
    edit.change({
      announceTracks: settings.announceTracks,
      announceEverySongs: settings.announceEverySongs,
      announcementStyle: settings.announcementStyle,
      announcementLines: settings.announcementLines,
      ...patch,
    });
  }

  return (
    <SettingsSubsection
      className="song-announcement-settings"
      title="Song announcements"
      description={
        settings.announceTracks
          ? `On · ${styleName} · Every ${settings.announceEverySongs} songs`
          : 'Off · Timing, style and custom lines'
      }
      id="song-announcements-title"
      ref={summary}
      dirty={draft !== null}
      status={save.isPending ? 'Saving…' : save.isError || state.isError ? 'Needs attention' : undefined}
    >
      <SectionHeading title="Timing & wording" helpLabel="About song announcements">
        <p>
          Song introductions play after the configured number of completed songs, or always after fact-only news. The
          default is six. Each introduction resets the count; skips do not count. Older news recordings with their own
          ending play without an introduction.
        </p>
        <p>
          Enabling introductions authorizes ElevenLabs speech requests. Introductions use the saved DJ voice and the
          next song's title and artist. Styles rotate their phrasing without repeating the last few lines. A repeated
          song may reuse its recorded introduction during this session.
        </p>
        <p>Choose My own lines to write introductions in your own voice. Text examples do not use credits.</p>
      </SectionHeading>
      {!recoveryReady && (
        <p className="notice">Song announcement settings are unavailable until news data recovery completes.</p>
      )}
      <ErrorNotice
        error={state.error}
        retryRef={retryFocus.retryRef}
        retrying={state.isFetching}
        retry={() => retryFocus.retry(() => state.refetch())}
      />
      {state.isPending && <p role="status">Loading song announcement settings…</p>}
      <form
        className="preference-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!recoveryReady || !state.data || draft === null || save.isPending) return;
          const active = document.activeElement;
          if (
            active instanceof HTMLElement &&
            event.currentTarget.contains(active) &&
            document.visibilityState === 'visible' &&
            document.hasFocus() &&
            !document.querySelector('dialog[open], :popover-open')
          ) {
            saveButton.current?.focus({ preventScroll: true });
            saveButton.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
          edit.submit();
        }}
      >
        <fieldset className="preference-fields" disabled={!recoveryReady || !state.data || save.isPending}>
          <div className="preference-row">
            <label className="preference-row dj-song-interval">
              <input
                ref={toggle}
                id="announce-tracks"
                type="checkbox"
                checked={settings.announceTracks}
                aria-describedby="track-announcement-cost"
                onChange={(event) => change({ announceTracks: event.target.checked })}
              />
              Announce the next song
            </label>
            <span className="preference-note" id="track-announcement-cost">
              Uses ElevenLabs credits
            </span>
          </div>
          <label className="preference-row dj-song-interval">
            Announce after
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              required
              disabled={!settings.announceTracks}
              value={Number.isNaN(settings.announceEverySongs) ? '' : settings.announceEverySongs}
              onChange={(event) =>
                change({ announceEverySongs: event.target.value === '' ? NaN : Number(event.target.value) })
              }
            />
            <span>{settings.announceEverySongs === 1 ? 'completed song' : 'completed songs'}</span>
          </label>
          <SongAnnouncementPreferences
            style={settings.announcementStyle}
            lines={settings.announcementLines}
            disabled={!settings.announceTracks}
            onChange={change}
          />
        </fieldset>
        <button
          ref={saveButton}
          className="primary settings-save"
          disabled={!save.isPending && (!recoveryReady || !state.data || (draft === null && !saveFocused))}
          aria-disabled={!recoveryReady || !state.data || draft === null || save.isPending || undefined}
          aria-busy={save.isPending || undefined}
          onFocus={() => setSaveFocused(true)}
          onBlur={() => setSaveFocused(false)}
        >
          {save.isPending ? 'Saving…' : 'Save announcement settings'}
        </button>
        <ErrorNotice error={save.error} />
        {save.isSuccess && draft === null && (
          <p className="form-hint" role="status">
            Announcement settings saved.
          </p>
        )}
      </form>
    </SettingsSubsection>
  );
}
