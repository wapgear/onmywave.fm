import { ListPlus, Play } from 'lucide-react';

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
        <Play size={16} fill="currentColor" aria-hidden="true" />
        {playLabel}
      </Button>
      <Button type="button" disabled={disabled} onClick={onPlayNext}>
        <Play size={16} aria-hidden="true" />
        Play next
      </Button>
      <Button type="button" disabled={disabled} onClick={onEnqueue}>
        <ListPlus size={17} aria-hidden="true" />
        Add to end
      </Button>
    </>
  );
}
