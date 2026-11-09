const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { compile, parse, Visitor, registerFixtureImports } = require('../../../scripts/verification-code.mjs');

registerFixtureImports();

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
  mod._compile(compile(source), file);
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
  assert.equal((await reader.getLocalState()).djPlayback.announceEverySongs, 2, 'The default announcement minimum must be two');
  assert.equal((await reader.getLocalState()).djPlayback.announcementStyle, 'varied');
  assert.equal((await reader.getLocalState()).djPlayback.announcementLines, '');
  for (const announceTracks of [true, false]) {
    await reader.updateLocalState({ djPlayback: { ...(await reader.getLocalState()).djPlayback, announceTracks, announceEverySongs: 2, announceEverySongsMax: 6, everySongs: 2, everySongsMax: 5, announcementStyle: 'custom', announcementLines: 'Take a breath. {track}.\nLet’s go with {track}.' } });
    delete require.cache[require.resolve(servicePath)];
    assert.equal((await require(servicePath).getLocalState()).djPlayback.announceTracks, announceTracks, 'Announcement preference did not survive reload');
    assert.equal((await require(servicePath).getLocalState()).djPlayback.announceEverySongs, 2, 'Announcement minimum did not survive reload');
    assert.equal((await require(servicePath).getLocalState()).djPlayback.announceEverySongsMax, 6, 'Announcement maximum did not survive reload');
    assert.equal((await require(servicePath).getLocalState()).djPlayback.everySongsMax, 5, 'News maximum did not survive reload');
    assert.equal(Object.hasOwn((await require(servicePath).getLocalState()).djPlayback,'announcementDetailChance'),false);
    assert.equal((await require(servicePath).getLocalState()).djPlayback.announcementStyle, 'custom');
    assert.equal((await require(servicePath).getLocalState()).djPlayback.announcementLines, 'Take a breath. {track}.\nLet’s go with {track}.');
  }
}
(async () => {
  await roundtrip('baseline', false);
  directory = path.join(root, 'legacy-interval');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory,'local-state.json'), JSON.stringify({ djPlayback: { enabled:false, roomId:null, everySongs:3, announceTracks:true, announceEverySongs:8 } }));
  delete require.cache[require.resolve(servicePath)];
  const legacyStorage = require(servicePath);
  const migrated = await legacyStorage.getLocalState();
  assert.equal(migrated.djPlayback.announceEverySongs,8);
  assert.equal(migrated.djPlayback.announceEverySongsMax,8,'A legacy fixed interval must remain fixed');
  assert.equal(migrated.djPlayback.everySongsMax,3);
  assert.equal(Object.hasOwn(migrated.djPlayback,'announcementDetailChance'),false);
  const source = fs.readFileSync(path.join(process.cwd(),'src/main/index.ts'),'utf8');
  let handler;
  new Visitor({Property(node) { if(!node.computed && node.key.name==='saveDJPlayback') handler=node.value; }}).visit(parse(source,'index.ts'));
  assert(handler,'The real settings IPC handler was not found');
  const domain = require(path.join(process.cwd(),'src/shared/dj-playback.ts'));
  const holder = {exports:{}};
  new Function('module','isDJPlaybackSettingsPatch','isDJPlaybackSettings','normalizeDJPlaybackSettings','updateLocalStateAndGet','invalid','requireNewsReady','validateRoomReferences','require',compile('module.exports = '+source.slice(handler.start,handler.end),'handler.ts'))(
    holder,domain.isDJPlaybackSettingsPatch,domain.isDJPlaybackSettings,domain.normalizeDJPlaybackSettings,
    legacyStorage.updateLocalStateAndGet,()=>{throw new Error('Invalid settings');},()=>{throw new Error('News readiness is outside this check');},()=>{},require);
  const save = holder.exports;
  for(const invalid of [{announceEverySongs:7,announceEverySongsMax:6},{announceEverySongs:0,announceEverySongsMax:6},{announceEverySongs:2,announceEverySongsMax:11},{everySongs:5,everySongsMax:3},{everySongs:0,everySongsMax:5},{everySongs:1,everySongsMax:11},{everySongsMax:null},{announceEverySongsMax:null},{announceEverySongs:null},{announcementDetailChance:50}])
    await assert.rejects(save(invalid));
  await save({announceEverySongs:9});
  assert.equal((await legacyStorage.getLocalState()).djPlayback.announceEverySongsMax,9,'A legacy fixed-interval patch must update both limits');
  await save({announceEverySongs:2,announceEverySongsMax:6,everySongs:2,everySongsMax:5});
  await save({everySongs:4});
  delete require.cache[require.resolve(servicePath)];
  const reloaded = await require(servicePath).getLocalState();
  assert.equal(reloaded.djPlayback.announceEverySongs,2);
  assert.equal(reloaded.djPlayback.announceEverySongsMax,6);
  assert.equal(reloaded.djPlayback.everySongsMax,4,'A legacy news interval patch must update both ends');
  assert.equal(Object.hasOwn(reloaded.djPlayback,'announcementDetailChance'),false);
  assert.equal(reloaded.djPlayback.everySongs,4);

  directory = path.join(root,'clamped-legacy'); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory,'local-state.json'),JSON.stringify({djPlayback:{enabled:false,roomId:null,everySongs:20,announceTracks:true,announceEverySongs:30,announcementDetailChance:100,voiceVolume:0.35}}));
  delete require.cache[require.resolve(servicePath)];
  const clamped = (await require(servicePath).getLocalState()).djPlayback;
  assert.equal(clamped.everySongs,10); assert.equal(clamped.everySongsMax,10);
  assert.equal(clamped.announceEverySongs,10); assert.equal(clamped.announceEverySongsMax,10);
  assert.equal(clamped.voiceVolume,0.35); assert.equal(clamped.announceTracks,true);
  assert.equal(Object.hasOwn(clamped,'announcementDetailChance'),false);

  let detected = false;
  try { await roundtrip('mutation', true); } catch (error) {
    if (error.code !== 'ERR_ASSERTION' || !error.message.includes('Durable playback snapshot')) throw error;
    detected = true;
  }
  assert.equal(detected, true, 'Playback durability mutant escaped detection');
  console.log(JSON.stringify({ verification: 'Actual storage module writes and reloads a disposable playback snapshot; no keychain access', durableQueue: snapshot.trackIds, currentIndex: 1, position: 44, shufflePlanPreserved: true, mutationDetected: detected, newsAndAnnouncementRangesPersisted: true, legacyLimitsClampedToTen: true, chanceRemoved: true, legacyIntervalPreserved: true, actualSettingsHandlerValidated: true }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  Module._load = originalLoad;
  require.extensions['.ts'] = originalExtension;
  fs.rmSync(root, { recursive: true, force: true });
});
