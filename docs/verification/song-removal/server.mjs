import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modules = realpathSync(root + '/node_modules');
const { createServer } = await import(pathToFileURL(modules + '/vite/dist/node/index.js'));
const { default: react } = await import(pathToFileURL(modules + '/@vitejs/plugin-react/dist/index.js'));
const server = await createServer({
  root: root + '/src/renderer',
  configFile: false,
  plugins: [{
    name: 'song-removal-fixture',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/docs/verification/playback-progress/fixture.mjs')) return;
      source = source.replaceAll('__FIXTURE_ROOT__', root);
      const position = source.indexOf('window.wave=new Proxy');
      const setup = `
const removalKey = 'song-removal:' + location.search;
let removals = JSON.parse(sessionStorage.getItem(removalKey) ?? '[]');
const visible = () => songs.filter(song => !removals.some(item => item.songId === song.id));
Object.assign(bridge, {
  songs: q => ok({items: visible().slice(q.start, q.start + q.limit), total: visible().length, start: q.start}),
  removeSong: id => {
    if (window.__fixture.failRemoval) return Promise.resolve({ok:false,error:{code:'server',message:'The local removal record could not be saved.'}});
    let record = removals.find(item => item.songId === id);
    if (!record) {
      record = {songId: id, removedAt: new Date().toISOString(), purgeAfter: null};
      removals.push(record);
      sessionStorage.setItem(removalKey, JSON.stringify(removals));
    }
    return ok(record);
  },
  removedSongs: () => {
    if (window.__fixture.removalOnline) {
      removals = removals.map(item => ({...item, purgeAfter: item.purgeAfter ?? new Date(Date.now()+7*86400000).toISOString()}));
      sessionStorage.setItem(removalKey, JSON.stringify(removals));
    }
    return ok({songs:removals,pending:removals.filter(item => item.purgeAfter === null).length});
  },
});
`;
      return 'import "/@fs/' + root + '/docs/verification/queue-editing/seed.mjs";\n' + source.slice(0, position) + setup + source.slice(position);
    },
    transformIndexHtml() {
      return [{tag: 'script', attrs: {type: 'module', src: '/@fs/' + root + '/docs/verification/playback-progress/fixture.mjs'}, injectTo: 'head-prepend'}];
    },
  }, react()],
  server: {host: '127.0.0.1', port: 5207, strictPort: true, fs: {allow: [root, modules]}},
});

await server.listen();
console.log('Song removal fixture http://127.0.0.1:5207/?case=soft-remove');
