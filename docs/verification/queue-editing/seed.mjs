const params = new URLSearchParams(location.search);
const storageKey = 'queue-editing:' + location.search;
const ids = params.has('empty') ? [] : params.has('large') || params.has('history')
  ? Array.from({ length: 10000 }, (_, i) => i % 120 + 1) : [1, 2, 1, 3, 4, 2, 5, 6];
window.__fixtureSeed = {
  playback: JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') ?? {
    connectionId: 'fixture-session',
    trackIds: ids.map(id => String(id).padStart(32, '0')),
    currentIndex: (params.has('forward-history') || params.has('current-repeat')) ? 1 : params.has('history') ? 9000 : 0,
    position: 30,
    volume: .75,
    shuffle: params.has('shuffle') || params.has('forward-history') || params.has('current-repeat'),
    repeat: params.has('repeat-all') ? 'all' : params.has('repeat-one') ? 'one' : 'off',
    ...(params.has('current-repeat') ? {shufflePlan:{upcoming:[3,4,5,6,7],history:[0,1,1,2,1],cursor:1,visited:[0,1,2]}} : {}),
    ...(params.has('forward-history') ? {shufflePlan:{upcoming:[3,4,5,6,7],history:[0,1,0,2,0],cursor:1,visited:[0,1,2]}} : {}),
  },
  dj: params.has('dj'),
  availableTakes: 3,
  everySongs: 3,
};

// Fixture-only observability and controls; none of this enters the production bundle.
let openingStart = null;
const opens = [];
document.addEventListener('click', event => {
  if (event.target.closest('button[aria-label^="Show queue,"]')) openingStart = performance.now();
}, true);
new MutationObserver(() => {
  if (openingStart !== null && document.querySelector('.queue-content')) {
    opens.push(performance.now() - openingStart);
    openingStart = null;
  }
}).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', () => {
  const output = document.createElement('output');
  output.id = 'queue-fixture-status';
  output.hidden = true;
  document.body.append(output);
  const timer = setInterval(() => {
    const fixture = window.__fixture;
    const player = fixture?.player;
    if (!player) return;
    const entry = entry => ({key:entry.key,id:entry.song.id,upcomingId:entry.upcomingId,historyIndex:entry.historyIndex});
    const large = player.queue.length > 100;
    const currentIndex = player.queue.findIndex(item=>item.key===player.currentKey);
    const future = player.shuffle ? player.upcomingQueue : player.queue.slice(currentIndex+1);
    output.textContent = JSON.stringify({
      opens, queueLength: player.queue.length, queue: large ? undefined : player.queue.map(entry), queueHead:player.queue.slice(0,12).map(entry),queueTail:player.queue.slice(-12).map(entry),currentKey: player.currentKey, currentId: player.current?.id,
      currentIndex,upcoming:large?undefined:future.map(entry),upcomingCount:future.length,upcomingHead:future.slice(0,12).map(entry),upcomingTail:future.slice(-12).map(entry),shuffleRemaining:player.shuffleRemaining,shuffle:player.shuffle,repeat:player.repeat,
      playing: player.playing, requestedPlaying: player.requestedPlaying,
      completedSongs: player.completedSongs, newsPhase: player.newsPhase,
      position: fixture.audios.find(audio => audio.src.startsWith('/fixture-audio'))?.currentTime,
      lastSnapshot:large?undefined:fixture.checkpoints.at(-1),
      audioCount:fixture.audios.length,
      callCounts: Object.fromEntries([...new Set(fixture.calls.map(call => call.method))].map(name => [name, fixture.calls.filter(call => call.method === name).length])),
    });
  }, 100);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  if (params.has('tools')) {
    const controls = document.createElement('aside');
    controls.style = 'position:fixed;top:0;left:220px;z-index:10000;display:flex;gap:8px';
    for (const [name, action] of [
      ['Fixture: reset', () => {sessionStorage.removeItem(storageKey);location.reload();}],
      ['Fixture: advance ten', () => {const audio=window.__fixture.audios.find(audio=>audio.src.startsWith('/fixture-audio'));window.__fixture.tick(audio.currentTime+10);}],
      ['Fixture: schedule news', () => {const f=window.__fixture;f.player.scheduleNews(f.takes[0],.05).catch(error=>{output.textContent=JSON.stringify({fixtureError:error.message});});}],
      ['Fixture: finish song', () => {
        const audio = window.__fixture.audios.find(audio => audio.src.startsWith('/fixture-audio'));
        audio.currentTime = audio.duration; audio.ended = true; audio.emit('timeupdate'); audio.emit('ended');
      }],
      ['Fixture: finish speech', () => {
        const audio = window.__fixture.audios.find(audio => audio.src.includes('/fixture-speech'));
        audio.currentTime = audio.duration; audio.ended = true; audio.emit('ended');
      }],
    ]) {
      const button = document.createElement('button'); button.textContent = name; button.onclick = action; controls.append(button);
    }
    document.body.append(controls);
  }
});
