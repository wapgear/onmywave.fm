import { defaultRangeExtractor, observeElementOffset, useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, GripVertical, ListMusic, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

import { usePlayer } from '../../player';
import type { QueueEntry } from '../../player.types';
import { IconButton } from '../IconButton/IconButton.component';
import { Artwork, TrackDuration } from '../Shared';

const ROW_HEIGHT = 54;

type QueueRow = QueueEntry & { historyIndex?: number };

const rowId = (item: QueueRow) => item.upcomingId ?? `${item.key}:${item.historyIndex ?? ''}`;

function QueueRows({
  items,
  listId,
  history = false,
  reorderable = false,
  currentKey,
  sessionId,
  fallback,
  remove,
  play,
  moveUpcoming,
}: {
  items: QueueRow[];
  listId: string;
  history?: boolean;
  reorderable?: boolean;
  currentKey?: string;
  sessionId?: number;
  fallback: React.RefObject<HTMLElement | null>;
  remove: (item: QueueRow, upcomingId?: string) => void;
  play: (item: QueueRow, trigger: HTMLButtonElement) => void;
  moveUpcoming?: (fromId: string, beforeId: string | null) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const [offset, setOffset] = useState(0);
  const [paddingEnd, setPaddingEnd] = useState(140);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [recoveryIndex, setRecoveryIndex] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null | undefined>(undefined);
  const [announcement, setAnnouncement] = useState('');
  const pendingFocus = useRef<{ key: string; action: 'play' | 'remove'; origin: HTMLElement } | null>(null);
  const focusFrame = useRef(0);
  const drag = useRef<{
    pointerId: number;
    id: string;
    startY: number;
    pointerY: number;
    beforeId: string | null;
    currentKey?: string;
    sessionId?: number;
    active: boolean;
  } | null>(null);
  const dragFrame = useRef(0);
  const focusedIndex = items.findIndex((item) => rowId(item) === focusedId);
  const dragState = drag.current;
  const activeDrag =
    dragState && dragState.currentKey === currentKey && dragState.sessionId === sessionId ? dragState : null;
  const activeDraggedId = activeDrag?.active ? draggedId : null;
  const activeDropBeforeId = activeDrag?.active ? dropBeforeId : undefined;
  const draggedIndex = items.findIndex((item) => rowId(item) === activeDraggedId);

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
    getItemKey: (index) => (items[index] ? rowId(items[index]) : index),
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (focusedIndex >= 0) indexes.push(focusedIndex);
      if (draggedIndex >= 0) indexes.push(draggedIndex);
      if (recoveryIndex !== null && recoveryIndex < range.count) indexes.push(recoveryIndex);
      return [...new Set(indexes)].sort((a, b) => a - b);
    },
  });

  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
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

  useEffect(
    () => () => {
      cancelAnimationFrame(focusFrame.current);
      cancelAnimationFrame(dragFrame.current);
      drag.current = null;
    },
    [],
  );

  function clearDrag() {
    cancelAnimationFrame(dragFrame.current);
    drag.current = null;
    setDraggedId(null);
    setDropBeforeId(undefined);
  }

  useEffect(() => {
    if (drag.current && (drag.current.currentKey !== currentKey || drag.current.sessionId !== sessionId)) {
      cancelAnimationFrame(dragFrame.current);
      drag.current = null;
    }
  }, [currentKey, sessionId]);

  function updateDropTarget(clientY: number) {
    const active = drag.current;
    if (!active) return;
    if (active.currentKey !== currentKey || active.sessionId !== sessionId) return;
    const rows = [...(list.current?.querySelectorAll<HTMLLIElement>('[data-upcoming-id]') ?? [])];
    const hit = rows.find((element) => {
      const rect = element.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    });
    let beforeId: string | null;
    if (hit?.dataset.upcomingId === active.id) beforeId = active.id;
    else {
      const target = rows.find((element) => {
        if (element.dataset.upcomingId === active.id) return false;
        return clientY < element.getBoundingClientRect().top + ROW_HEIGHT / 2;
      });
      beforeId = target?.dataset.upcomingId ?? null;
    }
    if (active.currentKey === currentKey) active.beforeId = beforeId;
    setDropBeforeId(beforeId);
  }

  function autoScroll() {
    const active = drag.current;
    const scroll = getScrollElement();
    if (!active?.active || active.currentKey !== currentKey || active.sessionId !== sessionId || !scroll) {
      if (active && (active.currentKey !== currentKey || active.sessionId !== sessionId)) clearDrag();
      return;
    }
    const rect = scroll.getBoundingClientRect();
    const edge = 42;
    const distanceTop = active.pointerY - rect.top;
    const distanceBottom = rect.bottom - active.pointerY;
    if (distanceTop < edge) scroll.scrollTop -= Math.min(18, Math.max(2, Math.round((edge - distanceTop) / 3)));
    else if (distanceBottom < edge)
      scroll.scrollTop += Math.min(18, Math.max(2, Math.round((edge - distanceBottom) / 3)));
    updateDropTarget(active.pointerY);
    dragFrame.current = requestAnimationFrame(autoScroll);
  }

  function moveToIndex(fromIndex: number, destinationIndex: number) {
    if (!reorderable || !moveUpcoming || fromIndex < 0 || fromIndex >= items.length) return;
    const toIndex = Math.max(0, Math.min(items.length - 1, destinationIndex));
    if (fromIndex === toIndex) return;
    const item = items[fromIndex];
    const insertionId =
      toIndex < fromIndex ? rowId(items[toIndex]) : toIndex + 1 < items.length ? rowId(items[toIndex + 1]) : null;
    moveUpcoming(rowId(item), insertionId);
    setAnnouncement(`${item.song.name} moved to position ${toIndex + 1} of ${items.length}.`);
  }

  function reorderKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const destination =
      event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index + (event.key === 'ArrowUp' ? -1 : 1);
    moveToIndex(index, destination);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, item: QueueRow) {
    if (!reorderable || event.button !== 0 || !item.upcomingId) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      id: item.upcomingId,
      startY: event.clientY,
      pointerY: event.clientY,
      beforeId: item.upcomingId,
      currentKey,
      sessionId,
      active: false,
    };
  }

  function dragPointerMove(event: PointerEvent<HTMLOListElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.pointerY = event.clientY;
    if (!active.active && Math.abs(event.clientY - active.startY) < 5) return;
    if (!active.active) {
      active.active = true;
      setDraggedId(active.id);
      dragFrame.current = requestAnimationFrame(autoScroll);
    }
    updateDropTarget(event.clientY);
  }

  function finishDrag(event: PointerEvent<HTMLOListElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    updateDropTarget(event.clientY);
    const { id, beforeId, currentKey: startingKey, sessionId: startingSession } = active;
    const fromIndex = items.findIndex((item) => rowId(item) === id);
    const beforeIndex = beforeId === null ? items.length : items.findIndex((item) => rowId(item) === beforeId);
    const finalIndex = beforeIndex > fromIndex ? beforeIndex - 1 : beforeIndex;
    const valid =
      active.active &&
      startingKey === currentKey &&
      startingSession === sessionId &&
      fromIndex >= 0 &&
      beforeIndex >= 0 &&
      beforeId !== id &&
      finalIndex !== fromIndex;
    clearDrag();
    if (valid && moveUpcoming) {
      moveUpcoming(id, beforeId);
      const item = items[fromIndex];
      setAnnouncement(`${item.song.name} moved to position ${finalIndex + 1} of ${items.length}.`);
    }
  }

  function cancelPointerDrag(event: PointerEvent<HTMLOListElement>) {
    if (drag.current?.pointerId === event.pointerId) clearDrag();
  }

  function cancelKeyboardDrag(event: KeyboardEvent<HTMLOListElement>) {
    if (event.key !== 'Escape' || !drag.current) return;
    event.preventDefault();
    clearDrag();
  }

  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const index = items.findIndex((item) => rowId(item) === pending.key);
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
      remove(item, item.upcomingId);
      return;
    }
    const targetIndex = index < items.length - 1 ? index : index - 1;
    const target = items[index < items.length - 1 ? index + 1 : index - 1];
    pendingFocus.current = target
      ? { key: rowId(target), action, origin: document.activeElement as HTMLElement }
      : null;
    setRecoveryIndex(target ? targetIndex : null);
    remove(item, item.upcomingId);
    if (!target) {
      cancelAnimationFrame(focusFrame.current);
      focusFrame.current = requestAnimationFrame(() => {
        if (document.activeElement === document.body) fallback.current?.focus({ preventScroll: true });
      });
    }
  }

  return (
    <>
      <ol
        ref={list}
        className="queue-list queue-virtual-list"
        data-queue-list={listId}
        data-drop-at-end={activeDropBeforeId === null ? 'true' : undefined}
        style={{ height: virtualizer.getTotalSize() }}
        onFocusCapture={(event) => {
          const row = (event.target as HTMLElement).closest<HTMLElement>('[data-queue-index]');
          if (row) setFocusedId(row.dataset.queueKey ?? null);
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocusedId(null);
        }}
        onPointerMove={dragPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={cancelPointerDrag}
        onKeyDownCapture={cancelKeyboardDrag}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];

          return (
            <li
              key={rowId(item)}
              data-queue-index={virtualRow.index}
              data-queue-key={rowId(item)}
              data-upcoming-id={item.upcomingId}
              data-drop-before={activeDropBeforeId === item.upcomingId ? 'true' : undefined}
              aria-posinset={virtualRow.index + 1}
              aria-setsize={items.length}
              className={`${history ? 'queue-history-row' : ''} ${activeDraggedId === item.upcomingId ? 'queue-row-dragging' : ''}`.trim()}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: ROW_HEIGHT,
                transform: `translateY(${virtualRow.start - offset}px)`,
              }}
            >
              {reorderable && item.upcomingId && (
                <span className="queue-row-actions">
                  <button
                    type="button"
                    className="queue-drag-handle"
                    aria-label={`Reorder ${item.song.name}`}
                    aria-describedby="queue-reorder-help"
                    title="Drag, or focus and use Up, Down, Home or End"
                    onPointerDown={(event) => startDrag(event, item)}
                    onKeyDown={(event) => reorderKeyDown(event, virtualRow.index)}
                  >
                    <GripVertical size={14} aria-hidden="true" />
                  </button>
                  <IconButton
                    className="queue-move queue-move-up"
                    variant="compact"
                    label={`Move ${item.song.name} up`}
                    disabled={virtualRow.index === 0}
                    onClick={() => moveToIndex(virtualRow.index, virtualRow.index - 1)}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    className="queue-move queue-move-down"
                    variant="compact"
                    label={`Move ${item.song.name} down`}
                    disabled={virtualRow.index === items.length - 1}
                    onClick={() => moveToIndex(virtualRow.index, virtualRow.index + 1)}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </IconButton>
                </span>
              )}
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
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </>
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
  remove: (item: QueueRow, upcomingId?: string) => void;
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
  const selectionFocus = useRef<{ key: string; id: string; history: boolean; origin: HTMLButtonElement } | null>(null);
  const index = player.queue.findIndex((item) => item.key === player.currentKey);
  const current = player.queue[index];
  const remaining = Math.max(0, player.queue.length - (player.shuffle ? 1 : index + 1));
  const upcoming = player.shuffle ? player.upcomingQueue : player.queue.slice(index + 1);
  const history = player.shuffle ? player.shuffleHistoryQueue : player.queue.slice(0, index);
  const remove = (item: QueueRow, upcomingId?: string) => player.removeQueue(item.key, upcomingId);
  const play = (item: QueueRow, trigger: HTMLButtonElement) => {
    if (document.activeElement === trigger)
      selectionFocus.current = {
        key: item.key,
        id: rowId(item),
        history: item.historyIndex !== undefined,
        origin: trigger,
      };
    player.playQueueEntry(item.key, item.historyIndex, item.upcomingId);
  };

  useLayoutEffect(() => {
    const selection = selectionFocus.current;
    if (!selection || player.currentKey !== selection.key) return;
    const remainsInSection = selection.history
      ? history.some((item) => rowId(item) === selection.id)
      : upcoming.some((item) => rowId(item) === selection.id);
    if (remainsInSection) return;
    if (!selection.origin.isConnected && document.activeElement === document.body)
      nowPlayingButton.current?.focus({ preventScroll: true });
    selectionFocus.current = null;
  }, [player.currentKey, history, upcoming]);

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
            {upcoming.length > 0 && (
              <p className="queue-reorder-help" id="queue-reorder-help">
                Drag a grip, or focus it and use Up, Down, Home or End.
              </p>
            )}
            {player.shuffle && upcoming.length > 0 && (
              <p className="queue-end">
                Showing the next {upcoming.length} of {player.shuffleRemaining} queued songs in shuffle order.
              </p>
            )}
            {upcoming.length ? (
              <QueueRows
                items={upcoming}
                listId="upcoming"
                reorderable
                currentKey={player.currentKey}
                sessionId={player.queueSession}
                fallback={queueHeading}
                remove={remove}
                play={play}
                moveUpcoming={player.moveUpcoming}
              />
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
