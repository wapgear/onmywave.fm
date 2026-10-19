import type { DJ } from '../../../../shared/types';
import { VoicePreview } from './VoicePreview.component';

const defaultVoiceId = 'JBFqnCBsd6RMkjVDRZzb';

export function DJPreview({
  dj,
  activeId,
  onStart,
}: {
  dj: DJ;
  activeId: string | null;
  onStart: (id: string) => void;
}) {
  const resource = {
    kind: 'dj' as const,
    djId: dj.id,
    voiceId: dj.news?.elevenVoiceId || defaultVoiceId,
    delivery: dj.news?.elevenTags || '',
  };
  return (
    <div className="dj-preview">
      <VoicePreview
        key={JSON.stringify(resource)}
        resource={resource}
        label={dj.name}
        playbackId={dj.id}
        activeId={activeId ?? undefined}
        onStart={onStart}
      />
    </div>
  );
}
