import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { format } from 'oxfmt';
import ts from 'typescript';


const result = spawnSync(process.execPath, ['node_modules/oxfmt/bin/oxfmt', '--list-different', '.'], {
  encoding: 'utf8',
});

if (result.error) throw result.error;

if (result.stderr) process.stderr.write(result.stderr);

if (result.status !== 0 && result.status !== 1) process.exit(result.status ?? 1);

const options = JSON.parse(await readFile('.oxfmtrc.json', 'utf8'));

delete options.$schema;

delete options.ignorePatterns;

const different = result.stdout.trim().split('\n').filter(Boolean);

let failures = 0;

for (const file of different) {
  const source = await readFile(file, 'utf8');
  let normalized = source;
  if (/\.(?:[cm]?js|tsx?)$/.test(file)) {
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const lastImport = parsed.statements.filter(ts.isImportDeclaration).at(-1);
    if (lastImport) {
      // Oxfmt allows one blank line; Oxlint checks our exact two-line import gap.
      const end = lastImport.end;
      normalized = source.slice(0, end) + source.slice(end).replace(/^(\s*?\n)\n\n/, '$1\n');
    }
  }
  const formatted = await format(file, normalized, options);
  if (formatted.errors.length || formatted.code !== normalized) {
    console.error(`${file}: run npm run format`);
    failures++;
  }
}

if (failures) process.exit(1);

console.log('Oxfmt formatting checked; import spacing is checked by Oxlint.');
