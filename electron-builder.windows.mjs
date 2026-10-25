import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const { build } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const artifactName = 'onmywave-${version}-windows-${arch}.${ext}';

export default {
  ...build,
  artifactName,
  directories: { ...build.directories, output: 'release/windows' },
  publish: null,
  forceCodeSigning: false,
  win: {
    icon: 'resources/icon.ico',
    target: ['nsis'],
    forceCodeSigning: false,
    signExecutable: false,
  },
  nsis: {
    artifactName,
    oneClick: true,
    perMachine: false,
    packElevateHelper: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
  },
};
