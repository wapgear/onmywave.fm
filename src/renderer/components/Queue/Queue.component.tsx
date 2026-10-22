import { defaultRangeExtractor, observeElementOffset, useVirtualizer } from '@tanstack/react-virtual';
import { ListMusic, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { usePlayer } from '../../player';
import type { QueueEntry } from '../../player.types';
import { IconButton } from '../IconButton/IconButton.component';
import { Artwork, TrackDuration } from '../Shared';

const ROW_HEIGHT = 54;

type QueueRow = QueueEntry & { historyIndex?: number };

function QueueRows({
  items,
  listId,
  history = false,
  fallback,
  remove,
  play,
}: {
  items: QueueRow[];
  listId: string;
  history?: boolean;
  fallback: React.RefObject<HTMLElement | null>;
  remove: (item: QueueRow) => void;
  play: (item: QueueRow, trigger: HTMLButtonElement) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const [offset, setOffset] = useState(0);
  const [paddingEnd, setPaddingEnd] = useState(140);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [recoveryIndex, setRecoveryIndex] = useState<number | null>(null);
  const pendingFocus = useRef<{ key: string; action: 'play' | 'remove'; origin: HTMLElement } | null>(null);
  const focusFrame = useRef(0);
  const focusedIndex = items.findIndex((item) => `${item.key}:${item.historyIndex ?? ''}` === focusedKey);

  const getScrollElement = useCallback(() => list.current?.closest<HTMLElement>('.drawer-body') ?? null, []);

  // TanStack Virtual mutates its instance during render.
  // oxlint-disable-next-line hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    scrollPaddingStart: 16,
    scrollPaddingEnd: paddingEnd,
    observeElementOffset: (instance, callback) => {
      callback(instance.scrollElement?.scrollTop ?? 0, false);
      return observeElementOffset(instance, callback);
    },
    estimateSize: () => ROW_HEIGHT,
    scrollMargin: offset,
    overscan: 6,
    getItemKey: (index) => `${items[index]?.key}:${items[index]?.historyIndex ?? ''}`,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (focusedIndex >= 0) indexes.push(focusedIndex);
      if (recoveryIndex !== null && recoveryIndex < range.count) indexes.push(recoveryIndex);
      return [...new Set(indexes)].sort((a, b) => a - b);
    },
  });

  function navigate(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const row = event.currentTarget.closest<HTMLElement>('[data-queue-index]');
    if (!row) return;
    const index = Number(row.dataset.queueIndex);
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1);
    if (next < 0 || next >= items.length) return;
    event.preventDefault();
    focusRow(next, event.currentTarget.classList.contains('queue-remove') ? 'remove' : 'play');
  }

  useLayoutEffect(() => {
    const node = list.current;
    const scroll = getScrollElement();
    if (!node || !scroll) return;
    const measure = () => {
      setOffset(node.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop);
      setPaddingEnd(Number.parseFloat(getComputedStyle(scroll).scrollPaddingBottom) || 140);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(scroll);
    const content = node.closest('.queue-content');
    if (content) observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [getScrollElement, items.length]);

  useEffect(() => () => cancelAnimationFrame(focusFrame.current), []);

  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const index = items.findIndex((item) => `${item.key}:${item.historyIndex ?? ''}` === pending.key);
    if (index < 0) {
      pendingFocus.current = null;
      setRecoveryIndex(null);
      fallback.current?.focus({ preventScroll: true });
      return;
    }
    virtualizer.scrollToIndex(index, { align: 'auto' });
    const target = () =>
      list.current?.querySelector<HTMLButtonElement>(`[data-queue-index="${index}"] .queue-${pending.action}`);
    focusFrame.current = requestAnimationFrame(() => {
      if (document.activeElement === pending.origin || document.activeElement === document.body)
        target()?.focus({ preventScroll: true });
      pendingFocus.current = null;
      setRecoveryIndex(null);
    });
  }, [items, fallback, virtualizer]);

  function focusRow(index: number, action: 'play' | 'remove') {
    if (index < 0 || index >= items.length) return;
    const origin = document.activeElement;
    cancelAnimationFrame(focusFrame.current);
    setRecoveryIndex(index);
    virtualizer.scrollToIndex(index, { align: 'auto' });
    focusFrame.current = requestAnimationFrame(() => {
      if (document.activeElement === origin) {
        list.current?.querySelector<HTMLButtonElement>(`[data-queue-index="${index}"] .queue-${action}`)?.focus();
      }
      setRecoveryIndex((current) => (current === index ? null : current));
    });
  }

  function removeRow(item: QueueRow, index: number) {
    const action = 'remove';
    if (document.activeElement !== list.current?.querySelector(`[data-queue-index="${index}"] .queue-${action}`)) {
      remove(item);
      return;
    }
    const targetIndex = index < items.length - 1 ? index : index - 1;
    const target = items[index < items.length - 1 ? index + 1 : index - 1];
    pendingFocus.current = target
      ? { key: `${target.key}:${target.historyIndex ?? ''}`, action, origin: document.activeElement as HTMLElement }
      : null;
    setRecoveryIndex(target ? targetIndex : null);
    remove(item);
    if (!target) {
      cancelAnimationFrame(focusFrame.current);
      focusFrame.current = requestAnimationFrame(() => {
        if (document.activeElement === document.body) fallback.current?.focus({ preventScroll: true });
      });
    }
  }

  return (
    <ol
      ref={list}
      className="queue-list queue-virtual-list"
      data-queue-list={listId}
      style={{ height: virtualizer.getTotalSize() }}
      onFocusCapture={(event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-queue-index]');
        if (row) setFocusedKey(row.dataset.queueKey ?? null);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedKey(null);
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const item = items[virtualRow.index];
        const key = `${item.key}:${item.historyIndex ?? ''}`;

        return (
          <li
            key={key}
            data-queue-index={virtualRow.index}
            data-queue-key={key}
            aria-posinset={virtualRow.index + 1}
            aria-setsize={items.length}
            className={history ? 'queue-history-row' : undefined}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: ROW_HEIGHT,
              transform: `translateY(${virtualRow.start - offset}px)`,
            }}
          >
            <button
              className="queue-track queue-play"
              onClick={(event) => play(item, event.currentTarget)}
              onKeyDown={navigate}
              aria-label={`Play ${item.song.name}`}
            >
              <Artwork url={item.song.imageUrl} name={item.song.name} />
              <span>
                <strong>{item.song.name}</strong>
                <small>{item.song.artists.join(', ') || 'Unknown artist'}</small>
              </span>
            </button>
            <span className="queue-time">
              <TrackDuration seconds={item.song.duration} />
            </span>
            <IconButton
              className="queue-remove"
              variant="compact"
              label={`Remove ${item.song.name} from queue`}
              onClick={() => removeRow(item, virtualRow.index)}
              onKeyDown={navigate}
            >
              <X size={14} aria-hidden="true" />
            </IconButton>
          </li>
        );
      })}
    </ol>
  );
}

function QueueHistory({
  items,
  shuffle,
  fallback,
  remove,
  play,
}: {
  items: QueueRow[];
  shuffle: boolean;
  fallback: React.RefObject<HTMLElement | null>;
  remove: (item: QueueRow) => void;
  play: (item: QueueRow, trigger: HTMLButtonElement) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <details className="queue-history" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        {shuffle ? `Played earlier in this shuffle · ${items.length}` : `Earlier in this queue · ${items.length}`}
      </summary>
      {open && <QueueRows items={items} listId="history" history fallback={fallback} remove={remove} play={play} />}
    </details>
  );
}

export function Queue() {
  const player = usePlayer();
  const queueHeading = useRef<HTMLHeadingElement>(null);
  const nowPlayingButton = useRef<HTMLButtonElement>(null);
  const selectionFocus = useRef<{ key: string; origin: HTMLButtonElement } | null>(null);
  const index = player.queue.findIndex((item) => item.key === player.currentKey);
  const current = player.queue[index];
  const remaining = Math.max(0, player.queue.length - (player.shuffle ? 1 : index + 1));
  const upcoming = player.shuffle ? player.upcomingQueue : player.queue.slice(index + 1);
  const history = player.shuffle ? player.shuffleHistoryQueue : player.queue.slice(0, index);
  const remove = (item: QueueRow) => player.removeQueue(item.key);
  const play = (item: QueueRow, trigger: HTMLButtonElement) => {
    if (document.activeElement === trigger) selectionFocus.current = { key: item.key, origin: trigger };
    player.playQueueEntry(item.key, item.historyIndex);
  };

  useLayoutEffect(() => {
    const selection = selectionFocus.current;
    if (!selection || player.currentKey !== selection.key) return;
    if (!selection.origin.isConnected && document.activeElement === document.body)
      nowPlayingButton.current?.focus({ preventScroll: true });
    selectionFocus.current = null;
  }, [player.currentKey]);

  return (
    <div className="queue-content">
      {!player.queue.length ? (
        <div className="drawer-empty">
          <ListMusic size={30} strokeWidth={1.4} />
          <h3>Your queue is empty</h3>
          <p>Play a song or add music to the queue.</p>
        </div>
      ) : (
        <>
          {current && (
            <section className="queue-now">
              <h3>Now Playing</h3>
              <button
                ref={nowPlayingButton}
                className="queue-track"
                onClick={player.toggle}
                aria-label={`${player.requestedPlaying ? 'Pause' : 'Play'} ${current.song.name}`}
              >
                <Artwork url={current.song.imageUrl} name={current.song.name} />
                <span>
                  <strong>{current.song.name}</strong>
                  <small>{current.song.artists.join(', ') || 'Unknown artist'}</small>
                </span>
              </button>
            </section>
          )}
          <section>
            <div className="queue-section-title">
              <h3 ref={queueHeading} tabIndex={-1}>
                Up Next
              </h3>
              {player.shuffle ? (
                <span>
                  {player.upcomingQueue.length} planned · {player.shuffleRemaining} left
                </span>
              ) : (
                <span>
                  {remaining} {remaining === 1 ? 'song' : 'songs'}
                </span>
              )}
            </div>
            {player.shuffle && upcoming.length > 0 && (
              <p className="queue-end">
                Showing the next {upcoming.length} of {player.shuffleRemaining} queued songs in shuffle order.
              </p>
            )}
            {upcoming.length ? (
              <QueueRows items={upcoming} listId="upcoming" fallback={queueHeading} remove={remove} play={play} />
            ) : (
              <p className="queue-end">
                {player.shuffle && player.repeat === 'all' && player.shuffleRemaining === 0
                  ? 'The shuffle cycle is complete. Next starts a new cycle.'
                  : 'You’ve reached the end of the queue.'}
              </p>
            )}
          </section>
          {history.length > 0 && (
            <QueueHistory
              items={history}
              shuffle={player.shuffle}
              fallback={queueHeading}
              remove={remove}
              play={play}
            />
          )}
        </>
      )}
    </div>
  );
}
