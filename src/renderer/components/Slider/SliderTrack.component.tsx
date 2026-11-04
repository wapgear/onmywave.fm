import type { ComponentProps, CSSProperties } from 'react';

import './Slider.styles.css';

export function SliderTrack({
  start = 0,
  end,
  range = false,
  className = '',
  style,
  children,
  ...props
}: ComponentProps<'div'> & { start?: number; end: number; range?: boolean }) {
  return (
    <div
      {...props}
      className={`slider ${className}`.trim()}
      data-range={range || undefined}
      data-equal={(range && start === end) || undefined}
      style={{ ...style, '--slider-start': `${start}%`, '--slider-end': `${end}%` } as CSSProperties}
    >
      <div className="slider-visual" aria-hidden="true">
        <div className="slider-rail" />
        <div className="slider-fill" />
        {range && <div className="slider-thumb slider-thumb-lower" />}
        <div className="slider-thumb slider-thumb-upper" />
      </div>
      {children}
    </div>
  );
}
