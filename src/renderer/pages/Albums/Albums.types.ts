import type { Album } from '../../../shared/types';
import type {
  MusicCollectionPageProps,
  MusicCollectionView,
} from '../../components/MusicCollection/MusicCollection.types';

export type AlbumsView = MusicCollectionView<Album>;

export type AlbumsPageProps = Pick<
  MusicCollectionPageProps<Album>,
  'view' | 'setView' | 'add' | 'details' | 'onOpenDetail'
>;
