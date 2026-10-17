import { useRef } from 'react';
import { useRetryFocus } from '../useRetryFocus';
import { useQuery } from '@tanstack/react-query';
import type { Connection } from '../../shared/types';
import { unwrap } from '../api';
import { Empty, ErrorNotice } from './Shared';
import { useLibrarySelection } from './LibrarySelection';
import './LibraryChooser.styles.css';
export function LibraryChooser({ connection, done, onChangeAccount, disabled = false }: { connection: Connection; done: (connection: Connection) => void; onChangeAccount?: () => void; disabled?: boolean }) {
  const libraries = useQuery({ queryKey: ['libraries', connection.id], queryFn: async () => unwrap(await window.wave.libraries()) });
  const selection = useLibrarySelection();
  const form = useRef<HTMLFormElement>(null);
  const { retryRef, retry: retryWithFocus } = useRetryFocus({
    ownerKey: connection.id,
    target: () => form.current?.checkVisibility() ? form.current.querySelector<HTMLElement>('.library-choice-row input:not(:disabled), button.library-choice-retry:not(:disabled)') : null,
    canFocusSuccess: () => !disabled && !selection.pending && libraries.isSuccess && !libraries.isFetching,
  });
  const retryLibraries = () => { if (!disabled && !selection.pending && !libraries.isFetching) return retryWithFocus(() => libraries.refetch()); };
  const selectedIds = (libraries.data ?? []).filter(library => selection.selected.includes(library.id)).map(library => library.id);
  const unavailableSelection = libraries.isSuccess && connection.selectedLibraryIds.some(id => !libraries.data.some(library => library.id === id));
  const dirty = selectedIds.length !== connection.selectedLibraryIds.length || connection.selectedLibraryIds.some(id => !selectedIds.includes(id));
  const canSave = !disabled && dirty && !selection.pending && selectedIds.length > 0 && !libraries.isFetching && !libraries.error;
  return <form ref={form} className="library-chooser" onSubmit={event => { event.preventDefault(); if (canSave) selection.submit(selectedIds, done); }}>
    <fieldset disabled={disabled || selection.pending || libraries.isPending || !!libraries.error}><legend className="sr-only">Music libraries</legend><div className="library-choice-list">{libraries.data?.map(library => <label className="library-choice-row" key={library.id}><input type="checkbox" checked={selection.selected.includes(library.id)} onChange={() => selection.toggle(library.id)} /><span>{library.name}</span></label>)}</div></fieldset>
    {libraries.isPending && <p role="status">Loading music libraries…</p>}{libraries.isSuccess && !libraries.data.length && <Empty title="No music libraries available">Ask your Jellyfin administrator for access to a music library, then try again.<button ref={retryRef} className="library-choice-retry" type="button" disabled={disabled || selection.pending} aria-disabled={libraries.isFetching} aria-busy={libraries.isFetching} onClick={retryLibraries}>{libraries.isFetching ? 'Checking libraries…' : 'Try again'}</button></Empty>}
    {unavailableSelection && <p className="form-hint" role="status">Some previously selected libraries are no longer available. Choose available libraries and save to update your collection.</p>}
    <ErrorNotice error={libraries.error} retryRef={retryRef} retrying={libraries.isFetching} retry={disabled || selection.pending ? undefined : retryLibraries} /><ErrorNotice error={selection.error} />
    <div className="library-choice-footer"><span aria-live="polite">{selectedIds.length} {selectedIds.length === 1 ? 'library' : 'libraries'} selected</span><button className="primary" disabled={!canSave}>{selection.pending ? 'Saving…' : 'Save libraries'}</button></div>
    {onChangeAccount && <button className="library-change-account" type="button" disabled={disabled || selection.pending} onClick={() => { if (!disabled && !selection.pending) onChangeAccount(); }}>Use another account or server</button>}
  </form>;
}
