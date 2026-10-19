import type { Connection } from '../../../shared/types';


export type SettingsSection = 'general' | 'keys' | 'sources' | 'djs';

export type SettingsPageProps = {
  connection: Connection;
  update: (value: Connection) => void;
  disconnected: () => void | Promise<void>;
  section?: SettingsSection;
  onSectionChange?: (value: SettingsSection) => void;
  returnToSetup?: () => void;
};
