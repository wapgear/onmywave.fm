import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defaultRangeExtractor, observeElementOffset, useVirtualizer } from '@tanstack/react-virtual';
import { TrackTable, type TrackTableProps } from '../../components/TrackTable/TrackTable.component';
import { ErrorNotice } from '../../components/Shared';
import { useRetryFocus } from '../../useRetryFocus';
import './VirtualSongs.styles.css';

const ROW_HEIGHT = 56;
export function VirtualSongs({ total, hasNext, fetching, nextError, loadNext, retryEligible = true, onResultsElement, ...table }: TrackTableProps & {
  total: number; hasNext: boolean; fetching: boolean; nextError: unknown; loadNext: () => Promise<{ isError: boolean }>; retryEligible?: boolean; onResultsElement?: (node: HTMLDivElement | null) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLSpanElement>(null);
  const retryFocus = useRetryFocus({ ownerKey: 'songs-next-page', target: () => status.current, canFocusSuccess: () => retryEligible });
  const [paddingEnd, setPaddingEnd] = useState(140);
  const [offset, setOffset] = useState(0);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [recoveryIndex, setRecoveryIndex] = useState<number | null>(null);
  const recoveryToken = useRef(0);
  const focusFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(focusFrame.current), []);
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
      if (recoveryIndex !== null && recoveryIndex < range.count) indices.push(recoveryIndex);
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
    if (hasNext && !fetching && !nextError && lastVisible >= table.rows.length - 12) void loadNext();
  }, [hasNext, fetching, nextError, lastVisible, table.rows.length, loadNext]);
  function focusRow(index: number) {
    cancelAnimationFrame(focusFrame.current);
    const key = table.rows[index]?.key;
    if (!key) return;
    const origin = document.activeElement;
    const target = () => root.current?.querySelector<HTMLElement>(`[data-track-index="${index}"]`);
    setFocusedKey(key);
    virtualizer.scrollToIndex(index, { align: 'auto' });
    const mounted = target();
    if (mounted?.dataset.trackKey === key) mounted.focus({ preventScroll: true });
    else focusFrame.current = requestAnimationFrame(() => {
      const row = target();
      if (origin?.isConnected && document.activeElement === origin && row?.dataset.trackKey === key) row.focus({ preventScroll: true });
    });
  }
  function retryNextPage() {
    const button = retryFocus.retryRef.current;
    if (document.activeElement !== button) return loadNext();
    const startIndex = table.rows.length;
    const token = ++recoveryToken.current;
    setRecoveryIndex(startIndex);
    return retryFocus.retry(() => {
      const request = loadNext();
      void request.then(result => { if (result.isError && recoveryToken.current === token) setRecoveryIndex(null); }, () => { if (recoveryToken.current === token) setRecoveryIndex(null); });
      return request;
    }, () => {
      const appended = root.current?.querySelector<HTMLElement>(`[data-track-index="${startIndex}"]`);
      const container = root.current?.closest<HTMLElement>('.main-content');
      const viewport = container?.getBoundingClientRect();
      const bottomPadding = container ? Number.parseFloat(getComputedStyle(container).scrollPaddingBottom) || 0 : 0;
      const retained = [...(root.current?.querySelectorAll<HTMLElement>('[data-track-index]') ?? [])].find(row => {
        if (!viewport) return true;
        const rect = row.getBoundingClientRect();
        return rect.bottom > viewport.top && rect.top < viewport.bottom - bottomPadding;
      });
      const target = appended ?? retained ?? status.current;
      target?.scrollIntoView({ block: 'nearest' });
      return target;
    }, () => { if (recoveryToken.current === token) setRecoveryIndex(null); });
  }
  return <div ref={node => { root.current = node; onResultsElement?.(node); }} className="virtual-songs" onFocusCapture={event => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-track-key]');
    if (row) setFocusedKey(row.dataset.trackKey ?? null);
  }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusedKey(null); }}>
    <TrackTable {...table} rowWindow={{ indices: visible.map(row => row.index), rowHeight: ROW_HEIGHT, focusRow }} />
    <div className="song-load-status"><span ref={status} tabIndex={-1}>{table.rows.length.toLocaleString()} of {total.toLocaleString()} songs loaded</span>{fetching && <span role="status">Loading songs…</span>}{nextError ? <ErrorNotice error={nextError} retryRef={retryFocus.retryRef} retrying={fetching} retry={retryNextPage} /> : hasNext && !fetching && <button onClick={() => void loadNext()}>Load more songs</button>}</div>
  </div>;
}
