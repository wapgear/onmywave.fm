const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.WAVE_PLAYWRIGHT_MODULE ?? 'playwright');

const stage = process.argv[2] ?? 'after';
const properties = {
  panel: ['backgroundColor', 'borderRadius', 'width', 'height', 'top', 'right', 'bottom'],
  header: ['height', 'padding', 'backgroundColor', 'borderBottomColor'],
  body: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'scrollPaddingBlock'],
  title: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color'],
  artist: ['fontFamily', 'fontSize', 'lineHeight', 'color', 'marginTop'],
};

function compare(lyrics, details) {
  for (const [block, names] of Object.entries(properties)) {
    for (const name of names) assert.equal(details[block][name], lyrics[block][name], `${block}.${name}`);
  }
}

async function measure(page, mode) {
  return page.evaluate(({mode, properties}) => {
    const selectors = {
      panel: '.side-drawer', header: '.drawer-heading', body: '.drawer-body',
      title: mode === 'lyrics' ? '.lyrics-heading h3' : '.song-inspector h2',
      artist: mode === 'lyrics' ? '.lyrics-heading p' : '.inspector-artist',
    };
    return Object.fromEntries(Object.entries(selectors).map(([block, selector]) => {
      const style = getComputedStyle(document.querySelector(selector));
      return [block, Object.fromEntries(properties[block].map(name => [name, style[name]]))];
    }));
  }, {mode, properties});
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('wave:theme', 'light'));
    await page.goto(process.env.WAVE_FIXTURE_URL ?? 'http://127.0.0.1:5207/?case=details-consistency');
    await page.locator('.player-artwork:not(:disabled)').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const captures = [];
    for (const [width, height, theme] of [[1440, 900, 'light'], [800, 700, 'dark']]) {
      await page.setViewportSize({width, height});
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const peers = {};
      for (const mode of ['lyrics', 'details']) {
        if (mode === 'lyrics') await page.getByRole('button', {name:'Show lyrics', exact:true}).click();
        else await page.locator('.player-artwork').click();
        await page.getByRole('button', {name:mode === 'lyrics' ? 'Expand lyrics' : 'Expand song details', exact:true}).click();
        await page.waitForTimeout(350);
        peers[mode] = await measure(page, mode);
        await page.screenshot({path:path.join(__dirname, `consistency-${stage}-${mode}-${width}-${theme}.png`)});
        assert(await page.locator('.main-content').evaluate(element => element.inert));
        assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
        if (mode === 'details' && stage === 'after') {
          compare(peers.lyrics, peers.details);
          const broken = await page.addStyleTag({content:'.details-drawer.is-expanded .drawer-body {padding-left:1px !important}'});
          await page.waitForFunction(() => getComputedStyle(document.querySelector('.drawer-body')).paddingLeft === '1px');
          const brokenEvidence = await measure(page, mode);
          assert.throws(() => compare(peers.lyrics, brokenEvidence), /body.paddingLeft/);
          await broken.evaluate(element => element.remove());
        }
        await page.getByRole('button', {name:mode === 'lyrics' ? 'Close lyrics' : 'Close song details', exact:true}).focus();
        await page.keyboard.press('Tab');
        assert(await page.getByRole('region', {name:mode === 'lyrics' ? 'Song lyrics' : 'Song details', exact:true}).evaluate(element => element === document.activeElement));
        await page.keyboard.press('Escape');
        await page.locator('.side-drawer').waitFor({state:'detached'});
      }
      captures.push({width, height, theme, peers});
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(__dirname, `consistency-${stage}.json`), JSON.stringify({stage, properties, captures, errors}, null, 2)+'\n');
    console.log(`${stage}: captured expanded lyrics and details at 1440/light and 800/dark${stage === 'after' ? '; shared design checks and deliberate broken-spacing check passed' : ''}.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
