const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));

require.extensions['.ts'] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-prepared-recovery-'));
const originalLoad = Module._load;
const originalFs = {
  readdir: fsp.readdir,
  rename: fsp.rename,
  stat: fsp.stat,
  writeFile: fsp.writeFile,
};
let userData;
let fsHooks = {};
let state;
let providerCalls;
let scans = 0;

Module._load = function (id, ...args) {
  if (id === 'electron') return { app: { getPath: () => userData }, safeStorage: {} };
  if (id === './storage' && args[0]?.filename?.endsWith(`${path.sep}prepared-news.ts`)) {
    return {
      getLocalState: async () => structuredClone(state),
      readOpenAIKey: async () => 'fixture-openai-key',
      readElevenLabsKey: async () => 'fixture-elevenlabs-key',
      readTwitterKey: async () => 'fixture-twitter-key',
    };
  }
  if (id === './news' && args[0]?.filename?.endsWith(`${path.sep}prepared-news.ts`))
    return { validateNewsSettings: () => {} };
  return originalLoad.call(this, id, ...args);
};

const makeState = () => ({
  djs: [
    {
      id: 'fixture-dj',
      name: 'Fixture DJ',
      news: { interests: 'ambient', feedUrls: ['https://fixture.invalid/feed.xml'], elevenVoiceId: 'voice-fixture' },
    },
  ],
  sources: [{ id: 'fixture-source', name: 'Fixture source', url: 'https://fixture.invalid/feed.xml' }],
  roomProfiles: [
    {
      id: 'fixture-room',
      name: 'Fixture room',
      enabled: true,
      room: { djId: 'fixture-dj', sourceIds: ['fixture-source'] },
      mood: 'calm',
      workflowDraft: { newsEnabled: true, everyHours: 3, importance: 'major', maxNewsClipsPerDay: 3 },
    },
  ],
});

const installHooks = () => {
  fsp.readdir = async (...args) => {
    scans++;
    if (fsHooks.readdir) return fsHooks.readdir(...args);
    return originalFs.readdir(...args);
  };
  fsp.stat = async (...args) => {
    if (fsHooks.stat) return fsHooks.stat(...args);
    return originalFs.stat(...args);
  };
  fsp.writeFile = async (...args) => {
    if (fsHooks.writeFile) return fsHooks.writeFile(...args);
    return originalFs.writeFile(...args);
  };
  fsp.rename = async (...args) => {
    if (fsHooks.rename) return fsHooks.rename(...args);
    return originalFs.rename(...args);
  };
};

const harness = (name, initialIndex) => {
  userData = path.join(root, name);
  const directory = path.join(userData, 'prepared-news');
  fs.mkdirSync(directory, { recursive: true });
  if (initialIndex !== undefined) fs.writeFileSync(path.join(directory, 'index.json'), JSON.stringify(initialIndex));
  state = makeState();
  providerCalls = { script: 0, render: 0 };
  scans = 0;
  fsHooks = {};
  installHooks();
  const modulePath = require.resolve(path.join(process.cwd(), 'src/main/prepared-news.ts'));
  delete require.cache[modulePath];
  const prepared = require(modulePath);
  const news = {
    cancel: () => {},
    prepareScript: async (input) => {
      providerCalls.script++;
      await input.onCandidates?.([]);
      return { script: 'Fixture script', articles: [], warnings: [] };
    },
    renderPreparedSpeech: async (_input, result) => {
      providerCalls.render++;
      return { ...result, audio: Buffer.from('fixture audio'), engine: 'elevenlabs-v4' };
    },
  };
  return { directory, prepared, news };
};

const library = (overrides = {}) => ({
  preparationErrorVersion: 1,
  scripts: [],
  takes: [],
  requests: [],
  selectedTakeId: null,
  reviewedArticles: [],
  ...overrides,
});

const run = async (name, action) => {
  await action();
  results.push({ scenario: name, result: 'passed' });
};
const results = [];
const request = (requestId) => ({ requestId, roomId: 'fixture-room' });
const prepare = (prepared, news, requestId) => prepared.prepareRoomNews(news, request(requestId));
const pause = () => new Promise((resolve) => setImmediate(resolve));

(async () => {
  await run('concurrent readers coalesce recovery and unchanged listings do not rescan', async () => {
    const { prepared } = harness('coalesced-readers');
    const original = originalFs.readdir;
    let entered;
    let release;
    const enteredScan = new Promise((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    fsHooks.readdir = async (...args) => {
      entered();
      await blocked;
      return original(...args);
    };
    const readers = [prepared.getPreparedNews(), prepared.getPreparedNews(), prepared.getPreparedNews()];
    await enteredScan;
    await pause();
    release();
    await Promise.all(readers);
    assert.equal(scans, 1, 'simultaneous reads should share one directory scan');
    fsHooks.readdir = undefined;
    await Promise.all([prepared.getPreparedNews(), prepared.getPreparedNews(), prepared.getPreparedNews()]);
    assert.equal(scans, 1, 'unchanged state should not trigger later recovery scans');
  });

  await run('audio availability is checked freshly without another recovery scan', async () => {
    const take = { id: 'availability-take', requestId: 'old-request', byteLength: 4, articles: [] };
    const { directory, prepared } = harness('fresh-availability', library({ takes: [take] }));
    let result = await prepared.getPreparedNews();
    assert.equal(result.takes[0].available, false);
    fs.writeFileSync(path.join(directory, `${take.id}.mp3`), '1234');
    result = await prepared.getPreparedNews();
    assert.equal(result.takes[0].available, true);
    fs.writeFileSync(path.join(directory, `${take.id}.mp3`), '1');
    result = await prepared.getPreparedNews();
    assert.equal(result.takes[0].available, false);
    assert.equal(scans, 1, 'availability stats must stay fresh while recovery scan is cached');
  });

  await run('scan errors are retryable and do not poison later reads', async () => {
    const { prepared } = harness('scan-retry');
    const original = originalFs.readdir;
    let fail = true;
    fsHooks.readdir = async (...args) => {
      if (fail) {
        fail = false;
        throw Object.assign(new Error('fixture scan failure'), { code: 'EIO' });
      }
      return original(...args);
    };
    await assert.rejects(prepared.getPreparedNews());
    fsHooks.readdir = undefined;
    await prepared.getPreparedNews();
    assert.equal(scans, 2, 'a failed scan must be attempted again');
  });

  await run('preparation waits for an active recovery scan before touching files', async () => {
    const { directory, prepared, news } = harness('scan-publication-overlap');
    const original = originalFs.readdir;
    let entered;
    let release;
    const enteredScan = new Promise((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    fsHooks.readdir = async (...args) => {
      entered();
      await blocked;
      return original(...args);
    };
    const reader = prepared.getPreparedNews();
    await enteredScan;
    const preparation = prepare(prepared, news, 'overlap-request');
    await pause();
    const beforeRelease = fs.readdirSync(directory);
    assert.deepEqual(beforeRelease, [], 'publisher must not create publication files during scan');
    release();
    await Promise.all([reader, preparation]);
    assert.equal(fs.existsSync(path.join(directory, 'index.json')), true);
  });

  await run('same-session recovery restores a durable sidecar after audio and final index failures', async () => {
    const { directory, prepared, news } = harness('same-session-recovery');
    const originalRename = originalFs.rename;
    let sidecarPublished = false;
    let failAudioRename = false;
    let failNextIndexRename = false;
    fsHooks.rename = async (from, to) => {
      if (to.endsWith('.take.json')) sidecarPublished = true;
      if (sidecarPublished && from.endsWith('.mp3.tmp') && to.endsWith('.mp3')) {
        failAudioRename = true;
        failNextIndexRename = true;
        throw Object.assign(new Error('fixture audio promotion failure'), { code: 'EIO' });
      }
      if (failNextIndexRename && to.endsWith('index.json')) {
        failNextIndexRename = false;
        throw Object.assign(new Error('fixture final index failure'), { code: 'EIO' });
      }
      return originalRename(from, to);
    };
    await assert.rejects(prepare(prepared, news, 'recover-request'));
    assert.equal(sidecarPublished, true);
    assert.equal(failAudioRename, true);
    const sidecar = fs.readdirSync(directory).find((name) => name.endsWith('.take.json'));
    assert.ok(sidecar);
    fsHooks.rename = undefined;
    const restored = await prepared.getPreparedNews();
    assert.equal(restored.takes.length, 1, 'completed sidecar/audio temp should be recovered in this process');
    assert.equal(restored.takes[0].available, true);
    assert.equal(restored.takes[0].requestId, 'recover-request');
    const disk = JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf8'));
    assert.equal(disk.takes.length, 1);
    assert.equal(disk.requests.find((value) => value.requestId === 'recover-request').status, 'complete');
  });

  await run('completed audio is recovered when the final index commit fails', async () => {
    const { directory, prepared, news } = harness('final-index-recovery');
    const originalRename = originalFs.rename;
    let failedIndexCommit = false;
    fsHooks.rename = async (from, to) => {
      if (to.endsWith('index.json') && !failedIndexCommit) {
        const names = originalFs.readdir ? await originalFs.readdir(directory) : fs.readdirSync(directory);
        if (names.some((name) => name.endsWith('.mp3') && !name.endsWith('.tmp'))) {
          failedIndexCommit = true;
          throw Object.assign(new Error('fixture completed index failure'), { code: 'EIO' });
        }
      }
      return originalRename(from, to);
    };
    await assert.rejects(prepare(prepared, news, 'final-index-request'));
    assert.equal(failedIndexCommit, true);
    assert.equal(
      fs.readdirSync(directory).some((name) => name.endsWith('.mp3') && !name.endsWith('.tmp')),
      true,
    );
    fsHooks.rename = undefined;
    const recovered = await prepared.getPreparedNews();
    assert.equal(recovered.takes.length, 1);
    assert.equal(recovered.takes[0].requestId, 'final-index-request');
    assert.equal(recovered.takes[0].available, true);
    assert.deepEqual(providerCalls, { script: 1, render: 1 }, 'recovery must not rerender completed audio');
    const disk = JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf8'));
    assert.equal(disk.requests.find((value) => value.requestId === 'final-index-request').status, 'complete');
  });

  await run('active partial publication is not promoted by concurrent readers', async () => {
    const { directory, prepared, news } = harness('active-partial');
    const originalRename = originalFs.rename;
    let audioPromotionEntered;
    let releaseAudioPromotion;
    const entered = new Promise((resolve) => {
      audioPromotionEntered = resolve;
    });
    const blocked = new Promise((resolve) => {
      releaseAudioPromotion = resolve;
    });
    fsHooks.rename = async (from, to) => {
      if (from.endsWith('.mp3.tmp') && to.endsWith('.mp3')) {
        audioPromotionEntered();
        await blocked;
      }
      return originalRename(from, to);
    };
    const preparation = prepare(prepared, news, 'active-partial-request');
    await entered;
    const sidecar = fs.readdirSync(directory).find((name) => name.endsWith('.take.json'));
    assert.ok(sidecar, 'sidecar is durable before audio promotion');
    const during = await prepared.getPreparedNews();
    assert.equal(during.takes.length, 0, 'active publisher sidecar must not be recovered early');
    assert.equal(fs.existsSync(path.join(directory, sidecar.replace('.take.json', '.mp3'))), false);
    releaseAudioPromotion();
    const take = await preparation;
    assert.equal(take.available, true);
  });

  await run('active publication is not recovered after audio rename until final index commit settles', async () => {
    const { directory, prepared, news } = harness('active-after-audio-rename');
    const originalRename = originalFs.rename;
    let audioRenameCompleted;
    let releaseAudioRename;
    const renamed = new Promise((resolve) => {
      audioRenameCompleted = resolve;
    });
    const blocked = new Promise((resolve) => {
      releaseAudioRename = resolve;
    });
    fsHooks.rename = async (from, to) => {
      const result = await originalRename(from, to);
      if (from.endsWith('.mp3.tmp') && to.endsWith('.mp3')) {
        audioRenameCompleted();
        await blocked;
      }
      return result;
    };
    const preparation = prepare(prepared, news, 'active-after-rename-request');
    await renamed;
    const sidecar = fs.readdirSync(directory).find((name) => name.endsWith('.take.json'));
    assert.ok(sidecar);
    const audioName = sidecar.replace('.take.json', '.mp3');
    assert.equal(fs.existsSync(path.join(directory, audioName)), true, 'final audio is durable while active');
    const during = await prepared.getPreparedNews();
    assert.equal(during.takes.length, 0, 'active publisher must not expose a complete sidecar/audio pair early');
    releaseAudioRename();
    const take = await preparation;
    assert.equal(take.available, true);
    const after = await prepared.getPreparedNews();
    assert.equal(after.takes.length, 1);
    assert.equal(after.takes[0].id, take.id);
  });

  await run('request idempotency and claim history remain intact after cached recovery', async () => {
    const { prepared, news } = harness('request-history');
    const first = await prepare(prepared, news, 'history-request');
    const providerCallsAfterFirst = { ...providerCalls };
    const second = await prepare(prepared, news, 'history-request');
    assert.equal(second.id, first.id);
    assert.deepEqual(providerCalls, providerCallsAfterFirst, 'completed request reuse must not repeat provider work');
    const claimed = await prepared.claimPreparedNews({ id: first.id });
    assert.equal(claimed.deliveryState.status, 'claimed');
    const current = await prepared.getPreparedNews();
    assert.equal(current.takes.find((take) => take.id === first.id).deliveryState.status, 'claimed');
    await prepared.releasePreparedNews({ id: first.id, claimId: claimed.deliveryState.claimId });
    const released = await prepared.getPreparedNews();
    assert.equal(released.takes.find((take) => take.id === first.id).deliveryState.status, 'ready');
  });

  console.log(
    JSON.stringify(
      {
        verification:
          'Actual prepared-news module with temporary files, fake Electron userData/storage keys and fake provider methods; no live providers',
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
    Object.assign(fsp, originalFs);
    fs.rmSync(root, { recursive: true, force: true });
  });
