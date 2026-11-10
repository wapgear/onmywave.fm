import { useEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';

type ArtworkBackdrop = HTMLDivElement & {
  startViewTransition?: (update: () => void) => ViewTransition;
};

const sampleSize = 32;

type ArtworkPalette = { start: string; end: string; accent: string };

function sampleColor(pixels: Uint8ClampedArray) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let totalWeight = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const [r, g, b, alpha] = [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
    const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    const weight = (alpha / 255) * (0.2 + 0.8 * chroma);
    red += r * weight;
    green += g * weight;
    blue += b * weight;
    totalWeight += weight;
  }
  if (!totalWeight) return;
  const rgb = [red, green, blue].map((channel) => Math.round(channel / totalWeight));

  return { color: `rgb(${rgb.join(' ')})`, chroma: Math.max(...rgb) - Math.min(...rgb) };
}

async function readPalette(source: string): Promise<ArtworkPalette | undefined> {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = sampleSize;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(image, 0, 0, sampleSize, sampleSize);
  const half = sampleSize / 2;
  const top = sampleColor(context.getImageData(0, 0, sampleSize, half).data);
  const bottom = sampleColor(context.getImageData(0, half, sampleSize, half).data);
  const start = top ?? bottom;
  const end = bottom ?? top;
  if (!start || !end) return;
  const accent = start.chroma >= end.chroma ? start.color : end.color;

  return { start: start.color, end: end.color, accent };
}

export function useArtworkPalette(
  source: string | null | undefined,
  backdropRef: RefObject<ArtworkBackdrop | null>,
  animateBackdrop: boolean,
) {
  const [palette, setPalette] = useState<ArtworkPalette>();
  const displayed = useRef<ArtworkPalette | undefined>(undefined);

  useEffect(() => {
    // Keep the displayed colors while the next cover is loading or decoding.
    if (source === undefined) return;
    let active = true;
    let transition: ViewTransition | undefined;
    const nextPalette = source === null ? Promise.resolve(undefined) : readPalette(source).catch(() => undefined);
    void nextPalette.then((next) => {
      if (!active) return;
      const previous = displayed.current;
      if (previous?.start === next?.start && previous?.end === next?.end && previous?.accent === next?.accent) return;
      const update = () => {
        if (!active) return;
        displayed.current = next;
        setPalette(next);
      };
      const backdrop = backdropRef.current;
      if (
        animateBackdrop &&
        backdrop?.startViewTransition &&
        backdrop.checkVisibility() &&
        !window.matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)').matches
      ) {
        transition = backdrop.startViewTransition(() => flushSync(update));
        void transition.ready.catch(() => {});
        void transition.finished.catch(() => {});
      } else update();
    });

    return () => {
      active = false;
      transition?.skipTransition();
    };
  }, [source, backdropRef, animateBackdrop]);

  return palette;
}
