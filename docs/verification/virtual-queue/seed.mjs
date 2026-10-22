const params = new URLSearchParams(location.search);
window.__fixtureSeed = {
  playback: {
    connectionId: 'fixture-session',
    trackIds: Array.from({ length: 10000 }, (_, i) => String(i % 120 + 1).padStart(32, '0')),
    currentIndex: params.has('history') ? 9000 : 0,
    position: 30,
    volume: .75,
    shuffle: false,
    repeat: 'off',
  },
  dj: true,
  availableTakes: 3,
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
    output.textContent = JSON.stringify({
      opens, queueLength: player.queue.length, currentId: player.current?.id,
      playing: player.playing, requestedPlaying: player.requestedPlaying,
      completedSongs: player.completedSongs, newsPhase: player.newsPhase,
      position: fixture.audios.find(audio => audio.src.startsWith('/fixture-audio'))?.currentTime,
      callCounts: Object.fromEntries([...new Set(fixture.calls.map(call => call.method))].map(name => [name, fixture.calls.filter(call => call.method === name).length])),
    });
  }, 100);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  if (params.has('tools')) {
    const controls = document.createElement('aside');
    controls.style = 'position:fixed;top:0;left:220px;z-index:10000;display:flex;gap:8px';
    for (const [name, action] of [
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
