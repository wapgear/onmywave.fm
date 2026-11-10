import type { QueryClient } from '@tanstack/react-query';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

import type { CatalogQuery, Page, Result, Song } from '../../../shared/types';

export type CollectionItem = { id: string; name: string; imageUrl?: string };

export type MusicCollectionView<T extends CollectionItem> = {
  item: T | null;
  draft: string;
  selected: Map<string, Song>;
};

export type MusicCollectionPageProps<T extends CollectionItem> = {
  label: 'Album' | 'Artist';
  view: MusicCollectionView<T>;
  setView: Dispatch<SetStateAction<MusicCollectionView<T>>>;
  onOpenDetail: (id: string, origin: HTMLButtonElement) => void;
  add: (songs: Song[]) => void;
  details: (song: Song) => void;
  loadPage: (query: CatalogQuery, signal: AbortSignal, client: QueryClient) => Promise<Page<T>>;
  loadMetadata?: (id: string) => Promise<Result<T>>;
  loadTracks: (id: string) => Promise<Result<Song[]>>;
  subtitle?: (item: T) => string;
  detailSubtitle?: (item: T) => ReactNode;
};

export type MusicCollectionDetailProps<T extends CollectionItem> = Pick<
  MusicCollectionPageProps<T>,
  'label' | 'loadMetadata' | 'loadTracks' | 'subtitle' | 'detailSubtitle' | 'add' | 'details'
> & {
  item: T;
  selected: Map<string, Song>;
  select: (selected: Map<string, Song>) => void;
  back: () => void;
};

export type VirtualCollectionGridProps<T extends CollectionItem> = {
  items: T[];
  label: 'Album' | 'Artist';
  subtitle?: (item: T) => string;
  total: number;
  hasNext: boolean;
  fetching: boolean;
  nextError: unknown;
  loadNext: () => Promise<{ isError: boolean }>;
  open: (item: T, origin: HTMLButtonElement) => void;
  returnFocus: string | null;
  focused: () => void;
  onResultsElement?: (node: HTMLElement | null) => void;
};
