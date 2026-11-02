import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function verifyAnnouncementPreferences(window, root, stage = 'after-variety') {
  const run = (source) => window.webContents.executeJavaScript(source);
  const frame = () => run('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const change = async (selector, value, element) => {
    await run(`(() => {
      const field = document.querySelector(${JSON.stringify(selector)});
      field.focus();
      Object.getOwnPropertyDescriptor(${element}.prototype, 'value').set.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event(${JSON.stringify(element === 'HTMLSelectElement' ? 'change' : 'input')}, { bubbles: true }));
    })()`);
    await frame();
  };
  const chooseStyle = async (value) => {
    await run(`document.querySelector('input[name="announcement-style"][value="${value}"]').closest('label').click()`);
    await frame();
  };
  const save = async () => {
    await run(`document.querySelector('.song-announcement-settings .settings-save').click()`);
    await frame();
  };
  assert.equal(await run(`document.querySelector('#announcement-style').disabled`), true);
  assert.equal(await run(`document.querySelector('input[name="announcement-style"]:checked').value`), 'varied');
  await run(`document.querySelector('#announce-tracks').click()`);
  await frame();
  assert.equal(await run(`document.querySelector('#announcement-style').disabled`), false);
  for (const [style, firstExample] of [
    ['warm', 'Settle in.'], ['energetic', 'Ready for another?'], ['minimal', 'Up next,'], ['varied', 'A mix of warm, upbeat and short introductions.'],
  ]) {
    await chooseStyle(style);
    assert.equal(await run(`document.querySelector('input[name="announcement-style"]:checked').value`), style);
    assert((await run(`document.querySelector('#announcement-style-${style}-example').textContent`)).includes(firstExample));
    assert.equal(await run(`document.querySelectorAll('.song-announcement-choice').length`), 5);
    assert.equal(await run(`!!document.querySelector('.song-announcement-examples')`), false);
  }
  window.show();
  window.focus();
  await run(`document.querySelector('.song-announcement-settings input[type="number"]').focus()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
  await frame();
  assert.equal(await run(`document.activeElement.value`), 'varied', 'Tab must enter the selected style');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
  await frame();
  assert.equal(await run(`document.querySelector('input[name="announcement-style"]:checked').value`), 'warm', 'Arrow keys must select the next wording style');
  assert.equal(await run(`document.activeElement.matches(':focus-visible')`), true, 'Keyboard selection must retain visible focus');
  await writeFile(path.join(root, `docs/verification/song-handoff/${stage}-keyboard-960.png`), (await window.webContents.capturePage()).toPNG());
  window.hide();
  await chooseStyle('varied');
  for (const [width, height] of [[1440, 1000], [960, 800], [720, 900]]) {
    window.setContentSize(width, height);
    await run(`document.querySelector('.song-announcement-preferences').scrollIntoView({ block: 'center' })`);
    await run(`document.fonts.ready.then(() => new Promise((resolve) => setTimeout(resolve, 250)))`);
    assert.equal(await run(`[...document.querySelectorAll('.song-announcement-styles, .song-announcement-choice')].some((element) => element.scrollWidth > element.clientWidth)`), false, 'Style choices overflowed');
    await writeFile(path.join(root, `docs/verification/song-handoff/${stage}-styles-${width}.png`), (await window.webContents.capturePage()).toPNG());
    if (width === 1440) {
      await run(`document.documentElement.dataset.theme = 'dark'`);
      await frame();
      await writeFile(path.join(root, `docs/verification/song-handoff/${stage}-styles-dark-${width}.png`), (await window.webContents.capturePage()).toPNG());
      await run(`document.documentElement.dataset.theme = 'light'`);
    }
  }
  await save();
  assert.equal(await run(`window.__fixture.state.djPlayback.announcementStyle`), 'varied');
  await chooseStyle('custom');
  const savedCount = await run(`window.__fixture.calls.filter((call) => call.method === 'saveDJPlayback').length`);
  for (const invalid of ['Welcome back.', 'Here is {artist}.', '{track} and {track}.', '[whispering] {track}.', Array.from({ length: 13 }, (_, index) => `${index}: {track}.`).join('\n')]) {
    await change('#announcement-lines', invalid, 'HTMLTextAreaElement');
    assert.equal(await run(`document.querySelector('#announcement-lines').getAttribute('aria-invalid')`), 'true');
    await save();
    assert.equal(await run(`window.__fixture.calls.filter((call) => call.method === 'saveDJPlayback').length`), savedCount, 'Invalid custom lines reached persistence');
  }
  const invalidDraft = await run(`document.querySelector('#announcement-lines').value`);
  await run(`document.querySelector('.song-announcement-settings > summary').click()`);
  await frame();
  assert.match(await run(`document.querySelector('.song-announcement-settings .preference-section-status').textContent`), /Needs attention/);
  await run(`document.querySelector('[data-section="general"]').click()`);
  await frame();
  assert.equal(await run(`!!document.querySelector('#announcement-lines')`), false);
  await run(`document.querySelector('[data-section="playback"]').click()`);
  await frame();
  assert.equal(await run(`document.querySelector('.song-announcement-settings').open`), true, 'An unsaved draft must reopen when returning to Playback');
  assert.equal(await run(`document.querySelector('#announcement-lines').value`), invalidDraft, 'Navigating away erased custom wording');
  await run(`document.querySelector('.room-dj-schedule > summary').click()`);
  await frame();
  await change('.room-dj-schedule input[type="number"]', '7', 'HTMLInputElement');
  await run(`document.querySelector('.room-dj-schedule .settings-save').click()`);
  await frame();
  assert.equal(await run(`window.__fixture.state.djPlayback.everySongs`), 7, 'An invalid announcement draft blocked saving the news schedule');
  assert.equal(await run(`document.querySelector('#announcement-lines').value`), invalidDraft, 'Saving news erased an announcement draft');
  assert.deepEqual(await run(`Object.keys(window.__fixture.calls.filter((call) => call.method==='saveDJPlayback').at(-1).patch).sort()`), ['everySongs','keepOnSeek','voiceVolume']);
  const lines = 'Let’s get lost in {track}.\nYour next little escape: {track}.\nRoom for one more? {track}.';
  await change('#announcement-lines', lines, 'HTMLTextAreaElement');
  assert.equal(await run(`document.querySelector('#announcement-lines').getAttribute('aria-invalid')`), 'false');
  assert.equal(await run(`document.querySelectorAll('.song-announcement-examples li').length`), 3);
  assert.equal(await run(`document.querySelector('.song-announcement-examples li').textContent`), 'Let’s get lost in Midnight City by M83.');
  await run(`document.querySelector('input[name="announcement-style"]:checked').focus()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
  await frame();
  assert.equal(await run(`document.activeElement.id`), 'announcement-lines', 'Custom text must be next in the keyboard tab order');
  await save();
  assert.deepEqual(await run(`({style: window.__fixture.state.djPlayback.announcementStyle, lines: window.__fixture.state.djPlayback.announcementLines})`), { style: 'custom', lines });
  for (const [width, height] of [[1440, 1000], [960, 800]]) {
    window.setContentSize(width, height);
    await run(`document.querySelector('.song-announcement-preferences').scrollIntoView({ block: 'center' })`);
    await run(`document.fonts.ready.then(() => new Promise((resolve) => setTimeout(resolve, 250)))`);
    assert.equal(await run(`document.querySelector('.song-announcement-preferences').scrollWidth > document.querySelector('.song-announcement-preferences').clientWidth`), false, 'Announcement preferences overflowed');
    await writeFile(path.join(root, `docs/verification/song-handoff/${stage}-custom-${width}.png`), (await window.webContents.capturePage()).toPNG());
  }
  await chooseStyle('warm');
  await save();
  assert.equal(await run(`window.__fixture.state.djPlayback.announcementLines`), lines, 'Switching style erased custom lines');
  await chooseStyle('custom');
  assert.equal(await run(`document.querySelector('#announcement-lines').value`), lines);
  await run(`document.querySelector('#announce-tracks').click()`);
  await frame();
  assert.equal(await run(`document.querySelector('#announcement-lines').disabled`), true);
  assert.equal(await run(`[...document.querySelectorAll('input[name="announcement-style"]')].every((input) => input.matches(':disabled'))`), true);
  await save();
  assert.equal(await run(`window.__fixture.state.djPlayback.announceTracks`), false);
  assert.equal(await run(`window.__fixture.state.djPlayback.everySongs`), 7, 'Saving announcements overwrote news timing');
  assert.deepEqual(await run(`Object.keys(window.__fixture.calls.filter((call) => call.method==='saveDJPlayback').at(-1).patch).sort()`), ['announceEverySongs','announceTracks','announcementLines','announcementStyle']);
  assert.equal(await run(`window.__fixture.calls.filter((call) => call.method === 'prepareSongHandoff').length`), 0, 'Text examples requested speech');
  return { scenario: 'announcement styles, custom wording, validation, draft preservation, keyboard order, disabled controls, text-only preview, responsive layout', passed: true };
}
