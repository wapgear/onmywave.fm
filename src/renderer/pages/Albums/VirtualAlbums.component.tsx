import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { defaultRangeExtractor, observeElementOffset, useVirtualizer } from '@tanstack/react-virtual';
import type { Album } from '../../../shared/types';
import { Artwork, ErrorNotice } from '../../components/Shared';
import { useRetryFocus } from '../../useRetryFocus';
import './Albums.styles.css';

const GAP = 22;
export function VirtualAlbums({ albums, total, hasNext, fetching, nextError, loadNext, open, returnFocus, focused, onResultsElement }: {
  albums: Album[]; total: number; hasNext: boolean; fetching: boolean; nextError: unknown;
  loadNext: () => Promise<{ isError: boolean }>; open: (album: Album) => void; returnFocus: string | null; focused: () => void; onResultsElement?: (node: HTMLElement | null) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLSpanElement>(null);
  const retryFocus = useRetryFocus({ ownerKey: 'albums-next-page', target: () => status.current, canFocusSuccess: () => true });
  const [paddingEnd, setPaddingEnd] = useState(140);
  const [layout, setLayout] = useState({ columns: 1, rowHeight: 246, offset: 0 });
  const [recoveryIndex, setRecoveryIndex] = useState<number | null>(null);
  const recoveryToken = useRef(0);
  const measuredLayout = useRef<{ columns: number; rowHeight: number; offset: number } | null>(null);
  const pendingLayout = useRef<{ layout: { columns: number; rowHeight: number; offset: number }; anchor?: { id: string; fraction: number }; focusId?: string; focusVisible: boolean } | null>(null);
  const restoredFocus = useRef<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(returnFocus);
  const focusedIndex = albums.findIndex(album => album.id === focusedId);
  const focusedRow = focusedIndex < 0 ? -1 : Math.floor(focusedIndex / layout.columns);
  const getScrollElement = useCallback(() => grid.current?.closest<HTMLElement>('.main-content') ?? null, []);
  // TanStack Virtual mutates its instance; keep this component outside compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: Math.ceil(albums.length / layout.columns),
    getScrollElement,
    scrollPaddingEnd: paddingEnd,
    observeElementOffset: (instance, callback) => {
      // Re-subscribing in StrictMode must adopt App's restored position, not replay zero.
      callback(instance.scrollElement?.scrollTop ?? 0, false);
      return observeElementOffset(instance, callback);
    },
    estimateSize: () => layout.rowHeight,
    scrollMargin: layout.offset,
    overscan: 3,
    rangeExtractor: range => {
      const indexes = defaultRangeExtractor(range);
      if (focusedRow >= 0) for (let row = Math.max(0, focusedRow - 1); row <= Math.min(range.count - 1, focusedRow + 1); row++) indexes.push(row);
      if (recoveryIndex !== null && recoveryIndex < albums.length) indexes.push(Math.floor(recoveryIndex / layout.columns));
      return [...new Set(indexes)].sort((a, b) => a - b);
    },
  });
  useLayoutEffect(() => {
    const node = grid.current;
    const scroll = getScrollElement();
    if (!node || !scroll) return;
    const measure = () => {
      setPaddingEnd(Number.parseFloat(getComputedStyle(scroll).scrollPaddingBottom) || 140);
      const width = node.clientWidth;
      const minimum = width >= 1000 ? 170 : 140;
      const columns = Math.max(1, Math.floor((width + GAP) / (minimum + GAP)));
      const rowHeight = (width - GAP * (columns - 1)) / columns + 90;
      const offset = node.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
      const old = measuredLayout.current;
      if (old && old.columns === columns && Math.abs(old.rowHeight - rowHeight) < 0.5 && Math.abs(old.offset - offset) < 0.5) return;
      const nextLayout = { columns, rowHeight, offset };
      if (old) {
        const rowPosition = Math.max(0, (scroll.scrollTop - old.offset) / old.rowHeight);
        const anchor = albums[Math.min(albums.length - 1, Math.floor(rowPosition) * old.columns)];
        const active = document.activeElement;
        const activeRect = active instanceof HTMLElement && node.contains(active) ? active.getBoundingClientRect() : null;
        const viewport = scroll.getBoundingClientRect();
        pendingLayout.current = {
          layout: nextLayout,
          focusVisible: !!activeRect && activeRect.bottom > viewport.top && activeRect.top < viewport.bottom,
          anchor: scroll.scrollTop >= old.offset && anchor ? { id: anchor.id, fraction: rowPosition % 1 } : undefined,
          focusId: active instanceof HTMLElement && node.contains(active) ? active.dataset.albumId : undefined,
        };
      }
      measuredLayout.current = nextLayout;
      setLayout(nextLayout);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    observer.observe(node);
    if (node.closest('.page-content')) observer.observe(node.closest('.page-content')!);
    measure();
    return () => observer.disconnect();
  }, [getScrollElement, albums]);
  useLayoutEffect(() => {
    virtualizer.measure();
    const pending = pendingLayout.current;
    const scroll = getScrollElement();
    if (!pending || pending.layout !== layout || !scroll || !grid.current) return;
    grid.current.style.height = `${virtualizer.getTotalSize()}px`;
    const index = pending.anchor ? albums.findIndex(album => album.id === pending.anchor!.id) : -1;
    let nextOffset = index >= 0 ? layout.offset + Math.floor(index / layout.columns) * layout.rowHeight + pending.anchor!.fraction * layout.rowHeight : scroll.scrollTop;
    const focusIndex = pending.focusVisible ? albums.findIndex(album => album.id === pending.focusId) : -1;
    if (focusIndex >= 0) {
      const style = getComputedStyle(scroll);
      const topPadding = parseFloat(style.scrollPaddingTop) || 0;
      const bottomPadding = parseFloat(style.scrollPaddingBottom) || 0;
      const top = layout.offset + Math.floor(focusIndex / layout.columns) * layout.rowHeight;
      const bottom = top + layout.rowHeight - GAP;
      if (top < nextOffset + topPadding) nextOffset = top - topPadding;
      else if (bottom > nextOffset + scroll.clientHeight - bottomPadding) nextOffset = bottom - scroll.clientHeight + bottomPadding;
    }
    virtualizer.scrollToOffset(nextOffset);
    if (pending.focusId) {
      const button = [...grid.current.querySelectorAll<HTMLButtonElement>('[data-album-id]')].find(node => node.dataset.albumId === pending.focusId);
      if (button && (document.activeElement === document.body || grid.current.contains(document.activeElement))) button.focus({ preventScroll: true });
    }
    pendingLayout.current = null;
  }, [layout, virtualizer, getScrollElement, albums]);
  const visible = virtualizer.getVirtualItems();
  const lastVisible = visible.filter(row => row.start + row.size >= (virtualizer.scrollOffset ?? 0) && row.start <= (virtualizer.scrollOffset ?? 0) + (virtualizer.scrollRect?.height ?? 0)).at(-1)?.index ?? -1;
  useEffect(() => {
    if (hasNext && !fetching && !nextError && lastVisible >= Math.ceil(albums.length / layout.columns) - 4) void loadNext();
  }, [lastVisible, hasNext, fetching, nextError, albums.length, layout.columns, loadNext]);
  useEffect(() => {
    if (!returnFocus || restoredFocus.current === returnFocus) return;
    const frame = requestAnimationFrame(() => {
      const button = [...(grid.current?.querySelectorAll<HTMLButtonElement>('[data-album-id]') ?? [])].find(node => node.dataset.albumId === returnFocus);
      if (button) { restoredFocus.current = returnFocus; button.focus({ preventScroll: true }); focused(); }
    });
    return () => cancelAnimationFrame(frame);
  }, [returnFocus, focused, visible]);
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = index + 1;
    else if (event.key === 'ArrowLeft') next = index - 1;
    else if (event.key === 'ArrowDown') next = index + layout.columns;
    else if (event.key === 'ArrowUp') next = index - layout.columns;
    else if (event.key === 'Home') next = event.metaKey || event.ctrlKey ? 0 : index - index % layout.columns;
    else if (event.key === 'End') next = event.metaKey || event.ctrlKey ? albums.length - 1 : Math.min(albums.length - 1, index - index % layout.columns + layout.columns - 1);
    else return;
    if (event.metaKey && event.key.startsWith('Arrow')) return;
    event.preventDefault();
    next = Math.min(albums.length - 1, Math.max(0, next));
    const id = albums[next].id;
    setFocusedId(id);
    virtualizer.scrollToIndex(Math.floor(next / layout.columns), { align: 'auto' });
    requestAnimationFrame(() => {
      [...(grid.current?.querySelectorAll<HTMLButtonElement>('[data-album-id]') ?? [])].find(node => node.dataset.albumId === id)?.focus();
    });
  }
  function retryNextPage() {
    const button = retryFocus.retryRef.current;
    if (document.activeElement !== button) return loadNext();
    const startIndex = albums.length;
    const token = ++recoveryToken.current;
    setRecoveryIndex(startIndex);
    return retryFocus.retry(() => {
      const request = loadNext();
      void request.then(result => { if (result.isError && recoveryToken.current === token) setRecoveryIndex(null); }, () => { if (recoveryToken.current === token) setRecoveryIndex(null); });
      return request;
    }, () => {
      const appended = grid.current?.querySelector<HTMLButtonElement>(`[data-album-index="${startIndex}"]`);
      const container = grid.current?.closest<HTMLElement>('.main-content');
      const viewport = container?.getBoundingClientRect();
      const bottomPadding = container ? Number.parseFloat(getComputedStyle(container).scrollPaddingBottom) || 0 : 0;
      const retained = [...(grid.current?.querySelectorAll<HTMLButtonElement>('[data-album-index]') ?? [])].find(tile => {
        if (!viewport) return true;
        const rect = tile.getBoundingClientRect();
        return rect.bottom > viewport.top && rect.top < viewport.bottom - bottomPadding;
      });
      const target = appended ?? retained ?? status.current;
      target?.scrollIntoView({ block: 'nearest' });
      return target;
    }, () => { if (recoveryToken.current === token) setRecoveryIndex(null); });
  }
  return <section ref={onResultsElement} aria-label="Album collection" className="virtual-albums">
    <div ref={grid} className="virtual-album-grid" style={{ height: virtualizer.getTotalSize() }} onBlur={event => { if (!pendingLayout.current?.focusId && !event.currentTarget.contains(event.relatedTarget)) setFocusedId(null); }}>
      {visible.map(row => <div className="virtual-album-row" key={row.key} style={{ height: layout.rowHeight, gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`, transform: `translateY(${row.start - layout.offset}px)` }}>
        {albums.slice(row.index * layout.columns, (row.index + 1) * layout.columns).map((item, column) => <button className="album-tile" key={item.id} data-album-id={item.id} data-album-index={row.index * layout.columns + column} onFocus={() => setFocusedId(item.id)} onKeyDown={event => keyboard(event, row.index * layout.columns + column)} onClick={() => open(item)} title={`${item.name} · ${item.artist || 'Unknown artist'}`}><Artwork url={item.imageUrl} name={item.name} /><strong>{item.name || 'Untitled album'}</strong><span>{item.artist || 'Unknown artist'}{item.year ? ` · ${item.year}` : ''}</span></button>)}
      </div>)}
    </div>
    <div className="album-load-status"><span ref={status} tabIndex={-1}>{albums.length.toLocaleString()} of {total.toLocaleString()} albums</span>{fetching && <span role="status">Loading albums…</span>}<ErrorNotice error={nextError} retryRef={retryFocus.retryRef} retrying={fetching} retry={retryNextPage} />{!nextError && hasNext && !fetching && <button onClick={() => void loadNext()}>Load more albums</button>}</div>
  </section>;
}
