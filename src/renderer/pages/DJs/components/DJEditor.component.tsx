import { NEWS_TEXT_MODEL } from '../../../../shared/types';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DJ, DJVoice, DJVoiceSearch, NewsSettings } from '../../../../shared/types';
import { unwrap } from '../../../api';
import { confirmLocalState } from '../../../local-state-cache';
import { Dialog, ErrorNotice } from '../../../components/Shared';
import { ConfigurationTabs } from '../../../components/ConfigurationTabs/ConfigurationTabs.component';
import { djPresets } from './DJEditor.presets';
import { VoicePreview } from './VoicePreview.component';
import { DJAvatarPicker } from './DJAvatarPicker.component';
import { resolveDJAvatar } from '../../../../shared/dj-avatar';
import './DJEditor.styles.css';

export const defaultNews: NewsSettings = {
  feedUrls: [], interests: '', minStories: 1, maxStories: 1,
  voice: 'coral', textModel: NEWS_TEXT_MODEL, speechEngine: 'elevenlabs-v4', duckVolume: 0.05,
  elevenVoiceId: 'JBFqnCBsd6RMkjVDRZzb', elevenTags: '',
};
type TextField = 'name' | 'description' | 'instructions' | 'musicPreferences' | 'exclusions' | 'personality' | 'language';
export function DJEditor({ value, close }: { value: DJ; close: () => void }) {
  const client = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [draft, setDraft] = useState<DJ>({ ...value, avatar: resolveDJAvatar(value.avatar), news: { ...defaultNews, ...value.news, elevenVoiceId: value.name ? value.news?.elevenVoiceId ?? defaultNews.elevenVoiceId : '', speechEngine: 'elevenlabs-v4', textModel: NEWS_TEXT_MODEL } });
  const [mode, setMode] = useState(value.name ? 'advanced' : 'predefined');
  const modeId = useId();
  const [presetId, setPresetId] = useState('warm');
  const [presetGender, setPresetGender] = useState<'man' | 'woman'>('woman');
  const [prompt, setPrompt] = useState('');
  const [gender, setGender] = useState<DJVoiceSearch['gender']>('any');
  const [searchInput, setSearchInput] = useState<DJVoiceSearch | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<DJVoice | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState('');
  const preset = djPresets.find(item => item.id === presetId)!;
  const search = useQuery({ queryKey: ['djVoices', searchInput], queryFn: async () => unwrap(await window.wave.searchDJVoices(searchInput!)), enabled: !!searchInput, retry: false, staleTime: 60_000, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const currentResults = searchInput?.prompt === prompt.trim() && searchInput.gender === gender;
  function findVoices() {
    if (!prompt.trim() || search.isFetching) return;
    const input = { prompt: prompt.trim(), gender };
    if (input.prompt === searchInput?.prompt && input.gender === searchInput.gender) void search.refetch({ cancelRefetch: false });
    else setSearchInput(input);
  }
  function applyPreset() {
    const voice = preset[presetGender];
    save.reset();
    setSelectedVoice({ ...voice, description: preset.description });
    setDraft(old => ({ ...old, name: old.name || preset.name, description: preset.description, personality: preset.personality, news: { ...old.news!, elevenVoiceId: voice.id, elevenTags: preset.tags } }));
  }
  function chooseVoice(voice: DJVoice) {
    save.reset(); setSelectedVoice(voice);
    setDraft(old => ({ ...old, personality: prompt.trim(), news: { ...old.news!, elevenVoiceId: voice.id, elevenTags: '' } }));
  }
  const news = draft.news!;
  const save = useMutation({
    mutationFn: async () => {
      if (!form.current?.reportValidity()) throw new Error('Check the highlighted fields before saving.');
      if (!draft.news?.elevenVoiceId?.trim()) throw new Error('Choose a voice before saving.');
      if (!draft.name.trim()) throw new Error('Give this DJ a name before saving.');
      const next = { ...draft, name: draft.name.trim() };
      const local = unwrap(await window.wave.getLocalState());
      const djs = local.djs.some(dj => dj.id === next.id) ? local.djs.map(dj => dj.id === next.id ? next : dj) : [...local.djs, next];
      await confirmLocalState(client, unwrap(await window.wave.saveDjs(djs)));
      await Promise.all([client.invalidateQueries({ queryKey: ['localState'] }), client.invalidateQueries({ queryKey: ['djVoicePreview', next.id] })]);
    },
    onSuccess: close,
    onSettled: () => { inFlight.current = false; },
  });
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (!save.error || !(active instanceof HTMLElement) || !form.current?.contains(active)
      || !active.closest('.modal-actions') || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    active.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [save.error]);
  function closeEditor() { if (!inFlight.current && !save.isPending) close(); }
  function updateNews(patch: Partial<NewsSettings>) { save.reset(); setDraft(old => ({ ...old, news: { ...old.news!, ...patch } })); }
  function updateAvatar(avatar: DJ['avatar']) { save.reset(); setDraft(old => ({ ...old, avatar })); }
  const field = (key: TextField, label: string, placeholder = '', multiline = false) => <label>{label}{multiline
    ? <textarea value={draft[key]} maxLength={20_000} placeholder={placeholder} rows={3} onChange={event => { save.reset(); setDraft(old => ({ ...old, [key]: event.target.value })); }} />
    : <input value={draft[key]} placeholder={placeholder} required={key === 'name'} maxLength={key === 'name' ? 160 : 20_000} onChange={event => { save.reset(); setDraft(old => ({ ...old, [key]: event.target.value })); }} />}</label>;
  return <Dialog title={value.name ? 'Edit DJ' : 'Create a DJ'} close={closeEditor} closeDisabled={save.isPending} wide><form ref={form} className="dj-profile-form" onSubmit={event => { event.preventDefault(); if (inFlight.current || save.isPending) return; inFlight.current = true; if (event.currentTarget.contains(document.activeElement) && document.visibilityState === 'visible' && document.hasFocus()) { saveButton.current?.focus({ preventScroll: true }); saveButton.current?.scrollIntoView({ block: 'center', inline: 'nearest' }); } save.mutate(); }}>
    <fieldset disabled={save.isPending}>
      <ConfigurationTabs id={modeId} label="DJ creation mode" tabs={[{ id: 'predefined', label: 'Predefined' }, { id: 'simple', label: 'Simple' }, { id: 'advanced', label: 'Advanced' }]} value={mode} onChange={value => { setMode(value); setPreviewingVoice(''); }} />
      <p className="dj-profile-intro">{mode === 'predefined' ? 'Start with a ready-made personality and voice.' : mode === 'simple' ? 'Describe your host and find a voice in ElevenLabs.' : 'Fine-tune your host, voice and delivery yourself.'}</p>
      <div role="tabpanel" id={`${modeId}-panel-predefined`} aria-labelledby={`${modeId}-tab-predefined`} hidden={mode !== 'predefined'}>
        <div className="dj-preset-grid" role="group" aria-label="DJ personalities">{djPresets.map(item => <button key={item.id} type="button" aria-pressed={presetId === item.id} onClick={() => setPresetId(item.id)}><strong>{item.name}</strong><span>{item.description}</span></button>)}</div>
        <div className="dj-preset-footer"><div className="dj-gender" role="group" aria-label="Preset voice">{(['man', 'woman'] as const).map(option => <button type="button" key={option} aria-pressed={presetGender === option} onClick={() => setPresetGender(option)}>{option === 'man' ? 'Man' : 'Woman'}</button>)}</div><span className="form-hint">ElevenLabs · {preset[presetGender].name}</span><button type="button" className="primary" onClick={applyPreset}>Apply preset</button></div>
        <VoicePreview key={preset[presetGender].id} resource={{ kind: 'voice', voiceId: preset[presetGender].id }} label={preset[presetGender].name} playbackId="dj-editor" activeId={previewingVoice} onStart={setPreviewingVoice} active={mode === 'predefined'} />
        <p className="form-hint">Applies the personality, description, voice and delivery. Voice access depends on your ElevenLabs account. You can listen after saving.</p>
      </div>
      <div role="tabpanel" id={`${modeId}-panel-simple`} aria-labelledby={`${modeId}-tab-simple`} hidden={mode !== 'simple'}>
        <label>Describe your DJ<textarea rows={3} maxLength={500} value={prompt} placeholder="Warm narrator, energetic presenter, or a voice name…" onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && prompt.trim() && !search.isFetching) { event.preventDefault(); findVoices(); } }} /><span className="form-hint">Use short descriptive keywords. Searches the names, descriptions and labels of voices available to your ElevenLabs account.</span></label>
        <div className="dj-search-controls"><label>Voice preference<select value={gender} onChange={event => setGender(event.target.value as DJVoiceSearch['gender'])}><option value="any">Any voice</option><option value="male">Man</option><option value="female">Woman</option></select></label><button type="button" className="primary" disabled={!prompt.trim()} aria-disabled={search.isFetching || undefined} aria-busy={search.isFetching || undefined} onClick={findVoices}>{search.isFetching ? 'Searching…' : 'Find voices'}</button></div>
        {search.isFetching && <p role="status">Searching ElevenLabs…</p>}
        {currentResults && !search.isFetching && <><ErrorNotice error={search.error} />{search.data && <div className="dj-voice-results" role="group" aria-label="ElevenLabs voice results">{search.data.length ? search.data.map(voice => <button type="button" key={voice.id} aria-pressed={news.elevenVoiceId === voice.id} onClick={() => chooseVoice(voice)}><strong>{voice.name}</strong><span>{voice.description || 'ElevenLabs voice'}</span><small>{news.elevenVoiceId === voice.id ? 'Selected' : 'Use this voice'}</small></button>) : <p role="status">No voices found. Try fewer keywords, change the voice preference, or use a predefined host.</p>}</div>}</>}
        {news.elevenVoiceId && <VoicePreview key={news.elevenVoiceId} resource={{ kind: 'voice', voiceId: news.elevenVoiceId }} label={selectedVoice?.name ?? `Voice ${news.elevenVoiceId}`} playbackId="dj-editor" activeId={previewingVoice} onStart={setPreviewingVoice} active={mode === 'simple'} />}
      </div>
      {news.elevenVoiceId && mode !== 'advanced' && <p className="dj-selected-voice" role="status">{selectedVoice?.id === news.elevenVoiceId ? `Selected voice: ${selectedVoice.name}` : 'Your current voice is kept.'} You can tweak this DJ in Advanced.</p>}

      {field('name', 'Name', 'Evening companion')}
      <DJAvatarPicker dj={draft} onChange={updateAvatar} />
      <div role="tabpanel" id={`${modeId}-panel-advanced`} aria-labelledby={`${modeId}-tab-advanced`} hidden={mode !== 'advanced'}>
      {field('personality', 'Personality', 'Warm, curious, concise. Let the music breathe.', true)}
      {field('language', 'Language', 'English')}
      <section className="dj-profile-voice"><h3>Voice</h3><p className="form-hint">ElevenLabs · prepared speech</p>
        <label>ElevenLabs voice ID<input required={mode === 'advanced'} pattern="[a-zA-Z0-9_-]{1,128}" maxLength={128} value={news.elevenVoiceId ?? ''} placeholder="Voice ID from your ElevenLabs library" onChange={event => updateNews({ elevenVoiceId: event.target.value })} /><span className="form-hint">Find this ID in your ElevenLabs voice library. Your existing voice is kept when you edit this DJ.</span></label>
        {!!news.elevenVoiceId && <VoicePreview key={news.elevenVoiceId} resource={{ kind: 'voice', voiceId: news.elevenVoiceId }} label={`Voice ${news.elevenVoiceId}`} playbackId="dj-editor" activeId={previewingVoice} onStart={setPreviewingVoice} active={mode === 'advanced'} />}
      </section>
      <section className="dj-profile-advanced"><h3>Host preferences</h3><div>
        <p className="form-hint">Your full host instructions, music preferences and exclusions are sent to OpenAI for news preparation, up to 20,000 characters per field. Longer text can increase usage and cost. Music preferences guide the host’s style; you choose the music queue.</p>
        {field('description', 'Short description', 'Optional description')}
        {field('instructions', 'Host instructions', 'How should this host introduce a story?', true)}
        {field('musicPreferences', 'Music preferences', 'Style or artists to keep in mind when writing', true)}
        {field('exclusions', 'Exclusions', 'Topics or music references to avoid', true)}
        <label>News interests<textarea rows={3} maxLength={4000} value={news.interests} placeholder="Technology, music and local culture. Skip sports." onChange={event => updateNews({ interests: event.target.value })} /></label>
        <p className="form-hint">OpenAI · {NEWS_TEXT_MODEL} prepares stories from your sources. ElevenLabs generates the voice.</p>
        {news.speechEngine === 'elevenlabs-v4' && <label>Delivery tags<input value={news.elevenTags ?? ''} maxLength={200} placeholder="[excited]" onChange={event => updateNews({ elevenTags: event.target.value })} /><span className="form-hint">Optional bracketed tags supported by your voice provider.</span></label>}
        <label>Music level under the voice<div className="dj-profile-duck"><input type="range" min="0" max={Math.max(0.08, value.news?.duckVolume ?? 0.05)} step="0.01" value={news.duckVolume} onChange={event => updateNews({ duckVolume: Number(event.target.value) })} /><output>{Math.round(news.duckVolume * 100)}%</output></div><span className="form-hint">Applied when you schedule a saved take over music.{news.duckVolume > 0.08 && ' Your saved level is retained; the current player limits the music bed to 8%.'}</span></label>
        <p className="form-hint">Set how often you hear news in Settings → General → DJ playback.</p>
        {!!news.feedUrls.length && <p className="form-hint">Your {news.feedUrls.length} legacy {news.feedUrls.length === 1 ? 'feed URL is' : 'feed URLs are'} retained. Manage current news feeds in Sources.</p>}
      </div></section>
      </div>
    </fieldset>
    <ErrorNotice error={save.error} /><p className="dj-profile-save-note">Saving a DJ does not generate audio or start playback.</p><div className="modal-actions"><button type="button" aria-disabled={save.isPending || undefined} onClick={closeEditor}>Cancel</button><button ref={saveButton} className="primary" aria-disabled={save.isPending || undefined} aria-busy={save.isPending || undefined} disabled={!draft.name.trim() || !news.elevenVoiceId?.trim()}>{save.isPending ? 'Saving…' : 'Save DJ'}</button></div>
  </form></Dialog>;
}
