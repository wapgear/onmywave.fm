export const isMac = navigator.platform.startsWith('Mac');

export const primaryModifierLabel = isMac ? '⌘' : 'Ctrl+';

export function primaryModifier(event: { metaKey: boolean; ctrlKey: boolean }) {
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}
