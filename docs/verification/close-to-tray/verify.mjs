import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const data = await mkdtemp(path.join(os.tmpdir(), 'wave-tray-'));
const entry = path.join(root, 'out/main/tray-verification.mjs');
const evidence = process.env.WAVE_VERIFICATION_OUTPUT ?? data;

await mkdir(evidence, { recursive: true });

let source = await readFile(path.join(root, 'out/main/index.js'), 'utf8');

assert.ok(source.includes('app.setName("onmywave.fm");'), 'Expected built main entry');
source = source.replace(
  'app.setName("onmywave.fm");',
  'app.setPath("appData", process.env.WAVE_TRAY_DATA);\napp.setName("onmywave.fm");',
);
source += `
const { default: verify } = await import('node:assert/strict');
const { writeFile: saveEvidence } = await import('node:fs/promises');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let verificationMenu;
const buildMenu = Menu.buildFromTemplate;
Menu.buildFromTemplate = function(template) {
  const menu = buildMenu.call(Menu, template);
  if (template.some(item => item.label === 'Show onmywave.fm')) verificationMenu = menu;
  return menu;
};
app.whenReady().then(async () => {
  try {
    for (let attempt = 0; attempt < 100 && (!window?.isVisible() || window.webContents.isLoading()); attempt++) await wait(100);
    const target = window;
    verify.ok(target?.isVisible(), 'Main window opens');
    verify.ok(tray && !tray.isDestroyed(), 'Native tray exists');
    verify.ok(verificationMenu, 'Native menu exists');
    await wait(1200);
    await saveEvidence(process.env.WAVE_TRAY_SCREENSHOT, (await target.webContents.capturePage()).toPNG());
    const contents = target.webContents;
    let checkpointRequests = 0;
    const originalSend = contents.send.bind(contents);
    contents.send = (channel, ...args) => {
      if (channel === 'wave:playbackCheckpointRequest') checkpointRequests++;
      return originalSend(channel, ...args);
    };
    await contents.executeJavaScript(\`
      window.trayCheckAudio = new Audio('wave-app://bundle/demo/news-break.mp3');
      window.trayCheckAudio.loop = true;
      window.trayCheckMarker = 'same-renderer';
      window.trayCheckAudio.play().catch(error => { throw new Error(error.name + ': ' + error.message); });
    \`, true);
    await wait(250);
    const before = await contents.executeJavaScript('window.trayCheckAudio.currentTime');
    target.close();
    await wait(1200);
    verify.ok(!target.isDestroyed() && !target.isVisible(), 'Close hides the same window');
    verify.ok(!closing && !shutdownStarted, 'Close does not start shutdown');
    verify.equal(checkpointRequests, 0, 'Close does not checkpoint or quit');
    let audio;
    for (let attempt = 0; attempt < 40; attempt++) {
      audio = await contents.executeJavaScript('({ time: window.trayCheckAudio.currentTime, paused: window.trayCheckAudio.paused, readyState: window.trayCheckAudio.readyState })');
      if (!audio.paused && audio.time > before + 0.5) break;
      await wait(100);
    }
    verify.ok(!audio.paused && audio.time > before + 0.5, 'Audio advances while hidden: ' + JSON.stringify({ before, audio }));
    verificationMenu.items[0].click();
    verify.ok(target.isVisible() && window === target, 'Show restores the same window');
    verify.equal(await contents.executeJavaScript('window.trayCheckMarker'), 'same-renderer');
    target.minimize();
    await wait(250);
    target.close();
    app.emit('second-instance', {}, [], '');
    await wait(250);
    verify.ok(target.isVisible() && !target.isMinimized(), 'Second launch restores a minimized window');
    target.close();
    app.emit('activate');
    verify.ok(target.isVisible(), 'Dock activation restores the window');
    if (process.platform === 'win32') {
      target.close();
      tray.emit('click');
      verify.ok(target.isVisible(), 'Windows tray click restores the window');
    }
    target.close();
    app.once('will-quit', () => {
      verify.ok(closing && shutdownStarted, 'Explicit Quit starts shutdown');
      verify.equal(checkpointRequests, 1, 'Explicit Quit checkpoints playback');
      console.log('CLOSE_TO_TRAY_PASS', process.platform);
    });
    verificationMenu.items[2].click();
  } catch (error) {
    console.error(error?.stack ?? String(error));
    app.exit(1);
  }
});
`;

try {
  await writeFile(entry, source);
  const child = spawn(require('electron'), ['--disable-audio-output', entry], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: '',
      WAVE_TRAY_DATA: data,
      WAVE_TRAY_SCREENSHOT: path.join(evidence, 'after.png'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
  const timeout = setTimeout(() => child.kill(), 45_000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    await writeFile(path.join(evidence, 'close-to-tray.log'), output);
    assert.equal(code, 0, output);
    assert.ok(output.includes('CLOSE_TO_TRAY_PASS'), output);
  } finally {
    clearTimeout(timeout);
  }
} finally {
  await rm(entry, { force: true });
  await rm(data, { recursive: true, force: true });
}
