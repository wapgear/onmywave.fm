import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const baseline = process.env.QUEUE_BASELINE === '1';
const port = baseline ? 5202 : 5201;
const modules = realpathSync(root + '/node_modules');
const { createServer } = await import(pathToFileURL(modules + '/vite/dist/node/index.js'));
const { default: react } = await import(pathToFileURL(modules + '/@vitejs/plugin-react/dist/index.js'));
const { default: ts } = await import(pathToFileURL(modules + '/typescript/lib/typescript.js'));
const server = await createServer({
  root: root + '/src/renderer', configFile: false,
  plugins: [{
    name: 'queue-fixture', enforce: 'pre',
    transform(source, id) {
      if (baseline && ['/src/renderer/components/Queue/Queue.component.tsx', '/src/renderer/components/Drawer/Drawer.styles.css'].some(file => id.endsWith(file))) {
        return execFileSync('git', ['show', '5a47954c8f40d8aa3af6a6c4e02c72a4197a0be2:' + id.slice(root.length + 1)], {encoding:'utf8'});
      }
      if (id.endsWith('/docs/verification/playback-progress/fixture.mjs'))
        return 'import "/@fs/' + root + '/docs/verification/virtual-queue/seed.mjs";\n' + source.replaceAll('__FIXTURE_ROOT__', root);
      if (!id.endsWith('/src/renderer/player.tsx')) return;
      const parsed = ts.createSourceFile(id, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      let position;
      function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'usePlayer') {
          position = node.body.statements.find(ts.isReturnStatement)?.getStart(parsed);
        }
        ts.forEachChild(node, visit);
      }
      visit(parsed);
      if (position) source = source.slice(0, position) + 'window.__fixture.player=value;\n' + source.slice(position);
      return source;
    },
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { type: 'module', src: '/@fs/' + root + '/docs/verification/playback-progress/fixture.mjs' }, injectTo: 'head-prepend' }];
    },
  }, react()],
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, modules] } },
});
await server.listen();
console.log('Queue fixture http://127.0.0.1:' + port);
