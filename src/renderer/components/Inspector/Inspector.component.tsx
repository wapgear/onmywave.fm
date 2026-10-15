import { useQuery } from '@tanstack/react-query';
import { unwrap } from '../../api';
import type { Song } from '../../../shared/types';
import { Artwork, duration, ErrorNotice } from '../Shared';
const positive = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
function fileSize(bytes: number | undefined) {
  if (!positive(bytes)) return 'Unavailable';
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1000)));
  return `${(bytes / 1000 ** index).toLocaleString(undefined, { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
}
export function Inspector({ song: selected }: { song: Song }) {
  const detail = useQuery({ queryKey: ['song', selected.id], queryFn: async () => unwrap(await window.wave.song(selected.id)) });
  const song = detail.data ?? selected;
  const unavailable = detail.isPending ? 'Loading…' : 'Unavailable';
  return <section className="song-inspector"><Artwork url={song.imageUrl} name={song.name} className="inspector-art" /><h2>{song.name || 'Untitled song'}</h2><p className="inspector-artist">{song.artists.join(', ') || 'Unknown artist'}</p><ErrorNotice error={detail.error} retry={() => void detail.refetch()} /><dl>{[
    ['Album', song.album || 'Unknown album'], ['Album artist', song.albumArtist], ['Genre', song.genres.join(', ')], ['Year', positive(song.year) ? song.year : undefined], ['Duration', positive(song.duration) ? duration(song.duration) : 'Unavailable'], ['Track', positive(song.trackNumber) ? song.trackNumber : undefined], ['Disc', positive(song.discNumber) ? song.discNumber : undefined], ['Format', song.container], ['Codec', song.codec?.toUpperCase() || unavailable], ['Bitrate', positive(song.bitRate) ? `${Math.round(song.bitRate / 1000).toLocaleString()} kbps` : unavailable], ['Sample rate', positive(song.sampleRate) ? `${(song.sampleRate / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} kHz` : unavailable], ['File size', positive(song.size) ? fileSize(song.size) : unavailable],
  ].filter(([, value]) => value !== undefined && value !== '').map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>{song.tags.length > 0 && <div className="tag-list">{song.tags.map(tag => <span className="pill" key={tag}>{tag}</span>)}</div>}</section>;
}
