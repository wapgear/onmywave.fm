import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

const minimum = 64;

const maximum = 208;

const compactThreshold = 160;

const storageKey = 'wave:sidebar';

function clamp(width: number) {
  return Math.min(maximum, Math.max(minimum, Math.round(width)));
}

function initialSize() {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (saved && typeof saved === 'object' && 'width' in saved && 'expandedWidth' in saved) {
      const { width, expandedWidth } = saved;
      if (
        typeof width === 'number' &&
        Number.isFinite(width) &&
        typeof expandedWidth === 'number' &&
        Number.isFinite(expandedWidth)
      )
        return { width: clamp(width), expandedWidth: Math.max(compactThreshold, clamp(expandedWidth)) };
    }
  } catch {
    // Resizing remains available when browser storage is unavailable.
  }
  return { width: maximum, expandedWidth: maximum };
}

export function useSidebarWidth() {
  const [size, setSize] = useState(initialSize);
  const [resizing, setResizing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const compact = size.width < compactThreshold;

  function resize(width: number) {
    const next = clamp(width);
    setSize((current) => ({ width: next, expandedWidth: next >= compactThreshold ? next : current.expandedWidth }));
  }

  function toggle() {
    setSize((current) => ({ ...current, width: compact ? current.expandedWidth : minimum }));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, width: size.width };
    setResizing(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    resize(drag.current.width + event.clientX - drag.current.x);
  }

  function finishResize(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setResizing(false);
    setHovered(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 24 : 8;
    const width = { ArrowLeft: size.width - step, ArrowRight: size.width + step, Home: minimum, End: maximum }[
      event.key
    ];
    if (width === undefined) return;
    event.preventDefault();
    resize(width);
  }

  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--sidebar', `${size.width}px`);
    return () => {
      document.documentElement.style.removeProperty('--sidebar');
    };
  }, [size.width]);

  useEffect(() => {
    document.documentElement.classList.toggle('is-resizing-navigation', resizing);
    return () => document.documentElement.classList.remove('is-resizing-navigation');
  }, [resizing]);

  useEffect(() => {
    if (resizing) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(size));
    } catch {
      // Keep the current size for this session if it cannot be saved.
    }
  }, [size, resizing]);

  return {
    width: size.width,
    compact,
    resizing,
    hovered,
    toggle,
    separatorProps: {
      role: 'separator',
      tabIndex: 0,
      'aria-label': 'Sidebar width',
      'aria-orientation': 'vertical',
      'aria-controls': 'navigation-sidebar',
      'aria-valuemin': minimum,
      'aria-valuemax': maximum,
      'aria-valuenow': size.width,
      'aria-valuetext': `${size.width} pixels${compact ? ', icons only' : ''}`,
      onPointerDown,
      onPointerMove,
      onPointerEnter: () => setHovered(true),
      onPointerLeave: () => setHovered(false),
      onPointerUp: finishResize,
      onPointerCancel: finishResize,
      onLostPointerCapture: finishResize,
      onKeyDown,
    } as const,
  };
}
