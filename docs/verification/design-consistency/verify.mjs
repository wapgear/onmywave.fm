import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function verifyConsistency(window, root, stage) {
  const directory=path.join(root,'docs/verification/design-consistency');
  const run=source=>window.webContents.executeJavaScript(source);
  const frame=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const click=async selector=>{await run(`document.querySelector('${selector}').click()`);await frame();};
  const measurements=[];
  const saveGeometry=(properties,id)=>{
    assert.equal(parseFloat(properties.height),32,`${id}: save height`);
    assert.equal(parseFloat(properties.radius),8,`${id}: save radius`);
    assert.equal(parseFloat(properties.fontSize),12,`${id}: save text size`);
  };
  const capture=async(id,selector,role,variant='default')=>{
    await run(`document.querySelector('${selector}').scrollIntoView({block:'center'})`);await frame();
    await run('document.fonts.ready.then(()=>new Promise(resolve=>setTimeout(resolve,180)))');
    const block=await run(`(()=>{const node=document.querySelector('${selector}'),r=node.getBoundingClientRect(),s=getComputedStyle(node);return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},text:node.innerText,properties:{height:s.height,radius:s.borderRadius,fontSize:s.fontSize,fontWeight:s.fontWeight,background:s.backgroundColor,border:s.border,shadow:s.boxShadow,padding:s.padding},theme:document.documentElement.dataset.theme||'light',viewport:{width:innerWidth,height:innerHeight}}})()`);
    const image=await window.webContents.capturePage();
    const scale=image.getSize().width/block.viewport.width;
    const x=Math.max(0,Math.floor(block.rect.x*scale)),y=Math.max(0,Math.floor(block.rect.y*scale));
    const width=Math.min(image.getSize().width-x,Math.ceil(block.rect.width*scale)),height=Math.min(image.getSize().height-y,Math.ceil(block.rect.height*scale));
    assert(width>0&&height>0,`${id} is not visible`);
    await writeFile(path.join(directory,`${stage}-${id}.png`),image.toPNG());
    await writeFile(path.join(directory,`${stage}-${id}-crop.png`),image.crop({x,y,width,height}).toPNG());
    measurements.push({id,selector,role,variant,...block,scale,method:'dom',capturedAt:new Date().toISOString()});
    if(stage.startsWith('after')&&(variant==='save'||variant==='dialog-action')) {
      saveGeometry(block.properties,id);
      if(variant==='save')assert.equal(await run(`document.querySelector('${selector}').classList.contains('save-button')`),true,`${id}: shared save component`);
    }
  };
  window.setContentSize(1440,1000);
  await click('button.settings-nav');await click('[data-section="playback"]');
  for(const selector of ['.room-dj-schedule','.song-announcement-settings','.news-transition-settings'])await click(`${selector} > summary`);
  for(const [id,selector] of [['news-save','.room-dj-schedule .settings-save'],['announcement-save','.song-announcement-settings .settings-save'],['transitions-save','.news-transition-settings .settings-save']])await capture(id,selector,'action-group','save');
  if(stage.startsWith('after')) {
    const selector='.room-dj-schedule .settings-save';
    await run(`document.querySelector('${selector}').style.minHeight='40px'`);
    const broken=await run(`(()=>{const s=getComputedStyle(document.querySelector('${selector}'));return {height:s.height,radius:s.borderRadius,fontSize:s.fontSize}})()`);
    assert.throws(()=>saveGeometry(broken,'controlled-drift'),/save height/);
    await run(`document.querySelector('${selector}').style.removeProperty('min-height')`);
    // Exercise the existing save owner through pending and focused completion states with fixture IPC only.
    window.show();window.focus();
    await run(`(()=>{const input=document.querySelector('.room-dj-schedule input[aria-label="Voice volume"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,0.4);input.dispatchEvent(new Event('input',{bubbles:true}));window.__fixture.saveDJGate=new Promise(resolve=>{window.__finishSave=resolve;});})()`);await frame();
    await run(`document.querySelector('${selector}').focus()`);await frame();await click(selector);
    assert.equal(await run(`document.querySelector('${selector}').getAttribute('aria-busy')`),'true');
    await capture('news-save-pending',selector,'action-group','save');
    await run(`window.__finishSave();window.__fixture.saveDJGate=null`);await frame();
    assert.equal(await run(`window.__fixture.state.djPlayback.voiceVolume`),0.4);
    assert.equal(await run(`document.activeElement===document.querySelector('${selector}')`),true,'Saving lost focus');
    window.hide();
  }
  await click('[aria-label="About news timing and voice"]');await capture('help-dialog','dialog[open]','dialog');await click('dialog[open] [aria-label="Close dialog"]');
  await click('[data-section="general"]');await capture('library-save','.library-choice-footer > button','action-group','save');
  await click('[data-section="keys"]');await capture('key-save','.provider-key-actions > button','action-group','save');
  await click('[data-section="sources"]');await click('[aria-label="Edit Fixture feed"]');
  await capture('source-dialog','dialog[open]','dialog');await capture('source-save','dialog[open] .modal-actions button:last-child','action-group','save');if(stage.startsWith('after'))await capture('source-cancel','dialog[open] .modal-actions button:first-child','action-group','dialog-action');await click('dialog[open] [aria-label="Close dialog"]');
  await click('[data-section="djs"]');await click('[aria-label="Edit Fixture DJ"]');
  await capture('dj-dialog','dialog[open]','dialog');await capture('dj-save','dialog[open] .modal-actions button:last-child','action-group','save');await click('dialog[open] [aria-label="Close dialog"]');
  await click('#player-dj-controls');await capture('dj-drawer','.side-drawer','inspector');
  await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await frame();
  await click('.sidebar-nav-button[aria-label="All songs"]');
  await run(`new Promise(resolve=>setTimeout(resolve,250))`);
  await click('[aria-label^="Actions for Evening track"]');await capture('track-menu',':popover-open','toolbar');
  await run(`document.querySelector(':popover-open').hidePopover()`);await frame();
  await capture('player','.player-bar','toolbar','player');
  for(const theme of ['dark','coffee']) {
    await run(`document.documentElement.dataset.theme='${theme}'`);await frame();await capture(`player-${theme}`,'.player-bar','toolbar','player');
  }
  await run(`document.documentElement.dataset.theme='light'`);await frame();
  window.setContentSize(960,800);await capture('player-narrow','.player-bar','toolbar','player');
  await writeFile(path.join(directory,`${stage}-measurements.json`),JSON.stringify({platform:'macOS Electron fixture',stage,measurements},null,2));
  if(stage.startsWith('after')) {
    const before=JSON.parse(await readFile(path.join(directory,'before-measurements.json'),'utf8'));
    for(const block of measurements.filter(m=>m.variant!=='save')) {
      const peer=before.measurements.find(m=>m.id===block.id);if(!peer)continue;
      for(const property of ['radius','background','border','shadow'])assert.equal(block.properties[property],peer.properties[property],`${block.id}: intentional surface role changed`);
    }
  }
  return {scenario:'Save action peers, dialog/help/drawer/menu/player surfaces, themes and narrow layout',stage,passed:true};
}
