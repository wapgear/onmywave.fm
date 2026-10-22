import { Check, ChevronDown, Search } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import type { FilterSelectProps } from './FilterSelect.types';

import './FilterSelect.styles.css';

export function FilterSelect({
  label,
  value,
  choices,
  onChange,
  emptyLabel,
  searchable = true,
  allowCustom = false,
  disabled = false,
  loading = false,
}: FilterSelectProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const shown = choices.filter((choice) =>
    choice.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const selectedLabel = choices.find((choice) => choice.value === value)?.label ?? value;
  const custom =
    allowCustom &&
    search.trim() &&
    !choices.some((choice) => choice.value.toLocaleLowerCase() === search.trim().toLocaleLowerCase());

  const close = useCallback(() => {
    popup.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }, []);

  const choose = (next: string) => {
    close();
    onChange(next);
  };

  useEffect(() => {
    if (!open) return;
    const onScroll = (event: Event) => {
      if (popup.current?.matches(':popover-open') && !popup.current.contains(event.target as Node))
        popup.current.hidePopover();
    };
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  function position() {
    const node = popup.current!;
    const rect = trigger.current!.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 284))}px`;
    node.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - (node.getBoundingClientRect().height || 340) - 8))}px`;
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    const options = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.target === searchInput.current && event.key === 'Enter') {
      event.preventDefault();
      if (custom) choose(search.trim());
      else if (shown.length) choose(shown[0].value);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && !(index >= 0 && ['Home', 'End'].includes(event.key)))
      return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : index < 0
            ? event.key === 'ArrowDown'
              ? 0
              : options.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    const button = options[next];
    button?.focus({ preventScroll: true });
    if (button && list.current) {
      const top = button.offsetTop - list.current.offsetTop;
      if (top < list.current.scrollTop) list.current.scrollTop = top;
      else if (top + button.offsetHeight > list.current.scrollTop + list.current.clientHeight)
        list.current.scrollTop = top + button.offsetHeight - list.current.clientHeight;
    }
  }

  return (
    <>
      <button
        className="filter-select-trigger"
        ref={trigger}
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        aria-label={`${label}: ${selectedLabel || emptyLabel || 'Any'}`}
        onClick={() => {
          setSearch('');
          position();
        }}
      >
        <span className="filter-select-label">{label}</span>
        <span className="filter-select-value">{selectedLabel || emptyLabel || 'Any'}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div
        id={id}
        ref={popup}
        className="popover-surface filter-select-popup"
        popover="auto"
        role="dialog"
        aria-label={`Choose ${label.toLowerCase()}`}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) popup.current?.hidePopover();
        }}
        onKeyDown={onKey}
        onToggle={(event) => {
          setOpen(event.newState === 'open');
          if (event.newState === 'open') {
            position();
            if (searchable) searchInput.current?.focus({ preventScroll: true });
            else
              (
                list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ??
                list.current?.querySelector<HTMLButtonElement>('[role="option"]')
              )?.focus({ preventScroll: true });
          } else if (popup.current?.contains(document.activeElement) || document.activeElement === document.body)
            trigger.current?.focus({ preventScroll: true });
        }}
      >
        {searchable && (
          <label className="search-field filter-select-search">
            <Search size={17} aria-hidden="true" />
            <input
              ref={searchInput}
              aria-label={`Search ${label.toLowerCase()}`}
              placeholder={`Search ${label.toLowerCase()}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        )}
        <div ref={list} className="filter-select-options" role="listbox" aria-label={label}>
          {emptyLabel && (
            <button role="option" aria-selected={!value} onClick={() => choose('')}>
              <span>{emptyLabel}</span>
              {!value && <Check size={15} />}
            </button>
          )}
          {shown.map((choice) => (
            <button
              key={choice.value}
              role="option"
              aria-selected={choice.value === value}
              onClick={() => choose(choice.value)}
            >
              <span>{choice.label}</span>
              {choice.value === value && <Check size={15} />}
            </button>
          ))}
          {custom && (
            <button role="option" aria-selected={false} onClick={() => choose(search.trim())}>
              <span>Use "{search.trim()}"</span>
            </button>
          )}
          {loading && (
            <p className="filter-select-empty" role="status">
              Loading options…
            </p>
          )}
          {!loading && !shown.length && !custom && <p className="filter-select-empty">No matching options</p>}
        </div>
      </div>
    </>
  );
}
