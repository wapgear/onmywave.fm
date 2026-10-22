import { defaultDJPlaybackSettings } from '/@fs/__FIXTURE_ROOT__/src/shared/dj-playback.ts';
const params = new URLSearchParams(location.search);
window.__readinessParams = params;
window.__fixtureSeed = {
  playback: {connectionId:'fixture-session',trackIds:['1'.padStart(32,'0'),'2'.padStart(32,'0')],currentIndex:0,position:30,volume:.75,shuffle:false,repeat:'off'},
  ...(params.has('saved') || params.has('different') || params.has('unconfirmed') || params.has('setup') ? {dj:true,availableTakes:params.has('setup')?0:3,state:{djPlayback:{...defaultDJPlaybackSettings(),roomId:'default-room',enabled:false}}}:{}),
};
window.addEventListener('DOMContentLoaded',()=>{
 const output=document.createElement('output');output.id='readiness-fixture-status';output.hidden=true;document.body.append(output);
 const timer=setInterval(()=>{const f=window.__fixture;if(f)output.textContent=JSON.stringify({state:f.state,calls:f.calls.map(x=>x.method),checkpoints:f.checkpoints.length});},100);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
});
