import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';

import type { QueueEntry } from '../../../player.types';

export const QUEUE_ROW_HEIGHT = 54;

type DragPreview = {
  id: string;
  top: number;
  left: number;
  width: number;
  index: number;
  currentKey?: string;
  sessionId?: number;
};

type PointerDrag = {
  pointerId: number;
  id: string;
  startX: number;
  startY: number;
  pointerX: number;
  pointerY: number;
  grabX: number;
  grabY: number;
  width: number;
  capture: HTMLElement;
  active: boolean;
  currentKey?: string;
  sessionId?: number;
};

export function useQueueReorder({
  items,
  enabled,
  currentKey,
  sessionId,
  getListElement,
  getScrollElement,
  moveUpcoming,
}: {
  items: QueueEntry[];
  enabled: boolean;
  currentKey?: string;
  sessionId?: number;
  getListElement: () => HTMLOListElement | null;
  getScrollElement: () => HTMLElement | null;
  moveUpcoming?: (fromId: string, beforeId: string | null) => void;
}) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const drag = useRef<PointerDrag | null>(null);
  const frame = useRef(0);
  const suppressClick = useRef(false);
  const live = useRef({ items, currentKey, sessionId });

  const clearDrag = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const active = drag.current;
    drag.current = null;
    if (active?.capture.hasPointerCapture(active.pointerId)) active.capture.releasePointerCapture(active.pointerId);
    setPreview(null);
  }, []);

  useLayoutEffect(() => {
    live.current = { items, currentKey, sessionId };
    const active = drag.current;
    if (
      active &&
      (!enabled ||
        active.currentKey !== currentKey ||
        active.sessionId !== sessionId ||
        !items.some((item) => item.upcomingId === active.id))
    )
      clearDrag();
  }, [items, enabled, currentKey, sessionId, clearDrag]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      drag.current = null;
    },
    [],
  );

  function targetIndex(active: PointerDrag) {
    const node = getListElement();
    if (!node) return 0;
    // Use the list's fixed slots, not the moving rows, so the target cannot oscillate.
    return Math.max(
      0,
      Math.min(
        live.current.items.length - 1,
        Math.round((active.pointerY - active.grabY - node.getBoundingClientRect().top) / QUEUE_ROW_HEIGHT),
      ),
    );
  }

  function updatePreview(active: PointerDrag) {
    const next = {
      id: active.id,
      top: active.pointerY - active.grabY,
      left: active.pointerX - active.grabX,
      width: active.width,
      index: targetIndex(active),
      currentKey: active.currentKey,
      sessionId: active.sessionId,
    };
    setPreview((previous) =>
      previous && previous.top === next.top && previous.left === next.left && previous.index === next.index
        ? previous
        : next,
    );
  }

  function autoScroll() {
    const active = drag.current;
    const scroll = getScrollElement();
    if (!active?.active || !scroll) return;
    const rect = scroll.getBoundingClientRect();
    const top = active.pointerY - rect.top;
    const bottom = rect.bottom - active.pointerY;
    if (active.pointerX >= rect.left && active.pointerX <= rect.right) {
      if (top < 42) scroll.scrollTop -= Math.min(18, Math.max(2, Math.round((42 - top) / 3)));
      else if (bottom < 42) scroll.scrollTop += Math.min(18, Math.max(2, Math.round((42 - bottom) / 3)));
    }
    updatePreview(active);
    frame.current = requestAnimationFrame(autoScroll);
  }

  function startDrag(event: PointerEvent<HTMLLIElement>, item: QueueEntry) {
    if (!enabled || !item.upcomingId || event.button !== 0 || !event.isPrimary || drag.current) return;
    if ((event.target as HTMLElement).closest('.queue-remove')) return;
    const capture = (event.target as HTMLElement).closest<HTMLButtonElement>('.queue-play') ?? event.currentTarget;
    capture.setPointerCapture(event.pointerId);
    suppressClick.current = false;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = {
      id: item.upcomingId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      width: rect.width,
      capture,
      active: false,
      currentKey,
      sessionId,
    };
  }

  function pointerMove(event: PointerEvent<HTMLOListElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.pointerX = event.clientX;
    active.pointerY = event.clientY;
    if (!active.active) {
      if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 5) return;
      active.active = true;
      suppressClick.current = true;
      const node = getListElement();
      if (!node) {
        clearDrag();
        return;
      }
      active.capture = node;
      node.setPointerCapture(event.pointerId);
      updatePreview(active);
      frame.current = requestAnimationFrame(autoScroll);
    }
    event.preventDefault();
  }

  function moveToIndex(id: string, index: number) {
    const from = items.findIndex((item) => item.upcomingId === id);
    if (!enabled || !moveUpcoming || from < 0 || from === index) return;
    const remaining = items.filter((item) => item.upcomingId !== id);
    const beforeId = remaining[index]?.upcomingId ?? null;
    moveUpcoming(id, beforeId);
    setAnnouncement(`${items[from].song.name} moved to position ${index + 1} of ${items.length}.`);
  }

  function pointerUp(event: PointerEvent<HTMLOListElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.pointerX = event.clientX;
    active.pointerY = event.clientY;
    const rect = getScrollElement()?.getBoundingClientRect();
    const inside =
      rect &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    const valid = active.active && active.currentKey === currentKey && active.sessionId === sessionId && inside;
    const index = targetIndex(active);
    clearDrag();
    if (valid) moveToIndex(active.id, index);
  }

  function pointerCancel(event: PointerEvent<HTMLOListElement>) {
    if (drag.current?.pointerId === event.pointerId) clearDrag();
  }

  function cancelKeyDown(event: KeyboardEvent<HTMLOListElement>) {
    if (event.key !== 'Escape' || !drag.current) return;
    event.preventDefault();
    setAnnouncement('Queue reordering canceled.');
    clearDrag();
  }

  function preventDragClick(event: MouseEvent<HTMLButtonElement>) {
    if (!suppressClick.current || event.detail === 0) return false;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function reorderKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!enabled || !event.altKey || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return false;
    event.preventDefault();
    const id = items[index]?.upcomingId;
    const destination =
      event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index + (event.key === 'ArrowUp' ? -1 : 1);
    if (id) moveToIndex(id, Math.max(0, Math.min(items.length - 1, destination)));
    return true;
  }

  const activePreview =
    preview &&
    preview.currentKey === currentKey &&
    preview.sessionId === sessionId &&
    items.some((item) => item.upcomingId === preview.id)
      ? preview
      : null;
  return {
    preview: activePreview,
    announcement,
    startDrag,
    pointerMove,
    pointerUp,
    pointerCancel,
    cancelKeyDown,
    preventDragClick,
    reorderKeyDown,
  };
}
