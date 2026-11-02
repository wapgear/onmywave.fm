import type { Artist } from '../../../shared/types';
import { unwrap } from '../../api';
import type { MusicCollectionPageProps } from '../../components/MusicCollection/MusicCollection.types';
import {
  initialMusicCollectionView,
  MusicCollectionPage,
} from '../../components/MusicCollection/MusicCollectionPage.component';

export const initialArtistsView = () => initialMusicCollectionView<Artist>();

type ArtistsPageProps = Pick<MusicCollectionPageProps<Artist>, 'view' | 'setView' | 'add' | 'details' | 'onOpenDetail'>;

export function ArtistsPage(props: ArtistsPageProps) {
  return (
    <MusicCollectionPage
      {...props}
      label="Artist"
      loadPage={async (query, signal, client) => {
        const artists = await client.fetchQuery({
          queryKey: ['artists', 'list'],
          queryFn: async () => unwrap(await window.wave.artists()),
          staleTime: 60_000,
          retry: false,
        });
        signal.throwIfAborted();
        const term = query.search?.trim().toLocaleLowerCase() ?? '';
        const items = artists.filter((artist) => artist.name.toLocaleLowerCase().includes(term));
        const start = query.start ?? 0;
        return { items: items.slice(start, start + (query.limit ?? 48)), total: items.length, start };
      }}
      loadTracks={(id) => window.wave.artistTracks(id)}
    />
  );
}
