import { spawn } from 'node:child_process';
import console from 'node:console';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

const mode = process.argv[2];

if (!['services', 'player'].includes(mode)) throw new Error('Use verify-behavior.mjs services|player');

const directory = process.env.WAVE_VERIFICATION_OUTPUT ?? path.join(os.tmpdir(), 'wave-behavior');

await mkdir(directory, { recursive: true });

const results = [];

async function run(name, executable, args, expectAssertion = false) {
  const started = Date.now();
  let stdout = '';
  let stderr = '';
  let spawnError;
  const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    process.stderr.write(chunk);
  });
  child.once('error', (error) => {
    spawnError = error.message;
  });
  const timer = setTimeout(() => child.kill('SIGTERM'), 240_000);
  let code;
  try {
    code = await new Promise((resolve) => {
      child.once('close', resolve);
    });
  } finally {
    clearTimeout(timer);
    await writeFile(path.join(directory, `${name}.log`), stdout + '\n' + stderr + (spawnError ?? ''));
  }
  const passed = expectAssertion
    ? !spawnError &&
      code !== 0 &&
      code !== null &&
      stderr.includes('ERR_ASSERTION') &&
      stderr.includes('SEARCH_SNAPSHOT_REQUEST_COUNTS')
    : !spawnError && code === 0;
  results.push({
    name,
    passed,
    exitCode: code,
    durationMs: Date.now() - started,
    expectedMutationFailure: expectAssertion,
    ...(spawnError ? { spawnError } : {}),
  });
  if (!passed) throw new Error(`${name} failed. See ${directory}/${name}.log`);
}

try {
  if (mode === 'services') {
    await run('search-snapshots', process.execPath, ['docs/verification/search-snapshots/verify.cjs']);
    await run(
      'search-cache-mutation',
      process.execPath,
      [
        '--require',
        './docs/verification/search-snapshots/mutate-cache.cjs',
        'docs/verification/search-snapshots/verify.cjs',
      ],
      true,
    );
    await run('prepared-news-delivery', process.execPath, ['docs/verification/prepared-news-delivery/verify.cjs']);
    await run('playback-storage', process.execPath, ['docs/verification/critical-playback/verify-storage.cjs']);
  } else {
    await run('player', process.execPath, ['docs/verification/critical-playback/verify.cjs']);
    await run('player-build', 'pnpm', ['run', 'build']);
    await run('player-relaunch', process.execPath, ['docs/verification/playback-relaunch/verify.mjs']);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(directory, `${mode}-summary.json`), JSON.stringify({ mode, results }, null, 2) + '\n');
}
