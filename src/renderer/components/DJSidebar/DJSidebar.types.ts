import type { Ref } from 'react';

export type DJSidebarProps = {
  openRoom: (source: HTMLButtonElement | null) => void;
  openSettings: (source: HTMLButtonElement | null) => void;
  controlsRef: Ref<HTMLDivElement>;
};
