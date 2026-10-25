# First Windows release

Prepared 25 October 2026 from main `daa89cd`. Branch: `feat/windows-first-release`.

Implementation and a local unsigned 0.5.3 installer are present on this branch. [Verification evidence](verification/windows-first-release/README.md) separates completed checks from pending Windows-native acceptance. The preview has not been published.

## Scope and decisions

Deliver an unsigned Windows 11 x64 preview with the existing music library, player, lyrics, listening sidebars, settings, and optional DJ workflows. Signing is deferred until an SSL.com code-signing certificate is available. A website TLS certificate cannot sign Windows executables.

The release uses a custom application title bar with themed Windows-managed minimize, maximize/restore, and close controls at the right edge. Electron's `titleBarStyle: 'hidden'` plus `titleBarOverlay` lets the app own the top layout and caption colors while retaining system caption behavior. App-drawn caption buttons would require additional IPC, maximize-state synchronization, accessibility, and Windows hit testing. Steve and Elena reviewed both options; the coordinator chose the overlay. The reservation is that glyph shapes remain Windows-managed. See the [Electron title bar guide](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar).

Keep the macOS window path and signed release configuration. Windows gets its own unsigned packaging configuration. Windows preview updates are manual, so the macOS updater remains restricted to its current supported platform. Do not disable update signature verification globally.

## Layout and interaction plan

1. Give Windows one compact top band shared across the sidebar and main area. Put the application identity on the left and caption controls on the far right. Remove Windows' unused Mac traffic-light spacer and coordinate content offsets with the title bar. Keep the existing library, player, and sidebar proportions and themes.
2. Use the Window Controls Overlay safe-area geometry rather than guessing caption widths. Keep interactive content outside draggable regions. Window controls must remain available during startup, sign-in, settings, dialogs, and expanded lyrics.
3. Blend the title bar with the light, coffee, and dark app palettes. Keep the branded app identity and native Windows caption glyphs, with readable active/inactive states and system contrast behavior. Microsoft recommends a compact title bar, visible caption controls, and theme-aware colors in its [title bar design guidance](https://learn.microsoft.com/en-us/windows/apps/design/basics/titlebar-design).
4. Support Ctrl+F, Ctrl-click selection, Ctrl+A within song tables, and Ctrl+arrow player shortcuts on Windows. Keep Command shortcuts on macOS and preserve editable-field keyboard behavior. Update shortcut hints, platform labels, device identity, and storage explanations.
5. Closing the Windows window quits the application and saves the latest playback checkpoint before destruction. Closing macOS continues to hide the window. Preserve safe shutdown/cancellation and paused session restore.

The initial minimum remains 960 × 640, with a 1280 × 800 default. Reclaiming top whitespace does not make the current desktop layout suitable for every narrow Snap zone. Microsoft recommends a minimum width of at most 500 effective pixels for common zones. Test maximize-hover Snap and Win+Z, but document zones smaller than the app minimum as a limitation. A narrower layout needs its own responsive pass. See [Microsoft Snap Layout guidance](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-snap-layout-menu).

## Packaging and release plan

1. Add a Windows `.ico`, stable application identity, x64 NSIS installer, and unpacked build for smoke checks. Use a per-user installer without mandatory administrator elevation. Preserve the existing app data directory identity across reinstall and future signed releases.
2. Use a separate Windows electron-builder configuration compatible with the installed v26 dependency. Disable certificate discovery and required signing only for this configuration. Keep executable icon/version resource editing enabled when tooling permits. Do not reuse the Apple signing/notarization script. Refer to the [v26 Windows build options](https://www.electron.build/v26/docs/win/).
3. Build to `release/windows/` with Windows-specific artifact names. Produce SHA-256 checksums and matching source/license material. Keep publishing separate from local packaging; a completed installer is not a published release.
4. Provide a repeatable Windows build path with frozen dependency installation, existing quality checks, and no release credentials in PR jobs. A cross-build on macOS can establish artifact creation, but cannot establish native Windows behavior.
5. Version the first Windows preview above the published v0.5.2 release. Keep unsigned/manual-update status visible in release notes and About. When publishing later, coordinate the shared release repository/version with macOS so Windows assets cannot replace Mac updater metadata or checksums.

## Storage and platform checks

Reuse Electron `safeStorage` for connection tokens and provider keys. The existing macOS shared-Keychain adapter is guarded by platform and remains macOS-only. Windows uses DPAPI through Electron; verify encrypted persistence, unavailable-store fallback, and sign-out behavior in the packaged app. Do not introduce plaintext fallback. See [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

Keep credentials and filesystem operations in main, the typed capability bridge in preload, and the renderer sandbox, CSP, navigation restrictions, and sender checks. Verify Windows file paths, Unicode profile paths, media streaming, saved recordings, and overwrite/relaunch behavior rather than assuming POSIX file modes provide Windows access controls.

## Acceptance and evidence

Before code changes, capture the connected library using the existing fictional fixture at 1280 × 800. After implementation, capture the same content and viewport, plus Windows-specific layout in each theme. Browser platform simulation establishes layout and shortcut behavior only; it cannot display or prove native Windows caption controls.

Required source/build checks are formatting, type-aware lint, TypeScript, production build, and dependency audit. Prefer focused manual or end-to-end behavior verification; add no unit-test framework.

Before describing the preview as Windows-verified, exercise the packaged installer on Windows 11 x64:

- Install, launch, uninstall, and reinstall without unnecessary elevation. Inspect app identity, icon, executable version, and unsigned status.
- Verify caption controls, maximize/restore, double-click/drag, resize edges, Alt+Space, Alt+F4, Win+Z, and Snap on zones that fit the minimum. Check 100%, 125%, 150%, and 200% display scales, mixed-DPI monitor movement, high contrast, focus, and inactive appearance.
- Check 960 × 640, 1280 × 720, 1280 × 800, and a maximized desktop. Verify title-bar clearance in startup/sign-in, songs, albums, playlists, settings, dialogs, queue, DJ sidebar, and expanded lyrics.
- Verify Ctrl selection/search/player shortcuts and accessible names. Use a screen reader for caption controls and affected interactions.
- Sign in, play/seek/pause, minimize/restore, use media keys, close during playback, and reopen. Confirm the latest position is restored paused. Verify saved provider keys and recordings using disposable accounts and no live paid generation unless separately authorized.
- Confirm manual-update messaging, install a newer installer over the preview, and retain settings/data. Windows 10 and ARM64 support are unclaimed until separately verified.

Record actual checks and limitations in the dated verification directory. Source builds, fixture screenshots, Wine execution, and native Windows checks are separate kinds of evidence.

## Later SSL.com signing

Use an SSL.com Authenticode code-signing certificate and its supported signing method once issued. Keep credentials out of source and PR workflows, add trusted timestamping, and verify the installer and installed executable with Windows Authenticode tools. Preserve app identity and installation scope. Test an unsigned-preview-to-signed upgrade. Add Windows automatic updates only after publisher validation and an installed two-version update flow pass. Signing and SmartScreen reputation are separate concerns.
