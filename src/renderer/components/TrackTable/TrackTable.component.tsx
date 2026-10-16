import { Fragment, useCallback, useEffect, useId, useRef, useState, type MouseEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, Clock3, Info, ListPlus, Play, Plus, Trash2 } from 'lucide-react';
import type { PlaylistEntry, Song } from '../../../shared/types';
import { editablePlaylistEntryIds } from '../../../shared/playlist-entries';
import { Artwork, duration } from '../Shared';
import './TrackTable.styles.css';

export type TrackRow = { key: string; song: Song; editable?: boolean };
export const songRows = (songs: Song[]): TrackRow[] => songs.map(song => ({ key: song.id, song }));
export const playlistRows = (entries: PlaylistEntry[]): TrackRow[] => {
  const editable = editablePlaylistEntryIds(entries);
  return entries.map((entry, index) => ({
    key: editable.has(entry.entryId) ? entry.entryId : JSON.stringify([entry.entryId, entry.song.id, index]),
    song: entry.song, editable: editable.has(entry.entryId),
  }));
};
export type TrackTableProps = {
  rows: TrackRow[];
  selected: Map<string, Song>;
  select: (next: Map<string, Song>) => void;
  play: (songs: Song[], index?: number) => void;
  queue: (songs: Song[]) => void;
  add: (songs: Song[]) => void;
  details: (song: Song) => void;
  currentId?: string;
  offset?: number;
  editable?: boolean;
  busy?: boolean;
  remove?: (key: string) => void;
  move?: (key: string, index: number) => void;
  rowWindow?: { indices: number[]; rowHeight: number; focusRow: (index: number) => void };

};
export function TrackTable({ rows, selected, select, play, queue, add, details, currentId, offset = 0, editable, busy, remove, move, rowWindow }: TrackTableProps) {
  const anchor = useRef<string | null>(null);
  useEffect(() => { if (!rows.some(row => row.key === anchor.current)) anchor.current = null; }, [rows]);
  const selectedSongs = rows.filter(row => selected.has(row.key)).map(row => row.song);
  const allSelected = rows.length > 0 && rows.every(row => selected.has(row.key));
  function toggle(key: string, song: Song) { const next = new Map(selected); if (next.has(key)) next.delete(key); else next.set(key, song); select(next); }
  function toggleAll() { const next = new Map(selected); for (const row of rows) { if (allSelected) next.delete(row.key); else next.set(row.key, row.song); } select(next); }
  function choose(index: number, shift: boolean, additive: boolean) {
    const row = rows[index];
    const from = rows.findIndex(item => item.key === anchor.current);
    if (shift && from >= 0) {
      const next = additive ? new Map(selected) : new Map<string, Song>();
      for (const item of rows.slice(Math.min(from, index), Math.max(from, index) + 1)) next.set(item.key, item.song);
      select(next);
    } else {
      if (additive) toggle(row.key, row.song);
      else select(new Map([[row.key, row.song]]));
      anchor.current = row.key;
    }
  }
  function rowClick(event: MouseEvent<HTMLTableRowElement>, index: number) {
    if ((event.target as HTMLElement).closest('button,input,summary,[popover]')) return;
    event.currentTarget.focus({ preventScroll: true });
    choose(index, event.shiftKey, event.metaKey || event.ctrlKey);
  }
  function rowKey(event: KeyboardEvent<HTMLTableRowElement>, index: number) {
    if (event.target !== event.currentTarget) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      const next = new Map(selected);
      for (const row of rows) next.set(row.key, row.song);
      select(next);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (event.key === 'Enter') play(rows.map(item => item.song), index);
      else choose(index, event.shiftKey, event.metaKey || event.ctrlKey);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)));
      if (rowWindow) rowWindow.focusRow(next);
      else event.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-track-index="${next}"]`)?.focus();
      choose(next, event.shiftKey, event.metaKey || event.ctrlKey);
    }
  }
  const indices = rowWindow?.indices ?? rows.map((_, index) => index);
  function spacer(count: number) { return count > 0 && rowWindow ? <tr aria-hidden="true" className="song-spacer"><td colSpan={6} style={{ height: count * rowWindow.rowHeight, padding: 0, border: 0 }} /></tr> : null; }
  return <>
    <div className="table-scroll"><table className="song-table" aria-rowcount={rows.length + 1}><thead><tr><th className="check-column"><input type="checkbox" aria-label="Select loaded songs" checked={allSelected} onChange={toggleAll} /></th><th className="number-column">#</th><th>Title</th><th className="album-column">Album</th><th className="time-column"><Clock3 size={14} aria-label="Duration" /></th><th className="actions-column"><span className="sr-only">Actions</span></th></tr></thead><tbody>{indices.map((index, windowIndex) => { const row = rows[index]; return <Fragment key={row.key}>{spacer(index - (indices[windowIndex - 1] ?? -1) - 1)}<tr data-track-index={index} data-track-key={row.key} aria-rowindex={index + 2} className={`${selected.has(row.key) ? 'selected' : ''} ${currentId === row.song.id ? 'now-playing' : ''}`} tabIndex={0} aria-selected={selected.has(row.key)} onClick={event => rowClick(event, index)} onKeyDown={event => rowKey(event, index)} onDoubleClick={event => { if (!(event.target as HTMLElement).closest('button,input,summary,[popover]')) play(rows.map(item => item.song), index); }}>
      <td><input aria-label={`Select ${row.song.name}`} type="checkbox" checked={selected.has(row.key)} onChange={() => { anchor.current = row.key; toggle(row.key, row.song); }} /></td><td className="row-number">{currentId === row.song.id ? <span className="playing-bars" aria-label="Current song">♫</span> : offset + index + 1}</td>
      <td><div className="song-title-cell"><button className="artwork-button" aria-label={`Play ${row.song.name}`} onClick={() => play(rows.map(item => item.song), index)}><Artwork url={row.song.imageUrl} name={row.song.name} /><span className="artwork-play"><Play size={14} fill="currentColor" /></span></button><button className="song-name" onClick={() => details(row.song)}><span>{row.song.name || 'Untitled song'}</span><small>{row.song.artists.join(', ') || 'Unknown artist'}</small></button></div></td>
      <td className="album-column muted truncate">{row.song.album || 'Unknown album'}</td><td className="time-column muted">{duration(row.song.duration)}</td>
      <td className="row-actions"><TrackMenu name={row.song.name}>
        <button onClick={() => play([row.song])}><Play size={15} />Play song</button><button onClick={() => queue([row.song])}><ListPlus size={15} />Add to queue</button><button onClick={() => add([row.song])}><Plus size={15} />Add to playlist</button><button onClick={() => details(row.song)}><Info size={15} />Song details</button>{editable && <><button disabled={busy || row.editable === false || index === 0} onClick={() => move?.(row.key, index - 1)}><ArrowUp size={15} />Move up</button><button disabled={busy || row.editable === false || index === rows.length - 1} onClick={() => move?.(row.key, index + 1)}><ArrowDown size={15} />Move down</button><button disabled={busy || row.editable === false} className="danger" onClick={() => remove?.(row.key)}><Trash2 size={15} />Remove from playlist</button></>}
      </TrackMenu></td>
    </tr></Fragment>; })}{spacer(rows.length - (indices.at(-1) ?? -1) - 1)}</tbody></table></div>
    {selectedSongs.length > 0 && <div className="selection-toolbar" aria-label="Selected songs"><span><Check size={15} />{selectedSongs.length} selected</span><button onClick={() => play(selectedSongs)}><Play size={16} />Play</button><button className="icon-button" aria-label="Add selected songs to queue" onClick={() => queue(selectedSongs)}><ListPlus size={19} /></button><button className="primary" onClick={() => add(selectedSongs)}>Add to playlist</button><button onClick={() => select(new Map())}>Clear</button></div>}
  </>;
}

function TrackMenu({ name, children }: { name: string; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => { menu.current?.hidePopover(); trigger.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => { if (!menu.current?.contains(event.target as Node)) close(); };
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('scroll', dismiss, true); window.removeEventListener('resize', close); };
  }, [open, close]);
  return <><button ref={trigger} className="track-menu-trigger" popoverTarget={id} aria-label={`Actions for ${name}`} onClick={() => {
    const rect = trigger.current!.getBoundingClientRect();
    const node = menu.current!;
    const height = node.getBoundingClientRect().height || 275;
    node.style.left = `${Math.max(8, Math.min(window.innerWidth - 218, rect.right - 205))}px`;
    node.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8))}px`;
  }}>•••</button><div id={id} ref={menu} popover="auto" role="group" className="row-menu track-popover" aria-label={`Actions for ${name}`} onToggle={event => {
    setOpen(event.newState === 'open');
    if (event.newState === 'open') {
      const node = menu.current!;
      const rect = trigger.current!.getBoundingClientRect();
      node.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - node.getBoundingClientRect().height - 8))}px`;
      node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    }
    else if (menu.current?.contains(document.activeElement) || document.activeElement === document.body) trigger.current?.focus({ preventScroll: true });
  }} onClickCapture={event => { if ((event.target as HTMLElement).closest('button:not(:disabled)')) close(); }} onKeyDown={event => {
    const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }}>{children}</div></>;
}
