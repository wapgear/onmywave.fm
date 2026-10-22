import type { CatalogQuery, CatalogRequest, Page, Result } from '../shared/types';
import { unwrap } from './api';

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
