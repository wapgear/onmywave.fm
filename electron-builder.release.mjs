import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const { build } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// electron-updater compares os.release(): macOS 13 uses Darwin 22.
export const minimumDarwinVersion = '22.0.0';

export default {
  ...build,
  forceCodeSigning: true,
  mac: {
    ...build.mac,
    target: ['dmg', 'zip'],
    minimumSystemVersion: '13.0',
    identity: 'Anton Izmailov (XGNA527WWP)',
    hardenedRuntime: true,
    notarize: true,
  },
};
