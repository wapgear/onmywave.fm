import type { PreparedNewsLibrary } from '../../../../shared/types';

export type PreparedTakesProps = {
  library: PreparedNewsLibrary;
  refresh: () => Promise<void>;
  active?: boolean;
};
