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
    const updateSettings = async (patch) => {
      const result = await window.wave.saveDJPlayback(patch);
      assert(result.ok, 'Fixture settings save failed');
      fixture.client.setQueryData(['localState'], result.value);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    };
    await updateSettings({ enabled: false });
    const take = fixture.takes[0];
    if (mode !== 'legacy-ending') take.ending = 'story-only';
    let resolveLink;
    window.wave.prepareSongHandoff = async (input) => {
      events.push({ method: 'prepare', input });
      if (mode === 'cancel-pending' || mode.endsWith('disable-generating')) await new Promise((resolve) => { resolveLink = resolve; });
      if (mode.endsWith('disable-generating')) return { ok: false, error: { code: 'server', message: 'Fixture introduction cancelled' } };
      if (mode === 'failure') return { ok: false, error: { code: 'server', message: 'Fixture speech unavailable' } };
      return { ok: true, value: { script: 'And now, enjoy the next song.', audioUrl: `${location.origin}/fixture-handoff` } };
    };
    window.wave.cancelSongHandoff = async (id) => {
      events.push({ method: 'cancel', id });
      if (mode.endsWith('disable-generating')) resolveLink?.();
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
    const music = fixture.audios.find((clip) => clip.src.startsWith('/fixture-audio/'));
    const finishSongs = async (count) => {
      const repeat = player().repeat;
      player().setRepeat('one');
      await waitFor(() => player().repeat === 'one', 'Repeat warmup did not start');
      for (let index = 0; index < count; index++) {
        const completed = player().completedSongs;
        music.ended = true;
        music.emit('ended');
        await waitFor(() => player().completedSongs === completed + 1 && !player().busy && !music.ended && player().playing, 'Natural completion did not advance the announcement cadence');
      }
      player().setRepeat(repeat);
      await waitFor(() => player().repeat === repeat, 'Repeat warmup did not restore');
    };
    const playBreak = async () => {
      await player().scheduleNews(take);
      const body = fixture.audios.find((clip) => clip.src.includes('fixture-speech-'));
      const intro = fixture.audios.find((clip) => clip.src.includes('fixture-handoff'));
      music.ended = true;
      music.emit('ended');
      await waitFor(() => !body.paused, 'Cadence bulletin did not start');
      body.emit('ended');
      if (intro) { await waitFor(() => !intro.paused, 'Cadence introduction did not start'); intro.emit('ended'); }
      await waitFor(() => player().newsPhase === 'idle' && !player().busy, 'Cadence break did not finish');
      return !!intro;
    };
    if (mode === 'news-interval-random') {
      const originalRandom = Math.random;
      const checks = () => fixture.calls.filter(call => call.method === 'nextRoomNews').length;
      const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      for (let index = 1; index <= 2; index++) fixture.takes.push({ ...take, id: `fixture-take-${index}`, requestId: `fixture-request-${index}`, signature: `fixture-${index}`, audioUrl: `${location.origin}/fixture-speech-${index}`, deliveryState: { status: 'claimed', claimId: `claim-${index}` } });
      const finishNews = async expected => {
        music.ended = true; music.emit('ended');
        let body;
        await waitFor(() => { body = fixture.audios.find(clip => clip.src.includes('fixture-speech-') && !clip.paused); return !!body; }, 'The scheduled news did not start');
        assert(player().completedSongs === expected, 'News did not wait for its selected completed-song count');
        body.emit('ended');
        await waitFor(() => player().newsPhase === 'idle' && !player().busy && !music.ended, 'The news cycle did not finish');
        await frame();
      };
      try {
        Math.random = () => 0;
        await updateSettings({ enabled: true, announceTracks: false, everySongs: 2, everySongsMax: 5 });
        player().setRepeat('one');
        await waitFor(() => player().repeat === 'one', 'News cadence repeat setup failed');
        assert(checks() === 0, 'News was checked before its two-song target');
        Math.random = () => 0.999999;
        await updateSettings({ voiceVolume: 0.6 });
        await finishSongs(1);
        await waitFor(() => player().newsPhase === 'waiting', 'An unrelated edit rerolled the two-song news target');
        await finishNews(2);
        Math.random = () => 0;
        await updateSettings({ voiceVolume: 0.7 });
        await finishSongs(3);
        assert(checks() === 1, 'The five-song news target was rerolled before the next break');
        await finishSongs(1);
        await waitFor(() => player().newsPhase === 'waiting', 'The upper endpoint news break was not prepared');
        await finishNews(7);
        await finishSongs(1);
        await waitFor(() => player().newsPhase === 'waiting', 'The next news cycle did not redraw its two-song target');
        assert(checks() === 3 && events.every(event => event.method !== 'prepare'), 'News cycles duplicated checks or generated disabled announcements');
      } finally { Math.random = originalRandom; }
      return;
    }
    if (mode === 'interval-random') {
      const originalRandom = Math.random;
      try {
        Math.random = () => 0;
        await updateSettings({ announceTracks: true, announceEverySongs: 2, announceEverySongsMax: 6 });
        player().setRepeat('one');
        await waitFor(() => player().repeat === 'one', 'Random cadence repeat setup failed');
        assert(!player().isTrackAnnouncementDue(), 'A two-song target was due before any completion');
        Math.random = () => 0.999999;
        await updateSettings({ voiceVolume: 0.6 });
        await finishSongs(1);
        await waitFor(() => player().newsPhase === 'waiting', 'An unrelated render rerolled the two-song target');
        music.ended = true; music.emit('ended');
        let intro;
        await waitFor(() => { intro=fixture.audios.find(c=>c.src.includes('fixture-handoff')&&!c.paused);return !!intro; }, 'The lower endpoint announcement did not start');
        assert(player().completedSongs===2,'The lower endpoint did not require two completed songs');
        intro.emit('ended');
        await waitFor(() => player().newsPhase==='idle'&&!player().busy&&!music.ended,'First random announcement did not finish');
        Math.random = () => 0;
        await updateSettings({ voiceVolume: 0.7 });
        await finishSongs(4);
        assert(!player().isTrackAnnouncementDue()&&events.filter(e=>e.method==='prepare').length===1,'The six-song target was rerolled before speech');
        await finishSongs(1);
        await waitFor(() => player().newsPhase==='waiting','The upper endpoint announcement was not prepared');
        music.ended=true; music.emit('ended');
        await waitFor(() => { intro=fixture.audios.find(c=>c.src.includes('fixture-handoff')&&!c.paused);return !!intro; },'The upper endpoint announcement did not start');
        assert(player().completedSongs===8,'The new cycle did not require six completed songs');
        intro.emit('ended');
        await waitFor(() => player().newsPhase==='idle'&&!player().busy&&!music.ended,'Second random announcement did not finish');
        await finishSongs(1);
        await waitFor(() => player().newsPhase==='waiting','The next cycle did not redraw its two-song target');
        assert(events.filter(e=>e.method==='prepare').length===3,'Cycle boundaries produced duplicate or missing preparations');
      } finally { Math.random=originalRandom; }
      return;
    }
    if (mode === 'news-override') {
      assert(await playBreak(), 'Fact-only news must announce before the interval is reached');
      assert(!player().isTrackAnnouncementDue(), 'Post-news announcement did not reset the shared interval');
      assert(await playBreak(), 'Consecutive fact-only news must each have one introduction');
      assert(events.filter((event) => event.method === 'prepare').length === 2, 'A fact-only news break had duplicate or missing introductions');
      return;
    }
    if (mode.startsWith('interval-') || mode === 'skip-count') {
      const interval = mode === 'interval-configured' ? 3 : 6;
      if (mode === 'interval-configured') await updateSettings({ announceEverySongs: interval });
      if (mode === 'interval-disabled') await updateSettings({ announceTracks: false });
      if (mode === 'interval-empty-news') fixture.takes.length = 0;
      if (mode === 'interval-with-news' || mode === 'interval-empty-news') await updateSettings({ enabled: true, everySongs: interval });
      if (mode === 'skip-count') {
        for (let index = 0; index < 7; index++) {
          const key = player().currentKey;
          player().next();
          await waitFor(() => player().currentKey !== key && !player().busy, 'Skip did not advance');
        }
        assert(player().completedSongs === 0 && events.filter((event) => event.method === 'prepare').length === 0, 'Skipped songs advanced announcement cadence');
        return;
      }
      player().setRepeat('one');
      await waitFor(() => player().repeat === 'one', 'Cadence repeat setup failed');
      if (mode === 'interval-disabled') {
        await finishSongs(7);
        assert(!events.some((event) => event.method === 'prepare'), 'Disabled announcements generated standalone speech');
        return;
      }
      await finishSongs(interval - 1);
      if (mode === 'interval-disable-generating') {
        await waitFor(() => resolveLink, 'Standalone generation did not start');
        await updateSettings({ announceTracks: false });
        await waitFor(() => player().newsPhase === 'idle' && !player().newsLoading, 'Standalone generation did not cancel');
        assert(!music.paused && player().newsNotice === null, 'Disabling a pending standalone introduction interrupted music or reported a failure');
        return;
      }
      await waitFor(() => player().newsPhase === 'waiting', 'The interval introduction was not prepared for the next natural ending');
      if (mode === 'interval-seek-end') {
        player().seek(player().current.duration);
        await waitFor(() => player().newsPhase === 'idle' && !player().busy && !music.ended, 'Endpoint seek stranded the standalone introduction');
        assert(player().completedSongs === interval - 1, 'Endpoint seek counted as a completed song');
        assert(!events.some((event) => event.method === 'play' && event.src.includes('fixture-handoff')), 'Endpoint seek bypassed the completed-song rule');
        return;
      }
      assert(events.filter((event) => event.method === 'play' && event.src.includes('fixture-handoff')).length === 0, 'Announcement played before N songs completed');
      const request = events.find((event) => event.method === 'prepare');
      assert((!!request.input.takeId) === (mode === 'interval-with-news'), 'News and standalone triggers were not coordinated');
      if (mode !== 'interval-with-news') assert(!fixture.calls.some((call) => call.method === 'startPreparedNews'), 'Standalone speech consumed a news claim');
      music.ended = true;
      music.emit('ended');
      if (mode === 'interval-with-news') {
        const body = fixture.audios.find((clip) => clip.src.includes('fixture-speech-'));
        await waitFor(() => !body.paused, 'News did not take priority over the interval announcement');
        body.emit('ended');
      }
      const intro = fixture.audios.find((clip) => clip.src.includes('fixture-handoff'));
      await waitFor(() => intro && !intro.paused, 'The N-song announcement did not play');
      assert(player().completedSongs === interval, 'Standalone announcement did not wait for N completed songs');
      assert(events.filter((event) => event.method === 'prepare').length === 1, 'Coinciding triggers generated duplicate introductions');
      if (mode === 'interval-disable-speaking') {
        await updateSettings({ announceTracks: false });
        await waitFor(() => player().newsPhase === 'idle' && !player().busy && !music.ended, 'Disabling standalone speech stranded playback');
        assert(intro.paused && !intro.src, 'Standalone speech continued after disabling');
        return;
      }
      if (window.__fixtureSeed.captureAnnouncement) {
        document.querySelector('button[aria-label="Show DJ sidebar"]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 200));
        window.__captureAnnouncementReady = true;
        await new Promise((resolve) => { window.__captureAnnouncementContinue = resolve; });
      }
      intro.emit('ended');
      await waitFor(() => player().newsPhase === 'idle' && !music.ended && !player().busy, 'Announcement did not return to music');
      await finishSongs(1);
      assert(player().newsPhase === 'idle' && events.filter((event) => event.method === 'prepare').length === 1, 'Announcement did not reset the interval');
      return;
    }
    if (mode === 'automatic') await updateSettings({ enabled: true });
    const before = player().currentKey;
    const expected = mode === 'end' ? null : mode === 'repeat-one' ? before : player().shuffle
      ? player().upcomingQueue[0]?.key : player().queue[player().queue.findIndex((entry) => entry.key === before) + 1]?.key;
    if (mode === 'too-late') music.currentTime = 179;
    const scheduling = mode === 'automatic'
      ? waitFor(() => player().newsPhase === 'waiting', 'Automatic DJ did not schedule the bulletin').then(() => null)
      : player().scheduleNews(take).then(() => null, (error) => error);
    if (mode === 'disable-generating') {
      await waitFor(() => resolveLink, 'Introduction generation did not start');
      await updateSettings({ announceTracks: false });
      assert(events.some((event) => event.method === 'cancel'), 'Disabling did not cancel generation');
    }
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
    let intro = fixture.audios.find((clip) => clip.src.includes('fixture-handoff'));
    if (mode === 'disable-generating') assert(!intro, 'Cancelled generation produced an introduction');
    else if (['end', 'disabled', 'legacy-ending'].includes(mode)) assert(!intro && !events.some((event) => event.method === 'prepare'), 'News-only playback generated a song introduction');
    else {
      assert(intro, 'No song introduction loaded');
      const chosen = events.find((event) => event.method === 'prepare').input.songId;
      if (expected) assert(player().queue.find((entry) => entry.key === expected).song.id === chosen, `Announced song differs from planned occurrence: ${JSON.stringify({mode, chosen, expectedId:player().queue.find((entry) => entry.key === expected).song.id, current:player().current.id, repeat:player().repeat, shuffle:player().shuffle})}`);
    }
    if (mode === 'disable-pending') {
      await updateSettings({ announceTracks: false });
      await waitFor(() => !intro.src, 'Disabling announcements kept the queued introduction');
      intro = null;
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
      if (mode === 'disable-speaking') {
        await updateSettings({ announceTracks: false });
        await waitFor(() => player().newsPhase === 'idle' && player().currentKey !== before, 'Disabling an on-air introduction did not return to music');
        assert(intro.paused && !intro.src, 'Disabled introduction kept playing');
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
