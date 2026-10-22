const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));

const servicePath = path.join(process.cwd(), 'src/main/jellyfin.ts');
const baselineRef = process.argv.find((arg) => arg.startsWith('--baseline-ref='))?.slice('--baseline-ref='.length);
const benchmarkOnly = process.argv.includes('--benchmark-only');
const source = baselineRef
  ? execFileSync('git', ['show', `${baselineRef}:src/main/jellyfin.ts`], { encoding: 'utf8' })
  : fs.readFileSync(servicePath, 'utf8');
const sourceSha256 = crypto.createHash('sha256').update(source).digest('hex');
require.extensions['.ts'] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
const serviceModule = new Module(servicePath, module);
serviceModule.filename = servicePath;
serviceModule.paths = Module._nodeModulePaths(path.dirname(servicePath));
serviceModule._compile(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  servicePath,
);
const { JellyfinService } = serviceModule.exports;

const PAGE_SIZE = 500;
const UI_PAGE_SIZE = 80;
const DELAY_MS = 8;
const ITERATIONS = 5;
const uid = (n) => n.toString(16).padStart(32, '0');
const song = (n, mode, libraryIndex) => ({
  Id: uid(n),
  Name: mode === 'title' ? `Needle title ${n}` : `Song ${String(n).padStart(5, '0')}`,
  SortName: mode === 'title' ? `Needle title ${n}` : `Song ${String(n).padStart(5, '0')}`,
  Artists: [mode === 'artist' ? 'Needle artist' : `Artist ${libraryIndex}`],
  ArtistId: mode === 'artist' ? uid(900000 + libraryIndex) : uid(800000 + libraryIndex),
  Album: mode === 'album' ? 'Needle album' : `Album ${libraryIndex}`,
  AlbumId: mode === 'album' ? uid(910000 + libraryIndex) : uid(810000 + libraryIndex),
  AlbumArtist: `Artist ${libraryIndex}`,
  Genres: n % 2 === 0 ? ['Rock'] : ['Jazz'],
  Tags: n % 3 === 0 ? ['Favorite'] : ['Archive'],
  ProductionYear: 2000 + n % 5,
  IndexNumber: n % 20,
  ParentIndexNumber: Math.floor((n % 40) / 20),
  RunTimeTicks: 1800000000,
  DateCreated: new Date(Date.UTC(2020, 0, 1 + n % 100)).toISOString(),
});

function fixture(libraryCount) {
  const itemsByLibrary = Array.from({ length: libraryCount }, (_, libraryIndex) => {
    const total = libraryCount === 1 ? 12000 : 4200;
    return Array.from({ length: total }, (_, index) => {
      const mode = index % 4 === 0 ? 'title' : index % 4 === 1 ? 'artist' : index % 4 === 2 ? 'album' : 'none';
      const item = song(libraryIndex * 20000 + index + 1, mode, libraryIndex);
      return mode === 'none' && index === 3 ? { ...item, Name: 'Song tie', SortName: 'Song tie' } : item;
    });
  });
  if (libraryCount > 1) itemsByLibrary[1][100].Id = itemsByLibrary[0][100].Id;
  const libraryIds = itemsByLibrary.map((_, index) => uid(2000 + index));
  let requestCount = 0;
  let active = 0;
  let peakActive = 0;
  let held = null;
  let failure = null;
  const requestLog = [];

  global.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const params = url.searchParams;
    const parentIndex = Math.max(0, libraryIds.indexOf(params.get('ParentId')));
    const catalog = itemsByLibrary[parentIndex] || [];
    requestCount += 1;
    active += 1;
    peakActive = Math.max(peakActive, active);
    requestLog.push({ path: url.pathname, search: url.search });
    try {
      if (failure?.(url)) return Response.json({}, { status: 500 });
      await new Promise((resolve, reject) => {
        const gate = held;
        const onAbort = () => {
          clearTimeout(timer);
          reject(init.signal.reason || new DOMException('Aborted', 'AbortError'));
        };
        const finish = () => {
          init.signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        const timer = gate ? undefined : setTimeout(finish, DELAY_MS);
        init.signal?.addEventListener('abort', onAbort, { once: true });
        gate?.then(finish, reject);
      });
      let items;
      if (url.pathname.endsWith('/Artists') || url.pathname.endsWith('/Artists/AlbumArtists')) {
        const term = params.get('SearchTerm')?.toLowerCase();
        items = ['needle', 'needle artist'].includes(term)
          ? Array.from({ length: libraryCount }, (_, index) => ({ Id: uid(900000 + index), Name: 'Needle artist' }))
          : [];
      } else if (params.get('IncludeItemTypes') === 'MusicAlbum') {
        if (params.has('SearchTerm')) {
          items = ['needle', 'needle album'].includes(params.get('SearchTerm').toLowerCase())
            ? Array.from({ length: libraryCount }, (_, index) => ({ Id: uid(910000 + index), Name: 'Needle album' }))
            : [];
        } else {
          items = [];
        }
      } else {
        items = catalog;
        if (params.has('SearchTerm')) items = items.filter((item) => item.Name.toLowerCase().includes(params.get('SearchTerm').toLowerCase()));
        if (params.has('ArtistIds')) {
          const ids = new Set(params.get('ArtistIds').split(','));
          items = catalog.filter((item) => ids.has(item.ArtistId));
        }
        if (params.has('AlbumIds')) {
          const ids = new Set(params.get('AlbumIds').split(','));
          items = catalog.filter((item) => ids.has(item.AlbumId));
          const falsePositive = catalog.find((item) => item.Name === 'Song tie');
          if (falsePositive) items = [...items, falsePositive];
        }
        if (params.has('Genres')) items = items.filter((item) => item.Genres?.includes(params.get('Genres')));
        if (params.has('Tags')) items = items.filter((item) => item.Tags?.includes(params.get('Tags')));
      }
      const start = Number(params.get('StartIndex') || 0);
      const limit = Number(params.get('Limit') || PAGE_SIZE);
      return Response.json({ Items: items.slice(start, start + limit), TotalRecordCount: items.length });
    } finally {
      active -= 1;
    }
  };
  return {
    itemsByLibrary,
    libraryIds,
    requestLog,
    get requestCount() { return requestCount; },
    get active() { return active; },
    get peakActive() { return peakActive; },
    holdRequests() {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      held = gate;
      return () => { held = null; release(); };
    },
    failRequestsWhen(predicate) { failure = predicate; },
    resetMetrics() { requestCount = 0; active = 0; peakActive = 0; requestLog.length = 0; },
  };
}

const fixtureSha256 = crypto
  .createHash('sha256')
  .update([uid.toString(), song.toString(), fixture.toString(), PAGE_SIZE, UI_PAGE_SIZE, DELAY_MS, ITERATIONS].join('\n'))
  .digest('hex');

const sessionFor = (libraryIds) => ({
  serverUrl: 'https://fixture.invalid',
  token: 'fixture',
  userId: uid(1000),
  userName: 'verification',
  serverVersion: 'fixture',
  selectedLibraryIds: libraryIds,
  sessionOnly: true,
});
const summarize = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)),
    maxMs: Number(sorted.at(-1).toFixed(2)),
    samplesMs: samples.map((value) => Number(value.toFixed(2))),
  };
};

async function measure({ libraries, kind }) {
  const data = fixture(libraries);
  const service = new JellyfinService({ deviceId: 'verification', imageUrl: (id) => id });
  service.restore(sessionFor(data.libraryIds));
  const times = [];
  const requests = [];
  const peaks = [];
  const heapDelta = [];
  const uniqueCounts = [];
  const baselineHeap = process.memoryUsage().heapUsed;
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    data.resetMetrics();
    if (global.gc) global.gc();
    const heapBefore = process.memoryUsage().heapUsed;
    const started = performance.now();
    let page;
    if (kind === 'browse') {
      if (libraries > 1) {
        page = await service.songs({ start: 0, limit: UI_PAGE_SIZE, sort: 'name' });
      } else {
        page = await service.songs({ start: iteration % 2 ? 80 : 0, limit: UI_PAGE_SIZE, sort: 'name' });
      }
    } else {
      page = await service.songs({ search: 'Needle', start: 0, limit: UI_PAGE_SIZE, sort: 'name' });
    }
    times.push(performance.now() - started);
    requests.push(data.requestCount);
    peaks.push(data.peakActive);
    uniqueCounts.push(page.total);
    heapDelta.push(Math.max(0, process.memoryUsage().heapUsed - heapBefore));
  }
  return {
    libraries,
    kind,
    iterations: ITERATIONS,
    fixtureSongs: data.itemsByLibrary.reduce((sum, list) => sum + list.length, 0),
    expectedSearchMatches: kind === 'search'
      ? data.itemsByLibrary.reduce((sum, list) => sum + list.length / 4 * 3, 0) - (libraries > 1 ? 1 : 0)
      : undefined,
    firstPageLatency: summarize(times),
    upstreamRequests: { median: [...requests].sort((a, b) => a - b)[Math.floor(requests.length / 2)], samples: requests },
    peakConcurrentRequests: Math.max(...peaks),
    resultCounts: uniqueCounts,
    heapGrowthBytes: { samples: heapDelta, baselineHeapBytes: baselineHeap },
    controlledDelayPerRequestMs: DELAY_MS,
  };
}

async function waitUntil(predicate, description) {
  const deadline = performance.now() + 3000;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
function expectedSort(data, sort, descending) {
  const byId = new Map(data.itemsByLibrary.flat().map((item) => [item.Id, item]));
  return (left, right) => {
    const a = byId.get(left.id);
    const b = byId.get(right.id);
    let value = 0;
    if (sort === 'dateAdded') value = (Date.parse(a.DateCreated || '') || 0) - (Date.parse(b.DateCreated || '') || 0);
    if (sort === 'year') value = (a.ProductionYear || 0) - (b.ProductionYear || 0);
    if (sort === 'artist') value = collator.compare(a.Artists?.[0] || a.AlbumArtist || '', b.Artists?.[0] || b.AlbumArtist || '');
    if (sort === 'album') value = collator.compare(a.Album || '', b.Album || '') || (a.ParentIndexNumber || 0) - (b.ParentIndexNumber || 0) || (a.IndexNumber || 0) - (b.IndexNumber || 0);
    value ||= collator.compare(a.SortName || a.Name || '', b.SortName || b.Name || '') || a.Id.localeCompare(b.Id);
    return descending ? -value : value;
  };
}

async function collectSearch(service, search) {
  const first = await service.songs({ ...search, start: 0, limit: 500 });
  const result = [...first.items];
  for (let start = result.length; start < first.total; start += 500) {
    const page = await service.songs({ ...search, start, limit: 500 });
    result.push(...page.items);
  }
  return result;
}

async function verifyServiceContracts() {
  const outcomes = [];
  const note = (name, details = {}) => outcomes.push({ name, result: 'passed', ...details });
  const data = fixture(3);
  const service = new JellyfinService({ deviceId: 'verification', imageUrl: (id) => id });
  service.restore(sessionFor(data.libraryIds));
  const search = { search: 'Needle', start: 0, limit: 80, sort: 'name' };

  data.resetMetrics();
  const first = await service.songs(search);
  const callsAfterFirstPage = data.requestCount;
  const gathered = [...first.items];
  for (let start = first.items.length; start < first.total; start += 500) {
    const page = await service.songs({ ...search, start, limit: 500 });
    gathered.push(...page.items);
    assert.equal(page.total, first.total);
  }
  assert.equal(new Set(gathered.map((item) => item.id)).size, first.total);
  assert.equal(first.total, 9449, 'global search should deduplicate one shared cross-library item');
  assert.ok(gathered.some((item) => item.name.toLowerCase().includes('needle')), 'title matches are retained');
  assert.ok(gathered.some((item) => item.artists.includes('Needle artist')), 'artist relation matches are retained');
  assert.ok(gathered.some((item) => item.album === 'Needle album'), 'album relation matches are retained');
  const nameOrder = expectedSort(data, 'name', false);
  for (let index = 1; index < gathered.length; index += 1)
    assert.ok(nameOrder(gathered[index - 1], gathered[index]) <= 0, `global name ordering failed at index ${index}`);
  assert.equal(data.requestCount, callsAfterFirstPage, 'later pages must reuse the complete search snapshot');
  assert.ok(!gathered.some((item) => item.id === uid(4)), 'wrong-album track returned by Jellyfin must be excluded');
  note('exact union, global order, cross-library dedup, and search snapshot reuse', {
    total: first.total,
    firstPageRequests: callsAfterFirstPage,
    laterPageRequests: 0,
  });

  data.resetMetrics();
  const filtered = await service.songs({ ...search, genre: 'Rock', tag: 'Favorite' });
  assert.ok(filtered.total > 0 && filtered.total < first.total);
  assert.ok(filtered.items.every((item) => item.genres.includes('Rock') && item.tags.includes('Favorite')));
  note('search filters are applied to returned song candidates', { total: filtered.total });

  for (const sort of ['name', 'artist', 'album', 'year', 'dateAdded']) {
    for (const descending of [false, true]) {
      const rows = await collectSearch(service, { search: 'Needle', sort, descending });
      const compare = expectedSort(data, sort, descending);
      for (let index = 1; index < rows.length; index += 1)
        assert.ok(compare(rows[index - 1], rows[index]) <= 0, `${sort} ${descending ? 'descending' : 'ascending'} order failed at ${index}`);
    }
  }
  note('adversarial sort ties across every catalog sort and direction');

  data.resetMetrics();
  const albums = await service.albums({ ...search, limit: 80 });
  assert.equal(albums.total, 3);
  const albumCalls = data.requestCount;
  await service.albums({ ...search, start: 80, limit: 80 });
  assert.equal(data.requestCount, albumCalls, 'album search later pages must reuse the completed snapshot');
  note('album search uses the same cancellable snapshot contract', { total: albums.total, laterPageRequests: 0 });

  const retryData = fixture(1);
  const retryService = new JellyfinService({ deviceId: 'verification', imageUrl: (id) => id });
  retryService.restore(sessionFor(retryData.libraryIds));
  const releaseFinal = retryData.holdRequests();
  const finalController = new AbortController();
  const finalPending = retryService.songs(search, finalController.signal);
  await waitUntil(() => retryData.active > 0, 'first request for final-subscriber cancellation');
  finalController.abort();
  const reattachedPending = retryService.songs(search);
  await waitUntil(() => retryData.requestCount >= 2, 'immediate same-key reattach after last cancellation');
  const finalError = await finalPending.then(() => null, (error) => error);
  assert.equal(finalError?.name, 'AbortError', 'caller cancellation must stay distinct from timeout/failure');
  releaseFinal();
  const retryPage = await reattachedPending;
  assert.equal(retryPage.total, 9000, 'a later request must retry after cancellation');
  note('last subscriber cancellation stops work and same-key retry succeeds', {
    rejectionName: finalError?.name,
    rejectionCode: finalError?.code,
    retryTotal: retryPage.total,
  });

  const sharedData = fixture(1);
  const sharedService = new JellyfinService({ deviceId: 'verification', imageUrl: (id) => id });
  sharedService.restore(sessionFor(sharedData.libraryIds));
  const releaseShared = sharedData.holdRequests();
  const one = new AbortController();
  const two = new AbortController();
  const onePending = sharedService.songs(search, one.signal);
  const twoPending = sharedService.songs(search, two.signal);
  await waitUntil(() => sharedData.active > 0, 'shared search request');
  one.abort();
  const oneError = await onePending.then(() => null, (error) => error);
  assert.ok(oneError, 'cancelled subscriber must reject');
  assert.ok(sharedData.active > 0, 'one subscriber must not cancel the shared fetch');
  releaseShared();
  const sharedPage = await twoPending;
  assert.equal(sharedPage.total, 9000);
  const sharedCalls = sharedData.requestCount;
  await sharedService.songs({ ...search, start: 80 });
  assert.equal(sharedData.requestCount, sharedCalls, 'survivor completion must publish a reusable snapshot');
  note('cancelling the initiator leaves a waiter active and publishes a reusable snapshot', { survivorTotal: sharedPage.total });

  const preAbortedData = fixture(1);
  const preAbortedService = new JellyfinService({ deviceId: 'verification', imageUrl: (id) => id });
  preAbortedService.restore(sessionFor(preAbortedData.libraryIds));
  const preAborted = new AbortController();
  preAborted.abort();
  const preAbortedError = await preAbortedService.songs(search, preAborted.signal).then(() => null, (error) => error);
  assert.equal(preAbortedError?.name, 'AbortError');
  assert.equal(preAbortedData.requestCount, 0, 'pre-aborted requests must not touch the provider');
  note('pre-aborted request is rejected before any fetch');

  const sessionData = fixture(1);
  const sessionService = new JellyfinService({ deviceId: 'verification', imageUrl: (id) => id });
  sessionService.restore(sessionFor(sessionData.libraryIds));
  const releaseSession = sessionData.holdRequests();
  const sessionPending = sessionService.songs(search);
  await waitUntil(() => sessionData.active > 0, 'session-bound catalog request');
  sessionService.restore({ ...sessionFor(sessionData.libraryIds), token: 'replacement' });
  const sessionError = await sessionPending.then(() => null, (error) => error);
  assert.ok(sessionError, 'session change must reject old-session work');
  await waitUntil(() => sessionData.active === 0, 'session change abort');
  releaseSession();
  const afterSession = await sessionService.songs(search);
  assert.equal(afterSession.total, 9000);
  note('session replacement cancels old load and permits a fresh search');

  const failureData = fixture(3);
  const failureService = new JellyfinService({ deviceId: 'verification', imageUrl: (id) => id });
  failureService.restore(sessionFor(failureData.libraryIds));
  const releaseFailedSearch = failureData.holdRequests();
  failureData.failRequestsWhen((url) => url.pathname === '/Artists');
  const failedSearch = await failureService.songs(search).then(() => null, (error) => error);
  assert.equal(failedSearch?.code, 'server');
  await waitUntil(() => failureData.active === 0, 'search sibling requests cancelled after artist discovery failure');
  assert.ok(failureData.requestLog.some((request) => request.search.includes('ParentId=')), 'sibling title/album branches must have started');
  failureData.failRequestsWhen(null);
  releaseFailedSearch();
  const recoveredSearch = await failureService.songs(search);
  assert.equal(recoveredSearch.total, 9449, 'failed discovery must be retryable');
  note('artist discovery failure aborts sibling branches and permits retry');

  const browseFailureData = fixture(3);
  const browseFailureService = new JellyfinService({ deviceId: 'verification', imageUrl: (id) => id });
  browseFailureService.restore(sessionFor(browseFailureData.libraryIds));
  const releaseFailedBrowse = browseFailureData.holdRequests();
  browseFailureData.failRequestsWhen((url) => url.searchParams.get('ParentId') === browseFailureData.libraryIds[1]);
  const failedBrowse = await browseFailureService.songs({ start: 0, limit: 80, sort: 'name' }).then(() => null, (error) => error);
  assert.equal(failedBrowse?.code, 'server');
  await waitUntil(() => browseFailureData.active === 0, 'browse sibling requests cancelled after one library fails');
  assert.ok(browseFailureData.requestLog.filter((request) => request.search.includes('ParentId=')).length > 1);
  browseFailureData.failRequestsWhen(null);
  releaseFailedBrowse();
  const recoveredBrowse = await browseFailureService.songs({ start: 0, limit: 80, sort: 'name' });
  assert.equal(recoveredBrowse.total, 12599, 'failed multi-library view must be retryable');
  note('one browse library failure aborts sibling page loads and permits retry');

  const capData = fixture(1);
  const capService = new JellyfinService({ deviceId: 'verification', imageUrl: (id) => id });
  capService.restore(sessionFor(capData.libraryIds));
  const terms = ['Needle', 'Needle title', 'Needle title 1', 'Needle title 2', 'Needle title 3', 'Needle title 4'];
  await Promise.all(terms.map((term) => capService.songs({ ...search, search: term })));
  assert.ok(capData.peakActive <= 4, `service-wide catalog cap exceeded: ${capData.peakActive}`);
  note('concurrent distinct searches share service-wide limit', { peakConcurrentRequests: capData.peakActive, limit: 4 });

  return outcomes;
}

(async () => {
  const scenarios = [];
  for (const libraries of [1, 3]) {
    scenarios.push(await measure({ libraries, kind: 'browse' }));
    scenarios.push(await measure({ libraries, kind: 'search' }));
  }
  const serviceContracts = benchmarkOnly ? [] : await verifyServiceContracts();
  console.log(JSON.stringify({
    verification: 'JellyfinService integration with deterministic fixture fetch; no live server/provider requests',
    generatedAt: new Date().toISOString(),
    repositoryHead: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    serviceRef: baselineRef || 'working-tree',
    jellyfinSourceSha256: sourceSha256,
    fixtureSha256,
    delayMs: DELAY_MS,
    iterations: ITERATIONS,
    scenarios,
    serviceContracts,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
