import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

import type { NewsCollection, NewsSourceContext } from '../shared/types';

export const MAX_CONTEXT_REQUESTS = 3;

export const MAX_SOURCE_TEXT = 12000;

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

const blocked = new BlockList();

for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['192.88.99.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');

blocked.addSubnet('2001::', 23, 'ipv6');

blocked.addSubnet('2001:db8::', 32, 'ipv6');

blocked.addSubnet('2002::', 16, 'ipv6');

blocked.addSubnet('3fff::', 20, 'ipv6');

const globalV6 = new BlockList();

globalV6.addSubnet('2000::', 3, 'ipv6');

function publicAddress(address: string) {
  return isIP(address) === 4
    ? !blocked.check(address, 'ipv4')
    : isIP(address) === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

function sourceUrl(value: string, base?: URL) {
  const url = new URL(value, base);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.length > 4096 ||
    (url.port && !['80', '443'].includes(url.port))
  )
    throw new Error('Unsupported article URL.');
  url.hash = '';
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    (isIP(host) && !publicAddress(host))
  )
    throw new Error('The article URL is not a public address.');
  return url;
}

async function articleResponse(
  url: URL,
  signal: AbortSignal,
): Promise<{ status: number; location?: string; text?: string }> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  signal.throwIfAborted();
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await new Promise<LookupAddress[]>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        void lookup(host, { all: true, verbatim: true })
          .then(resolve, reject)
          .finally(() => {
            signal.removeEventListener('abort', abort);
          });
      });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address)))
    throw new Error('The article URL does not resolve to a public address.');
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    // Connect to the address just checked while preserving the original Host and TLS server name.
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        signal,
        agent: false,
        family: address.family,
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
        headers: { Accept: 'text/html, application/xhtml+xml, text/plain', 'User-Agent': 'onmywave.fm news reader' },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.destroy();
          resolve({ status, location: response.headers.location });
          return;
        }
        const type = response.headers['content-type']?.split(';')[0].trim().toLowerCase();
        if (
          status !== 200 ||
          !type ||
          !['text/html', 'application/xhtml+xml', 'text/plain'].includes(type) ||
          Number(response.headers['content-length']) > MAX_SOURCE_BYTES ||
          (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')
        ) {
          response.destroy();
          reject(new Error('The source returned an unavailable, unsupported or oversized article.'));
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        response.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > MAX_SOURCE_BYTES) {
            response.destroy(new Error('The article exceeded the size limit.'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          const content = Buffer.concat(chunks).toString('utf8');
          if (type === 'text/plain') {
            resolve({ status, text: content.replace(/\s+/g, ' ').trim().slice(0, MAX_SOURCE_TEXT) });
            return;
          }
          try {
            const { document } = parseHTML(content);
            const article = new Readability(document as unknown as Document, { maxElemsToParse: 20000 }).parse();
            resolve({
              status,
              text: article?.textContent?.replace(/\s+/g, ' ').trim().slice(0, MAX_SOURCE_TEXT) ?? '',
            });
          } catch {
            reject(new Error('Readable article text could not be extracted.'));
          }
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

export async function readNewsSource(value: string, parentSignal: AbortSignal): Promise<NewsSourceContext> {
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(15000)]);
  try {
    signal.throwIfAborted();
    let url = sourceUrl(value);
    for (let hop = 0; hop <= 3; hop++) {
      const response = await articleResponse(url, signal);
      signal.throwIfAborted();
      if (response.location) {
        if (hop === 3) throw new Error('The article redirected too many times.');
        url = sourceUrl(response.location, url);
        continue;
      }
      if (!response.text) throw new Error('The source did not provide readable article text.');
      return { status: 'available', url: url.href, text: response.text, fetchedAt: new Date().toISOString() };
    }
    throw new Error('The article redirected too many times.');
  } catch (error) {
    parentSignal.throwIfAborted();
    return {
      status: 'unavailable',
      reason: signal.aborted
        ? 'The source timed out.'
        : error instanceof Error
          ? error.message.slice(0, 240)
          : 'The source could not be read.',
    };
  }
}

export function validSourceContext(value: unknown): value is NewsSourceContext {
  if (!value || typeof value !== 'object') return false;
  const context = value as NewsSourceContext;
  if (context.status === 'pending' || context.status === 'unavailable')
    return typeof context.reason === 'string' && context.reason.trim().length > 0 && context.reason.length <= 240;
  if (
    context.status !== 'available' ||
    typeof context.url !== 'string' ||
    typeof context.text !== 'string' ||
    !context.text.trim() ||
    context.text.length > MAX_SOURCE_TEXT ||
    typeof context.fetchedAt !== 'string' ||
    !Number.isFinite(Date.parse(context.fetchedAt))
  )
    return false;
  try {
    sourceUrl(context.url);
    return true;
  } catch {
    return false;
  }
}

export function withSourceContext(
  collection: NewsCollection,
  candidateId: string,
  sourceContext: NewsSourceContext,
): NewsCollection {
  const candidate = collection.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error('Unknown news candidate.');
  const warning =
    sourceContext.status === 'unavailable'
      ? `Could not read the linked source for "${candidate.title}": ${sourceContext.reason}`
      : null;
  return {
    ...collection,
    candidates: collection.candidates.map((item) => (item.id === candidateId ? { ...item, sourceContext } : item)),
    ...(warning
      ? {
          incomplete: true,
          warnings: [...collection.warnings, warning],
          sourceResults: collection.sourceResults.map((result) =>
            candidate.sourceIds.includes(result.sourceId)
              ? {
                  ...result,
                  status: result.status === 'failed' ? 'failed' : 'partial',
                  warnings: [...result.warnings, warning],
                }
              : result,
          ),
        }
      : {}),
  };
}
