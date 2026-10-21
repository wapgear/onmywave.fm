import { execFileSync, spawnSync } from 'node:child_process';
import console from 'node:console';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const gitRoot = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });

if (process.env.CI || gitRoot.status !== 0 || resolve(gitRoot.stdout.trim()) !== resolve(root)) process.exit(0);

const existing = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8' });

if (existing.stdout.trim() && existing.stdout.trim() !== '.githooks') {
  console.warn('Existing core.hooksPath preserved. Run the checks from .githooks/pre-commit in your hook.');
  process.exit(0);
}

execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { cwd: root });

console.log('Installed repository pre-commit checks.');
