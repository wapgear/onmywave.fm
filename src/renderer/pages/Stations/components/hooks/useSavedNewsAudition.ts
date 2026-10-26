import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { PreparedNewsTake } from '../../../../../shared/types';
import { freshAudioUrl } from '../../../../audio';
import { usePlayer } from '../../../../player';

type Audition = { id: string; phase: 'loading' | 'playing' | 'paused'; position: number };

export function useSavedNewsAudition({ active = true }: { active?: boolean } = {}) {
  const player = usePlayer();
  const audio = useRef<HTMLAudioElement | null>(null);
  const operation = useRef(0);
  const playGeneration = useRef(0);
  const [audition, setAudition] = useState<Audition | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [audioError, setAudioError] = useState<string | null>(null);

  const dispose = useCallback(() => {
    ++operation.current;
    ++playGeneration.current;
    const element = audio.current;
    if (element) {
      element.onplay =
        element.onpause =
        element.onended =
        element.onerror =
        element.onloadedmetadata =
        element.ontimeupdate =
          null;
      element.pause();
      element.removeAttribute('src');
      element.load();
      audio.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    dispose();
    setAudition(null);
  }, [dispose]);

  useEffect(() => () => dispose(), [dispose]);

  useEffect(() => {
    if (active || !audio.current) return;
    dispose();
    const token = operation.current;
    queueMicrotask(() => {
      if (token === operation.current) setAudition(null);
    });
  }, [active, dispose]);

  useEffect(() => {
    if (!player.requestedPlaying || !audio.current) return;
    dispose();
    const token = operation.current;
    queueMicrotask(() => {
      if (token === operation.current) setAudition(null);
    });
  }, [player.requestedPlaying, dispose]);

  useLayoutEffect(() => {
    if (!audio.current) return;
    dispose();
    const token = operation.current;
    queueMicrotask(() => {
      if (token === operation.current) setAudition(null);
    });
  }, [player.currentKey, player.musicCommandRevision, dispose]);

  async function listen(take: PreparedNewsTake) {
    setAudioError(null);
    if (audition?.id === take.id && audio.current) {
      if (audition.phase === 'loading') {
        stop();
        return;
      }
      if (!audio.current.paused) {
        ++playGeneration.current;
        audio.current.pause();
        return;
      }
      player.pauseForPreview();
      const token = operation.current;
      const playToken = ++playGeneration.current;
      const command = player.getMusicCommandRevision();
      try {
        await audio.current.play();
      } catch {
        if (
          token === operation.current &&
          playToken === playGeneration.current &&
          command === player.getMusicCommandRevision()
        ) {
          stop();
          setAudioError('This saved take could not resume. Try auditioning it again.');
        }
      }
      return;
    }
    stop();
    player.pauseForPreview();
    const token = operation.current;
    const command = player.getMusicCommandRevision();
    const element = new Audio();
    audio.current = element;
    setAudition({ id: take.id, phase: 'loading', position: 0 });
    element.preload = 'auto';
    element.volume = player.volume;
    element.onloadedmetadata = () => {
      if (token === operation.current && Number.isFinite(element.duration) && element.duration > 0)
        setDurations((old) => ({ ...old, [take.id]: element.duration }));
    };
    element.onplay = () => {
      if (token !== operation.current || command !== player.getMusicCommandRevision()) {
        element.pause();
        return;
      }
      if (!element.paused) setAudition({ id: take.id, phase: 'playing', position: element.currentTime });
    };
    element.onpause = () => {
      if (token === operation.current && element.paused)
        setAudition((old) => (old?.id === take.id ? { ...old, phase: 'paused' } : old));
    };
    element.ontimeupdate = () => {
      if (token === operation.current)
        setAudition((old) => (old?.id === take.id ? { ...old, position: element.currentTime } : old));
    };
    element.onended = () => {
      if (token === operation.current) stop();
    };
    element.onerror = () => {
      if (token === operation.current && command === player.getMusicCommandRevision()) {
        stop();
        setAudioError('The saved audio could not be opened. Refresh saved takes to check the file.');
      }
    };
    element.src = freshAudioUrl(take.audioUrl);
    const playToken = ++playGeneration.current;
    try {
      await element.play();
    } catch {
      if (
        token === operation.current &&
        playToken === playGeneration.current &&
        command === player.getMusicCommandRevision()
      ) {
        stop();
        setAudioError('The saved audio could not play. Refresh saved takes, then try again.');
      }
    }
  }

  useEffect(() => {
    if (audio.current) audio.current.volume = player.volume;
  }, [player.volume]);

  return { audition, durations, audioError, listen, stop };
}
