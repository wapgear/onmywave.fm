# Whole-row queue dragging — 2026-11-02

Upcoming songs now drag from the song row, including artwork, title, duration and padding. The grip and up/down controls are removed. The remove button remains independent. A portal renders the full song card under the pointer, preserving the initial grab offset, row dimensions and title width. A full-height placeholder marks the destination; neighboring rows slide around it without changing the list height. Order is committed on drop, using the existing occurrence IDs and player API.

Ordinary clicks still play. Drag completion suppresses click-to-play. Escape, lost capture, pointer cancellation, a changed playback session/current song, and disappearance of the dragged occurrence cancel the interaction. Dropping outside the queue cancels. Keyboard users focus a song and hold Alt with Up/Down/Home/End; ordinary arrow navigation and remove-focus recovery remain.

## Verification

CUA drove the actual renderer with synthetic data through the existing queue-editing fixture. No live queue, Jellyfin connection or real audio was used. Eleven recorded checks passed in `results.json`:

- Exact-occurrence pointer reorder, including repeated songs; current song, paused intent, 30-second position and completion count remain unchanged.
- Drag initiation from song text and the artwork area.
- Full-row preview with artwork, title, artist and duration. Final observed row/preview widths are 272px, heights 54px; the placeholder is also 54px. Track/text widths match before and during drag.
- Fixed list height during drag: 378px for the seven-song queue. Native held-drag samples are in `drag-observations.json`.
- Escape and outside-drop cancellation; overlays clean up.
- Independent removal and ordinary click-to-play after dragging/canceling.
- Alt+End/Home order and focus preservation.
- Edge autoscroll in a 10,000-song shuffled queue. Its initial 50-song planning window holds its 2700px height throughout dragging. The existing player materializes the full 9,999-song future on reorder. Moving to the end and back retains focus at indexes 9,998 and 0 with only 16 rendered rows. See `large-drag-observations.json`.
- No grip or arrow controls remain.

The matched `before.png` and `after.png` use the original eight-song fixture, first occurrence current, paused at 30 seconds, light theme, initial queue scroll and 1280×720 viewport. `dragging.png` and `dragging-dark.png` were captured during real native pointer gestures, concurrently waiting for the actual preview element to appear. `after-dark.png` checks the resting dark theme. The fixture theme was restored to Light. Screenshot pixels are 1280×720, DPR 2 with capture scale 1. Images were visually inspected, and an independent queue-block review found no concrete defect.

Native Electron, VoiceOver, touch input and narrow windows were not exercised. An early development hot reload emitted a hook-order warning while the drag hook was being extracted; subsequent full fixture loads used the final hook order. Formatting, type-aware lint, TypeScript and production build passed. The environment uses Node 24 and emits the repository's existing Node 26 engine warning.

## Reproduce

```sh
node docs/verification/queue-editing/server.mjs
```

Open `http://127.0.0.1:5205/?case=NEW_UNIQUE_CASE&tools&observe-drag`, then open Playing Next. Use a new case for a fresh queue; the fixture persists each case's playback checkpoint. Add `large&shuffle` for the large shuffle scenario. `observe-drag` opts into `observe.mjs`, which records DOM geometry in the hidden `#queue-drag-observations` output without changing production behavior. State is available in the fixture's existing `#queue-fixture-status` output.
