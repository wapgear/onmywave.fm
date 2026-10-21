# Desktop update UI

Verified on 21 October 2026 in Electron 43.7.0 on macOS. Captures use actual `AppUpdates` and `UpdateSettings` components, shared error notice, global/settings styles, and bundled Inter fonts. The surrounding settings heading and player placeholder are fixture markup. Updater responses and events are simulated through the existing `window.wave` contract in a disposable Electron window with context isolation, sandboxing, and Node integration disabled. No release download, installation, restart, provider, account, or private music is involved.

The first baseline was captured before editing at `88e6218`. Final paired captures use the same viewport, data, fonts, and surrounding markup. The update UI, shared styles and shared error implementation agree with current main `add11a9` apart from import whitespace. The PR applies only this update change to current main, whose format, lint, typecheck and production build also passed.

## Matched screenshots

All images are native 2× captures. Each cell links to the before and after for the same state.

| Viewport | Available | Downloading, 42% | Ready to restart | Download error |
| --- | --- | --- | --- | --- |
| 960 × 640 | [Before](before-960-available.png) / [After](after-960-available.png) | [Before](before-960-downloading.png) / [After](after-960-downloading.png) | [Before](before-960-downloaded.png) / [After](after-960-downloaded.png) | [Before](before-960-error.png) / [After](after-960-error.png) |
| 1280 × 800 | [Before](before-1280-available.png) / [After](after-1280-available.png) | [Before](before-1280-downloading.png) / [After](after-1280-downloading.png) | [Before](before-1280-downloaded.png) / [After](after-1280-downloaded.png) | [Before](before-1280-error.png) / [After](after-1280-error.png) |
| 1600 × 1000 | [Before](before-1600-available.png) / [After](after-1600-available.png) | [Before](before-1600-downloading.png) / [After](after-1600-downloading.png) | [Before](before-1600-downloaded.png) / [After](after-1600-downloaded.png) | [Before](before-1600-error.png) / [After](after-1600-error.png) |

Visually inspected all matched pairs. The action row has an 8px gap, the card has 20px padding at minimum window height and 24px otherwise, and the notice sits above the player. No tested ordinary state overflows or clips an action. The heading icon, text hierarchy and helper text fit all three sizes.

[Collapsed pill](after-collapsed.png) retains keyboard focus after Restart later. Opening it restores focus to Restart now. [Additional player offset](after-player-notice-offset.png) illustrates the notice raised by a simulated 72px player message. That height is injected on the shared root in this fixture; the production Player ResizeObserver was reviewed and changed to publish there instead of its descendant app shell.

## Behavior checks

- Download, retry/check, and install buttons dispatch the matching bridge command. Busy phases disable the action and hide defer controls.
- Tab moves from Restart now to Restart later; native Space activates Restart later. Collapse and reopen keep focus inside the notice.
- Idle, unsupported, checking and current remain in settings without a floating notice. Installing shows the busy notice.
- Failed command responses show the shared error notice. Installation failure retains Restart now and displays its error.
- An 800-character unbroken error scrolls vertically, stays 68px below the viewport top, and has no horizontal overflow.
- A 72px root player-notice height moves the bottom gap to 208px, independently checked against 116 + 72 + 20.
- During a 10% to 90% update, the accessible progress value is immediately 90 while the visual fill is between endpoints after 80ms. CSS interpolates the fill over 240ms.
- Emulated reduced motion leaves zero running animations and disables progress/button transitions.

Raw geometry and state results are in [before-metrics.json](before-metrics.json) and [after-metrics.json](after-metrics.json). The temporary fixture is at `/private/tmp/wave-update-ui`; no persistent test framework was added. These checks cover component rendering, actions, and focus. Signed updater delivery, actual installation, screen-reader speech, and a full connected library session were not exercised.

`pnpm run format`, `pnpm run check`, and `pnpm audit --prod` passed. Production audit found no known vulnerabilities.
