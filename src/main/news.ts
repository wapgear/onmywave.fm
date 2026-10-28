import { randomUUID } from 'node:crypto';

import { chat, generateSpeech, maxIterations } from '@tanstack/ai';
import { createOpenaiChat } from '@tanstack/ai-openai';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';

import { canonicalArticleUrl } from '../shared/news-pool';
import { normalizeNewsSource } from '../shared/sources';
import { NEWS_TEXT_MODEL } from '../shared/types';
import type {
  DJ,
  NewsArticle,
  NewsCandidate,
  NewsCollection,
  NewsEditorialSelection,
  NewsPreparationPhase,
  NewsProgress,
  NewsScript,
  NewsSettings,
  NewsSource,
  NewsSourceResult,
  Song,
} from '../shared/types';
import { ServiceError } from './jellyfin';
import { isSpokenNewsText, NEWS_SELECTION_INSTRUCTIONS, NEWS_WRITING_INSTRUCTIONS } from './news-prompts';
import { readNewsSource, withSourceContext, MAX_CONTEXT_REQUESTS } from './news-source';
import { NewsSpeechAdapter } from './news-speech';

export type { NewsArticle, NewsScript } from '../shared/types';

export type GeneratedNews = NewsScript & { audio: Buffer; mimeType: 'audio/mpeg'; engine: 'elevenlabs-v4' };

type SourceBatch = { articles: Omit<NewsCandidate, 'sourceIds'>[]; coverageWarnings: string[] };

type Candidate = Omit<NewsCandidate, 'sourceIds'>;

type Input = {
  sources?: NewsSource[];
  mood?: string;
  requestId: string;
  settings: NewsSettings;
  dj: DJ;
  music?: Pick<Song, 'name' | 'artists' | 'album' | 'genres' | 'tags'>;
  importance?: 'major' | 'relevant';
  excludeArticleUrls?: string[];
  freshWithinHours?: number;
  checkpoint?: { collection?: NewsCollection; selection?: NewsEditorialSelection };
  onCollection?: (collection: NewsCollection) => Promise<void>;
  onSelection?: (selection: NewsEditorialSelection) => Promise<void>;
  onScript?: (script: NewsScript) => Promise<void>;
  onPhase?: (phase: NewsPreparationPhase) => Promise<void>;
  onProviderAttempt?: (
    phase: 'selecting' | 'writing' | 'speech',
    outcome: 'pending' | 'rejected' | 'received' | 'uncertain',
  ) => Promise<void>;
};

class DefinitiveProviderRejection extends ServiceError {}

const musicContext = (input: Input, listenerPreferences: string) => ({
  title: input.music?.name.slice(0, 256),
  artists: input.music?.artists.slice(0, 8).map((value) => value.slice(0, 128)),
  album: input.music?.album.slice(0, 256),
  genres: input.music?.genres.slice(0, 12).map((value) => value.slice(0, 128)),
  tags: input.music?.tags.slice(0, 12).map((value) => value.slice(0, 128)),
  listenerPreferences,
});

type XmlNode = Record<string, unknown>;

const node = (value: unknown): XmlNode => (value && typeof value === 'object' ? (value as XmlNode) : {});

const array = (value: unknown): unknown[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

const plain = (value: unknown, max: number): string => {
  const content = typeof value === 'object' ? node(value)['#text'] : value;
  const text = typeof content === 'string' || typeof content === 'number' ? String(content) : '';
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
};

function httpUrl(value: string, base?: string): URL {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || value.length > 4096)
      throw new Error();
    url.hash = '';
    return url;
  } catch {
    throw new ServiceError('invalid', 'Use an HTTP or HTTPS news feed URL without a username or password.');
  }
}

export function validateNewsSettings(value: NewsSettings): NewsSettings {
  if (
    !value ||
    !Array.isArray(value.feedUrls) ||
    value.feedUrls.length > 20 ||
    value.feedUrls.some((url) => typeof url !== 'string') ||
    typeof value.interests !== 'string' ||
    value.interests.length > 4000 ||
    !Number.isInteger(value.minStories) ||
    !Number.isInteger(value.maxStories) ||
    value.minStories < 1 ||
    value.maxStories > 20 ||
    value.minStories > value.maxStories ||
    typeof value.textModel !== 'string' ||
    !/^gpt-[a-z0-9][a-z0-9.-]{0,80}$/.test(value.textModel) ||
    !['openai-tts', 'gpt-live-1', 'elevenlabs-v4'].includes(value.speechEngine) ||
    !Number.isFinite(value.duckVolume) ||
    value.duckVolume < 0 ||
    value.duckVolume > 1 ||
    (value.elevenVoiceId !== undefined &&
      (typeof value.elevenVoiceId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.elevenVoiceId))) ||
    (value.elevenTags !== undefined &&
      (typeof value.elevenTags !== 'string' ||
        value.elevenTags.length > 200 ||
        !/^(?:\[[a-zA-Z ,'-]{1,40}\]\s*){0,4}$/.test(value.elevenTags))) ||
    typeof value.voice !== 'string' ||
    ![
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'fable',
      'nova',
      'onyx',
      'sage',
      'shimmer',
      'verse',
      'marin',
      'cedar',
    ].includes(value.voice)
  ) {
    throw new ServiceError('invalid', 'Check the news sources, voice, and story range of 1 to 20.');
  }
  return {
    ...value,
    speechEngine: 'elevenlabs-v4',
    textModel: NEWS_TEXT_MODEL,
    minStories: 1,
    maxStories: 1,
    duckVolume: Math.min(value.duckVolume, 0.08),
    feedUrls: [...new Set(value.feedUrls.map((value) => httpUrl(value).href))],
  };
}

async function boundedBytes(response: Response, limit: number, signal: AbortSignal): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new ServiceError('unsupported', 'The response was too large.');
  }
  if (!response.body) throw new ServiceError('server', 'The provider returned an empty response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) throw new ServiceError('unsupported', 'The response exceeded the size limit.');
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}

export class NewsService {
  private active: { id: string; controller: AbortController } | null = null;
  private generation = new AbortController();
  constructor(
    private deps: {
      getApiKey: () => Promise<string | null>;
      getTwitterKey?: () => Promise<string | null>;
      getElevenApiKey?: () => Promise<string | null>;
      canGenerate?: () => boolean;
      onProgress?: (progress: NewsProgress) => void;
    },
  ) {}
  generationSignal() {
    if (this.deps.canGenerate?.() === false || this.generation.signal.aborted)
      throw new ServiceError('invalid', 'Sign in before starting another news or voice request.');
    return this.generation.signal;
  }
  cancelGeneration() {
    this.generation.abort();
    this.cancel();
  }
  resumeGeneration() {
    if (this.generation.signal.aborted) this.generation = new AbortController();
  }
  cancel(requestId?: string): void {
    if (this.active && (!requestId || this.active.id === requestId)) {
      this.active.controller.abort();
      this.active = null;
    }
  }
  private async run<T>(
    input: Input,
    operation: (settings: NewsSettings, key: string, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(input.requestId))
      throw new ServiceError('invalid', 'Invalid news request.');
    const settings = validateNewsSettings(input.settings);
    if (!(input.sources?.length ?? settings.feedUrls.length))
      throw new ServiceError('invalid', 'Choose at least one news source.');
    if (input.sources && input.sources.length > 20) throw new ServiceError('invalid', 'Choose at most 20 sources.');
    if (this.active)
      throw new ServiceError('invalid', 'Another news preparation is running. Finish or cancel it first.');
    const active = { id: input.requestId, controller: new AbortController() };
    const signal = AbortSignal.any([active.controller.signal, this.generationSignal()]);
    this.active = active;
    const timer = setTimeout(() => active.controller.abort(), 240000);
    try {
      const key = await this.deps.getApiKey();
      signal.throwIfAborted();
      if (!key) throw new ServiceError('invalid', 'Add your OpenAI API key before generating a news break.');
      const result = await operation(settings, key, signal);
      signal.throwIfAborted();
      return result;
    } catch (error) {
      if (signal.aborted) throw new ServiceError('timeout', 'News generation stopped or reached its time limit.');
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('server', 'Could not prepare the news break. Check the connection and try again.');
    } finally {
      clearTimeout(timer);
      if (this.active === active) this.active = null;
    }
  }
  private async feed(address: string, parentSignal: AbortSignal): Promise<SourceBatch> {
    const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(15000)]);
    let target = httpUrl(address);
    let response: Response | undefined;
    for (let hop = 0; hop <= 3; hop++) {
      response = await fetch(target, {
        signal,
        redirect: 'manual',
        headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || hop === 3) throw new ServiceError('server', 'The feed redirected too many times.');
      target = httpUrl(location, target.href);
    }
    if (!response?.ok) throw new ServiceError('server', 'The news feed is unavailable.');
    const xml = (await boundedBytes(response, 2 * 1024 * 1024, signal)).toString('utf8');
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || XMLValidator.validate(xml) !== true)
      throw new ServiceError('invalid', 'The source did not return supported RSS or Atom XML.');
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
      trimValues: true,
    });
    const document = node(parser.parse(xml));
    const channel = node(node(document.rss).channel || node(document.RDF).channel);
    const atom = node(document.feed);
    const source = plain(channel.title || atom.title, 160) || target.hostname;
    const entries = channel.item !== undefined ? array(channel.item) : array(atom.entry || node(document.RDF).item);
    if (!Object.keys(channel).length && !Object.keys(atom).length && !document.RDF)
      throw new ServiceError('invalid', 'The source is not an RSS or Atom feed.');
    const result: Candidate[] = [];
    let malformed = 0;
    for (const entry of entries.slice(0, 50)) {
      const item = node(entry);
      const title = plain(item.title, 240);
      const links = array(item.link);
      const link = links.find(
        (link) => typeof link === 'string' || !node(link)['@_rel'] || node(link)['@_rel'] === 'alternate',
      );
      const rawLink = typeof link === 'string' ? link : plain(node(link)['@_href'], 4096);
      if (!title || !rawLink) {
        malformed++;
        continue;
      }
      let url: URL;
      try {
        url = httpUrl(rawLink, target.href);
      } catch {
        malformed++;
        continue;
      }
      const rawDate = plain(item.pubDate || item.published || item.updated || item.date, 100);
      const timestamp = rawDate ? Date.parse(rawDate) : NaN;
      if (Number.isFinite(timestamp) && (timestamp < Date.now() - 7 * 86400000 || timestamp > Date.now() + 300000))
        continue;
      result.push({
        id: randomUUID(),
        title,
        url: url.href,
        source,
        publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined,
        summary: plain(item.description || item.summary || item.encoded || item.content, 1500),
      });
    }
    return {
      articles: result,
      coverageWarnings: malformed
        ? [
            `${malformed} feed ${malformed === 1 ? 'entry could' : 'entries could'} not be read because a title or valid story link was missing.`,
          ]
        : [],
    };
  }
  private async source(source: NewsSource, parentSignal: AbortSignal): Promise<SourceBatch> {
    const normalized = normalizeNewsSource(source);
    if (normalized.kind === 'rss') return this.feed(normalized.url, parentSignal);
    const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(15000)]);
    const json = async (url: string, headers?: Record<string, string>): Promise<unknown> => {
      const response = await fetch(url, { signal, redirect: 'error', headers });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ServiceError(
          'server',
          normalized.kind === 'twitter'
            ? `Twitter search failed (${response.status}). Check the bearer token, search query, API access and credits in Settings.`
            : `Hacker News is unavailable (${response.status}).`,
        );
      }
      return JSON.parse((await boundedBytes(response, 2 * 1024 * 1024, signal)).toString('utf8'));
    };
    if (normalized.kind === 'twitter') {
      const key = await this.deps.getTwitterKey?.();
      if (!key) throw new ServiceError('invalid', 'Add a Twitter bearer token in Settings → Provider keys.');
      const url = new URL('https://api.x.com/2/tweets/search/recent');
      url.searchParams.set('query', normalized.query!);
      url.searchParams.set('max_results', '25');
      url.searchParams.set('tweet.fields', 'created_at');
      const payload = node(await json(url.href, { Authorization: `Bearer ${key}` }));
      const partial = payload.errors !== undefined && (!Array.isArray(payload.errors) || payload.errors.length > 0);
      const posts = Array.isArray(payload.data) ? payload.data : [];
      const count = node(payload.meta).result_count;
      const invalidData =
        payload.data === undefined
          ? count !== 0
          : !Array.isArray(payload.data) || (count !== undefined && count !== posts.length);
      let malformed = 0;
      const articles = posts.flatMap((value) => {
        const post = node(value);
        const text = typeof post.text === 'string' ? plain(post.text, 1500) : '';
        const date = typeof post.created_at === 'string' ? Date.parse(post.created_at) : NaN;
        if (typeof post.id !== 'string' || !/^\d+$/.test(post.id) || !text || !Number.isFinite(date)) {
          malformed++;
          return [];
        }
        if (date < Date.now() - 7 * 86400000 || date > Date.now() + 300000) return [];
        return [
          {
            id: randomUUID(),
            title: text.slice(0, 240),
            summary: text,
            url: `https://x.com/i/web/status/${post.id}`,
            source: normalized.name,
            publishedAt: new Date(date).toISOString(),
          },
        ];
      });
      if (partial && !articles.length)
        throw new ServiceError('server', 'Twitter returned a search error. Check the query and API access.');
      return {
        articles,
        coverageWarnings: [
          ...(partial ? ['Twitter returned only partial search results. Check the query and API access.'] : []),
          ...(invalidData ? ['Twitter returned unreadable search results. Coverage is incomplete.'] : []),
          ...(malformed
            ? [`${malformed} Twitter post${malformed === 1 ? '' : 's'} could not be read. Coverage is incomplete.`]
            : []),
        ],
      };
    }
    const ids = await json(normalized.url);
    if (!Array.isArray(ids)) throw new ServiceError('server', 'Hacker News returned an invalid story list.');
    const invalidIds = ids.filter((id) => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0).length;
    const requestedIds = ids.filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 20);
    const outcomes = await Promise.allSettled(
      requestedIds.map((id) => json(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)),
    );
    const stories: Candidate[] = [];
    let malformed = 0;
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.status !== 'fulfilled') continue;
      const story = node(outcome.value);
      if (story.id !== requestedIds[index]) {
        malformed++;
        continue;
      }
      if (
        story.deleted === true ||
        story.dead === true ||
        ['job', 'comment', 'poll', 'pollopt'].some((type) => type === story.type)
      )
        continue;
      const date = typeof story.time === 'number' ? story.time * 1000 : NaN;
      if (
        story.type === 'story' &&
        Number.isFinite(date) &&
        (date < Date.now() - 7 * 86400000 || date > Date.now() + 300000)
      )
        continue;
      const title = typeof story.title === 'string' ? plain(story.title, 240) : '';
      if (story.type !== 'story' || !title || !Number.isFinite(date)) {
        malformed++;
        continue;
      }
      let url: URL;
      try {
        if (story.url !== undefined && typeof story.url !== 'string') throw new Error('Invalid story URL');
        url = httpUrl(
          story.url === undefined
            ? `https://news.ycombinator.com/item?id=${requestedIds[index]}`
            : (story.url as string),
        );
      } catch {
        malformed++;
        continue;
      }
      stories.push({
        id: randomUUID(),
        title,
        summary: plain(story.text, 1500),
        source: normalized.name,
        url: url.href,
        publishedAt: new Date(date).toISOString(),
      });
    }
    const failed = outcomes.filter((outcome) => outcome.status === 'rejected').length;
    return {
      articles: stories,
      coverageWarnings: [
        ...(failed
          ? [`${failed} of ${outcomes.length} Hacker News story requests failed. Coverage is incomplete.`]
          : []),
        ...(invalidIds ? ['Hacker News returned invalid story IDs; those entries were skipped.'] : []),
        ...(malformed
          ? [
              `${malformed} Hacker News story response${malformed === 1 ? '' : 's'} could not be read. Coverage is incomplete.`,
            ]
          : []),
      ],
    };
  }
  private async openai(
    key: string,
    path: string,
    body: unknown,
    signal: AbortSignal,
    onDispatch: () => void,
  ): Promise<Response> {
    signal.throwIfAborted();
    onDispatch();
    const response = await fetch(`https://api.openai.com/v1/${path}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.status === 401)
      throw new DefinitiveProviderRejection(
        'invalid',
        'OpenAI did not accept the API key. Update it in Settings → Provider keys.',
      );
    if (response.status === 403 || response.status === 404)
      throw new DefinitiveProviderRejection('unsupported', 'This OpenAI model is unavailable for your API key.');
    if (response.status === 429)
      throw new DefinitiveProviderRejection('server', 'OpenAI rate or billing limits prevented this news break.');
    if (!response.ok)
      throw new ServiceError('server', `OpenAI could not complete the news break (${response.status}).`);
    return response;
  }
  private editorialContext(input: Input) {
    const editorial = {
      instructions: input.dj.instructions,
      musicPreferences: input.dj.musicPreferences,
      exclusions: input.dj.exclusions,
    };
    for (const [field, label] of [
      ['instructions', 'host instructions'],
      ['musicPreferences', 'music preferences'],
      ['exclusions', 'exclusions'],
    ] as const) {
      if (typeof editorial[field] !== 'string' || editorial[field].length > 20_000)
        throw new ServiceError(
          'invalid',
          `Edit this DJ's ${label}: use text of up to 20,000 characters. No text request was sent.`,
        );
    }
    for (const [value, label, limit] of [
      [input.dj.name, 'DJ name', 256],
      [input.dj.language, 'DJ language', 128],
      [input.dj.personality, 'DJ personality', 4000],
      [input.mood ?? '', 'station mood', 4000],
      [input.settings.interests, 'news interests', 4000],
    ] as const)
      if (typeof value !== 'string' || value.length > limit)
        throw new ServiceError('invalid', `Edit ${label}: use text of up to ${limit} characters.`);
    return editorial;
  }

  private async collect(input: Input, settings: NewsSettings, signal: AbortSignal): Promise<NewsCollection> {
    await input.onPhase?.('collecting');
    this.deps.onProgress?.({ requestId: input.requestId, phase: 'feeds', message: 'Reading your news sources…' });
    const sources =
      input.sources ??
      settings.feedUrls.map((url, index) => ({ id: `feed-${index}`, name: httpUrl(url).hostname, url }));
    const outcomes = await Promise.allSettled(sources.map((source) => this.source(source, signal)));
    signal.throwIfAborted();
    const candidates: NewsCandidate[] = [];
    const warnings: string[] = [];
    const sourceResults: NewsSourceResult[] = [];
    const candidateByUrl = new Map<string, NewsCandidate>();
    let incomplete = false;
    let undatedSkipped = false;
    const urls = new Set(
      (input.excludeArticleUrls ?? [])
        .map((value) => canonicalArticleUrl(value))
        .filter((value): value is string => Boolean(value)),
    );
    const cutoff = input.freshWithinHours === undefined ? null : Date.now() - input.freshWithinHours * 60 * 60 * 1000;
    outcomes.forEach((outcome, index) => {
      const source = sources[index];
      if (outcome.status === 'rejected') {
        const sourceWarning = `Could not read ${source.name}: ${outcome.reason instanceof ServiceError ? outcome.reason.message : 'Check the source and try again.'}`;
        warnings.push(sourceWarning);
        sourceResults.push({ sourceId: source.id, status: 'failed', articleCount: 0, warnings: [sourceWarning] });
        incomplete = true;
        return;
      }
      const sourceWarnings = outcome.value.coverageWarnings.map((warning) => `${source.name}: ${warning}`);
      warnings.push(...sourceWarnings);
      sourceResults.push({
        sourceId: source.id,
        status: sourceWarnings.length ? 'partial' : 'complete',
        articleCount: outcome.value.articles.length,
        warnings: sourceWarnings,
      });
      if (sourceWarnings.length) incomplete = true;
      for (const article of outcome.value.articles) {
        const url = httpUrl(article.url).href;
        const canonical = canonicalArticleUrl(url);
        const published = article.publishedAt ? Date.parse(article.publishedAt) : NaN;
        if (canonical && !urls.has(canonical) && cutoff !== null && !Number.isFinite(published)) undatedSkipped = true;
        if (
          canonical &&
          (!urls.has(canonical) || candidateByUrl.has(canonical)) &&
          (cutoff === null || (Number.isFinite(published) && published >= cutoff && published <= Date.now())) &&
          (candidateByUrl.has(canonical) || candidates.length < 200)
        ) {
          urls.add(canonical);
          const duplicate = candidateByUrl.get(canonical);
          if (duplicate) {
            if (!duplicate.sourceIds.includes(source.id)) duplicate.sourceIds.push(source.id);
          } else {
            const candidate: NewsCandidate = {
              ...article,
              url,
              id: `story-${candidates.length + 1}`,
              sourceIds: [source.id],
            };
            candidates.push(candidate);
            candidateByUrl.set(canonical, candidate);
          }
        }
      }
    });
    if (undatedSkipped)
      warnings.push('Entries without publication dates were skipped because their freshness could not be verified.');
    if (candidates.some((article) => !article.publishedAt))
      warnings.push('Some feed entries have no publication date. Their freshness could not be verified.');
    return {
      candidates,
      sourceResults,
      warnings,
      collectedAt: new Date().toISOString(),
      incomplete,
    };
  }

  private async providerResponse<T extends z.ZodType>(
    input: Input,
    phase: 'selecting' | 'writing',
    key: string,
    instructions: string,
    context: unknown,
    schema: T,
    signal: AbortSignal,
  ): Promise<z.infer<T>> {
    await input.onProviderAttempt?.(phase, 'pending');
    let dispatched = false;
    let transportError: unknown;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.throwIfAborted();
    signal.addEventListener('abort', abort, { once: true });
    try {
      const adapter = createOpenaiChat(NEWS_TEXT_MODEL, key, {
        baseURL: 'https://api.openai.com/v1',
        maxRetries: 0,
        timeout: 120000,
        fetch: async (url, init) => {
          try {
            const address = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
            if (address !== 'https://api.openai.com/v1/responses' || typeof init?.body !== 'string')
              throw new ServiceError('invalid', 'Unexpected AI news endpoint.');
            const response = await this.openai(key, 'responses', JSON.parse(init.body), signal, () => {
              dispatched = true;
            });
            const bytes = await boundedBytes(response, 256 * 1024, signal);
            return new Response(new Uint8Array(bytes), { status: response.status, headers: response.headers });
          } catch (error) {
            transportError = error;
            throw error;
          }
        },
      });
      const result = await chat({
        adapter,
        threadId: input.requestId,
        systemPrompts: [instructions],
        messages: [{ role: 'user', content: JSON.stringify(context) }],
        outputSchema: schema,
        stream: false,
        abortController: controller,
        retry: { maxRetries: 0 },
        agentLoopStrategy: maxIterations(1),
        reasoning: 'off',
        modelOptions: { max_output_tokens: 300, store: false },
        debug: false,
      });
      return schema.parse(result);
    } catch (error) {
      const failure = transportError ?? error;
      await input.onProviderAttempt?.(
        phase,
        failure instanceof DefinitiveProviderRejection || !dispatched ? 'rejected' : 'uncertain',
      );
      throw failure;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  private async select(
    input: Input,
    settings: NewsSettings,
    editorial: ReturnType<NewsService['editorialContext']>,
    collection: NewsCollection,
    key: string,
    signal: AbortSignal,
  ): Promise<NewsEditorialSelection | { candidateId: string; reasonCode: 'needs-context'; reason: string }> {
    await input.onPhase?.('selecting');
    this.deps.onProgress?.({
      requestId: input.requestId,
      phase: 'writing',
      message: 'Choosing a story for this room…',
    });
    const candidates = collection.candidates;
    const payload = await this.providerResponse(
      input,
      'selecting',
      key,
      NEWS_SELECTION_INSTRUCTIONS,
      {
        importance: input.importance ?? 'relevant',
        interests: settings.interests,
        exclusions: editorial.exclusions,
        contextRequestsRemaining: MAX_CONTEXT_REQUESTS - candidates.filter((item) => item.sourceContext).length,
        candidates,
      },
      z.object({
        candidateId: z.enum(candidates.map((candidate) => candidate.id)).nullable(),
        reasonCode: z.enum(['selected', 'needs-context', 'no-match', 'excluded', 'insufficient-evidence', 'not-major']),
        reason: z.string(),
      }),
      signal,
    );
    const candidateId = payload.candidateId;
    const reasonCode = payload.reasonCode;
    const reason = typeof payload.reason === 'string' ? payload.reason.trim().slice(0, 240) : '';
    const hasSelection =
      typeof candidateId === 'string' && candidates.some((candidate) => candidate.id === candidateId);
    const candidate = candidates.find((item) => item.id === candidateId);
    if (
      reasonCode === 'needs-context' &&
      candidate &&
      !candidate.sourceContext &&
      reason &&
      candidates.filter((item) => item.sourceContext).length < MAX_CONTEXT_REQUESTS
    ) {
      return { candidateId: candidate.id, reasonCode, reason };
    }
    const noSelection = candidateId === null;
    const validReason = hasSelection
      ? reasonCode === 'selected' && (!candidate?.sourceContext || candidate.sourceContext.status === 'available')
      : noSelection && ['no-match', 'excluded', 'insufficient-evidence', 'not-major'].includes(String(reasonCode));
    if ((!hasSelection && !noSelection) || !validReason || !reason) {
      await input.onProviderAttempt?.('selecting', 'uncertain');
      throw new ServiceError('server', 'OpenAI returned an invalid editorial decision.');
    }
    return {
      candidateId: hasSelection ? (candidateId as string) : null,
      reasonCode: reasonCode as NewsEditorialSelection['reasonCode'],
      reason,
      decidedAt: new Date().toISOString(),
    };
  }

  private async write(
    input: Input,
    settings: NewsSettings,
    editorial: ReturnType<NewsService['editorialContext']>,
    collection: NewsCollection,
    selection: NewsEditorialSelection,
    key: string,
    signal: AbortSignal,
  ): Promise<NewsScript> {
    const candidate = collection.candidates.find((item) => item.id === selection.candidateId);
    if (!candidate || selection.reasonCode !== 'selected')
      throw new ServiceError('invalid', 'A persisted story selection is required before writing.');
    await input.onPhase?.('writing');
    this.deps.onProgress?.({ requestId: input.requestId, phase: 'writing', message: 'Writing the spoken story…' });
    const payload = await this.providerResponse(
      input,
      'writing',
      key,
      NEWS_WRITING_INSTRUCTIONS,
      {
        candidate,
        interests: settings.interests,
        exclusions: editorial.exclusions,
        userStyle: {
          name: input.dj.name,
          language: input.dj.language,
          personality: input.dj.personality,
          instructions: editorial.instructions,
          mood: input.mood?.slice(0, 4000),
          music: musicContext(input, editorial.musicPreferences),
        },
      },
      z.object({ script: z.string() }),
      signal,
    );
    const script = typeof payload.script === 'string' ? payload.script.trim() : '';
    if (!isSpokenNewsText(script)) {
      await input.onProviderAttempt?.('writing', 'uncertain');
      throw new ServiceError('server', 'OpenAI returned spoken text outside the allowed length or format.');
    }
    const article: NewsArticle = {
      id: candidate.id,
      title: candidate.title,
      url: candidate.url,
      source: candidate.source,
      publishedAt: candidate.publishedAt,
    };
    const result: NewsScript = {
      requestId: input.requestId,
      script,
      articles: [article],
      warnings: collection.warnings,
      selection,
    };
    await input.onScript?.(result);
    return result;
  }

  private async script(input: Input, settings: NewsSettings, key: string, signal: AbortSignal): Promise<NewsScript> {
    const editorial = this.editorialContext(input);
    let collection = input.checkpoint?.collection;
    if (!collection) {
      collection = await this.collect(input, settings, signal);
      await input.onCollection?.(collection);
    }
    signal.throwIfAborted();
    if (!collection.candidates.length) {
      if (collection.incomplete && collection.sourceResults.some((source) => source.status !== 'failed'))
        throw new ServiceError(
          'partial-coverage',
          `${collection.warnings.join(' ')} News coverage is incomplete; try again.`,
        );
      if (collection.incomplete)
        throw new ServiceError('server', `${collection.warnings.join(' ')} News sources are unavailable.`);
      throw new ServiceError('no-news', `No recent news. Music continues. ${collection.warnings.join(' ')}`.trim());
    }
    let selection = input.checkpoint?.selection;
    while (!selection) {
      const pending: NewsCandidate | undefined = collection.candidates.find(
        (candidate) => candidate.sourceContext?.status === 'pending',
      );
      if (pending) {
        this.deps.onProgress?.({
          requestId: input.requestId,
          phase: 'writing',
          message: 'Reading the linked news article…',
        });
        const sourceContext = await readNewsSource(pending.url, signal);
        signal.throwIfAborted();
        collection = withSourceContext(collection, pending.id, sourceContext);
        await input.onCollection?.(collection);
        continue;
      }
      const decision = await this.select(input, settings, editorial, collection, key, signal);
      if (decision.reasonCode === 'needs-context') {
        collection = withSourceContext(collection, decision.candidateId, {
          status: 'pending',
          reason: decision.reason,
        });
        await input.onCollection?.(collection);
      } else {
        selection = decision;
        await input.onSelection?.(selection);
      }
    }
    if (!selection.candidateId) {
      if (collection.incomplete)
        throw new ServiceError(
          'partial-coverage',
          `No story was selected from the sources that could be read. Coverage is incomplete. ${collection.warnings.join(' ')}`,
        );
      throw new ServiceError('no-news', `No qualifying news. Music continues. ${collection.warnings.join(' ')}`.trim());
    }
    return this.write(input, settings, editorial, collection, selection, key, signal);
  }
  prepareScript(input: Input): Promise<NewsScript> {
    return this.run(input, (settings, key, signal) => this.script(input, settings, key, signal));
  }
  async renderPreparedSpeech(
    input: Input & { engine: 'elevenlabs-v4' },
    script: NewsScript,
    signal: AbortSignal,
  ): Promise<GeneratedNews> {
    signal = AbortSignal.any([signal, this.generationSignal()]);
    signal.throwIfAborted();
    const settings = validateNewsSettings(input.settings);
    if (input.engine !== 'elevenlabs-v4') throw new ServiceError('invalid', 'Use ElevenLabs to generate voice audio.');
    const elevenKey = await this.deps.getElevenApiKey?.();
    if (!elevenKey) throw new ServiceError('invalid', 'Add your ElevenLabs API key before rendering speech.');
    signal.throwIfAborted();
    this.deps.onProgress?.({
      requestId: input.requestId,
      phase: 'speech',
      message: 'Rendering the Eleven v4 DJ clip…',
    });
    await input.onPhase?.('speech');
    await input.onProviderAttempt?.('speech', 'pending');
    const voiceId = settings.elevenVoiceId || 'JBFqnCBsd6RMkjVDRZzb';
    const result = await generateSpeech({
      adapter: new NewsSpeechAdapter(async () => {
        let response: Response;
        try {
          response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
            {
              method: 'POST',
              redirect: 'error',
              signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
              headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
              body: JSON.stringify({
                model_id: 'eleven_v4',
                text: `${settings.elevenTags || ''} ${script.script}`.trim(),
                voice_settings: { stability: 0.5, similarity_boost: 0.75 },
              }),
            },
          );
        } catch (error) {
          await input.onProviderAttempt?.('speech', 'uncertain');
          throw error;
        }
        if (response.status === 401) {
          await input.onProviderAttempt?.('speech', 'rejected');
          throw new ServiceError(
            'invalid',
            'ElevenLabs did not accept the API key. Update it in Settings → Provider keys.',
          );
        }
        if ([403, 404, 422].includes(response.status)) {
          await input.onProviderAttempt?.('speech', 'rejected');
          throw new ServiceError(
            'unsupported',
            'Eleven v4 or this voice is unavailable for your key. Check model access, voice ID, and text-to-speech permission.',
          );
        }
        if (response.status === 429) {
          await input.onProviderAttempt?.('speech', 'rejected');
          throw new ServiceError('server', 'ElevenLabs rate or credit limits prevented this DJ clip.');
        }
        if (!response.ok) {
          await input.onProviderAttempt?.('speech', 'uncertain');
          throw new ServiceError('server', `ElevenLabs could not render the clip (${response.status}).`);
        }
        const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (contentType && !contentType.startsWith('audio/') && contentType !== 'application/octet-stream') {
          await input.onProviderAttempt?.('speech', 'uncertain');
          throw new ServiceError('server', 'ElevenLabs did not return audio. Check the provider status and try again.');
        }
        let audio: Buffer;
        try {
          audio = await boundedBytes(response, 24 * 1024 * 1024, signal);
        } catch (error) {
          await input.onProviderAttempt?.('speech', 'uncertain');
          throw error;
        }
        if (audio.length < 100) {
          await input.onProviderAttempt?.('speech', 'uncertain');
          throw new ServiceError('server', 'ElevenLabs returned an empty speech clip.');
        }
        signal.throwIfAborted();
        return audio;
      }),
      threadId: input.requestId,
      text: script.script,
      voice: voiceId,
      format: 'mp3',
      abortSignal: signal,
      debug: false,
    });
    const audio = Buffer.from(result.audio, 'base64');
    return { ...script, audio, mimeType: 'audio/mpeg', engine: 'elevenlabs-v4' };
  }
}
