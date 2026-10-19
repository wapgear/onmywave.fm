import { useState } from 'react';
import { Headphones, Mic2, Music2, Radio, Sparkles, UserRound } from 'lucide-react';
import { djAvatarColors, djInitials, resolveDJAvatar } from '../../../shared/dj-avatar';
import type { DJ } from '../../../shared/types';
import './DJAvatar.styles.css';

const icons = {
  host: UserRound,
  headphones: Headphones,
  microphone: Mic2,
  radio: Radio,
  music: Music2,
  sparkles: Sparkles,
} as const;

export function DJAvatar({ dj, className = '' }: { dj: Pick<DJ, 'name' | 'avatar'>; className?: string }) {
  const avatar = resolveDJAvatar(dj.avatar);
  const color = djAvatarColors.find((item) => item.id === avatar.color)!;
  const [failedPortrait, setFailedPortrait] = useState<string | null>(null);
  const Icon = avatar.kind === 'icon' ? icons[avatar.id] : UserRound;
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
        <Icon size={24} strokeWidth={1.7} />
      )}
    </div>
  );
}
