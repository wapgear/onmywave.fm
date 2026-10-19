export type PreviewResource =
  | { kind: 'voice'; voiceId: string }
  | { kind: 'dj'; djId: string; voiceId: string; delivery: string };

export type VoicePreviewProps = {
  resource: PreviewResource;
  label: string;
  playbackId: string;
  activeId?: string;
  onStart?: (id: string) => void;
  active?: boolean;
};
