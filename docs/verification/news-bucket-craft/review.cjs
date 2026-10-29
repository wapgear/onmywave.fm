const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.WAVE_PLAYWRIGHT_MODULE||'playwright');
const {openFixture}=require('../news-bucket-redesign/capture.cjs');
const outputDirectory=process.env.WAVE_VERIFY_OUTPUT_DIR||__dirname;

async function contrast(page){
 return page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
  function rgba(css){ctx.clearRect(0,0,1,1);ctx.fillStyle=css;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((n,i)=>i===3?n/255:n);}
  function over(a,b){const k=a[3];return [a[0]*k+b[0]*(1-k),a[1]*k+b[1]*(1-k),a[2]*k+b[2]*(1-k),1];}
  function bg(el){const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);return chain.reduce((color,p)=>over(rgba(getComputedStyle(p).backgroundColor),color),[255,255,255,1]);}
  function lum(rgb){const c=rgb.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
  return ['.news-bucket-navigation [aria-current]','.news-bucket-content-heading p','.news-bucket-item-main strong','.news-bucket-item-byline','.news-bucket-item-excerpt','.news-bucket-reader-eyebrow','.news-bucket-inspector-script','.news-bucket-audition-play'].flatMap(selector=>[...document.querySelectorAll(selector)].filter(e=>e.checkVisibility()).map(e=>{const style=getComputedStyle(e),foreground=over(rgba(style.color),bg(e));const a=lum(foreground),b=lum(bg(e));return{selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),fontSize:style.fontSize};}));
 });
}

async function main(){
 const b=await chromium.connectOverCDP(process.env.WAVE_DEBUG_URL||'http://127.0.0.1:9339');const report=[];
 try{
  for(const theme of ['dark','light','coffee']){
   const {page,errors}=await openFixture(b,1440,900,theme);
   try{
    const values=await contrast(page);for(const value of values)assert.ok(value.ratio>=4.5,JSON.stringify({theme,...value}));
    const nav=page.getByRole('navigation',{name:'News categories'}),reader=page.locator('#news-story-inspector');
    assert.equal(await page.locator('.news-bucket-inspector').evaluate(e=>getComputedStyle(e).animationName),'none','Reduced-motion preference removes the reader entrance');
    await page.setViewportSize({width:800,height:700});
    await reader.getByRole('button',{name:'Back to stories',exact:true}).waitFor();
    const listen=reader.getByRole('button',{name:/Listen to .*saved story/});
    const box=await listen.boundingBox(),viewport=await reader.boundingBox();
    assert.ok(box&&viewport&&box.y>=viewport.y&&box.y+box.height<=viewport.y+viewport.height,'Normal compact entry shows the complete Listen target');
    await reader.getByRole('button',{name:'Back to stories',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.dataset.storyKey==='take:take-0');
    await page.setViewportSize({width:1440,height:900});
    assert.equal(await reader.count(),0,'Growing the window does not reopen a deliberate close');
    await page.evaluate(()=>{
      const f=window.__fixture,t=f.library.takes[0];
      t.articles[0].title='A very long news headline about a new release, its contributors, availability, and the details that matter to listeners. '.repeat(2).slice(0,240);
      t.articles[0].source='A source name with a much longer title than the usual publication';
      delete t.articles[0].publishedAt;
      t.script='The announcement confirms a new release. '.repeat(12);
      f.client.setQueryData(['preparedNews'],structuredClone(f.library));
    });
    assert.match(await page.locator('.news-bucket-item').first().innerText(),/Published date unavailable/);
    await page.locator('.news-bucket-item').first().click();
    await reader.getByRole('button',{name:/Listen to .*saved story/}).click();
    await page.evaluate(()=>window.__fixture.audios.filter(a=>a.src.includes('fixture-speech')).at(-1).emit('error'));
    await reader.getByText('The saved audio could not be opened. Refresh saved takes to check the file.',{exact:true}).waitFor();
    await reader.getByRole('button',{name:/Listen to .*saved story/}).click();
    await reader.getByRole('button',{name:'Pause audition',exact:true}).waitFor();
    await nav.getByRole('button',{name:/Favorites/}).click();
    assert.equal(await page.evaluate(()=>window.__fixture.audios.filter(a=>a.src.includes('fixture-speech')&&!a.paused).length),0);
    await page.evaluate(()=>{const f=window.__fixture;f.library.takes=[];f.library.scripts=[];f.library.requests=[];f.library.reviewedArticles=[];delete f.state.roomProfiles[0].workflowDraft.newsLastRun;f.client.setQueryData(['preparedNews'],structuredClone(f.library));f.client.setQueryData(['localState'],structuredClone(f.state));});
    await nav.getByRole('button',{name:/Upcoming/}).click();
    await page.getByRole('heading',{name:'Set up your news',exact:true}).waitFor();
    await page.screenshot({path:`${outputDirectory}/after-empty-${theme}.png`});
    await nav.getByRole('button',{name:'Check news',exact:true}).click();
    await page.getByRole('heading',{name:'No source check yet',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:/Check now/i}).count(),0,'No unsupported manual generation action');
    assert.deepEqual(errors,[]);
    report.push({theme,contrast:values,checks:['minimum 4.5:1 text contrast','reduced motion','resize retains user intent','compact Listen visible','long source/headline and missing date','audio failure/retry/cleanup','empty states','no unsupported check action'],pageErrors:errors});
   }finally{await page.close()}
  }
  const wrapper={newPage:options=>b.newPage({...options,deviceScaleFactor:2})};
  const {page,errors}=await openFixture(wrapper,720,450,'light');
  try{
   assert.equal(await page.evaluate(()=>devicePixelRatio),2);
   const nav=page.getByRole('navigation',{name:'News categories'});
   assert.equal(await nav.getByLabel('News category',{exact:true}).isVisible(),true);
   await page.locator('.news-bucket-item').first().click();
   await page.getByRole('button',{name:'Back to stories',exact:true}).waitFor();
   const box=await nav.boundingBox();assert.ok(box.y>=20&&box.y+box.height<300);
   await page.screenshot({path:`${outputDirectory}/after-200-percent-equivalent.png`});
   await nav.getByLabel('News category',{exact:true}).selectOption('settings');
   assert.equal(await page.locator('.news-room-settings').isVisible(),true);
   assert.deepEqual(errors,[]);
   report.push({viewport:{width:720,height:450,deviceScaleFactor:2},provenance:'200%-equivalent CSS viewport at 1440×900 physical pixels; not OS display or native VoiceOver verification',checks:['category selector','reader/back','Settings reachable'],pageErrors:errors});
  }finally{await page.close()}
  await fs.writeFile(`${outputDirectory}/review-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await b.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
