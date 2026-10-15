import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Connection } from '../../shared/types';
import { unwrap } from '../api';
import { Empty, ErrorNotice } from './Shared';
import './LibraryChooser.styles.css';
export function LibraryChooser({ connection, done }: { connection: Connection; done: (connection: Connection) => void }) {
  const libraries = useQuery({ queryKey: ['libraries', connection.id], queryFn: async () => unwrap(await window.wave.libraries()) });
  const [selected, setSelected] = useState(new Set(connection.selectedLibraryIds));
  const dirty = selected.size !== connection.selectedLibraryIds.length || connection.selectedLibraryIds.some(id => !selected.has(id));
  const save = useMutation({ mutationFn: async () => unwrap(await window.wave.selectLibraries([...selected])), onSuccess: done });
  const canSave = dirty && !save.isPending && selected.size > 0 && !!libraries.data?.length && !libraries.error;
  return <form className="library-chooser" onSubmit={event => { event.preventDefault(); if (canSave) save.mutate(); }}>
    <fieldset disabled={save.isPending || libraries.isPending || !!libraries.error}><legend className="sr-only">Music libraries</legend><div className="library-choice-list">{libraries.data?.map(library => <label className="library-choice-row" key={library.id}><input type="checkbox" checked={selected.has(library.id)} onChange={() => { save.reset(); setSelected(old => { const next = new Set(old); if (next.has(library.id)) next.delete(library.id); else next.add(library.id); return next; }); }} /><span>{library.name}</span></label>)}</div></fieldset>
    {libraries.isPending && <p role="status">Loading music libraries…</p>}{libraries.isSuccess && !libraries.data.length && <Empty title="No music libraries available">Ask your Jellyfin administrator for access to a music library, then try again.</Empty>}
    <ErrorNotice error={libraries.error} retry={() => void libraries.refetch()} /><ErrorNotice error={save.error} />
    <div className="library-choice-footer"><span aria-live="polite">{selected.size} {selected.size === 1 ? 'library' : 'libraries'} selected</span><button className="primary" disabled={!canSave}>{save.isPending ? 'Saving…' : 'Save libraries'}</button></div>
  </form>;
}
