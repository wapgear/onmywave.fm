import { randomInt, randomUUID } from 'node:crypto';

import { normalizeDJPlaybackSettings } from '../shared/dj-playback';
import { announcementTemplates, formatSongAnnouncement } from '../shared/song-announcements';
import type { Song, SongHandoff } from '../shared/types';
import { NEWS_TEXT_MODEL } from '../shared/types';
import { ServiceError } from './jellyfin';
import type { NewsService } from './news';
import { getPreparedNews } from './prepared-news';
import type { HandoffSong, SongHandoffContext } from './song-handoff-prompts';
import { getLocalState } from './storage';

const clips = new Map<string, Buffer>();

const attempts = new Map<string, { promise: Promise<SongHandoff>; clip: { id?: string } }>();

const active = new Map<string, AbortController>();

const recentTemplates: string[] = [];

const recentLinks: { script: string; approach: SongHandoffContext['approach'] }[] = [];

const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(value);

const spoken = (value: string) =>
  value
    .replace(/[<>[\]]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

function songContext(song: Song): HandoffSong {
  return {
    name: spoken(song.name),
    artists: song.artists.map(spoken).filter(Boolean),
    album: spoken(song.album ?? '').slice(0, 240),
    year:
      Number.isInteger(song.year) && song.year! >= 1000 && song.year! <= new Date().getFullYear()
        ? song.year
        : undefined,
    genres: (song.genres ?? []).slice(0, 12).map((value) => spoken(value).slice(0, 120)),
    tags: (song.tags ?? []).slice(0, 12).map((value) => spoken(value).slice(0, 120)),
  };
}

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
  recentTemplates.length = 0;
  recentLinks.length = 0;
}

export async function prepareSongHandoff(
  news: NewsService,
  resolveSong: (id: string) => Promise<Song>,
  input: { requestId: string; takeId?: string; songId: string; previousSongId?: string; transitionId?: string },
): Promise<SongHandoff | null> {
  if (
    !input ||
    !validId(input.requestId) ||
    (input.takeId !== undefined && !validId(input.takeId)) ||
    (input.previousSongId !== undefined && !validId(input.previousSongId)) ||
    (input.transitionId !== undefined && !validId(input.transitionId)) ||
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
    const previousSong = input.previousSongId
      ? input.previousSongId === input.songId
        ? song
        : await resolveSong(input.previousSongId)
      : null;
    signal.throwIfAborted();
    const title = spoken(song.name);
    const artists = song.artists.map(spoken).filter(Boolean).join(', ');
    if (!title || title === 'Untitled song' || title.length > 160 || artists.length > 160) return null;
    const upcoming = songContext(song);
    let outgoing = previousSong ? songContext(previousSong) : null;
    if (
      outgoing &&
      (!outgoing.name ||
        outgoing.name === 'Untitled song' ||
        outgoing.name.length > 160 ||
        outgoing.artists.join(', ').length > 160)
    )
      outgoing = null;
    const signature = JSON.stringify([
      input.transitionId,
      input.takeId,
      voice,
      delivery,
      upcoming,
      outgoing,
      dj.id,
      dj.language,
      dj.personality,
      dj.instructions,
      dj.musicPreferences,
      dj.exclusions,
      room?.mood,
      settings.announcementStyle,
      settings.announcementLines,
    ]);
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
          const generationInput = {
            requestId: input.requestId,
            dj,
            mood: room?.mood,
            settings: {
              feedUrls: [],
              interests: '',
              minStories: 1,
              maxStories: 1,
              voice: 'coral' as const,
              textModel: NEWS_TEXT_MODEL,
              speechEngine: 'elevenlabs-v4' as const,
              duckVolume: 0.05,
              elevenVoiceId: voice,
              elevenTags: delivery,
            },
            engine: 'elevenlabs-v4' as const,
          };
          let script: string;
          let approach: SongHandoffContext['approach'] = 'brief';
          if (settings.announcementStyle === 'custom') {
            const templates = announcementTemplates('custom', settings.announcementLines);
            const recent = templates.length === 1 ? [] : recentTemplates.slice(-Math.min(5, templates.length - 1));
            const choices = templates.filter((template) => !recent.includes(template));
            const template = choices[randomInt(choices.length)];
            script = formatSongAnnouncement(template, title, artists);
            recentTemplates.push(template);
            if (recentTemplates.length > 5) recentTemplates.shift();
          } else {
            const options: SongHandoffContext['approach'][] =
              take || settings.announcementStyle === 'minimal'
                ? ['brief']
                : ['brief', 'bridge', 'bridge', 'reflection', 'song-story', 'song-story'];
            const choices =
              options.length === 1 ? options : options.filter((value) => value !== recentLinks.at(-1)?.approach);
            approach = choices[randomInt(choices.length)];
            const fuller = approach !== 'brief';
            const written = await news.writeSongHandoff(
              generationInput,
              {
                outgoing: fuller ? outgoing : null,
                upcoming,
                afterNews: !!take,
                style: fuller ? settings.announcementStyle : 'minimal',
                approach,
                recentLinks: recentLinks.map((value) => value.script),
              },
              signal,
            );
            script = written.script;
          }
          const result = await news.renderPreparedSpeech(
            generationInput,
            { requestId: input.requestId, script, articles: [], warnings: [] },
            signal,
          );
          signal.throwIfAborted();
          const id = randomUUID();
          clip.id = id;
          clips.set(id, result.audio);
          recentLinks.push({ script, approach });
          if (recentLinks.length > 5) recentLinks.shift();
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
