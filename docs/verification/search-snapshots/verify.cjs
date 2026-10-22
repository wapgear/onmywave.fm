const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { JellyfinService } = require(path.join(process.cwd(), 'src/main/jellyfin.ts'));
const id = n => n.toString(16).padStart(32, '0');
let catalog = Array.from({length:240}, (_,i) => ({Id:id(i+1), Name:`Match ${String(i).padStart(3,'0')}`, Artists:['Example'], RunTimeTicks:1800000000}));
let requests = [], fail = false, blocked = null;
global.fetch = async input => {
 const url = new URL(input); requests.push(url.pathname + url.search);
 if (blocked) await blocked;
 if (fail) return new Response('', {status:500});
 let items = url.pathname.startsWith('/Artists') || url.searchParams.get('IncludeItemTypes') === 'MusicAlbum' ? [] : catalog;
 const start = Number(url.searchParams.get('StartIndex') || 0), limit = Number(url.searchParams.get('Limit') || 500);
 return Response.json({Items:items.slice(start,start+limit),TotalRecordCount:items.length});
};
const session = {serverUrl:'https://fixture.invalid',token:'fixture',userId:id(1000),userName:'review',serverVersion:'fixture',selectedLibraryIds:[id(2000)],sessionOnly:true};
const service = new JellyfinService({deviceId:'review',imageUrl:id=>id});
const reset = () => { service.restore(session); requests=[]; fail=false; blocked=null; };
const base = {search:'Match',start:0,limit:80,sort:'name'};
const results = [];
async function scenario(name, operation) { await operation(); results.push({name,result:'passed'}); }
(async()=>{
 await scenario('three pages share one exhaustive result',async()=>{
  reset(); const ids=[]; const counts=[];
  for (const start of [0,80,160]) {const before=requests.length; const page=await service.songs({...base,start}); ids.push(...page.items.map(s=>s.id)); counts.push(requests.length-before); assert.equal(page.total,240);}
  assert.equal(new Set(ids).size,240); assert.deepEqual(ids,catalog.map(s=>s.Id)); assert.deepEqual(counts,[3,0,0], 'SEARCH_SNAPSHOT_REQUEST_COUNTS'); results.push({requestCounts:counts,baselineRequestCounts:[3,3,3]});
 });
 await scenario('trimmed search shares snapshot, first page refresh observes changes',async()=>{
  const before=requests.length; await service.songs({...base,search:' Match ',start:80}); assert.equal(requests.length,before);
  catalog.push({Id:id(999),Name:'Match 999',Artists:['Example']});
  const refreshed=await service.songs(base); assert.equal(refreshed.total,241); assert.equal(requests.length,before+3); catalog.pop();
 });
 await scenario('in-flight pages share one discovery',async()=>{
  reset(); let release; blocked=new Promise(resolve=>release=resolve);
  const first=service.songs(base), second=service.songs({...base,start:80});
  release(); blocked=null; const [a,b]=await Promise.all([first,second]); assert.equal(a.items[0].id,id(1)); assert.equal(b.items[0].id,id(81)); assert.equal(requests.length,3);
 });
 await scenario('failed refresh invalidates old snapshot and permits retry',async()=>{
  reset(); await service.songs(base); fail=true; await assert.rejects(service.songs(base));
  const before=requests.length; await assert.rejects(service.songs({...base,start:80})); assert.ok(requests.length>before);
  fail=false; const page=await service.songs({...base,start:80}); assert.equal(page.items[0].id,id(81));
 });
 await scenario('session change rejects in-flight read and clears cache',async()=>{
  reset(); let release; blocked=new Promise(resolve=>release=resolve); const pending=service.songs(base); service.restore({...session,token:'replacement'}); release(); blocked=null; await assert.rejects(pending);
  const before=requests.length; await service.songs({...base,start:80}); assert.ok(requests.length>before);
 });
 await scenario('keys isolate type, filters, search, sort, direction and retain two views',async()=>{
  for (const patch of [{search:'Other'},{genre:'Rock'},{tag:'Favorite'},{sort:'artist'},{descending:true}]) {
   reset(); await service.songs(base); const before=requests.length; await service.songs({...base,...patch,start:80}); assert.ok(requests.length>before);
  }
  reset(); await service.songs(base); const before=requests.length; await service.albums({...base,start:80}); assert.ok(requests.length>before);
  reset(); for (const search of ['First','Second','Third']) await service.songs({...base,search});
  const after=requests.length; await service.songs({...base,search:'Second',start:80}); assert.equal(requests.length,after);
  await service.songs({...base,search:'First',start:80}); assert.ok(requests.length>after);
 });
 await scenario('single-library nonsearch remains paginated',async()=>{
  reset(); const page=await service.songs({...base,search:'',start:80}); assert.equal(page.items[0].id,id(81)); assert.equal(requests.length,1); assert.ok(requests[0].includes('Limit=80'));
 });
 console.log(JSON.stringify({verification:'actual JellyfinService with fixture fetch transport; no live server or provider calls',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
