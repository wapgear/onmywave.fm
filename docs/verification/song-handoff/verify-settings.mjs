import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { verifyAnnouncementPreferences } from './verify-preferences.mjs';

export async function verifySongHandoffSettings(window, root, stage) {
  const run = (source) => window.webContents.executeJavaScript(source);
  const frame = () => run('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await run(`document.querySelector('button.settings-nav').click()`);
  await frame();
  await run(`document.querySelector('[data-section="playback"]').click()`);
  await frame();
  assert.equal(await run(`document.querySelectorAll('.settings-subsection[open]').length`), 0);
  for (const selector of ['.room-dj-schedule', '.song-announcement-settings']) {
    await run(`document.querySelector('${selector} > summary').click()`);
    await frame();
  }
  assert.equal(await run(`document.querySelector('.song-announcement-settings input[type="number"]').value`), '6');
  assert.equal(await run(`document.querySelector('.song-announcement-settings input[type="number"]').disabled`), true);
  for (const [width, height] of [[1440, 1000], [960, 800]]) {
    window.setContentSize(width, height);
    await run(`document.fonts.ready.then(() => new Promise((resolve) => setTimeout(resolve, 250)))`);
    await run(`document.querySelector('.song-announcement-settings').scrollIntoView({block:'start'})`);
    await frame();
    await writeFile(path.join(root, `docs/verification/song-handoff/${stage}-settings-${width}.png`), (await window.webContents.capturePage()).toPNG());
  }
  for (const enabled of [true, false]) {
    await run(`document.querySelector('#announce-tracks').click()`);
    await frame();
    if (enabled) {
      await run(`(() => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        const interval = document.querySelector('.song-announcement-settings input[type="number"]');
        set.call(interval, '8'); interval.dispatchEvent(new Event('input', {bubbles:true}));
        const news = document.querySelector('.room-dj-schedule input[type="number"]');
        set.call(news, '4'); news.dispatchEvent(new Event('input', {bubbles:true}));
      })()`);
      await frame();
      await run(`document.querySelector('.room-dj-schedule .settings-save').click()`);
      await frame();
    }
    await run(`document.querySelector('.song-announcement-settings .settings-save').click()`);
    await run(`new Promise((resolve,reject) => {
      let tries=0; const timer=setInterval(() => {
        const settings=window.__fixture.state.djPlayback;
        if (settings.announceTracks===${enabled} && settings.announceEverySongs===8 && settings.everySongs===4 && document.querySelector('.song-announcement-settings .form-hint')?.textContent.includes('saved')) {clearInterval(timer);resolve();}
        else if (++tries>100) {clearInterval(timer);reject(new Error('Independent announcement and news settings did not save'));}
      },20);
    })`);
  }
  if (stage.includes('variety') || stage.includes('subsections')) await verifyAnnouncementPreferences(window, root, stage);
  return {scenario:'Independent news and announcement settings, default interval, on/off and style preferences',stage,passed:true};
}
