import { useQuery } from '@tanstack/react-query';
import type { DJ } from '../../../../shared/types';
import { unwrap } from '../../../api';
import { ErrorNotice } from '../../../components/Shared';
import { VoicePreview } from './VoicePreview.component';

const defaultVoiceId = 'JBFqnCBsd6RMkjVDRZzb';

export function DJPreview({ dj, activeId, onStart }: { dj: DJ; activeId: string | null; onStart: (id: string) => void }) {
  const voiceId = dj.news?.elevenVoiceId || defaultVoiceId;
  const legacy = useQuery({ queryKey: ['djVoicePreview', dj.id, voiceId, dj.news?.elevenTags], queryFn: async () => unwrap(await window.wave.getDJVoicePreview(dj.id)), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  return <div className="dj-preview"><ErrorNotice error={legacy.error} retry={() => void legacy.refetch()} /><VoicePreview key={voiceId} voiceId={voiceId} label={dj.name} playbackId={dj.id} activeId={activeId ?? undefined} onStart={onStart} legacyPreview={legacy.data} legacyLoading={legacy.isPending} /></div>;
}
