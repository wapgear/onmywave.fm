const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.WAVE_PLAYWRIGHT_MODULE || 'playwright');
const { openFixture } = require('../news-bucket-redesign/capture.cjs');
const debugURL = process.env.WAVE_DEBUG_URL || 'http://127.0.0.1:9337';
const playingPreviews = page => page.evaluate(() => window.__fixture.audios.filter(audio => audio.src.includes('fixture-speech') && !audio.paused).length);

async function seedSave(page) {
  await page.evaluate(() => {
    window.wave.saveWorkflowDraft = async input => {
      const f = window.__fixture;
      f.calls.push({ method: 'saveWorkflowDraft', input });
      if (f.failSave) return { ok: false, error: { code: 'offline', message: 'Fixture save unavailable' } };
      const room = f.state.roomProfiles.find(room => room.id === input.expectedProfileId);
      if (!room || f.state.activeRoomProfileId !== room.id) return { ok: false, error: { code: 'conflict', message: 'Room changed' } };
      Object.assign(room, { room: input.room, mood: input.mood, workflowDraft: input.workflowDraft });
      f.state.revision++;
      return { ok: true, value: structuredClone(f.state) };
    };
  });
}

async function main() {
  const browser = await chromium.connectOverCDP(debugURL);
  const reports = [];
  try {
    for (const [width, height, theme] of [[1536, 1024, 'dark'], [1280, 800, 'dark'], [800, 700, 'dark'], [1280, 800, 'light']]) {
      const { page, errors } = await openFixture(browser, width, height, theme);
      try {
        const bucket = page.locator('.news-bucket');
        const inspector = page.locator('#news-story-inspector');
        const rows = bucket.locator('.news-bucket-item');
        const list = bucket.locator('.news-bucket-list-tabs');
        assert.equal(await page.getByRole('button', { name: 'Simple', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Advanced', exact: true }).count(), 0);
        assert.equal(await rows.count(), 2);
        assert.match(await list.innerText(), /Ready\s+2/);
        assert.match(await list.innerText(), /Heard\s+1/);
        if (width >= 1280) assert.equal(await inspector.count(), 1);
        await page.screenshot({ path: `${__dirname}/after-${width}-${theme}.png` });
        const layout = await page.evaluate(() => {
          const rect = selector => { const e = document.querySelector(selector); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, fontSize: getComputedStyle(e).fontSize }; };
          return { rail: rect('.news-bucket-room-sidebar'), list: rect('.news-bucket-list-column'), inspector: document.querySelector('#news-story-inspector') ? rect('#news-story-inspector') : null, row: rect('.news-bucket-item strong') };
        });
        if (width >= 1280) {
          assert.ok(layout.rail.y < 190, JSON.stringify(layout));
          assert.ok(Math.abs(layout.rail.y - layout.list.y) < 4, JSON.stringify(layout));
          assert.ok(Math.abs(layout.inspector.y - layout.list.y) < 4, JSON.stringify(layout));
          assert.ok(parseFloat(layout.row.fontSize) >= 14, JSON.stringify(layout));
        }
        await rows.nth(1).click();
        await inspector.getByRole('heading', { name: 'A new way to browse your library', exact: true }).waitFor();
        await inspector.getByRole('button', { name: 'Close story details', exact: true }).focus();
        const previousWidth = await bucket.locator('.news-bucket-list-column').evaluate(e => e.clientWidth);
        await page.keyboard.press('Escape');
        assert.equal(await inspector.count(), 0);
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-story-key') === 'take:take-1');
        if (width >= 1280) assert.ok(await bucket.locator('.news-bucket-list-column').evaluate(e => e.clientWidth) > previousWidth + 150);
        await rows.first().click();
        await inspector.getByRole('button', { name: /Listen to .*saved story/ }).click();
        await inspector.getByRole('button', { name: 'Pause audition', exact: true }).waitFor();
        assert.equal(await playingPreviews(page), 1);
        await inspector.getByRole('button', { name: 'Pause audition', exact: true }).click();
        assert.equal(await playingPreviews(page), 0);
        await inspector.getByRole('button', { name: 'Resume audition', exact: true }).click();
        await inspector.getByRole('button', { name: 'Stop', exact: true }).click();
        assert.equal(await playingPreviews(page), 0);
        await inspector.getByRole('button', { name: /Listen to .*saved story/ }).click();
        await page.getByRole('button', { name: 'Saved audio', exact: true }).click();
        assert.equal(await playingPreviews(page), 0);
        await page.getByRole('button', { name: 'Back to News bucket', exact: true }).click();
        await list.getByRole('button', { name: /Heard/ }).click();
        assert.equal(await rows.count(), 1);
        assert.match(await rows.innerText(), /Festival adds two evening sets/);
        await list.getByRole('button', { name: /Ready/ }).click();
        await seedSave(page);
        const rail = page.locator('.news-bucket-room-sidebar');
        const settingsToggle = page.getByRole('button', { name: 'Room settings', exact: true });
        if (await settingsToggle.isVisible()) await settingsToggle.click();
        const sourcesGroup = rail.locator('.news-room-settings-group').first();
        await sourcesGroup.locator('summary').first().click();
        const recordingLimit = page.locator('#bucket-recording-limit');
        await recordingLimit.fill('0');
        await sourcesGroup.locator('summary').first().click();
        await rail.getByRole('button', { name: 'Save setup', exact: true }).click();
        assert.equal(await sourcesGroup.getAttribute('open'), '');
        assert.equal(await recordingLimit.evaluate(e => e === document.activeElement), true);
        assert.equal(await page.evaluate(() => window.__fixture.calls.filter(c => c.method === 'saveWorkflowDraft').length), 0);
        await recordingLimit.fill('4');
        await sourcesGroup.locator('summary').first().click();
        const mood = rail.getByRole('textbox', { name: 'Mood', exact: true });
        await mood.fill('Calm afternoon, curious host');
        await rail.getByRole('button', { name: 'Save setup', exact: true }).waitFor();
        await page.getByRole('button', { name: 'News settings', exact: true }).click();
        assert.equal(await page.locator('#station-mood').inputValue(), 'Calm afternoon, curious host');
        await page.getByRole('button', { name: 'Back to News bucket', exact: true }).click();
        assert.equal(await mood.inputValue(), 'Calm afternoon, curious host');
        await page.evaluate(() => { window.__fixture.failSave = true; });
        await rail.getByRole('button', { name: 'Save setup', exact: true }).click();
        await rail.getByText('Fixture save unavailable', { exact: true }).waitFor();
        assert.equal(await mood.inputValue(), 'Calm afternoon, curious host');
        await page.evaluate(() => { window.__fixture.failSave = false; });
        await rail.getByRole('button', { name: 'Save setup', exact: true }).click();
        await page.waitForFunction(() => window.__fixture.state.roomProfiles[0].mood === 'Calm afternoon, curious host');
        assert.equal(await mood.inputValue(), 'Calm afternoon, curious host');
        const savedCall = await page.evaluate(() => window.__fixture.calls.filter(c => c.method === 'saveWorkflowDraft').at(-1));
        assert.equal(savedCall.input.expectedProfileId, 'default-room');
        assert.equal(savedCall.input.workflowDraft.newsEnabled, false);
        const overflow = await page.evaluate(() => [...document.querySelectorAll('.main-content, .news-bucket, .news-bucket-layout')].map(e => ({ className: e.className, overflow: e.scrollWidth > e.clientWidth + 1 })));
        assert.ok(overflow.every(result => !result.overflow), JSON.stringify(overflow));
        assert.deepEqual(errors, []);
        reports.push({ width, height, theme, layout, advancedOnly: true, readyAndHeard: true, inspectorFocus: true, previewPauseResumeStop: true, previewStopsOnViewChange: true, invalidHiddenFieldRevealed: true, sharedDraft: true, saveFailureRetainsDraft: true, saveUsesExistingBridge: true, overflow, pageErrors: errors });
      } catch (error) { await page.screenshot({ path: `${__dirname}/failure.png` }); console.error((await page.locator(".stations-page").innerText()).slice(0, 7000)); throw error; } finally { await page.close(); }
    }
    const { page, errors } = await openFixture(browser);
    try {
      const bucket = page.locator('.news-bucket');
      const inspector = page.locator('#news-story-inspector');
      const list = page.locator('.news-bucket-list-tabs');
      const history = page.getByRole('combobox', { name: 'Story history', exact: true });
      await history.selectOption('scripts');
      await bucket.locator('.news-bucket-item').first().click();
      await inspector.getByText('A saved script is waiting for audio.', { exact: true }).waitFor();
      assert.equal(await inspector.getByRole('button', { name: /Listen|audition/ }).count(), 0);
      await history.selectOption('reviewed');
      assert.equal(await bucket.locator('.news-bucket-reviewed-row').count(), 3);
      assert.match(await bucket.innerText(), /Review history is separate from playback/);
      await history.selectOption('');
      assert.equal(await bucket.locator('.news-bucket-item').count(), 2);
      await bucket.locator('.news-bucket-item').first().click();
      await page.getByRole('button', { name: 'Show DJ sidebar', exact: true }).click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.side-drawer').count(), 0);
      assert.equal(await inspector.count(), 1, 'Global drawer owns Escape before the inspector');
      await inspector.getByRole('button', { name: /Listen to .*saved story/ }).click();
      await page.evaluate(() => window.__fixture.audios.find(a => a.src.includes('fixture-speech') && !a.paused).emit('error'));
      await inspector.getByText('The saved audio could not be opened. Refresh saved takes to check the file.', { exact: true }).waitFor();
      await inspector.getByRole('button', { name: /Listen to .*saved story/ }).click();
      await page.evaluate(() => window.__fixture.player.play(window.__fixture.songs.slice(0, 5), 0));
      await page.waitForFunction(() => window.__fixture.audios.every(a => !a.src.includes('fixture-speech') || a.paused));
      await page.evaluate(() => {
        const f = window.__fixture;
        const extra = structuredClone(f.library.takes[2]);
        extra.id = 'other-room-played'; extra.provenance.roomId = 'other-room';
        f.library.takes.push(extra);
        const started = structuredClone(f.library.takes[2]);
        started.id = 'started-take'; started.articles[0].title = 'Started story without confirmed completion';
        started.deliveryState = { status: 'started', startedAt: new Date().toISOString() };
        f.library.takes.push(started);
        f.client.setQueryData(['preparedNews'], structuredClone(f.library));
      });
      await bucket.getByText(/Started story without confirmed completion/).waitFor();
      assert.match(await list.innerText(), /Heard\s+1/);
      await list.getByRole('button', { name: /Heard/ }).click();
      assert.equal(await bucket.locator('.news-bucket-item').count(), 1);
      await page.evaluate(async () => {
        window.wave.getPreparedNews = () => Promise.resolve({ ok: false, error: { code: 'offline', message: 'Fixture saved news unavailable' } });
        await window.__fixture.client.refetchQueries({ queryKey: ['preparedNews'] });
      });
      await bucket.getByText('Saved news may be out of date; availability reflects the last loaded results.', { exact: true }).waitFor();
      assert.equal(await bucket.locator('.news-bucket-item').count(), 1);
      await page.screenshot({ path: `${__dirname}/after-stale-1440-dark.png` });
      await page.evaluate(() => {
        window.wave.getPreparedNews = () => Promise.resolve({ ok: true, value: structuredClone(window.__fixture.library) });
        window.__fixture.client.setQueryData(['preparedNews'], structuredClone(window.__fixture.library));
      });
      await list.getByRole('button', { name: /Ready/ }).click();
      if (await inspector.count()) await inspector.getByRole('button', { name: 'Close story details', exact: true }).click();
      await bucket.locator('.news-bucket-item').first().click();
      await inspector.getByRole('button', { name: /Listen to .*saved story/ }).click();
      await page.evaluate(() => {
        const f = window.__fixture;
        const room = structuredClone(f.state.roomProfiles[0]); room.id = 'other-room'; room.name = 'Night radio';
        f.state.roomProfiles.push(room); f.state.activeRoomProfileId = room.id;
        f.client.setQueryData(['localState'], structuredClone(f.state));
      });
      await bucket.getByText('No fresh recordings ready', { exact: true }).waitFor();
      assert.equal(await inspector.count(), 0);
      assert.equal(await playingPreviews(page), 0);
      assert.deepEqual(errors, []);
      reports.push({ historyScriptsAndReviewed: true, scriptsHaveNoAudio: true, globalDrawerEscapePriority: true, previewErrorAndRetry: true, previewStopsForMusic: true, heardScopedToRoom: true, startedNotHeard: true, cachedHistoryOnFailure: true, roomChangeStopsPreview: true, pageErrors: errors });
    } finally { await page.close(); }

    const checkpointView = await openFixture(browser, 1536, 1024);
    try {
      const page = checkpointView.page;
      await page.evaluate(() => {
        const f = window.__fixture;
        const now = new Date().toISOString();
        const candidates = f.library.takes.map(take => ({ ...take.articles[0], summary: 'A source-grounded summary for editorial assessment.', sourceIds: [f.state.sources[0].id] }));
        const selection = { candidateId: candidates[0].id, reasonCode: 'selected', reason: 'A concrete release announcement matches the music interest.', decidedAt: now };
        f.library.takes[0].selection = selection;
        f.library.requests = [{ requestId: 'checkpoint-current', kind: 'audio', inputHash: 'fixture', status: 'complete', origin: { kind: 'automatic', profileId: 'default-room', profileName: 'Afternoon radio', startedAt: now }, checkpoint: { version: 1, configHash: 'fixture', createdAt: now, provenance: f.library.takes[0].provenance, settings: f.state.djs[0].news, importance: 'major', collection: { candidates, sourceResults: f.state.sources.map(source => ({ sourceId: source.id, status: 'complete', articleCount: 1, warnings: [] })), warnings: [], collectedAt: now, incomplete: false }, selection } }];
        const other = structuredClone(f.library.requests[0]);
        other.requestId = 'other-room-latest'; other.origin.profileId = 'other-room'; other.origin.startedAt = new Date(Date.now() + 1000).toISOString(); other.checkpoint.provenance.roomId = 'other-room'; other.checkpoint.collection.candidates = [];
        f.library.requests.push(other);
        f.client.setQueryData(['preparedNews'], structuredClone(f.library));
      });
      const list = page.locator('.news-bucket-list-tabs');
      const rows = page.locator('.news-bucket-item');
      const inspector = page.locator('#news-story-inspector');
      await list.getByRole('button', { name: /Collected/ }).waitFor();
      assert.match(await list.innerText(), /Collected\s+3/);
      assert.match(await list.innerText(), /Selected\s+1/);
      assert.equal(await list.evaluate(e => e.scrollWidth <= e.clientWidth + 1), true, 'All stage controls remain visible without horizontal scrolling');
      await list.getByRole('button', { name: /Collected/ }).click();
      assert.equal(await rows.count(), 3);
      await rows.first().click();
      assert.equal(await inspector.getByRole('button', { name: /Listen|audition/ }).count(), 0);
      await list.getByRole('button', { name: /Selected/ }).click();
      assert.equal(await rows.count(), 1);
      if (await rows.first().getAttribute('aria-pressed') !== 'true') await rows.first().click();
      const why = inspector.locator('summary').filter({ hasText: 'Why this story' });
      if (await why.count()) await why.click();
      await inspector.getByText('A concrete release announcement matches the music interest.', { exact: true }).waitFor();
      await page.locator('.main-content').evaluate(e => { e.scrollTop = 0; });
      await page.screenshot({ path: `${__dirname}/after-editorial-1536-dark.png` });
      assert.deepEqual(checkpointView.errors, []);
      reports.push({ checkpointCollectedActualCount: true, checkpointSelectedOne: true, checkpointRoomScope: true, candidateHasNoListen: true, storedSelectionReason: true, pageErrors: checkpointView.errors });
    } finally { await checkpointView.page.close(); }

    await fs.writeFile(`${__dirname}/report.json`, JSON.stringify({ provenance: 'Real renderer, isolated fixture bridge and simulated audio; no provider calls.', reports }, null, 2) + '\n');
    console.log(JSON.stringify(reports));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
