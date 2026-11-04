import { useRef, type PointerEvent } from 'react';

import { SliderTrack } from './SliderTrack.component';

export function RangeSlider({
  id,
  min,
  max,
  value: [minimum, maximum],
  minimumLabel,
  maximumLabel,
  formatValue = String,
  disabled = false,
  className,
  inputRef,
  onChange,
}: {
  id: string;
  min: number;
  max: number;
  value: [number, number];
  minimumLabel: string;
  maximumLabel: string;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  className?: string;
  inputRef?: (element: HTMLInputElement | null) => void;
  onChange: (minimum: number, maximum: number) => void;
}) {
  const minimumInput = useRef<HTMLInputElement | null>(null);
  const maximumInput = useRef<HTMLInputElement>(null);
  const dragging = useRef<'minimum' | 'maximum' | 'combined' | null>(null);
  const extent = max - min;
  const blocked = () => disabled || minimumInput.current?.matches(':disabled');
  const update = (thumb: 'minimum' | 'maximum', value: number) => {
    if (blocked()) return;
    const bounded = Math.max(min, Math.min(max, value));
    if (thumb === 'minimum') onChange(Math.min(bounded, maximum), maximum);
    else onChange(minimum, Math.max(bounded, minimum));
  };
  const valueAt = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - bounds.left - 8) / (bounds.width - 16);
    return Math.round(min + fraction * extent);
  };
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (blocked() || !event.isPrimary || event.button !== 0 || event.target instanceof HTMLInputElement) return;
    const value = valueAt(event);
    const thumb =
      minimum === maximum && value === minimum
        ? 'combined'
        : Math.abs(value - minimum) < Math.abs(value - maximum) || value < minimum
          ? 'minimum'
          : 'maximum';
    dragging.current = thumb;
    (thumb === 'maximum' ? maximumInput : minimumInput).current?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.dragging = 'true';
    if (thumb !== 'combined') update(thumb, value);
    event.preventDefault();
  };
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = null;
    delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <SliderTrack
      className={className}
      range
      start={(100 * (minimum - min)) / extent}
      end={(100 * (maximum - min)) / extent}
      onPointerDown={start}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        const value = valueAt(event);
        if (dragging.current === 'combined') {
          if (value === minimum) return;
          dragging.current = value < minimum ? 'minimum' : 'maximum';
          (dragging.current === 'minimum' ? minimumInput : maximumInput).current?.focus({ preventScroll: true });
        }
        update(dragging.current, value);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
    >
      <input
        ref={(element) => {
          minimumInput.current = element;
          inputRef?.(element);
        }}
        id={`${id}-min`}
        className="slider-input slider-input-lower"
        type="range"
        min={min}
        max={max}
        step={1}
        value={minimum}
        disabled={disabled}
        aria-label={minimumLabel}
        aria-valuemin={min}
        aria-valuemax={maximum}
        aria-valuetext={formatValue(minimum)}
        onChange={(event) => update('minimum', Number(event.target.value))}
      />
      <input
        ref={maximumInput}
        id={`${id}-max`}
        className="slider-input slider-input-upper"
        type="range"
        min={min}
        max={max}
        step={1}
        value={maximum}
        disabled={disabled}
        aria-label={maximumLabel}
        aria-valuemin={minimum}
        aria-valuemax={max}
        aria-valuetext={formatValue(maximum)}
        onChange={(event) => update('maximum', Number(event.target.value))}
      />
    </SliderTrack>
  );
}
