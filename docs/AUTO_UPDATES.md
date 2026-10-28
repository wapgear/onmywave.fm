# Automatic updates

Installed Apple silicon macOS builds check `wapgear/onmywave-app` at startup and every six hours. Checks do not download or restart the app. Development builds do not check the release feed.

The app offers Update now or Later when a release is available. Update now downloads it with percentage progress. Restart now installs the downloaded update and stops playback; Restart later keeps the app running. Settings → General → About and updates shows the current version and provides a manual check. Check, download, and installation failures offer retry actions.

## Publishing

The existing GitHub release repository hosts the signed DMG, ZIP, updater metadata, blockmaps, source archive, and checksums. No additional update server or client token is required. The release script validates the generated metadata against the artifact version, size, and SHA-512 hashes, uploads all assets to a draft, then publishes it.

Release 0.6.0 requires macOS 13 or later. The release configuration sets the app's minimum macOS version to 13.0, and the release script verifies it in the signed app. Updater metadata declares `minimumSystemVersion: 22.0.0`: electron-updater compares the Darwin kernel version returned by `os.release()`, rather than the macOS product version. This keeps older Macs from being offered an unsupported release. The metadata is included in the final checksum manifest.

Use Node.js 24 and an Apple silicon Mac with the Developer ID certificate configured in `electron-builder.release.mjs`. Set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` in the environment or ignored `scripts/.env.local`, and authenticate `gh` with access to `wapgear/onmywave-app`.

Increase the package version before each new release, then run:

```sh
pnpm run release:mac --local-only
pnpm run release:mac path/to/release-notes.md
```

Existing installations without the updater need one manual installation of an updater-enabled release. This change does not publish a release.

## Verification

- `pnpm run check` passed formatting, lint, TypeScript, and production build.
- `pnpm audit` reported no vulnerabilities.
- Browser verification exercised the actual components with a simulated bridge: deferral without download, percentage progress, disabled in-flight actions, restart deferral, explicit restart, installation failure, retry, current version, and a new release prompt at 960 and 1280 pixel widths.
- A native Electron launch with isolated application data verified production imports, the preload bridge, and development-build update gating.
- Release metadata and artifact SHA-512 validation passed against the existing local release artifacts. Shell syntax validation passed.

An upgrade between two signed, installed release versions still needs verification. The checks above did not replace an installed app or publish artifacts.
