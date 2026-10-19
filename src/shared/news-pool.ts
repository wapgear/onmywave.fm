import type { LocalState, PreparedNewsTake } from './types';
import { djPreparationKey } from './dj-avatar';

const stable = (value: unknown) => JSON.stringify(value);
const trackingParams = /^(utm_.+|fbclid|gclid|mc_cid|mc_eid|igshid)$/i;
export function canonicalArticleUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80'))
      url.port = '';
    const bbcArticle = url.hostname === 'www.bbc.co.uk' && /^\/news\/articles\/[^/]+\/?$/.test(url.pathname);
    // Snapshot keys: deleting while iterating live URLSearchParams skips adjacent parameters.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const key of [...url.searchParams.keys()])
      if (trackingParams.test(key) || (bbcArticle && /^at_(medium|campaign)$/i.test(key))) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch {
    return null;
  }
}
const sourceIdentity = (sources: LocalState['sources']) =>
  sources
    .map((source) => ({ id: source.id, url: source.url }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.url.localeCompare(b.url));

/** True when a saved take was prepared for this room's current editorial setup. */
export function matchesNewsRoom(take: PreparedNewsTake, state: LocalState, roomId: string): boolean {
  const profile = state.roomProfiles.find((value) => value.id === roomId);
  if (!profile) return false;
  const dj = state.djs.find((value) => value.id === profile.room.djId);
  if (!dj?.news || take.provenance.dj.id !== dj.id || djPreparationKey(take.provenance.dj) !== djPreparationKey(dj))
    return false;
  if (take.provenance.mood !== profile.mood) return false;
  const interests = profile.workflowDraft.newsInterests ?? dj.news.interests;
  if ((take.provenance.newsInterests ?? take.provenance.dj.news?.interests ?? '') !== interests) return false;
  const sources = [...new Set(profile.room.sourceIds)]
    .map((id) => state.sources.find((source) => source.id === id))
    .filter((source): source is NonNullable<typeof source> => Boolean(source));
  if (stable(sourceIdentity(take.provenance.sources)) !== stable(sourceIdentity(sources))) return false;
  return take.provenance.roomId === undefined || take.provenance.roomId === roomId;
}

/** Read-only view of ready, fresh takes; claim remains an atomic main-process action. */
export function eligibleNewsTakes(
  takes: PreparedNewsTake[],
  state: LocalState,
  roomId: string,
  now = Date.now(),
): PreparedNewsTake[] {
  const cutoff = now - 24 * 60 * 60 * 1000;
  if (!state.roomProfiles.find((value) => value.id === roomId)?.enabled) return [];
  const reservedOrConsumed = new Set(
    takes
      .filter((take) => ['claimed', 'started', 'played'].includes(take.deliveryState?.status ?? ''))
      .flatMap((take) =>
        take.articles.map((article) => canonicalArticleUrl(article.url)).filter((url): url is string => Boolean(url)),
      ),
  );
  const candidates = takes
    .filter(
      (take) =>
        take.available &&
        matchesNewsRoom(take, state, roomId) &&
        take.deliveryState?.status !== 'played' &&
        take.deliveryState?.status !== 'claimed' &&
        take.deliveryState?.status !== 'started' &&
        take.articles.some((article) => {
          const published = article.publishedAt ? Date.parse(article.publishedAt) : NaN;
          const prepared = Date.parse(take.createdAt);
          return Number.isFinite(published)
            ? published >= cutoff && published <= now
            : Number.isFinite(prepared) && prepared >= cutoff && prepared <= now;
        }),
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const seenUrls = new Set(reservedOrConsumed);
  return candidates.filter((take) => {
    const urls = take.articles.map((article) => canonicalArticleUrl(article.url));
    if (urls.some((url) => !url || seenUrls.has(url))) return false;
    for (const url of urls) if (url) seenUrls.add(url);
    return true;
  });
}
