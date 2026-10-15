import type { NewsSource } from './types';

export function normalizeNewsSource(source: NewsSource): NewsSource {
  if (!source || typeof source.id !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(source.id)
    || typeof source.name !== 'string' || !source.name.trim() || source.name.length > 256) throw new Error('Give this source a name.');
  const kind = source.kind ?? 'rss';
  if (!['rss', 'twitter', 'hacker-news'].includes(kind)) throw new Error('Choose a supported source type.');
  if (typeof source.url !== 'string' || source.url.length > 4096) throw new Error('Enter a complete source URL.');
  const url = new URL(source.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS URL without credentials.');
  url.hash = '';
  const base = { id: source.id, name: source.name.trim(), kind };
  if (kind === 'twitter') {
    if (typeof source.query !== 'string' || !source.query.trim() || source.query.trim().length > 512) throw new Error('Enter a Twitter search of up to 512 characters.');
    const query = source.query.trim();
    return { ...base, query, url: `https://x.com/search?q=${encodeURIComponent(query)}` };
  }
  if (kind === 'hacker-news' && (url.origin !== 'https://hacker-news.firebaseio.com' || !/^\/v0\/(topstories|newstories|beststories)\.json$/.test(url.pathname) || url.search)) throw new Error('Choose Top, New, or Best Hacker News stories.');
  return { ...base, url: url.href };
}
