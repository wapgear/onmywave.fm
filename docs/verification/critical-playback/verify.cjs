const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = process.cwd();
const electron = require('electron');
const runner = path.join(root, 'docs/verification/critical-playback/server.mjs');
const mutations = [
  ['restore-position', 'restore-position'],
  ['resume-on-restore', 'restore-paused'],
  ['duplicate-key', 'duplicate-key'],
  ['natural-end', 'natural-end'],
  ['repeat-shuffle', 'repeat-shuffle'],
  ['suppress-release', 'news-release'],
];

function run(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(electron, [runner], { cwd: root, env: { ...process.env, ...env } });
    let output = '';
    let timedOut = false;
    let killTimer;
    const terminate = () => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 2000);
      killTimer.unref();
    };
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      process.removeListener('SIGTERM', terminate);
      process.removeListener('SIGINT', terminate);
    };
    process.once('SIGTERM', terminate);
    process.once('SIGINT', terminate);
    const capture = (chunk) => {
      output += chunk.toString();
      process.stdout.write(chunk);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, 90_000);
    child.on('error', (error) => {
      cleanup();
      reject(error);
    });
    child.on('close', (code, signal) => {
      cleanup();
      if (timedOut) reject(new Error(`Electron run timed out after 90 seconds (signal ${signal})\n${output}`));
      else if (code !== 0) reject(new Error(`Electron verifier exited ${code} (signal ${signal})\n${output}`));
      else resolve(output);
    });
  });
}

(async () => {
  const baseline = await run();
  assert.match(baseline, /CRITICAL_PLAYBACK_WINDOW_READY/);
  assert.match(baseline, /CRITICAL_PLAYBACK_DONE/);
  for (const [mutation, assertion] of mutations) {
    const output = await run({ WAVE_MUTATION: mutation, WAVE_EXPECT_ASSERTION: assertion });
    assert.match(output, /CRITICAL_PLAYBACK_WINDOW_READY/, `${mutation} must reach the renderer`);
    assert.match(
      output,
      new RegExp(`"mutation":"${mutation}","detected":true`),
      `${mutation} must fail its behavior assertion`,
    );
  }
  console.log(
    JSON.stringify(
      {
        verification:
          'Actual renderer player/hooks in a hidden secure Electron BrowserWindow with fake window.wave and audio; no external services',
        baseline: 'passed',
        mutationsDetected: mutations.map(([mutation]) => mutation),
        limitation:
          'The renderer fixture bypasses production preload and main IPC; verify-storage.cjs separately checks durable snapshot file roundtrip.',
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
