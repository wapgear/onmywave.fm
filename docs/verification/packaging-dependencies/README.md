# Packaging dependency audit repair

2 November 2026. The initial 0.7.3 integration failed `pnpm audit` on four minimatch versions below 11.0.1, all under electron-builder's development dependency tree. The application dependency graph was unaffected.

## Resolution

The exact overrides in `pnpm-workspace.yaml` replace the legacy callers before selecting the patched matching API. Regenerating the lockfile removes old ASAR, Universal, dir-compare and glob branches rather than forcing the new named exports into old callable-import consumers.

| Dependency | Previous | Selected | Reason |
| --- | --- | --- | --- |
| `@electron/asar` | 3.4.1 | 4.3.1 | Uses named minimatch API and current glob; retains `createPackageFromStreams`. |
| `@electron/universal` | 2.0.3 | 3.0.6 | Uses ASAR 4 and removes the older dir-compare branch; retains `makeUniversalApp`. |
| `filelist` | 1.0.6 | 2.0.2 | Preserves Jake's CommonJS `FileList` export and uses modern minimatch `.match`. |
| `minimatch` | 3.1.5 / 5.1.9 / 9.0.9 / 10.2.6 | 11.0.1 | Patched release for GHSA-g3hv-75wg-m249. |
| ASAR's `glob` | 7.2.3 originally, 13.0.6 during upgrade | 14.0.2 | Avoids introducing GHSA-3g3m-2fjr-6pw4 with the newer ASAR caller. |

Electron-builder 26.18.0 already dynamically imports the named ASAR/Universal functions. The upgraded package engines support the repository's Node 24 toolchain. File-list remains compatible with Jake's consumer API. No production dependency or root dependency resolution changed: the 72-package production closure and all importer resolutions match the pre-repair lockfile. Only packaging development dependencies changed, so the bundled production-license snapshot is unchanged; installed development packages retain their upstream licenses.

## Verification

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm audit
pnpm why minimatch
pnpm why glob
pnpm run check
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm run package:mac
```

The full audit reports **No known vulnerabilities found**, and the dependency tree contains only minimatch 11.0.1 and glob 14.0.2. Frozen installation, formatting, type-aware lint, TypeScript and the production build pass. The actual Apple silicon archive is built without publishing or using a signing identity; its updater configuration and ASAR contents are checked after packaging. This exercises electron-builder's real ASAR caller rather than only validating package metadata. The app's supported distribution target is Apple silicon; a universal binary was not built, and these checks do not establish notarization or a published updater transition.

The overrides intentionally remain exact until upstream electron-builder adopts a fully patched compatible graph. Re-evaluate and remove each override when its parent dependency range supports the patched version. Keep full audit and dependency-review checks enabled; do not replace them with production-only audit or an advisory exception.

Sources: [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249), [glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [ASAR 4.3.1](https://github.com/electron/asar/releases/tag/v4.3.1), [Universal 3.0.6](https://github.com/electron/universal/releases/tag/v3.0.6).
