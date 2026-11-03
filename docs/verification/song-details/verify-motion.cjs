const {chromium}=require(process.env.WAVE_PLAYWRIGHT_MODULE ?? 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const root=__dirname;
const artworkPath=path.resolve(__dirname,'../../../resources/icon.png');
const near=(a,b,label)=>assert(Math.abs(a-b)<1,`${label}: ${a} vs ${b}`);
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('wave:theme','light'));
await page.goto(process.env.WAVE_FIXTURE_URL ?? 'http://127.0.0.1:5207/?case=motion-behavior');await page.locator('.player-artwork:not(:disabled)').waitFor();await page.evaluate(artworkPath=>{const start=document.startViewTransition.bind(document);document.startViewTransition=(...args)=>{const t=start(...args);window.__motionTransition=t;return t;};window.__fixture.songs[0].imageUrl='/@fs'+artworkPath;},artworkPath);
await page.locator('.player-artwork').click();await page.locator('.inspector-art').waitFor();await page.waitForTimeout(300);const art=await page.locator('.inspector-art').elementHandle();
const results=[];
for(const [width,height]of [[1440,900],[960,700],[800,700],[640,480]]){
await page.setViewportSize({width,height});await page.waitForTimeout(250);
for(const direction of ['expand','collapse']){
const before=await page.locator('.inspector-art').boundingBox();
await page.evaluate(direction=>document.querySelector(`[aria-label="${direction==='expand'?'Expand song details':'Return song details to sidebar'}"]`).click(),direction);
await page.evaluate(async()=>{await window.__motionTransition.ready;document.getAnimations().forEach(a=>a.pause());});
const target=await page.locator('.inspector-art').boundingBox();const frames=[];
for(const progress of [0,.1,.25,.5,.75,1]){
const snapshot=await page.evaluate(progress=>{document.getAnimations().forEach(a=>{a.currentTime=220*progress;});const s=getComputedStyle(document.documentElement,'::view-transition-group(song-details-cover)');const m=new DOMMatrix(s.transform);return {x:m.e,y:m.f,width:parseFloat(s.width),height:parseFloat(s.height)};},progress);
assert(snapshot.width>=Math.min(before.width,target.width)-1&&snapshot.width<=Math.max(before.width,target.width)+1,'cover must stay between endpoint sizes');
assert(snapshot.x>=Math.min(before.x,target.x)-1&&snapshot.x<=Math.max(before.x,target.x)+1,'cover position must stay between endpoint positions');
near(snapshot.width,snapshot.height,'square artwork');frames.push({progress,...snapshot});
}
for(const key of ['x','y','width','height']){near(frames[0][key],before[key],`start ${key}`);near(frames.at(-1)[key],target[key],`end ${key}`);}
await page.evaluate(()=>document.getAnimations().forEach(a=>a.finish()));await page.waitForFunction(()=>!document.documentElement.classList.contains('is-resizing-details'));
assert(await art.evaluate(el=>el.isConnected));assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));results.push({width,height,direction,before,target,frames});
}
}
await page.setViewportSize({width:1440,height:900});
// Interrupt a running resize with a reversal, a panel switch, and dismissal.
await page.evaluate(()=>document.querySelector('[aria-label="Expand song details"]').click());await page.waitForTimeout(70);
await page.evaluate(()=>document.querySelector('[aria-label="Return song details to sidebar"]').click());await page.waitForTimeout(400);
assert.equal(await page.locator('.is-expanded').count(),0);assert(!await page.evaluate(()=>document.documentElement.classList.contains('is-resizing-details')));
await page.getByRole('button',{name:'Expand song details',exact:true}).click();await page.waitForTimeout(60);await page.getByRole('button',{name:/Show queue,/}).click();await page.locator('.queue-content').waitFor();await page.waitForTimeout(300);assert(!await page.evaluate(()=>document.documentElement.classList.contains('is-resizing-details')));
await page.locator('.player-artwork').click();await page.getByRole('button',{name:'Expand song details',exact:true}).click();await page.waitForTimeout(50);await page.keyboard.press('Escape');await page.locator('.side-drawer').waitFor({state:'detached'});assert(await page.locator('.player-artwork').evaluate(el=>el===document.activeElement));
await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.player-artwork').click();await page.getByRole('button',{name:'Expand song details',exact:true}).click();assert.equal(await page.locator('.side-drawer.is-expanded').count(),1);assert(!await page.evaluate(()=>document.documentElement.classList.contains('is-resizing-details')));assert.equal(await page.evaluate(()=>document.getAnimations().length),0);await page.getByRole('button',{name:'Return song details to sidebar',exact:true}).click();assert.equal(await page.locator('.is-expanded').count(),0);
assert.deepEqual(errors,[]);await fs.writeFile(root+'/motion-behavior.json',JSON.stringify({results,reversal:true,panelSwitch:true,dismissal:true,reducedMotion:true,errors},null,2));console.log('Motion endpoint, intermediate-size, responsive, interruption, dismissal, and reduced-motion checks passed.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
