import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function verifyPreferences(window, root) {
  const stage = process.env.WAVE_CAPTURE_STAGE ?? 'after';
  const run = (source) => window.webContents.executeJavaScript(source);
  await run(`document.querySelector('button.settings-nav').click()`);
  await run(`new Promise((resolve, reject) => {
    let tries = 0;
    const timer = setInterval(() => {
      if (document.querySelector('.settings-account')) { clearInterval(timer); resolve(); }
      else if (++tries > 100) { clearInterval(timer); reject(new Error('General settings did not open')); }
    }, 20);
  })`);
  await run('document.fonts.ready');
  for (const [width, height] of [[1440, 1000], [960, 800]]) {
    window.setContentSize(width, height);
    for (const [name, theme, section, selector] of [
      ['general-light', 'light', 'general', '.settings-account'],
      ['appearance-light', 'light', 'appearance', '#appearance-title'],
      ['playback-light', 'light', 'playback', '.settings-playback'],
      ['announcements-light', 'light', 'playback', '.song-announcement-settings'],
      ['transitions-light', 'light', 'playback', '.news-transition-settings'],
      ['general-dark', 'dark', 'general', '.settings-account'],
      ['appearance-dark', 'dark', 'appearance', '#appearance-title'],
    ]) {
      await run(`document.querySelector('[data-section="${section}"]').click(); new Promise((resolve) => setTimeout(resolve,100))`);
      if (name.startsWith('announcements') || name.startsWith('transitions')) {
        await run(`(() => {
          const section=document.querySelector('${selector}');
          if(!section.open) section.querySelector(':scope > summary').click();
        })(); new Promise((resolve) => setTimeout(resolve,100))`);
      }
      await run(`(() => {
        document.documentElement.dataset.theme = '${theme}';
        window.scrollTo(0, 0);
        const main = document.querySelector('.main-content');
        main.scrollTop = '${section}' === 'playback' ? main.scrollTop + document.querySelector('${selector}').getBoundingClientRect().top - main.getBoundingClientRect().top - 24 : 0;
        return new Promise((resolve) => setTimeout(resolve, 200));
      })()`);
      assert.equal(await run(`document.documentElement.scrollWidth > innerWidth`), false, 'Settings overflow the window');
      await writeFile(path.join(root, `docs/verification/preferences-design/${stage}-${name}-${width}.png`), (await window.webContents.capturePage()).toPNG());
    }
    if (width === 960) {
      for (const label of ['Sources', 'DJs', 'Provider keys', 'General']) {
        await run(`document.documentElement.dataset.theme = 'light'; [...document.querySelectorAll('.settings-sections button')].find((button) => button.textContent === '${label}').click(); new Promise((resolve) => setTimeout(resolve, 200))`);
        if (label !== 'General') {
          await writeFile(path.join(root, `docs/verification/preferences-design/${stage}-${label.toLowerCase().replaceAll(' ', '-')}-960.png`), (await window.webContents.capturePage()).toPNG());
          if (stage.startsWith('after')) assert.equal(await run(`document.querySelectorAll('.main-content h1').length`), 1, 'Settings must have only one page heading');
          if (stage.startsWith('after') && label === 'Provider keys') {
            const names = await run(`[...document.querySelectorAll('.provider-key input')].map((input) => input.getAttribute('aria-label'))`);
            assert.deepEqual(names, ['OpenAI API key', 'ElevenLabs API key', 'Twitter / X Bearer token']);
          }
          if (stage.startsWith('after') && label === 'DJs') {
            assert.equal(await run(`document.querySelector('.dj-preview-hint').textContent.trim()`), 'No DJ preview saved.');
            await run(`document.querySelector('.dj-voice-preview .info-help').click(); new Promise((resolve) => requestAnimationFrame(resolve))`);
            assert.match(await run(`document.querySelector('dialog[open]').textContent`), /outside automatic news limits/);
            await run(`document.querySelector('dialog[open] [aria-label="Close dialog"]').click(); new Promise((resolve) => requestAnimationFrame(resolve))`);
          }
        }
      }
    }
  }
  if (stage.startsWith('after')) {
    await run(`document.querySelector('[data-section="playback"]').click(); new Promise((resolve) => setTimeout(resolve,100))`);
    assert.equal(await run(`document.querySelectorAll('.settings-subsection[open]').length`), 0, 'Playback should open as a compact overview');
    assert.equal(await run(`!!document.querySelector('#announcement-style')`), false, 'Announcement details should stay out of the default layout');
    const compactHeight = await run(`document.querySelector('.settings-playback').getBoundingClientRect().height`);
    assert(compactHeight < 280, 'Collapsed playback sections take too much space');
    for (const selector of ['.room-dj-schedule', '.song-announcement-settings', '.news-transition-settings']) {
      await run(`document.querySelector('${selector} > summary').click(); new Promise((resolve) => setTimeout(resolve,100))`);
    }
    const layout = await run(`(() => {
      const fields = document.querySelector('.room-dj-schedule .preference-fields');
      const rows = [...fields.children].map((row) => row.getBoundingClientRect());
      const titles = [...document.querySelectorAll('.settings-preferences h2')].map((heading) => heading.textContent);
      return {
        gaps: rows.slice(1).map((row, index) => Math.round(row.top - rows[index].bottom)),
        uniqueTitles: new Set(titles).size === titles.length,
        inlineExplanations: document.querySelectorAll('.room-dj-schedule form p:not([role]), .news-transition-grid .form-hint').length,
        previewOpen: document.querySelector('.transition-preview').open,
        costVisible: document.querySelector('#track-announcement-cost').textContent,
      };
    })()`);
    assert(layout.gaps.every((gap) => gap === 16), 'Field spacing must be consistent');
    assert(layout.uniqueTitles, 'Settings headings must not repeat');
    assert.equal(layout.inlineExplanations, 0);
    assert.equal(layout.previewOpen, false);
    assert.match(layout.costVisible, /ElevenLabs credits/);
    const key = async (keyCode) => {
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode });
      if (keyCode === 'Enter') window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode });
      await run('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    };
    window.show();
    window.focus();
    window.webContents.focus();
    await run(`new Promise((resolve) => setTimeout(resolve, 200))`);
    await run(`document.querySelector('.main-content').scrollTop = 0; document.querySelector('.song-announcement-settings .info-help').focus()`);
    await key('Enter');
    assert.equal(await run(`!!document.querySelector('dialog[open]')`), true, 'Enter must open contextual help');
    assert.match(await run(`document.querySelector('dialog[open]').textContent`), /or always after fact-only news/);
    assert.equal(await run(`document.activeElement.getAttribute('aria-label')`), 'Close dialog');
    await writeFile(path.join(root, `docs/verification/preferences-design/${stage}-help-960.png`), (await window.webContents.capturePage()).toPNG());
    await key('Escape');
    assert.equal(await run(`!!document.querySelector('dialog[open]')`), false);
    assert.equal(await run(`document.activeElement === document.querySelector('.song-announcement-settings .info-help')`), true, 'Help must return focus to its trigger');
    await run(`document.querySelector('.transition-preview > summary').focus()`);
    await key('Enter');
    assert.equal(await run(`document.querySelector('.transition-preview').open`), true, 'Enter must expand the preview');
    await run(`(() => {
      window.__fixture.previewClosed = 0;
      const gain = () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} });
      window.AudioContext = class {
        destination = {};
        get currentTime() { return performance.now() / 1000; }
        createGain = gain;
        createMediaElementSource() { return { connect() {} }; }
        createOscillator() { return { frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; }
        resume() { return Promise.resolve(); }
        close() { window.__fixture.previewClosed++; return Promise.resolve(); }
      };
      document.querySelector('.transition-preview button').click();
    })()`);
    await run('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    assert.equal(await run(`document.querySelector('.transition-preview button').textContent.trim()`), 'Stop sample');
    await run(`document.querySelector('.transition-preview > summary').focus()`);
    await key('Enter');
    assert.equal(await run(`window.__fixture.previewClosed`), 1, 'Collapsing the preview must stop its audio context');
    assert.equal(await run(`document.querySelector('.transition-preview button').textContent.trim()`), 'Play sample');
    await run(`document.querySelector('.transition-preview > summary').click(); new Promise((resolve) => setTimeout(resolve,100))`);
    await run(`document.querySelector('.transition-preview button').click(); new Promise((resolve) => setTimeout(resolve,100))`);
    await run(`document.querySelector('.news-transition-settings > summary').focus()`);
    await key('Enter');
    assert.equal(await run(`document.querySelector('.news-transition-settings').open`), false, 'Enter must collapse the parent subsection');
    assert.equal(await run(`window.__fixture.previewClosed`), 2, 'Collapsing DJ transitions must stop the hidden preview');
    await key('Space');
    assert.equal(await run(`document.querySelector('.news-transition-settings').open`), true, 'Space must expand a subsection');
    assert.equal(await run(`document.querySelector('.transition-preview').open`), false, 'Reopening transitions must not restart the preview');
    await run(`document.querySelector('[data-section="general"]').click(); new Promise((resolve) => setTimeout(resolve,100))`);
    await run(`document.querySelector('#player-dj-controls').click(); new Promise((resolve) => setTimeout(resolve,150))`);
    await run(`[...document.querySelectorAll('.dj-sidebar-content footer button')].find((button) => button.textContent.trim()==='DJ settings').focus()`);
    await key('Enter');
    await run(`new Promise((resolve) => setTimeout(resolve,250))`);
    assert.equal(await run(`document.querySelector('.settings-sections [aria-current="page"]').dataset.section`), 'playback', 'The player DJ shortcut must open Playback');
    assert.equal(await run(`document.activeElement.id`), 'dj-playback-title', 'The player shortcut must focus the visible subsection summary');
  }
  return { scenario: 'Settings organization, compact playback overview, contextual help, keyboard disclosures, preview cleanup, player shortcut', stage, passed: true };
}
