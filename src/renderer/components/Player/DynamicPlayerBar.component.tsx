import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';

import { usePlayer } from '../../player';
import type { DynamicBarPreferences } from '../../theme.types';

const bandCount = 32;

const bands = Array.from({ length: bandCount }, (_, i) => i);

type CapturableAudio = HTMLAudioElement & { captureStream?(): MediaStream };

export function ProgressBackdrop({
  variant,
  progress,
  duration,
  animate,
  readPlayingPosition,
}: {
  variant: DynamicBarPreferences['progress'];
  progress: number;
  duration: number;
  animate: boolean;
  readPlayingPosition: () => number | undefined;
}) {
  const backdrop = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = backdrop.current;
    if (!animate || !duration || !element) return;

    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let lastPosition: number | undefined;

    function draw() {
      frame = requestAnimationFrame(draw);
      const position = readPlayingPosition();
      if (position === lastPosition) return;
      lastPosition = position;
      if (position === undefined) element?.style.removeProperty('--live-elapsed');
      else element?.style.setProperty('--live-elapsed', `${Math.max(0, Math.min(position / duration, 1)) * 100}%`);
    }

    function stop() {
      cancelAnimationFrame(frame);
      lastPosition = undefined;
      element?.style.removeProperty('--live-elapsed');
    }

    function synchronize() {
      stop();
      if (!motion.matches && !document.hidden) draw();
    }

    motion.addEventListener('change', synchronize);
    document.addEventListener('visibilitychange', synchronize);
    synchronize();

    return () => {
      stop();
      motion.removeEventListener('change', synchronize);
      document.removeEventListener('visibilitychange', synchronize);
    };
  }, [animate, duration, readPlayingPosition]);

  return (
    <div
      ref={backdrop}
      className={`player-backdrop player-backdrop-progress player-backdrop-${variant}`}
      style={{ '--reported-elapsed': `${progress * 100}%` } as CSSProperties}
      aria-hidden="true"
    />
  );
}

export function SpectrumBackdrop({ variant }: { variant: DynamicBarPreferences['spectrum'] }) {
  const { getMusicElement, currentKey, playing, busy } = usePlayer();
  const backdrop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element: CapturableAudio | null = getMusicElement();
    const staticBackdrop = matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)');
    const columns = Array.from(backdrop.current?.children ?? []) as HTMLElement[];
    if (!currentKey || !playing || busy || !element?.captureStream || !window.AudioContext) return;

    let stop: (() => void) | undefined;

    function synchronize() {
      if (document.hidden || staticBackdrop.matches || !element || element.paused || element.ended) {
        stop?.();
        stop = undefined;
        return;
      }
      if (stop || element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      let stream: MediaStream | undefined;
      let context: AudioContext | undefined;
      let frame = 0;
      const cleanup = () => {
        cancelAnimationFrame(frame);
        stream?.getTracks().forEach((track) => track.stop());
        if (context) void context.close().catch(() => {});
        columns.forEach((column) => column.style.removeProperty('--band-level'));
      };

      try {
        // Analyse a copy so the media element remains responsible for audible playback.
        stream = element.captureStream?.();
        if (!stream?.getAudioTracks().length) {
          cleanup();
          return;
        }
        context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 8192;
        analyser.smoothingTimeConstant = 0.76;
        analyser.minDecibels = -70;
        analyser.maxDecibels = -18;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const hzPerBin = context.sampleRate / analyser.fftSize;
        const upperHz = Math.min(20_000, context.sampleRate / 2);
        const edges = Array.from({ length: bandCount + 1 }, (_, i) =>
          Math.min(data.length - 1, Math.round((20 * (upperHz / 20) ** (i / bandCount)) / hzPerBin)),
        );
        let lastDraw = -Infinity;

        function draw(time: number) {
          frame = requestAnimationFrame(draw);
          if (time - lastDraw < 32) return;
          lastDraw = time;
          analyser.getByteFrequencyData(data);
          for (const i of bands) {
            let peak = 0;
            for (let bin = edges[i]; bin < Math.max(edges[i] + 1, edges[i + 1]); bin++) {
              peak = Math.max(peak, data[bin]);
            }
            columns[i].style.setProperty('--band-level', String(peak / 255));
          }
        }

        stop = cleanup;
        frame = requestAnimationFrame(draw);
        void context.resume().catch(() => {});
      } catch {
        cleanup();
      }
    }

    element.addEventListener('playing', synchronize);
    element.addEventListener('pause', synchronize);
    element.addEventListener('ended', synchronize);
    document.addEventListener('visibilitychange', synchronize);
    staticBackdrop.addEventListener('change', synchronize);
    synchronize();

    return () => {
      stop?.();
      element.removeEventListener('playing', synchronize);
      element.removeEventListener('pause', synchronize);
      element.removeEventListener('ended', synchronize);
      document.removeEventListener('visibilitychange', synchronize);
      staticBackdrop.removeEventListener('change', synchronize);
    };
  }, [busy, currentKey, getMusicElement, playing]);

  return (
    <div
      className={`player-backdrop player-backdrop-spectrum player-backdrop-${variant}`}
      ref={backdrop}
      aria-hidden="true"
    >
      {bands.map((i) => (
        <span key={i} />
      ))}
    </div>
  );
}
