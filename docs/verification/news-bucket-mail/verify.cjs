const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.WAVE_PLAYWRIGHT_MODULE || 'playwright');
const { openFixture } = require('../news-bucket-redesign/capture.cjs');

async function seedBridge(page) {
  await page.evaluate(() => {
    const f = window.__fixture;
    window.wave.setNewsFavorite = async ({ article, favorite }) => {
      if (f.failFavorite) return { ok: false, error: { code: 'storage', message: 'Fixture favorite could not be saved' } };
      const url = new URL(article.url); url.hash = ''; url.search = '';
      const canonicalUrl = url.href;
      f.library.favorites ??= [];
      f.library.favorites = f.library.favorites.filter((value) => value.canonicalUrl !== canonicalUrl);
      if (favorite) f.library.favorites.push({ ...article, canonicalUrl, favoritedAt: new Date().toISOString() });
      return { ok: true, value: structuredClone(f.library) };
    };
    window.wave.openSource = async url => { f.calls.push({ method: 'openSource', url }); return { ok: true }; };
    window.wave.saveWorkflowDraft = async input => {
      if (f.failSave) return { ok: false, error: { code: 'storage', message: 'Fixture save unavailable' } };
      const profile = f.state.roomProfiles.find(room => room.id === input.expectedProfileId);
      Object.assign(profile, { room: input.room, mood: input.mood, workflowDraft: input.workflowDraft });
      f.state.revision++;
      return { ok: true, value: structuredClone(f.state) };
    };
  });
}
const playing = page => page.evaluate(() => window.__fixture.audios.filter(audio => audio.src.includes('fixture-speech') && !audio.paused).length);
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.news-bucket-layout, .news-bucket-list-column, .news-bucket-navigation')].every(e => e.scrollWidth <= e.clientWidth + 1));

async function main() {
  const browser = await chromium.connectOverCDP(process.env.WAVE_DEBUG_URL || 'http://127.0.0.1:9339');
  const reports = [];
  try {
    for (const [width, height, theme] of [[1440,900,'dark'],[1280,800,'light'],[1024,768,'dark'],[800,700,'dark']]) {
      const { page, errors } = await openFixture(browser, width, height, theme);
      try {
        await seedBridge(page);
        const bucket = page.locator('.news-bucket');
        const nav = page.getByRole('navigation', { name: 'News categories' });
        const rows = bucket.locator('.news-bucket-item');
        const inspector = page.getByRole('complementary', { name: 'Story inspector' });
        assert.equal(await nav.getByRole('button').count(), 5);
        assert.equal(await rows.count(), 2);
        assert.equal(await inspector.count(), 0);
        assert.equal(await bucket.locator('.news-room-settings').isVisible(), false);
        assert.equal(await noOverflow(page), true);
        await page.screenshot({ path: `${__dirname}/after-${width}-${theme}.png` });
        await rows.first().click();
        await inspector.getByRole('heading', { name: 'New album announced for Friday', exact: true }).waitFor();
        await page.screenshot({ path: `${__dirname}/after-reader-${width}-${theme}.png` });
        assert.equal(await noOverflow(page), true);
        await inspector.getByRole('button', { name: /Listen to .*saved story/ }).click();
        await inspector.getByRole('button', { name: 'Pause audition', exact: true }).waitFor();
        assert.equal(await playing(page), 1);
        await inspector.getByRole('button', { name: 'Pause audition', exact: true }).click();
        assert.equal(await playing(page), 0);
        await inspector.getByRole('button', { name: 'Resume audition', exact: true }).click();
        await inspector.getByRole('button', { name: 'Close story details' }).focus();
        await page.keyboard.press('Escape');
        assert.equal(await inspector.count(), 0);
        await page.waitForFunction(() => document.activeElement?.dataset.storyKey === 'take:take-0');
        assert.equal(await playing(page), 0);
        await bucket.getByRole('button', { name: 'Add to favorites: New album announced for Friday', exact: true }).click();
        await bucket.getByRole('button', { name: 'Remove from favorites: New album announced for Friday', exact: true }).waitFor();
        await nav.getByRole('button', { name: /Favorites/ }).click();
        assert.equal(await rows.count(), 1);
        await rows.first().click();
        await inspector.getByRole('button', { name: 'New album announced for Friday', exact: true }).click();
        assert.equal(await page.evaluate(() => window.__fixture.calls.filter(call => call.method === 'openSource').length), 1);
        await inspector.getByRole('button', { name: 'Remove from favorites: New album announced for Friday', exact: true }).click();
        await inspector.waitFor({ state: 'detached' });
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-current') === 'page');
        await nav.getByRole('button', { name: /Upcoming/ }).click();
        await bucket.getByRole('button', { name: 'Add to favorites: New album announced for Friday', exact: true }).click();
        await bucket.getByRole('button', { name: 'Remove from favorites: New album announced for Friday', exact: true }).waitFor();
        await rows.first().click();
        await inspector.getByRole('button', { name: /Listen to .*saved story/ }).click();
        await inspector.getByRole('button', { name: 'Pause audition', exact: true }).waitFor();
        await nav.getByRole('button', { name: /Past news/ }).click();
        assert.equal(await playing(page), 0);
        assert.equal(await rows.count(), 1);
        assert.match(await rows.innerText(), /Festival adds two evening sets/);
        await bucket.getByLabel('Story history', { exact: true }).selectOption('scripts');
        assert.equal(await rows.count(), 1);
        await rows.first().click();
        assert.equal(await inspector.getByRole('button', { name: /Listen/ }).count(), 0);
        await bucket.getByLabel('Story history', { exact: true }).selectOption('reviewed');
        assert.equal(await rows.count(), 3);
        await nav.getByRole('button', { name: 'Check news', exact: true }).click();
        await bucket.getByRole('heading', { name: 'No source check to show' }).waitFor();
        await page.evaluate(() => {
          const f = window.__fixture; const now = new Date().toISOString();
          const article = { ...f.library.takes[0].articles[0], summary: 'An album arrives Friday.', sourceIds: ['fixture-source'] };
          f.library.requests = [{ requestId: 'latest-check', status: 'complete', origin: { kind: 'automatic', profileId: f.state.activeRoomProfileId, startedAt: now }, checkpoint: { createdAt: now, provenance: { roomId: f.state.activeRoomProfileId }, collection: { collectedAt: now, candidates: [article], incomplete: true, sourceResults: [{ sourceId: 'fixture-source', status: 'complete', articleCount: 1, warnings: [] }], warnings: ['Some sources could not refresh.'] }, selection: { candidateId: article.id, reason: 'A relevant album release.', decidedAt: now } } }];
          f.client.setQueryData(['preparedNews'], structuredClone(f.library));
        });
        await rows.first().waitFor();
        assert.equal(await rows.count(), 1);
        await rows.first().click();
        assert.match(await inspector.innerText(), /An album arrives Friday/);
        await nav.getByRole('button', { name: 'Settings', exact: true }).click();
        const settings = bucket.locator('.news-room-settings');
        await settings.waitFor();
        assert.equal(await inspector.count(), 0);
        await settings.locator('#bucket-mood').fill('Quiet and curious');
        await nav.getByRole('button', { name: /Upcoming/ }).click();
        await nav.getByRole('button', { name: 'Settings', exact: true }).click();
        assert.equal(await settings.locator('#bucket-mood').inputValue(), 'Quiet and curious');
        const sources = settings.locator('.news-room-settings-group').first();
        await sources.locator('summary').first().click();
        await settings.getByLabel('Automatic recordings per day', { exact: true }).fill('0');
        await settings.getByRole('button', { name: 'Save setup', exact: true }).click();
        assert.equal(await settings.getByLabel('Automatic recordings per day', { exact: true }).evaluate(e => e.validity.valid), false);
        await settings.getByLabel('Automatic recordings per day', { exact: true }).fill('4');
        await page.screenshot({ path: `${__dirname}/after-settings-${width}-${theme}.png` });
        await settings.getByRole('button', { name: 'Save setup', exact: true }).click();
        await settings.getByRole('button', { name: 'Setup saved', exact: true }).waitFor();
        await nav.getByRole('button', { name: /Favorites/ }).click();
        await page.evaluate(() => { window.__fixture.failFavorite = true; });
        await bucket.getByRole('button', { name: 'Remove from favorites: New album announced for Friday', exact: true }).click();
        await bucket.getByText('Fixture favorite could not be saved').waitFor();
        assert.equal(await rows.count(), 1);
        await page.evaluate(() => { window.__fixture.failFavorite = false; });
        await bucket.getByRole('button', { name: 'Remove from favorites: New album announced for Friday', exact: true }).click();
        await bucket.getByRole('heading', { name: 'Keep the stories you like' }).waitFor();
        assert.equal(await noOverflow(page), true);
        assert.deepEqual(errors, []);
        reports.push({ width, height, theme, passed: true, checks: ['category mapping', 'reading and Escape focus return', 'audition pause/resume/cleanup', 'favorite add/remove/error', 'source link', 'history distinctions', 'latest check candidates', 'settings draft retention/save/validation', 'no horizontal overflow'], pageErrors: errors });
      } finally { await page.close(); }
    }
    await fs.writeFile(`${__dirname}/report.json`, JSON.stringify(reports, null, 2));
    console.log(JSON.stringify(reports, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
