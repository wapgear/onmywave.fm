import { AntennaSignal, Headset, MicrophoneSpeaking, MusicNote, Sparks, User } from 'iconoir-react/regular';
import { useState } from 'react';

import { djAvatarColors, djInitials, resolveDJAvatar } from '../../../shared/dj-avatar';
import type { DJ } from '../../../shared/types';

import './DJAvatar.styles.css';

const icons = {
  host: User,
  headphones: Headset,
  microphone: MicrophoneSpeaking,
  radio: AntennaSignal,
  music: MusicNote,
  sparkles: Sparks,
} as const;

export function DJAvatar({ dj, className = '' }: { dj: Pick<DJ, 'name' | 'avatar'>; className?: string }) {
  const avatar = resolveDJAvatar(dj.avatar);
  const color = djAvatarColors.find((item) => item.id === avatar.color)!;
  const [failedPortrait, setFailedPortrait] = useState<string | null>(null);
  const Icon = avatar.kind === 'icon' ? icons[avatar.id] : User;
  const portrait = avatar.kind === 'portrait' && failedPortrait !== avatar.id ? avatar.id : null;

  return (
    <div
      className={`dj-avatar ${className}`}
      style={{ backgroundColor: color.background, color: color.foreground }}
      aria-hidden="true"
    >
      {avatar.kind === 'initials' ? (
        <span className="dj-avatar-initials">{djInitials(dj.name)}</span>
      ) : portrait ? (
        <img src={`/dj-avatars/${portrait}.png`} alt="" onError={() => setFailedPortrait(portrait)} />
      ) : (
        <Icon width={24} height={24} strokeWidth={1.7} aria-hidden="true" />
      )}
    </div>
  );
}
