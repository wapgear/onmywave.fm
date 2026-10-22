import type { ButtonProps } from './Button.types';


export function Button({ variant = 'secondary', className = '', children, ...props }: ButtonProps) {
  return (
    <button {...props} className={`${variant === 'secondary' ? '' : variant} ${className}`.trim()}>
      {children}
    </button>
  );
}
