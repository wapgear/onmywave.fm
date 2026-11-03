import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), 'onmywave-removal-'));
const servers = [];

async function loadServices() {
  const jellyfinBundle = join(temp, 'jellyfin.mjs');
  const storeBundle = join(temp, 'song-removals.mjs');
  await Promise.all([
    build({
      entryPoints: [join(root, 'src/main/jellyfin.ts')],
      outfile: jellyfinBundle,
      bundle: true,
      platform: 'node',
      format: 'esm',
    }),
    build({
      entryPoints: [join(root, 'src/main/song-removals.ts')],
      outfile: storeBundle,
      bundle: true,
      platform: 'node',
      format: 'esm',
    }),
  ]);
  const [{ JellyfinService }, { SongRemovalStore }] = await Promise.all([
    import(pathToFileURL(jellyfinBundle)),
    import(pathToFileURL(storeBundle)),
  ]);
  return { JellyfinService, SongRemovalStore };
}

function makeCatalog() {
  return Array.from({ length: 8 }, (_, index) => {
    const id = String(index + 1).padStart(12, '0');
    const n = String(index + 1).padStart(2, '0');
    return {
      Id: `00000000-0000-4000-8000-${id}`,
      Name: `Song ${n}`,
      Type: 'Audio',
      Artists: ['Fixture Artist'],
      Album: 'Fixture Album',
      RunTimeTicks: 1800000000,
    };
  });
}

function startFakeJellyfin(catalog) {
  const jobs = new Map();
  const requests = new Set();
  const rejectPosts = new Set();
  const tokenUsers = new Map();
  const postCount = new Map();
  let blockNextPost = false;
  let blockedPostStarted;
  let releaseBlockedPost;
  const blockedPost = new Promise((resolveStarted) => {
    blockedPostStarted = resolveStarted;
  });

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const token = /Token="([^"]+)"/.exec(request.headers.authorization ?? '')?.[1];
    const userId = tokenUsers.get(token);
    const reply = (status, data) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(data));
    };
    if (!userId) return reply(401, { error: 'unauthorized' });

    const removalPath = url.pathname.match(/^\/OnMyWave\/RemovedSongs(?:\/([a-f\d-]+))?$/i);
    if (removalPath && request.method === 'POST' && removalPath[1]) {
      const songId = removalPath[1].replaceAll('-', '').toLowerCase();
      postCount.set(songId, (postCount.get(songId) ?? 0) + 1);
      if (rejectPosts.has(songId)) return reply(503, { error: 'fixture-offline' });
      if (blockNextPost) {
        blockNextPost = false;
        blockedPostStarted();
        await new Promise((resolveRequest) => {
          releaseBlockedPost = resolveRequest;
        });
      }
      let body = '';
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      const key = songId;
      let job = jobs.get(key);
      if (!job) {
        job = {
          songId,
          removedAt: payload.removedAt,
          purgeAfter: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
        jobs.set(key, job);
      }
      requests.add(`${userId}|${songId}`);
      return reply(200, job);
    }
    if (removalPath && request.method === 'GET' && !removalPath[1]) {
      const items = [...requests]
        .filter((entry) => entry.startsWith(`${userId}|`))
        .map((entry) => jobs.get(entry.slice(userId.length + 1)));
      return reply(200, { items });
    }

    if (url.pathname === '/Artists' || url.pathname === '/Artists/AlbumArtists') return reply(200, { Items: [], TotalRecordCount: 0 });
    if (/^\/Users\/[a-f\d-]+\/Items$/.test(url.pathname)) {
      let items = url.searchParams.get('IncludeItemTypes') === 'MusicAlbum' ? [] : catalog;
      const search = url.searchParams.get('SearchTerm')?.toLowerCase();
      if (search) items = items.filter((item) => item.Name.toLowerCase().includes(search));
      const start = Number(url.searchParams.get('StartIndex') ?? 0);
      const limit = Number(url.searchParams.get('Limit') ?? 100);
      return reply(200, { Items: items.slice(start, start + limit), TotalRecordCount: items.length });
    }
    return reply(404, { error: 'not-found' });
  });

  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      servers.push(server);
      const address = server.address();
      resolveServer({
        url: `http://127.0.0.1:${address.port}`,
        tokenUsers,
        jobs,
        requests,
        rejectPosts,
        postCount,
        blockedPost,
        blockPost() {
          blockNextPost = true;
        },
        releasePost() {
          releaseBlockedPost?.();
          releaseBlockedPost = undefined;
        },
      });
    });
  });
}

function makeService(JellyfinService, store, baseUrl, userId, token) {
  const service = new JellyfinService({
    deviceId: 'song-removal-verification',
    imageUrl: (id) => id,
    removals: store,
  });
  service.restore({
    serverUrl: baseUrl,
    token,
    userId,
    userName: 'Fixture listener',
    serverVersion: '10.11.0',
    selectedLibraryIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
    sessionOnly: false,
  });
  return service;
}

async function main() {
  const { JellyfinService, SongRemovalStore } = await loadServices();
  const catalog = makeCatalog();
  const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const userC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const serverA = await startFakeJellyfin(catalog);
  const serverB = await startFakeJellyfin(catalog);
  for (const server of [serverA, serverB]) {
    server.tokenUsers.set('token-user-a', userA);
    server.tokenUsers.set('token-user-b', userB);
    server.tokenUsers.set('token-user-c', userC);
  }

  const store = new SongRemovalStore(temp);
  const serviceA = makeService(JellyfinService, store, serverA.url, userA, 'token-user-a');
  const initial = await serviceA.songs({ start: 0, limit: 2, sort: 'name' });
  assert.equal(initial.total, catalog.length, 'initial library total is complete');
  assert.deepEqual(initial.items.map((song) => song.name), ['Song 01', 'Song 02']);

  serverA.blockPost();
  const firstId = catalog[0].Id;
  let timer;
  const concurrent = await Promise.race([
    Promise.all([serviceA.removeSong(firstId), serviceA.removeSong(firstId)]),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('local mark waited for server acknowledgement')), 5000);
    }),
  ]).finally(() => clearTimeout(timer));
  assert.equal(concurrent[0].removedAt, concurrent[1].removedAt, 'concurrent duplicate removals return the first receipt');
  assert.equal((await store.list(`${serverA.url}|${userA}`)).length, 1, 'the local record is durable before the POST finishes');
  await serverA.blockedPost;
  serverA.releasePost();
  await serviceA.removedSongs();
  assert.equal(serverA.postCount.get(firstId.replaceAll('-', '')), 1, 'single-flight sync posts a duplicate only once');

  const removeLeading = catalog.slice(1, 5).map((song) => serviceA.removeSong(song.Id));
  await Promise.all(removeLeading);
  const synced = await serviceA.removedSongs();
  assert.equal(synced.pending, 0, 'accepted server records clear the outbox');
  let page = await serviceA.songs({ start: 0, limit: 2, sort: 'name' });
  assert.equal(page.total, 3, 'total counts only songs that remain visible');
  assert.deepEqual(page.items.map((song) => song.name), ['Song 06', 'Song 07'], 'all leading pages are skipped without losing visible songs');
  page = await serviceA.songs({ start: 2, limit: 2, sort: 'name' });
  assert.deepEqual(page.items.map((song) => song.name), ['Song 08'], 'pagination continues from the filtered offset');

  const unsupportedId = catalog[5].Id;
  serverA.rejectPosts.add(unsupportedId.replaceAll('-', '').toLowerCase());
  await serviceA.removeSong(unsupportedId);
  const offlineStatus = await serviceA.removedSongs();
  assert.equal(offlineStatus.pending, 1, 'failed server sync remains pending');
  assert.ok(offlineStatus.syncError, 'failed server sync is reported');
  assert.ok(!(await serviceA.songs({ start: 0, limit: 20, sort: 'name' })).items.some((song) => song.id === unsupportedId), 'pending local removal stays hidden');

  const userBService = makeService(JellyfinService, store, serverA.url, userB, 'token-user-b');
  assert.equal((await userBService.removedSongs()).songs.length, 0, 'one Jellyfin user does not inherit another user’s removals');
  assert.equal((await userBService.songs({ start: 0, limit: 20, sort: 'name' })).items.length, catalog.length);
  const serverBService = makeService(JellyfinService, store, serverB.url, userA, 'token-user-a');
  assert.equal((await serverBService.removedSongs()).songs.length, 0, 'another Jellyfin server has an independent local ledger');

  const importService = makeService(JellyfinService, store, serverA.url, userC, 'token-user-c');
  const beforeImport = await importService.songs({ start: 0, limit: 20, search: 'Song', sort: 'name' });
  assert.equal(beforeImport.total, catalog.length, 'search snapshot begins with all fixture songs');
  const importedId = catalog[6].Id.replaceAll('-', '').toLowerCase();
  const imported = {
    songId: importedId,
    removedAt: new Date().toISOString(),
    purgeAfter: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  serverA.jobs.set(importedId, imported);
  serverA.requests.add(`${userC}|${importedId}`);
  const importStatus = await importService.removedSongs();
  assert.equal(importStatus.songs.length, 1, 'remote tombstone is imported');
  const afterImport = await importService.songs({ start: 0, limit: 20, search: 'Song', sort: 'name' });
  assert.equal(afterImport.total, catalog.length - 1, 'import invalidates the old search snapshot');
  assert.ok(!afterImport.items.some((song) => song.id.replaceAll('-', '').toLowerCase() === importedId));

  const restartedStore = new SongRemovalStore(temp);
  const persistedA = await restartedStore.list(`${serverA.url}|${userA}`);
  assert.equal(persistedA.length, 6, 'removals survive store restart');
  assert.ok(persistedA.some((song) => song.songId === unsupportedId.replaceAll('-', '').toLowerCase() && song.purgeAfter === null));
  console.log('Song removal service verification passed: local durability, concurrent idempotency, server sync, pending fallback, filtered pagination, account/server isolation, and remote import cache invalidation.');
}

try {
  await main();
} finally {
  for (const server of servers) server.closeAllConnections?.();
  await Promise.all(servers.map((server) => new Promise((resolveClose) => server.close(resolveClose))));
  await rm(temp, { recursive: true, force: true });
}
