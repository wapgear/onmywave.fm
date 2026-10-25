import { randomUUID } from 'node:crypto';

import { protocol } from 'electron';

import type { PlaybackResource } from '../shared/types';
import { djPreviewAudio, bundledVoiceAudio } from './dj-previews';
import { ServiceError } from './jellyfin';
import { preparedAudio } from './prepared-news';
import { StorageError } from './storage-error';

type Session = { id: string; serverUrl: string; userId: string; token: string };

type Resource = { connectionId: string; path: string };

const resources = new Map<string, Resource>();

const activeRequests = new Set<AbortController>();

const itemId = (id: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(id);

export function revokeMedia() {
  resources.clear();
  for (const controller of activeRequests) controller.abort();
  activeRequests.clear();
}

function clipResponse(request: Request, clip: { bytes: Buffer; mime: string }): Response {
  const headers = new Headers({ 'Content-Type': clip.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  const range = request.headers.get('range');
  let start = 0;
  let end = clip.bytes.length - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416 });
    if (!match[1]) start = Math.max(0, clip.bytes.length - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    if (start > end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      headers.set('Content-Range', `bytes */${clip.bytes.length}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${clip.bytes.length}`);
  }
  headers.set('Content-Length', String(end - start + 1));
  return new Response(request.method === 'HEAD' ? null : new Uint8Array(clip.bytes.subarray(start, end + 1)), {
    status: range ? 206 : 200,
    headers,
  });
}

export function preparePlayback(
  session: Session | null,
  input: { id: string; transcode?: boolean; offsetSeconds?: number },
  deviceId: string,
): PlaybackResource {
  if (!session) throw new ServiceError('unauthorized', 'Sign in to play music.');
  if (
    !itemId(input.id) ||
    (input.offsetSeconds !== undefined && (!Number.isFinite(input.offsetSeconds) || input.offsetSeconds < 0))
  ) {
    throw new ServiceError('invalid', 'Invalid playback request.');
  }
  const transcode = input.transcode === true;
  const offsetSeconds = transcode ? (input.offsetSeconds ?? 0) : 0;
  const handle = randomUUID();
  // Do not advertise a direct-play container: Jellyfin may then serve the source unchanged and ignore startTimeTicks.
  const query = new URLSearchParams(
    transcode
      ? {
          userId: session.userId,
          deviceId,
          audioCodec: 'mp3',
          transcodingContainer: 'mp3',
          transcodingProtocol: 'http',
          maxAudioSampleRate: '48000',
          startTimeTicks: String(Math.round(offsetSeconds * 10_000_000)),
          enableRedirection: 'false',
          playSessionId: handle,
        }
      : { static: 'true' },
  );
  // Retain recent resources for Chromium's delayed range requests without growing with the queue.
  if (resources.size >= 32) resources.delete(resources.keys().next().value!);
  resources.set(handle, {
    connectionId: session.id,
    path: `Audio/${input.id}/${transcode ? 'universal' : 'stream'}?${query}`,
  });
  return { url: `wave-media://audio/${handle}`, offsetSeconds, transcoded: transcode };
}

export function registerMedia(getSession: () => Session | null, deviceId: string, onStorageFailure?: () => void) {
  protocol.handle('wave-media', async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    const url = new URL(request.url);
    const id = url.pathname.slice(1);
    if (url.hostname === 'voice-preview') {
      const bytes = await bundledVoiceAudio(id);
      return bytes ? clipResponse(request, { bytes, mime: 'audio/mpeg' }) : new Response(null, { status: 404 });
    }
    if (url.hostname === 'dj-preview') {
      const [cacheKey, clipId, extra] = id.split('/');
      if (!cacheKey || !clipId || extra !== undefined) return new Response(null, { status: 404 });
      const bytes = await djPreviewAudio(cacheKey, clipId);
      return bytes ? clipResponse(request, { bytes, mime: 'audio/mpeg' }) : new Response(null, { status: 404 });
    }
    if (url.hostname === 'prepared') {
      try {
        const bytes = await preparedAudio(id);
        if (!bytes) return new Response(null, { status: 404 });
        return clipResponse(request, { bytes, mime: 'audio/mpeg' });
      } catch (error) {
        if (error instanceof StorageError) {
          onStorageFailure?.();
          return new Response(null, { status: 503 });
        }
        throw error;
      }
    }
    const session = getSession();
    if (!session) return new Response(null, { status: 401 });
    let path: string;
    if (url.hostname === 'audio') {
      const resource = resources.get(id);
      if (!resource || resource.connectionId !== session.id) return new Response(null, { status: 404 });
      path = resource.path;
    } else if (url.hostname === 'artwork' && itemId(id)) {
      const query = new URLSearchParams({ maxWidth: '512', quality: '90' });
      const tag = url.searchParams.get('tag');
      if (tag && /^[a-zA-Z0-9_-]{1,128}$/.test(tag)) query.set('tag', tag);
      path = `Items/${id}/Images/Primary?${query}`;
    } else return new Response(null, { status: 404 });

    const controller = new AbortController();
    activeRequests.add(controller);
    request.signal.addEventListener('abort', () => controller.abort(), { once: true });
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let streaming = false;
    const headers = new Headers({
      Authorization: `MediaBrowser Client="onmywave.fm", Device="${process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'Mac' : 'Desktop'}", DeviceId="${deviceId}", Version="0.1.0", Token="${session.token}"`,
    });
    for (const key of ['range', 'if-range']) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    try {
      let upstreamUrl = new URL(path, `${session.serverUrl.replace(/\/$/, '')}/`);
      let response: Response | undefined;
      for (let hop = 0; hop < 5; hop++) {
        response = await fetch(upstreamUrl, {
          method: request.method,
          headers,
          signal: controller.signal,
          redirect: 'manual',
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) return new Response(null, { status: 502 });
        const next = new URL(location, upstreamUrl);
        if (next.origin !== upstreamUrl.origin || !['http:', 'https:'].includes(next.protocol))
          return new Response(null, { status: 502 });
        upstreamUrl = next;
        response = undefined;
      }
      if (!response) return new Response(null, { status: 502 });
      const outgoing = new Headers({ 'Cache-Control': 'no-store' });
      for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const value = response.headers.get(key);
        if (value) outgoing.set(key, value);
      }
      if (!response.ok || request.method === 'HEAD') {
        await response.body?.cancel();
        return new Response(null, { status: response.status, headers: outgoing });
      }
      if (!response.body) return new Response(null, { status: response.status, headers: outgoing });
      const reader = response.body.getReader();
      streaming = true;
      const body = new ReadableStream<Uint8Array>({
        async pull(target) {
          try {
            const next = await reader.read();
            if (next.done) {
              activeRequests.delete(controller);
              target.close();
            } else target.enqueue(next.value);
          } catch {
            activeRequests.delete(controller);
            target.error(new Error('The media stream was interrupted. Retry playback.'));
          }
        },
        async cancel() {
          activeRequests.delete(controller);
          controller.abort();
          await reader.cancel().catch(() => {});
        },
      });
      return new Response(body, { status: response.status, headers: outgoing });
    } catch {
      return new Response(null, { status: controller.signal.aborted ? 504 : 502 });
    } finally {
      clearTimeout(timeout);
      if (!streaming) activeRequests.delete(controller);
    }
  });
}
