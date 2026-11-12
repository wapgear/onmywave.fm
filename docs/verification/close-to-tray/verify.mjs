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
const updateSupport = 'app.isPackaged && process.platform === "darwin" && process.arch === "arm64"';
assert.ok(source.includes(`return ${updateSupport};`), 'Expected built updater support check');
source = source.replace(`return ${updateSupport};`, `return verificationSupportsUpdates || (${updateSupport});`);
source += `
const { default: verify } = await import('node:assert/strict');
const { writeFile: saveEvidence } = await import('node:fs/promises');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let verificationMenu;
let verificationSupportsUpdates = false;
const setContextMenu = Tray.prototype.setContextMenu;
Tray.prototype.setContextMenu = function(menu) {
  verificationMenu = menu;
  return setContextMenu.call(this, menu);
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
    verificationMenu.items.find(item => item.label === 'Show onmywave.fm').click();
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
    const checkFrom = async (menu, source) => {
      target.close();
      const check = menu.items.find(item => item.label === 'Check for Updates…');
      verify.ok(check, source + ' offers Check for Updates');
      check.click();
      const updateDialog = 'dialog[open]';
      let status;
      for (let attempt = 0; attempt < 40; attempt++) {
        status = await contents.executeJavaScript('document.querySelector(' + JSON.stringify(updateDialog) + ')?.textContent');
        if (status?.includes('Automatic updates are not available for this build.')) break;
        await wait(100);
      }
      verify.ok(target.isVisible() && window === target, source + ' restores the same window');
      verify.ok(status?.includes('Software updates') && status.includes('Automatic updates are not available for this build.'), source + ' shows the update status when signed out');
      await contents.executeJavaScript("document.querySelector('dialog[open] .modal-close').click()");
    };
    const item = (label) => verificationMenu.items.find(item => item.label === label);
    const click = (label) => {
      verify.ok(item(label)?.enabled, label + ' is available in the tray');
      item(label).click();
    };
    const currentVersion = app.getVersion();
    verify.equal(item('Version ' + currentVersion)?.enabled, false, 'Installed version is informational');
    verify.equal(item('Updates Unavailable')?.enabled, false, 'Unsupported builds explain why the tray cannot check');
    verify.ok(!item('About onmywave.fm'), 'About is absent from the tray');
    if (process.platform === 'darwin') {
      const appMenu = Menu.getApplicationMenu().items[0].submenu;
      verify.ok(appMenu.items.some(item => item.label === 'About onmywave.fm'), 'App menu offers About');
      await checkFrom(appMenu, 'App menu');
    }

    target.close();
    let finishCheck;
    let finishDownload;
    let installCalls = 0;
    const releaseUpdater = updater.autoUpdater;
    releaseUpdater.checkForUpdates = () => new Promise(resolve => { finishCheck = resolve; });
    releaseUpdater.downloadUpdate = () => new Promise(resolve => { finishDownload = resolve; });
    releaseUpdater.quitAndInstall = () => {
      installCalls++;
      throw new Error('Simulated restart failure');
    };
    verificationSupportsUpdates = true;
    setStatus({ phase: 'idle', currentVersion });
    click('Check for Updates');
    verify.equal(item('Checking for Updates…')?.enabled, false);
    verify.ok(!target.isVisible(), 'Tray check keeps the window hidden');
    finishCheck({ isUpdateAvailable: false });
    await wait(0);
    verify.equal(item('Up to Date')?.enabled, false);

    const offerUpdate = async (version) => {
      click('Check for Updates');
      finishCheck({ isUpdateAvailable: true, updateInfo: { version } });
      await wait(0);
    };
    await offerUpdate('99.0.0');
    click('Update Later');
    verify.ok(item('Version 99.0.0 Available…')?.enabled && !item('Update Now'), 'A deferred update remains accessible');
    verify.ok(!finishDownload && !target.isVisible(), 'Deferral keeps playback in the background');
    click('Version 99.0.0 Available…');
    let details;
    for (let attempt = 0; attempt < 40; attempt++) {
      details = await contents.executeJavaScript("document.querySelector('dialog[open]')?.textContent");
      if (details?.includes('Version 99.0.0 is available.')) break;
      await wait(100);
    }
    verify.ok(details?.includes('Version 99.0.0 is available.'), 'Deferred update opens its details');
    await contents.executeJavaScript("document.querySelector('dialog[open] .modal-close').click()");
    target.close();

    const nextCheck = checkForUpdates();
    finishCheck({ isUpdateAvailable: true, updateInfo: { version: '99.0.1' } });
    await nextCheck;
    click('Update Now');
    verify.equal(item('Downloading Update…')?.enabled, false);
    verify.ok(!target.isVisible(), 'Tray download keeps the window hidden');
    finishDownload([]);
    await wait(0);
    verify.equal(installCalls, 0, 'Download does not restart the app');
    click('Restart Now');
    click('Restart Now');
    for (let attempt = 0; attempt < 40 && !installCalls; attempt++) await wait(100);
    verify.equal(installCalls, 1);
    verify.equal(checkpointRequests, 1, 'Restart checkpoints playback');
    verify.equal(item('Could Not Restart to Install Update')?.enabled, false);
    click('Restart Later');
    verify.ok(item('Version 99.0.1 Ready to Install…')?.enabled && !item('Restart Now'), 'The downloaded update stays accessible after deferral');

    app.once('will-quit', () => {
      verify.ok(closing && shutdownStarted, 'Explicit Quit starts shutdown');
      verify.equal(checkpointRequests, 2, 'Explicit Quit checkpoints playback again');
      console.log('CLOSE_TO_TRAY_PASS', process.platform);
    });
    verificationMenu.items.find(item => item.label === 'Quit onmywave.fm').click();
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
