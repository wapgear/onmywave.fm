const waitFor = async (predicate, message, timeout = 12_000) => {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(message);
};

window.__playbackRelaunch.ready = waitFor(
  () => {
    const player = window.__playbackRelaunch.player;
    return player?.current && !player.busy && window.__playbackRelaunch.audios.some((audio) => audio.src.startsWith('wave-media://audio/'));
  },
  'Actual PlayerProvider did not restore the persisted session.',
);
