const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const waitFor = async (predicate, message) => {
  const started = performance.now();
  while (performance.now() - started < 5000) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(message);
};

const player = () => window.__fixture.player;

window.__criticalPlayback = {
  ready: waitFor(() => player()?.current && !player().busy, 'Player restoration failed'),
  async verify() {
    await this.ready;
    const mode = window.__fixtureSeed.handoffCase;
    const fixture = window.__fixture;
    const events = [];
    let resolveLink;
    window.wave.prepareSongHandoff = async (input) => {
      events.push({ method: 'prepare', input });
      if (mode === 'cancel-pending') await new Promise((resolve) => { resolveLink = resolve; });
      if (mode === 'failure') return { ok: false, error: { code: 'server', message: 'Fixture speech unavailable' } };
      return { ok: true, value: { script: 'And now, enjoy the next song.', audioUrl: `${location.origin}/fixture-handoff` } };
    };
    window.wave.cancelSongHandoff = async (id) => {
      events.push({ method: 'cancel', id });
      return { ok: true };
    };
    const BaseAudio = window.Audio;
    window.Audio = class extends BaseAudio {
      constructor() { super(); this.duration = 10; }
      play() { events.push({ method: 'play', src: this.src }); return super.play(); }
      load() {
        if (mode === 'news-unavailable' && this.src.includes('fixture-speech')) {
          this.readyState = 0;
          queueMicrotask(() => this.emit('error'));
          return;
        }
        if (this.src.includes('fixture-handoff')) this.duration = mode === 'too-long' ? 12 : 4;
        else if (this.src.includes('fixture-speech')) this.duration = mode === 'too-long' ? 80 : 10;
        super.load();
      }
    };
    if (mode === 'shuffle') {
      player().toggleShuffle();
      await waitFor(() => player().shuffle, 'Shuffle did not enable');
    }
    player().toggle();
    await waitFor(() => player().playing, 'Music did not start');
    const before = player().currentKey;
    const expected = mode === 'end' ? null : mode === 'repeat-one' ? before : player().shuffle
      ? player().upcomingQueue[0]?.key : player().queue[player().queue.findIndex((entry) => entry.key === before) + 1]?.key;
    const music = fixture.audios.find((clip) => clip.src.startsWith('/fixture-audio/'));
    if (mode === 'too-late') music.currentTime = 179;
    const take = fixture.takes[0];
    const scheduling = mode === 'automatic'
      ? waitFor(() => player().newsPhase === 'waiting', 'Automatic DJ did not schedule the bulletin').then(() => null)
      : player().scheduleNews(take).then(() => null, (error) => error);
    if (mode === 'cancel-pending') {
      await waitFor(() => resolveLink, 'Introduction request did not start');
      player().next();
      resolveLink();
      assert(await scheduling instanceof Error, 'Cancelled preparation unexpectedly scheduled');
      assert(events.some((event) => event.method === 'cancel'), 'Pending speech request was not cancelled');
      assert(!fixture.calls.some((call) => call.method === 'startPreparedNews'), 'Cancelled news was consumed');
      return;
    }
    const failure = await scheduling;
    if (['failure', 'too-long', 'too-late', 'news-unavailable'].includes(mode)) {
      assert(failure instanceof Error, 'Provider failure did not reject scheduling');
      assert(!fixture.calls.some((call) => call.method === 'startPreparedNews'), 'Failed preparation consumed news');
      assert(player().currentKey === before && !music.paused, 'Provider failure interrupted music');
      if (mode === 'too-late' || mode === 'news-unavailable')
        assert(!events.some((event) => event.method === 'prepare'), 'An unusable bulletin triggered paid introduction generation');
      return;
    }
    assert(!failure, `Scheduling failed: ${failure?.message}`);
    const bulletin = fixture.audios.find((clip) => clip.src.includes('fixture-speech-'));
    const intro = fixture.audios.find((clip) => clip.src.includes('fixture-handoff'));
    if (mode === 'end') assert(!intro && !events.some((event) => event.method === 'prepare'), 'Queue end announced an invented track');
    else {
      assert(intro, 'No song introduction loaded');
      const chosen = events.find((event) => event.method === 'prepare').input.songId;
      if (expected) assert(player().queue.find((entry) => entry.key === expected).song.id === chosen, `Announced song differs from planned occurrence: ${JSON.stringify({mode, chosen, expectedId:player().queue.find((entry) => entry.key === expected).song.id, current:player().current.id, repeat:player().repeat, shuffle:player().shuffle})}`);
    }
    if (mode === 'budget' || mode === 'seek-intro') {
      music.currentTime = 167;
      music.emit('timeupdate');
    } else {
      music.ended = true;
      music.emit('ended');
    }
    await waitFor(() => !bulletin.paused, 'Bulletin did not start (combined timing budget may be wrong)');
    assert(!intro || intro.paused, 'Song introduction overlapped news');
    if (mode === 'queue-edit') {
      player().playNext([fixture.songs[4]]);
      await waitFor(() => player().newsPhase === 'idle', 'Queue edit did not cancel stale speech');
      assert(!events.some((event) => event.method === 'play' && event.src.includes('handoff')), 'Stale song was announced');
      return;
    }
    bulletin.emit('ended');
    if (intro) {
      await waitFor(() => !intro.paused, 'Introduction did not follow news');
      assert(player().currentKey === before, 'Music advanced before introduction finished');
      assert(Math.abs(intro.volume - 0.75 * 0.7) < 0.001, 'Introduction ignored voice volume');
      if (mode === 'intro-edit') {
        player().playNext([fixture.songs[4]]);
        await waitFor(() => player().newsPhase === 'idle', 'Queue edit during introduction did not cancel');
        assert(intro.paused && !intro.src, 'Cancelled introduction retained audio');
        return;
      }
      if (mode === 'pause') {
        player().toggle();
        await waitFor(() => player().newsPhase === 'paused', 'Introduction did not pause');
        assert(intro.paused, 'Introduction kept playing while paused');
        player().toggle();
        await waitFor(() => !intro.paused, 'Introduction did not resume');
        assert(fixture.calls.filter((call) => call.method === 'startPreparedNews').length === 1, 'Resume consumed news twice');
      }
      if (mode === 'seek-intro') {
        intro.currentTime = 1;
        const newsPlays = events.filter((event) => event.method === 'play' && event.src.includes('fixture-speech')).length;
        player().seek(169);
        await waitFor(() => player().newsPhase === 'waiting', 'Seek did not retain the remaining introduction');
        music.currentTime = 170;
        music.emit('timeupdate');
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert(intro.paused, 'Seek counted the already-finished bulletin in the remaining speech budget');
        music.currentTime = 177;
        music.emit('timeupdate');
        await waitFor(() => !intro.paused, 'Retained introduction did not resume at the correct ending');
        assert(events.filter((event) => event.method === 'play' && event.src.includes('fixture-speech')).length === newsPlays, 'Seek replayed the completed bulletin');
      }
      intro.emit('ended');
    }
    if (mode === 'budget' || mode === 'seek-intro') { music.ended = true; music.emit('ended'); }
    if (mode === 'end') await waitFor(() => !player().requestedPlaying, 'Final queue did not stop');
    else if (mode === 'repeat-one') await waitFor(() => player().newsPhase === 'idle', 'Repeat-one break did not complete');
    else await waitFor(() => player().currentKey !== before, 'Music did not follow introduction');
    if (expected) assert(player().currentKey === expected, 'Played occurrence differs from announced occurrence');
    if (mode === 'shuffle-cycle' || mode === 'repeat-all') {
      const chosen = events.find((event) => event.method === 'prepare').input.songId;
      assert(player().current.id === chosen, 'Shuffle repeat boundary redrew a different announced song');
    }
    assert(fixture.calls.filter((call) => call.method === 'markPreparedNewsPlayed').length === 1, 'Story history was not recorded once');
  },
};
