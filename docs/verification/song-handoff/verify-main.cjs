const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = process.cwd();
const originalLoad = Module._load;
const originalExtension = require.extensions['.ts'];
const originalFetch = global.fetch;
const audio = fs.readFileSync(path.join(root, 'src/renderer/public/demo/news-break.mp3'));
const calls = [];
const take = {
  id: 'fixture-take', available: true, voice: 'fixture-voice', delivery: '[warm]',
  ending: 'story-only',
  renderingDJ: { id: 'fixture-dj', language: 'English' }, script: 'The reusable bulletin.',
};
let song = { id: 'fixture-song', name: 'Where Are You My Love', artists: ['Avalance'] };
let behavior = 'success';
let dispatch;
let allowed = true;
const playback = { enabled: false, roomId: null, everySongs: 3, announceTracks: true };

class ServiceError extends Error { constructor(code, message) { super(message); this.code = code; } }

require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
Module._load = function (id, parent, ...rest) {
  if (id === './storage' && parent?.filename.endsWith('/song-handoffs.ts'))
    return { getLocalState: async () => ({ djPlayback: playback, activeRoomProfileId: 'fixture-room', roomProfiles: [{ id: 'fixture-room', room: { djId: 'fixture-dj' } }], djs: [{ ...take.renderingDJ, news: { elevenVoiceId: 'fixture-voice', elevenTags: '[warm]' } }] }) };
  if (id === './prepared-news' && parent?.filename.endsWith('/song-handoffs.ts'))
    return { getPreparedNews: async () => ({ takes: [take] }) };
  if (id === './jellyfin' && parent?.filename.startsWith(path.join(root, 'src/main')))
    return { ServiceError };
  return originalLoad.call(this, id, parent, ...rest);
};
global.fetch = async (url, options) => {
  assert(String(url).startsWith('https://api.elevenlabs.io/v1/text-to-speech/fixture-voice?'));
  calls.push(JSON.parse(options.body));
  dispatch?.();
  if (behavior === 'failure') throw new Error('Fixture connection lost after dispatch');
  if (behavior === 'pending') await new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Fixture aborted')), { once: true });
  });
  return new Response(audio, { headers: { 'content-type': 'audio/mpeg' } });
};

(async () => {
  try {
    const { NewsService } = require(path.join(root, 'src/main/news.ts'));
    const { prepareSongHandoff, cancelSongHandoff, songHandoffAudio, revokeSongHandoffs } = require(path.join(root, 'src/main/song-handoffs.ts'));
    const { announcementTemplates, formatSongAnnouncement } = require(path.join(root, 'src/shared/song-announcements.ts'));
    const news = new NewsService({ getApiKey: async () => null, getElevenApiKey: async () => 'fixture-key', canGenerate: () => allowed });
    const prepare = (requestId) => prepareSongHandoff(news, async (id) => { assert.equal(id, song.id); return song; }, { requestId, takeId: take.id, songId: song.id });
    delete playback.announceTracks;
    assert.equal(await prepare('legacy-settings'), null);
    playback.announceTracks = false;
    assert.equal(await prepare('disabled-settings'), null);
    playback.announceTracks = true;
    delete take.ending;
    assert.equal(await prepare('legacy-ending'), null);
    take.ending = 'story-only';
    assert.equal(calls.length, 0, 'Disabled settings or legacy endings dispatched paid speech');
    const link = await prepare('request-one');
    assert(announcementTemplates('varied', '').some((line) => formatSongAnnouncement(line, song.name, 'Avalance') === link.script));
    assert.equal(calls[0].text, `[warm] ${link.script}`);
    assert.equal(calls[0].model_id, 'eleven_v4');
    assert(songHandoffAudio(new URL(link.audioUrl).pathname.slice(1)).equals(audio));
    assert.equal(take.script, 'The reusable bulletin.');
    assert.deepEqual(await prepare('request-two'), link);
    assert.equal(calls.length, 1, 'Reused introduction triggered another paid request');
    assert.deepEqual(await prepareSongHandoff(news, async () => song, { requestId: 'standalone-request', songId: song.id }), link, 'Standalone introductions must use the saved room DJ and shared voice cache');
    assert.equal(calls.length, 1);

    song = { ...song, name: 'Instrumental', artists: [] };
    const instrumental = await prepare('missing-artist');
    assert(instrumental.script.includes('Instrumental'));
    assert(!instrumental.script.includes(' by '));
    song.name = 'Untitled song';
    assert.equal(await prepare('missing-title'), null);
    song.name = 'x'.repeat(161);
    assert.equal(await prepare('long-title'), null);
    await assert.rejects(prepareSongHandoff(news, async () => song, { requestId: '../escape', takeId: take.id, songId: song.id }));
    assert.equal(calls.length, 2);

    song.name = 'Cancelled song';
    behavior = 'pending';
    const entered = new Promise((resolve) => { dispatch = resolve; });
    const pending = prepare('cancelled-request');
    await entered;
    cancelSongHandoff('cancelled-request');
    await assert.rejects(pending);
    behavior = 'success';
    await assert.rejects(prepare('cancelled-again'));
    assert.equal(calls.length, 3, 'Cancelled uncertain speech was silently retried');

    behavior = 'failure';
    song.name = 'Uncertain song';
    await assert.rejects(prepare('uncertain-request'));
    await assert.rejects(prepare('uncertain-again'));
    assert.equal(calls.length, 4, 'Uncertain speech was silently retried');

    allowed = false;
    await assert.rejects(prepare('signed-out'));
    allowed = true;
    behavior = 'success';
    song.name = 'Recovered song';
    assert(await prepare('signed-in'));
    for (const style of ['warm', 'energetic', 'minimal', 'varied']) {
      playback.announcementStyle = style;
      const recent = [];
      for (let index = 0; index < 12; index++) {
        song = { ...song, name: `Variety ${style} ${index}`, artists: ['Fixture artist'] };
        const result = await prepare(`variety-${style}-${index}`);
        const template = announcementTemplates(style, '').find((line) => formatSongAnnouncement(line, song.name, 'Fixture artist') === result.script);
        assert(template, 'Spoken introduction did not match the selected style and exact song metadata');
        assert(!recent.slice(-5).includes(template), 'The same phrasing repeated inside the recent five introductions');
        recent.push(template);
      }
    }
    playback.announcementStyle = 'custom';
    playback.announcementLines = 'Tu próxima escapada: {track}.\n\nTu próxima escapada: {track}.';
    song = { ...song, name: 'Custom song', artists: ['Fixture artist'] };
    const custom = await prepare('custom-one');
    assert.equal(custom.script, 'Tu próxima escapada: Custom song by Fixture artist.');
    const customCount = calls.length;
    assert.deepEqual(await prepare('custom-retry'), custom);
    assert.equal(calls.length, customCount, 'A custom-line retry dispatched more paid speech');
    song.name = 'Another custom song';
    assert.equal((await prepare('custom-two')).script, 'Tu próxima escapada: Another custom song by Fixture artist.');
    playback.announcementLines = 'Welcome back to {track}.';
    assert.equal((await prepare('custom-edited')).script, 'Welcome back to Another custom song by Fixture artist.', 'Edited custom wording reused a stale clip');
    playback.announcementStyle = 'minimal';
    const changedStyle = await prepare('style-edited');
    assert(announcementTemplates('minimal', '').some((line) => formatSongAnnouncement(line, song.name, 'Fixture artist') === changedStyle.script), 'Changed style reused a stale clip');
    revokeSongHandoffs();
    assert.equal(songHandoffAudio(new URL(link.audioUrl).pathname.slice(1)), null);
    console.log(JSON.stringify({ verification: 'main process → real NewsService → fixture ElevenLabs response', passed: true, providerRequests: calls.length, checks: ['exact title and artist', 'saved voice and delivery', 'audio serving', 'reusable bulletin unchanged', 'cache reuse', 'missing metadata', 'IPC validation', 'cancellation', 'uncertain dispatch not retried', 'generation gate recovery', 'all styles avoid recent five phrases', 'custom language, duplicate and blank lines', 'single custom line rotation', 'custom retry cache', 'style and wording changes replace stale clips', 'session revocation'] }));
  } finally {
    Module._load = originalLoad;
    require.extensions['.ts'] = originalExtension;
    global.fetch = originalFetch;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
