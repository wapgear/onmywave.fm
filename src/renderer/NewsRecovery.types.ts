import type { NewsRecoveryStatus } from '../shared/types';

export type RecoveryContextValue = {
  status: NewsRecoveryStatus;
  retrying: boolean;
  retryError: boolean;
  recovered: boolean;
  dismissed: boolean;
  retry(): void;
  dismiss(): void;
};

export type NewsRecoveryNoticeProps = {
  onOpenSettings?: () => void;
  focusTarget: () => HTMLElement | null;
  settingsTarget?: () => HTMLElement | null;
};
