import { Play, PlaylistPlus } from 'iconoir-react/regular';
import { Play as PlaySolid } from 'iconoir-react/solid';

import { Button } from '../Button/Button.component';

type CollectionPlaybackActionsProps = {
  playLabel: string;
  disabled: boolean;
  onPlay: () => void;
  onPlayNext: () => void;
  onEnqueue: () => void;
};

export function CollectionPlaybackActions({
  playLabel,
  disabled,
  onPlay,
  onPlayNext,
  onEnqueue,
}: CollectionPlaybackActionsProps) {
  return (
    <>
      <Button type="button" variant="primary" disabled={disabled} onClick={onPlay}>
        <PlaySolid width={16} height={16} aria-hidden="true" />
        {playLabel}
      </Button>
      <Button type="button" disabled={disabled} onClick={onPlayNext}>
        <Play width={16} height={16} aria-hidden="true" />
        Play next
      </Button>
      <Button type="button" disabled={disabled} onClick={onEnqueue}>
        <PlaylistPlus width={17} height={17} aria-hidden="true" />
        Add to end
      </Button>
    </>
  );
}
