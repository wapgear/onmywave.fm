const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-news-delivery-'));
const originalLoad = Module._load;
const originalReadFileSync = fs.readFileSync;
const originalTsExtension = require.extensions['.ts'];
let userData;
let localState;
let sourceMutation;
const servicePath = path.join(process.cwd(), 'src/main/prepared-news.ts');
const poolPath = path.join(process.cwd(), 'src/shared/news-pool.ts');

require.extensions['.ts'] = (mod, file) => {
  let source = originalReadFileSync(file, 'utf8');
  if (sourceMutation === 'played-eligibility' && file === poolPath) {
    source = replaceExactly(
      source,
      "['claimed', 'started', 'played'].includes(take.deliveryState?.status ?? '')",
      "['claimed', 'started'].includes(take.deliveryState?.status ?? '')",
    );
    source = replaceExactly(source, "take.deliveryState?.status !== 'played' &&", 'true &&');
  }
  if (sourceMutation === 'release-claim' && file === servicePath)
    source = replaceExactly(source, "take.deliveryState.status === 'claimed' ||", 'false ||');
  mod._compile(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
};

function replaceExactly(source, anchor, replacement) {
  const index = source.indexOf(anchor);
  assert.notEqual(index, -1, `Mutation anchor not found: ${anchor}`);
  assert.equal(source.indexOf(anchor, index + anchor.length), -1, `Mutation anchor is ambiguous: ${anchor}`);
  return source.replace(anchor, replacement);
}

class FixtureServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

Module._load = function (id, ...args) {
  if (id === 'electron') return { app: { getPath: () => userData }, safeStorage: {} };
  if (id === './storage' && args[0]?.filename === servicePath)
    return {
      getLocalState: async () => structuredClone(localState),
      readOpenAIKey: async () => '',
      readElevenLabsKey: async () => '',
      readTwitterKey: async () => '',
    };
  if (id === './news' && args[0]?.filename === servicePath) return { validateNewsSettings: () => {} };
  if (id === './jellyfin' && args[0]?.filename === servicePath) return { ServiceError: FixtureServiceError };
  return originalLoad.call(this, id, ...args);
};

const dj = {
  id: 'fixture-dj',
  name: 'Fixture DJ',
  news: { interests: 'Science', feedUrls: ['https://fixture.invalid/feed.xml'] },
};
const source = { id: 'fixture-source', name: 'Fixture source', url: 'https://fixture.invalid/feed.xml' };
const roomId = 'fixture-room';
const article = (url) => ({
  id: 'fixture-story',
  title: 'Fixture story',
  url,
  source: 'Fixture feed',
  publishedAt: new Date().toISOString(),
});

function makeState() {
  return {
    djs: [structuredClone(dj)],
    sources: [structuredClone(source)],
    roomProfiles: [
      {
        id: roomId,
        name: 'Fixture room',
        enabled: true,
        room: { djId: dj.id, sourceIds: [source.id] },
        mood: 'calm',
        workflowDraft: { newsInterests: 'Science' },
      },
    ],
  };
}

function makeTake(id, url, deliveryState) {
  const bytes = Buffer.from(`fixture audio ${id}`);
  return {
    id,
    requestId: `request-${id}`,
    script: `Fixture news ${id}`,
    articles: [article(url)],
    warnings: [],
    createdAt: new Date().toISOString(),
    audioUrl: `https://fixture.invalid/${id}.mp3`,
    engine: 'fixture',
    signature: `signature-${id}`,
    provenance: { dj: structuredClone(dj), mood: 'calm', sources: [structuredClone(source)], roomId },
    renderingDJ: structuredClone(dj),
    byteLength: bytes.length,
    model: 'fixture',
    voice: 'fixture',
    delivery: 'fixture',
    scriptId: `script-${id}`,
    available: true,
    ...(deliveryState ? { deliveryState } : {}),
    bytes,
  };
}

function open(name, takes, mutation) {
  sourceMutation = mutation;
  userData = path.join(root, name);
  const directory = path.join(userData, 'prepared-news');
  fs.mkdirSync(directory, { recursive: true });
  const storedTakes = takes.map(({ bytes, ...take }) => take);
  fs.writeFileSync(
    path.join(directory, 'index.json'),
    JSON.stringify({
      preparationErrorVersion: 1,
      scripts: [],
      takes: storedTakes,
      requests: [],
      selectedTakeId: null,
      reviewedArticles: [],
    }),
  );
  for (const take of takes) fs.writeFileSync(path.join(directory, `${take.id}.mp3`), take.bytes);
  localState = makeState();
  for (const file of [servicePath, poolPath]) delete require.cache[require.resolve(file)];
  return require(servicePath);
}

const results = [];
async function scenario(name, action) {
  await action();
  results.push({ scenario: name, result: 'passed' });
}

async function expectMutationFailure(name, expectedAssertion, action) {
  try {
    await action();
  } catch (error) {
    if (error.code !== 'ERR_ASSERTION' || !error.message.startsWith(expectedAssertion))
      throw new Error(`Mutation scenario failed outside ${expectedAssertion}: ${error.message}`, { cause: error });
    results.push({ scenario: name, result: 'mutant rejected', evidence: error.message });
    return;
  }
  throw new Error(`Mutation escaped detection: ${name}`);
}

(async () => {
  await scenario('played and already-heard canonical articles stay out of the eligible pool', async () => {
    const consumed = makeTake('played-story', 'https://fixture.invalid/story?id=1&utm_source=old', {
      status: 'played',
      claimId: 'old-claim',
    });
    const duplicate = makeTake('duplicate-story', 'https://fixture.invalid/story?id=1', { status: 'ready' });
    const prepared = open('consumed', [consumed, duplicate]);
    const snapshot = await prepared.getPreparedNews();
    const eligible = require(poolPath).eligibleNewsTakes(snapshot.takes, localState, roomId);
    assert.deepEqual(
      eligible.map((take) => take.id),
      [],
    );
    assert.equal(await prepared.nextRoomNews({ roomId, excludedIds: [] }), null);
  });

  await scenario('a wrong claim cannot start or release the active reservation; release permits reclaim', async () => {
    const take = makeTake('reclaim-story', 'https://fixture.invalid/reclaim');
    const prepared = open('reclaim', [take]);
    const first = await prepared.nextRoomNews({ roomId, excludedIds: [] });
    assert.equal(first.id, take.id);
    assert.equal(first.deliveryState.status, 'claimed');
    const firstClaim = first.deliveryState.claimId;
    await assert.rejects(prepared.startPreparedNews({ id: take.id, claimId: 'wrong-claim' }));
    await prepared.releasePreparedNews({ id: take.id, claimId: 'wrong-claim' });
    assert.equal((await prepared.getPreparedNews()).takes[0].deliveryState.claimId, firstClaim);
    await prepared.releasePreparedNews({ id: take.id, claimId: firstClaim });
    assert.equal((await prepared.getPreparedNews()).takes[0].deliveryState.status, 'ready');
    const second = await prepared.nextRoomNews({ roomId, excludedIds: [] });
    assert.equal(second.id, take.id);
    assert.notEqual(second.deliveryState.claimId, firstClaim);
    await prepared.startPreparedNews({ id: take.id, claimId: second.deliveryState.claimId });
    await prepared.markPreparedNewsPlayed({ id: take.id, claimId: second.deliveryState.claimId });
    assert.equal(await prepared.nextRoomNews({ roomId, excludedIds: [] }), null);
  });

  await expectMutationFailure(
    'played eligibility mutant is detected',
    'Played takes must not be eligible',
    async () => {
      const consumed = makeTake('mutant-played', 'https://fixture.invalid/mutant', {
        status: 'played',
        claimId: 'old-claim',
      });
      const prepared = open('mutant-played', [consumed], 'played-eligibility');
      const snapshot = await prepared.getPreparedNews();
      assert.deepEqual(
        require(poolPath)
          .eligibleNewsTakes(snapshot.takes, localState, roomId)
          .map((take) => take.id),
        [],
        'Played takes must not be eligible',
      );
    },
  );

  await expectMutationFailure(
    'unstarted claim release mutant is detected',
    'Releasing an unstarted claim must return it to ready',
    async () => {
      const take = makeTake('mutant-release', 'https://fixture.invalid/release');
      const prepared = open('mutant-release', [take], 'release-claim');
      const claim = await prepared.claimPreparedNews({ id: take.id });
      await prepared.releasePreparedNews({ id: take.id, claimId: claim.deliveryState.claimId });
      assert.equal(
        (await prepared.getPreparedNews()).takes[0].deliveryState.status,
        'ready',
        'Releasing an unstarted claim must return it to ready',
      );
    },
  );

  console.log(
    JSON.stringify(
      {
        verification:
          'Actual prepared-news and news-pool modules with temporary files and fixture local state; no live services',
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
    fs.readFileSync = originalReadFileSync;
    if (originalTsExtension) require.extensions['.ts'] = originalTsExtension;
    else delete require.extensions['.ts'];
    fs.rmSync(root, { recursive: true, force: true });
  });
