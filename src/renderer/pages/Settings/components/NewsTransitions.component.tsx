import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NewsTransitionSettings } from '../../../../shared/types';
import { defaultNewsTransitionSettings, isNewsTransitionSettings } from '../../../../shared/news-transitions';
import { unwrap } from '../../../api';
import { ErrorNotice } from '../../../components/Shared';
import { NewsTransitionPreview } from './NewsTransitionPreview.component';
import './NewsTransitions.styles.css';

const presets: { id: string; name: string; settings: NewsTransitionSettings }[] = [
  { id: 'natural', name: 'Natural', settings: defaultNewsTransitionSettings() },
  { id: 'tight', name: 'Tight', settings: { mode: 'over-music', fadeOutSeconds: 0.5, leadInSeconds: 0.2, postSpeechSeconds: 0.2, fadeInSeconds: 0.5 } },
  { id: 'bulletin', name: 'News bulletin', settings: { ...defaultNewsTransitionSettings(), mode: 'between-songs' } },
];
const fields = [
  { key: 'fadeOutSeconds', label: 'Lower music over', max: 5, hint: 'Fade down before the DJ starts.' },
  { key: 'leadInSeconds', label: 'Breathing room before speech', max: 3, hint: 'Wait after the music fades or finishes.' },
  { key: 'postSpeechSeconds', label: 'Pause after speech', max: 3, hint: 'Leave a moment before music resumes.' },
  { key: 'fadeInSeconds', label: 'Bring music back over', max: 5, hint: 'Fade music up to your listening volume.' },
] as const;

export function NewsTransitions() {
  const client = useQueryClient();
  const state = useQuery({ queryKey: ['localState'], queryFn: async () => unwrap(await window.wave.getLocalState()) });
  const [draft, setDraft] = useState<NewsTransitionSettings | null>(null);
  const settings = draft ?? state.data?.newsTransitions ?? defaultNewsTransitionSettings();
  const save = useMutation({ mutationFn: async () => {
    if (!isNewsTransitionSettings(settings)) throw new Error('Choose fade times from 0 to 5 seconds and pauses from 0 to 3 seconds.');
    return unwrap(await window.wave.saveNewsTransitions(settings));
  }, onSuccess: async () => {
    await client.invalidateQueries({ queryKey: ['localState'] });
    setDraft(null);
  } });
  const preset = presets.find(item => Object.entries(item.settings).every(([key, value]) => settings[key as keyof NewsTransitionSettings] === value));
  function change(patch: Partial<NewsTransitionSettings>) { save.reset(); setDraft({ ...settings, ...patch }); }
  return <section className="news-transition-settings" aria-labelledby="news-transitions-title">
    <h2 id="news-transitions-title">DJ transitions</h2>
    <p className="settings-description">Give news breaks room to breathe. Saved changes apply to the next break you schedule.</p>
    <ErrorNotice error={state.error} retrying={state.isFetching} retry={() => state.refetch()} />
    {state.isPending && <p role="status">Loading transition settings…</p>}
    <form onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
      <fieldset disabled={!state.data || save.isPending}>
        <div className="news-transition-grid">
          <label>Transition style<select value={preset?.id ?? 'custom'} onChange={event => {
            const selected = presets.find(item => item.id === event.target.value);
            if (selected) change(selected.settings);
          }}><option value="custom" disabled>Custom</option>{presets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="form-hint">Start with a style, then adjust the timing below.</span></label>
          <label>Play the DJ<select value={settings.mode} onChange={event => change({ mode: event.target.value as NewsTransitionSettings['mode'] })}><option value="over-music">Over the end of a song</option><option value="between-songs">Between songs</option></select><span className="form-hint">{settings.mode === 'over-music' ? 'The DJ speaks over a quiet music bed. The outgoing song finishes before the next starts.' : 'The song finishes, then the DJ speaks without music.'}</span></label>
          {fields.map(field => <label key={field.key}>{field.label}<div className="news-transition-time"><input type="number" min={0} max={field.max} step="0.1" required value={Number.isNaN(settings[field.key]) ? '' : settings[field.key]} onChange={event => change({ [field.key]: event.target.value === '' ? NaN : Number(event.target.value) })} /><span>seconds</span></div><span className="form-hint">{field.key === 'fadeOutSeconds' && settings.mode === 'between-songs' ? 'Fade the song ending before the bulletin.' : field.hint}</span></label>)}
        </div>
        <NewsTransitionPreview key={JSON.stringify(settings)} settings={settings} />
        <button className="primary" disabled={!draft || save.isPending}>{save.isPending ? 'Saving…' : 'Save DJ transitions'}</button>
      </fieldset>
      <ErrorNotice error={save.error} />
      {save.isSuccess && !draft && <p className="form-hint" role="status">DJ transitions saved.</p>}
    </form>
  </section>;
}
