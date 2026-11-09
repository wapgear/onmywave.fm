import type { Connection } from '../../../shared/types';

export type SettingsSection = 'general' | 'playback' | 'keys' | 'sources' | 'djs';

export type SettingsPageProps = {
  connection: Connection;
  update: (value: Connection) => void;
  disconnected: () => void | Promise<void>;
  artworkGradientEnabled: boolean;
  onArtworkGradientChange: (enabled: boolean) => void;
  section?: SettingsSection;
  onSectionChange?: (value: SettingsSection) => void;
  returnToSetup?: () => void;
};
