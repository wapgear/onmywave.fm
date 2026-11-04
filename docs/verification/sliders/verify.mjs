import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function verifySliders(window, root, stage) {
  const run = source => window.webContents.executeJavaScript(source);
  const frame = () => run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const change = async (selector,value) => {
    await run(`(()=>{const input=document.querySelector('${selector}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${value});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await frame();
  };
  const capture = async (name,selector,width,height) => {
    window.setContentSize(width,height);
    await run(`document.fonts.ready.then(()=>new Promise(resolve=>setTimeout(resolve,200)))`);
    await run(`document.querySelector('${selector}').scrollIntoView({block:'center'})`); await frame();
    await writeFile(path.join(root,`docs/verification/sliders/${stage}-${name}-${width}.png`),(await window.webContents.capturePage()).toPNG());
  };
  await run(`document.querySelector('button.settings-nav').click()`); await frame();
  await run(`document.querySelector('[data-section="playback"]').click()`); await frame();
  for(const selector of ['.room-dj-schedule','.song-announcement-settings']) {
    await run(`document.querySelector('${selector} > summary').click()`); await frame();
  }
  await run(`document.querySelector('#announce-tracks').click()`); await frame();
  for(const [width,height] of [[1440,1000],[960,800],[720,900]]) {
    await capture('news-and-player','.room-dj-schedule',width,height);
    await capture('announcements','.song-announcement-settings',width,height);
  }
  if(stage.startsWith('after')) {
    assert.equal(await run(`document.querySelectorAll('input[type="range"]:not(.slider-input)').length`),0,'A range input bypasses the shared slider');
    await change('.room-dj-schedule input[aria-label="Voice volume"]',0.4);
    assert.match(await run(`document.querySelector('.room-dj-schedule input[aria-label="Voice volume"]').getAttribute('aria-valuetext')`),/40%/);
    await change('.player-volume input',0.3);
    assert.equal(await run(`window.__fixture.player.volume`),0.3);
    await change('.player-progress input',80);
    assert.equal(await run(`window.__fixture.audios.find(a=>a.src.startsWith('/fixture-audio')).currentTime`),44,'Seeking committed before release');
    await run(`document.querySelector('.player-progress input').dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))`); await frame();
    assert.equal(await run(`window.__fixture.audios.find(a=>a.src.startsWith('/fixture-audio')).currentTime`),80,'Seeking did not commit on release');
    window.show(); window.focus();
    await run(`document.querySelector('.player-volume input').focus()`);
    window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'});
    window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'}); await frame();
    assert.equal(await run(`window.__fixture.player.volume`),0.31);
    assert.equal(await run(`document.activeElement.matches(':focus-visible')`),true);
    // Observe actual CSS motion after a value change, rather than only checking a class name.
    await run(`(()=>{const input=document.querySelector('.player-volume input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,0.9);input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    assert(await run(`new Promise(resolve=>requestAnimationFrame(()=>resolve(document.querySelector('.player-volume').getAnimations({subtree:true}).some(a=>a.playState==='running'&&['left','right'].includes(a.transitionProperty)))))`),'Slider value changes did not animate');
    window.webContents.debugger.attach('1.3');
    try {
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]}); await frame();
      assert.equal(await run(`matchMedia('(prefers-reduced-motion: reduce)').matches`),true);
      await change('.player-volume input',0.5);
      assert.equal(await run(`document.querySelector('.player-volume').getAnimations({subtree:true}).filter(a=>a.playState==='running').length`),0,'Reduced motion still animates');
    } finally {
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});
      window.webContents.debugger.detach();
    }
    window.hide();
  }
  await run(`document.querySelector('[data-section="djs"]').click()`); await frame();
  await run(`document.querySelector('[aria-label="Edit Fixture DJ"]').click()`); await frame();
  for(const [width,height] of [[1440,1000],[960,800]]) await capture('dj-music-level','.dj-profile-duck',width,height);
  if(stage.startsWith('after')) {
    assert.equal(await run(`document.querySelectorAll('input[type="range"]:not(.slider-input)').length`),0);
    await change('.dj-profile-duck input',0.03);
    assert.equal(await run(`document.querySelector('.dj-profile-duck output').textContent`),'3%');
    assert.equal(await run(`window.__fixture.calls.filter(c=>/^(prepareSongHandoff|generate.*|preview.*)$/i.test(c.method)).length`),0,'Slider checks called a provider');
  }
  return {scenario:'Reusable sliders, preserved values and seek commit, keyboard focus, CSS animation and reduced motion',stage,passed:true};
}
