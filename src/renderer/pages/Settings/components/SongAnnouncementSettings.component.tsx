import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { normalizeDJPlaybackSettings, type DJPlaybackSettings } from '../../../../shared/dj-playback';
import { announcementStyles } from '../../../../shared/song-announcements';
import { unwrap } from '../../../api';
import { SaveButton } from '../../../components/SaveButton/SaveButton.component';
import { SectionHeading } from '../../../components/SectionHeading/SectionHeading.component';
import { ErrorNotice } from '../../../components/Shared';
import { SongIntervalRange } from '../../../components/SongIntervalRange/SongIntervalRange.component';
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
  const interval =
    settings.announceEverySongs === settings.announceEverySongsMax
      ? settings.announceEverySongs
      : `${settings.announceEverySongs}–${settings.announceEverySongsMax}`;
  function change(patch: Partial<DJPlaybackSettings>) {
    edit.change({
      announceTracks: settings.announceTracks,
      announceEverySongs: settings.announceEverySongs,
      announceEverySongsMax: settings.announceEverySongsMax,
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
        settings.announceTracks ? `On · ${styleName} · Every ${interval} songs` : 'Off · Timing, style and custom lines'
      }
      id="song-announcements-title"
      ref={summary}
      dirty={draft !== null}
      status={save.isPending ? 'Saving…' : save.isError || state.isError ? 'Needs attention' : undefined}
    >
      <SectionHeading title="Timing & wording" helpLabel="About song announcements">
        <p>
          A random number of completed songs is picked within your range for each introduction. Equal limits give a
          fixed interval. Existing fixed intervals are preserved. Skips do not count, and an introduction only resets
          the count when it starts playing. Fact-only news always gets a brief handoff; older news recordings with their
          own ending play without an introduction.
        </p>
        <p>
          Generated introductions use OpenAI and ElevenLabs with your saved DJ voice and song metadata. Wording varies
          automatically between a fuller story or segue and a short introduction. Short & simple, My own lines and
          post-news handoffs keep their chosen behavior.
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
              Uses AI credits
            </span>
          </div>
          <SongIntervalRange
            id="announcement-interval"
            label="Announce after"
            minimum={settings.announceEverySongs}
            maximum={settings.announceEverySongsMax}
            disabled={!settings.announceTracks}
            onChange={(minimum, maximum) => change({ announceEverySongs: minimum, announceEverySongsMax: maximum })}
          />
          <p className="preference-note">
            Drag the ends to choose 1–10 completed songs. Equal ends give a fixed interval.
          </p>
          <SongAnnouncementPreferences
            style={settings.announcementStyle}
            lines={settings.announcementLines}
            disabled={!settings.announceTracks}
            onChange={change}
          />
        </fieldset>
        <SaveButton
          ref={saveButton}
          className="settings-save"
          disabled={!save.isPending && (!recoveryReady || !state.data || (draft === null && !saveFocused))}
          aria-disabled={!recoveryReady || !state.data || draft === null || save.isPending || undefined}
          aria-busy={save.isPending || undefined}
          onFocus={() => setSaveFocused(true)}
          onBlur={() => setSaveFocused(false)}
        >
          {save.isPending ? 'Saving…' : 'Save announcement settings'}
        </SaveButton>
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
