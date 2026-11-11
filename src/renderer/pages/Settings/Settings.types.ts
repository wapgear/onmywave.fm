import type { Connection } from '../../../shared/types';
import type { AppearancePreferences } from '../../theme.types';

export type SettingsSection = 'general' | 'appearance' | 'playback' | 'keys' | 'sources' | 'djs';

export type SettingsPageProps = {
  connection: Connection;
  update: (value: Connection) => void;
  disconnected: () => void | Promise<void>;
  appearance: AppearancePreferences;
  onAppearanceChange: (value: AppearancePreferences) => void;
  section?: SettingsSection;
  onSectionChange?: (value: SettingsSection) => void;
  returnToSetup?: () => void;
};
