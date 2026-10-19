# Oxlint as the lint runner

ESLint previously supplied React Hooks/Compiler checks, statement spacing, component-type extraction, and Electron syntax guards. This change runs them through Oxlint 1.88.0, the current published release, and removes the ESLint CLI/engine, @eslint/js, typescript-eslint, and eslint.config.js.

Oxlint's JavaScript plugin host runs the existing React Hooks and Stylistic packages. The local component rule is preserved under scripts/oxlint-rules, and the existing restricted-syntax checks become local Oxlint rules. Native counterparts of the previous recommended JavaScript/TypeScript rules remain enabled. TypeScript's compiler checks undefined names in TS files; the native no-undef rule remains enabled for JS. Duplicate arguments and legacy octal syntax are parser errors in these modules.

Type-aware analysis uses pinned oxlint-tsgolint 7.0.2004. In addition to correctness rules, unhandled promises and misused promises are explicit errors. The existing tsc check remains. Oxfmt still formats code; .oxlint-format.json applies and verifies statement/import spacing. Format fixes do not apply correctness fixes.

The plugin packages declare ESLint peers but run inside Oxlint without the engine. Automatic peer installation is disabled. Missing ESLint and the unsupported Windows Squirrel packaging backend are documented peer allowances, not advisory exceptions. The pnpm lockfile contains no installed ESLint engine package. JS plugin support is upstream alpha, so versions are pinned or lockfile-controlled and the migrated guards were exercised explicitly.

Type-aware findings led to narrow changes: player callback types declare this: void; synchronous calls no longer use void; existing async UI callbacks explicitly discard their results; XML text accepts only strings/numbers; Jellyfin comparators declare their actual string inputs. The queue/audio synchronization effect has one documented native set-state-in-effect exception because it replaces an external audio source and reflects its loading state. Other checks remain enabled.

Verified on 19 October 2026:

- A clean pnpm install --frozen-lockfile passed without ESLint or missing-peer warnings.
- pnpm run format and pnpm run check passed, including type-aware lint, TypeScript, bundled voice validation, and production builds.
- Full pnpm audit reported zero vulnerabilities.
- Unsigned Apple silicon packaging passed with CSC_IDENTITY_AUTO_DISCOVERY=false pnpm run package:mac. No signing, notarization, or publishing was performed.
- Temporary deliberately invalid main/preload/renderer files triggered static/dynamic Node import restrictions, synchronous IPC restrictions, insecure Electron options, component-type extraction, conditional Hooks, missing effect dependencies, statement spacing, and floating promises. The temporary files were removed.

References: [Oxlint JS plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins.html), [type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html).
