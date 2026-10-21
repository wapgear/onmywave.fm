import { useQuery } from '@tanstack/react-query';
import { Music2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Song, SongLyrics } from '../../../shared/types';
import { unwrap, WaveError } from '../../api';
import { usePlayer, usePlayerPosition } from '../../player';
import { useRetryFocus } from '../../useRetryFocus';
import { ErrorNotice } from '../Shared';

import './Lyrics.styles.css';

export function Lyrics({ connectionId, song }: { connectionId: string; song: Song }) {
  const player = usePlayer();
  const position = usePlayerPosition();
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const expectedScrollTop = useRef<number | null>(null);
  const [following, setFollowing] = useState(true);
  const lyrics = useQuery({
    queryKey: ['lyrics', connectionId, song.id],
    queryFn: async () => unwrap(await window.wave.lyrics(song.id)),
    enabled: !!song.id,
    retry: false,
    gcTime: 0,
  });
  const retryFocus = useRetryFocus({
    ownerKey: `lyrics:${connectionId}:${song.id}`,
    target: () => heading.current,
    canFocusSuccess: () => lyrics.isSuccess && !lyrics.isFetching,
  });
  const data: SongLyrics | undefined = lyrics.data;
  const lines = data?.lines ?? [];
  const retryable =
    !(lyrics.error instanceof WaveError) ||
    !['forbidden', 'unsupported', 'not-found', 'invalid'].includes(lyrics.error.code);
  const synced =
    !!data?.synced &&
    lines.every(
      (line, index) =>
        typeof line.start === 'number' &&
        Number.isFinite(line.start) &&
        line.start >= 0 &&
        (index === 0 || line.start >= (lines[index - 1].start ?? 0)),
    );
  let activeStart: number | null = null;
  if (synced) {
    for (const line of lines) {
      if (line.start! > position) break;
      activeStart = line.start!;
    }
  }
  const scrollIndex = activeStart === null ? -1 : lines.findIndex((line) => line.start === activeStart);

  useEffect(() => {
    const body = root.current?.closest<HTMLElement>('.drawer-body');
    if (!body) return;
    body.scrollTo({ top: 0, behavior: 'instant' });
    let lastScrollTop = body.scrollTop;
    const stopFollowing = () => {
      expectedScrollTop.current = null;
      body.scrollTo({ top: body.scrollTop, behavior: 'instant' });
      setFollowing(false);
    };
    const stopOnScroll = () => {
      const moved = Math.abs(body.scrollTop - lastScrollTop) >= 2;
      lastScrollTop = body.scrollTop;
      if (!moved || expectedScrollTop.current !== null) return;
      setFollowing(false);
    };
    const finishScroll = () => {
      expectedScrollTop.current = null;
    };
    const stopOnKey = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' '].includes(event.key)) stopFollowing();
    };
    const stopOnPointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.lyrics-line-seek, .lyrics-follow')) return;
      stopFollowing();
    };
    body.addEventListener('wheel', stopFollowing, { passive: true });
    body.addEventListener('touchstart', stopFollowing, { passive: true });
    body.addEventListener('pointerdown', stopOnPointer, true);
    body.addEventListener('keydown', stopOnKey, true);
    body.addEventListener('scroll', stopOnScroll, { passive: true });
    body.addEventListener('scrollend', finishScroll);
    return () => {
      body.removeEventListener('wheel', stopFollowing);
      body.removeEventListener('touchstart', stopFollowing);
      body.removeEventListener('pointerdown', stopOnPointer, true);
      body.removeEventListener('keydown', stopOnKey, true);
      body.removeEventListener('scroll', stopOnScroll);
      body.removeEventListener('scrollend', finishScroll);
      expectedScrollTop.current = null;
      body.scrollTo({ top: body.scrollTop, behavior: 'instant' });
    };
  }, []);

  useEffect(() => {
    if (!following || !synced || scrollIndex < 0) return;
    const body = root.current?.closest<HTMLElement>('.drawer-body');
    const line = root.current?.querySelector<HTMLElement>(`[data-lyrics-index="${scrollIndex}"]`);
    if (!body || !line) return;
    const lineRect = line.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const target = Math.max(
      0,
      Math.min(
        body.scrollHeight - body.clientHeight,
        body.scrollTop + lineRect.top - bodyRect.top - body.clientHeight / 2 + lineRect.height / 2,
      ),
    );
    if (Math.abs(body.scrollTop - target) < 2) return;
    expectedScrollTop.current = target;
    body.scrollTo({
      top: target,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, [following, scrollIndex, synced]);

  return (
    <div ref={root} className="lyrics-content">
      <div className="lyrics-heading">
        <div>
          <span className="lyrics-source">Jellyfin lyrics</span>
          <h3 ref={heading} tabIndex={-1}>
            {song.name || 'Untitled song'}
          </h3>
          <p>{song.artists.join(', ') || 'Unknown artist'}</p>
        </div>
      </div>
      {synced && !following && (
        <div className="lyrics-follow-bar">
          <button className="lyrics-follow" onClick={() => setFollowing(true)}>
            Follow current line
          </button>
        </div>
      )}
      {lyrics.isPending ? (
        <p className="lyrics-message" role="status">
          Loading lyrics…
        </p>
      ) : (
        <ErrorNotice
          error={lyrics.error}
          retryRef={retryFocus.retryRef}
          retrying={lyrics.isFetching}
          retry={retryable ? () => retryFocus.retry(() => lyrics.refetch()) : undefined}
        />
      )}
      {lyrics.isSuccess && !lines.length && (
        <div className="lyrics-empty">
          <Music2 size={25} strokeWidth={1.4} aria-hidden="true" />
          <p>No lyrics are available for this song.</p>
          <small>Enable Jellyfin’s LRCLIB plugin on your server to provide lyrics.</small>
        </div>
      )}
      {lyrics.isSuccess && lines.length > 0 && !synced && (
        <p className="lyrics-message" role="status">
          These lyrics aren’t time-synced. Jumping to a line is unavailable.
        </p>
      )}
      {lyrics.isSuccess && lines.length > 0 && (
        <div className={`lyrics-lines ${synced ? 'is-synced' : ''}`}>
          {lines.map((line, index) => (
            <p
              key={`${index}:${line.start ?? 'plain'}`}
              data-lyrics-index={index}
              className={synced && line.start === activeStart ? 'is-active' : undefined}
              aria-current={index === scrollIndex ? 'true' : undefined}
            >
              {synced && line.text.trim() ? (
                <button
                  type="button"
                  className="lyrics-line-seek"
                  title="Jump to this line"
                  onClick={() => {
                    player.seek(line.start!);
                    setFollowing(true);
                  }}
                >
                  {line.text}
                </button>
              ) : (
                line.text || <span aria-hidden="true">&nbsp;</span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
