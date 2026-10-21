const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const directories = ['src/renderer', 'src/main'].map((root) => fs.mkdtempSync(path.join(root, 'quality-review-')));
const renderer = path.join(directories[0], 'Fixture.tsx');
const main = path.join(directories[1], 'fixture.ts');
const results = [];
function run(args) {
  const result = spawnSync('pnpm', ['exec', ...args], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}
function rejects(file, source, diagnostic) {
  fs.writeFileSync(file, source);
  const result = run(['oxlint', '--type-aware', '--max-warnings=0', file]);
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, diagnostic);
  results.push(`Rejected ${diagnostic.source}`);
}
try {
  fs.writeFileSync(renderer, 'export type FixtureProps={label:string;description?:{introduction:string;explanation:string;conclusion:string}};export function Fixture({label}:FixtureProps){return <span>{label}</span>}');
  assert.notEqual(run(['oxfmt', '--check', renderer]).status, 0);
  assert.equal(run(['oxfmt', '--write', renderer]).status, 0);
  assert.equal(run(['oxlint', '--fix', '--config', '.oxlint-format.json', renderer]).status, 0);
  assert.equal(run(['oxfmt', '--check', renderer]).status, 0);
  assert.match(fs.readFileSync(renderer, 'utf8'), /export type FixtureProps = \{\n/);
  const positive = run(['oxlint', '--type-aware', '--max-warnings=0', renderer]);
  assert.equal(positive.status, 0, positive.output);
  results.push('Real formatting error rejected; formatted local multiline exported props accepted');
  rejects(renderer, "export async function Fixture() { return import('node:fs'); }", /renderer-dynamic-imports/);
  rejects(renderer, "import { useState } from 'react';\nexport function Fixture({ flag }: { flag: boolean }) { if (flag) { const [value] = useState(0); return <span>{value}</span>; } return null; }", /rules-of-hooks/);
  rejects(renderer, "export function Fixture() { return <div dangerouslySetInnerHTML={{ __html: 'untrusted' }} />; }", /no-danger/);
  rejects(main, "export function fixture(ipc: { sendSync(channel: string): unknown }) { return ipc.sendSync('fixture'); }", /synchronous-ipc/);
  rejects(main, 'export const fixture = { webPreferences: { nodeIntegration: true } };', /unsafe-electron-options/);
  console.log(JSON.stringify({ results }, null, 2));
} finally {
  for (const directory of directories) fs.rmSync(directory, { recursive: true, force: true });
}
