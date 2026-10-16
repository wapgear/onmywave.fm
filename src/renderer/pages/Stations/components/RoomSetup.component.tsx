import type { DJ, ListeningRoom, NewsSource } from '../../../../shared/types';
import { FilterSelect } from '../../../components/FilterSelect/FilterSelect.component';

type Props = {
  sources: NewsSource[]; djs: DJ[]; room: ListeningRoom; mood: string; newsInterests: string;
  busy: boolean;
  setSetup: (room: ListeningRoom) => void; setMoodDraft: (mood: string) => void; setNewsInterests: (interests: string) => void;
  configureSources: () => void; configureDJ: () => void;
};
export function RoomSetup({ sources, djs, room, mood, newsInterests, busy, setSetup, setMoodDraft, setNewsInterests, configureSources, configureDJ }: Props) {
  return <section className="room-setup" aria-labelledby="news-setup-title">
    <div className="room-section-heading"><h2 id="news-setup-title">News sources and host</h2></div>
    <fieldset className="room-wizard-fields" disabled={busy}>
      <div className="room-field-heading"><h3 id="room-sources-title">News sources</h3><button id="manage-room-sources" onClick={configureSources}>Manage sources</button></div>
      <div className="room-sources" role="group" aria-labelledby="room-sources-title">{sources.map(source => <label key={source.id}><input type="checkbox" disabled={room.sourceIds.length >= 20 && !room.sourceIds.includes(source.id)} checked={room.sourceIds.includes(source.id)} onChange={() => setSetup({ ...room, sourceIds: room.sourceIds.includes(source.id) ? room.sourceIds.filter(id => id !== source.id) : [...room.sourceIds, source.id] })} /><span>{source.name}</span></label>)}</div>
      {!sources.length && <p className="notice">Add your first source with Manage sources.</p>}
      <label className="workflow-mood" htmlFor="room-news-interests">News interests · Optional<textarea id="room-news-interests" rows={2} maxLength={4000} value={newsInterests} onChange={event => setNewsInterests(event.target.value)} placeholder="Topics to include or skip. Leave empty for any story from selected sources." /></label>
      <div className="room-host-choice"><FilterSelect label="DJ" value={room.djId ?? ''} emptyLabel="Choose a DJ" choices={djs.map(value => ({ value: value.id, label: value.name }))} onChange={djId => setSetup({ ...room, djId: djId || null })} /><button id="manage-room-djs" onClick={configureDJ}>Manage DJs</button></div>
      <label className="workflow-mood" htmlFor="station-mood">Mood<textarea id="station-mood" rows={2} maxLength={4000} value={mood} onChange={event => setMoodDraft(event.target.value)} placeholder="Relaxed, curious, and low-key." /></label>
      <p className="form-hint">Save these choices with the preparation settings below. Automatic preparation stays off until you explicitly enable and save it.</p>
    </fieldset>
  </section>;
}
