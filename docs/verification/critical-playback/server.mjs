import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function main() {
  let app;
  let BrowserWindow;
  let session;
  let fixtureDir;
  let server;
  let window;
  const results = [];
  const closeWindow = async () => {
    if (window && !window.isDestroyed()) window.destroy();
    window = undefined;
  };
  try {
    const root = process.cwd();
    const modules = realpathSync(path.join(root, 'node_modules'));
    console.log('CRITICAL_PLAYBACK_STARTUP entry-loaded');
    ({ app, BrowserWindow, session } = await import('electron'));
    fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'wave-critical-playback-'));
    const userData = path.join(fixtureDir, 'user-data');
    await mkdir(userData, { recursive: true });
    const scenario = process.env.WAVE_SCENARIO ?? 'baseline';
    const mutation = process.env.WAVE_MUTATION;
    const expectedMutation = process.env.WAVE_EXPECT_ASSERTION;
    let currentSeed;
    const fixtureIds = ['1', '2', '1'];
    const normalizeId = (id) => String(id).padStart(32, '0');
    const snapshot = (
      trackIds = fixtureIds,
      currentIndex = 1,
      position = 44,
      shuffle = false,
      repeat = 'off',
      shufflePlan,
    ) => ({
      connectionId: 'fixture-session',
      trackIds: trackIds.map(normalizeId),
      currentIndex,
      position,
      volume: 0.75,
      shuffle,
      repeat,
      ...(shufflePlan ? { shufflePlan } : {}),
    });
    const shuffledAll = () => {
      const indices = Array.from({ length: 120 }, (_, index) => index);
      return snapshot(
        Array.from({ length: 120 }, (_, index) => String(index + 1).padStart(32, '0')),
        119,
        0,
        true,
        'all',
        {
          upcoming: [],
          history: indices,
          cursor: 119,
          visited: indices,
        },
      );
    };
    const shuffledDuplicates = () => {
      const indices = Array.from({ length: 120 }, (_, index) => index);
      return snapshot(Array(120).fill('1'), 0, 0, true, 'off', {
        upcoming: indices.slice(1, 51),
        history: [0],
        cursor: 0,
        visited: [0],
      });
    };

    console.log('CRITICAL_PLAYBACK_STARTUP electron-imported');
    app.setPath('userData', userData);
    app.on('window-all-closed', () => {});
    console.log('CRITICAL_PLAYBACK_STARTUP awaiting-app-ready');
    let readyTimer;
    try {
      await Promise.race([
        app.whenReady(),
        new Promise((_, reject) => {
          readyTimer = setTimeout(
            () => reject(new Error('Electron app did not become ready within 30 seconds')),
            30_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(readyTimer);
    }
    console.log('CRITICAL_PLAYBACK_STARTUP app-ready');
    const { createServer } = await import(pathToFileURL(path.join(modules, 'vite/dist/node/index.js')));
    const { default: react } = await import(pathToFileURL(path.join(modules, '@vitejs/plugin-react/dist/index.js')));
    const { default: ts } = await import(pathToFileURL(path.join(modules, 'typescript/lib/typescript.js')));
    const exact = (source, needle, replacement, label) => {
      const index = source.indexOf(needle);
      if (index < 0 || source.indexOf(needle, index + needle.length) >= 0)
        throw new Error(`Fixture transform anchor must occur once (${label})`);
      return source.replace(needle, replacement);
    };
    const mutations = {
      'restore-position': {
        anchor:
          'target.current = songs[restoredIndex]?.id === saved.trackIds[saved.currentIndex] ? saved.position : 0;',
        replacement: 'target.current = 0;',
        scenario: 'verifyRestore',
        assertion: 'restore-position',
      },
      'resume-on-restore': {
        anchor: 'requestPlayback(false);\n        setPlaying(false);\n        publishPosition(target.current);',
        replacement: 'requestPlayback(true);\n        setPlaying(true);\n        publishPosition(target.current);',
        scenario: 'verifyRestore',
        assertion: 'restore-paused',
      },
      'duplicate-key': {
        anchor: '({ key: crypto.randomUUID(), song })',
        replacement: '({ key: song.id, song })',
        scenario: 'verifyDuplicate',
        assertion: 'duplicate-key',
      },
      'natural-end': {
        anchor: '      continueAfterSong();\n    };\n    element.onerror',
        replacement: '      return;\n    };\n    element.onerror',
        scenario: 'verifyNaturalEnd',
        assertion: 'natural-end',
      },
      'repeat-shuffle': {
        anchor: "          state.repeat === 'all',",
        replacement: '          false,',
        scenario: 'verifyRepeatShuffle',
        assertion: 'repeat-shuffle',
      },
      'suppress-release': {
        anchor: 'if (delivery && !playInvoked)',
        replacement: 'if (false && delivery && !playInvoked)',
        scenario: 'verifyNewsCancellation',
        assertion: 'news-release',
      },
    };
    const mutationSpec = mutation ? mutations[mutation] : null;
    if (mutation && (!mutationSpec || mutationSpec.assertion !== expectedMutation))
      throw new Error('Invalid mutation configuration');
    const fixtureModule = path.join(root, 'docs/verification/playback-progress/fixture.mjs');
    const scenarioModule = path.join(root, scenario === 'song-handoff'
      ? 'docs/verification/song-handoff/scenarios.mjs'
      : 'docs/verification/critical-playback/scenarios.mjs');
    server = await createServer({
      root: path.join(root, 'src/renderer'),
      configFile: false,
      plugins: [
        {
          name: 'critical-playback-fixture',
          enforce: 'pre',
          transform(source, id) {
            if (id === fixtureModule) {
              source = source.replaceAll('__FIXTURE_ROOT__', root);
              return exact(
                source,
                "getPlaybackPreferences:()=>ok({volume:.75,shuffle:false,repeat:'off'})",
                "getPlaybackPreferences:()=>ok(window.__fixtureSeed?.preferences??{volume:.75,shuffle:false,repeat:'off'})",
                'fixture preferences',
              );
            }
            if (!id.startsWith(path.join(root, 'src/renderer'))) return;
            if (id.endsWith('/App.tsx')) {
              const parsed = ts.createSourceFile(id, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
              let position;
              const visit = (node) => {
                if (ts.isFunctionDeclaration(node) && node.name?.text === 'App' && node.body) {
                  const statement = node.body.statements.find(ts.isReturnStatement);
                  if (statement) position = statement.getStart(parsed);
                }
                ts.forEachChild(node, visit);
              };
              visit(parsed);
              if (position === undefined) throw new Error('App fixture instrumentation target is missing');
              return `${source.slice(0, position)}window.__fixture.client=client;\n${source.slice(position)}`;
            }
            if (!id.endsWith('/player.tsx')) return;
            if (mutationSpec) source = exact(source, mutationSpec.anchor, mutationSpec.replacement, mutation);
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
            if (target.length !== 1) throw new Error('Expected one usePlayer return for fixture instrumentation');
            const position = target[0];
            return `${source.slice(0, position)}window.__fixture.player=value;\n${source.slice(position)}`;
          },
          transformIndexHtml() {
            return [
              {
                tag: 'script',
                children: `window.__fixtureSeed=${JSON.stringify(currentSeed)};`,
                injectTo: 'head-prepend',
              },
              { tag: 'script', attrs: { type: 'module', src: `/@fs/${fixtureModule}` }, injectTo: 'head-prepend' },
              { tag: 'script', attrs: { type: 'module', src: `/@fs/${scenarioModule}` }, injectTo: 'head-prepend' },
            ];
          },
        },
        react(),
      ],
      server: { host: '127.0.0.1', port: 5199, strictPort: true, fs: { allow: [root, modules] } },
    });

    const emit = (result) => {
      results.push(result);
      console.log(`CRITICAL_PLAYBACK_RESULT ${JSON.stringify(result)}`);
    };
    const open = async (seed) => {
      currentSeed = seed;
      window = new BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          backgroundThrottling: false,
          preload: undefined,
        },
      });
      window.webContents.on('console-message', (event) => {
        if (event.level >= 2) console.error(`CRITICAL_PLAYBACK_RENDERER ${event.message}`);
      });
      window.webContents.on('did-fail-load', (_event, code, description, url) => {
        console.error(`CRITICAL_PLAYBACK_LOAD_FAILED ${code} ${description} ${url}`);
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith(serverUrl)) event.preventDefault();
      });
      await window.loadURL(serverUrl);
      await window.webContents.executeJavaScript('window.__criticalPlayback.ready').catch(async (error) => {
        const diagnostics = await window.webContents
          .executeJavaScript(
            `({url:location.href,fixture:!!window.__fixture,seed:window.__fixtureSeed,playback:window.__fixture?.state.playback,calls:window.__fixture?.calls,player:window.__fixture?.player&&{current:window.__fixture.player.current?.id,busy:window.__fixture.player.busy,error:window.__fixture.player.error,currentKey:window.__fixture.player.currentKey},critical:!!window.__criticalPlayback,body:document.body.innerText.slice(0,300)})`,
          )
          .catch(() => null);
        console.error('CRITICAL_PLAYBACK_RENDERER_NOT_READY', diagnostics);
        throw error;
      });
    };
    const run = async (method) => window.webContents.executeJavaScript(`window.__criticalPlayback.${method}()`);
    let serverUrl;

    await server.listen();
    console.log('CRITICAL_PLAYBACK_STARTUP vite-ready');
    serverUrl = server.resolvedUrls.local[0];
    const origin = new URL(serverUrl).origin;
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const requestUrl = new URL(details.url);
      const allowed =
        requestUrl.hostname === '127.0.0.1' &&
        requestUrl.port === new URL(origin).port &&
        ['http:', 'ws:'].includes(requestUrl.protocol);
      callback({ cancel: !allowed });
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

    if (mutationSpec) {
      const seed =
        mutation === 'repeat-shuffle'
          ? { playback: shuffledAll(), preferences: { volume: 0.75, shuffle: true, repeat: 'all' } }
          : { playback: snapshot(), preferences: { volume: 0.75, shuffle: false, repeat: 'off' } };
      await open(seed);
      console.log('CRITICAL_PLAYBACK_WINDOW_READY');
      try {
        await run(mutationSpec.scenario);
        throw new Error(`Mutation escaped detection: ${mutation}`);
      } catch (error) {
        if (!String(error).includes(`ASSERTION:${expectedMutation}:`)) throw error;
        emit({ mutation, detected: true, evidence: String(error).split('\n')[0] });
      }
    } else if (scenario === 'song-handoff-settings') {
      await open({ playback: snapshot(), dj: true, state: { djPlayback: { enabled: false, roomId: 'default-room', everySongs: 3, keepOnSeek: true, voiceVolume: 0.7 } } });
      await window.webContents.executeJavaScript(`document.querySelector('button.settings-nav')?.click()`);
      const stage = process.env.WAVE_CAPTURE_STAGE ?? 'after';
      for (const [width, height] of [[1440, 1000], [960, 800]]) {
        window.setContentSize(width, height);
        await window.webContents.executeJavaScript(`document.fonts.ready.then(() => new Promise((resolve) => setTimeout(resolve, 300)))`);
        await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          let tries = 0;
          const timer = setInterval(() => {
            const section = document.querySelector('.room-dj-schedule');
            if (section) { clearInterval(timer); section.scrollIntoView({ block: 'start' }); setTimeout(() => {
              if (section.getBoundingClientRect().top > 200) reject(new Error('DJ settings were not scrolled into the capture'));
              else resolve();
            }, 150); }
            else if (++tries > 100) { clearInterval(timer); reject(new Error('DJ playback settings did not open')); }
          }, 20);
        })`);
        await writeFile(path.join(root, `docs/verification/song-handoff/${stage}-settings-${width}.png`), (await window.webContents.capturePage()).toPNG());
      }
      if (stage === 'after') {
        for (const enabled of [true, false]) {
          await window.webContents.executeJavaScript(`(() => {
            const checkbox = [...document.querySelectorAll('.room-dj-schedule input[type="checkbox"]')].find((input) => input.labels[0]?.textContent.includes('Occasionally announce'));
            if (!checkbox || checkbox.checked === ${enabled}) throw new Error('Announcement switch has an unexpected saved value');
            checkbox.focus(); checkbox.click();
          })()`);
          await window.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
          await window.webContents.executeJavaScript(`[...document.querySelectorAll('.room-dj-schedule button')].find((button) => button.textContent.trim() === 'Save DJ playback').click()`);
          await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
            let tries = 0;
            const timer = setInterval(() => {
              if (window.__fixture.state.djPlayback.announceTracks === ${enabled} && document.querySelector('.room-dj-schedule [role="status"]')?.textContent.includes('saved')) { clearInterval(timer); resolve(); }
              else if (++tries > 100) { clearInterval(timer); reject(new Error('Announcement setting did not save and confirm')); }
            }, 20);
          })`);
        }
      }
      emit({ scenario: 'DJ playback settings screenshots', stage, passed: true });
    } else if (scenario === 'song-handoff') {
      const cases = process.env.WAVE_HANDOFF_CASES?.split(',') ?? ['normal', 'automatic', 'disabled', 'legacy-ending', 'cadence', 'disable-generating', 'disable-pending', 'disable-speaking', 'shuffle', 'shuffle-cycle', 'repeat-one', 'repeat-all', 'end', 'queue-edit', 'intro-edit', 'pause', 'seek-intro', 'budget', 'too-long', 'too-late', 'news-unavailable', 'failure', 'cancel-pending'];
      for (const handoffCase of cases) {
        await open({
          handoffCase,
          dj: true,
          availableTakes: 1,
          playback: handoffCase === 'shuffle-cycle' ? shuffledAll() : snapshot(['1', '2', '3'], ['end', 'repeat-all'].includes(handoffCase) ? 2 : 0, 0),
          preferences: { volume: 0.75, shuffle: handoffCase === 'shuffle-cycle', repeat: handoffCase === 'repeat-one' ? 'one' : ['shuffle-cycle', 'repeat-all'].includes(handoffCase) ? 'all' : 'off' },
          state: {
            djPlayback: { enabled: handoffCase === 'automatic', roomId: 'default-room', everySongs: 1, keepOnSeek: true, voiceVolume: 0.7, announceTracks: handoffCase !== 'disabled' },
            newsTransitions: { mode: ['budget', 'too-long', 'too-late', 'seek-intro'].includes(handoffCase) ? 'over-music' : 'between-songs', fadeOutSeconds: 0, leadInSeconds: 0, postSpeechSeconds: 0, fadeInSeconds: 0 },
          },
        });
        await run('verify');
        emit({ scenario: handoffCase, passed: true });
        await closeWindow();
      }
    } else if (scenario === 'baseline') {
      await open({ playback: snapshot(), preferences: { volume: 0.75, shuffle: false, repeat: 'off' } });
      console.log('CRITICAL_PLAYBACK_WINDOW_READY');
      const checkpoint = await run('verifyRestore');
      await writeFile(path.join(fixtureDir, 'checkpoint.json'), JSON.stringify(checkpoint));
      await closeWindow();
      const diskCheckpoint = JSON.parse(await readFile(path.join(fixtureDir, 'checkpoint.json'), 'utf8'));
      await open({ playback: diskCheckpoint, preferences: { volume: 0.75, shuffle: false, repeat: 'off' } });
      await run('verifyRestore');
      await run('verifyNaturalEnd');
      emit({
        scenario:
          'restored paused queue, duplicate occurrence, position, checkpoint file roundtrip, and natural continuation',
        passed: true,
      });
      await closeWindow();
      await open({ playback: snapshot(), preferences: { volume: 0.75, shuffle: false, repeat: 'off' } });
      await run('verifyDuplicate');
      emit({ scenario: 'duplicate song queue entries have distinct selectable occurrence keys', passed: true });
      await closeWindow();
      await open({
        playback: snapshot(['1', '2'], 0, 0),
        preferences: { volume: 0.75, shuffle: false, repeat: 'off' },
      });
      await run('verifyRepeatOffExhaustion');
      emit({ scenario: 'repeat off stops on the final queue occurrence', passed: true });
      await closeWindow();
      await open({
        playback: snapshot(['1', '2'], 0, 0),
        preferences: { volume: 0.75, shuffle: false, repeat: 'one' },
      });
      await run('verifyRepeatOne');
      emit({ scenario: 'repeat one retains selected queue occurrence', passed: true });
      await closeWindow();
      await open({ playback: shuffledDuplicates(), preferences: { volume: 0.75, shuffle: true, repeat: 'off' } });
      await run('verifyShuffleCycle');
      emit({
        scenario: 'shuffle visits every duplicate queue occurrence exactly once before exhaustion',
        passed: true,
      });
      await closeWindow();
      await open({ playback: shuffledAll(), preferences: { volume: 0.75, shuffle: true, repeat: 'all' } });
      await run('verifyRepeatShuffle');
      emit({ scenario: 'repeat all starts a new shuffle cycle', passed: true });
      await closeWindow();
      await open({
        dj: true,
        availableTakes: 1,
        playback: snapshot(['1', '2'], 0, 0),
        preferences: { volume: 0.75, shuffle: false, repeat: 'off' },
        state: {
          djPlayback: { enabled: false, roomId: 'default-room', everySongs: 1, keepOnSeek: true, voiceVolume: 0.7 },
          newsTransitions: {
            mode: 'between-songs',
            fadeOutSeconds: 0,
            leadInSeconds: 0,
            postSpeechSeconds: 0,
            fadeInSeconds: 0,
          },
        },
      });
      await run('verifyNewsCancellation');
      emit({ scenario: 'cancelled unstarted news claim is released', passed: true });
    } else throw new Error(`Unknown scenario: ${scenario}`);
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  } finally {
    await closeWindow();
    await Promise.allSettled([server?.close(), fixtureDir && rm(fixtureDir, { recursive: true, force: true })]);
    if (!process.exitCode) console.log(`CRITICAL_PLAYBACK_DONE ${JSON.stringify(results)}`);
    if (app) await app.quit();
  }
}

void main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
