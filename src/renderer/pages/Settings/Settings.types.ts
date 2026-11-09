import type { Connection } from '../../../shared/types';
import type { ArtworkAppearance } from '../../theme.types';

export type SettingsSection = 'general' | 'appearance' | 'playback' | 'keys' | 'sources' | 'djs';

export type SettingsPageProps = {
  connection: Connection;
  update: (value: Connection) => void;
  disconnected: () => void | Promise<void>;
  artworkAppearance: ArtworkAppearance;
  onArtworkAppearanceChange: (option: keyof ArtworkAppearance, enabled: boolean) => void;
  section?: SettingsSection;
  onSectionChange?: (value: SettingsSection) => void;
  returnToSetup?: () => void;
};
