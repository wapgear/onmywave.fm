# Third party notices

The onmywave.fm branding in resources/ comes from the onmywave.fm Feishin fork in ../desktop/ and retains its GPL-3.0 license. Feishin is copyright its respective contributors. Existing desktop implementation was used as an integration reference; the new app has separate source.

Manrope and Inter are bundled through Fontsource. They retain their SIL Open Font License notices in their respective dependency packages.

Electron, Vite, React, TanStack Query, Lucide, fast-xml-parser, ws, and other dependencies retain their respective licenses and copyright notices in node_modules. The app's GPL license does not replace those notices.

## Packaged runtime notices

[Bundled license texts and declarations](licenses/THIRD_PARTY_LICENSES.txt) cover all 36 production packages in the lockfile, including electron-updater and its dependencies. The packaging configuration includes this snapshot alongside the application license.

The installed `@nodable/entities` package omits a license file; the snapshot records its upstream MIT license source. The `lazy-val` package declares MIT and names Vladimir Krivosheev as its author, but the published package and upstream repository omit a standalone license text. Its declaration is recorded in the snapshot.
