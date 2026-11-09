import { useEffect, useState, type CSSProperties } from 'react';

const sampleSize = 32;

function sampleColor(pixels: Uint8ClampedArray): string | undefined {
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
  if (totalWeight > 0)
    return `rgb(${Math.round(red / totalWeight)} ${Math.round(green / totalWeight)} ${Math.round(blue / totalWeight)})`;
}

async function readGradient(source: string) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = sampleSize;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(image, 0, 0, sampleSize, sampleSize);
  const half = sampleSize / 2;
  const start = sampleColor(context.getImageData(0, 0, sampleSize, half).data);
  const end = sampleColor(context.getImageData(0, half, sampleSize, half).data) ?? start;
  if (end) return { '--artwork-gradient-start': start ?? end, '--artwork-gradient-end': end } as CSSProperties;
}

export function useArtworkGradient(source: string | undefined) {
  const [sample, setSample] = useState<{ source: string; style: CSSProperties }>();

  useEffect(() => {
    if (!source) return;
    let active = true;
    void readGradient(source)
      .then((style) => {
        if (active && style) setSample({ source, style });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [source]);

  return sample?.source === source ? sample?.style : undefined;
}
