import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '../../../api';
import { ErrorNotice } from '../../../components/Shared';
import type { WorkflowDraft } from '../../../../shared/workflow';
import './WorkflowPreferences.styles.css';

export function WorkflowPreferences({ onConfigureRoom }: { onConfigureRoom?: () => void }) {
  const client = useQueryClient();
  const state = useQuery({ queryKey: ['localState'], queryFn: async () => unwrap(await window.wave.getLocalState()), refetchInterval: 10000 });
  const room = state.data?.roomProfiles.find(room => room.id === state.data?.activeRoomProfileId);
  const [draftState, setDraft] = useState<{ roomId: string; patch: Partial<WorkflowDraft> } | null>(null);
  const draft = draftState?.roomId === room?.id ? draftState?.patch ?? null : null;
  const settings = { ...room?.workflowDraft, ...draft };
  const save = useMutation({ mutationFn: async () => {
    const latest = unwrap(await window.wave.getLocalState());
    if (latest.activeRoomProfileId !== room?.id) throw new Error('The active room changed. Open its workflow again.');
    unwrap(await window.wave.saveWorkflowDraft({ workflowDraft: { ...latest.workflowDraft, ...draft, nextNewsCheckAt: undefined, newsWorkflowError: undefined }, room: latest.listeningRoom, mood: latest.vibe }));
    await client.invalidateQueries({ queryKey: ['localState'] });
  }, onSuccess: () => setDraft(null) });
  function change(patch: Partial<WorkflowDraft>) { if (!room) return; save.reset(); setDraft({ roomId: room.id, patch: { ...draft, ...patch } }); }
  return <div className="settings-workflow">
    <h2>News preparation</h2>
    <p className="settings-description">Generate saved news independently of DJ playback, while the app is running and your Mac is awake. The DJ only plays available recordings.</p>
    <ErrorNotice error={state.error} retry={() => void state.refetch()} />
    {state.isPending && <p className="loading" role="status">Loading preferences…</p>}
    {room && <form key={room.id} onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
      <p className="settings-description">News profile: {room.name}</p>
      <fieldset className="news-workflow-fields" disabled={save.isPending || !room.enabled}>
        <label className="news-workflow-toggle"><input type="checkbox" checked={settings.newsEnabled ?? false} onChange={event => change({ newsEnabled: event.target.checked })} /> Automatically prepare news for this room</label>
        <label>Check sources every<select value={settings.everyHours ?? 3} onChange={event => change({ everyHours: Number(event.target.value) as 1 | 3 | 6 })}><option value={1}>1 hour</option><option value={3}>3 hours</option><option value={6}>6 hours</option></select></label>
        <label>News selection<select value={settings.importance ?? 'major'} onChange={event => change({ importance: event.target.value as 'major' | 'relevant' })}><option value="major">Major developments only</option><option value="relevant">Relevant stories</option></select></label>
        <label>Maximum recordings per day<input type="number" min={1} max={10} required value={settings.maxNewsClipsPerDay ?? 3} onChange={event => change({ maxNewsClipsPerDay: Number(event.target.value) })} /></label>
        <p className="settings-description">Up to {Math.ceil(24 / (settings.everyHours ?? 3))} source assessments per day. Assessments can use paid text generation even when no story qualifies. Voice generation stops at the recording limit.</p>
        <p className="settings-description">Requires a saved DJ, sources, mood, and provider keys. Saving an enabled workflow authorizes these provider calls.</p>
        <button className="primary" disabled={save.isPending || draft === null}>{save.isPending ? 'Saving…' : 'Save news workflow'}</button>
      </fieldset>
      {!room.enabled && <p className="notice">Make this room available in News bucket to enable preparation.</p>}
      {room.workflowDraft.newsWorkflowError ? <><p className="notice" role="alert">Preparation paused: {room.workflowDraft.newsWorkflowError}</p><button type="button" disabled={save.isPending} onClick={() => save.mutate()}>Resume preparation</button></> : <p className="settings-description" role="status">{room.workflowDraft.newsEnabled ? room.workflowDraft.nextNewsCheckAt ? `Next check: ${new Date(room.workflowDraft.nextNewsCheckAt).toLocaleString()}` : 'First check pending.' : 'Automatic news preparation is off.'}</p>}
      <ErrorNotice error={save.error} />
      {save.isSuccess && draft === null && <p className="form-hint" role="status">News workflow saved.</p>}
    </form>}
    {onConfigureRoom && <button type="button" onClick={onConfigureRoom}>Configure News bucket</button>}
  </div>;
}
