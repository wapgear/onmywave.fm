import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const electron = require('electron');
const fixtureUserId = '000000000000000000000000000000aa';
const fixtureLibraryId = '000000000000000000000000000000bb';
const modules = path.join(root, 'node_modules');
const temporary = await import('node:fs/promises').then(({ mkdtemp }) =>
  mkdtemp(path.join(os.tmpdir(), 'wave-playback-relaunch-')),
);
const appData = path.join(temporary, 'app-data');
const mainBundle = path.join(root, 'out/main/index.js');
const testMain = path.join(root, 'out/main/verification-main.mjs');
const fixtureModule = path.join(root, 'docs/verification/playback-relaunch/renderer.mjs');
const results = [];
let server;
let fakeJellyfin;
let child;
let debuggerSocket;
let debugPort;
let childOutput = '';

function check(value, marker, message) {
  assert.ok(value, `${marker}: ${message}`);
}

function exact(source, anchor, replacement, marker) {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0)
    throw new Error(`Expected one source anchor for ${marker}`);
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

async function makeMain(mutant = false) {
  let source = await readFile(mainBundle, 'utf8');
  source = exact(
    source,
    'app.setName("onmywave.fm");',
    'app.setPath("appData", process.env.WAVE_APP_DATA);\napp.setName("onmywave.fm");',
    'isolated appData',
  );
  source = exact(
    source,
    'const stored = await readConnection();\n  if (stored) service.restore({ ...stored, sessionOnly: !persistentDeviceIdentity });',
    'const stored = null;\n  service.restore({ id: process.env.WAVE_FIXTURE_JELLYFIN + "|" + process.env.WAVE_FIXTURE_USER_ID, serverUrl: process.env.WAVE_FIXTURE_JELLYFIN, userId: process.env.WAVE_FIXTURE_USER_ID, userName: "Fixture listener", token: "synthetic-token", serverVersion: "10.9.0", selectedLibraryIds: [process.env.WAVE_FIXTURE_LIBRARY_ID], sessionOnly: true });',
    'synthetic provider session',
  );
  for (const [name, actual] of [
    ['getTwitterStatus', 'twitterKeyStatus()'],
    ['getAiStatus', 'openAIKeyStatus()'],
    ['getElevenLabsStatus', 'elevenLabsKeyStatus()'],
  ])
    source = exact(
      source,
      `${name}: () => ${actual},`,
      `${name}: () => ({ configured: false, sessionOnly: false }),`,
      `inert ${name}`,
    );
  source = exact(
    source,
    'app.on("before-quit", (event) => {',
    'process.on("SIGUSR2", () => { process.env.WAVE_DELAY_FLUSH = "1"; process.env.WAVE_DELAY_LEGACY_SAVE = "1"; app.quit(); });\napp.on("before-quit", (event) => {',
    'test quit signal',
  );
  source = exact(
    source,
    'async function savePlaybackSnapshot(input) {\n  validatePlayback(input);',
    'async function savePlaybackSnapshot(input) {\n  if (process.env.WAVE_DELAY_FLUSH === "1") await new Promise((resolve) => setTimeout(resolve, 650));\n  validatePlayback(input);',
    'controlled checkpoint write delay',
  );
  source = exact(
    source,
    'savePlayback: async (input) => {\n      await savePlaybackSnapshot(input);\n    },',
    'savePlayback: async (input) => {\n      if (process.env.WAVE_DELAY_LEGACY_SAVE === "1") await new Promise((resolve) => setTimeout(resolve, 2000));\n      await savePlaybackSnapshot(input);\n    },',
    'controlled legacy unload-save delay',
  );
  source = exact(
    source,
    '}).catch(() => {\n  app.quit();\n});',
    '}).catch((error) => {\n  console.error("RELAUNCH_MAIN_STARTUP_FAILURE", error);\n  app.quit();\n});',
    'startup diagnostics',
  );
  if (mutant) {
    source = exact(
      source,
      'app.on("before-quit", (event) => {\n  if (quitCheckpointed) {\n    quitCheckpointed = false;\n    beginShutdown();\n    return;\n  }\n  event.preventDefault();\n  if (quitCheckpointInFlight) return;\n  quitCheckpointInFlight = true;\n  void requestPlaybackCheckpoint().finally(() => {\n    quitCheckpointInFlight = false;\n    quitCheckpointed = true;\n    beginShutdown();\n    app.quit();\n  });\n});',
      'app.on("before-quit", () => { beginShutdown(); });',
      'missing quit barrier mutant',
    );
  }
  await writeFile(testMain, source);
}

async function startVite() {
  const { createServer } = await import(pathToFileURL(path.join(modules, 'vite/dist/node/index.js')));
  const { default: react } = await import(pathToFileURL(path.join(modules, '@vitejs/plugin-react/dist/index.js')));
  const ts = await import(pathToFileURL(path.join(modules, 'typescript/lib/typescript.js')));
  const serverInstance = await createServer({
    root: path.join(root, 'src/renderer'),
    configFile: false,
    plugins: [
      {
        name: 'playback-relaunch-observer',
        enforce: 'pre',
        transform(source, id) {
          if (!id.endsWith('/player.tsx')) return;
          const parsed = ts.createSourceFile(id, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
          const target = [];
          const visit = (node) => {
            if (ts.isFunctionDeclaration(node) && node.name?.text === 'usePlayer' && node.body) {
              const statement = node.body.statements.find(ts.isReturnStatement);
              if (statement) target.push(statement.getStart(parsed));
            }
            ts.forEachChild(node, visit);
          };
          visit(parsed);
          if (target.length !== 1) throw new Error('Expected exactly one usePlayer return to observe');
          const position = target[0];
          return `${source.slice(0, position)}window.__playbackRelaunch.player=value;\n${source.slice(position)}`;
        },
        transformIndexHtml() {
          return [
            {
              tag: 'script',
              children: `
                class RelaunchAudio extends EventTarget {
                  constructor() { super(); this.src=''; this.currentTime=0; this.duration=240; this.readyState=4; this.paused=true; this.ended=false; this.volume=1; this.seekable={length:1,start:()=>0,end:()=>240}; window.__playbackRelaunch.audios.push(this); }
                  get currentSrc() { return this.src; }
                  emit(name) { const event=new Event(name); this['on'+name]?.(event); this.dispatchEvent(event); }
                  play() { this.paused=false; this.ended=false; this.emit('play'); this.emit('playing'); return Promise.resolve(); }
                  pause() { if (!this.paused) { this.paused=true; this.emit('pause'); } }
                  load() { if (this.src) queueMicrotask(()=>{ this.emit('loadedmetadata'); this.emit('canplay'); }); }
                  removeAttribute(name) { if(name==='src'){this.src='';this.currentTime=0;} }
                }
                window.__playbackRelaunch={player:null,audios:[]};
                window.Audio=RelaunchAudio;
              `,
              injectTo: 'head-prepend',
            },
            {
              tag: 'script',
              attrs: { type: 'module', src: `/@fs/${fixtureModule}` },
              injectTo: 'head-prepend',
            },
          ];
        },
      },
      react(),
    ],
    server: { host: '127.0.0.1', port: 32000 + Math.floor(Math.random() * 20000), strictPort: true, fs: { allow: [root, modules] } },
  });
  await serverInstance.listen();
  const address = serverInstance.httpServer.address();
  return { instance: serverInstance, url: `http://127.0.0.1:${address.port}/`, port: address.port };
}

async function startJellyfin() {
  const { createServer } = await import('node:http');
  const songs = new Map([
    ['00000000000000000000000000000001', { Id: '00000000000000000000000000000001', Name: 'First occurrence', Artists: ['Fixture Artist'], Album: 'Fixture Album', AlbumId: '00000000000000000000000000000009', RunTimeTicks: 2400000000, Type: 'Audio' }],
    ['00000000000000000000000000000002', { Id: '00000000000000000000000000000002', Name: 'Current occurrence', Artists: ['Fixture Artist'], Album: 'Fixture Album', AlbumId: '00000000000000000000000000000009', RunTimeTicks: 2400000000, Type: 'Audio' }],
    ['00000000000000000000000000000003', { Id: '00000000000000000000000000000003', Name: 'Final occurrence', Artists: ['Fixture Artist'], Album: 'Fixture Album', AlbumId: '00000000000000000000000000000009', RunTimeTicks: 2400000000, Type: 'Audio' }],
  ]);
  const serverInstance = createServer((request, response) => {
    const match = new RegExp(`^/Users/${fixtureUserId}/Items/([a-f\\d]{32})$`, 'i').exec(new URL(request.url, 'http://fixture').pathname);
    if (request.method !== 'GET' || !match || !String(request.headers.authorization).includes('Token="synthetic-token"')) {
      response.writeHead(404).end();
      return;
    }
    const song = songs.get(match[1]);
    if (!song) response.writeHead(404).end();
    else response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(song));
  });
  await new Promise((resolve, reject) => { serverInstance.once('error', reject); serverInstance.listen(0, '127.0.0.1', resolve); });
  const address = serverInstance.address();
  return { instance: serverInstance, url: `http://127.0.0.1:${address.port}` };
}

async function openDebugger() {
  const started = Date.now();
  let targets;
  while (Date.now() - started < 20_000) {
    try {
      targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page' && item.url.startsWith(server.url));
      if (target) {
        const WebSocket = require('ws');
        debuggerSocket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          debuggerSocket.once('open', resolve);
          debuggerSocket.once('error', reject);
        });
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Renderer CDP target did not appear: ${JSON.stringify(targets)}\n${childOutput}`);
}

let nextCommand = 0;
function evaluate(expression) {
  const id = ++nextCommand;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP evaluation timed out: ${expression}`)), 5000);
    const listener = (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.id !== id) return;
      clearTimeout(timer);
      debuggerSocket.off('message', listener);
      if (message.error) reject(new Error(message.error.message));
      else if (message.result.exceptionDetails) reject(new Error(message.result.exceptionDetails.text));
      else resolve(message.result.result.value);
    };
    debuggerSocket.on('message', listener);
    debuggerSocket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}

async function startMain(mutant = false) {
  debugPort = undefined;
  childOutput = '';
  await makeMain(mutant);
  child = spawn(electron, ['--remote-debugging-port=0', testMain], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: server.url,
      WAVE_APP_DATA: appData,
      WAVE_FIXTURE_JELLYFIN: fakeJellyfin.url,
      WAVE_FIXTURE_USER_ID: fixtureUserId,
      WAVE_FIXTURE_LIBRARY_ID: fixtureLibraryId,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const capture = (chunk) => {
    output += chunk.toString();
    childOutput += chunk.toString();
    const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(output);
    if (match) debugPort = Number(match[1]);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const startup = Date.now();
  while (!debugPort && Date.now() - startup < 20_000) {
    if (child.exitCode !== null) throw new Error(`Electron exited before debugger startup (${child.exitCode}): ${output}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!debugPort) throw new Error(`No Electron remote debugging endpoint: ${output}`);
  await openDebugger();
  return output;
}

async function waitFor(expression, label, timeout = 12_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await evaluate(`(${expression})`);
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const diagnostic = await evaluate(`JSON.stringify({url:location.href,wave:!!window.wave,p:window.__playbackRelaunch?.player&&{current:window.__playbackRelaunch.player.current?.id,busy:window.__playbackRelaunch.player.busy,error:window.__playbackRelaunch.player.error},body:document.body.innerText.slice(0,200)})`).catch(() => 'unavailable');
  throw new Error(`${label} timed out: ${diagnostic}`);
}

async function quit() {
  if (debuggerSocket?.readyState === 1) debuggerSocket.close();
  debuggerSocket = null;
  const started = Date.now();
  const childToQuit = child;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Electron did not exit within 7 seconds')), 7000);
    childToQuit.once('error', (error) => { clearTimeout(timer); reject(error); });
    childToQuit.once('close', (code, signal) => { clearTimeout(timer); if (code !== 0) reject(new Error(`Electron exited ${code} (${signal})`)); else resolve(); });
    childToQuit.kill('SIGUSR2');
  });
  const elapsed = Date.now() - started;
  child = null;
  return elapsed;
}

async function waitForDisk(predicate, label, timeout = 5000) {
  const started = Date.now();
  let playback;
  while (Date.now() - started < timeout) {
    try {
      playback = await readPlayback();
      if (predicate(playback)) return playback;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${label} timed out; latest playback=${JSON.stringify(playback)}`);
}

async function readPlayback() {
  const state = JSON.parse(await readFile(path.join(appData, 'onmywave-light/local-state.json'), 'utf8'));
  return state.playback;
}

async function seed() {
  const userData = path.join(appData, 'onmywave-light');
  await mkdir(userData, { recursive: true });
  const snapshot = {
    connectionId: `${fakeJellyfin.url}|${fixtureUserId}`,
    trackIds: ['00000000000000000000000000000001', '00000000000000000000000000000002', '00000000000000000000000000000001', '00000000000000000000000000000003'],
    currentIndex: 2,
    position: 44,
    volume: 0.75,
    shuffle: true,
    repeat: 'all',
    shufflePlan: { upcoming: [], manualUpcoming: [0, 3], history: [0, 1, 2], cursor: 2, visited: [0, 1, 2] },
  };
  const state = {
    preparationErrorVersion: 1,
    djPlayback: {},
    roomProfiles: [],
    activeRoomProfileId: 'default-room',
    newsTransitions: {},
    djs: [],
    playback: snapshot,
    playbackPreferences: {},
    sources: [],
  };
  await writeFile(path.join(userData, 'local-state.json'), JSON.stringify(state));
  return snapshot;
}

async function main() {
  if (!process.platform.startsWith('darwin'))
    throw new Error('The relaunch verifier requires macOS safe storage and native Electron; CI runs it on macos-15.');
  fakeJellyfin = await startJellyfin();
  server = await startVite();
  const initial = await seed();

  await startMain();
  await waitFor('window.__playbackRelaunch?.player?.current && !window.__playbackRelaunch.player.busy && window.__playbackRelaunch.audios.some(a=>a.src.startsWith("wave-media://audio/"))', 'initial paused restore');
  const restored = await evaluate(`(() => {const audio=window.__playbackRelaunch.audios.find(a=>a.src.startsWith("wave-media://audio/"));return {ids:window.__playbackRelaunch.player.queue.map(x=>x.song.id.slice(-1)),current:window.__playbackRelaunch.player.current.id.slice(-1),playing:window.__playbackRelaunch.player.playing,position:audio.currentTime,upcoming:window.__playbackRelaunch.player.upcomingQueue.map(x=>x.upcomingId)}})()`);
  check(restored.ids.join('') === '1213' && restored.current === '1', 'restore', 'Actual PlayerProvider did not restore duplicate queue/current occurrence');
  check(await evaluate('window.__playbackRelaunch.player.currentKey === window.__playbackRelaunch.player.queue[2].key'), 'restore-current-occurrence', 'Restored second occurrence of the duplicate song is not current');
  check(!restored.playing && restored.position === 44, 'restore', 'Restore must remain paused at its saved position');
  check(restored.upcoming.length === 2, 'restore', 'Edited shuffle plan fixture did not restore upcoming visits');

  await evaluate(`(() => { const p=window.__playbackRelaunch.player; p.moveUpcoming(p.upcomingQueue[1].upcomingId,p.upcomingQueue[0].upcomingId); return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))); })()`);
  const reorderedOnDisk = await waitForDisk((snapshot) => snapshot.position === 44 && snapshot.shufflePlan?.manualUpcoming?.join(',') === '3,0', 'normal queue checkpoint');
  check(reorderedOnDisk.position === 44, 'pre-quit-stale-position', 'Queue edit checkpoint unexpectedly changed the live position');
  const reorderedInRenderer = await evaluate('window.__playbackRelaunch.player.upcomingQueue.map(x=>x.song.id.slice(-1)).join("")');
  check(reorderedInRenderer === '31', 'live-edit', 'Shuffle future reorder was not applied before quit');
  await evaluate(`(() => { window.__playbackRelaunch.player.toggle(); return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))); })()`);
  await waitFor('window.__playbackRelaunch.player.playing && window.__playbackRelaunch.audios.some(a=>a.src.startsWith("wave-media://audio/") && !a.paused)', 'resume before quit');
  await evaluate(`(() => { const a=window.__playbackRelaunch.audios.find(a=>a.src.startsWith("wave-media://audio/")); a.currentTime=73; a.ontimeupdate?.(); return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))); })()`);
  const beforeQuit = await evaluate(`(() => {const a=window.__playbackRelaunch.audios.find(a=>a.src.startsWith("wave-media://audio/"));return {position:a.currentTime,playing:window.__playbackRelaunch.player.playing}})()`);
  check(beforeQuit.position === 73 && beforeQuit.playing, 'live-position', 'Live playing position change was not applied');
  await new Promise((resolve) => setTimeout(resolve, 100));
  const staleBeforeQuit = await readPlayback();
  check(staleBeforeQuit.position === 44 && staleBeforeQuit.shufflePlan.manualUpcoming.join(',') === '3,0', 'pre-quit-stale-position', 'Position update was already persisted before the quit checkpoint');
  const exitMs = await quit();
  const saved = await readPlayback();
  check(saved.position === 73, 'final-checkpoint', 'Quit checkpoint did not persist the current live position');
  check(saved.trackIds.join(',') === initial.trackIds.join(','), 'final-checkpoint', 'Duplicate queue order changed during checkpoint');
  check(saved.currentIndex === 2, 'final-checkpoint', 'Current duplicate occurrence index was not checkpointed');
  check(saved.shufflePlan.manualUpcoming.join(',') === '3,0', 'final-checkpoint', 'Edited shuffle visit order was not checkpointed');
  results.push({ scenario: 'real quit flush writes latest playing position and edited duplicate shuffle before five-second timer; relaunch policy restores paused', exitMs, preQuitDiskPosition: staleBeforeQuit.position, position: saved.position, currentIndex: saved.currentIndex, manualUpcoming: saved.shufflePlan.manualUpcoming });

  await startMain();
  await waitFor('window.__playbackRelaunch?.player?.current && !window.__playbackRelaunch.player.busy && window.__playbackRelaunch.audios.some(a=>a.src.startsWith("wave-media://audio/"))', 'fresh process paused restore');
  const reopened = await evaluate(`(() => {const audio=window.__playbackRelaunch.audios.find(a=>a.src.startsWith("wave-media://audio/"));return {ids:window.__playbackRelaunch.player.queue.map(x=>x.song.id.slice(-1)),current:window.__playbackRelaunch.player.current.id.slice(-1),playing:window.__playbackRelaunch.player.playing,position:audio.currentTime,upcoming:window.__playbackRelaunch.player.upcomingQueue.map(x=>x.song.id.slice(-1))}})()`);
  check(reopened.ids.join('') === '1213' && reopened.current === '1', 'relaunch', 'Fresh process did not restore duplicate queue/current occurrence');
  check(await evaluate('window.__playbackRelaunch.player.currentKey === window.__playbackRelaunch.player.queue[2].key'), 'relaunch-current-occurrence', 'Fresh process selected the wrong duplicate occurrence');
  check(!reopened.playing && reopened.position === 73, 'relaunch', 'Fresh process did not restore paused latest position');
  check(reopened.upcoming.join('') === '31', 'relaunch', 'Fresh process lost edited shuffle upcoming order');
  results.push({ scenario: 'fresh Electron process restores durable paused state and exact shuffle future', position: reopened.position, upcoming: reopened.upcoming });
  await quit();

  await writeFile(path.join(appData, 'onmywave-light/local-state.json'), JSON.stringify({ ...JSON.parse(await readFile(path.join(appData, 'onmywave-light/local-state.json'), 'utf8')), playback: initial }));
  await startMain(true);
  await waitFor('window.__playbackRelaunch?.player?.current && !window.__playbackRelaunch.player.busy && window.__playbackRelaunch.audios.some(a=>a.src.startsWith("wave-media://audio/"))', 'mutant initial restore');
  await evaluate(`(() => { const a=window.__playbackRelaunch.audios.find(a=>a.src.startsWith("wave-media://audio/")); a.currentTime=111; a.ontimeupdate?.(); return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))); })()`);
  await quit();
  const mutantDisk = await readPlayback();
  check(mutantDisk.position === 44, 'mutant-detection', 'Removing the before-quit checkpoint barrier unexpectedly persisted the final position');
  results.push({ scenario: 'omitted-before-quit-barrier mutant is detected by durable readback', expectedPosition: 44, attemptedPosition: 111, detected: true });

  console.log(JSON.stringify({ verification: 'Production Electron main bundle + production preload + actual renderer PlayerProvider + local-state storage, with synthetic Jellyfin metadata/audio; isolated appData, no account/keychain/provider use', results }, null, 2));
}

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (debuggerSocket?.readyState === 1) debuggerSocket.close();
  if (child) {
    const exited = new Promise((resolve) => child.once('close', resolve));
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1500))]);
    if (child && child.exitCode === null) {
      child.kill('SIGKILL');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1000))]);
    }
  }
  await server?.instance.close().catch(() => {});
  if (fakeJellyfin) await new Promise((resolve) => fakeJellyfin.instance.close(resolve));
  await rm(testMain, { force: true });
  await rm(temporary, { recursive: true, force: true });
});
