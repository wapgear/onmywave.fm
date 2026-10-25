import { spawnSync } from 'node:child_process';
import * as console from 'node:console';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

const output = resolve(root, 'release/windows');

const installerName = `onmywave-${packageJson.version}-windows-x64.exe`;

const sourceName = `onmywave-${packageJson.version}-windows-source.tar.gz`;

const installer = resolve(output, installerName);

const source = resolve(output, sourceName);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

await mkdir(output, { recursive: true });

const args = process.argv.slice(2);

const skipCheck =
  args.length === 1 ? args[0] === '--skip-check' : args.length === 2 && args[0] === '--' && args[1] === '--skip-check';

if (args.length && !skipCheck) throw new Error('Usage: pnpm run release:windows [-- --skip-check]');

const pnpm = process.env.npm_execpath ? process.execPath : 'pnpm';

const pnpmArgs = process.env.npm_execpath ? [process.env.npm_execpath] : [];

if (!skipCheck) run(pnpm, [...pnpmArgs, 'run', 'check']);

run(pnpm, [
  ...pnpmArgs,
  'exec',
  'electron-builder',
  '--config',
  'electron-builder.windows.mjs',
  '--win',
  'nsis',
  '--x64',
  '--publish',
  'never',
]);

const installerStat = await stat(installer);

if (!installerStat.isFile() || installerStat.size < 1_000_000)
  throw new Error(`Missing or unexpectedly small installer: ${installer}`);

run('tar', [
  '-czf',
  source,
  '--exclude=.git',
  '--exclude=node_modules',
  '--exclude=release',
  '--exclude=out',
  '--exclude=.env*',
  'src',
  'resources',
  'licenses',
  'scripts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'electron.vite.config.ts',
  'electron-builder.windows.mjs',
  'tsconfig.json',
  '.oxlint-format.json',
  '.oxfmtrc.json',
  '.oxlintrc.json',
  '.nvmrc',
  '.gitattributes',
  'AGENTS.md',
  'README.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
]);

const entries = [];

for (const path of [installer, source]) {
  const name = path.slice(output.length + 1);
  entries.push(`${await sha256(path)}  ${name}`);
}

const checksumPath = resolve(output, 'SHA256SUMS.txt');

await writeFile(checksumPath, `${entries.join('\n')}\n`);

const checksums = await readFile(checksumPath, 'utf8');

if (checksums !== `${entries.join('\n')}\n`) throw new Error('Checksum file does not match generated artifacts.');

for (const entry of entries) {
  const [expected, name] = entry.split(/\s+/);
  if ((await sha256(resolve(output, name))) !== expected) throw new Error(`Checksum verification failed: ${name}`);
}

console.log(`Verified unsigned Windows installer and source archive in ${output}`);
