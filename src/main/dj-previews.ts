import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { app } from 'electron';

import { NEWS_TEXT_MODEL } from '../shared/types';
import type { DJ, DJVoicePreview, NewsSettings } from '../shared/types';
import { PRESET_VOICE_IDS, VOICE_SAMPLE_TEXT, VOICE_SAMPLE_VERSION } from '../shared/voice-previews';
import { ServiceError } from './jellyfin';
import { NewsService, validateNewsSettings } from './news';
import { getLocalState, readElevenLabsKey } from './storage';


type Clip = { id: string; signature: string; createdAt: string; byteLength: number };

type Manifest = { version: 1; attempted: true; clip: Clip | null };

const sample = VOICE_SAMPLE_TEXT;

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

const validKey = (value: string) => /^[a-f0-9]{64}$/.test(value);

const validClip = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);

const directory = (key: string) => join(app.getPath('userData'), 'dj-voice-previews', key);

const inFlight = new Map<string, Promise<DJVoicePreview>>();

function cacheKey(djId: string) {
  if (typeof djId !== 'string' || !djId.length || djId.length > 128)
    throw new ServiceError('invalid', 'Choose a saved DJ to preview.');
  return hash(djId);
}

async function savedDJ(djId: string): Promise<DJ> {
  const dj = (await getLocalState()).djs.find((item) => item.id === djId);
  if (!dj) throw new ServiceError('invalid', 'This DJ no longer exists.');
  return dj;
}

function speechSettings(dj: Pick<DJ, 'news'>): NewsSettings {
  return {
    feedUrls: [],
    interests: '',
    minStories: 1,
    maxStories: 1,
    voice: 'coral',
    textModel: NEWS_TEXT_MODEL,
    speechEngine: 'elevenlabs-v4',
    duckVolume: 0.08,
    elevenVoiceId: dj.news?.elevenVoiceId,
    elevenTags: dj.news?.elevenTags,
  };
}

function signature(dj: DJ) {
  const settings = speechSettings(dj);
  return hash(
    JSON.stringify({
      voice: settings.elevenVoiceId || 'JBFqnCBsd6RMkjVDRZzb',
      model: 'eleven_v4',
      text: `${settings.elevenTags || ''} ${sample}`.trim(),
      stability: 0.5,
      similarityBoost: 0.75,
      output: 'mp3_44100_128',
    }),
  );
}

async function readManifest(key: string, replaceCorrupt = false): Promise<Manifest | null> {
  let content: string;
  try {
    content = await readFile(join(directory(key), 'index.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new ServiceError('server', 'The saved voice preview could not be read. Existing files were preserved.');
  }
  try {
    const value = JSON.parse(content);
    const clip = value?.clip;
    if (
      value?.version !== 1 ||
      value.attempted !== true ||
      (clip !== null &&
        (!clip ||
          !validClip(clip.id) ||
          typeof clip.signature !== 'string' ||
          !validKey(clip.signature) ||
          typeof clip.createdAt !== 'string' ||
          !Number.isFinite(Date.parse(clip.createdAt)) ||
          !Number.isInteger(clip.byteLength) ||
          clip.byteLength < 100 ||
          clip.byteLength > 24 * 1024 * 1024))
    )
      throw new Error('Invalid voice preview index');
    return value as Manifest;
  } catch {
    if (replaceCorrupt) return null;
    throw new ServiceError('server', 'The saved voice preview could not be read. Existing files were preserved.');
  }
}

async function writeManifest(key: string, manifest: Manifest) {
  await mkdir(directory(key), { recursive: true, mode: 0o700 });
  const temp = join(directory(key), `index.${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(manifest), { mode: 0o600 });
  await rename(temp, join(directory(key), 'index.json'));
}

async function snapshot(key: string, dj: DJ, manifest: Manifest | null): Promise<DJVoicePreview> {
  const clip = manifest?.clip;
  const available = clip
    ? await stat(join(directory(key), `${clip.id}.mp3`)).then(
        (info) => info.isFile() && info.size === clip.byteLength,
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return false;
          throw new ServiceError('server', 'The saved voice preview audio could not be read.');
        },
      )
    : false;
  return {
    audioUrl: available && clip ? `wave-media://dj-preview/${key}/${clip.id}` : null,
    createdAt: clip?.createdAt ?? null,
    available,
    stale: Boolean(clip && clip.signature !== signature(dj)),
    attempted: manifest?.attempted ?? false,
  };
}

function voiceKey(voiceId: string) {
  if (typeof voiceId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(voiceId))
    throw new ServiceError('invalid', 'Enter a valid ElevenLabs voice ID.');
  return hash(JSON.stringify({ voiceId, sampleVersion: VOICE_SAMPLE_VERSION }));
}

function voiceDJ(voiceId: string): DJ {
  return {
    id: voiceId,
    name: 'Voice sample',
    description: '',
    instructions: '',
    musicPreferences: '',
    exclusions: '',
    language: 'English',
    personality: '',
    speakingFrequency: 'never',
    news: { ...speechSettings({}), elevenVoiceId: voiceId, elevenTags: '' },
  };
}

export async function bundledVoiceAudio(voiceId: string): Promise<Buffer | null> {
  if (!PRESET_VOICE_IDS.includes(voiceId)) return null;
  for (const folder of ['src/renderer/public', 'out/renderer']) {
    try {
      const bytes = await readFile(join(app.getAppPath(), folder, 'voice-previews', `${voiceId}.mp3`));
      if (bytes.length >= 100 && bytes.length <= 24 * 1024 * 1024) return bytes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new ServiceError('server', 'The bundled voice sample could not be read.');
    }
  }
  throw new ServiceError('server', 'This bundled voice sample is missing. Rebuild or reinstall the app to restore it.');
}

export async function getVoicePreview(voiceId: string): Promise<DJVoicePreview> {
  const key = voiceKey(voiceId);
  const saved = await snapshot(key, voiceDJ(voiceId), await readManifest(key));
  if (saved.available) return saved;
  if (await bundledVoiceAudio(voiceId))
    return {
      audioUrl: `wave-media://voice-preview/${voiceId}`,
      createdAt: null,
      available: true,
      stale: false,
      attempted: true,
    };
  return saved;
}

export async function getDJVoicePreview(djId: string): Promise<DJVoicePreview> {
  const key = cacheKey(djId);
  const dj = await savedDJ(djId);
  return snapshot(key, dj, await readManifest(key));
}

export async function prepareDJVoicePreview(
  news: NewsService,
  input: { djId: string; regenerate?: boolean },
): Promise<DJVoicePreview> {
  if (!input || (input.regenerate !== undefined && typeof input.regenerate !== 'boolean'))
    throw new ServiceError('invalid', 'Invalid voice preview request.');
  const key = cacheKey(input.djId);
  const flightKey = `dj:${key}`;
  const running = inFlight.get(flightKey);
  if (running) return running;
  const signal = news.generationSignal();
  const task = Promise.resolve()
    .then(async () => {
      const dj = await savedDJ(input.djId);
      const previous = await readManifest(key, input.regenerate === true);
      if (!input.regenerate) {
        const existing = await snapshot(key, dj, previous);
        if (existing.available || existing.attempted) return existing;
      }
      return generatePreview(news, key, dj, previous, signal);
    })
    .finally(() => {
      if (inFlight.get(flightKey) === task) inFlight.delete(flightKey);
    });
  inFlight.set(flightKey, task);
  return task;
}

export async function prepareVoicePreview(
  news: NewsService,
  input: { voiceId: string; regenerate?: boolean },
): Promise<DJVoicePreview> {
  if (!input || (input.regenerate !== undefined && typeof input.regenerate !== 'boolean'))
    throw new ServiceError('invalid', 'Invalid voice preview request.');
  const key = voiceKey(input.voiceId);
  const flightKey = `voice:${key}`;
  const running = inFlight.get(flightKey);
  if (running) return running;
  const signal = news.generationSignal();
  const task = Promise.resolve()
    .then(async () => {
      const dj = voiceDJ(input.voiceId);
      const previous = await readManifest(key, input.regenerate === true);
      if (!input.regenerate) {
        const existing = await getVoicePreview(input.voiceId);
        if (existing.available || existing.attempted) return existing;
      }
      return generatePreview(news, key, dj, previous, signal);
    })
    .finally(() => {
      if (inFlight.get(flightKey) === task) inFlight.delete(flightKey);
    });
  inFlight.set(flightKey, task);
  return task;
}

async function generatePreview(
  news: NewsService,
  key: string,
  dj: DJ,
  previous: Manifest | null,
  signal: AbortSignal,
): Promise<DJVoicePreview> {
  const settings = validateNewsSettings(speechSettings(dj));
  if (!(await readElevenLabsKey()))
    throw new ServiceError('invalid', 'Add your ElevenLabs API key before generating a voice sample.');
  signal.throwIfAborted();
  // The durable attempt marker prevents implicit paid retries after failure or restart.
  await writeManifest(key, { version: 1, attempted: true, clip: previous?.clip ?? null });
  signal.throwIfAborted();
  const requestId = randomUUID();
  const result = await news.renderPreparedSpeech(
    { requestId, dj, settings, engine: 'elevenlabs-v4' },
    { requestId, script: sample, articles: [], warnings: [] },
    AbortSignal.any([signal, AbortSignal.timeout(120000)]),
  );
  const clip: Clip = {
    id: randomUUID(),
    signature: signature(dj),
    createdAt: new Date().toISOString(),
    byteLength: result.audio.length,
  };
  const target = join(directory(key), `${clip.id}.mp3`);
  await writeFile(`${target}.tmp`, result.audio, { mode: 0o600 });
  await rename(`${target}.tmp`, target);
  const manifest: Manifest = { version: 1, attempted: true, clip };
  await writeManifest(key, manifest);
  return snapshot(key, dj, manifest);
}

export async function djPreviewAudio(key: string, clipId: string): Promise<Buffer | null> {
  if (typeof key !== 'string' || !validKey(key) || !validClip(clipId)) return null;
  try {
    // Immutable files remain available for delayed range requests after regeneration.
    const bytes = await readFile(join(directory(key), `${clipId}.mp3`));
    return bytes.length >= 100 && bytes.length <= 24 * 1024 * 1024 ? bytes : null;
  } catch {
    return null;
  }
}
