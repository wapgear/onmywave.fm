const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.WAVE_PLAYWRIGHT_MODULE || 'playwright');
const { openFixture } = require('./capture.cjs');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9335');
  const reports = [];
  try {
    for (const [width, height, theme] of [[1440, 900, 'dark'], [1280, 800, 'dark'], [800, 700, 'dark'], [1280, 800, 'light']]) {
      const { page, errors } = await openFixture(browser, width, height, theme);
      const bucket = page.locator('.news-bucket');
      const inspector = page.locator('#news-story-inspector');
      const rows = bucket.locator('.news-bucket-item');
      const list = bucket.locator('.news-bucket-list-tabs');
      await page.getByRole('button', { name: 'Simple', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Simple', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await rows.count(), 2);
      assert.match(await list.innerText(), /Ready\s+2/);
      assert.match(await list.innerText(), /Heard\s+1/);
      await page.screenshot({ path: `${__dirname}/after-simple-${width}-${theme}.png` });

      await rows.nth(1).click();
      await inspector.getByRole('heading', { name: 'A new way to browse your library', exact: true }).waitFor();
      await inspector.getByRole('button', { name: 'Close story details', exact: true }).focus();
      const listWidth = await bucket.locator('.news-bucket-list-column').evaluate((element) => element.clientWidth);
      await page.keyboard.press('Escape');
      assert.equal(await inspector.count(), 0);
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-story-key') === 'take:take-1');
      assert.equal(await rows.nth(1).evaluate((element) => element === document.activeElement), true);
      if (width >= 1120) assert.ok(await bucket.locator('.news-bucket-list-column').evaluate((element) => element.clientWidth) > listWidth + 250);
      await rows.first().click();
      await inspector.getByRole('button', { name: /Listen to .*saved story/ }).click();
      await inspector.getByRole('button', { name: 'Pause audition', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.__fixture.audios.filter((audio) => audio.src.includes('fixture-speech') && !audio.paused).length), 1);
      await inspector.getByRole('button', { name: 'Pause audition', exact: true }).click();
      await inspector.getByRole('button', { name: 'Resume audition', exact: true }).click();
      await inspector.getByRole('button', { name: 'Pause audition', exact: true }).waitFor();
      await inspector.getByRole('button', { name: 'Stop', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__fixture.audios.filter((audio) => audio.src.includes('fixture-speech') && !audio.paused).length), 0);
      await inspector.getByRole('button', { name: /Listen to .*saved story/ }).click();
      await page.getByRole('tab', { name: 'Saved audio', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__fixture.audios.filter((audio) => audio.src.includes('fixture-speech') && !audio.paused).length), 0);
      await page.getByRole('tab', { name: 'News bucket', exact: true }).click();

      await list.getByRole('button', { name: /Heard/ }).click();
      assert.equal(await rows.count(), 1);
      assert.match(await rows.innerText(), /Festival adds two evening sets/);
      await page.getByRole('button', { name: 'Advanced', exact: true }).click();
      await page.getByRole('complementary', { name: 'Room settings summary', exact: true }).waitFor();
      await list.getByRole('button', { name: /Saved scripts/ }).click();
      await rows.first().click();
      await inspector.getByText('A saved script is waiting for audio.', { exact: true }).waitFor();
      assert.equal(await inspector.getByRole('button', { name: /Listen|audition/ }).count(), 0);
      await list.getByRole('button', { name: /Reviewed/ }).click();
      assert.equal(await bucket.locator('.news-bucket-reviewed-row').count(), 3);
      assert.match(await bucket.innerText(), /excluded from future news selection across profiles/);
      await list.getByRole('button', { name: /Ready/ }).click();
      await rows.first().click();
      await page.screenshot({ path: `${__dirname}/after-advanced-${width}-${theme}.png` });

      const overflow = await page.evaluate(() => [...document.querySelectorAll('.main-content, .news-bucket, .news-bucket-layout')].map((element) => ({ className: element.className, overflow: element.scrollWidth > element.clientWidth + 1 })));
      assert.ok(overflow.every((result) => !result.overflow), JSON.stringify(overflow));
      const rail = page.getByRole('complementary', { name: 'Room settings summary', exact: true });
      await rail.locator('summary').filter({ hasText: 'Writing' }).click();
      await rail.getByRole('button', { name: 'Edit mood', exact: true }).click();
      await page.locator('#station-mood').waitFor({ state: 'visible' });
      await page.locator('#station-mood').fill('Calm afternoon, curious host');
      await page.getByRole('tab', { name: 'News bucket', exact: true }).click();
      await page.getByText('Unsaved room and preparation settings.', { exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Settings', exact: true }).click();
      assert.equal(await page.locator('#station-mood').inputValue(), 'Calm afternoon, curious host');
      assert.deepEqual(errors, []);
      reports.push({ width, height, theme, simpleAndAdvanced: true, readyAndHeardCounts: true, inspectorCloseAndFocus: true, previewPauseResumeStop: true, previewStopsOnTabChange: true, scriptsHaveNoAudio: true, reviewedHistory: true, draftRetained: true, overflow, pageErrors: errors });
      await page.close();
    }
    const { page, errors } = await openFixture(browser);
    const bucket = page.locator('.news-bucket');
    const inspector = page.locator('#news-story-inspector');
    const list = bucket.locator('.news-bucket-list-tabs');
    await page.getByRole('button', { name: 'Show DJ sidebar', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.side-drawer').count(), 0);
    assert.equal(await inspector.count(), 1, 'Escape closes the app drawer before the story inspector');
    await inspector.getByRole('button', { name: /Listen to .*saved story/ }).click();
    await page.evaluate(() => window.__fixture.audios.find((audio) => audio.src.includes('fixture-speech') && !audio.paused).emit('error'));
    await inspector.getByText('The saved audio could not be opened. Refresh saved takes to check the file.', { exact: true }).waitFor();
    await inspector.getByRole('button', { name: /Listen to .*saved story/ }).click();
    await page.evaluate(() => window.__fixture.player.play(window.__fixture.songs.slice(0, 5), 0));
    await page.waitForFunction(() => window.__fixture.audios.every((audio) => !audio.src.includes('fixture-speech') || audio.paused));
    assert.equal(await page.evaluate(() => window.__fixture.audios.filter((audio) => audio.src.includes('fixture-speech') && !audio.paused).length), 0);
    await page.evaluate(() => {
      const fixture = window.__fixture;
      const extra = structuredClone(fixture.library.takes[2]);
      extra.id = 'other-room-played';
      extra.provenance.roomId = 'other-room';
      fixture.library.takes.push(extra);
      const started = structuredClone(fixture.library.takes[2]);
      started.id = 'started-take';
      started.articles[0].title = 'Started story without confirmed completion';
      started.deliveryState = { status: 'started', startedAt: new Date().toISOString() };
      fixture.library.takes.push(started);
      fixture.client.setQueryData(['preparedNews'], structuredClone(fixture.library));
    });
    await bucket.getByText(/Started story without confirmed completion/).waitFor();
    assert.match(await list.innerText(), /Heard\s+1/);
    await list.getByRole('button', { name: /Heard/ }).click();
    assert.equal(await bucket.locator('.news-bucket-item').count(), 1);
    await page.evaluate(async () => {
      window.wave.getPreparedNews = () => Promise.resolve({ ok: false, error: { code: 'offline', message: 'Fixture saved news unavailable' } });
      await window.__fixture.client.refetchQueries({ queryKey: ['preparedNews'] });
    });
    await bucket.getByText('Saved news may be out of date. Counts and story availability reflect the last loaded results.', { exact: true }).waitFor();
    assert.equal(await bucket.locator('.news-bucket-item').count(), 1, 'Cached history remains visible on fetch failure');
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
      const fixture = window.__fixture;
      const room = structuredClone(fixture.state.roomProfiles[0]);
      room.id = 'other-room';
      room.name = 'Night radio';
      fixture.state.roomProfiles.push(room);
      fixture.state.activeRoomProfileId = room.id;
      fixture.client.setQueryData(['localState'], structuredClone(fixture.state));
    });
    await bucket.getByText('No fresh recordings ready', { exact: true }).waitFor();
    assert.equal(await inspector.count(), 0);
    assert.equal(await page.evaluate(() => window.__fixture.audios.filter((audio) => audio.src.includes('fixture-speech') && !audio.paused).length), 0);
    assert.deepEqual(errors, []);
    await page.close();
    const additional = { appDrawerEscapePriority: true, previewErrorAndRetry: true, previewStopsForMusic: true, heardScopedToRoom: true, startedNotCountedAsHeard: true, cachedHistoryOnFailure: true, profileSwitchStopsPreviewAndClearsInspector: true };
    await fs.writeFile(`${__dirname}/report.json`, JSON.stringify({ provenance: 'Real renderer served by the existing fixture server; disposable state and simulated audio; no real accounts or provider calls.', reports, additional }, null, 2) + '\n');
    console.log(JSON.stringify(reports));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
