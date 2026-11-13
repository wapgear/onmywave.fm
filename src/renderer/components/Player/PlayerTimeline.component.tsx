import { useState } from 'react';

import { usePlayer, usePlayerPosition } from '../../player';
import type { DynamicBarPreferences } from '../../theme.types';
import { Slider } from '../Slider/Slider.component';
import { ProgressBackdrop } from './DynamicPlayerBar.component';

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

export function PlayerTimeline({ progressStyle }: { progressStyle?: DynamicBarPreferences['progress'] }) {
  const player = usePlayer();
  const playerPosition = usePlayerPosition();
  const [seekDraft, setSeekDraft] = useState<{ key?: string; value: number } | null>(null);
  const duration = player.duration;
  const draftSeek = seekDraft?.key === player.currentKey ? seekDraft?.value : undefined;
  const seekPosition = draftSeek ?? playerPosition;
  const elapsed = Number.isFinite(seekPosition) ? Math.max(0, seekPosition) : 0;
  const position = duration ? Math.min(elapsed, duration) : elapsed;
  const remaining = Math.ceil(Math.max(0, duration - position));
  const progress = duration ? position / duration : 0;

  function commitSeek() {
    if (draftSeek !== undefined) player.seek(draftSeek);
    setSeekDraft(null);
  }

  return (
    <div className="player-progress">
      {progressStyle && (
        <ProgressBackdrop
          key={player.currentKey}
          variant={progressStyle}
          progress={progress}
          duration={duration}
          animate={player.playing && !player.busy && draftSeek === undefined && progress < 1}
          readPlayingPosition={player.readPlayingPosition}
        />
      )}
      <span>{formatTime(position)}</span>
      <Slider
        min={0}
        max={duration || 1}
        step="any"
        value={duration ? position : 0}
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
        onKeyDown={(event) => {
          const forward = event.key === 'ArrowRight' || event.key === 'ArrowUp';
          if (!forward && event.key !== 'ArrowLeft' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          // An unconstrained range reaches fractional endpoints. Keep its tenth-second arrow increments.
          const value = Math.max(0, Math.min(duration, position + (forward ? 0.1 : -0.1)));
          setSeekDraft({ key: player.currentKey, value });
        }}
        onKeyUp={(event) => {
          if (
            ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
          )
            commitSeek();
        }}
      />
      <span aria-label={player.current && !duration ? 'Duration unavailable' : 'Time remaining'}>
        {duration || !player.current ? `−${formatTime(remaining)}` : '--:--'}
      </span>
    </div>
  );
}
