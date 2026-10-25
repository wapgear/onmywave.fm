const { chromium } = require(process.env.WAVE_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { openFixture } = require('../news-bucket-redesign/capture.cjs');

(async () => {
  const browser = await chromium.connectOverCDP(process.env.WAVE_DEBUG_URL || 'http://127.0.0.1:9336');
  const { page, errors } = await openFixture(browser);
  try {
    await page.evaluate(() => {
      window.__fixture.library.takes[0].selection = { candidateId: 'article-0', reasonCode: 'selected', reason: 'A concrete release announcement matches the music interest.', decidedAt: new Date().toISOString() };
      window.__fixture.client.setQueryData(['preparedNews'], structuredClone(window.__fixture.library));
    });
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    await page.locator('.news-bucket-list-tabs').getByRole('button', { name: /Reviewed/ }).click();
    await page.locator('#news-story-inspector summary').filter({ hasText: 'Why this story' }).click();
    const mode = process.argv[2] || 'after';
    if (mode === 'after') {
      await page.getByText('A concrete release announcement matches the music interest.', { exact: true }).waitFor();
      assert.ok(!(await page.locator('.news-bucket').innerText()).includes('Reviewed stories are excluded from future news selection across profiles.'));
    }
    await page.locator('.main-content').evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: `${__dirname}/${mode}-editorial-1440-dark.png` });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ mode, pageErrors: errors }));
  } finally {
    await page.close();
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
