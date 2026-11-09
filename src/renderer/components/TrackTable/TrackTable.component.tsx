import { ArrowDown, ArrowUp, Clock3, Ellipsis, Info, ListPlus, Pause, Play, Plus, Trash2 } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { editablePlaylistEntryIds } from '../../../shared/playlist-entries';
import type { PlaylistEntry, Song } from '../../../shared/types';
import { isMac, primaryModifier } from '../../shortcuts';
import { IconButton } from '../IconButton/IconButton.component';
import { Artwork, Dialog, DialogActions, ErrorNotice, TrackDuration } from '../Shared';
import { SongAlbum, SongArtists } from '../SongLinks/SongLinks.component';
import { useSongRemoval } from './hooks/useSongRemoval';
import type { TrackRow, TrackTableProps } from './TrackTable.types';

import './TrackTable.styles.css';

export const songRows = (songs: Song[]): TrackRow[] => songs.map((song) => ({ key: song.id, song }));

export const playlistRows = (entries: PlaylistEntry[]): TrackRow[] => {
  const editable = editablePlaylistEntryIds(entries);
  return entries.map((entry, index) => ({
    key: editable.has(entry.entryId) ? entry.entryId : JSON.stringify([entry.entryId, entry.song.id, index]),
    song: entry.song,
    editable: editable.has(entry.entryId),
  }));
};

export function TrackTable({
  rows,
  selected,
  select,
  play,
  playNext,
  enqueue,
  add,
  details,
  currentId,
  requestedPlaying,
  togglePlayback,
  offset = 0,
  editable,
  busy,
  remove,
  move,
  rowWindow,
}: TrackTableProps) {
  const anchor = useRef<string | null>(null);
  const tableRoot = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const cancelRemoval = useRef<HTMLButtonElement>(null);
  const [removing, setRemoving] = useState<Song | null>(null);
  const removal = useSongRemoval();

  useLayoutEffect(() => {
    const table = tableRoot.current;
    const scroll = table?.closest<HTMLElement>('.main-content');
    if (!table || !scroll) return;
    let frame = 0;
    const updateHeader = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const header = table.querySelector('th')?.getBoundingClientRect();
        if (!header) return;
        const top = scroll.getBoundingClientRect().top;
        scroll.style.setProperty('--table-header-top', `${Math.max(0, header.top - top)}px`);
        scroll.style.setProperty('--table-header-bottom', `${Math.max(0, header.bottom - top)}px`);
      });
    };
    const observer = new ResizeObserver(updateHeader);
    observer.observe(scroll);
    observer.observe(table);
    const content = table.closest('.page-content');
    if (content) observer.observe(content);
    scroll.addEventListener('scroll', updateHeader, { passive: true });
    updateHeader();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroll.removeEventListener('scroll', updateHeader);
      scroll.style.removeProperty('--table-header-top');
      scroll.style.removeProperty('--table-header-bottom');
    };
  }, []);

  useLayoutEffect(() => {
    const table = tableRoot.current;
    const scroll = table?.closest<HTMLElement>('.main-content');
    const shell = scroll?.closest('.app-shell');
    if (!table || !scroll || !shell) return;
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.activeElement;
        if (
          !(target instanceof HTMLElement) ||
          !table.contains(target) ||
          !target.matches(':focus-visible') ||
          document.visibilityState !== 'visible' ||
          !document.hasFocus() ||
          document.querySelector('dialog[open], :popover-open')
        )
          return;
        const row = target.closest<HTMLElement>('[data-track-key]');
        if (!row?.checkVisibility()) return;
        const viewport = scroll.getBoundingClientRect();
        const style = getComputedStyle(scroll);
        const top = Math.max(
          viewport.top + (Number.parseFloat(style.scrollPaddingTop) || 0),
          table.querySelector('thead')?.getBoundingClientRect().bottom ?? viewport.top,
        );
        let bottom = viewport.bottom - (Number.parseFloat(style.scrollPaddingBottom) || 0);
        for (const blocker of [
          toolbar.current,
          shell.querySelector('.player-notices'),
          shell.querySelector('.player-bar'),
        ]) {
          if (!blocker) continue;
          const rect = blocker.getBoundingClientRect();
          if (
            rect.width &&
            rect.height &&
            rect.right > viewport.left &&
            rect.left < viewport.right &&
            rect.bottom > viewport.top &&
            rect.top < viewport.bottom
          )
            bottom = Math.min(bottom, rect.top - 8);
        }
        const rect = row.getBoundingClientRect();
        if (rect.height > bottom - top) return;
        if (rect.bottom > bottom) scroll.scrollTop += rect.bottom - bottom;
        else if (rect.top < top) scroll.scrollTop -= top - rect.top;
      });
    };
    table.addEventListener('focusin', reveal);
    const observer = new ResizeObserver(reveal);
    for (const node of [
      scroll,
      toolbar.current,
      shell.querySelector('.player-notices'),
      shell.querySelector('.player-bar'),
    ])
      if (node) observer.observe(node);
    reveal();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      table.removeEventListener('focusin', reveal);
    };
  }, [selected.size]);

  useEffect(() => {
    if (!rows.some((row) => row.key === anchor.current)) anchor.current = null;
  }, [rows]);

  const selectedSongs = rows.filter((row) => selected.has(row.key)).map((row) => row.song);
  function choose(index: number, shift: boolean) {
    const row = rows[index];
    const from = rows.findIndex((item) => item.key === anchor.current);
    const next = new Map(selected);
    if (shift && from >= 0) {
      for (const item of rows.slice(Math.min(from, index), Math.max(from, index) + 1)) next.set(item.key, item.song);
    } else {
      if (next.has(row.key)) next.delete(row.key);
      else next.set(row.key, row.song);
      anchor.current = row.key;
    }
    select(next);
  }
  function activate(index: number) {
    if (selected.size) select(new Map());
    // Browser rows represent songs. The Queue drawer selects exact occurrences.
    if (rows[index].song.id === currentId) togglePlayback();
    else
      play(
        rows.map((item) => item.song),
        index,
      );
  }
  function rowClick(event: MouseEvent<HTMLTableRowElement>, index: number) {
    const target = event.target as HTMLElement;
    const playbackControl = target.closest('.artwork-button');
    if (target.closest('button,input,summary,[popover]') && !playbackControl) return;
    const selecting = primaryModifier(event);
    if ((isMac && event.ctrlKey) || event.button !== 0 || (!selecting && event.detail > 1)) return;
    if (!target.closest('.artwork-button') || selecting) event.currentTarget.focus({ preventScroll: true });
    if (selecting) {
      event.preventDefault();
      choose(index, event.shiftKey);
    } else if (target.closest('.artwork-button') || event.detail === 0) activate(index);
  }
  function rowDoubleClick(event: MouseEvent<HTMLTableRowElement>, index: number) {
    const target = event.target as HTMLElement;
    if (target.closest('button,input,summary,[popover]')) return;
    if (event.ctrlKey || event.metaKey || event.button !== 0) return;
    activate(index);
  }
  function rowKey(event: KeyboardEvent<HTMLTableRowElement>, index: number) {
    if (event.target !== event.currentTarget) return;
    if (primaryModifier(event) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      const next = new Map(selected);
      for (const row of rows) next.set(row.key, row.song);
      select(next);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (primaryModifier(event)) choose(index, event.shiftKey);
      else activate(index);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)));
      if (rowWindow) rowWindow.focusRow(next);
      else event.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-track-index="${next}"]`)?.focus();
      if (primaryModifier(event)) choose(next, event.shiftKey);
    } else if (event.key === 'Escape' && selected.size) {
      event.preventDefault();
      select(new Map());
    }
  }
  const indices = rowWindow?.indices ?? rows.map((_, index) => index);
  function spacer(count: number) {
    return count > 0 && rowWindow ? (
      <tr aria-hidden="true" className="song-spacer">
        <td aria-hidden="true" colSpan={5} style={{ height: count * rowWindow.rowHeight, padding: 0, border: 0 }} />
      </tr>
    ) : null;
  }

  return (
    <>
      <div ref={tableRoot} className="table-scroll">
        <table
          className="song-table"
          style={{ '--track-number-width': `${String(offset + rows.length).length}ch` } as CSSProperties}
          aria-label={`Songs. ${isMac ? 'Command' : 'Control'}-click to select songs.`}
          aria-rowcount={rows.length + 1}
        >
          <thead>
            <tr>
              <th className="number-column">#</th>
              <th>Title</th>
              <th className="album-column">Album</th>
              <th className="time-column">
                <Clock3 size={14} aria-label="Duration" />
              </th>
              <th className="actions-column">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr aria-hidden="true" className="song-spacer">
              <td aria-hidden="true" colSpan={5} style={{ height: 8, padding: 0, border: 0 }} />
            </tr>
            {indices.map((index, windowIndex) => {
              const row = rows[index];
              const pausing = row.song.id === currentId && requestedPlaying;
              const ActionIcon = pausing ? Pause : Play;

              return (
                <Fragment key={row.key}>
                  {spacer(index - (indices[windowIndex - 1] ?? -1) - 1)}
                  <tr
                    data-track-index={index}
                    data-track-key={row.key}
                    aria-rowindex={index + 2}
                    className={`${selected.has(row.key) ? 'selected' : ''} ${currentId === row.song.id ? 'now-playing' : ''}`}
                    tabIndex={0}
                    aria-label={`${row.song.name || 'Untitled song'}, ${row.song.artists.join(', ') || 'Unknown artist'}`}
                    aria-selected={selected.has(row.key)}
                    onClick={(event) => rowClick(event, index)}
                    onDoubleClick={(event) => rowDoubleClick(event, index)}
                    onKeyDown={(event) => rowKey(event, index)}
                  >
                    <td className="row-number">
                      {currentId === row.song.id ? (
                        <span className="playing-bars" aria-label="Current song">
                          ♫
                        </span>
                      ) : (
                        offset + index + 1
                      )}
                    </td>
                    <td>
                      <div className="song-title-cell">
                        <button
                          className="artwork-button"
                          aria-label={`${pausing ? 'Pause' : 'Play'} ${row.song.name || 'Untitled song'}`}
                          title={pausing ? 'Pause song' : 'Play song'}
                        >
                          <Artwork url={row.song.imageUrl} name={row.song.name} />
                          <span className="artwork-play" aria-hidden="true">
                            <ActionIcon size={14} />
                          </span>
                        </button>
                        <div className="song-name">
                          <span>{row.song.name || 'Untitled song'}</span>
                          <small>
                            <SongArtists song={row.song} />
                          </small>
                        </div>
                      </div>
                    </td>
                    <td className="album-column muted truncate">
                      <SongAlbum song={row.song} />
                    </td>
                    <td className="time-column muted">
                      <TrackDuration seconds={row.song.duration} />
                    </td>
                    <td className="row-actions">
                      <TrackMenu name={row.song.name}>
                        <button onClick={() => activate(index)}>
                          <ActionIcon size={15} />
                          {pausing ? 'Pause song' : 'Play song'}
                        </button>
                        <button onClick={() => playNext([row.song])}>
                          <Play size={15} />
                          Play next
                        </button>
                        <button onClick={() => enqueue([row.song])}>
                          <ListPlus size={15} />
                          Add to end
                        </button>
                        <button onClick={() => add([row.song])}>
                          <Plus size={15} />
                          Add to playlist
                        </button>
                        <button onClick={() => details(row.song)}>
                          <Info size={15} />
                          Song details
                        </button>
                        <button
                          className="danger"
                          disabled={removal.isPending}
                          onClick={() => {
                            removal.reset();
                            setRemoving(row.song);
                          }}
                        >
                          <Trash2 size={15} />
                          Remove song
                        </button>
                        {editable && (
                          <>
                            <button
                              disabled={busy || row.editable === false || index === 0}
                              onClick={() => move?.(row.key, index - 1)}
                            >
                              <ArrowUp size={15} />
                              Move up
                            </button>
                            <button
                              disabled={busy || row.editable === false || index === rows.length - 1}
                              onClick={() => move?.(row.key, index + 1)}
                            >
                              <ArrowDown size={15} />
                              Move down
                            </button>
                            <button
                              disabled={busy || row.editable === false}
                              className="danger"
                              onClick={() =>
                                remove?.(
                                  row.key,
                                  document.activeElement instanceof HTMLButtonElement &&
                                    document.activeElement.classList.contains('track-menu-trigger')
                                    ? document.activeElement
                                    : null,
                                )
                              }
                            >
                              <Trash2 size={15} />
                              Remove from playlist
                            </button>
                          </>
                        )}
                      </TrackMenu>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
            {spacer(rows.length - (indices.at(-1) ?? -1) - 1)}
          </tbody>
        </table>
      </div>
      {selectedSongs.length > 0 && (
        <div ref={toolbar} className="selection-toolbar" aria-label="Selected songs">
          <span>{selectedSongs.length} selected</span>
          <button onClick={() => play(selectedSongs)}>
            <Play size={16} />
            Play
          </button>
          <button onClick={() => playNext(selectedSongs)}>
            <Play size={16} />
            Play next
          </button>
          <button onClick={() => enqueue(selectedSongs)}>
            <ListPlus size={19} aria-hidden="true" />
            Add to end
          </button>
          <button className="primary" onClick={() => add(selectedSongs)}>
            Add to playlist
          </button>
          <button onClick={() => select(new Map())}>Clear</button>
        </div>
      )}
      {removing && (
        <Dialog
          title="Remove song?"
          close={() => setRemoving(null)}
          closeDisabled={removal.isPending}
          initialFocusRef={cancelRemoval}
        >
          <p>“{removing.name || 'Untitled song'}” will disappear from your library on this Mac.</p>
          <p>Once the server receives your request, its cleanup worker can delete the library file after 7 days.</p>
          <ErrorNotice error={removal.error} />
          <DialogActions>
            <button ref={cancelRemoval} disabled={removal.isPending} onClick={() => setRemoving(null)}>
              Cancel
            </button>
            <button
              className="danger"
              disabled={removal.isPending}
              onClick={() => {
                void removal
                  .mutateAsync(removing.id)
                  .then(() => {
                    select(new Map([...selected].filter(([, song]) => song.id !== removing.id)));
                    setRemoving(null);
                  })
                  .catch(() => {});
              }}
            >
              {removal.isPending ? 'Removing…' : 'Remove song'}
            </button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}

function TrackMenu({ name, children }: { name: string; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const contextPoint = useRef<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);

  const position = useCallback(() => {
    const node = menu.current!;
    const rect = trigger.current!.getBoundingClientRect();
    const bounds = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(window.innerWidth - bounds.width - 8, contextPoint.current?.x ?? rect.right - bounds.width))}px`;
    node.style.top = `${Math.max(8, Math.min(window.innerHeight - bounds.height - 8, contextPoint.current?.y ?? rect.bottom + 4))}px`;
  }, []);

  const close = useCallback(() => {
    menu.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const row = trigger.current?.closest('tr');
    if (!row) return;
    let pendingOpen: (() => void) | undefined;
    const show = (point: { x: number; y: number } | null) => {
      trigger.current?.focus({ preventScroll: true });
      contextPoint.current = point;
      menu.current?.showPopover();
      position();
      menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    };
    const contextMenu = (event: globalThis.MouseEvent) => {
      if (menu.current?.contains(event.target as Node)) return;
      event.preventDefault();
      const point = event.button === 2 || event.ctrlKey ? { x: event.clientX, y: event.clientY } : null;
      if (pendingOpen) document.removeEventListener('pointerup', pendingOpen);
      // macOS sends contextmenu before pointerup, which would light-dismiss a newly opened popover.
      if (event.buttons) {
        pendingOpen = () => show(point);
        document.addEventListener('pointerup', pendingOpen, { once: true });
      } else show(point);
    };
    const keyboardMenu = (event: globalThis.KeyboardEvent) => {
      if (menu.current?.contains(event.target as Node)) return;
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        event.stopPropagation();
        show(null);
      }
    };
    row.addEventListener('contextmenu', contextMenu);
    row.addEventListener('keydown', keyboardMenu);
    return () => {
      if (pendingOpen) document.removeEventListener('pointerup', pendingOpen);
      row.removeEventListener('contextmenu', contextMenu);
      row.removeEventListener('keydown', keyboardMenu);
    };
  }, [position]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (menu.current?.matches(':popover-open') && !menu.current.contains(event.target as Node))
        menu.current.hidePopover();
    };
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  return (
    <>
      <IconButton
        ref={trigger}
        variant="compact"
        className="track-menu-trigger"
        popoverTarget={id}
        label={`Actions for ${name}`}
        onClick={() => {
          contextPoint.current = null;
        }}
      >
        <Ellipsis size={18} aria-hidden="true" />
      </IconButton>
      <div
        id={id}
        ref={menu}
        popover="auto"
        role="group"
        className="popover-surface row-menu track-popover"
        aria-label={`Actions for ${name}`}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) menu.current?.hidePopover();
        }}
        onToggle={(event) => {
          setOpen(event.newState === 'open');
          if (event.newState === 'open') {
            const node = menu.current!;
            position();
            node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
          } else if (menu.current?.contains(document.activeElement) || document.activeElement === document.body)
            trigger.current?.focus({ preventScroll: true });
        }}
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest('button:not(:disabled)')) close();
        }}
        onKeyDown={(event) => {
          const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
          }
        }}
      >
        {children}
      </div>
    </>
  );
}
