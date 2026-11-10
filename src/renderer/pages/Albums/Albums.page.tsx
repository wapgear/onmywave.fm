import type { Album } from '../../../shared/types';
import { readCatalog } from '../../catalog';
import {
  initialMusicCollectionView,
  MusicCollectionPage,
} from '../../components/MusicCollection/MusicCollectionPage.component';
import { ArtistLink } from '../../components/SongLinks/SongLinks.component';
import type { AlbumsPageProps } from './Albums.types';

export const initialAlbumsView = () => initialMusicCollectionView<Album>();

export function AlbumsPage(props: AlbumsPageProps) {
  return (
    <MusicCollectionPage
      {...props}
      label="Album"
      loadPage={(query, signal) => readCatalog(window.wave.albums, query, signal)}
      loadMetadata={(id) => window.wave.album(id)}
      loadTracks={(id) => window.wave.albumTracks(id)}
      subtitle={(album) => `${album.artist || 'Unknown artist'}${album.year ? ` · ${album.year}` : ''}`}
      detailSubtitle={(album) => (
        <>
          <ArtistLink name={album.artist || 'Unknown artist'} />
          {album.year ? ` · ${album.year}` : ''}
        </>
      )}
    />
  );
}
