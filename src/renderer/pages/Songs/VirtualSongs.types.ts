import type { TrackTableProps } from '../../components/TrackTable/TrackTable.types';


export type VirtualSongsProps = TrackTableProps & {
  total: number;
  hasNext: boolean;
  fetching: boolean;
  nextError: unknown;
  loadNext: () => Promise<{ isError: boolean }>;
  onResultsElement?: (node: HTMLDivElement | null) => void;
};
