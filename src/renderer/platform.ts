export const isMac =
  (typeof window.wave.platform === 'string'
    ? window.wave.platform
    : navigator.platform.startsWith('Mac')
      ? 'darwin'
      : 'win32') === 'darwin';

export function primaryModifier(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}
