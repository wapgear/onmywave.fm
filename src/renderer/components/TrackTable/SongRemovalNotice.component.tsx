import { ErrorNotice } from '../Shared';
import { useSongRemovalStatus } from './hooks/useSongRemoval';

import './TrackTable.styles.css';

export function SongRemovalNotice() {
  const status = useSongRemovalStatus();

  return (
    <>
      {(status.data?.pending ?? 0) > 0 && (
        <div className="song-removal-notice" role="status">
          <span>Removed songs are saved on this Mac. {status.data?.pending} waiting for server confirmation.</span>
          <button disabled={status.isFetching} onClick={() => void status.refetch()}>
            {status.isFetching ? 'Syncing…' : 'Retry sync'}
          </button>
        </div>
      )}
      <ErrorNotice error={status.error} retry={() => status.refetch()} retrying={status.isFetching} />
    </>
  );
}
