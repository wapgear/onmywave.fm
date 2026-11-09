import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { normalizeDJPlaybackSettings, type DJPlaybackSettings as Settings } from '../../../../shared/dj-playback';
import { unwrap } from '../../../api';
import { SaveButton } from '../../../components/SaveButton/SaveButton.component';
import { SectionHeading } from '../../../components/SectionHeading/SectionHeading.component';
import { ErrorNotice } from '../../../components/Shared';
import { Slider } from '../../../components/Slider/Slider.component';
import { SongIntervalRange } from '../../../components/SongIntervalRange/SongIntervalRange.component';
import { useNewsRecovery } from '../../../NewsRecovery';
import { useRetryFocus } from '../../../useRetryFocus';
import { useSettingsEdits } from '../SettingsEdits';
import { SettingsSubsection } from './SettingsSubsection.component';

export function DJPlaybackSettings() {
  const recovery = useNewsRecovery();
  const recoveryReady = recovery.status.phase === 'ready';
  const state = useQuery({
    queryKey: ['localState'],
    queryFn: async () => unwrap(await window.wave.getLocalState()),
    enabled: recoveryReady,
  });
  const summary = useRef<HTMLElement>(null);
  const intervalInput = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const [saveFocused, setSaveFocused] = useState(false);
  const retryFocus = useRetryFocus({
    ownerKey: 'settings:playback:dj-playback',
    target: () =>
      intervalInput.current?.checkVisibility() && !intervalInput.current.matches(':disabled')
        ? intervalInput.current
        : summary.current,
    canFocusSuccess: () => recoveryReady && !state.isError && !state.isFetching && !!state.data,
  });
  const edit = useSettingsEdits().playback;
  const { draft, save } = edit;
  const settings = draft ?? normalizeDJPlaybackSettings(state.data?.djPlayback);
  function change(patch: Partial<Settings>) {
    edit.change({
      everySongs: settings.everySongs,
      everySongsMax: settings.everySongsMax,
      keepOnSeek: settings.keepOnSeek,
      voiceVolume: settings.voiceVolume,
      ...patch,
    });
  }

  return (
    <SettingsSubsection
      className="room-dj-schedule"
      title="News & voice"
      description={`${state.data?.djPlayback.enabled ? 'News on' : 'News off'} · Voice at ${Math.round(settings.voiceVolume * 100)}%`}
      id="dj-playback-title"
      ref={summary}
      dirty={draft !== null}
      status={save.isPending ? 'Saving…' : save.isError || state.isError ? 'Needs attention' : undefined}
    >
      <SectionHeading title="News timing & voice" helpLabel="About news timing and voice">
        <p>
          News uses a fresh random number within your range for each saved bulletin. Equal ends give a fixed interval.
          Enable news and choose its profile in the player's DJ sidebar. An empty pool leaves music playing.
        </p>
        <p>Keeping the DJ while seeking lets speech wait for a suitable ending and resume where it paused.</p>
        <p>Voice volume is relative to the player volume.</p>
      </SectionHeading>
      {!recoveryReady && (
        <p className="notice">
          DJ playback settings are unavailable until news data recovery completes. Existing music playback remains
          available.
        </p>
      )}
      <ErrorNotice
        error={state.error}
        retryRef={retryFocus.retryRef}
        retrying={state.isFetching}
        retry={() => retryFocus.retry(() => state.refetch())}
      />
      {state.isPending && <p role="status">Loading DJ schedule…</p>}
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
            <SongIntervalRange
              id="news-interval"
              label="Play news after"
              minimum={settings.everySongs}
              maximum={settings.everySongsMax}
              inputRef={(element) => {
                intervalInput.current = element;
              }}
              onChange={(minimum, maximum) => change({ everySongs: minimum, everySongsMax: maximum })}
            />
            {state.data && (
              <span className="preference-note">{state.data.djPlayback.enabled ? 'News on' : 'News off'}</span>
            )}
          </div>
          <p className="preference-note">
            Drag the ends to choose 1–10 completed songs. Equal ends give a fixed interval.
          </p>
          <label className="preference-row dj-song-interval">
            <input
              type="checkbox"
              checked={settings.keepOnSeek}
              onChange={(event) => change({ keepOnSeek: event.target.checked })}
            />
            Keep the DJ when seeking or rewinding
          </label>
          <label className="preference-row dj-song-interval">
            Voice volume
            <Slider
              aria-label="Voice volume"
              min={0}
              max={1}
              step={0.05}
              value={settings.voiceVolume}
              aria-valuetext={`${Math.round(settings.voiceVolume * 100)}% of player volume`}
              onChange={(event) => change({ voiceVolume: Number(event.target.value) })}
            />
            <span>{Math.round(settings.voiceVolume * 100)}%</span>
          </label>
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
          {save.isPending ? 'Saving…' : 'Save news & voice settings'}
        </SaveButton>
        <ErrorNotice error={save.error} />
        {save.isSuccess && draft === null && (
          <p className="form-hint" role="status">
            News &amp; voice settings saved.
          </p>
        )}
      </form>
    </SettingsSubsection>
  );
}
