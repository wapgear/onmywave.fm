import { useRef } from 'react';
import { ListMusic, X } from 'lucide-react';
import { usePlayer } from '../../player';
import { Artwork, TrackDuration } from '../Shared';

export function Queue() {
  const player = usePlayer();
  const root = useRef<HTMLDivElement>(null);
  const index = player.queue.findIndex(item => item.key === player.currentKey);
  const current = player.queue[index];
  const remaining = Math.max(0, player.queue.length - (player.shuffle ? 1 : index + 1));
  function remove(key: string) {
    const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('.queue-remove') ?? [])];
    const at = buttons.findIndex(button => button.dataset.key === key);
    (buttons[at + 1] ?? buttons[at - 1] ?? document.querySelector<HTMLButtonElement>('.drawer-heading button'))?.focus({ preventScroll: true });
    player.removeQueue(key);
  }
  function rows(items: typeof player.queue) {
    return <ol className="queue-list">{items.map(item => <li key={item.key}>
      <button className="queue-track" onClick={() => player.playQueueEntry(item.key)} aria-label={`Play ${item.song.name}`}><Artwork url={item.song.imageUrl} name={item.song.name} /><span><strong>{item.song.name}</strong><small>{item.song.artists.join(', ') || 'Unknown artist'}</small></span></button>
      <span className="queue-time"><TrackDuration seconds={item.song.duration} /></span><button className="icon-button queue-remove" data-key={item.key} onClick={() => remove(item.key)} aria-label={`Remove ${item.song.name} from queue`}><X size={14} /></button>
    </li>)}</ol>;
  }
  return <div ref={root} className="queue-content">
    {!player.queue.length ? <div className="drawer-empty"><ListMusic size={30} strokeWidth={1.4} /><h3>Your queue is empty</h3><p>Play a song or add music to the queue.</p></div> : <>
      {current && <section className="queue-now"><h3>Now Playing</h3><button className="queue-track" onClick={player.toggle} aria-label={`${player.requestedPlaying ? 'Pause' : 'Play'} ${current.song.name}`}><Artwork url={current.song.imageUrl} name={current.song.name} /><span><strong>{current.song.name}</strong><small>{current.song.artists.join(', ') || 'Unknown artist'}</small></span></button></section>}
      <section><div className="queue-section-title"><h3>{player.shuffle ? 'In your queue' : 'Up Next'}</h3><span>{remaining} {remaining === 1 ? 'song' : 'songs'}</span></div>{player.shuffle && <p className="queue-end">Shuffle is on. Songs play in a random order.</p>}{player.shuffle ? rows(player.queue.filter(item => item.key !== player.currentKey)) : index + 1 < player.queue.length ? rows(player.queue.slice(index + 1)) : <p className="queue-end">You’ve reached the end of the queue.</p>}</section>
      {!player.shuffle && index > 0 && <details className="queue-history"><summary>Earlier in this queue · {index}</summary>{rows(player.queue.slice(0, index))}</details>}
    </>}
  </div>;
}
