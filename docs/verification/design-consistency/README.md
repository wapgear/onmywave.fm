# Save actions and floating surfaces

This audit covers the existing macOS Electron renderer, using synthetic data. It preserves the product's type, colors, layout and roles. Twelve commit-save call sites now use `components/SaveButton`, which composes the existing primary `Button`; existing refs, handlers, labels, pending flags, native disabled state and focus logic remain with their owners. Dialog footer and provider-key companion actions use matching compact geometry. “Save as new” opens a room dialog and remains a secondary opener, rather than a commit-save action.

The three independent block reviews are in `reviews/`: settings save actions, modal save actions and layered surfaces. Before/after full viewport captures and block crops accompany DOM-measured geometry/materials in `before-measurements.json` and `after-measurements.json`. Captures use 1440×1000 logical pixels at 2× scale, plus the player at 960×800. The after player is also captured in dark and coffee themes. The earlier `before-player-sepia` used an unsupported theme name and is excluded from theme verification.

The observed save inconsistency was 32/34px height, 8/18px radius and 12/14px text. The corrected save and dialog action geometry is checked by the native fixture. A deliberate 40px minimum height on a scratch DOM state fails the same geometry assertion before being restored. A gated synthetic News & voice save checks loading geometry, `aria-busy`, the saved value and retained focus. The settings regression also exercises independent saves, validation and retained custom drafts.

The surface review found the existing role hierarchy coherent. Existing menu, dialog, panel and player treatments are retained; duplicate popover declarations were removed, and repeated panel radius/player radius/blur values now use semantic tokens. The fixture compares measured radius, fill, border and shadow with the before peers. No surface redesign or generated preview was needed for these deterministic token/component corrections.

| Rule | Canonical implementation | Observable check |
| --- | --- | --- |
| SAVE-01 | `SaveButton.styles.css`, compact control tokens | Short, single-line commit actions: 32px minimum height, 8px corners, 12px text, 4×12px padding. Long labels may wrap and grow. |
| SAVE-02 | `SaveButton` and existing edit owners | Forward native props/ref; keep primary enabled, muted unavailable and busy cursor states. Preserve save/validation/focus semantics. |
| ACTION-01 | `.modal-actions button`, provider-key action group | Peer actions share compact geometry; secondary/destructive emphasis remains distinct. |
| SURFACE-01 | `.popover-surface`, `.modal`, player/drawer tokens | Equivalent surface peers keep their theme-aware materials and elevation. Menus, modal dialogs, inspectors and the persistent player retain justified role differences. |
| SLIDER-01 | `components/Slider` | Every range input uses the shared primitives, preserves keyboard/input behavior and respects reduced motion. |

The executable rules cover registered observations, not every possible app state. Save buttons in playlist/room/workflow branches were migrated and source-reviewed but their submissions were not exercised. App-update notices and sidebar tooltips were reviewed from source only and were not visually changed. Keyboard/screen-reader certification and real provider behavior are outside this audit. Representative UI states were visually reviewed; this is not a formal proof of whole-app design quality.

Rerun captures and checks after changing these primitives, their tokens or their consumers. Do not silently replace a baseline to hide drift. `source-hashes.json` records the inspected core component/style contents; capture times are in the measurements. No CI, dependencies, recurring audits or live provider requests were added.

```sh
WAVE_FIXTURE_PORT=0 WAVE_SCENARIO=design-consistency WAVE_CAPTURE_STAGE=after node_modules/.bin/electron docs/verification/critical-playback/server.mjs
pnpm run format
pnpm run check
```

[Save dialog before](before-source-dialog-crop.png) · [Save dialog after](after-source-dialog-crop.png) · [Pending save](after-news-save-pending-crop.png)
