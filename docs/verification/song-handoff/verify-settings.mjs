import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { verifyAnnouncementPreferences } from './verify-preferences.mjs';

export async function verifySongHandoffSettings(window, root, stage) {
  const run = source => window.webContents.executeJavaScript(source);
  const frame = () => run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const change = async (selector, value) => {
    await run(`(() => { const field=document.querySelector('${selector}'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'${value}'); field.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await frame();
  };
  const save = async selector => { await run(`document.querySelector('${selector} .settings-save').click()`); await frame(); };
  const capture = async (name, selector, width, height) => {
    window.setContentSize(width,height);
    await run(`document.fonts.ready.then(()=>new Promise(resolve=>setTimeout(resolve,200)))`);
    await run(`document.querySelector('${selector}').scrollIntoView({block:'start'})`); await frame();
    await writeFile(path.join(root,`docs/verification/song-handoff/${stage}-${name}-${width}.png`),(await window.webContents.capturePage()).toPNG());
  };
  await run(`document.querySelector('button.settings-nav').click()`); await frame();
  await run(`document.querySelector('[data-section="playback"]').click()`); await frame();
  assert.equal(await run(`document.querySelectorAll('.settings-subsection[open]').length`),0);
  for(const selector of ['.room-dj-schedule','.song-announcement-settings']) {
    await run(`document.querySelector('${selector} > summary').click()`); await frame();
  }
  assert.equal(await run(`!!document.querySelector('#announcement-detail-chance')`),false);
  assert.equal(await run(`document.querySelectorAll('.song-interval-track input[type="range"]').length`),4);
  assert.equal(await run(`document.querySelectorAll('.song-announcement-settings input[type="number"]').length`),0);
  assert.equal(await run(`document.querySelector('#announcement-interval-min').value`),'6');
  assert.equal(await run(`document.querySelector('#announcement-interval-max').value`),'6');
  assert.equal(await run(`document.querySelector('#announcement-interval-min').disabled`),true);
  for(const [width,height] of [[1440,1000],[960,800]]) {
    await capture('news','.room-dj-schedule',width,height);
    await capture('settings','.song-announcement-settings',width,height);
  }
  for(const enabled of [true,false]) {
    await run(`document.querySelector('#announce-tracks').click()`); await frame();
    if(enabled) {
      await change('#announcement-interval-max',8); await change('#announcement-interval-min',8);
      await change('#news-interval-max',4); await change('#news-interval-min',4);
      await save('.room-dj-schedule');
    }
    await save('.song-announcement-settings');
    assert.deepEqual(await run(`({on:window.__fixture.state.djPlayback.announceTracks,min:window.__fixture.state.djPlayback.announceEverySongs,max:window.__fixture.state.djPlayback.announceEverySongsMax,news:window.__fixture.state.djPlayback.everySongs,newsMax:window.__fixture.state.djPlayback.everySongsMax})`),{on:enabled,min:8,max:8,news:4,newsMax:4});
  }
  if(stage.includes('dual-sliders')) {
    await run(`document.querySelector('#announce-tracks').click()`); await frame();
    await change('#announcement-interval-min',2); await change('#announcement-interval-max',6);
    await save('.song-announcement-settings');
    await change('#news-interval-min',2); await change('#news-interval-max',5);
    await save('.room-dj-schedule');
    window.setContentSize(1440,1000); window.show(); window.focus();
    await run(`document.querySelector('.room-dj-schedule').scrollIntoView({block:'start'});document.querySelector('#news-interval-min').focus()`); await frame();
    const key = async value => {
      window.webContents.sendInputEvent({type:'keyDown',keyCode:value});
      window.webContents.sendInputEvent({type:'keyUp',keyCode:value}); await frame();
    };
    await key('Right');
    assert.equal(await run(`document.querySelector('#news-interval-min').value`),'3');
    await key('End');
    assert.equal(await run(`document.querySelector('#news-interval-min').value`),'5','The minimum crossed the maximum');
    await key('Tab');
    assert.equal(await run(`document.activeElement.id`),'news-interval-max','Thumb tab order changed at equal values');
    await key('Home');
    assert.equal(await run(`document.querySelector('#news-interval-max').value`),'5','The maximum crossed the minimum');
    await key('End'); await key('Tab');
    await run(`document.querySelector('#news-interval-min').focus()`); await key('Home');
    assert.equal(await run(`document.querySelector('#news-interval-min').value`),'1');
    assert.equal(await run(`document.querySelector('#news-interval-max').value`),'10');
    assert.equal(await run(`document.activeElement.matches(':focus-visible')`),true);
    await change('#news-interval-min',2); await change('#news-interval-max',6);
    const drag = async (from,to,id='news-interval') => {
      const bounds=await run(`(() => {const b=document.querySelector('#${id}-min').parentElement.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};})()`);
      const point=value=>({x:Math.round(bounds.x+8+(value-1)*(bounds.width-16)/9),y:Math.round(bounds.y+bounds.height/2)});
      const start=point(from);
      window.webContents.sendInputEvent({type:'mouseMove',...start});
      window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...start});
      window.webContents.sendInputEvent({type:'mouseMove',...point(to)});
      window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point(to)});
      await frame();
    };
    await drag(2,4);
    assert.equal(await run(`document.querySelector('#news-interval-min').value`),'4','Pointer dragging did not move the minimum');
    await drag(6,9);
    assert.equal(await run(`document.querySelector('#news-interval-max').value`),'9','Pointer dragging did not move the maximum');
    await change('#news-interval-min',5); await change('#news-interval-max',5);
    if(stage.includes('merged-handle')) {
      await change('#announcement-interval-min',5); await change('#announcement-interval-max',5);
      await run(`document.activeElement?.blur()`);
      for(const [width,height] of [[1440,1000],[960,800],[720,900]]) {
        await capture('fixed-news','.room-dj-schedule',width,height);
        await capture('fixed-announcements','.song-announcement-settings',width,height);
      }
      window.setContentSize(1440,1000);
      for(const id of ['news-interval','announcement-interval']) {
        await run(`document.querySelector('#${id}-min').scrollIntoView({block:'center'});document.activeElement?.blur()`); await frame();
        await drag(5,5,id);
        assert.equal(await run(`document.querySelector('#${id}-min').value`),'5','Clicking a merged handle changed its minimum');
        assert.equal(await run(`document.querySelector('#${id}-max').value`),'5','Clicking a merged handle changed its maximum');
        await drag(5,2,id);
        assert.equal(await run(`document.querySelector('#${id}-min').value`),'2','Dragging a merged handle left did not lower the minimum');
        assert.equal(await run(`document.querySelector('#${id}-max').value`),'5','Dragging a merged handle left moved the maximum');
        await drag(2,5,id);
        assert.equal(await run(`document.querySelector('#${id}-min').parentElement.dataset.equal`),'true','Moving the minimum to the maximum did not merge the handle');
        await drag(5,8,id);
        assert.equal(await run(`document.querySelector('#${id}-min').value`),'5','Dragging a merged handle right moved the minimum');
        assert.equal(await run(`document.querySelector('#${id}-max').value`),'8','Dragging a merged handle right did not raise the maximum');
        await drag(8,5,id);
        assert.equal(await run(`document.querySelector('#${id}-min').parentElement.dataset.equal`),'true','Moving the maximum to the minimum did not merge the handle');
        await change(`#${id}-min`,1); await change(`#${id}-max`,1);
        await drag(1,4,id);
        assert.equal(await run(`document.querySelector('#${id}-min').value`),'1');
        assert.equal(await run(`document.querySelector('#${id}-max').value`),'4','The merged handle could not expand from 1');
        await change(`#${id}-max`,10); await change(`#${id}-min`,10);
        await drag(10,7,id);
        assert.equal(await run(`document.querySelector('#${id}-min').value`),'7','The merged handle could not expand from 10');
        assert.equal(await run(`document.querySelector('#${id}-max').value`),'10');
      }
      await change('#announcement-interval-min',2); await change('#announcement-interval-max',6);
      await save('.song-announcement-settings');
      await change('#news-interval-min',2); await change('#news-interval-max',5);
      await run(`document.querySelector('.room-dj-schedule').scrollIntoView({block:'start'})`); await frame();
    } else await drag(5,2);
    assert.equal(await run(`document.querySelector('#news-interval-min').value`),'2','The lower thumb could not be moved from the merged value');
    await drag(5,8);
    assert.equal(await run(`document.querySelector('#news-interval-max').value`),'8');
    assert.equal(await run(`document.querySelector('#news-interval-min').getAttribute('aria-valuemax')`),'8');
    assert.equal(await run(`document.querySelector('#news-interval-max').getAttribute('aria-valuemin')`),'2');
    await change('#news-interval-max',5); await save('.room-dj-schedule');
    window.hide();
    for(const [width,height] of [[1440,1000],[960,800],[720,900]]) {
      await capture('enabled-news','.room-dj-schedule',width,height);
      await capture('enabled-settings','.song-announcement-settings',width,height);
      assert.equal(await run(`[...document.querySelectorAll('.song-interval-range')].some(e=>e.scrollWidth>e.clientWidth)`),false,'The interval control overflowed');
      if(width===1440) {
        await run(`document.documentElement.dataset.theme='dark'`); await frame();
        await capture('enabled-dark','.song-announcement-settings',width,height);
        await run(`document.documentElement.dataset.theme='light'`); await frame();
      }
    }
    assert.equal(await run(`window.__fixture.calls.filter(c=>c.method==='prepareSongHandoff').length`),0);
    await run(`document.querySelector('#announce-tracks').click()`); await frame();
    assert.equal(await run(`[...document.querySelectorAll('.song-announcement-settings .song-interval-track input')].every(e=>e.matches(':disabled'))`),true);
    await save('.song-announcement-settings');
  }
  if(stage.includes('variety')||stage.includes('subsections')) await verifyAnnouncementPreferences(window,root,stage);
  return {scenario:'News and announcement dual sliders, 1–10 limits, pointer and keyboard input, independent persistence, no chance setting',stage,passed:true};
}
