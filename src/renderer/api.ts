import type { ApiError, Result } from '../shared/types';


export class WaveError extends Error {
  readonly code: ApiError['code'];
  readonly authRevision?: number;
  constructor(error: ApiError) {
    super(error.message);
    this.name = 'WaveError';
    this.code = error.code;
    this.authRevision = error.authRevision;
  }
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new WaveError(result.error);
  return result.value;
}
