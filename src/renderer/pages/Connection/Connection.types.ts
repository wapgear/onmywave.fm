import type { Connection } from '../../../shared/types';
import type { ConnectionTransition } from '../../components/LibrarySelection.types';


export type ConnectionPageProps = {
  connection: Connection | null;
  expired: boolean;
  connected: (value: Connection) => void | Promise<void>;
  librariesSelected: (value: Connection) => void | Promise<void>;
  runConnectionTransition: ConnectionTransition;
};
