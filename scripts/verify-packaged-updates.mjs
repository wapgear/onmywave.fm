import assert from 'node:assert/strict';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

import { load } from 'js-yaml';

const appPath = process.argv[2];

assert.ok(appPath, 'Usage: node scripts/verify-packaged-updates.mjs path/to/onmywave.fm.app');

const { build } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const configPath = path.join(appPath, 'Contents', 'Resources', 'app-update.yml');

const config = load(await readFile(configPath, 'utf8'));

assert.ok(config && typeof config === 'object', `Invalid updater configuration: ${configPath}`);

for (const key of ['provider', 'owner', 'repo']) {
  assert.equal(config[key], build.publish[key], `Incorrect updater ${key}: ${configPath}`);
}

assert.ok(
  typeof config.updaterCacheDirName === 'string' && config.updaterCacheDirName.trim(),
  `Missing updater cache directory: ${configPath}`,
);

console.log(`Verified packaged updater configuration: ${configPath}`);
