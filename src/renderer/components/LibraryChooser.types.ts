import type { Connection } from '../../shared/types';
import type { ConnectionTransition, LibrarySelectionDone } from './LibrarySelection.types';

export type LibraryChooserProps = {
  connection: Connection;
  done: LibrarySelectionDone;
  onChangeAccount?: () => void;
  disabled?: boolean;
  runConnectionTransition?: ConnectionTransition;
};
