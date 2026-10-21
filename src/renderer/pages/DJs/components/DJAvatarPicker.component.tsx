import { Headphones, Mic2, Music2, Radio, Sparkles, UserRound } from 'lucide-react';
import { useId } from 'react';

import {
  djAvatarColors,
  djAvatarIcons,
  djAvatarPortraits,
  djInitials,
  resolveDJAvatar,
} from '../../../../shared/dj-avatar';
import type { DJAvatarChoice } from '../../../../shared/dj-avatar';
import type { DJ } from '../../../../shared/types';
import { DJAvatar } from '../../../components/DJAvatar/DJAvatar.component';

import './DJAvatarPicker.styles.css';

const icons = {
  host: UserRound,
  headphones: Headphones,
  microphone: Mic2,
  radio: Radio,
  music: Music2,
  sparkles: Sparkles,
} as const;

type Props = { dj: DJ; onChange: (avatar: DJAvatarChoice) => void };

export function DJAvatarPicker({ dj, onChange }: Props) {
  const id = useId();
  const avatar = resolveDJAvatar(dj.avatar);
  const choices = [
    {
      value: 'initials',
      label: 'Initials',
      content: <span className="dj-avatar-choice-initials">{djInitials(dj.name)}</span>,
    },
    ...djAvatarIcons.map((item) => {
      const Icon = icons[item.id];
      return { value: `icon:${item.id}`, label: item.name, content: <Icon size={20} aria-hidden="true" /> };
    }),
    ...djAvatarPortraits.map((item) => ({
      value: `portrait:${item.id}`,
      label: item.name,
      content: <img src={`/dj-avatars/${item.id}.png`} alt="" />,
    })),
  ];
  const selectedValue = avatar.kind === 'initials' ? 'initials' : `${avatar.kind}:${avatar.id}`;
  function choose(value: string) {
    const [kind, key] = value.split(':');
    const next =
      kind === 'initials'
        ? { kind: 'initials' as const, color: avatar.color }
        : kind === 'icon'
          ? { kind: 'icon' as const, id: key as (typeof djAvatarIcons)[number]['id'], color: avatar.color }
          : { kind: 'portrait' as const, id: key as (typeof djAvatarPortraits)[number]['id'], color: avatar.color };
    onChange(next);
  }

  return (
    <div className="dj-avatar-picker">
      <div className="dj-avatar-picker-preview">
        <DJAvatar dj={{ name: dj.name, avatar }} />
        <span>Preview</span>
      </div>
      <fieldset className="dj-avatar-options">
        <legend>Avatar</legend>
        <div className="dj-avatar-options-grid">
          {choices.map((choice) => (
            <label key={choice.value} className="dj-avatar-choice" title={choice.label}>
              <input
                type="radio"
                name={`${id}-avatar`}
                value={choice.value}
                checked={selectedValue === choice.value}
                onChange={() => choose(choice.value)}
                aria-label={choice.label}
              />
              <span className="dj-avatar-choice-mark">{choice.content}</span>
              <span className="sr-only">{choice.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="dj-avatar-colors">
        <legend>Background</legend>
        <div className="dj-avatar-color-list">
          {djAvatarColors.map((color) => (
            <label key={color.id} className="dj-avatar-color" title={color.name}>
              <input
                type="radio"
                name={`${id}-color`}
                value={color.id}
                checked={avatar.color === color.id}
                onChange={() => onChange({ ...avatar, color: color.id })}
                aria-label={`${color.name} background`}
              />
              <span style={{ backgroundColor: color.background, color: color.foreground }}>
                <span aria-hidden="true">✓</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
