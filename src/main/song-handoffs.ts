import { randomUUID } from 'node:crypto';

import { normalizeDJPlaybackSettings } from '../shared/dj-playback';
import type { Song, SongHandoff } from '../shared/types';
import { NEWS_TEXT_MODEL } from '../shared/types';
import { ServiceError } from './jellyfin';
import type { NewsService } from './news';
import { getPreparedNews } from './prepared-news';
import { getLocalState } from './storage';

const clips = new Map<string, Buffer>();

const attempts = new Map<string, { promise: Promise<SongHandoff>; clip: { id?: string } }>();

const active = new Map<string, AbortController>();

const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(value);

const spoken = (value: string) =>
  value
    .replace(/[<>[\]]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

export function songHandoffAudio(id: string): Buffer | null {
  return clips.get(id) ?? null;
}

export function cancelSongHandoff(requestId: string) {
  if (!validId(requestId)) throw new ServiceError('invalid', 'Invalid song introduction request.');
  active.get(requestId)?.abort();
}

export function revokeSongHandoffs() {
  for (const controller of active.values()) controller.abort();
  active.clear();
  clips.clear();
  attempts.clear();
}

export async function prepareSongHandoff(
  news: NewsService,
  resolveSong: (id: string) => Promise<Song>,
  input: { requestId: string; takeId?: string; songId: string },
): Promise<SongHandoff | null> {
  if (
    !input ||
    !validId(input.requestId) ||
    (input.takeId !== undefined && !validId(input.takeId)) ||
    !validId(input.songId)
  )
    throw new ServiceError('invalid', 'Invalid song introduction request.');
  if ([...active.values()].some((controller) => !controller.signal.aborted))
    throw new ServiceError('invalid', 'Another song introduction is being prepared.');
  const controller = new AbortController();
  active.set(input.requestId, controller);
  try {
    const signal = AbortSignal.any([controller.signal, news.generationSignal(), AbortSignal.timeout(120000)]);
    const state = await getLocalState();
    const settings = normalizeDJPlaybackSettings(state.djPlayback);
    if (!settings.announceTracks) return null;
    const take = input.takeId
      ? (await getPreparedNews()).takes.find((value) => value.id === input.takeId && value.available)
      : null;
    if (input.takeId && !take) throw new ServiceError('not-found', 'The saved DJ recording is unavailable.');
    if (take && take.ending !== 'story-only') return null;
    const room = state.roomProfiles.find((value) => value.id === (settings.roomId ?? state.activeRoomProfileId));
    const dj = take?.renderingDJ ?? state.djs.find((value) => value.id === room?.room.djId);
    if (!dj)
      throw new ServiceError('invalid', 'Choose a DJ in your listening room before enabling track announcements.');
    const voice = take?.voice ?? dj.news?.elevenVoiceId ?? 'JBFqnCBsd6RMkjVDRZzb';
    const delivery = take?.delivery ?? dj.news?.elevenTags ?? '';
    const song = await resolveSong(input.songId);
    signal.throwIfAborted();
    const title = spoken(song.name);
    const artists = song.artists.map(spoken).filter(Boolean).join(', ');
    if (!title || title === 'Untitled song' || title.length > 160 || artists.length > 160) return null;
    const script = `And now, enjoy ${title}${artists ? ` by ${artists}` : ''}.`;
    const signature = JSON.stringify([voice, delivery, script]);
    let attempt = attempts.get(signature);
    if (!attempt) {
      // Retain recent uncertain attempts so a scheduling tick cannot silently repeat a paid request.
      if (attempts.size >= 32) {
        const oldest = attempts.keys().next().value!;
        const clipId = attempts.get(oldest)?.clip.id;
        if (clipId) clips.delete(clipId);
        attempts.delete(oldest);
      }
      const clip: { id?: string } = {};
      const entry = {
        clip,
        promise: (async () => {
          const result = await news.renderPreparedSpeech(
            {
              requestId: input.requestId,
              dj,
              settings: {
                feedUrls: [],
                interests: '',
                minStories: 1,
                maxStories: 1,
                voice: 'coral',
                textModel: NEWS_TEXT_MODEL,
                speechEngine: 'elevenlabs-v4',
                duckVolume: 0.05,
                elevenVoiceId: voice,
                elevenTags: delivery,
              },
              engine: 'elevenlabs-v4',
            },
            { requestId: input.requestId, script, articles: [], warnings: [] },
            signal,
          );
          signal.throwIfAborted();
          const id = randomUUID();
          clip.id = id;
          clips.set(id, result.audio);
          return { script, audioUrl: `wave-media://song-handoff/${id}` };
        })(),
      };
      attempts.set(signature, entry);
      attempt = entry;
    }
    const result = await attempt.promise;
    signal.throwIfAborted();
    return result;
  } finally {
    if (active.get(input.requestId) === controller) active.delete(input.requestId);
  }
}
