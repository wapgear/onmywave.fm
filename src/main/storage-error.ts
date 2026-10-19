import { ServiceError } from './jellyfin';


export class StorageError extends ServiceError {
  constructor(message = 'Local news data could not be read or saved. Your existing files were preserved.') {
    super('server', message);
  }
}
