import { realpathSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const port = Number(process.env.PORT || 5217);
const modules = realpathSync(root + '/node_modules');
const { createServer } = await import(pathToFileURL(modules + '/vite/dist/node/index.js'));
const { default: react } = await import(pathToFileURL(modules + '/@vitejs/plugin-react/dist/index.js'));
const { parse, Visitor } = await import('../../../scripts/verification-code.mjs');
const server = await createServer({
  root: root + '/src/renderer', cacheDir: root + '/out/design-consistency-vite-cache', configFile: false,
  plugins: [{
    name: 'queue-fixture', enforce: 'pre',
    transform(source, id) {
      if (id.endsWith('/docs/verification/playback-progress/fixture.mjs')) {
        source = source.replaceAll('__FIXTURE_ROOT__', root)
        .replace('state.playback=snapshot;',"state.playback=snapshot;sessionStorage.setItem('queue-editing:'+location.search,JSON.stringify(snapshot));")
        .replace("getPlaybackPreferences:()=>ok({volume:.75,shuffle:false,repeat:'off'})", "getPlaybackPreferences:()=>ok({volume:.75,shuffle:!!window.__fixtureSeed.playback?.shuffle,repeat:window.__fixtureSeed.playback?.repeat??'off'})")
        .replace(
          'albums:q=>ok({items:[],total:0,start:q.start}),playlists:()=>ok({items:[],recovery:[]}),',
          `albums:q=>ok({items:[{id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',name:'Fixture album',artist:'Fixture artist',songCount:3}],total:1,start:q.start}),
          album:()=>ok({id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',name:'Fixture album',artist:'Fixture artist',songCount:3}),albumTracks:()=>ok([songs[5],songs[2],songs[5]]),
          playlists:()=>ok({items:[{id:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',name:'Fixture playlist',songCount:3,canEdit:false}],recovery:[]}),
          playlist:()=>ok({id:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',name:'Fixture playlist',songCount:3,canEdit:false,entries:[{entryId:'entry-one',song:songs[3]},{entryId:'entry-two',song:songs[1]},{entryId:'entry-three',song:songs[3]}]}),`
        );
        this.addWatchFile(root + '/docs/verification/design-consistency/bridge.mjs');
        source += '\n' + readFileSync(root + '/docs/verification/design-consistency/bridge.mjs', 'utf8');
        return 'import "/@fs/' + root + '/docs/verification/queue-editing/seed.mjs";\n' + source;
      }
      if (!id.endsWith('/src/renderer/player.tsx')) return;
      const parsed = parse(source, id);
      let position;
      new Visitor({
        FunctionDeclaration(node) {
          if (node.id?.name === 'usePlayer' && node.body) {
            position = node.body.body.find((statement) => statement.type === 'ReturnStatement')?.start;
          }
        }
      }).visit(parsed);
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
