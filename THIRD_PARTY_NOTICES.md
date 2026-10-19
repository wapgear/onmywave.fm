# Third party notices

The project declares GPL-3.0-only in [package.json](package.json). The complete project license is in [LICENSE](LICENSE). Dependency licenses and copyright notices remain applicable to their own code and assets.

## Branding and upstream reference

The icon files in `resources/` were copied from the [onmywave.fm fork](https://github.com/wapgear/onmywave-desktop-legacy) of [Feishin](https://github.com/jeffvli/feishin). The original repository notice describes these assets as GPL-3.0. Feishin is copyright its respective contributors. Preserve the upstream notices and GPL license when redistributing them.

The existing desktop application was an integration reference. This application has separate source and its own data directory. The branding notice does not establish that every image or recording in this repository came from Feishin.

## Runtime dependencies and fonts

[Bundled third party license texts](licenses/THIRD_PARTY_LICENSES.txt) contain the available license texts and declarations for all 36 production packages in the current lockfile, including React, TanStack Query/Virtual, Lucide, ws, electron-updater, and the XML parser dependencies. Keep this snapshot synchronized with dependency changes. It is included by the macOS packaging configuration because bundled JavaScript and fonts may no longer sit beside their original package license files.

- Inter: Copyright 2016 The Inter Project Authors, SIL Open Font License 1.1.
- Manrope: Copyright 2019 The Manrope Project Authors, SIL Open Font License 1.1.

The installed `@nodable/entities` package omits a license file. Its MIT license text was retrieved from its upstream repository; the bundled notice records the exact source commit URL.

The `lazy-val` package declares MIT and names Vladimir Krivosheev as its author, but its published package and upstream repository omit a standalone license text. Its declaration is recorded in the snapshot.

Electron and Chromium have their own notices in the Electron distribution, including `LICENSE` and `LICENSES.chromium.html`. Preserve the runtime's license resources when packaging and verify their presence before distributing a build. Development tools retain their own dependency notices and are not covered by the production-package snapshot.

## Bundled media

| Path | Recorded origin | Remaining review |
| --- | --- | --- |
| `src/renderer/public/voice-previews/*.mp3` | Seven generated ElevenLabs samples. Voice IDs, model, text, dates, and sizes are in `manifest.json`. | Record the generating account's applicable plan and redistribution rights before public distribution. Generation metadata alone does not establish those rights. |
| `src/renderer/public/demo/` | Historical generated news demo with transcript, source URL, and generation metadata. | Confirm output and source-content redistribution rights. The archived script is not verified news. |
| `src/renderer/public/dj-avatars/` | Generated fox and owl portraits, identified as generated in the dated DJ-avatar verification record. | Record the generation source and asset rights. |
| `docs/design/` | Generated design reference and its prompt. | Record the generation source and asset rights. These images are not screenshots of the app. |
| `docs/verification/`, `docs/dj-*.png` | Historical app captures and verification material. | Review each image for private information and third party artwork before public release. |
| `docs/screenshots/` | App screenshots copied from the website demo, with real song metadata and matching release covers. | Capture details and Apple catalog artwork sources are recorded in that directory. Cover rights remain with their respective holders. No song recordings are included. |

No additional media license is asserted by this notice. [Release readiness](docs/OPEN_SOURCE_READINESS.md) tracks the unresolved provenance checks. Confirm permissions or replace unresolved assets before distribution. Provider services and voice models are governed by their own terms, not by the application's code license.
