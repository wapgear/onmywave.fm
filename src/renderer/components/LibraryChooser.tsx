import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { unwrap } from '../api';
import { useRetryFocus } from '../useRetryFocus';
import type { LibraryChooserProps } from './LibraryChooser.types';
import { useLibrarySelection } from './LibrarySelection';
import { Empty, ErrorNotice } from './Shared';

import './LibraryChooser.styles.css';

export function LibraryChooser({
  connection,
  done,
  onChangeAccount,
  disabled = false,
  runConnectionTransition,
}: LibraryChooserProps) {
  const libraries = useQuery({
    queryKey: ['libraries', connection.id],
    queryFn: async () => unwrap(await window.wave.libraries()),
  });
  const selection = useLibrarySelection();
  const form = useRef<HTMLFormElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const [focusedSave, setFocusedSave] = useState<HTMLButtonElement | null>(null);
  const ownsSaveFocus = !disabled && focusedSave !== null && document.activeElement === focusedSave;
  const { retryRef, retry: retryWithFocus } = useRetryFocus({
    ownerKey: connection.id,
    target: () =>
      form.current?.checkVisibility()
        ? form.current.querySelector<HTMLElement>(
            '.library-choice-row input:not(:disabled), button.library-choice-retry:not(:disabled)',
          )
        : null,
    canFocusSuccess: () => !disabled && !selection.pending && libraries.isSuccess && !libraries.isFetching,
  });
  const retryLibraries = () => {
    if (!disabled && !selection.pending && !libraries.isFetching) return retryWithFocus(() => libraries.refetch());
  };
  const selectedIds = (libraries.data ?? [])
    .filter((library) => selection.selected.includes(library.id))
    .map((library) => library.id);
  const unavailableSelection =
    libraries.isSuccess &&
    connection.selectedLibraryIds.some((id) => !libraries.data.some((library) => library.id === id));
  const dirty =
    selectedIds.length !== connection.selectedLibraryIds.length ||
    connection.selectedLibraryIds.some((id) => !selectedIds.includes(id));
  const canSave =
    !disabled && dirty && !selection.pending && selectedIds.length > 0 && !libraries.isFetching && !libraries.error;

  return (
    <form
      ref={form}
      className="library-chooser"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) {
          saveButton.current?.focus({ preventScroll: true });
          const submit = () => selection.submit(selectedIds, done);
          if (runConnectionTransition) void runConnectionTransition(saveButton.current, submit);
          else void submit().catch(() => {});
        }
      }}
    >
      <fieldset disabled={disabled || selection.pending || libraries.isPending || !!libraries.error}>
        <legend className="sr-only">Music libraries</legend>
        <div className="library-choice-list">
          {libraries.data?.map((library) => (
            <label className="library-choice-row" key={library.id}>
              <input
                type="checkbox"
                checked={selection.selected.includes(library.id)}
                onChange={() => selection.toggle(library.id)}
              />
              <span>{library.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {libraries.isPending && <p role="status">Loading music libraries…</p>}
      {libraries.isSuccess && !libraries.data.length && (
        <Empty title="No music libraries available">
          Ask your Jellyfin administrator for access to a music library, then try again.
          <button
            ref={retryRef}
            className="library-choice-retry"
            type="button"
            disabled={disabled || selection.pending}
            aria-disabled={libraries.isFetching}
            aria-busy={libraries.isFetching}
            onClick={() => void retryLibraries()}
          >
            {libraries.isFetching ? 'Checking libraries…' : 'Try again'}
          </button>
        </Empty>
      )}
      {unavailableSelection && (
        <p className="form-hint" role="status">
          Some previously selected libraries are no longer available. Choose available libraries and save to update your
          collection.
        </p>
      )}
      <ErrorNotice
        error={libraries.error}
        retryRef={retryRef}
        retrying={libraries.isFetching}
        retry={disabled || selection.pending ? undefined : retryLibraries}
      />
      <ErrorNotice error={selection.error} />
      <div className="library-choice-footer">
        <span aria-live="polite">
          {selectedIds.length} {selectedIds.length === 1 ? 'library' : 'libraries'} selected
        </span>
        <button
          ref={saveButton}
          className="primary"
          disabled={!canSave && !ownsSaveFocus}
          aria-disabled={!canSave || undefined}
          aria-busy={selection.pending || undefined}
          onFocus={(event) => setFocusedSave(event.currentTarget)}
          onBlur={() => setFocusedSave(null)}
        >
          {selection.pending ? 'Saving libraries…' : !dirty && ownsSaveFocus ? 'Libraries saved' : 'Save libraries'}
        </button>
      </div>
      {onChangeAccount && (
        <button
          className="library-change-account"
          type="button"
          disabled={disabled || selection.pending}
          onClick={() => {
            if (!disabled && !selection.pending) onChangeAccount();
          }}
        >
          Use another account or server
        </button>
      )}
    </form>
  );
}
