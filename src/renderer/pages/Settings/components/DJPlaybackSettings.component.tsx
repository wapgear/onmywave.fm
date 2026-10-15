import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { defaultDJPlaybackSettings, type DJPlaybackSettings as Settings } from '../../../../shared/dj-playback';
import { unwrap } from '../../../api';
import { ErrorNotice } from '../../../components/Shared';

export function DJPlaybackSettings() {
  const client = useQueryClient();
  const state = useQuery({ queryKey: ['localState'], queryFn: async () => unwrap(await window.wave.getLocalState()) });
  const [draft, setDraft] = useState<Settings | null>(null);
  const settings = draft ?? state.data?.djPlayback ?? defaultDJPlaybackSettings();
  function change(patch: Partial<Settings>) { save.reset(); setDraft({ ...settings, ...patch }); }
  const save = useMutation({ mutationFn: async () => {
    const count = Number(settings.everySongs);
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Choose a whole number from 1 to 100 songs.');
    const latest = unwrap(await window.wave.getLocalState());
    unwrap(await window.wave.saveDJPlayback({ ...latest.djPlayback, everySongs: count, keepOnSeek: settings.keepOnSeek, voiceVolume: settings.voiceVolume }));
    await client.invalidateQueries({ queryKey: ['localState'] });
  }, onSuccess: () => setDraft(null) });
  return <section className="room-dj-schedule" aria-labelledby="dj-playback-title">
    <h2 id="dj-playback-title">DJ playback</h2>
    <p className="settings-description">Choose how often the DJ checks saved news and how its voice plays.</p>
    <ErrorNotice error={state.error} retry={() => void state.refetch()} />
    {state.isPending && <p role="status">Loading DJ schedule…</p>}
    <form onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
      <fieldset disabled={!state.data || save.isPending}>
        <label className="dj-song-interval">Check news every<input type="number" min={1} max={100} step={1} required value={Number.isNaN(settings.everySongs) ? '' : settings.everySongs} aria-describedby="dj-interval-help" onChange={event => change({ everySongs: event.target.value === '' ? NaN : Number(event.target.value) })} /><span>{settings.everySongs === 1 ? 'song' : 'songs'}</span></label>
        <p id="dj-interval-help" className="settings-footnote">Only finished songs count. Choose 1 for testing. Empty news pools are skipped without generating anything.</p>
        <label className="dj-song-interval"><input type="checkbox" checked={settings.keepOnSeek} onChange={event => change({ keepOnSeek: event.target.checked })} />Keep the DJ when seeking or rewinding</label>
        <p className="settings-footnote">Keeps scheduled breaks and lets a speaking DJ finish while you seek within a song.</p>
        <label className="dj-song-interval">DJ voice volume<input type="range" min={0} max={1} step={0.05} value={settings.voiceVolume} aria-valuetext={`${Math.round(settings.voiceVolume * 100)}% of player volume`} onChange={event => change({ voiceVolume: Number(event.target.value) })} /><span>{Math.round(settings.voiceVolume * 100)}%</span></label>
        <p className="settings-footnote">Relative to player volume. The default is 70%.</p>
        <button className="primary" disabled={draft === null || save.isPending}>{save.isPending ? 'Saving…' : 'Save DJ playback'}</button>
      </fieldset>
      <ErrorNotice error={save.error} />
      {save.isSuccess && draft === null && <p className="form-hint" role="status">DJ playback saved.</p>}
    </form>
  </section>;
}
