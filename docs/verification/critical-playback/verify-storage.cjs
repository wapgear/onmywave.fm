const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-playback-storage-'));
const servicePath = path.join(process.cwd(), 'src/main/storage.ts');
const originalLoad = Module._load;
const originalExtension = require.extensions['.ts'];
let directory;
let mutate = false;
require.extensions['.ts'] = (mod, file) => {
  let source = fs.readFileSync(file, 'utf8');
  if (mutate && file === servicePath) {
    const anchor = "await atomicWrite('local-state.json', JSON.stringify(state));";
    assert.equal(source.split(anchor).length, 2, 'Storage mutation anchor changed');
    source = source.replace(anchor, "await atomicWrite('local-state.json', JSON.stringify({ ...state, playback: null }));");
  }
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
};
Module._load = function (id, ...args) {
  if (id === 'electron') return { app: { getPath: () => directory }, safeStorage: {} };
  if (id === './keychain' && args[0]?.filename === servicePath)
    return { readSharedProviderKey: async () => null, writeSharedProviderKey: async () => { throw new Error('Keys are outside this fixture'); } };
  return originalLoad.call(this, id, ...args);
};
const snapshot = {
  connectionId: 'fixture-session', trackIds: ['1', '1', '2'], currentIndex: 1, position: 44,
  volume: 0.75, repeat: 'all', shuffle: true,
  shufflePlan: { upcoming: [2], history: [0, 1], cursor: 1, visited: [0, 1] },
};
async function roundtrip(name, mutation) {
  directory = path.join(root, name);
  mutate = mutation;
  delete require.cache[require.resolve(servicePath)];
  const writer = require(servicePath);
  await writer.updateLocalState({ playback: snapshot });
  delete require.cache[require.resolve(servicePath)];
  const reader = require(servicePath);
  assert.deepEqual((await reader.getLocalState()).playback, snapshot, 'Durable playback snapshot must survive a fresh storage module');
  assert.equal((await reader.getLocalState()).djPlayback.announceTracks, false, 'Announcements must start disabled');
  for (const announceTracks of [true, false]) {
    await reader.updateLocalState({ djPlayback: { ...(await reader.getLocalState()).djPlayback, announceTracks } });
    delete require.cache[require.resolve(servicePath)];
    assert.equal((await require(servicePath).getLocalState()).djPlayback.announceTracks, announceTracks, 'Announcement preference did not survive reload');
  }
}
(async () => {
  await roundtrip('baseline', false);
  let detected = false;
  try { await roundtrip('mutation', true); } catch (error) {
    if (error.code !== 'ERR_ASSERTION' || !error.message.includes('Durable playback snapshot')) throw error;
    detected = true;
  }
  assert.equal(detected, true, 'Playback durability mutant escaped detection');
  console.log(JSON.stringify({ verification: 'Actual storage module writes and reloads a disposable playback snapshot; no keychain access', durableQueue: snapshot.trackIds, currentIndex: 1, position: 44, shufflePlanPreserved: true, mutationDetected: detected }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  Module._load = originalLoad;
  require.extensions['.ts'] = originalExtension;
  fs.rmSync(root, { recursive: true, force: true });
});
