export async function verifyCheckpointCoalescing() {
  const fixture = window.__fixture;
  const wait = (ms = 70) => new Promise((resolve) => setTimeout(resolve, ms));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const calls = [];
  let active = 0;
  let maxActive = 0;
  window.wave.savePlayback = (snapshot) => {
    active++;
    maxActive = Math.max(maxActive, active);
    return new Promise((resolve) => {
      calls.push({ snapshot: structuredClone(snapshot), settle(success = true) {
        active--;
        if (success) fixture.state.playback = structuredClone(snapshot);
        resolve(success ? { ok: true } : { ok: false, error: { code: 'server', message: 'Fixture disk failure' } });
      } });
    });
  };
  const volume = async (value) => { fixture.player.setVolume(value); await wait(); };
  const settle = async (at, success = true) => { calls[at].settle(success); await wait(); };
  const results = [];

  await volume(.2);
  await volume(.3);
  await volume(.4);
  check(calls.length === 1 && maxActive === 1, 'Slow writes overlap or intermediate snapshots were sent');
  await settle(0);
  check(calls.length === 2 && calls[1].snapshot.volume === .4, 'Latest pending snapshot not sent');
  await settle(1);
  results.push({ scenario: 'three changes during slow storage coalesce', sent: 2, maxActive });

  let start = calls.length;
  await volume(.5);
  await volume(.4);
  await settle(start);
  check(calls.length === start + 2 && calls.at(-1).snapshot.volume === .4, 'Saved A was dropped after active B success');
  await settle(start + 1);
  results.push({ scenario: 'saved A, active B, latest A, B succeeds', writes: 2, finalVolume: fixture.state.playback.volume });

  start = calls.length;
  await volume(.6);
  await volume(.4);
  await settle(start, false);
  check(calls.length === start + 1, 'Already durable A was rewritten after B failed');
  check(!fixture.player.error, 'Superseded failure left a stale checkpoint error');
  results.push({ scenario: 'saved A, active B, latest A, B fails', writes: 1, finalVolume: fixture.state.playback.volume });

  start = calls.length;
  await volume(.7);
  await settle(start, false);
  check(!!fixture.player.error, 'Current failed checkpoint has no visible error');
  await wait(150);
  check(calls.length === start + 1, 'Failed snapshot retried in a tight loop');
  await wait(5200);
  check(calls.length === start + 2, 'Five-second checkpoint did not retry failure');
  await settle(start + 1);
  check(!fixture.player.error, 'Successful retry did not clear checkpoint error');
  results.push({ scenario: 'failed checkpoint retries on periodic trigger', writes: 2, errorCleared: true });

  start = calls.length;
  await volume(.8);
  await volume(.81);
  await volume(.8);
  await settle(start, false);
  check(calls.length === start + 1, 'Duplicate failed active snapshot retried immediately');
  await volume(.82);
  check(calls.length === start + 2, 'New snapshot did not retry after failure');
  await settle(start + 1);
  results.push({ scenario: 'latest equals failed active snapshot', noImmediateRetry: true, newerStateSaved: true });

  fixture.player.toggle();
  await wait();
  fixture.tick(90);
  await wait(5200);
  check(calls.at(-1).snapshot.position === 90 && active === 1, 'Playing checkpoint missed live position');
  await settle(calls.length - 1);
  fixture.player.toggle();
  await wait();
  start = calls.length;
  await wait(5200);
  check(calls.length === start, 'Paused unchanged snapshot wrote again');
  results.push({ scenario: 'playing position checkpoints, paused duplicates skip', position: 90, pausedWrites: 0 });

  start = calls.length;
  await volume(.83);
  await volume(.84);
  fixture.tick(95);
  window.dispatchEvent(new Event('beforeunload'));
  await wait();
  check(calls.length === start + 2 && active === 2, 'Unload did not force latest bounded final dispatch');
  check(calls.at(-1).snapshot.position === 95 && calls.at(-1).snapshot.volume === .84, 'Unload sent stale snapshot');
  await settle(start);
  check(calls.length === start + 2, 'Older pending snapshot drained after unload');
  await settle(start + 1);
  check(fixture.state.playback.position === 95 && fixture.state.playback.volume === .84, 'Newest unload snapshot not final');
  results.push({ scenario: 'unload force dispatches newest and drops older pending', finalPosition: 95, finalVolume: .84, maxNormalActive: 1, shutdownActive: 2 });
  return { verification: 'Actual renderer with controlled asynchronous fixture savePlayback IPC', results };
}
