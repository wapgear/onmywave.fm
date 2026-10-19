import { useLayoutEffect, useRef, useState } from 'react';

import { Artwork } from '../Shared';
import type { CollectionHeadingProps } from './CollectionHeading.types';


export function CollectionHeading({ artwork, eyebrow, title, subtitle, children }: CollectionHeadingProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const node = heading.current;
    if (!node) return;
    let active = true;
    const measure = () => {
      const next = node.scrollHeight > node.clientHeight + 1;
      setClipped((current) => (current === next ? current : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const frame = window.requestAnimationFrame(measure);
    void document.fonts?.ready.then(() => {
      if (active) measure();
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [title]);

  return (
    <div className="collection-heading">
      <Artwork url={artwork} name={title} />
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1 ref={heading} title={title}>
          {title}
        </h1>
        {subtitle !== undefined && <p>{subtitle}</p>}
        <div className="action-group">{children}</div>
        {clipped && (
          <details className="collection-title-details">
            <summary>Show full title</summary>
            <p>{title}</p>
          </details>
        )}
      </div>
    </div>
  );
}
