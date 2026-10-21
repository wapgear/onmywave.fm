import { defaultDJPlaybackSettings } from '/@fs/__FIXTURE_ROOT__/src/shared/dj-playback.ts';
import { defaultNewsTransitionSettings } from '/@fs/__FIXTURE_ROOT__/src/shared/news-transitions.ts';
import { defaultWorkflowDraft } from '/@fs/__FIXTURE_ROOT__/src/shared/workflow.ts';
const ok=value=>Promise.resolve({ok:true,value});
const songs=Array.from({length:120},(_,i)=>({id:String(i+1).padStart(32,'0'),name:`Evening track ${String(i+1).padStart(3,'0')}`,artists:['Fixture artist'],album:'Listening session',duration:180,genres:['Electronic'],tags:[]}));
const connection={id:'fixture-session',authRevision:1,serverUrl:'https://fixture.invalid',serverVersion:'fixture',userName:'Fixture listener',selectedLibraryIds:['fixture-library'],sessionOnly:true};
const state={preparationErrorVersion:1,revision:1,djPlayback:defaultDJPlaybackSettings(),newsTransitions:defaultNewsTransitionSettings(),roomProfiles:[{id:'default-room',name:'My room',enabled:true,room:{djId:null,sourceIds:[]},mood:'',workflowDraft:defaultWorkflowDraft()}],activeRoomProfileId:'default-room',djs:[],sources:[],listeningRoom:{djId:null,sourceIds:[]},vibe:'',workflowDraft:defaultWorkflowDraft(),playback:null,playbackPreferences:{}};
if(window.__fixtureSeed?.playback)state.playback=window.__fixtureSeed.playback;
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
const bridge={
 getConnection:()=>ok(connection),getLocalState:()=>ok(structuredClone(state)),getPlaybackPreferences:()=>ok({volume:.75,shuffle:false,repeat:'off'}),getNewsRecoveryStatus:()=>ok({phase:'ready'}),getUpdateStatus:()=>ok({phase:'unsupported',currentVersion:'fixture'}),
 songs:q=>ok({items:songs.slice(q.start,q.start+q.limit),total:songs.length,start:q.start}),libraryFilters:()=>ok({genres:['Electronic'],tags:[]}),song:id=>ok(songs.find(s=>s.id===id)),
 albums:q=>ok({items:[],total:0,start:q.start}),playlists:()=>ok({items:[],recovery:[]}),getPreparedNews:()=>ok({scripts:[],takes:[],requests:[],reviewedArticles:[]}),
 preparePlayback:input=>{window.__fixture.calls.push({method:'preparePlayback',input});return ok({url:'/fixture-audio/'+input.id,offsetSeconds:input.transcode?(input.offsetSeconds??0):0,transcoded:!!input.transcode});},
 savePlayback:snapshot=>{state.playback=snapshot;window.__fixture.checkpoints.push(structuredClone(snapshot));return ok();},savePlaybackPreferences:()=>ok(true),
 lyrics:()=>ok({lines:[{text:'The first line',start:0},{text:'The second line',start:10},{text:'The third line',start:20}],synced:true}),
 onNewsProgress:()=>()=>{},onUpdateStatus:()=>()=>{},
};
window.wave=new Proxy(bridge,{get(target,name){if(name in target)return target[name];return (...args)=>{window.__fixture.calls.push({method:name,args});return ok(null);};}});
