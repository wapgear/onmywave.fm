const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const Module=require('node:module');
const assert=require('node:assert/strict');
const ts=require(path.join(process.cwd(),'node_modules/typescript'));
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
let userData;
const originalLoad=Module._load;
Module._load=function(id,...args){if(id==='electron')return {app:{getPath:()=>userData},safeStorage:{}};return originalLoad.call(this,id,...args);};
const {defaultWorkflowDraft}=require(path.join(process.cwd(),'src/shared/workflow.ts'));
const storagePath=path.join(process.cwd(),'src/main/storage.ts');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'wave-workflow-'));
const results=[];
const workflow=()=>({...defaultWorkflowDraft(),newsEnabled:true,everyHours:6,importance:'relevant',maxNewsClipsPerDay:5,newsInterests:'Science',newsAssessmentDate:'2026-10-21',newsAssessmentsToday:2,newsLastRun:{requestId:'fixture-run',startedAt:'2026-10-21T12:00:00.000Z',outcome:'no-news',roomName:'Fixture room'}});
function fixture(morning,include=true){const draft=workflow();if(include)draft.morning=morning;return {preparationErrorVersion:1,djs:[],sources:[],roomProfiles:[{id:'fixture-room',name:'Fixture room',enabled:true,room:{djId:null,sourceIds:[]},mood:'Warm',workflowDraft:draft}],activeRoomProfileId:'fixture-room',workflowDraft:draft,listeningRoom:{djId:null,sourceIds:[]},vibe:'Warm',playback:null,playbackPreferences:{}};}
function open(name,data){userData=path.join(root,name);fs.mkdirSync(userData);const file=path.join(userData,'local-state.json');fs.writeFileSync(file,JSON.stringify(data),{mode:0o600});delete require.cache[storagePath];return {storage:require(storagePath),file};}
function verify(state){const draft=state.roomProfiles[0].workflowDraft;assert.equal(draft.newsEnabled,true);assert.equal(draft.everyHours,6);assert.equal(draft.maxNewsClipsPerDay,5);assert.equal(draft.newsInterests,'Science');assert.equal(draft.newsAssessmentsToday,2);assert.equal(draft.newsLastRun.requestId,'fixture-run');assert.equal(draft.newsLastRun.outcome,'no-news');assert.equal(Object.hasOwn(draft,'morning'),false);}
(async()=>{
 const valid={includeWeather:true,city:'Madrid',localTime:'08:00',timeZone:'Europe/Madrid',units:'celsius'};
 for(const [name,morning,include] of [['valid legacy weather',valid,true],['malformed legacy weather',{city:42,timeZone:'invalid'},true],['absent legacy weather',undefined,false]]){
  const {storage,file}=open(name.replaceAll(' ','-'),fixture(morning,include));const state=await storage.getLocalState();verify(state);const disk=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(Object.hasOwn(disk.roomProfiles[0].workflowDraft,'morning'),false);results.push({scenario:name,result:'news setup and history preserved; active/durable weather removed'});
 }
 const {storage,file}=open('failed-migration',fixture(valid));const original=fs.readFileSync(file,'utf8');const rename=fsp.rename;let failed=false;fsp.rename=async(from,to)=>{if(!failed&&to===file){failed=true;throw Object.assign(new Error('fixture failure'),{code:'EIO'});}return rename(from,to);};
 try{await assert.rejects(storage.getLocalState());assert.equal(fs.readFileSync(file,'utf8'),original);fsp.rename=rename;verify(await storage.getLocalState());assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(file,'utf8')).roomProfiles[0].workflowDraft,'morning'),false);results.push({scenario:'atomic migration failure then retry',result:'original file preserved; retry succeeds'});}finally{fsp.rename=rename;}
 console.log(JSON.stringify({verification:'Real workflow/storage modules and temporary filesystem; mocked Electron userData only',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
