const assert = (condition, marker, message) => {
  if (!condition) throw new Error(`ASSERTION:${marker}:${message}`);
};

const waitFor = async (predicate, marker, message, timeout = 5000) => {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert(false, marker, message);
};

const player = () => window.__fixture.player;
const shortId = (id) => id.replace(/^0+/, '') || '0';
const trackIds = () => player().queue.map((entry) => shortId(entry.song.id));
const currentId = () => shortId(player().current?.id ?? '');
const fixtureAudio = () => window.__fixture.audios.find((audio) => audio.src.startsWith('/fixture-audio/'));

window.__criticalPlayback = {
  ready: waitFor(() => player()?.current && !player().busy, 'renderer-ready', 'Player did not finish restoration'),
  async verifyRestore() {
    await this.ready;
    assert(trackIds().join(',') === '1,2,1', 'restore-queue', `Unexpected restored queue: ${trackIds()}`);
    assert(
      player().queue[0].key !== player().queue[2].key,
      'duplicate-key',
      'Repeated tracks must have distinct occurrence keys',
    );
    assert(
      currentId() === '2' &&
        shortId(player().queue.find((entry) => entry.key === player().currentKey)?.song.id ?? '') === '2',
      'restore-index',
      'Restored occurrence is not selected',
    );
    assert(!player().playing, 'restore-paused', 'A saved paused session must remain paused');
    assert(
      fixtureAudio()?.currentTime === 44,
      'restore-position',
      `Expected restored position 44, got ${fixtureAudio()?.currentTime}`,
    );
    await waitFor(
      () => window.__fixture.checkpoints.length > 0,
      'restore-checkpoint',
      'Restored queue was not checkpointed',
    );
    return window.__fixture.checkpoints.at(-1);
  },
  async verifyNaturalEnd() {
    await this.ready;
    const beforeKey = player().currentKey;
    const currentAudio = fixtureAudio();
    assert(currentAudio, 'natural-end', 'No music audio is loaded');
    currentAudio.ended = true;
    currentAudio.emit('ended');
    await waitFor(
      () => player().currentKey !== beforeKey,
      'natural-end',
      'Natural audio end did not advance the queue',
    );
    assert(
      currentId() === '1' &&
        player().queue.find((entry) => entry.key === player().currentKey)?.song.id === player().current.id,
      'natural-end',
      'End selected the wrong occurrence',
    );
  },
  async verifyDuplicate() {
    await this.ready;
    assert(trackIds().join(',') === '1,2,1', 'duplicate-queue', 'Duplicate occurrence fixture was not restored');
    const firstKey = player().queue[0].key;
    const repeatedKey = player().queue[2].key;
    assert(firstKey !== repeatedKey, 'duplicate-key', 'Duplicate song occurrences share a queue key');
    player().playQueueEntry(repeatedKey);
    await waitFor(
      () => player().currentKey === repeatedKey,
      'duplicate-selection',
      'Selecting the repeated song did not select its occurrence',
    );
    assert(
      currentId() === '1' && repeatedKey !== firstKey,
      'duplicate-selection',
      'The repeated occurrence lost its identity',
    );
  },
  async verifyShuffleCycle() {
    await this.ready;
    const seen = new Set([player().currentKey]);
    assert(
      player().queue.length === 120 && new Set(trackIds()).size === 1,
      'shuffle-cycle',
      'Cycle fixture must contain repeated song IDs',
    );
    for (let step = 0; step < 119; step += 1) {
      const before = player().currentKey;
      player().next();
      await waitFor(
        () => player().currentKey !== before,
        'shuffle-cycle',
        `Shuffle stopped before occurrence ${step + 2}`,
      );
      assert(
        !seen.has(player().currentKey),
        'shuffle-cycle',
        'Shuffle repeated a queue occurrence before finishing its cycle',
      );
      seen.add(player().currentKey);
    }
    assert(seen.size === player().queue.length, 'shuffle-cycle', `Expected every occurrence once, saw ${seen.size}`);
  },
  async verifyRepeatOffExhaustion() {
    await this.ready;
    const beforeKey = player().currentKey;
    player().next();
    await waitFor(() => player().currentKey !== beforeKey, 'repeat-off', 'Queue did not advance to its final track');
    const finalKey = player().currentKey;
    player().next();
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert(
      player().currentKey === finalKey && !player().playing,
      'repeat-off',
      'Repeat-off should stop at the final queue occurrence',
    );
  },
  async verifyRepeatOne() {
    await this.ready;
    const key = player().currentKey;
    const calls = window.__fixture.calls.filter((call) => call.method === 'preparePlayback').length;
    const audio = fixtureAudio();
    audio.ended = true;
    audio.emit('ended');
    await waitFor(
      () => window.__fixture.calls.filter((call) => call.method === 'preparePlayback').length > calls,
      'repeat-one',
      'Repeat-one did not reload the current track',
    );
    assert(player().currentKey === key, 'repeat-one', 'Repeat-one changed the current queue occurrence');
  },
  async verifyRepeatShuffle() {
    await this.ready;
    const previousKey = player().currentKey;
    const audio = fixtureAudio();
    audio.ended = true;
    audio.emit('ended');
    await waitFor(
      () => player().currentKey !== previousKey,
      'repeat-shuffle',
      'Repeat-all shuffle did not start another cycle',
    );
    assert(player().shuffleRemaining > 0, 'repeat-shuffle', 'New shuffle cycle has no upcoming tracks');
  },
  async verifyNewsCancellation() {
    await this.ready;
    let entered;
    let resolveClaim;
    let claimError;
    let claimStarted = false;
    const claimEntered = new Promise((resolve) => {
      entered = resolve;
    });
    const claimGate = new Promise((resolve) => {
      resolveClaim = resolve;
    });
    window.wave.claimPreparedNews = () => {
      claimStarted = true;
      entered();
      return claimGate;
    };
    window.__fixture.state.newsTransitions = {
      mode: 'between-songs',
      fadeOutSeconds: 0,
      leadInSeconds: 0,
      postSpeechSeconds: 0,
      fadeInSeconds: 0,
    };
    const FixtureAudio = window.Audio;
    window.Audio = class extends FixtureAudio {
      constructor() {
        super();
        this.duration = 10;
      }
    };
    player().toggle();
    await waitFor(
      () => player().playing && fixtureAudio()?.src,
      'news-audio-ready',
      'Music did not start before DJ scheduling',
    );
    const news = window.__fixture.takes?.[0] ?? {
      id: 'fixture-news',
      audioUrl: `${location.origin}/fixture-news.mp3`,
      signature: 'fixture-signature',
      script: 'Fixture news story',
      articles: [],
      warnings: [],
      createdAt: new Date().toISOString(),
      engine: 'elevenlabs-v4',
      available: true,
    };
    const scheduled = player()
      .scheduleNews(news)
      .then(
        () => null,
        (error) => {
          claimError = error;
          return error;
        },
      );
    await waitFor(() => !!claimError || claimStarted, 'news-claim-ready', 'Scheduling did not reach claim');
    assert(!claimError, 'news-claim-ready', `Scheduling failed before claim: ${claimError?.message}`);
    await claimEntered;
    player().next();
    resolveClaim({ ok: true, value: { id: news.id, deliveryState: { status: 'claimed', claimId: 'fixture-claim' } } });
    const error = await scheduled;
    assert(error instanceof Error, 'news-release', 'Cancelled news unexpectedly remained scheduled');
    await waitFor(
      () => window.__fixture.calls.some((call) => call.method === 'releasePreparedNews'),
      'news-release',
      'Unstarted claim was not released',
    );
    const release = window.__fixture.calls.find((call) => call.method === 'releasePreparedNews');
    assert(release.input.neverPlayInvoked === true, 'news-release', 'Release did not identify the claim as unstarted');
    assert(
      !window.__fixture.calls.some((call) => call.method === 'startPreparedNews'),
      'news-release',
      'Cancelled claim was started',
    );
  },
};
