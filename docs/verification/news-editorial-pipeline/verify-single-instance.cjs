const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));

const source = fs.readFileSync('src/main/index.ts', 'utf8');
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const guard = parsed.statements.find((statement) => ts.isIfStatement(statement) && statement.expression.getText(parsed).includes('app.requestSingleInstanceLock'));
assert.ok(guard, 'The production main entry must guard the shared app-data writer');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-instance-check-'));
const entry = path.join(root, 'instance.cjs');
fs.writeFileSync(entry, `const {app}=require('electron');const fs=require('node:fs');app.setPath('userData',process.argv[2]);const request=app.requestSingleInstanceLock.bind(app);app.requestSingleInstanceLock=(...args)=>{const acquired=request(...args);fs.writeFileSync(process.argv[3],JSON.stringify({acquired}));return acquired;};${guard.getText(parsed)};app.whenReady().then(()=>setInterval(()=>{},1000));`);
const children = [];
const pause = () => new Promise((resolve) => setTimeout(resolve, 50));
const launch = (name) => {
  const marker = path.join(root, `${name}.json`);
  const child = spawn(require('electron'), [entry, path.join(root, 'user-data'), marker], { env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let log = '';
  child.stderr.on('data', (value) => { log += value; });
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  return { child, marker, exited, log: () => log };
};

(async () => {
  const first = launch('first');
  const deadline = Date.now() + 20000;
  while (!fs.existsSync(first.marker) && Date.now() < deadline) await pause();
  assert.ok(fs.existsSync(first.marker), first.log() || 'First Electron process did not start');
  assert.equal(JSON.parse(fs.readFileSync(first.marker)).acquired, true);
  const second = launch('second');
  let timeout;
  const result = await Promise.race([second.exited, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Second instance did not exit')), 20000); })]).finally(() => clearTimeout(timeout));
  assert.equal(result, 0, second.log());
  assert.equal(JSON.parse(fs.readFileSync(second.marker)).acquired, false);
  const report = { verification: 'Two native Electron processes, isolated temporary userData, actual production singleton guard extracted from main entry; no window, credentials or providers.', primaryAcquired: true, secondaryRejectedAndExited: true };
  fs.writeFileSync(path.join(__dirname, 'single-instance-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  await pause();
  fs.rmSync(root, { recursive: true, force: true });
});
