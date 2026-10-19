import type { DJ } from '../../../../shared/types';


export type DJPreviewProps = {
  dj: DJ;
  activeId: string | null;
  onStart: (id: string) => void;
};
