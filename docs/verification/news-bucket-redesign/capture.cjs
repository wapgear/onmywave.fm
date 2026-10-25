const { chromium } = require(process.env.WAVE_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');

async function openFixture(browser, width = 1440, height = 900, theme = 'dark') {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((theme) => {
    localStorage.setItem('wave:theme', theme);
    window.__fixtureSeed = { dj: true };
  }, theme);
  await page.route('**/docs/verification/playback-progress/fixture.mjs', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({ response, body: source.replace(
      'getPreparedNews:()=>ok({scripts:[],takes:[],requests:[],reviewedArticles:[]})',
      'getPreparedNews:()=>ok(window.__fixture.library??{scripts:[],takes:[],requests:[],reviewedArticles:[]})',
    ) });
  });
  await page.goto('http://127.0.0.1:5199');
  await page.waitForSelector('.song-table');
  await page.evaluate(() => {
    const fixture = window.__fixture;
    const state = fixture.state;
    const now = new Date().toISOString();
    const sources = [
      { id: 'fixture-source', name: 'Music news RSS', url: 'https://fixture.invalid/feed', kind: 'rss' },
      { id: 'tech-source', name: 'Technology RSS', url: 'https://fixture.invalid/technology', kind: 'rss' },
      { id: 'hn-source', name: 'Hacker News', url: 'https://news.ycombinator.com', kind: 'hacker-news' },
    ];
    state.sources = sources;
    const room = state.roomProfiles[0];
    room.name = 'Afternoon radio';
    room.room.sourceIds = sources.map((source) => source.id);
    room.workflowDraft = { ...room.workflowDraft, newsInterests: 'Music releases, useful technology', everyHours: 3, maxNewsClipsPerDay: 4, newsEnabled: false, newsLastRun: { requestId: 'run-fixture', startedAt: now, finishedAt: now, outcome: 'prepared', roomName: room.name } };
    state.djPlayback.enabled = false;
    state.djs[0].name = 'Your DJ';
    state.djs[0].instructions = 'Say what happened. Keep it natural. Avoid forced jokes and stock sign-offs.';
    const provenance = { dj: state.djs[0], mood: room.mood, sources, newsInterests: room.workflowDraft.newsInterests, roomId: room.id, roomName: room.name };
    const titles = ['New album announced for Friday', 'A new way to browse your library', 'Festival adds two evening sets'];
    const scripts = [
      'A new album is coming Friday. The announcement includes ten tracks and a first single you can hear now, according to the label.',
      'There is a new way to browse your library. The update adds filters for the albums you have saved, according to the project announcement.',
      'The festival has added two evening sets. Both are included in the existing ticket, according to the organiser.',
    ];
    const articles = titles.map((title, i) => ({ id: `article-${i}`, title, url: `https://fixture.invalid/story-${i}`, source: sources[i].name, publishedAt: now }));
    const takes = titles.map((_, i) => ({ id: `take-${i}`, requestId: `request-${i}`, script: scripts[i], articles: [articles[i]], warnings: i === 0 ? ['Technology RSS could not refresh. Coverage is incomplete.'] : [], engine: 'elevenlabs-v4', createdAt: now, audioUrl: `${location.origin}/fixture-speech-${i}`, signature: `signature-${i}`, provenance, renderingDJ: state.djs[0], available: true, byteLength: 100, model: 'fixture', voice: 'fixture', delivery: '', scriptId: `script-${i}`, deliveryState: i === 2 ? { status: 'played', playedAt: now } : { status: 'ready' } }));
    fixture.library = { scripts: [...takes.map((take) => ({ id: take.scriptId, requestId: take.requestId, script: take.script, articles: take.articles, warnings: take.warnings, provenance, createdAt: now })), { id: 'script-only', requestId: 'script-request', script: 'A saved script is waiting for audio.', articles: [articles[1]], warnings: [], provenance, createdAt: now }], takes, selectedTakeId: null, requests: [], reviewedArticles: articles.map((article, i) => ({ ...article, canonicalUrl: article.url, requestId: `request-${i}`, reviewedAt: now, status: 'reviewed', outcome: i === 1 ? 'not-selected' : 'selected' })) };
    fixture.client.setQueryData(['localState'], structuredClone(state));
    fixture.client.setQueryData(['preparedNews'], structuredClone(fixture.library));
  });
  await page.getByRole('button', { name: 'News bucket', exact: true }).click();
  await page.waitForSelector('.news-bucket');
  return { page, errors };
}

async function main() {
  const browser = await chromium.connectOverCDP(process.env.WAVE_DEBUG_URL || 'http://127.0.0.1:9335');
  const { page, errors } = await openFixture(browser);
  const mode = process.argv[2] || 'before';
  await page.screenshot({ path: `${__dirname}/${mode}-1440-dark.png` });
  await fs.writeFile(`${__dirname}/${mode}-errors.json`, JSON.stringify(errors));
  console.log(JSON.stringify({ mode, errors, body: (await page.locator('.news-bucket').innerText()).slice(0, 250) }));
  await page.close();
  await browser.close();
}

module.exports = { openFixture };
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
