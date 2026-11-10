import { Notice, NoticeAction } from '../Notice/Notice.component';
import { ErrorNotice } from '../Shared';
import { useSongRemovalStatus } from './hooks/useSongRemoval';

export function SongRemovalNotice() {
  const status = useSongRemovalStatus();
  const pending = status.data?.pending ?? 0;
  if (status.error || !pending)
    return <ErrorNotice header error={status.error} retry={() => status.refetch()} retrying={status.isFetching} />;

  return (
    <Notice
      header
      tone="warning"
      message={`Removed songs are saved on this device. ${pending} waiting for server confirmation.`}
      actions={
        <NoticeAction busy={status.isFetching} onClick={() => void status.refetch()}>
          {status.isFetching ? 'Syncing…' : 'Retry sync'}
        </NoticeAction>
      }
    />
  );
}
