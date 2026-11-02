import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modules = realpathSync(`${root}/node_modules`);
const { createServer } = await import(pathToFileURL(`${modules}/vite/dist/node/index.js`));
const { default: react } = await import(pathToFileURL(`${modules}/@vitejs/plugin-react/dist/index.js`));
const fixtureModule = `${root}/docs/verification/playback-progress/fixture.mjs`;
const library = `(()=>{
  const createdAt='2026-11-02T17:47:21.000Z';
  const article={id:'source-hover-story',title:'Show HN: Subvocal – Talk to your computer without making noise',url:'https://fixture.invalid/story',source:'HN',publishedAt:createdAt};
  const dj={...state.djs[0],name:'Jane'};
  const take={id:'source-hover-take',requestId:'source-hover-request',script:'A new voice interface works without speaking aloud.',articles:[article],warnings:[],engine:'elevenlabs-v4',createdAt,audioUrl:'/fixture-speech',signature:'source-hover',provenance:{dj,mood:'Warm',sources:state.sources,roomId:'default-room',roomName:'My room'},renderingDJ:dj,available:true,byteLength:100,model:'fixture',voice:'fixture',delivery:'',scriptId:'source-hover-script',deliveryState:{status:'played',playedAt:'2026-11-02T17:52:19.000Z'}};
  return {scripts:[],takes:[take],requests:[],reviewedArticles:[]};
})()`;
const server = await createServer({
  root: `${root}/src/renderer`,
  configFile: false,
  plugins: [{
    name: 'source-link-fixture',
    enforce: 'pre',
    transform(source, id) {
      if (id !== fixtureModule) return;
      const original = 'getPreparedNews:()=>ok({scripts:[],takes:[],requests:[],reviewedArticles:[]})';
      if (!source.includes(original)) throw new Error('Prepared-news fixture bridge changed');
      const enabledSettings = `new URLSearchParams(location.search).has('settings-links')`;
      source = source
        .replace('window.__fixture={', `if (${enabledSettings}) state.roomProfiles[0].workflowDraft.newsEnabled=true;\nwindow.__fixture={`)
        .replaceAll('configured:false', `configured:${enabledSettings}`);
      return `window.__fixtureSeed={dj:true};localStorage.setItem('wave:theme','dark');\n${source.replaceAll('__FIXTURE_ROOT__',root).replace(original,`getPreparedNews:()=>ok(${library})`)}`;
    },
    transformIndexHtml() {
      return [{tag:'script',attrs:{type:'module',src:`/@fs/${fixtureModule}`},injectTo:'head-prepend'}];
    },
  }, react()],
  server: { host: '127.0.0.1', port: 5199, strictPort: true, fs: { allow: [root,modules] } },
});
await server.listen();
console.log('Saved-source link fixture http://127.0.0.1:5199');
