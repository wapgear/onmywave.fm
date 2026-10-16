import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Connection } from '../../shared/types';
import { unwrap } from '../api';
import { Empty, ErrorNotice } from './Shared';
import './LibraryChooser.styles.css';
export function LibraryChooser({ connection, done, onChangeAccount, disabled = false }: { connection: Connection; done: (connection: Connection) => void; onChangeAccount?: () => void; disabled?: boolean }) {
  const libraries = useQuery({ queryKey: ['libraries', connection.id], queryFn: async () => unwrap(await window.wave.libraries()) });
  const [selected, setSelected] = useState(new Set(connection.selectedLibraryIds));
  const selectedIds = (libraries.data ?? []).filter(library => selected.has(library.id)).map(library => library.id);
  const unavailableSelection = libraries.isSuccess && connection.selectedLibraryIds.some(id => !libraries.data.some(library => library.id === id));
  const dirty = selectedIds.length !== connection.selectedLibraryIds.length || connection.selectedLibraryIds.some(id => !selectedIds.includes(id));
  const save = useMutation({ mutationKey: ['selectLibraries', connection.id], mutationFn: async () => unwrap(await window.wave.selectLibraries(selectedIds)), onSuccess: done });
  const canSave = !disabled && dirty && !save.isPending && selectedIds.length > 0 && !libraries.isFetching && !libraries.error;
  return <form className="library-chooser" onSubmit={event => { event.preventDefault(); if (canSave) save.mutate(); }}>
    <fieldset disabled={disabled || save.isPending || libraries.isPending || !!libraries.error}><legend className="sr-only">Music libraries</legend><div className="library-choice-list">{libraries.data?.map(library => <label className="library-choice-row" key={library.id}><input type="checkbox" checked={selected.has(library.id)} onChange={() => { save.reset(); setSelected(old => { const next = new Set(old); if (next.has(library.id)) next.delete(library.id); else next.add(library.id); return next; }); }} /><span>{library.name}</span></label>)}</div></fieldset>
    {libraries.isPending && <p role="status">Loading music libraries…</p>}{libraries.isSuccess && !libraries.data.length && <Empty title="No music libraries available">Ask your Jellyfin administrator for access to a music library, then try again.<button className="library-choice-retry" type="button" disabled={disabled || save.isPending || libraries.isFetching} onClick={() => void libraries.refetch()}>{libraries.isFetching ? 'Checking libraries…' : 'Try again'}</button></Empty>}
    {unavailableSelection && <p className="form-hint" role="status">Some previously selected libraries are no longer available. Choose available libraries and save to update your collection.</p>}
    <ErrorNotice error={libraries.error} retry={disabled || save.isPending ? undefined : () => void libraries.refetch()} /><ErrorNotice error={save.error} />
    <div className="library-choice-footer"><span aria-live="polite">{selectedIds.length} {selectedIds.length === 1 ? 'library' : 'libraries'} selected</span><button className="primary" disabled={!canSave}>{save.isPending ? 'Saving…' : 'Save libraries'}</button></div>
    {onChangeAccount && <button className="library-change-account" type="button" disabled={disabled || save.isPending} onClick={() => { if (!disabled && !save.isPending) onChangeAccount(); }}>Use another account or server</button>}
  </form>;
}
