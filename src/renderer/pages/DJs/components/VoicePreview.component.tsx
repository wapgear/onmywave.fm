import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Play, Square } from 'lucide-react';
import type { DJVoicePreview } from '../../../../shared/types';
import { PRESET_VOICE_IDS } from '../../../../shared/voice-previews';
import { unwrap } from '../../../api';
import { ErrorNotice } from '../../../components/Shared';
import { usePlayer } from '../../../player';
import './VoicePreview.styles.css';

const validVoiceId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);

export function VoicePreview({ voiceId, label, playbackId, activeId, onStart, active = true, legacyPreview, legacyLoading = false }: {
  voiceId: string; label: string; playbackId: string; activeId?: string; onStart?: (id: string) => void; active?: boolean;
  legacyPreview?: DJVoicePreview; legacyLoading?: boolean;
}) {
  const client = useQueryClient();
  const player = usePlayer();
  const audio = useRef<HTMLAudioElement>(null);
  const mounted = useRef(false);
  const currentVoiceId = useRef(voiceId);
  const loadedVoiceId = useRef('');
  const playGeneration = useRef(0);
  const musicGeneration = useRef(0);
  const musicAtRequest = useRef(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [failedVoiceId, setFailedVoiceId] = useState<string | null>(null);
  const [playError, setPlayError] = useState<Error | null>(null);
  const queryKey = ['voicePreview', voiceId];
  const valid = validVoiceId(voiceId);
  const preview = useQuery({ queryKey, enabled: active && valid, queryFn: async () => unwrap(await window.wave.getVoicePreview(voiceId)), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const shared = preview.data;
  const matchingLegacy = legacyPreview?.available && !legacyPreview.stale && legacyPreview.audioUrl ? legacyPreview : null;
  const playable = matchingLegacy ?? (shared?.available && shared.audioUrl ? shared : null);
  const playing = playingVoiceId === voiceId;
  const audioFailed = failedVoiceId === voiceId;
  const bundled = PRESET_VOICE_IDS.includes(voiceId);

  useEffect(() => {
    mounted.current = true;
    const element = audio.current;
    const generation = playGeneration;
    return () => { mounted.current = false; ++generation.current; element?.pause(); element?.removeAttribute('src'); element?.load(); };
  }, []);
  useEffect(() => {
    currentVoiceId.current = voiceId;
    loadedVoiceId.current = '';
    ++playGeneration.current;
    audio.current?.pause();
    audio.current?.removeAttribute('src');
    audio.current?.load();
  }, [voiceId]);
  useEffect(() => {
    if (player.requestedPlaying) {
      ++musicGeneration.current;
      audio.current?.pause();
    }
  }, [player.requestedPlaying]);
  useEffect(() => { if (audio.current) audio.current.volume = player.volume; }, [player.volume]);
  useEffect(() => { if (!active || (activeId && activeId !== playbackId)) { ++playGeneration.current; audio.current?.pause(); } }, [active, activeId, playbackId]);

  async function play(url: string) {
    const element = audio.current;
    if (!element || !active || currentVoiceId.current !== voiceId) return;
    const generation = ++playGeneration.current;
    musicAtRequest.current = musicGeneration.current;
    setPlayError(null);
    if (element.src !== new URL(url, window.location.href).href) element.src = url;
    loadedVoiceId.current = voiceId;
    element.currentTime = 0;
    element.volume = player.volume;
    try {
      if (!active || currentVoiceId.current !== voiceId || musicAtRequest.current !== musicGeneration.current || generation !== playGeneration.current) return;
      await element.play();
    } catch {
      if (mounted.current && generation === playGeneration.current && musicAtRequest.current === musicGeneration.current) { setFailedVoiceId(voiceId); setPlayError(new Error(bundled ? 'The bundled voice sample could not play. Try again.' : 'This voice sample could not play. Regenerate it to replace the saved file.')); }
    }
  }

  const prepare = useMutation({
    meta: { aiOperation: true },
    mutationFn: async (regenerate: boolean) => unwrap(await window.wave.prepareVoicePreview({ voiceId, regenerate })),
    onSuccess: result => client.setQueryData(queryKey, result),
    onSettled: () => { void client.invalidateQueries({ queryKey }); },
  });
  const busy = preview.isPending || prepare.isPending || legacyLoading;
  const canPlay = Boolean(playable?.audioUrl);
  const attempted = shared?.attempted ?? false;

  function start() {
    if (playing) { ++playGeneration.current; audio.current?.pause(); return; }
    setPlayError(null);
    onStart?.(playbackId);
    if (playable?.audioUrl && (!audioFailed || bundled)) { void play(playable.audioUrl); return; }
    if (bundled) { setPlayError(new Error('The bundled preset voice sample is unavailable.')); return; }
    if (!valid) { setPlayError(new Error('Enter a valid ElevenLabs voice ID first.')); return; }
    const token = ++playGeneration.current;
    musicAtRequest.current = musicGeneration.current;
    prepare.reset();
    prepare.mutate(attempted || audioFailed, { onSuccess: result => {
      if (token !== playGeneration.current || currentVoiceId.current !== voiceId || musicAtRequest.current !== musicGeneration.current || !active) return;
      if (result.available && result.audioUrl) void play(result.audioUrl);
    } });
  }

  const pending = busy || prepare.isPending;
  const buttonLabel = playing ? 'Stop preview' : audioFailed && bundled ? 'Try preview again' : audioFailed ? 'Regenerate preview' : canPlay ? 'Preview voice' : bundled ? 'Preview voice' : attempted ? 'Retry preview' : 'Generate preview';
  return <div className="dj-voice-preview">
    <button type="button" disabled={!active || pending || (!!preview.error && !shared && !playable) || (bundled && !playable && !preview.isPending)} onClick={start} aria-label={`${buttonLabel} for ${label}`}>
      {pending ? <LoaderCircle size={14} className="spinning" /> : playing ? <Square size={14} /> : <Play size={14} />}{pending ? 'Loading…' : buttonLabel}
    </button>
    <span className="dj-voice-preview-label">{label} · voice sample</span>
    <p className="dj-preview-hint" role="status">{!valid ? 'Enter a valid ElevenLabs voice ID to preview it.' : preview.isPending || legacyLoading ? 'Checking saved voice sample…' : playable ? audioFailed ? bundled ? 'The bundled sample could not play; no provider request will be made.' : 'The saved sample failed to play. Regenerate it once to replace it.' : matchingLegacy ? 'Playing this DJ’s saved preview without another provider request.' : 'Saved locally. Replaying does not make a provider request.' : bundled ? 'The bundled preset sample is unavailable; synthesis is disabled for preset voices.' : attempted ? 'No playable sample is saved. Retry makes a new ElevenLabs request.' : 'Generate once with ElevenLabs; this sample is then shared by voice ID.'}</p>
    <audio ref={audio} preload="none" aria-label={`${label} voice sample`} onPlay={() => { if (!active || loadedVoiceId.current !== currentVoiceId.current || musicAtRequest.current !== musicGeneration.current) { audio.current?.pause(); return; } setFailedVoiceId(null); onStart?.(playbackId); if (player.requestedPlaying) player.toggle(); setPlayingVoiceId(currentVoiceId.current); }} onPause={() => setPlayingVoiceId(null)} onEnded={() => setPlayingVoiceId(null)} onError={() => { setPlayingVoiceId(null); setFailedVoiceId(currentVoiceId.current); setPlayError(new Error(bundled ? 'The bundled voice sample could not be opened.' : 'The saved voice sample could not be opened. Regenerate it to replace the file.')); }} />
    <ErrorNotice error={preview.error} retry={() => void preview.refetch()} /><ErrorNotice error={prepare.error} /><ErrorNotice error={playError} />
  </div>;
}
