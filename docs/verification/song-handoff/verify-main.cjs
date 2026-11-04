const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { compile, registerFixtureImports } = require('../../../scripts/verification-code.mjs');

registerFixtureImports();
const root = process.cwd();
const originalLoad = Module._load;
const originalExtension = require.extensions['.ts'];
const originalFetch = global.fetch;
const audio = fs.readFileSync(path.join(root, 'src/renderer/public/demo/news-break.mp3'));
const calls = { writing: [], speech: [], sources: [] };
const dj = { id: 'fixture-dj', name: 'Fixture host', language: 'English', personality: 'Warm and curious', instructions: 'Be conversational', musicPreferences: 'Indie', exclusions: 'No gossip' };
const take = { id: 'fixture-take', available: true, voice: 'fixture-voice', delivery: '[warm]', ending: 'story-only', renderingDJ: dj, script: 'The reusable bulletin.' };
let song = { id: 'fixture-song', name: 'Fixture Lights', artists: ['Fixture Band'], album: 'Night', year: 2005, genres: ['Indie'], tags: [] };
const outgoing = { ...song, id: 'outgoing-song', name: 'Fixture Sunset', year: 2004 };
let behavior = 'success';
let pick = 0;
let dispatch;
let allowed = true;
let apiKey = 'fixture-openai';
let resultOverride;
let transition = 'boundary-one';
const playback = { enabled: false, roomId: null, everySongs: 3, announceTracks: true };
class ServiceError extends Error { constructor(code, message) { super(message); this.code = code; } }
require.extensions['.ts'] = (mod, file) => mod._compile(compile(fs.readFileSync(file, 'utf8'), file), file);
Module._load = function (id, parent, ...rest) {
  if (id === 'node:crypto' && parent?.filename.endsWith('/song-handoffs.ts'))
    return { ...originalLoad.call(this, id, parent, ...rest), randomInt: (max) => pick < 0 ? max - 1 : pick % max };
  if (id === './storage' && parent?.filename.endsWith('/song-handoffs.ts'))
    return { getLocalState: async () => ({ djPlayback: playback, activeRoomProfileId: 'fixture-room', roomProfiles: [{ id: 'fixture-room', mood: 'Late-night company', room: { djId: dj.id } }], djs: [{ ...dj, news: { elevenVoiceId: 'fixture-voice', elevenTags: '[warm]' } }] }) };
  if (id === './prepared-news' && parent?.filename.endsWith('/song-handoffs.ts')) return { getPreparedNews: async () => ({ takes: [take] }) };
  if (id === './jellyfin' && parent?.filename.startsWith(path.join(root, 'src/main'))) return { ServiceError };
  if (['node:http', 'node:https'].includes(id) && parent?.filename.endsWith('/news-source.ts')) return { request: (url) => {
    calls.sources.push(url.href);
    throw new Error('Song links must not retrieve external articles');
  } };
  return originalLoad.call(this, id, parent, ...rest);
};
function output(value) {
  const item = { type: 'message', id: 'fixture-message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value) }] };
  const response = { id: 'fixture-response', model: 'gpt-6-luna', status: 'completed', output: [item] };
  return new Response([
    { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [], status: 'in_progress' } },
    { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: JSON.stringify(value) },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response },
  ].map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
}
global.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  const writing = String(url) === 'https://api.openai.com/v1/responses';
  if (!writing) assert(String(url).startsWith('https://api.elevenlabs.io/v1/text-to-speech/fixture-voice?'));
  const phase = writing ? 'writing' : 'speech';
  calls[phase].push(body);
  if (behavior === `${phase}-failure`) throw new Error('Fixture connection lost after dispatch');
  if (behavior === `${phase}-pending`) {
    dispatch?.();
    await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('Fixture aborted')), { once: true }));
  }
  if (!writing) return new Response(audio, { headers: { 'content-type': 'audio/mpeg' } });
  const context = JSON.parse(body.input.find((item) => item.role === 'user').content[0].text);
  const track = `${context.upcoming.name}${context.upcoming.artists.length ? ` by ${context.upcoming.artists.join(', ')}` : ''}`;
  assert.equal(body.model, 'gpt-6-luna', 'Song links must use the connected text model');
  assert.equal(context.source, undefined, 'Song knowledge must not require a retrieved source');
  const script = context.afterNews || context.approach === 'brief' || context.style === 'minimal'
    ? `Here's ${track}.`
    : context.approach === 'song-story'
      ? `The band wrote ${context.upcoming.name} during a train journey. A passing moment turned into a song they could take with them, which is a nice way to think about a record finding its place in your day. Now, ${track}.`
      : `Some songs give you a moment to reset before the next thing arrives. Let's keep that little pocket of listening time going, wherever the day has taken you. Make a little room for this one: ${track}. Stay with the music.`;
  return output(resultOverride ?? { script });
};
(async () => {
  try {
    const { NewsService } = require(path.join(root, 'src/main/news.ts'));
    const { prepareSongHandoff, cancelSongHandoff, songHandoffAudio, revokeSongHandoffs } = require(path.join(root, 'src/main/song-handoffs.ts'));
    const news = new NewsService({ getApiKey: async () => apiKey, getElevenApiKey: async () => 'fixture-key', canGenerate: () => allowed });
    const prepare = (requestId, withNews = true, previous = outgoing.id) => prepareSongHandoff(news, async (id) => {
      assert([song.id, outgoing.id].includes(id)); return id === outgoing.id ? outgoing : song;
    }, { requestId, takeId: withNews ? take.id : undefined, songId: song.id, previousSongId: previous, transitionId: transition });
    const context = () => JSON.parse(calls.writing.at(-1).input.find((item) => item.role === 'user').content[0].text);
    delete playback.announceTracks;
    assert.equal(await prepare('legacy-settings'), null);
    playback.announceTracks = false;
    assert.equal(await prepare('disabled-settings'), null);
    playback.announceTracks = true;
    delete take.ending;
    assert.equal(await prepare('legacy-ending'), null);
    take.ending = 'story-only';
    assert.equal(calls.writing.length + calls.speech.length, 0);
    const link = await prepare('request-one');
    assert(link.script.includes(song.name));
    assert.equal(calls.speech[0].text, `[warm] ${link.script}`);
    assert.equal(calls.speech[0].model_id, 'eleven_v4');
    assert(songHandoffAudio(new URL(link.audioUrl).pathname.slice(1)).equals(audio));
    assert.equal(take.script, 'The reusable bulletin.');
    assert.equal(context().afterNews, true);
    assert.equal(context().approach, 'brief');
    assert.equal(context().host.mood, 'Late-night company');
    assert.equal(context().host.instructions, dj.instructions);
    assert.deepEqual(await prepare('retry-one'), link);
    assert.equal(calls.writing.length, 1);
    assert.equal(calls.speech.length, 1);
    await prepare('standalone', false);
    assert.equal(context().afterNews, false);
    assert.equal(context().outgoing.name, outgoing.name);
    assert.equal(context().upcoming.year, 2005);
    assert(context().recentLinks.includes(link.script));
    assert.equal(calls.writing.length, 2, 'A post-news clip was reused for a standalone boundary');
    const beforeNewBoundary = calls.writing.length;
    transition = 'boundary-two';
    await prepare('new-boundary', false);
    assert.equal(calls.writing.length, beforeNewBoundary + 1, 'A repeat visit reused stale continuity');

    pick = -1;
    transition = 'story-boundary';
    const story = await prepare('song-story', false);
    assert.equal(context().approach, 'song-story');
    assert(story.script.includes('train journey'), 'The model-written story did not reach speech');
    assert.equal(story.articles, undefined, 'Model knowledge must not be presented as a retrieved citation');
    assert.equal(calls.sources.length, 0, 'A song-story link retrieved an external article');
    transition = 'uncertain-bridge'; await prepare('uncertain-bridge', false);
    resultOverride = { script: "There is no need to rush the next few minutes. Wherever you are listening, let this be a little space in the day that belongs to you. Stay a while with Fixture Lights by Fixture Band, and see where it takes you." };
    transition = 'uncertain-story';
    const simple = await prepare('uncertain-story', false);
    assert.equal(context().approach, 'song-story');
    assert.equal(simple.script, resultOverride.script, 'The writer may skip uncertain trivia while keeping a developed bridge');
    resultOverride = { script: "Here's Fixture Lights by Fixture Band." };
    transition = 'undersized-full-link';
    const speechBeforeShort = calls.speech.length;
    await assert.rejects(prepare('undersized-full-link', false));
    assert.equal(calls.speech.length, speechBeforeShort, 'A six-second draft reached speech for a fuller link');
    resultOverride = undefined;
    playback.announcementStyle = 'minimal';
    transition = 'minimal'; await prepare('minimal', false);
    assert.equal(context().approach, 'brief');
    assert.equal(context().recentLinks.length, 5);

    playback.announcementStyle = 'minimal';

    song = { ...song, name: 'Instrumental', artists: [] };
    transition = 'instrumental'; const instrumental = await prepare('missing-artist');
    assert(instrumental.script.includes('Instrumental'));
    assert(!instrumental.script.includes(' by '));
    song.name = 'Untitled song'; assert.equal(await prepare('missing-title'), null);
    song.name = 'x'.repeat(161); assert.equal(await prepare('long-title'), null);
    await assert.rejects(prepareSongHandoff(news, async () => song, { requestId: 'bad-context', songId: song.id, previousSongId: '../escape' }));
    song = { ...song, name: 'Validated Song', artists: ['Fixture Band'] };
    for (const [name, script] of [['wrong-track', 'Here is a different track.'], ['markup', `Here is <b>${song.name}</b> by Fixture Band.`], ['long', `${'word '.repeat(56)}${song.name} by Fixture Band.`]]) {
      transition = name; resultOverride = { script };
      const speechCount = calls.speech.length;
      await assert.rejects(prepare(`invalid-${name}`));
      assert.equal(calls.speech.length, speechCount, 'Invalid text reached paid speech');
    }
    resultOverride = undefined;
    apiKey = null; transition = 'no-openai'; await assert.rejects(prepare('no-openai'));
    apiKey = 'fixture-openai';

    for (const phase of ['writing', 'speech']) {
      transition = `${phase}-cancelled`; behavior = `${phase}-pending`;
      const entered = new Promise((resolve) => { dispatch = resolve; });
      const pending = prepare(`${phase}-pending`);
      await entered; cancelSongHandoff(`${phase}-pending`); await assert.rejects(pending);
      behavior = 'success';
      const counts = [calls.writing.length, calls.speech.length];
      await assert.rejects(prepare(`${phase}-cancelled-retry`));
      assert.deepEqual([calls.writing.length, calls.speech.length], counts, 'A cancelled paid request was silently retried');
      transition = `${phase}-uncertain`; behavior = `${phase}-failure`;
      await assert.rejects(prepare(`${phase}-uncertain`));
      const failedCounts = [calls.writing.length, calls.speech.length];
      await assert.rejects(prepare(`${phase}-uncertain-retry`));
      assert.deepEqual([calls.writing.length, calls.speech.length], failedCounts);
    }
    behavior = 'success'; allowed = false; await assert.rejects(prepare('signed-out')); allowed = true;
    transition = 'recovered'; await prepare('signed-in');
    const count = calls.writing.length;
    playback.announcementStyle = 'custom';
    playback.announcementLines = 'Tu próxima escapada: {track}.\n\nTu próxima escapada: {track}.';
    transition = 'custom';
    assert.equal((await prepare('custom-one')).script, 'Tu próxima escapada: Validated Song by Fixture Band.');
    await prepare('custom-retry');
    assert.equal(calls.writing.length, count, 'Custom lines must not make text-generation requests');
    playback.announcementLines = 'Welcome back to {track}.';
    assert.equal((await prepare('custom-edited')).script, 'Welcome back to Validated Song by Fixture Band.');
    revokeSongHandoffs();
    assert.equal(songHandoffAudio(new URL(link.audioUrl).pathname.slice(1)), null);
    assert.equal(calls.sources.length, 0);
    console.log(JSON.stringify({ verification: 'main process → actual NewsService → fixture GPT-6 and ElevenLabs, no article lookups', passed: true, writingRequests: calls.writing.length, speechRequests: calls.speech.length, sourceRequests: calls.sources.length, checks: ['outgoing and incoming metadata', 'DJ preferences and mood', 'brief post-news links', 'recent continuity context', 'fresh repeat boundary', 'model-written song story', 'automatic wording variety without a chance setting', 'developed bridge when trivia is skipped', 'undersized full links rejected before speech', 'no external fact lookups', 'minimal skips trivia', 'metadata validation', 'no invalid text sent to speech', 'cache and uncertain-attempt reuse', 'cancellation in writing and speech', 'generation gating', 'custom lines bypass generation', 'revocation'] }));
  } finally {
    Module._load = originalLoad; require.extensions['.ts'] = originalExtension; global.fetch = originalFetch;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
