#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

notes=${1:-}
if [[ $# != 1 || ( "$notes" != --local-only && ! -f "$notes" ) ]]; then
  echo 'Usage: pnpm run release:mac --local-only | path/to/release-notes.md' >&2
  exit 1
fi
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo 'Release builds require an Apple silicon Mac.' >&2
  exit 1
fi
if [[ -f scripts/.env.local ]]; then
  set -a
  source scripts/.env.local
  set +a
fi
: "${APPLE_ID:?Set APPLE_ID}"
: "${APPLE_APP_SPECIFIC_PASSWORD:?Set APPLE_APP_SPECIFIC_PASSWORD}"
: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID}"

repo=wapgear/onmywave-app
version=$(node -p 'JSON.parse(require("fs").readFileSync("package.json")).version')
pnpm run check
pnpm exec electron-builder --config electron-builder.release.mjs --mac --arm64 --publish never
app='release/mac-arm64/onmywave.fm.app'
codesign --verify --deep --strict "$app"
xcrun stapler validate "$app"
spctl --assess --type execute --verbose "$app"
hdiutil verify "release/onmywave-${version}-arm64.dmg"
# Never publish a release that installed apps cannot discover or download.
node --input-type=module - "$version" <<'JS'
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { load } from 'js-yaml';
const version = process.argv[2];
const metadata = load(readFileSync('release/latest-mac.yml', 'utf8'));
if (metadata.version !== version) throw new Error('Stale updater metadata');
const zip = `onmywave-${version}-arm64.zip`;
if (!metadata.files?.some((file) => file.url === zip)) throw new Error('Missing updater ZIP');
for (const file of metadata.files) {
  if (![zip, `onmywave-${version}-arm64.dmg`].includes(file.url)) throw new Error('Unexpected updater artifact');
  const data = readFileSync(`release/${file.url}`);
  if (data.length !== file.size || createHash('sha512').update(data).digest('base64') !== file.sha512)
    throw new Error(`Updater artifact does not match metadata: ${file.url}`);
}
JS

# Include the exact build inputs, without local credentials or historical documentation.
source="onmywave-${version}-source.tar.gz"
COPYFILE_DISABLE=1 tar --exclude='.env*' -czf "release/$source" \
  src resources licenses scripts package.json pnpm-lock.yaml pnpm-workspace.yaml electron.vite.config.ts \
  electron-builder.release.mjs tsconfig.json eslint.config.js .oxfmtrc.json \
  .oxlintrc.json .oxlint-spacing.json .nvmrc AGENTS.md README.md LICENSE THIRD_PARTY_NOTICES.md
(
  cd release
  shasum -a 256 "onmywave-${version}-arm64.dmg" \
    "onmywave-${version}-arm64.zip" latest-mac.yml \
    "onmywave-${version}-arm64.dmg.blockmap" "onmywave-${version}-arm64.zip.blockmap" \
    "$source" > SHA256SUMS.txt
  shasum -a 256 -c SHA256SUMS.txt
)
if [[ "$notes" == --local-only ]]; then
  echo 'Verified release files are in release/.'
  exit 0
fi

gh release create "v$version" --repo "$repo" --draft \
  --title "onmywave.fm v$version" --notes-file "$notes" \
  "release/onmywave-${version}-arm64.dmg" \
  "release/onmywave-${version}-arm64.zip" \
  "release/$source" release/SHA256SUMS.txt release/latest-mac.yml \
  "release/onmywave-${version}-arm64.dmg.blockmap" \
  "release/onmywave-${version}-arm64.zip.blockmap"
gh release edit "v$version" --repo "$repo" --draft=false --latest
