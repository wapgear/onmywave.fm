import type { DJ, ListeningRoom, NewsSource } from '../../../../shared/types';
import { ErrorNotice } from '../../../components/Shared';
import { FilterSelect } from '../../../components/FilterSelect/FilterSelect.component';

type Props = {
  sources: NewsSource[]; djs: DJ[]; room: ListeningRoom; mood: string; newsInterests: string; dj?: DJ;
  tab: string; onTabChange: (tab: string) => void;
  busy: boolean; saving: boolean; ready: boolean; validSources: boolean; finite: boolean; saveError: unknown;
  openAiLabel: string; elevenLabel: string; twitterLabel: string;
  textKeyReady: boolean; audioKeyReady: boolean; twitterKeyReady: boolean;
  automationSummary: string; automationComplete: boolean;
  setSetup: (room: ListeningRoom) => void; setMoodDraft: (mood: string) => void; setNewsInterests: (interests: string) => void;
  configureSources: () => void; configureDJ: () => void; configureSettings: () => void;
  onSave: () => void;
};
export function RoomSetup({ sources, djs, room, mood, newsInterests, dj, tab, onTabChange, busy, saving, ready, validSources, finite, saveError, openAiLabel, elevenLabel, twitterLabel, textKeyReady, audioKeyReady, twitterKeyReady, automationSummary, automationComplete, setSetup, setMoodDraft, setNewsInterests, configureSources, configureDJ, configureSettings, onSave }: Props) {
  const twitter = sources.some(source => room.sourceIds.includes(source.id) && source.kind === 'twitter');
  const automaticReady = ready;
  const rows = [
    { label: 'News', summary: `${validSources ? `${room.sourceIds.length} source${room.sourceIds.length === 1 ? '' : 's'}` : 'Choose at least one source'} · ${newsInterests.trim() || 'Any topics'}`, complete: validSources, action: () => onTabChange('news') },
    { label: 'Host & mood', summary: `${dj?.name ?? 'Choose a host'} · ${mood.trim() || 'Describe the mood'} · ${finite ? 'Voice ready' : 'Set up a voice'}`, complete: !!dj && !!mood.trim() && finite, action: () => onTabChange('host') },
    { label: 'Provider access', summary: `OpenAI ${openAiLabel} · ElevenLabs ${elevenLabel}${twitter ? ` · X ${twitterLabel}` : ''}`, complete: textKeyReady && audioKeyReady && (!twitter || twitterKeyReady), action: configureSettings },
    { label: 'Automatic workflow', summary: automationSummary, complete: automationComplete, action: () => onTabChange('prepare') },
  ];
  const panel = (id: string) => ({ id: `room-panel-${id}`, role: 'tabpanel' as const, 'aria-labelledby': `room-tab-${id}`, hidden: tab !== id, tabIndex: 0 });
  const saveButton = <div className="room-wizard-actions"><button className="primary" disabled={busy} onClick={onSave}>{saving ? 'Saving…' : 'Save setup'}</button><button disabled={saving} onClick={() => onTabChange('overview')}>Back to overview</button></div>;
  return <>
    <section {...panel('overview')} className="room-overview">
      <div className="room-section-heading"><div><h2>Listening setup</h2><p className="form-hint">Set up the room once. DJ breaks run automatically when enabled.</p></div></div>
      <ul className="room-checklist">{rows.map(row => <li key={row.label}><span className={`room-check-state ${row.complete ? 'is-complete' : ''}`} aria-label={row.complete ? 'Complete' : /Checking|unavailable/.test(row.summary) ? 'Status unknown' : 'Needs setup'}>{row.complete ? '✓' : /Checking|unavailable/.test(row.summary) ? '?' : '○'}</span><div><strong>{row.label}</strong><p>{row.summary}</p></div><button className="room-link" onClick={row.action}>Edit<span className="sr-only"> {row.label}</span></button></li>)}</ul>
      <div className="room-readiness"><p>{automaticReady ? 'Ready for automatic DJ breaks' : 'Choose sources, a host, and mood to enable DJ playback. Provider access is used by news preparation.'}</p></div>
      <button className="primary" onClick={() => onTabChange('prepare')}>Automatic DJ</button>
    </section>
    <section {...panel('news')} className="room-setup">
      <div className="room-section-heading"><h2>Your news</h2><button onClick={configureSources}>Manage sources</button></div>
      <fieldset className="room-wizard-fields" disabled={busy}><h3>News sources</h3><p className="form-hint">Choose at least one source, up to 20.</p><div className="room-sources">{sources.map(source => <label key={source.id}><input type="checkbox" disabled={room.sourceIds.length >= 20 && !room.sourceIds.includes(source.id)} checked={room.sourceIds.includes(source.id)} onChange={() => setSetup({ ...room, sourceIds: room.sourceIds.includes(source.id) ? room.sourceIds.filter(id => id !== source.id) : [...room.sourceIds, source.id] })} /><span>{source.name}</span></label>)}</div>{!sources.length && <p className="notice">Add your first source with Manage sources.</p>}<label className="workflow-mood" htmlFor="room-news-interests">What news interests you? · Optional<textarea id="room-news-interests" rows={3} maxLength={4000} value={newsInterests} onChange={event => setNewsInterests(event.target.value)} placeholder="Technology, independent music and local culture. Skip sports and celebrity gossip." /></label><p className="form-hint">Leave empty to consider any story from selected sources.</p>{saveButton}</fieldset><ErrorNotice error={saveError} />
    </section>
    <section {...panel('host')} className="room-setup">
      <div className="room-section-heading"><h2>Host &amp; mood</h2><button onClick={configureDJ}>Manage DJs</button></div>
      <fieldset className="room-wizard-fields" disabled={busy}><FilterSelect label="DJ" value={room.djId ?? ''} emptyLabel="Choose a DJ" choices={djs.map(value => ({ value: value.id, label: value.name }))} onChange={djId => setSetup({ ...room, djId: djId || null })} />{!djs.length && <p className="notice">Create your first host with Manage DJs.</p>}<label className="workflow-mood" htmlFor="station-mood">Station mood<textarea id="station-mood" rows={3} maxLength={4000} value={mood} onChange={event => setMoodDraft(event.target.value)} placeholder="Relaxed, curious, and low-key." /></label><p className="form-hint">Voice and personality preferences belong to your DJ. You can save setup before adding provider keys.</p>{saveButton}</fieldset><ErrorNotice error={saveError} />
    </section>
  </>;
}
