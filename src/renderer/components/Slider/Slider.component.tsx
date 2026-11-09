import type { ComponentProps } from 'react';

import { SliderTrack } from './SliderTrack.component';

export function Slider({
  min,
  max,
  value,
  step = 1,
  className,
  style,
  ...inputProps
}: Omit<ComponentProps<'input'>, 'type' | 'min' | 'max' | 'value' | 'step'> & {
  min: number;
  max: number;
  value: number;
  step?: number;
}) {
  const percent = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;

  return (
    <SliderTrack className={className} style={style} end={percent}>
      <input
        {...inputProps}
        className="slider-input slider-input-upper"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
      />
    </SliderTrack>
  );
}
