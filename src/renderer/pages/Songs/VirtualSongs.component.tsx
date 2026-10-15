import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defaultRangeExtractor, observeElementOffset, useVirtualizer } from '@tanstack/react-virtual';
import { TrackTable, type TrackTableProps } from '../../components/TrackTable/TrackTable.component';
import { ErrorNotice } from '../../components/Shared';
import './VirtualSongs.styles.css';

const ROW_HEIGHT = 56;
export function VirtualSongs({ total, hasNext, fetching, nextError, loadNext, ...table }: TrackTableProps & {
  total: number; hasNext: boolean; fetching: boolean; nextError: unknown; loadNext: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [paddingEnd, setPaddingEnd] = useState(140);
  const [offset, setOffset] = useState(0);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const focusedIndex = table.rows.findIndex(row => row.key === focusedKey);
  const getScrollElement = useCallback(() => root.current?.closest<HTMLElement>('.main-content') ?? null, []);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: table.rows.length,
    getScrollElement,
    scrollPaddingEnd: paddingEnd,
    observeElementOffset: (instance, callback) => {
      callback(instance.scrollElement?.scrollTop ?? 0, false);
      return observeElementOffset(instance, callback);
    },
    estimateSize: () => ROW_HEIGHT,
    scrollMargin: offset,
    scrollPaddingStart: 48,
    overscan: 6,
    rangeExtractor: range => {
      const indices = defaultRangeExtractor(range);
      if (focusedIndex >= 0) for (let index = Math.max(0, focusedIndex - 1); index <= Math.min(range.count - 1, focusedIndex + 1); index++) indices.push(index);
      return [...new Set(indices)].sort((a, b) => a - b);
    },
  });
  useLayoutEffect(() => {
    const node = root.current;
    const scroll = getScrollElement();
    if (!node || !scroll) return;
    const measure = () => {
      setPaddingEnd(Number.parseFloat(getComputedStyle(scroll).scrollPaddingBottom) || 140);
      const body = node.querySelector('tbody');
      if (body) setOffset(body.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(scroll);
    if (node.closest('.page-content')) observer.observe(node.closest('.page-content')!);
    measure();
    return () => observer.disconnect();
  }, [getScrollElement]);
  const visible = virtualizer.getVirtualItems();
  const lastVisible = visible.filter(row => row.start + row.size >= (virtualizer.scrollOffset ?? 0) && row.start <= (virtualizer.scrollOffset ?? 0) + (virtualizer.scrollRect?.height ?? 0)).at(-1)?.index ?? -1;
  useEffect(() => {
    if (hasNext && !fetching && !nextError && lastVisible >= table.rows.length - 12) loadNext();
  }, [hasNext, fetching, nextError, lastVisible, table.rows.length, loadNext]);
  function focusRow(index: number) {
    setFocusedKey(table.rows[index].key);
    virtualizer.scrollToIndex(index, { align: 'auto' });
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-track-index="${index}"]`)?.focus({ preventScroll: true }));
  }
  return <div ref={root} className="virtual-songs" onFocusCapture={event => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-track-key]');
    if (row) setFocusedKey(row.dataset.trackKey ?? null);
  }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusedKey(null); }}>
    <TrackTable {...table} rowWindow={{ indices: visible.map(row => row.index), rowHeight: ROW_HEIGHT, focusRow }} />
    <div className="song-load-status"><span>{table.rows.length.toLocaleString()} of {total.toLocaleString()} songs loaded</span>{fetching && <span role="status">Loading songs…</span>}{nextError ? <ErrorNotice error={nextError} retry={loadNext} /> : hasNext && !fetching && <button onClick={loadNext}>Load more songs</button>}</div>
  </div>;
}
