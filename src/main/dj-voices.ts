import type { DJVoice, DJVoiceSearch } from '../shared/types';
import { ServiceError } from './jellyfin';
import { readElevenLabsKey } from './storage';

export async function searchDJVoices(input: DJVoiceSearch): Promise<DJVoice[]> {
  if (!input || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 500
    || !['any', 'male', 'female'].includes(input.gender)) {
    throw new ServiceError('invalid', 'Describe a voice in up to 500 characters.');
  }
  const key = await readElevenLabsKey();
  if (!key) throw new ServiceError('invalid', 'Add your ElevenLabs API key in Settings → Provider keys to search voices.');
  const params = new URLSearchParams({ search: input.prompt.trim(), page_size: '20', include_total_count: 'false' });
  if (input.gender !== 'any') params.set('gender', input.gender);
  let response: Response;
  try {
    response = await fetch(`https://api.elevenlabs.io/v2/voices?${params}`, {
      headers: { 'xi-api-key': key, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ServiceError('offline', 'Could not reach ElevenLabs. Check your connection and try again.');
  }
  if ([401, 403].includes(response.status)) throw new ServiceError('forbidden', 'ElevenLabs could not search voices with this key. Check the key and voice-read permission in Settings → Provider keys.');
  if (response.status === 429) throw new ServiceError('server', 'ElevenLabs is limiting voice searches. Try again shortly.');
  if (!response.ok) throw new ServiceError('server', 'ElevenLabs could not search voices. Try again.');
  const data = await response.json() as { voices?: { voice_id?: unknown; name?: unknown; description?: unknown }[] };
  if (!Array.isArray(data.voices)) throw new ServiceError('server', 'ElevenLabs returned an invalid voice list. Try again.');
  return data.voices.slice(0, 20).flatMap(voice => voice && typeof voice.voice_id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(voice.voice_id)
    && typeof voice.name === 'string' ? [{ id: voice.voice_id, name: voice.name.slice(0, 160), description: typeof voice.description === 'string' ? voice.description.slice(0, 1000) : '' }] : []);
}
