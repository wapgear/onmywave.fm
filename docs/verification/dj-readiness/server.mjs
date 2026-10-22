import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root=process.cwd(), modules=realpathSync(root+'/node_modules');
const {createServer}=await import(pathToFileURL(modules+'/vite/dist/node/index.js'));
const {default:react}=await import(pathToFileURL(modules+'/@vitejs/plugin-react/dist/index.js'));
const server=await createServer({root:root+'/src/renderer',configFile:false,plugins:[{
 name:'readiness-fixture',enforce:'pre',transform(source,id){
  if(id.endsWith('/docs/verification/dj-readiness/seed.mjs'))return source.replaceAll('__FIXTURE_ROOT__',root);
  if(!id.endsWith('/docs/verification/playback-progress/fixture.mjs'))return;
  source=source.replaceAll('__FIXTURE_ROOT__',root)
   .replace('getAiStatus:()=>ok({configured:false})',"getAiStatus:()=>window.__readinessParams.has('provider-pending')?new Promise(()=>{}):window.__readinessParams.has('provider-error')?Promise.resolve({ok:false,error:{code:'offline',message:'Fixture provider status unavailable'}}):ok({configured:false})")
   .replace("saveDJPlayback:async patch=>{", "saveDJPlayback:async patch=>{if(window.__readinessParams.has('save-error'))return {ok:false,error:{code:'offline',message:'Fixture playback save failed'}};")
   .replace('getLocalState:()=>ok(structuredClone(state))',"getLocalState:()=>window.__fixture.failState?Promise.resolve({ok:false,error:{code:'offline',message:'Fixture status unavailable'}}):ok(structuredClone(state))")
   .replace('getPreparedNews:()=>ok({scripts:[],takes:[],requests:[],reviewedArticles:[]})',"getPreparedNews:()=>window.__readinessParams.has('pending')?new Promise(()=>{}):window.__readinessParams.has('unknown')?Promise.resolve({ok:false,error:{code:'offline',message:'Fixture saved audio unavailable'}}):ok({scripts:[],takes:window.__fixture.savedTakes??[],requests:[],reviewedArticles:[]})")
   .replace('state.djPlayback={...state.djPlayback,...patch};state.revision++;',"state.djPlayback={...state.djPlayback,...patch};state.revision++;if(window.__readinessParams.has('unconfirmed'))window.__fixture.failState=true;");
  return 'import "/@fs/'+root+'/docs/verification/dj-readiness/seed.mjs";\n'+source+`\n
window.__fixture.savedTakes=takes.map((take,i)=>({...take,createdAt:new Date().toISOString(),deliveryState:undefined,articles:[{id:'article-'+i,title:'Fixture story '+i,url:'https://fixture.invalid/story/'+i,source:'Fixture feed',publishedAt:new Date().toISOString()}]}));
if(window.__readinessParams.has('different')){state.roomProfiles.push({...structuredClone(state.roomProfiles[0]),id:'other-room',name:'Other room'});state.djPlayback={...state.djPlayback,enabled:true,roomId:'other-room'};}
`;
 },transformIndexHtml(){return[{tag:'script',attrs:{type:'module',src:'/@fs/'+root+'/docs/verification/playback-progress/fixture.mjs'},injectTo:'head-prepend'}];}
},react()],server:{host:'127.0.0.1',port:5203,strictPort:true,fs:{allow:[root,modules]}}});
await server.listen();console.log('DJ readiness fixture http://127.0.0.1:5203');
