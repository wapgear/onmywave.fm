# Dependency security verification

The two open Dependabot alerts concerned development tooling: `esbuild` before 0.28.1 and `sprintf-js` through Electron Builder's optional proxy support. No runtime dependency was changed.

Vite 7.3.7 accepts esbuild 0.28, allowing its lockfile entry to advance to 0.28.2 while keeping electron-vite 5.0.0 and its unaffected esbuild 0.25.12. A major electron-vite upgrade was unnecessary.

`sprintf-js` has no patched release. The scoped pnpm override replaces only `global-agent` under `@electron/get` 3 with 4.1.3, whose upstream 4.1 release removed the `roarr` logger and its vulnerable formatter. Electron Builder's downloader still uses the same `bootstrap()` export. Remove this override when Electron Builder no longer depends on the old downloader/proxy chain. The unpatched package is absent from the resulting lockfile; no advisory was dismissed or ignored.

Verification on 19 October 2026:

- Full `npm audit` reports zero vulnerabilities, including development dependencies.
- The actual Electron Builder downloader fetched synthetic artifacts through a local HTTP proxy and an HTTPS CONNECT tunnel with a trusted local CA. An untrusted certificate was rejected. These checks made no external provider requests.
- `npm run package:mac` completed with `CSC_IDENTITY_AUTO_DISCOVERY=false`, building the production renderer/main/preload and creating an unsigned Apple silicon app directory. No release was signed, notarized, or published.
- The repository's existing pre-commit and Quality checks remain enforced. Quality now runs the full dependency audit.

Sources: [esbuild advisory](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr), [sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), [global-agent 4.1.0](https://github.com/gajus/global-agent/releases/tag/v4.1.0).

## pnpm migration

The same PR migrates the repository to pnpm 10.34.7, pinned by `packageManager`. `pnpm-lock.yaml` replaces the npm lockfile, preserving the production versions. The downloader override lives in `pnpm-workspace.yaml`. Only esbuild dependency build scripts are approved; the unused Windows installer build script is explicitly ignored. Electron installation remains in the existing root postinstall script.

CI installs pnpm through a SHA-pinned action, caches its store, installs with `--frozen-lockfile`, and runs the quality checks and full audit. Hooks, nested scripts, contributor instructions, and release source archives use pnpm. Dependabot retains the `npm` ecosystem, which also handles pnpm lockfiles. The release script now declares its `js-yaml` import directly rather than relying on npm hoisting.

Migration verification:

- A clean `pnpm install --frozen-lockfile` completed, including Electron installation and Git hook setup.
- `pnpm run format` and `pnpm run check` passed, covering formatting, lint, TypeScript, bundled voice assets, and production builds.
- `pnpm audit` reported zero vulnerabilities across the full lockfile, and `sprintf-js` is absent.
- The Electron Builder downloader passed the HTTP proxy, trusted HTTPS CONNECT, and untrusted TLS rejection checks again using pnpm's dependency layout.
- The release metadata parser imports successfully as a direct dependency. The shell script passes `bash -n`, and invoking it without arguments produces the documented pnpm usage before accessing release credentials.
- Unsigned Apple silicon packaging passed with `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm run package:mac`. The archive contains the runtime dependencies and bundled license snapshot, and Electron/Chromium notices remain in Resources. All prior production package versions remain present in the pnpm lockfile. No signing, notarization, or publishing was performed.
