# Shared sliders

All renderer range inputs live in `components/Slider`: `Slider` for a single value, `RangeSlider` for two inclusive whole-number endpoints. `SliderTrack` and its stylesheet own the rail, fill, handles, focus and motion. `SongIntervalRange` adds song-specific labels and limits. Player position/volume, news voice volume and the DJ's music level use the same primitive. The player retains its smaller handle and theme colors.

Value changes ease over 140ms. Hover, press and merged-handle visibility transition over 120ms. Direct dragging tracks immediately; reduced motion disables transitions. Native range inputs retain keyboard behavior, labels, disabled semantics and input events. The timeline still commits a seek only on release, keyboard completion or blur. Equal range endpoints display one handle; dragging left chooses the minimum and right chooses the maximum.

The native Electron fixture captures all consumers before/after at 1440×1000 and 960×800, with playback controls also captured at 720×900. It exercises volume updates, keyboard focus, delayed seek commit and the DJ level. It observes running `left`/`right` CSS transitions and emulates reduced motion to confirm no running transitions. The existing merged-handle/settings fixture verifies both endpoints, boundaries, equal-value merging, independent saves and custom drafts after extraction. The seven existing baseline playback scenarios pass. Checks use synthetic data and fixture audio, without live provider calls.

```sh
WAVE_FIXTURE_PORT=0 WAVE_SCENARIO=slider-components WAVE_CAPTURE_STAGE=after node_modules/.bin/electron docs/verification/critical-playback/server.mjs
WAVE_FIXTURE_PORT=0 WAVE_SCENARIO=song-handoff-settings WAVE_CAPTURE_STAGE=after-dual-sliders-merged-handle-shared-saves-subsections node_modules/.bin/electron docs/verification/critical-playback/server.mjs
```

[Before](before-news-and-player-960.png) · [After](after-news-and-player-960.png) · [DJ level](after-dj-music-level-960.png)
