import type { IconButtonProps } from './IconButton.types';

const variants = {
  standard: 'icon-button',
  compact: 'icon-button icon-button-compact',
  player: 'player-icon',
  play: 'player-play',
};

export function IconButton({
  label,
  children,
  title = label,
  variant = 'standard',
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`${variants[variant]} ${className}`.trim()}
      aria-label={label}
      title={title}
    >
      {children}
    </button>
  );
}
