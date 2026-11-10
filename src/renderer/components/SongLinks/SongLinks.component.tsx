import { useQuery } from '@tanstack/react-query';
import { createContext, Fragment, useContext, type ReactNode } from 'react';

import type { Album, Artist, Song } from '../../../shared/types';
import { unwrap } from '../../api';

import './SongLinks.styles.css';

type SongNavigation = {
  openArtist: (artist: Artist, source: HTMLButtonElement) => void;
  openAlbum: (album: Album, source: HTMLButtonElement) => void;
};

const Navigation = createContext<(SongNavigation & { artists: Artist[] }) | null>(null);

export function SongNavigationProvider({ children, ...navigation }: SongNavigation & { children: ReactNode }) {
  const artists = useQuery({
    queryKey: ['artists', 'list'],
    queryFn: async () => unwrap(await window.wave.artists()),
    staleTime: 60_000,
    retry: false,
  });

  return <Navigation value={{ ...navigation, artists: artists.data ?? [] }}>{children}</Navigation>;
}

export function ArtistLink({ name, artist }: { name: string; artist?: Artist }) {
  const navigation = useContext(Navigation);
  const target =
    artist ?? navigation?.artists.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (!target || !navigation) return <>{name}</>;

  return (
    <button className="song-metadata-link" onClick={(event) => navigation.openArtist(target, event.currentTarget)}>
      {name}
    </button>
  );
}

export function SongArtists({ song }: { song: Song }) {
  if (!song.artists.length) return <>Unknown artist</>;

  return song.artists.map((name, index) => (
    <Fragment key={`${index}:${name}`}>
      {index > 0 && ', '}
      <ArtistLink name={name} artist={song.artistItems?.find((item) => item.name === name)} />
    </Fragment>
  ));
}

export function SongAlbum({ song }: { song: Song }) {
  const navigation = useContext(Navigation);
  if (!song.albumId || !navigation) return <>{song.album || 'Unknown album'}</>;

  return (
    <button
      className="song-metadata-link"
      onClick={(event) =>
        navigation.openAlbum(
          {
            id: song.albumId!,
            name: song.album || 'Unknown album',
            artist: song.albumArtist || song.artists.join(', '),
          },
          event.currentTarget,
        )
      }
    >
      {song.album || 'Unknown album'}
    </button>
  );
}
