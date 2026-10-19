import type { Album } from '../../../shared/types';


export type VirtualAlbumsProps = {
  albums: Album[];
  total: number;
  hasNext: boolean;
  fetching: boolean;
  nextError: unknown;
  loadNext: () => Promise<{ isError: boolean }>;
  open: (album: Album, origin: HTMLButtonElement) => void;
  returnFocus: string | null;
  focused: () => void;
  onResultsElement?: (node: HTMLElement | null) => void;
};
