const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));

require.extensions['.ts'] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );

let userData;
let preparedNewsCalls = [];
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (id === 'electron') return { app: { getPath: () => userData }, safeStorage: {} };
  if (id === './prepared-news' && args[0]?.filename?.endsWith(`${path.sep}news-workflow.ts`)) {
    return {
      cancelPreparedNews: async () => {},
      getPreparedNews: async () => ({ requests: [], takes: [] }),
      prepareRoomNews: async (_news, input, snapshot) => {
        preparedNewsCalls.push({ input, snapshot: structuredClone(snapshot) });
        return { id: 'fixture-take', recordedAt: new Date().toISOString() };
      },
    };
  }
  return originalLoad.call(this, id, ...args);
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-room-authority-'));
const results = [];
const profile = (id, overrides = {}) => ({
  id,
  name: id,
  enabled: true,
  room: { djId: null, sourceIds: [] },
  mood: `mood-${id}`,
  workflowDraft: { everyHours: 3, importance: 'major', maxNewsClipsPerDay: 3, newsEnabled: false },
  ...overrides,
});
const fresh = (name, contents) => {
  userData = path.join(root, name);
  fs.mkdirSync(userData);
  const file = path.join(userData, 'local-state.json');
  fs.writeFileSync(file, JSON.stringify(contents), { mode: 0o600 });
  for (const suffix of ['src/main/storage.ts', 'src/main/news-workflow.ts']) {
    const target = require.resolve(path.join(process.cwd(), suffix));
    delete require.cache[target];
  }
  return { file, storage: require(path.join(process.cwd(), 'src/main/storage.ts')) };
};
const legacy = (overrides = {}) => ({
  preparationErrorVersion: 1,
  djs: [{ id: 'legacy-dj' }],
  sources: [{ id: 'legacy-source', name: 'Legacy feed', url: 'https://fixture.invalid/feed.xml' }],
  vibe: 'Legacy mood',
  listeningRoom: { djId: 'legacy-dj', sourceIds: ['legacy-source'] },
  workflowDraft: { everyHours: 6, importance: 'relevant', maxNewsClipsPerDay: 5, newsEnabled: true },
  ...overrides,
});
const twoProfiles = (overrides = {}) => ({
  preparationErrorVersion: 1,
  djs: [],
  sources: [],
  roomProfiles: [profile('room-a'), profile('room-b')],
  activeRoomProfileId: 'room-b',
  ...overrides,
});
const mainSource = fs.readFileSync(path.join(process.cwd(), 'src/main/index.ts'), 'utf8');
const mainFile = ts.createSourceFile('index.ts', mainSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const disableNewsPreparationNode = (() => {
  let found;
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(mainFile) === 'disableNewsPreparation') found = node.initializer;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(mainFile);
  assert.ok(found, 'disableNewsPreparation handler exists');
  return found;
})();
const sourceDisableNewsPreparation = disableNewsPreparationNode.getText(mainFile);
const check = async (name, run) => {
  await run();
  results.push({ scenario: name, result: 'passed' });
};

(async () => {
  await check('legacy-only fields seed one active profile and are removed from disk', async () => {
    const { file, storage } = fresh('legacy-only', legacy());
    const state = await storage.getLocalState();
    const active = state.roomProfiles.find((item) => item.id === state.activeRoomProfileId);
    assert.equal(active.mood, 'Legacy mood');
    assert.equal(active.workflowDraft.newsEnabled, true);
    assert.equal(active.workflowDraft.everyHours, 6);
    assert.deepEqual(active.room, { djId: 'legacy-dj', sourceIds: ['legacy-source'] });
    for (const key of ['vibe', 'listeningRoom', 'workflowDraft']) assert.equal(Object.hasOwn(state, key), false);
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of ['vibe', 'listeningRoom', 'workflowDraft']) assert.equal(Object.hasOwn(disk, key), false);
  });

  await check('existing profiles win over stale top-level aliases', async () => {
    const stale = legacy({
      ...twoProfiles({ roomProfiles: [profile('room-a', { mood: 'A mood' }), profile('room-b', { mood: 'B mood' })] }),
      vibe: 'stale alias',
      listeningRoom: { djId: null, sourceIds: [] },
      workflowDraft: { everyHours: 1, importance: 'major', maxNewsClipsPerDay: 1, newsEnabled: false },
    });
    const { file, storage } = fresh('profiles-win', stale);
    const state = await storage.getLocalState();
    assert.equal(state.activeRoomProfileId, 'room-b');
    assert.equal(state.roomProfiles.find((item) => item.id === 'room-b').mood, 'B mood');
    assert.equal(state.roomProfiles.find((item) => item.id === 'room-a').mood, 'A mood');
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of ['vibe', 'listeningRoom', 'workflowDraft']) assert.equal(Object.hasOwn(disk, key), false);
  });

  await check('failed migration preserves the legacy file and retries successfully', async () => {
    const { file, storage } = fresh('migration-retry', legacy());
    const original = fs.readFileSync(file, 'utf8');
    const rename = fsp.rename;
    let failed = false;
    fsp.rename = async (from, to) => {
      if (!failed && to === file) {
        failed = true;
        throw Object.assign(new Error('fixture write failure'), { code: 'EIO' });
      }
      return rename(from, to);
    };
    try {
      await assert.rejects(storage.getLocalState());
      assert.equal(fs.readFileSync(file, 'utf8'), original);
      const recovered = await storage.getLocalState();
      assert.equal(recovered.roomProfiles[0].mood, 'Legacy mood');
      for (const key of ['vibe', 'listeningRoom', 'workflowDraft'])
        assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(file, 'utf8')), key), false);
    } finally {
      fsp.rename = rename;
    }
  });

  await check('corrupt profile data fails closed without replacing the source file', async () => {
    const contents = twoProfiles({ roomProfiles: [{ id: 'bad profile' }] });
    const { file, storage } = fresh('corrupt-profile', contents);
    const original = fs.readFileSync(file, 'utf8');
    await assert.rejects(storage.getLocalState());
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  });

  await check('editing the active room does not move playback from its selected room', async () => {
    const initial = twoProfiles({
      djs: [{ id: 'dj-a' }, { id: 'dj-b' }],
      sources: [{ id: 'source-a' }, { id: 'source-b' }],
      roomProfiles: [
        profile('room-a', { room: { djId: 'dj-a', sourceIds: ['source-a'] }, mood: 'A' }),
        profile('room-b', { room: { djId: 'dj-b', sourceIds: ['source-b'] }, mood: 'B' }),
      ],
      djPlayback: { enabled: true, roomId: 'room-a', everySongs: 3, keepOnSeek: true, voiceVolume: 0.7 },
    });
    const { file, storage } = fresh('independent-playback-room', initial);
    await storage.updateLocalState((state) => ({
      roomProfiles: state.roomProfiles.map((value) =>
        value.id === 'room-b' ? { ...value, mood: 'Edited B', workflowDraft: { ...value.workflowDraft, newsInterests: 'Jazz' } } : value,
      ),
    }));
    const state = await storage.getLocalState();
    assert.equal(state.activeRoomProfileId, 'room-b');
    assert.equal(state.roomProfiles.find((value) => value.id === 'room-a').mood, 'A');
    assert.equal(state.roomProfiles.find((value) => value.id === 'room-b').mood, 'Edited B');
    assert.equal(state.djPlayback.roomId, 'room-a');
    assert.equal(state.djPlayback.enabled, true);
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of ['vibe', 'listeningRoom', 'workflowDraft']) assert.equal(Object.hasOwn(disk, key), false);
  });

  await check('source removal sanitizes every profile without replacing profile identity', async () => {
    const initial = twoProfiles({
      djs: [{ id: 'dj-a' }, { id: 'dj-b' }],
      sources: [{ id: 'source-a' }, { id: 'source-b' }],
      roomProfiles: [
        profile('room-a', { room: { djId: 'dj-a', sourceIds: ['source-a', 'source-b', 'source-a'] } }),
        profile('room-b', { room: { djId: 'dj-b', sourceIds: ['source-b'] } }),
      ],
    });
    const { storage } = fresh('sanitize-all-profiles', initial);
    await storage.updateLocalState({ sources: [{ id: 'source-a' }] });
    const state = await storage.getLocalState();
    assert.deepEqual(state.roomProfiles.map((value) => value.id), ['room-a', 'room-b']);
    assert.deepEqual(state.roomProfiles[0].room, { djId: 'dj-a', sourceIds: ['source-a'] });
    assert.deepEqual(state.roomProfiles[1].room, { djId: 'dj-b', sourceIds: [] });
  });

  await check('scheduled completion updates the owning inactive profile only', async () => {
    const eligible = profile('scheduled-a', {
      workflowDraft: { everyHours: 3, importance: 'major', maxNewsClipsPerDay: 3, newsEnabled: true },
    });
    const active = profile('active-b');
    const { storage } = fresh('scheduler-owner', twoProfiles({
      roomProfiles: [eligible, active],
      activeRoomProfileId: 'active-b',
    }));
    preparedNewsCalls = [];
    const workflowPath = require.resolve(path.join(process.cwd(), 'src/main/news-workflow.ts'));
    delete require.cache[workflowPath];
    const workflow = require(workflowPath);
    await workflow.checkNewsWorkflow({});
    const state = await storage.getLocalState();
    const owner = state.roomProfiles.find((value) => value.id === 'scheduled-a');
    const unrelated = state.roomProfiles.find((value) => value.id === 'active-b');
    assert.equal(preparedNewsCalls.length, 1);
    assert.equal(preparedNewsCalls[0].input.roomId, 'scheduled-a');
    assert.equal(preparedNewsCalls[0].snapshot.roomProfiles[0].id, 'scheduled-a');
    assert.equal(owner.workflowDraft.newsLastRun.outcome, 'prepared');
    assert.equal(owner.workflowDraft.newsClipsToday, 1);
    assert.equal(unrelated.workflowDraft.newsLastRun, undefined);
    assert.equal(unrelated.workflowDraft.newsClipsToday, undefined);
    for (const key of ['vibe', 'listeningRoom', 'workflowDraft']) assert.equal(Object.hasOwn(state, key), false);
  });

  await check('actual disable handler changes only its target profile and persists no aliases', async () => {
    const initial = twoProfiles({
      djs: [{ id: 'dj-a' }],
      sources: [{ id: 'source-a' }],
      roomProfiles: [
        profile('room-a', {
          room: { djId: 'dj-a', sourceIds: ['source-a'] },
          workflowDraft: { ...profile('room-a').workflowDraft, newsEnabled: true, nextNewsCheckAt: '2026-10-22T10:00:00.000Z' },
        }),
        profile('room-b', { workflowDraft: { ...profile('room-b').workflowDraft, newsEnabled: true, nextNewsCheckAt: '2026-10-23T10:00:00.000Z' } }),
      ],
      activeRoomProfileId: 'room-b',
      djPlayback: { enabled: true, roomId: 'room-a', everySongs: 3, keepOnSeek: true, voiceVolume: 0.7 },
    });
    const { file, storage } = fresh('disable-handler', initial);
    const transpiled = ts.transpileModule(`(${sourceDisableNewsPreparation})`, {
      compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    let paused;
    const handler = new Function(
      'profileId',
      'updateLocalStateAndGet',
      'ServiceError',
      'pauseNewsWorkflow',
      `return ${transpiled};`,
    )(
      (id) => assert.match(id, /^[a-zA-Z0-9-]{1,128}$/),
      storage.updateLocalStateAndGet,
      class ServiceError extends Error {},
      (id) => { paused = id; },
    );
    await handler('room-b');
    const state = await storage.getLocalState();
    const target = state.roomProfiles.find((value) => value.id === 'room-b');
    const unrelated = state.roomProfiles.find((value) => value.id === 'room-a');
    assert.equal(target.workflowDraft.newsEnabled, false);
    assert.equal(target.workflowDraft.nextNewsCheckAt, undefined);
    assert.equal(unrelated.workflowDraft.newsEnabled, true);
    assert.equal(unrelated.workflowDraft.nextNewsCheckAt, '2026-10-22T10:00:00.000Z');
    assert.equal(paused, 'room-b');
    assert.equal(state.activeRoomProfileId, 'room-b');
    assert.deepEqual(state.djPlayback, initial.djPlayback);
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of ['vibe', 'listeningRoom', 'workflowDraft']) assert.equal(Object.hasOwn(disk, key), false);
    assert.equal(disk.roomProfiles.find((value) => value.id === 'room-a').workflowDraft.newsEnabled, true);
    assert.equal(disk.roomProfiles.find((value) => value.id === 'room-b').workflowDraft.newsEnabled, false);
  });

  console.log(
    JSON.stringify(
      {
        verification: 'Actual storage/news-workflow modules with temporary local-state files; Electron path and prepared audio boundary mocked; no live providers',
        results,
      },
      null,
      2,
    ),
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  });
