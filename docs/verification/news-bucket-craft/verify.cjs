const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.WAVE_PLAYWRIGHT_MODULE || 'playwright');
const { openFixture } = require('../news-bucket-redesign/capture.cjs');
const reports = [];
const outputDirectory = process.env.WAVE_VERIFY_OUTPUT_DIR || __dirname;

async function seedBridge(page) {
  await page.evaluate(() => {
    const f = window.__fixture;
    f.providersReady = false;
    window.wave.getAiStatus = window.wave.getElevenLabsStatus = async () => ({ ok: true, value: { configured: f.providersReady } });
    window.wave.setNewsFavorite = async ({ article, favorite }) => {
      if(f.favoriteGate) await f.favoriteGate;
      if (f.failFavorite) return { ok: false, error: { code: 'storage', message: 'Fixture favorite could not be saved' } };
      const url = new URL(article.url); url.hash = ''; url.search = '';
      const canonicalUrl = url.href;
      f.library.favorites ??= [];
      f.library.favorites = f.library.favorites.filter(value => value.canonicalUrl !== canonicalUrl);
      if (favorite) f.library.favorites.push({ ...article, canonicalUrl, favoritedAt: new Date().toISOString() });
      return { ok: true, value: structuredClone(f.library) };
    };
    window.wave.openSource = async url => { f.calls.push({ method: 'openSource', url }); return { ok: true }; };
    window.wave.disableNewsPreparation = async roomId => {
      f.calls.push({method:'disableNewsPreparation',roomId});
      if(f.failStop)return{ok:false,error:{code:'storage',message:'Fixture stop unavailable'}};
      f.state.roomProfiles.find(p=>p.id===roomId).workflowDraft.newsEnabled=false;
      f.state.revision++;
      return{ok:true,value:structuredClone(f.state)};
    };
    window.wave.setRoomProfileEnabled = async input => {
      f.calls.push({method:'setRoomProfileEnabled',input});
      f.state.roomProfiles.find(p=>p.id===input.id).enabled=input.enabled;
      f.state.revision++;
      return{ok:true,value:structuredClone(f.state)};
    };
    window.wave.saveWorkflowDraft = async input => {
      f.calls.push({ method: 'saveWorkflowDraft', input });
      if (input.resumePreparation && f.failResume) return { ok:false,error:{code:'storage',message:'Fixture resume unavailable'} };
      if (f.failSave) return { ok: false, error: { code: 'storage', message: 'Fixture save unavailable' } };
      const profile = f.state.roomProfiles.find(room => room.id === input.expectedProfileId);
      Object.assign(profile, { room: input.room, mood: input.mood, workflowDraft: input.workflowDraft });
      if(input.resumePreparation){delete profile.workflowDraft.newsWorkflowError;profile.workflowDraft.newsWorkflowPaused=false;}
      f.state.revision++;
      return { ok: true, value: structuredClone(f.state) };
    };
  });
}

const playing = page => page.evaluate(() => window.__fixture.audios.filter(audio => audio.src.includes('fixture-speech') && !audio.paused).length);
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.news-bucket-layout, .news-bucket-navigation, .news-bucket-list-column, .news-bucket-inspector')].filter(e => e.checkVisibility()).every(e => e.scrollWidth <= e.clientWidth + 1));
const screenshot = (page, name) => page.screenshot({ path: `${outputDirectory}/${name}.png` });
const saveCalls = page => page.evaluate(() => window.__fixture.calls.filter(c => c.method === 'saveWorkflowDraft').length);

async function main() {
  const browser = await chromium.connectOverCDP(process.env.WAVE_DEBUG_URL || 'http://127.0.0.1:9339');
  try {
    for (const [width,height,theme] of [[1440,900,'dark'],[1280,800,'light'],[1280,800,'coffee'],[1024,768,'dark'],[800,700,'dark'],[720,450,'light']]) {
      const { page, errors } = await openFixture(browser,width,height,theme);
      page.setDefaultTimeout(10000);
      try {
        await page.evaluate(async()=>{await document.fonts.ready;await new Promise(requestAnimationFrame);});
        await seedBridge(page);
        const bucket = page.locator('.news-bucket');
        const nav = page.getByRole('navigation',{ name:'News categories' });
        const rows = bucket.locator('.news-bucket-item');
        const inspector = page.getByRole('complementary',{ name:'Story inspector' });
        const settings = bucket.locator('.news-room-settings');
        const go = async id => {
          const select=nav.getByLabel('News category',{exact:true});
          if(await select.isVisible()) await select.selectOption(id);
          else await nav.locator('button').filter({hasText:({upcoming:'Upcoming',check:'Check news',past:'Past news',favorites:'Favorites',settings:'Settings'})[id]}).click();
        };
        assert.equal(await nav.locator('button').count(),5);
        assert.equal(await rows.count(),2);
        assert.equal(await inspector.count(),width >= 1280 ? 1 : 0);
        assert.equal(await playing(page),0,'Opening a reader never starts audio');
        assert.match(await rows.first().innerText(),/Published just now/);
        assert.match(await rows.first().innerText(),/A new album is coming Friday/);
        assert.equal(await noOverflow(page),true);
        const mainBox=await page.locator('.main-content').boundingBox(),workspaceBox=await bucket.locator('.news-bucket-layout').boundingBox();
        assert.ok(Math.abs(mainBox.x-workspaceBox.x)<1&&Math.abs(mainBox.x+mainBox.width-workspaceBox.x-workspaceBox.width)<1&&Math.abs(mainBox.y+mainBox.height-workspaceBox.y-workspaceBox.height)<1,'Workspace meets the app surface edges');
        assert.equal(await bucket.locator('.news-bucket-layout').evaluate(e=>getComputedStyle(e).borderRadius),'0px');
        const alignment=await bucket.evaluate(root=>{
          const rect=selector=>root.querySelector(selector).getBoundingClientRect();
          const heading=rect('.news-bucket-list-column .news-bucket-content-heading h2');
          const title=rect('.news-bucket-item strong');
          const star=rect('.news-bucket-story-row > .news-bucket-star');
          const navigation=rect('.news-bucket-navigation');
          const buttons=[...root.querySelectorAll('.news-bucket-navigation > button')].filter(e=>e.checkVisibility()).map(e=>e.getBoundingClientRect());
          const toolbar=root.querySelector('.news-bucket-reader-toolbar')?.getBoundingClientRect();
          return {headingX:heading.x,titleX:title.x,titleCenter:title.y+parseFloat(getComputedStyle(root.querySelector('.news-bucket-item strong')).lineHeight)/2,starCenter:star.y+star.height/2,navigationHeight:navigation.height,buttonCenters:buttons.map(box=>box.y+box.height/2),headingCenter:heading.y+heading.height/2,toolbarCenter:toolbar?toolbar.y+toolbar.height/2:null};
        });
        assert.ok(Math.abs(alignment.headingX-alignment.titleX)<1,'List heading and story text share a left edge');
        assert.ok(Math.abs(alignment.titleCenter-alignment.starCenter)<1,'Favorite controls align with the first headline line');
        assert.ok(alignment.navigationHeight<=52,'Category navigation stays in one compact row');
        assert.ok(alignment.buttonCenters.every(center=>Math.abs(center-alignment.buttonCenters[0])<1),'Category destinations share a horizontal baseline');
        if(alignment.toolbarCenter!==null)assert.ok(Math.abs(alignment.headingCenter-alignment.toolbarCenter)<1,'Reader toolbar and collection heading share the header band');
        await screenshot(page,`after-upcoming-${width}-${theme}`);
        if (await inspector.count()) {
          await inspector.getByRole('button',{name:'Close story details',exact:true}).click();
          await page.waitForFunction(() => document.activeElement?.dataset.storyKey === 'take:take-0');
          await page.evaluate(() => window.__fixture.client.setQueryData(['preparedNews'],structuredClone(window.__fixture.library)));
          assert.equal(await inspector.count(),0,'A data refresh does not undo a deliberate close');
        }
        await rows.first().focus();
        const scrollBefore = await page.locator('.main-content').evaluate(e => e.scrollTop);
        await page.keyboard.press('Enter');
        await inspector.getByRole('heading',{name:'New album announced for Friday',exact:true}).waitFor();
        await page.waitForFunction(() => document.activeElement?.tagName === 'H2' && document.activeElement?.textContent === 'New album announced for Friday');
        if (width <= 1024) {
          assert.equal(await inspector.getByRole('button',{name:'Back to stories',exact:true}).isVisible(),true);
          assert.equal(await rows.first().isVisible(),false,'Compact reading does not stack an unseen list above the story');
          const rect = await nav.boundingBox();
          const mainBox=await page.locator('.main-content').boundingBox();
          assert.ok(rect&&mainBox&&rect.y>=mainBox.y-1&&rect.y+rect.height<=mainBox.y+mainBox.height+1,JSON.stringify({rect,mainBox}));
          assert.equal(await page.locator('.main-content').evaluate(e => e.scrollTop),scrollBefore,'Opening a compact reader does not jump past category navigation');
        }
        await screenshot(page,`after-reader-${width}-${theme}`);
        await inspector.getByRole('button',{name:/Listen to .*saved story/}).click();
        await inspector.getByRole('button',{name:'Pause audition',exact:true}).waitFor();
        assert.equal(await playing(page),1);
        await inspector.getByRole('button',{name:'Pause audition',exact:true}).click();
        assert.equal(await playing(page),0);
        await inspector.getByRole('button',{name:'Resume audition',exact:true}).click();
        if (width <= 1024) await inspector.getByRole('button',{name:'Back to stories',exact:true}).click();
        else await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.activeElement?.dataset.storyKey === 'take:take-0');
        assert.equal(await playing(page),0);
        assert.equal(await rows.first().isVisible(),true);
        await bucket.getByRole('button',{name:'Add to favorites: New album announced for Friday',exact:true}).click();
        await bucket.getByRole('button',{name:'Remove from favorites: New album announced for Friday',exact:true}).waitFor();
        await go('favorites');
        await rows.first().click();
        await inspector.getByRole('button',{name:'New album announced for Friday',exact:true}).click();
        assert.equal(await page.evaluate(() => window.__fixture.calls.filter(c => c.method === 'openSource').length),1);
        if(width===1440){
          await page.evaluate(()=>{const f=window.__fixture;f.favoriteGate=new Promise(resolve=>{f.releaseFavorite=resolve;});});
          await inspector.getByRole('button',{name:'Remove from favorites: New album announced for Friday',exact:true}).click();
          await go('settings');
          await settings.locator('#bucket-mood').focus();
          await page.evaluate(()=>{const f=window.__fixture;f.releaseFavorite();f.favoriteGate=null;});
          await page.waitForFunction(()=>{const f=window.__fixture;return f.client.getQueryData(['preparedNews']).favorites?.length===0&&f.client.isFetching({queryKey:['preparedNews']})===0});
          await page.evaluate(()=>new Promise(requestAnimationFrame));
          assert.equal(await settings.locator('#bucket-mood').evaluate(e=>e===document.activeElement),true,'Late favorite deletion does not steal focus after navigation');
          await go('upcoming');
          await bucket.getByRole('button',{name:'Add to favorites: New album announced for Friday',exact:true}).click();
          await bucket.getByRole('button',{name:'Remove from favorites: New album announced for Friday',exact:true}).waitFor();
          await go('favorites');
          await rows.first().click();
        }
        await inspector.getByRole('button',{name:'Remove from favorites: New album announced for Friday',exact:true}).click();
        await inspector.waitFor({state:'detached'});
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-current') === 'page' || document.activeElement?.matches('.news-bucket-navigation-select select'));
        await go('past');
        assert.equal(await rows.count(),1);
        assert.match(await rows.innerText(),/Festival adds two evening sets/);
        await bucket.getByLabel('Story history',{exact:true}).selectOption('all');
        assert.equal(await rows.count(),3,'Every saved recording is reachable, including upcoming recordings');
        if(width===1440){
          await page.evaluate(()=>{
            const f=window.__fixture;
            for(const [id,title,roomId]of[['deleted-room-recording','News from a removed room','deleted-room'],['legacy-recording','News without a saved room',null]]){
              const take=structuredClone(f.library.takes[2]);take.id=id;take.createdAt=new Date(Date.now()-48*3600000).toISOString();
              take.articles=[{...take.articles[0],id,title,url:`https://fixture.invalid/${id}`}];
              if(roomId){take.provenance.roomId=roomId;take.provenance.roomName='Earlier room';}else{delete take.provenance.roomId;delete take.provenance.roomName;}
              f.library.takes.push(take);
            }
            f.client.setQueryData(['preparedNews'],structuredClone(f.library));
          });
          await page.waitForFunction(()=>document.querySelectorAll('.news-bucket-item').length===5);
          await rows.filter({hasText:'News from a removed room'}).click();
          await inspector.getByRole('heading',{name:'News from a removed room',exact:true}).waitFor();
          await page.keyboard.press('Escape');
          await rows.filter({hasText:'News without a saved room'}).click();
          await inspector.getByRole('heading',{name:'News without a saved room',exact:true}).waitFor();
          await page.keyboard.press('Escape');
          await screenshot(page,'after-library-1440-dark');
          await bucket.getByLabel('Story history',{exact:true}).selectOption('heard');
          assert.equal(await rows.count(),1,'Legacy and deleted-room playback never inflates current-room heard history');
        }
        await bucket.getByLabel('Story history',{exact:true}).selectOption('scripts');
        await rows.first().click();
        assert.equal(await inspector.getByRole('button',{name:/Listen/}).count(),0);
        await go('past');
        await bucket.getByLabel('Story history',{exact:true}).selectOption('reviewed');
        assert.equal(await rows.count(),3);
        await go('check');
        await bucket.getByRole('heading',{name:'No story list saved for this check',exact:true}).waitFor();
        await page.evaluate(() => {
          const f=window.__fixture,now=new Date().toISOString();
          const article={...f.library.takes[0].articles[0],summary:'An album arrives Friday.',sourceIds:['fixture-source']};
          f.library.requests=[{requestId:'latest-check',status:'complete',origin:{kind:'automatic',profileId:f.state.activeRoomProfileId,startedAt:now},checkpoint:{createdAt:now,provenance:{roomId:f.state.activeRoomProfileId},collection:{collectedAt:now,candidates:[article],incomplete:true,sourceResults:[{sourceId:'fixture-source',status:'complete',articleCount:1,warnings:[]}],warnings:['Some sources could not refresh.']},selection:{candidateId:article.id,reason:'A relevant album release.',decidedAt:now}}}];
          f.client.setQueryData(['preparedNews'],structuredClone(f.library));
        });
        await rows.first().waitFor();
        assert.match(await rows.first().innerText(),/An album arrives Friday/);
        assert.match(await bucket.innerText(),/Source coverage incomplete/);
        await screenshot(page,`after-check-${width}-${theme}`);
        await go('settings');
        await settings.waitFor();
        assert.equal(await settings.getByRole('checkbox',{name:'Automatically prepare news',exact:true}).isDisabled(),true);
        assert.equal(await settings.getByRole('button',{name:'Provider keys',exact:true}).count(),1,'One clear provider-management action');
        await screenshot(page,`after-settings-missing-${width}-${theme}`);
        await settings.locator('#bucket-mood').fill('Quiet and curious');
        await go('upcoming');
        await go('settings');
        assert.equal(await settings.locator('#bucket-mood').inputValue(),'Quiet and curious');
        await settings.getByRole('button',{name:'Provider keys',exact:true}).click();
        await page.getByRole('button',{name:'Back to setup',exact:true}).click();
        await nav.waitFor();
        assert.equal(await nav.locator('button').filter({hasText:'Settings'}).getAttribute('aria-current'),'page');
        assert.equal(await settings.locator('#bucket-mood').inputValue(),'Quiet and curious');
        const sources = settings.locator('.news-room-settings-group').filter({has:page.getByText('Sources & schedule',{exact:true})});
        if (!(await sources.getAttribute('open') !== null)) await sources.locator('summary').first().click();
        assert.match(await sources.innerText(),/RSS/);
        assert.match(await sources.innerText(),/Hacker News/);
        await settings.getByRole('button',{name:'Manage sources',exact:true}).click();
        await page.getByRole('button',{name:'Back to setup',exact:true}).click();
        await nav.waitFor();
        assert.equal(await nav.locator('button').filter({hasText:'Settings'}).getAttribute('aria-current'),'page');
        assert.equal(await settings.locator('#bucket-mood').inputValue(),'Quiet and curious');
        await page.evaluate(() => {const f=window.__fixture;f.providersReady=true;f.client.setQueryData(['aiStatus'],{configured:true});f.client.setQueryData(['elevenLabsStatus'],{configured:true});});
        const toggle=settings.getByRole('checkbox',{name:'Automatically prepare news',exact:true});
        await toggle.setChecked(true);
        assert.match(await settings.innerText(),/Saving while enabled authorizes OpenAI and ElevenLabs requests/);
        assert.equal(await saveCalls(page),0,'Enabling is a draft until Save');
        const sourcesAgain=settings.locator('.news-room-settings-group').filter({has:page.getByText('Sources & schedule',{exact:true})});
        if (await sourcesAgain.getAttribute('open') === null) await sourcesAgain.locator('summary').first().click();
        await settings.locator('#bucket-recording-limit').fill('0');
        await settings.getByRole('button',{name:'Save setup',exact:true}).click();
        assert.equal(await settings.locator('#bucket-recording-limit').evaluate(e => e.validity.valid),false);
        assert.equal(await saveCalls(page),0,'Invalid limits cannot be saved');
        await settings.locator('#bucket-recording-limit').fill('4');
        await page.evaluate(() => {window.__fixture.failSave=true;});
        await settings.getByRole('button',{name:'Save setup',exact:true}).click();
        await settings.getByText('Fixture save unavailable',{exact:true}).waitFor();
        assert.equal(await settings.locator('#bucket-mood').inputValue(),'Quiet and curious');
        await page.evaluate(() => {window.__fixture.failSave=false;});
        await settings.getByRole('button',{name:'Save setup',exact:true}).focus();
        await page.keyboard.press('Enter');
        await settings.getByText('Setup saved',{exact:true}).waitFor();
        await page.waitForFunction(() => document.activeElement?.classList.contains('news-room-settings-saved'));
        assert.equal(await page.evaluate(() => window.__fixture.state.roomProfiles[0].workflowDraft.newsEnabled),true);
        assert.equal(await settings.getByRole('button',{name:'Provider keys',exact:true}).count(),1,'Configured providers remain manageable');
        while (await settings.locator('.news-room-settings-group[open]').count()) await settings.locator('.news-room-settings-group[open]').first().locator('summary').first().click();
        await go('settings');
        await bucket.locator('.news-bucket-settings-page').evaluate(e => e.scrollTo(0,0));
        await screenshot(page,`after-settings-${width}-${theme}`);
        if(width===1440){
          await page.evaluate(()=>{const f=window.__fixture;f.state.roomProfiles[0].workflowDraft.newsWorkflowPaused=true;f.client.setQueryData(['localState'],structuredClone(f.state));f.failResume=true;});
          await settings.getByRole('button',{name:'Resume preparation',exact:true}).focus();
          await page.keyboard.press('Enter');
          await settings.getByText('Fixture resume unavailable',{exact:true}).waitFor();
          await page.evaluate(()=>{window.__fixture.failResume=false;});
          await settings.getByRole('button',{name:'Resume preparation',exact:true}).focus();
          await page.keyboard.press('Enter');
          await settings.getByRole('button',{name:'Resume preparation',exact:true}).waitFor({state:'detached'});
          assert.equal(await page.evaluate(()=>window.__fixture.state.roomProfiles[0].workflowDraft.newsWorkflowPaused),false);
          await page.waitForFunction(()=>document.activeElement?.matches('.news-room-automation-toggle input, .news-room-automation'));
          await page.evaluate(()=>{window.__fixture.failStop=true;});
          await settings.getByRole('button',{name:'Turn off now',exact:true}).focus();
          await page.keyboard.press('Enter');
          await settings.getByText(/Fixture stop unavailable/).waitFor();
          assert.equal(await toggle.isChecked(),true,'Failed stop keeps confirmed enabled state');
          await page.evaluate(()=>{window.__fixture.failStop=false;});
          await settings.getByRole('button',{name:'Turn off now',exact:true}).focus();
          await page.keyboard.press('Enter');
          await settings.getByRole('button',{name:'Turn off now',exact:true}).waitFor({state:'detached'});
          assert.equal(await toggle.isChecked(),false);
          await page.waitForFunction(()=>document.activeElement?.matches('.news-room-automation-toggle input, .news-room-automation'));
          await page.evaluate(()=>{const f=window.__fixture;f.state.roomProfiles[0].enabled=false;f.client.setQueryData(['localState'],structuredClone(f.state));});
          await settings.getByRole('button',{name:'Make room available',exact:true}).focus();
          await page.keyboard.press('Enter');
          await settings.getByRole('button',{name:'Make room available',exact:true}).waitFor({state:'detached'});
          assert.equal(await page.evaluate(()=>window.__fixture.state.roomProfiles[0].enabled),true);
          await page.waitForFunction(()=>document.activeElement?.matches('.news-room-automation-toggle input, .news-room-automation'));
          await page.evaluate(()=>{const f=window.__fixture;f.library.requests.push({requestId:'legacy-interruption',status:'interrupted',kind:'take',createdAt:new Date().toISOString(),origin:{kind:'automatic',startedAt:new Date().toISOString()},error:'Fixture interruption'});f.client.setQueryData(['preparedNews'],structuredClone(f.library));});
          await page.getByRole('button',{name:'Review preparation history',exact:true}).click();
          await page.getByRole('button',{name:'News settings',exact:true}).click();
          await page.locator('#manage-room-sources').click();
          await page.getByRole('button',{name:'Back to setup',exact:true}).click();
          await page.waitForFunction(()=>document.activeElement?.id==='manage-room-sources');
          assert.equal(await page.locator('#room-panel-settings').isVisible(),true,'Legacy setup management return still targets legacy setup');
          await page.getByRole('button',{name:'Back to News bucket',exact:true}).click();
        }
        assert.equal(await noOverflow(page),true);
        assert.deepEqual(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i)}),[],'No duplicate control IDs');
        assert.deepEqual(errors,[]);
        reports.push({width,height,theme,passed:true,pageErrors:errors,additionalChecks:width===1440?['legacy/deleted-room recordings remain reachable without changing heard count','late favorite result preserves current focus','resume failure/retry and keyboard focus','immediate stop failure/retry and keyboard focus','room availability and keyboard focus','legacy management return','unique IDs']:['unique IDs'],checks:['flush app-surface layout without nested frame','compact horizontal category navigation and aligned list/reader/favorite controls','one-time desktop reader','real publication dates and excerpts','compact reader/back/keyboard focus','category navigation remains visible','audition pause/resume/cleanup','favorites and source links','history semantics','latest source check/partial coverage','inline automatic preparation/readiness/consent','source and provider round trips retain draft/destination','validation/save error/success','no horizontal overflow']});
      } finally { await page.close(); }
    }
    await fs.writeFile(`${outputDirectory}/report.json`,JSON.stringify(reports,null,2));
    console.log(JSON.stringify(reports,null,2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error);process.exitCode=1; });
