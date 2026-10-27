const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-news-favorites-'));
const directory = path.join(root, 'profile');
const libraryPath = path.join(directory, 'prepared-news', 'index.json');
const originalLoad = Module._load;
const originalRename = fsp.rename;
let renameFailure = false;

require.extensions['.ts'] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );

Module._load = function (id, ...args) {
  if (id === 'electron') return { app: { getPath: () => directory }, safeStorage: {} };
  return originalLoad.call(this, id, ...args);
};
fsp.rename = async (from, to) => {
  if (renameFailure && String(to) === libraryPath) {
    renameFailure = false;
    throw Object.assign(new Error('Injected index write failure'), { code: 'EIO' });
  }
  return originalRename(from, to);
};

function reload() {
  const modulePath = path.join(process.cwd(), 'src/main/prepared-news.ts');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function saveLibrary(value) {
  fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
  fs.writeFileSync(libraryPath, JSON.stringify(value));
}

function readLibrary() {
  return JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
}

function oldLibrary() {
  const article = {
    id: 'fixture-story',
    title: 'A useful update',
    url: 'https://news.example.test/story?utm_source=fixture#top',
    source: 'Fixture News',
    publishedAt: '2026-10-26T12:00:00.000Z',
  };
  return {
    preparationErrorVersion: 1,
    scripts: [],
    takes: [],
    requests: [],
    selectedTakeId: null,
    reviewedArticles: [
      {
        ...article,
        canonicalUrl: 'https://news.example.test/story',
        requestId: 'prior-review',
        reviewedAt: '2026-10-26T12:01:00.000Z',
        status: 'reviewed',
        outcome: 'selected',
      },
    ],
  };
}

async function main() {
  fs.mkdirSync(directory, { recursive: true });
  saveLibrary(oldLibrary());
  let prepared = reload();
  const migrated = await prepared.getPreparedNews();
  assert.deepEqual(migrated.favorites, []);
  assert.deepEqual(readLibrary().favorites, [], 'legacy index gains an empty favorites collection');

  const article = oldLibrary().reviewedArticles[0];
  const withQuery = { ...article, url: 'https://NEWS.example.test/story?utm_campaign=other#section' };
  const [first, concurrent, sameCanonical] = await Promise.all([
    prepared.setNewsFavorite({ article, favorite: true }),
    prepared.setNewsFavorite({ article: withQuery, favorite: true }),
    prepared.setNewsFavorite({ article, favorite: true }),
  ]);
  assert.equal(first.favorites.length, 1);
  assert.equal(concurrent.favorites.length, 1);
  assert.equal(sameCanonical.favorites.length, 1);
  assert.equal(readLibrary().favorites.length, 1, 'concurrent equivalent adds serialize and deduplicate');
  assert.equal(readLibrary().favorites[0].canonicalUrl, 'https://news.example.test/story');
  assert.equal(readLibrary().favorites[0].title, article.title, 'repeat adds retain the original saved snapshot');

  await assert.rejects(
    prepared.setNewsFavorite({ article: { ...article, url: 'file:///etc/passwd' }, favorite: true }),
    (error) => error.code === 'invalid',
  );
  await assert.rejects(
    prepared.setNewsFavorite({ article: { ...article, url: 'https://unknown.example.test/story' }, favorite: true }),
    (error) => error.code === 'invalid',
  );

  const afterFavorite = readLibrary();
  afterFavorite.reviewedArticles = [];
  afterFavorite.takes = [];
  afterFavorite.scripts = [];
  afterFavorite.requests = [];
  saveLibrary(afterFavorite);
  prepared = reload();
  const afterCleanup = await prepared.getPreparedNews();
  assert.equal(afterCleanup.favorites.length, 1, 'favorite survives cleanup of its originating records');

  const removed = await prepared.setNewsFavorite({ article, favorite: false });
  assert.deepEqual(removed.favorites, []);
  assert.deepEqual(readLibrary().favorites, []);
  const idempotentRemove = await prepared.setNewsFavorite({ article, favorite: false });
  assert.deepEqual(idempotentRemove.favorites, []);

  saveLibrary({ ...oldLibrary(), reviewedArticles: [], favorites: [{
    ...article,
    url: 'javascript:alert(1)',
    canonicalUrl: 'javascript:alert(1)',
    favoritedAt: '2026-10-26T12:00:00.000Z',
  }] });
  const malformedContents = fs.readFileSync(libraryPath, 'utf8');
  prepared = reload();
  await assert.rejects(prepared.getPreparedNews(), /could not be read/i);
  assert.equal(fs.readFileSync(libraryPath, 'utf8'), malformedContents, 'malformed index is preserved');

  saveLibrary(oldLibrary());
  prepared = reload();
  await prepared.getPreparedNews();
  renameFailure = true;
  await assert.rejects(prepared.setNewsFavorite({ article, favorite: true }));
  assert.deepEqual((await prepared.getPreparedNews()).favorites, [], 'failed atomic write does not update memory');
  assert.deepEqual(readLibrary().favorites, [], 'failed atomic write leaves the index unchanged');

  console.log('PASS legacy migration');
  console.log('PASS canonical deduplication and concurrent idempotent adds');
  console.log('PASS URL and unknown-story validation');
  console.log('PASS persistence after originating records are removed');
  console.log('PASS idempotent removal');
  console.log('PASS malformed favorite preservation');
  console.log('PASS failed-write memory and disk integrity');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    fsp.rename = originalRename;
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  });
