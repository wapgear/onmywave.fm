import { Play, Square } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { isNewsTransitionSettings, type NewsTransitionSettings } from '../../../../shared/news-transitions';
import { ErrorNotice } from '../../../components/Shared';
import { usePlayer } from '../../../player';

export function NewsTransitionPreview({ settings }: { settings: NewsTransitionSettings }) {
  const player = usePlayer();
  const dispose = useRef<(() => void) | null>(null);
  const master = useRef<GainNode | null>(null);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const overMusic = settings.mode === 'over-music';
  const valid = isNewsTransitionSettings(settings);
  const steps = [
    { id: 'music', label: 'Sample song', time: '2 s' },
    { id: 'fade', label: overMusic ? 'Lower music' : 'End song', time: `${settings.fadeOutSeconds} s` },
    { id: 'lead', label: overMusic ? 'Quiet music' : 'Silence', time: `${settings.leadInSeconds} s` },
    { id: 'voice', label: overMusic ? 'DJ over music' : 'DJ only', time: 'Saved sample' },
    { id: 'tail', label: overMusic ? 'Quiet music' : 'Silence', time: `${settings.postSpeechSeconds} s` },
    { id: 'next', label: 'Next song fades in', time: `${settings.fadeInSeconds} s` },
  ];

  const stop = useCallback(() => {
    dispose.current?.();
    setPhase('');
  }, []);

  useEffect(() => () => dispose.current?.(), []);

  useEffect(() => {
    if (!player.requestedPlaying || !dispose.current) return;
    dispose.current();
    let active = true;
    queueMicrotask(() => {
      if (active) setPhase('');
    });
    return () => {
      active = false;
    };
  }, [player.requestedPlaying]);

  useLayoutEffect(() => {
    if (!dispose.current) return;
    dispose.current();
    let active = true;
    queueMicrotask(() => {
      if (active && !dispose.current) setPhase('');
    });
    return () => {
      active = false;
    };
  }, [player.currentKey, player.musicCommandRevision]);

  useEffect(() => {
    if (master.current) master.current.gain.value = player.volume;
  }, [player.volume]);

  async function start() {
    stop();
    setError(null);
    if (!valid) return;
    player.pauseForPreview();
    const command = player.getMusicCommandRevision();
    const current = () => command === player.getMusicCommandRevision();
    setPhase('loading');
    let cleanup: (() => void) | undefined;
    try {
      const context = new AudioContext();
      const voice = new Audio(new URL('/demo/news-break.mp3', window.location.href).href);
      const output = context.createGain();
      const music = context.createGain();
      master.current = output;
      output.gain.value = player.volume;
      output.connect(context.destination);
      music.gain.value = 0;
      music.connect(output);
      context.createMediaElementSource(voice).connect(output);
      let frame = 0;
      let cancelled = false;
      let loadTimeout = 0;
      const oscillators: OscillatorNode[] = [];
      cleanup = () => {
        if (cancelled) return;
        cancelled = true;
        clearTimeout(loadTimeout);
        cancelAnimationFrame(frame);
        voice.oncanplay = voice.onplay = voice.onended = voice.onerror = null;
        voice.pause();
        voice.removeAttribute('src');
        voice.load();
        for (const oscillator of oscillators) oscillator.stop();
        void context.close();
        master.current = null;
        dispose.current = null;
      };
      dispose.current = cleanup;
      const fail = () => {
        if (cancelled) return;
        stop();
        if (current()) setError(new Error('The sample could not play. Try previewing again.'));
      };
      // A local synthesized loop keeps this preview available without a library or provider key.
      function makeMusic() {
        for (const [index, frequency] of [130.81, 164.81, 196].entries()) {
          const oscillator = context.createOscillator();
          const note = context.createGain();
          oscillator.frequency.value = frequency;
          note.gain.value = 0;
          oscillator.connect(note);
          note.connect(music);
          const now = context.currentTime;
          for (let beat = index * 0.125; beat < 60; beat += 0.5) {
            note.gain.setValueAtTime(0, now + beat);
            note.gain.linearRampToValueAtTime(0.12, now + beat + 0.02);
            note.gain.linearRampToValueAtTime(0, now + beat + 0.4);
          }
          oscillator.start();
          oscillators.push(oscillator);
        }
      }
      let stage = 'music';
      let began = 0;
      function enter(next: string) {
        stage = next;
        began = context.currentTime;
        setPhase(next);
      }
      function tick() {
        if (cancelled) return;
        if (!current()) {
          stop();
          return;
        }
        const elapsed = context.currentTime - began;
        if (stage === 'music') {
          music.gain.value = 1;
          if (elapsed >= 2) enter('fade');
        } else if (stage === 'fade') {
          const progress = settings.fadeOutSeconds === 0 ? 1 : Math.min(1, elapsed / settings.fadeOutSeconds);
          const eased = progress * progress * (3 - 2 * progress);
          music.gain.value = 1 + ((overMusic ? 0.05 : 0) - 1) * eased;
          if (progress === 1) enter('lead');
        } else if (stage === 'lead' && elapsed >= settings.leadInSeconds) {
          enter('voice');
          void voice.play().catch(fail);
        } else if (stage === 'tail' && elapsed >= settings.postSpeechSeconds) {
          music.gain.value = 0;
          for (const oscillator of oscillators) oscillator.frequency.value *= 1.5;
          enter('next');
        } else if (stage === 'next') {
          music.gain.value = settings.fadeInSeconds === 0 ? 1 : Math.min(1, elapsed / settings.fadeInSeconds);
          if (elapsed >= settings.fadeInSeconds + 2) {
            stop();
            setPhase('finished');
            return;
          }
        }
        frame = requestAnimationFrame(tick);
      }
      voice.onplay = () => {
        if (!cancelled && !current()) stop();
      };
      voice.onended = () => {
        if (!cancelled && current()) enter('tail');
      };
      voice.onerror = fail;
      loadTimeout = window.setTimeout(fail, 15000);
      voice.oncanplay = () => {
        voice.oncanplay = null;
        clearTimeout(loadTimeout);
        if (cancelled) return;
        if (!current()) {
          stop();
          return;
        }
        makeMusic();
        enter('music');
        tick();
      };
      await context.resume();
      if (!cancelled && current()) {
        voice.preload = 'auto';
        voice.load();
      } else if (!cancelled) stop();
    } catch {
      if (cleanup && dispose.current !== cleanup) return;
      cleanup?.();
      setPhase('');
      if (current()) setError(new Error('The sample could not play. Try previewing again.'));
    }
  }

  const active = phase !== '' && phase !== 'finished';

  return (
    <details
      className="transition-preview"
      onToggle={(event) => {
        if (!event.currentTarget.open && dispose.current) stop();
      }}
    >
      <summary>Preview transition</summary>
      <div className="transition-preview-heading">
        <button type="button" disabled={!valid} onClick={() => (active ? stop() : void start())}>
          {active ? <Square size={14} /> : <Play size={14} />}
          {active ? 'Stop sample' : 'Play sample'}
        </button>
        <span className="preference-note">Pauses your music</span>
      </div>
      {player.activeNewsId && <p className="form-hint">Your scheduled DJ break stays queued.</p>}
      {valid && (
        <ol className="transition-preview-steps" aria-label="Transition stages">
          {steps.map((step) => (
            <li key={step.id} aria-current={phase === step.id ? 'step' : undefined}>
              <span>{step.label}</span>
              <small>{step.time}</small>
            </li>
          ))}
        </ol>
      )}
      <p className="form-hint" role="status">
        {!valid
          ? 'Enter valid fade times and pauses to preview.'
          : phase === 'loading'
            ? 'Loading saved sample…'
            : phase === 'finished'
              ? 'Preview finished. Adjust the timings or replay to compare.'
              : (steps.find((step) => step.id === phase)?.label ?? 'Ready to preview.')}
      </p>
      <ErrorNotice error={error} />
    </details>
  );
}
