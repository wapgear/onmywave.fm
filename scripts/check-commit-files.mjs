import { execFileSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';

const args = process.argv.slice(2);

if (args.length > 1 || (args.length === 1 && args[0] !== '--tracked')) {
  console.error('Usage: node scripts/check-commit-files.mjs [--tracked]');
  process.exit(1);
}

const files = execFileSync(
  'git',
  args[0] === '--tracked' ? ['ls-files', '-z'] : ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);

const blocked = files.filter((file) => {
  const name = file.split('/').at(-1);
  if (/^\.env\.(example|sample|template)$/.test(name)) return false;
  return (
    /^\.env($|\.)/.test(name) ||
    /\.(pem|key|p12|pfx)$/i.test(name) ||
    /^(id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials\.json|service-account\.json)$/i.test(name) ||
    /^(node_modules|out|release|coverage)\//.test(file)
  );
});

if (blocked.length) {
  console.error('Do not commit credentials, private keys, or generated output:\n' + blocked.join('\n'));
  process.exit(1);
}
