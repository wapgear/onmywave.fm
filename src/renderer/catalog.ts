import type { CatalogQuery, CatalogRequest, Page, Result } from '../shared/types';
import { unwrap, WaveError } from './api';

export function isCatalogConnectionError(error: unknown): error is WaveError {
  return error instanceof WaveError && (error.code === 'offline' || error.code === 'timeout');
}

export function catalogInlineError(error: unknown) {
  return isCatalogConnectionError(error) ? null : error;
}

export async function readCatalog<T>(
  read: (request: CatalogRequest) => Promise<Result<Page<T>>>,
  query: CatalogQuery,
  signal: AbortSignal,
): Promise<Page<T>> {
  signal.throwIfAborted();
  const requestId = crypto.randomUUID();
  let abort: () => void = () => {};
  const canceled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      void window.wave.cancelCatalog(requestId).catch(() => {});
      reject(new DOMException('Catalog request canceled.', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([read({ ...query, requestId }).then(unwrap), canceled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
