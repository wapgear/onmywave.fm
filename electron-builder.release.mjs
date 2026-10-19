import { readFileSync } from 'node:fs';
import { URL } from 'node:url';


const { build } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default {
  ...build,
  forceCodeSigning: true,
  mac: {
    ...build.mac,
    target: ['dmg', 'zip'],
    identity: 'Anton Izmailov (XGNA527WWP)',
    hardenedRuntime: true,
    notarize: true,
  },
};
