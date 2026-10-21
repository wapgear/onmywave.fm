import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

import type { DJ } from '../../../shared/types';
import { unwrap } from '../../api';
import { DJAvatar } from '../../components/DJAvatar/DJAvatar.component';
import { Dialog, Empty, ErrorNotice, PageHeading } from '../../components/Shared';
import { confirmLocalState } from '../../local-state-cache';
import { useRetryFocus } from '../../useRetryFocus';
import { DJEditor } from './components/DJEditor.component';
import { DJPreview } from './components/DJPreview.component';

import './DJs.styles.css';

const fresh = (): DJ => ({
  id: crypto.randomUUID(),
  name: '',
  description: '',
  instructions: '',
  musicPreferences: '',
  exclusions: '',
  language: '',
  personality: '',
  speakingFrequency: 'never',
  avatar: { kind: 'initials', color: 'neutral' },
});

export function DJsPage() {
  const client = useQueryClient();
  const state = useQuery({ queryKey: ['localState'], queryFn: async () => unwrap(await window.wave.getLocalState()) });
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<DJ | null>(null);
  const [deleting, setDeleting] = useState<DJ | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const newDJ = useRef<HTMLButtonElement>(null);
  const deletingInFlight = useRef(false);
  const retryFocus = useRetryFocus({
    ownerKey: 'djs:local-state',
    target: () =>
      results.current?.querySelector<HTMLButtonElement>('.dj-row .icon-button') ?? newDJ.current ?? heading.current,
    canFocusSuccess: () => !state.isError && !state.isFetching && !!state.data,
  });
  const save = useMutation({
    mutationFn: async (id: string) => {
      const local = unwrap(await window.wave.getLocalState());
      await confirmLocalState(client, unwrap(await window.wave.saveDjs(local.djs.filter((dj) => dj.id !== id))));
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['localState'] });
      setEditing(null);
      setDeleting(null);
    },
    onSettled: () => {
      deletingInFlight.current = false;
    },
  });
  function closeDeletion() {
    if (!deletingInFlight.current && !save.isPending) setDeleting(null);
  }
  function deleteDJ(id: string) {
    if (deletingInFlight.current || save.isPending) return;
    deletingInFlight.current = true;
    save.mutate(id);
  }
  const djs = state.data?.djs ?? [];
  const affectedProfiles = deleting
    ? (state.data?.roomProfiles.filter((profile) => profile.room.djId === deleting.id) ?? [])
    : [];
  const affectedPlayback = state.data?.djPlayback.enabled
    ? affectedProfiles.find((profile) => profile.id === state.data?.djPlayback.roomId)
    : undefined;
  function edit(dj: DJ) {
    save.reset();
    setEditing(dj);
  }

  return (
    <>
      <PageHeading title="DJs" subtitle="Hosts and voices for your prepared audio takes" headingRef={heading}>
        <button ref={newDJ} className="primary" disabled={!state.data} onClick={() => edit(fresh())}>
          <Plus size={17} />
          New DJ
        </button>
      </PageHeading>
      <ErrorNotice
        error={state.error}
        retryRef={retryFocus.retryRef}
        retrying={state.isFetching}
        retry={() => retryFocus.retry(() => state.refetch())}
      />
      {state.isPending ? (
        <p className="loading" role="status">
          Loading your DJs…
        </p>
      ) : djs.length ? (
        <div className="dj-list" ref={results}>
          {djs.map((dj) => (
            <article key={dj.id} className="dj-row">
              <DJAvatar dj={dj} />
              <div className="dj-summary">
                <h2>{dj.name}</h2>
                <p>{dj.description || 'Your saved DJ configuration'}</p>
                <DJPreview dj={dj} activeId={previewing} onStart={setPreviewing} />
              </div>
              <button className="icon-button" aria-label={`Edit ${dj.name}`} onClick={() => edit({ ...dj })}>
                <Pencil size={17} />
              </button>
              <button
                className="icon-button"
                aria-label={`Duplicate ${dj.name}`}
                onClick={() => edit({ ...dj, id: crypto.randomUUID(), name: `${dj.name} copy` })}
              >
                <Copy size={17} />
              </button>
              <button
                className="icon-button danger"
                aria-label={`Delete ${dj.name}`}
                onClick={() => {
                  save.reset();
                  setDeleting(dj);
                }}
              >
                <Trash2 size={17} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        !state.error && (
          <Empty title="Choose a host for your news">
            Start with a preset voice and personality, then adjust how your host tells each story. You choose the music
            in your queue.
          </Empty>
        )
      )}
      {editing && (
        <DJEditor
          value={editing}
          close={() => {
            if (!save.isPending) setEditing(null);
          }}
        />
      )}
      {deleting && (
        <Dialog title={`Delete ${deleting.name}?`} close={closeDeletion} closeDisabled={save.isPending}>
          <p>
            This removes {deleting.name} from your saved DJs.{' '}
            {affectedProfiles.length
              ? `It will also be removed from ${affectedProfiles.map((profile) => profile.name).join(', ')}. Choose another DJ in those profiles before preparing more news. `
              : ''}
            Saved scripts and audio takes keep their original DJ information.
          </p>
          {affectedPlayback && (
            <p>
              DJ breaks for {affectedPlayback.name} will turn off. Choose another DJ in News bucket before enabling them
              again.
            </p>
          )}
          <ErrorNotice error={save.error} />
          <div className="modal-actions">
            <button aria-disabled={save.isPending || undefined} onClick={closeDeletion}>
              Cancel
            </button>
            <button
              className="destructive"
              aria-disabled={save.isPending || undefined}
              aria-busy={save.isPending || undefined}
              onClick={() => deleteDJ(deleting.id)}
            >
              {save.isPending ? 'Deleting…' : 'Delete DJ'}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
