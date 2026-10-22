const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { QueryClient, QueryObserver } = require('@tanstack/react-query');

const root = process.cwd();
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
require.extensions['.ts'] = (mod, file) => mod._compile(compile(fs.readFileSync(file, 'utf8')), file);
const { JellyfinService, ServiceError } = require(path.join(root, 'src/main/jellyfin.ts'));
const uid = n => n.toString(16).padStart(32, '0');
const service = new JellyfinService({ deviceId: 'fixture', imageUrl: id => id });
service.restore({ serverUrl: 'https://fixture.invalid', token: 'fixture', userId: uid(1), userName: 'fixture', serverVersion: 'fixture', selectedLibraryIds: [uid(2)], sessionOnly: true });
let active = 0, aborted = 0;
global.fetch = async (url, init) => {
  active++;
  try {
    await new Promise((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); aborted++; reject(init.signal.reason); };
      const timer = setTimeout(() => { init.signal.removeEventListener('abort', cancel); resolve(); }, 20);
      if (init.signal.aborted) cancel();
      else init.signal.addEventListener('abort', cancel, { once: true });
    });
    const search = new URL(url).searchParams;
    const items = search.get('IncludeItemTypes') === 'Audio' ? [{ Id: uid(3), Name: search.get('SearchTerm') || 'Song' }] : [];
    return Response.json({ Items: items, TotalRecordCount: items.length });
  } finally { active--; }
};

// Execute the real IPC registration and cancellation functions, with Electron transport replaced.
const mainSource = fs.readFileSync('src/main/index.ts', 'utf8');
const mainAst = ts.createSourceFile('index.ts', mainSource, ts.ScriptTarget.Latest, true);
const names = new Set(['cancelCatalogRequests', 'catalogRequestId', 'readCatalog', 'registerIpc']);
const selected = mainAst.statements.filter(node =>
  ts.isFunctionDeclaration(node) ? names.has(node.name?.text) :
    ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ['catalogRequests', 'invalid', 'isRecord'].includes(d.name.getText(mainAst))),
).map(node => node.getText(mainAst)).join('\n');
assert.equal(names.size, mainAst.statements.filter(n => ts.isFunctionDeclaration(n) && names.has(n.name?.text)).length);
const handlers = new Map();
const mainFrame = {};
const webContents = { mainFrame };
const event = { sender: webContents, senderFrame: mainFrame };
const main = vm.createContext({ service, searchDJVoices: () => { throw new Error('Unexpected provider call'); }, window: { webContents }, ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, ServiceError, StorageError: class extends Error {}, newsOperations: new Set(), AbortController, Map, DOMException, console });
vm.runInContext(compile(selected + '\nregisterIpc();'), main);

const exposed = {};
const preload = vm.createContext({ exports: {}, require: name => {
  assert.equal(name, 'electron');
  return { contextBridge: { exposeInMainWorld: (name, api) => { exposed[name] = api; } }, ipcRenderer: {
    invoke: (channel, input) => Promise.resolve().then(() => handlers.get(channel)(event, input)),
    on() {}, removeListener() {},
  } };
} });
vm.runInContext(compile(fs.readFileSync('src/preload/index.ts', 'utf8')), preload);
const renderer = vm.createContext({ exports: {}, require: name => {
  assert.equal(name, './api');
  return require(path.join(root, 'src/renderer/api.ts'));
}, crypto, window: exposed, DOMException, Promise });
vm.runInContext(compile(fs.readFileSync('src/renderer/catalog.ts', 'utf8')), renderer);
const readCatalog = renderer.exports.readCatalog;
const query = { search: 'old', start: 0, limit: 80, sort: 'name' };
const results = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function scenario(name, work) { await work(); results.push({ name, result: 'passed' }); }
(async () => {
  await scenario('pre-aborted renderer signal sends no catalog request', async () => {
    const controller = new AbortController(); controller.abort();
    const before = aborted;
    await assert.rejects(readCatalog(exposed.wave.songs, query, controller.signal), { name: 'AbortError' });
    assert.equal(active, 0); assert.equal(aborted, before);
  });
  await scenario('renderer cancellation crosses preload and validated IPC and aborts fetch', async () => {
    const controller = new AbortController();
    const pending = readCatalog(exposed.wave.songs, query, controller.signal);
    await tick(); const before = aborted; assert.ok(active > 0);
    controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
    await tick(); assert.ok(aborted > before); assert.equal(active, 0);
  });
  await scenario('shared caller survives initiator cancellation and populates snapshot', async () => {
    const first = new AbortController(), second = new AbortController();
    const a = readCatalog(exposed.wave.songs, query, first.signal);
    const b = readCatalog(exposed.wave.songs, query, second.signal);
    await tick(); first.abort(); await assert.rejects(a, { name: 'AbortError' });
    const page = await b; assert.equal(page.items[0].name, 'old');
    const next = await readCatalog(exposed.wave.songs, { ...query, start: 80 }, second.signal);
    assert.equal(next.total, 1); assert.equal(active, 0);
  });
  await scenario('actual QueryObserver key change cancels old request without error or retry', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: 1, gcTime: 0 } } });
    const options = term => ({ queryKey: ['catalog-fixture', term], queryFn: ({ signal }) => readCatalog(exposed.wave.songs, { ...query, search: term }, signal) });
    const observer = new QueryObserver(client, options('old'));
    const seen = [];
    const unsubscribe = observer.subscribe(result => seen.push(result));
    await tick(); const before = aborted;
    observer.setOptions(options('new'));
    const final = await new Promise((resolve, reject) => {
      const stop = observer.subscribe(result => {
        if (result.isError) { stop(); reject(result.error); }
        if (result.isSuccess) { stop(); resolve(result); }
      });
    });
    assert.equal(final.data.items[0].name, 'new');
    assert.ok(aborted > before); assert.ok(seen.every(item => !item.isError && item.failureCount === 0));
    unsubscribe(); client.clear();
  });
  await scenario('unsubscribing actual QueryObserver cancels page work', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const observer = new QueryObserver(client, { queryKey: ['leave-page'], queryFn: ({ signal }) => readCatalog(exposed.wave.albums, { ...query, search: 'leave' }, signal) });
    const stop = observer.subscribe(() => {}); await tick(); const before = aborted; stop();
    await tick(); assert.ok(aborted > before); assert.equal(active, 0); client.clear();
  });
  await scenario('invalid IDs, duplicate IDs and unauthorized frame/sender cannot cancel another request', async () => {
    const requestId = crypto.randomUUID();
    const pending = exposed.wave.songs({ ...query, requestId }); await tick();
    const duplicate = await exposed.wave.songs({ ...query, requestId }); assert.equal(duplicate.ok, false);
    for (const badEvent of [{ sender: {}, senderFrame: mainFrame }, { sender: webContents, senderFrame: {} }]) {
      const result = await handlers.get('wave:cancelCatalog')(badEvent, requestId);
      assert.equal(result.error.code, 'forbidden');
    }
    const invalid = await exposed.wave.cancelCatalog('../invalid'); assert.equal(invalid.error.code, 'invalid');
    const result = await pending; assert.equal(result.ok, true);
    const late = await exposed.wave.cancelCatalog(requestId); assert.equal(late.ok, true);
  });
  await scenario('renderer teardown cleanup cancels direct single-library browse', async () => {
    const pending = exposed.wave.songs({ search: '', requestId: crypto.randomUUID() });
    await tick(); const before = aborted;
    vm.runInContext('cancelCatalogRequests()', main);
    await pending; await tick(); assert.ok(aborted > before); assert.equal(active, 0);
  });
  assert.equal(vm.runInContext('catalogRequests.size', main), 0);
  console.log(JSON.stringify({ verification: 'Actual renderer helper, QueryObserver, preload, main IPC registration/helpers, and JellyfinService with fixture transport; no native Electron or live server', results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
