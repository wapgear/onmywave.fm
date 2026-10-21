import { useState, type CSSProperties } from 'react';

import { usePlayer, usePlayerPosition } from '../../player';


const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

const fill = (percent: number): CSSProperties =>
  ({ '--range-fill': `${Math.max(0, Math.min(100, percent))}%` }) as CSSProperties;

export function PlayerTimeline() {
  const player = usePlayer();
  const playerPosition = usePlayerPosition();
  const [seekDraft, setSeekDraft] = useState<{ key?: string; value: number } | null>(null);
  const duration = player.duration;
  const draftSeek = seekDraft?.key === player.currentKey ? seekDraft?.value : undefined;
  const position = duration ? Math.min(draftSeek ?? playerPosition, duration) : playerPosition;

  function commitSeek() {
    if (draftSeek !== undefined) player.seek(draftSeek);
    setSeekDraft(null);
  }

  return (
    <div className="player-progress">
      <span>{formatTime(position)}</span>
      <input
        type="range"
        min="0"
        max={Math.max(1, duration)}
        step="0.1"
        value={duration ? position : 0}
        style={fill(duration ? (position / duration) * 100 : 0)}
        disabled={!player.current || !duration}
        aria-label="Playback position"
        aria-valuetext={
          duration
            ? `${formatTime(position)} of ${formatTime(duration)}`
            : `${formatTime(position)} elapsed; duration unavailable`
        }
        onChange={(event) => setSeekDraft({ key: player.currentKey, value: Number(event.target.value) })}
        onBlur={commitSeek}
        onPointerUp={commitSeek}
        onPointerCancel={() => setSeekDraft(null)}
        onKeyUp={(event) => {
          if (
            ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
          )
            commitSeek();
        }}
      />
      <span aria-label={player.current && !duration ? 'Duration unavailable' : 'Time remaining'}>
        {duration || !player.current ? `−${formatTime(Math.max(0, duration - position))}` : '--:--'}
      </span>
    </div>
  );
}
