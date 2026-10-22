import { Buffer } from 'node:buffer';
import console from 'node:console';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { PRESET_VOICE_IDS, VOICE_SAMPLE_TEXT, VOICE_SAMPLE_VERSION } from '../src/shared/voice-previews.ts';

const { fetch, AbortSignal } = globalThis;

const folder = new URL('../src/renderer/public/voice-previews/', import.meta.url);

await mkdir(folder, { recursive: true });

const previous = await readFile(new URL('manifest.json', folder), 'utf8').then(JSON.parse, (error) => {
  if (error.code === 'ENOENT') return null;
  throw error;
});

const clips = previous?.version === VOICE_SAMPLE_VERSION ? previous.clips : {};

for (const voiceId of PRESET_VOICE_IDS) {
  const target = new URL(`${voiceId}.mp3`, folder);
  const saved = await readFile(target).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (saved && clips[voiceId]?.byteLength === saved.length) {
    console.log(`${voiceId}: already saved`);
    continue;
  }
  if (process.argv.includes('--check'))
    throw new Error(
      `Bundled voice sample ${voiceId} is missing or out of date. Run the preparation script to restore it.`,
    );
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error('Set ELEVENLABS_API_KEY to generate missing bundled voice samples.');
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(120000),
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      model_id: 'eleven_v4',
      text: VOICE_SAMPLE_TEXT,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!response.ok) throw new Error(`Voice ${voiceId}: generation failed (${response.status}). No automatic retry.`);
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 100 || audio.length > 24 * 1024 * 1024) throw new Error(`Voice ${voiceId}: invalid audio size.`);
  await writeFile(fileURLToPath(target) + '.tmp', audio);
  await rename(fileURLToPath(target) + '.tmp', target);
  clips[voiceId] = { byteLength: audio.length, createdAt: new Date().toISOString() };
  await writeFile(
    new URL('manifest.json', folder),
    JSON.stringify({ version: VOICE_SAMPLE_VERSION, model: 'eleven_v4', text: VOICE_SAMPLE_TEXT, clips }, null, 2) +
      '\n',
  );
  console.log(`${voiceId}: saved ${audio.length} bytes`);
}
