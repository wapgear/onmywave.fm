import type { DJ, ListeningRoom, NewsSource } from '../../../../shared/types';
import { ErrorNotice } from '../../../components/Shared';
import { FilterSelect } from '../../../components/FilterSelect/FilterSelect.component';

type Props = {
  sources: NewsSource[]; djs: DJ[]; room: ListeningRoom; mood: string; newsInterests: string;
  busy: boolean; saving: boolean; saveError: unknown;
  setSetup: (room: ListeningRoom) => void; setMoodDraft: (mood: string) => void; setNewsInterests: (interests: string) => void;
  configureSources: () => void; configureDJ: () => void;
  onSave: () => void;
};
export function RoomSetup({ sources, djs, room, mood, newsInterests, busy, saving, saveError, setSetup, setMoodDraft, setNewsInterests, configureSources, configureDJ, onSave }: Props) {
  return <section className="room-setup" aria-labelledby="news-setup-title">
    <div className="room-section-heading"><h2 id="news-setup-title">News sources and host</h2></div>
    <fieldset className="room-wizard-fields" disabled={busy}>
      <div className="room-field-heading"><h3>News sources</h3><button onClick={configureSources}>Manage sources</button></div>
      <div className="room-sources">{sources.map(source => <label key={source.id}><input type="checkbox" disabled={room.sourceIds.length >= 20 && !room.sourceIds.includes(source.id)} checked={room.sourceIds.includes(source.id)} onChange={() => setSetup({ ...room, sourceIds: room.sourceIds.includes(source.id) ? room.sourceIds.filter(id => id !== source.id) : [...room.sourceIds, source.id] })} /><span>{source.name}</span></label>)}</div>
      {!sources.length && <p className="notice">Add your first source with Manage sources.</p>}
      <label className="workflow-mood" htmlFor="room-news-interests">News interests · Optional<textarea id="room-news-interests" rows={2} maxLength={4000} value={newsInterests} onChange={event => setNewsInterests(event.target.value)} placeholder="Topics to include or skip. Leave empty for any story from selected sources." /></label>
      <div className="room-host-choice"><FilterSelect label="DJ" value={room.djId ?? ''} emptyLabel="Choose a DJ" choices={djs.map(value => ({ value: value.id, label: value.name }))} onChange={djId => setSetup({ ...room, djId: djId || null })} /><button onClick={configureDJ}>Manage DJs</button></div>
      <label className="workflow-mood" htmlFor="station-mood">Mood<textarea id="station-mood" rows={2} maxLength={4000} value={mood} onChange={event => setMoodDraft(event.target.value)} placeholder="Relaxed, curious, and low-key." /></label>
      <div className="room-wizard-actions"><button className="primary" onClick={onSave}>{saving ? 'Saving…' : 'Save setup'}</button></div>
    </fieldset>
    <ErrorNotice error={saveError} />
  </section>;
}
