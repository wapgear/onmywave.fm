const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.WAVE_PLAYWRIGHT_MODULE || 'playwright');
const { openFixture } = require('../news-bucket-redesign/capture.cjs');

const mode = process.argv[2] || 'after';
const outputDirectory = process.env.WAVE_VERIFY_OUTPUT_DIR || __dirname;
const viewports = [
  [1440, 900, 'dark'],
  [1280, 800, 'light'],
  [1280, 800, 'coffee'],
  [1024, 768, 'dark'],
  [800, 700, 'dark'],
  [720, 450, 'light'],
];

async function geometry(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      main: box('.main-content'),
      header: box('.stations-page > .page-heading'),
      navigation: box('.news-bucket-navigation'),
      workspace: box('.news-bucket-layout'),
      player: box('.player-bar'),
      sidebar: box('.sidebar'),
    };
  });
}

async function main() {
  const browser = await chromium.connectOverCDP(process.env.WAVE_DEBUG_URL || 'http://127.0.0.1:9339');
  const report = [];
  const before = mode === 'after' ? JSON.parse(await fs.readFile(`${outputDirectory}/before.json`, 'utf8')) : [];
  try {
    for (const [width, height, theme] of viewports) {
      const { page, errors } = await openFixture(browser, width, height, theme);
      try {
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        await page.screenshot({ path: `${outputDirectory}/${mode}-${width}-${theme}.png` });
        const measurements = await geometry(page);
        if (mode === 'after') {
          const baseline = before.find((entry) => entry.width === width && entry.theme === theme).measurements;
          for (const name of ['main', 'player', 'sidebar']) {
            assert.deepEqual(measurements[name], baseline[name], `The ${name} geometry is preserved`);
          }
          assert.ok(measurements.workspace.y <= baseline.workspace.y - 16, 'The page header gives space back to the workspace');
          assert.ok(measurements.navigation.height <= 52, 'Categories occupy a single compact row');
          assert.equal(await page.evaluate(() => [...document.querySelectorAll('.news-bucket-layout, .news-bucket-navigation, .news-bucket-list-column, .news-bucket-inspector')].filter((element) => element.checkVisibility()).every((element) => element.scrollWidth <= element.clientWidth + 1)), true, 'No pane has horizontal overflow');
          if (width === 1440) {
            const navigation = page.getByRole('navigation', { name: 'News categories' });
            await navigation.getByRole('button', { name: 'Settings', exact: true }).focus();
            await page.keyboard.press('Enter');
            const mood = page.locator('#bucket-mood');
            await mood.fill('Retain my draft while resizing');
            await page.setViewportSize({ width: 800, height: 700 });
            const category = navigation.getByLabel('News category', { exact: true });
            await category.selectOption('upcoming');
            await category.selectOption('settings');
            assert.equal(await mood.inputValue(), 'Retain my draft while resizing');
            await page.setViewportSize({ width, height });
            assert.equal(await navigation.getByRole('button', { name: 'Settings', exact: true }).getAttribute('aria-current'), 'page');
            assert.equal(await mood.inputValue(), 'Retain my draft while resizing');
          }
        }
        assert.deepEqual(errors, []);
        report.push({ width, height, theme, measurements, pageErrors: errors });
      } finally {
        await page.close();
      }
    }
    await fs.writeFile(`${outputDirectory}/${mode}.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
