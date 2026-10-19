import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { defaultDJPlaybackSettings, type DJPlaybackSettings as Settings } from '../../../../shared/dj-playback';
import { unwrap } from '../../../api';
import { ErrorNotice } from '../../../components/Shared';
import { useNewsRecovery } from '../../../NewsRecovery';
import { useGeneralSettingsEdits } from '../SettingsEdits';
import { useRetryFocus } from '../../../useRetryFocus';

export function DJPlaybackSettings() {
  const recovery = useNewsRecovery();
  const recoveryReady = recovery.status.phase === 'ready';
  const state = useQuery({
    queryKey: ['localState'],
    queryFn: async () => unwrap(await window.wave.getLocalState()),
    enabled: recoveryReady,
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const intervalInput = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const [saveFocused, setSaveFocused] = useState(false);
  const retryFocus = useRetryFocus({
    ownerKey: 'settings:general:dj-playback',
    target: () =>
      intervalInput.current && !intervalInput.current.matches(':disabled') ? intervalInput.current : heading.current,
    canFocusSuccess: () => recoveryReady && !state.isError && !state.isFetching && !!state.data,
  });
  const edit = useGeneralSettingsEdits().playback;
  const { draft, save } = edit;
  const settings = draft ?? state.data?.djPlayback ?? defaultDJPlaybackSettings();
  function change(patch: Partial<Settings>) {
    edit.change({
      everySongs: settings.everySongs,
      keepOnSeek: settings.keepOnSeek,
      voiceVolume: settings.voiceVolume,
      ...patch,
    });
  }
  return (
    <section className="room-dj-schedule" aria-labelledby="dj-playback-title">
      <h2 ref={heading} tabIndex={-1} id="dj-playback-title">
        DJ playback
      </h2>
      <p className="settings-description">Choose how often the DJ checks saved news and how its voice plays.</p>
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
        <fieldset disabled={!recoveryReady || !state.data || save.isPending}>
          <label className="dj-song-interval">
            Check news every
            <input
              ref={intervalInput}
              type="number"
              min={1}
              max={100}
              step={1}
              required
              value={Number.isNaN(settings.everySongs) ? '' : settings.everySongs}
              aria-describedby="dj-interval-help"
              onChange={(event) => change({ everySongs: event.target.value === '' ? NaN : Number(event.target.value) })}
            />
            <span>{settings.everySongs === 1 ? 'song' : 'songs'}</span>
          </label>
          <p id="dj-interval-help" className="settings-footnote">
            Only finished songs count. Choose 1 for testing. Empty news pools are skipped without generating anything.
          </p>
          <label className="dj-song-interval">
            <input
              type="checkbox"
              checked={settings.keepOnSeek}
              onChange={(event) => change({ keepOnSeek: event.target.checked })}
            />
            Keep the DJ when seeking or rewinding
          </label>
          <p className="settings-footnote">
            Keeps the break when you seek. Speech waits for the next suitable ending and resumes where it paused.
          </p>
          <label className="dj-song-interval">
            DJ voice volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.voiceVolume}
              aria-valuetext={`${Math.round(settings.voiceVolume * 100)}% of player volume`}
              onChange={(event) => change({ voiceVolume: Number(event.target.value) })}
            />
            <span>{Math.round(settings.voiceVolume * 100)}%</span>
          </label>
          <p className="settings-footnote">Relative to player volume. The default is 70%.</p>
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
          {save.isPending ? 'Saving…' : 'Save DJ playback'}
        </button>
        <ErrorNotice error={save.error} />
        {save.isSuccess && draft === null && (
          <p className="form-hint" role="status">
            DJ playback saved.
          </p>
        )}
      </form>
    </section>
  );
}
