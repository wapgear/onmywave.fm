import { useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Play, Square } from 'lucide-react';
import { PRESET_VOICE_IDS } from '../../../../shared/voice-previews';
import { unwrap } from '../../../api';
import { ErrorNotice } from '../../../components/Shared';
import { usePlayer } from '../../../player';
import { useNewsRecovery } from '../../../NewsRecovery';
import './VoicePreview.styles.css';

const validVoiceId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);

type PreviewResource = { kind: 'voice'; voiceId: string } | { kind: 'dj'; djId: string; voiceId: string; delivery: string };

export function VoicePreview({ resource, label, playbackId, activeId, onStart, active = true }: {
  resource: PreviewResource; label: string; playbackId: string; activeId?: string; onStart?: (id: string) => void; active?: boolean;
}) {
  const { voiceId } = resource;
  const savedDJ = resource.kind === 'dj';
  const identity = JSON.stringify(resource);
  const client = useQueryClient();
  const player = usePlayer();
  const recovery = useNewsRecovery();
  const recoveryReady = recovery.status.phase === 'ready';
  const audio = useRef<HTMLAudioElement>(null);
  const mounted = useRef(false);
  const currentVoiceId = useRef(voiceId);
  const loadedVoiceId = useRef('');
  const loadedGeneration = useRef(0);
  const playGeneration = useRef(0);
  const musicGeneration = useRef(0);
  const musicAtRequest = useRef({ generation: 0, command: 0 });
  const requestIsCurrent = () => musicAtRequest.current.generation === musicGeneration.current && musicAtRequest.current.command === player.getMusicCommandRevision();
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [failedVoiceId, setFailedVoiceId] = useState<string | null>(null);
  const [playError, setPlayError] = useState<Error | null>(null);
  const queryKey = resource.kind === 'dj' ? ['djVoicePreview', resource.djId, voiceId, resource.delivery] : ['voicePreview', voiceId];
  const valid = validVoiceId(voiceId);
  const preview = useQuery({ queryKey, enabled: active && valid && recoveryReady, queryFn: async () => unwrap(await (resource.kind === 'dj' ? window.wave.getDJVoicePreview(resource.djId) : window.wave.getVoicePreview(voiceId))), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const shared = preview.data;
  const playable = shared?.available && shared.audioUrl ? shared : null;
  const playing = playingVoiceId === voiceId;
  const audioFailed = failedVoiceId === voiceId;
  const bundled = !savedDJ && PRESET_VOICE_IDS.includes(voiceId);

  useLayoutEffect(() => {
    mounted.current = true;
    const element = audio.current;
    const generation = playGeneration;
    return () => { mounted.current = false; ++generation.current; element?.pause(); element?.removeAttribute('src'); element?.load(); };
  }, []);
  useLayoutEffect(() => {
    currentVoiceId.current = voiceId;
    loadedVoiceId.current = '';
    ++playGeneration.current;
    audio.current?.pause();
    audio.current?.removeAttribute('src');
    audio.current?.load();
  }, [voiceId, identity]);
  useLayoutEffect(() => {
    if (player.requestedPlaying) {
      ++musicGeneration.current;
      audio.current?.pause();
    }
  }, [player.requestedPlaying]);
  useLayoutEffect(() => { ++musicGeneration.current; audio.current?.pause(); }, [player.currentKey, player.musicCommandRevision]);
  useLayoutEffect(() => { if (audio.current) audio.current.volume = player.volume; }, [player.volume]);
  useLayoutEffect(() => { if (!active || (activeId && activeId !== playbackId)) { ++playGeneration.current; audio.current?.pause(); } }, [active, activeId, playbackId]);

  async function play(url: string) {
    const element = audio.current;
    if (!element || !active || currentVoiceId.current !== voiceId) return;
    const generation = ++playGeneration.current;
    musicAtRequest.current = { generation: musicGeneration.current, command: player.getMusicCommandRevision() };
    setPlayError(null);
    if (element.src !== new URL(url, window.location.href).href) element.src = url;
    loadedVoiceId.current = voiceId;
    loadedGeneration.current = generation;
    element.currentTime = 0;
    try {
      if (!active || currentVoiceId.current !== voiceId || !requestIsCurrent() || generation !== playGeneration.current) return;
      await element.play();
    } catch {
      if (mounted.current && generation === playGeneration.current && requestIsCurrent()) { setFailedVoiceId(voiceId); setPlayError(new Error(bundled ? 'The bundled voice sample could not play. Try again.' : 'This voice sample could not play. Regenerate it to replace the saved file.')); }
    }
  }

  const prepare = useMutation({
    meta: { aiOperation: true },
    mutationFn: async (regenerate: boolean) => {
      if (!recoveryReady) throw new Error('News data is unavailable. Recover it before generating a voice preview.');
      return unwrap(await (resource.kind === 'dj' ? window.wave.prepareDJVoicePreview({ djId: resource.djId, regenerate }) : window.wave.prepareVoicePreview({ voiceId, regenerate })));
    },
    onSuccess: result => client.setQueryData(queryKey, result),
    onSettled: () => { void client.invalidateQueries({ queryKey: resource.kind === 'dj' ? ['djVoicePreview', resource.djId] : queryKey }); },
  });
  const busy = preview.isPending || prepare.isPending;
  const canPlay = Boolean(playable?.audioUrl);
  const attempted = shared?.attempted ?? false;

  function start() {
    if (playing) { ++playGeneration.current; audio.current?.pause(); return; }
    setPlayError(null);
    onStart?.(playbackId);
    if (playable?.audioUrl && (!audioFailed || bundled)) { void play(playable.audioUrl); return; }
    if (!recoveryReady) { setPlayError(new Error('News data is unavailable. Recover it before generating a voice preview.')); return; }
    if (bundled) { setPlayError(new Error('The bundled preset voice sample is unavailable.')); return; }
    if (!valid) { setPlayError(new Error('Enter a valid ElevenLabs voice ID first.')); return; }
    generate(attempted || audioFailed);
  }
  function generate(regenerate: boolean) {
    if (!recoveryReady) { setPlayError(new Error('News data is unavailable. Recover it before generating a voice preview.')); return; }
    setPlayError(null);
    audio.current?.pause();
    onStart?.(playbackId);
    const token = ++playGeneration.current;
    musicAtRequest.current = { generation: musicGeneration.current, command: player.getMusicCommandRevision() };
    prepare.reset();
    prepare.mutate(regenerate, { onSuccess: result => {
      if (token !== playGeneration.current || currentVoiceId.current !== voiceId || !requestIsCurrent() || !active) return;
      if (result.available && result.audioUrl) void play(result.audioUrl);
    } });
  }

  const pending = busy || prepare.isPending;
  const buttonLabel = playing ? 'Stop preview' : savedDJ ? canPlay && !audioFailed ? 'Preview saved DJ' : attempted || audioFailed ? 'Retry DJ preview' : 'Generate DJ preview' : audioFailed && bundled ? 'Try preview again' : audioFailed ? 'Regenerate preview' : canPlay ? 'Preview voice' : bundled ? 'Preview voice' : attempted ? 'Retry preview' : 'Generate preview';
  return <div className="dj-voice-preview">
    <button type="button" disabled={!active || pending || (!!preview.error && !shared && !playable) || (bundled && !playable && !preview.isPending) || (!recoveryReady && !playable && !bundled)} onClick={start} aria-label={`${buttonLabel} for ${label}`}>
      {pending ? <LoaderCircle size={14} className="spinning" /> : playing ? <Square size={14} /> : <Play size={14} />}{pending ? 'Loading…' : buttonLabel}
    </button>
    {savedDJ && canPlay && <button type="button" disabled={!recoveryReady || !active || pending} onClick={() => generate(true)} aria-label={`Regenerate DJ preview for ${label}`}>Regenerate DJ preview</button>}
    <span className="dj-voice-preview-label">{label} · {savedDJ ? 'DJ delivery preview' : 'voice sample'}</span>
    <p className="dj-preview-hint" role="status">{!valid ? 'Enter a valid ElevenLabs voice ID to preview it.' : preview.isPending ? savedDJ ? 'Checking saved DJ delivery preview…' : 'Checking saved voice sample…' : savedDJ ? playable ? shared?.stale ? 'Outdated preview. This recording uses earlier voice or delivery settings. Regenerate makes a new ElevenLabs request.' : 'Saved locally with this DJ’s voice and delivery. Replay needs no provider request; regeneration uses ElevenLabs.' : attempted ? 'No playable DJ preview is saved. Retry makes a new ElevenLabs request.' : 'Generate a fixed sample with this DJ’s saved voice and delivery using ElevenLabs. Saving this DJ does not generate audio.' : playable ? audioFailed ? bundled ? 'The bundled sample could not play; no provider request will be made.' : 'The saved sample failed to play. Regenerate it once to replace it.' : 'Saved locally. Replaying does not make a provider request.' : bundled ? 'The bundled preset sample is unavailable; synthesis is disabled for preset voices.' : attempted ? 'No playable sample is saved. Retry makes a new ElevenLabs request.' : 'Generate once with ElevenLabs; this sample is then shared by voice ID.'}</p>
    {!bundled && valid && <p className="dj-preview-hint">Generating or regenerating a preview uses ElevenLabs outside automatic news limits and can use credits or incur charges. Replaying saved audio makes no provider request.</p>}
    <audio ref={audio} preload="none" aria-label={`${label} ${savedDJ ? 'DJ delivery preview' : 'voice sample'}`} onPlay={() => { if (!active || (activeId && activeId !== playbackId) || loadedGeneration.current !== playGeneration.current || loadedVoiceId.current !== currentVoiceId.current || !requestIsCurrent()) { audio.current?.pause(); return; } setFailedVoiceId(null); onStart?.(playbackId); player.pauseForPreview(); setPlayingVoiceId(currentVoiceId.current); }} onPause={() => setPlayingVoiceId(null)} onEnded={() => setPlayingVoiceId(null)} onError={() => { setPlayingVoiceId(null); setFailedVoiceId(currentVoiceId.current); setPlayError(new Error(bundled ? 'The bundled voice sample could not be opened.' : 'The saved voice sample could not be opened. Regenerate it to replace the file.')); }} />
    <ErrorNotice error={preview.error} retry={() => void preview.refetch()} /><ErrorNotice error={prepare.error} /><ErrorNotice error={playError} />
  </div>;
}
