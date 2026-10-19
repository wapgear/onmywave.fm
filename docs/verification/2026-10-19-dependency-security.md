# Dependency security verification

The two open Dependabot alerts concerned development tooling: `esbuild` before 0.28.1 and `sprintf-js` through Electron Builder's optional proxy support. No runtime dependency was changed.

Vite 7.3.7 accepts esbuild 0.28, allowing its lockfile entry to advance to 0.28.2 while keeping electron-vite 5.0.0 and its unaffected esbuild 0.25.12. A major electron-vite upgrade was unnecessary.

`sprintf-js` has no patched release. The scoped npm override replaces only `global-agent` under `@electron/get` 3 with 4.1.3, whose upstream 4.1 release removed the `roarr` logger and its vulnerable formatter. Electron Builder's downloader still uses the same `bootstrap()` export. Remove this override when Electron Builder no longer depends on the old downloader/proxy chain. The unpatched package is absent from the resulting lockfile; no advisory was dismissed or ignored.

Verification on 19 October 2026:

- Full `npm audit` reports zero vulnerabilities, including development dependencies.
- The actual Electron Builder downloader fetched synthetic artifacts through a local HTTP proxy and an HTTPS CONNECT tunnel with a trusted local CA. An untrusted certificate was rejected. These checks made no external provider requests.
- `npm run package:mac` completed with `CSC_IDENTITY_AUTO_DISCOVERY=false`, building the production renderer/main/preload and creating an unsigned Apple silicon app directory. No release was signed, notarized, or published.
- The repository's existing pre-commit and Quality checks remain enforced. Quality now runs the full dependency audit.

Sources: [esbuild advisory](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr), [sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), [global-agent 4.1.0](https://github.com/gajus/global-agent/releases/tag/v4.1.0).
