import { defaultDJPlaybackSettings } from '/@fs/__FIXTURE_ROOT__/src/shared/dj-playback.ts';
import { defaultNewsTransitionSettings } from '/@fs/__FIXTURE_ROOT__/src/shared/news-transitions.ts';
import { defaultWorkflowDraft } from '/@fs/__FIXTURE_ROOT__/src/shared/workflow.ts';
const ok=value=>Promise.resolve({ok:true,value});
const songs=Array.from({length:120},(_,i)=>({id:String(i+1).padStart(32,'0'),name:`Evening track ${String(i+1).padStart(3,'0')}`,artists:['Fixture artist'],album:'Listening session',duration:180,genres:['Electronic'],tags:[]}));
const connection={id:'fixture-session',authRevision:1,serverUrl:'https://fixture.invalid',serverVersion:'fixture',userName:'Fixture listener',selectedLibraryIds:['fixture-library'],sessionOnly:true};
const state={preparationErrorVersion:1,revision:1,djPlayback:defaultDJPlaybackSettings(),newsTransitions:defaultNewsTransitionSettings(),roomProfiles:[{id:'default-room',name:'My room',enabled:true,room:{djId:null,sourceIds:[]},mood:'',workflowDraft:defaultWorkflowDraft()}],activeRoomProfileId:'default-room',djs:[],sources:[],playback:null,playbackPreferences:{}};
if(window.__fixtureSeed?.playback)state.playback=window.__fixtureSeed.playback;
if(window.__fixtureSeed?.dj){
 const dj={id:'fixture-dj',name:'Fixture DJ',description:'Fixture host',instructions:'Read the news',musicPreferences:'',exclusions:'',language:'English',personality:'Warm',speakingFrequency:'often',news:{feedUrls:[],interests:'',minStories:1,maxStories:1,voice:'fixture',textModel:'fixture',speechEngine:'elevenlabs-v4',duckVolume:.05}};
 state.djs=[dj];state.sources=[{id:'fixture-source',name:'Fixture feed',url:'https://fixture.invalid/feed',kind:'rss'}];
 state.roomProfiles[0].room={djId:dj.id,sourceIds:['fixture-source']};state.roomProfiles[0].mood='Warm';
 state.djPlayback={...state.djPlayback,enabled:true,roomId:'default-room',everySongs:window.__fixtureSeed.everySongs??1};
 Object.assign(state.newsTransitions,{mode:'between-songs',fadeOutSeconds:0,leadInSeconds:0,postSpeechSeconds:0,fadeInSeconds:0});
}
if(window.__fixtureSeed?.state)Object.assign(state,window.__fixtureSeed.state);
window.__renders={};
window.__fixture={songs,state,connection,audios:[],calls:[],checkpoints:[],intervals:[],tick(position){const audio=this.audios.find(a=>a.src.startsWith('/fixture-audio'));if(!audio)throw Error('No audio loaded');audio.currentTime=position;audio.emit('timeupdate');},counts(){return {...window.__renders};}};
const nativeInterval=window.setInterval.bind(window), nativeClearInterval=window.clearInterval.bind(window);
window.setInterval=(handler,delay,...args)=>{const record={delay,calls:0,active:true,id:null};const id=nativeInterval(()=>{record.calls++;handler(...args);},delay);record.id=id;window.__fixture.intervals.push(record);return id;};
window.clearInterval=id=>{const record=window.__fixture.intervals.find(r=>r.id===id&&r.active);if(record)record.active=false;nativeClearInterval(id);};
class FixtureAudio extends EventTarget {
 constructor(){super();this.src='';this.currentTime=0;this.duration=180;this.readyState=4;this.paused=true;this.ended=false;this.volume=1;this.seekable={length:1,start:()=>0,end:()=>180};window.__fixture.audios.push(this);}
 get currentSrc(){return this.src;}
 emit(name){const event=new Event(name);this['on'+name]?.(event);this.dispatchEvent(event);}
 play(){this.paused=false;this.ended=false;this.emit('play');this.emit('playing');return Promise.resolve();}
 pause(){if(!this.paused){this.paused=true;this.emit('pause');}}
 load(){if(this.src)queueMicrotask(()=>{this.emit('loadedmetadata');this.emit('canplay');});}
 removeAttribute(name){if(name==='src'){this.src='';this.currentTime=0;}}
}
window.Audio=FixtureAudio;
const takes=Array.from({length:window.__fixtureSeed?.availableTakes??0},(_,i)=>({id:'fixture-take-'+i,requestId:'fixture-request-'+i,audioUrl:location.origin+'/fixture-speech-'+i,engine:'elevenlabs-v4',createdAt:'2026-10-21T15:00:00.000Z',script:'Fixture news '+i,articles:[],warnings:[],signature:'fixture-'+i,provenance:{dj:state.djs[0],mood:'Warm',sources:state.sources},renderingDJ:state.djs[0],available:true,byteLength:100,model:'fixture',voice:'fixture',delivery:'Fixture',scriptId:'script-'+i,deliveryState:{status:'claimed',claimId:'claim-'+i}}));
window.__fixture.takes=takes;
const bridge={
 platform:window.__fixtureSeed?.platform??'darwin',setTitleBarTheme:theme=>{window.__fixture.titleBarTheme=theme;return ok();},
 libraries:()=>ok([{id:'fixture-library',name:'Fixture library'}]),getAiStatus:()=>ok({configured:false}),getElevenLabsStatus:()=>ok({configured:false}),
 getConnection:()=>ok(connection),getLocalState:()=>ok(structuredClone(state)),getPlaybackPreferences:()=>ok({volume:.75,shuffle:false,repeat:'off'}),getNewsRecoveryStatus:()=>ok({phase:window.__fixture.recoveryPhase??'ready'}),getUpdateStatus:()=>ok({phase:'unsupported',currentVersion:'fixture'}),
 songs:q=>ok({items:songs.slice(q.start,q.start+q.limit),total:songs.length,start:q.start}),libraryFilters:()=>ok({genres:['Electronic'],tags:[]}),song:id=>ok(songs.find(s=>s.id===id)),
 albums:q=>ok({items:[],total:0,start:q.start}),playlists:()=>ok({items:[],recovery:[]}),getPreparedNews:()=>ok({scripts:[],takes:[],requests:[],reviewedArticles:[]}),
 preparePlayback:input=>{window.__fixture.calls.push({method:'preparePlayback',input});return ok({url:'/fixture-audio/'+input.id,offsetSeconds:input.transcode?(input.offsetSeconds??0):0,transcoded:!!input.transcode});},
 savePlayback:snapshot=>{state.playback=snapshot;window.__fixture.checkpoints.push(structuredClone(snapshot));return ok();},savePlaybackPreferences:()=>ok(true),
 lyrics:()=>ok({lines:[{text:'The first line',start:0},{text:'The second line',start:10},{text:'The third line',start:20}],synced:true}),
 nextRoomNews:async input=>{window.__fixture.calls.push({method:'nextRoomNews',input});if(window.__fixture.poolGate)await window.__fixture.poolGate;if(window.__fixture.failPool)return {ok:false,error:{code:'offline',message:'Fixture pool unavailable'}};return ok(takes.shift()??null);},
 claimPreparedNews:input=>ok({id:input.id,deliveryState:{status:'claimed',claimId:input.claimId??'fixture-claim'}}),
 startPreparedNews:input=>{window.__fixture.calls.push({method:'startPreparedNews',input});return ok();},
 markPreparedNewsPlayed:input=>{window.__fixture.calls.push({method:'markPreparedNewsPlayed',input});return ok();},
 releasePreparedNews:input=>{window.__fixture.calls.push({method:'releasePreparedNews',input});return ok();},
 saveDJPlayback:async patch=>{window.__fixture.calls.push({method:'saveDJPlayback',patch});if(window.__fixture.saveDJGate)await window.__fixture.saveDJGate;state.djPlayback={...state.djPlayback,...patch};state.revision++;return ok(structuredClone(state));},
 onNewsProgress:()=>()=>{},onUpdateStatus:()=>()=>{},onPlaybackCheckpointRequest:()=>()=>{},flushPlaybackCheckpoint:()=>ok(),
};
window.wave=new Proxy(bridge,{get(target,name){if(name in target)return target[name];return (...args)=>{window.__fixture.calls.push({method:name,args});return ok(null);};}});
