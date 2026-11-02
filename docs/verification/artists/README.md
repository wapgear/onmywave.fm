# Artists collection browser

Updated on 2 November 2026 to replace the original Authors song-filter view. The sidebar and all controls now say Artists.

Artists and Albums both use `MusicCollectionPage` and `VirtualCollectionGrid`, extracted from the existing Albums implementation. They share the searchable collection grid, incremental 48-item rendering, keyboard tile navigation, collection heading, playback actions, track selection, loading/error/empty states, and focus restoration on Back. Each section retains its own search, open collection, selection, and scroll position. Switching Jellyfin libraries resets both views.

Artists uses Jellyfin's artist IDs and primary artwork. The list remains scoped to selected music libraries and deduplicated across roots. The detail endpoint reads every page of that artist's accessible songs before enabling collection playback, preserving the catalog's album/track ordering and deduplication. It never limits Play artist to one visible page.

## Captures

All captures use the production renderer with the public example catalog, Light theme, 1× pixel density, and the same initial library content. The example catalog has no artist portraits, so Artists shows the standard missing-artwork fallback. Album covers retain their existing attribution. Native macOS window controls are absent from browser captures.

| Logical viewport | Prior filter view | Artists grid |
| --- | --- | --- |
| 1440 × 900 | [Before](before-1440.png) | [After](after-1440.png) |
| 960 × 700 | [Before](before-960.png) | [After](after-960.png) |

The grid and album comparisons start with playback paused at 30 seconds, with expanded navigation and no search or selection.

Other visually inspected captures: [artist detail](detail-1440.png), [compact artist detail](detail-compact-960.png), [compact grid](compact-960.png), and the Albums regression pair [before](albums-before-1440.png) / [after](albums-after-1440.png). Detail and compact captures follow the playback checks and show the resulting playing state at zero; README images and grid comparisons are captured from a fresh, paused fixture.

## Verification

- Focused browser checks exercise artist browsing/search, opening only that artist's songs, Play artist, Play next, Add to end, Back, keyboard arrows/Enter and focus restoration, search retention, navigation retention, compact navigation, loading-error retry, and empty search results. The Albums grid/detail and keyboard Back flow are checked through the same shared components. See [UI results](ui-results.json).
- A focused service fixture verifies selected-library artist loading and deduplication, song pagination, separate artist snapshots, collaborating-artist filtering, invalid IDs, no selected libraries, and complete artist collections exceeding the 500-song provider page. See [service results](service-results.json).
- `pnpm run format` and `pnpm run check` cover formatting, type-aware lint, TypeScript, and production builds.

The browser fixture uses local example responses and a silent audio stub. These checks do not establish live Jellyfin connectivity, native playback output, or VoiceOver behavior. The existing sidebar tooltip is dismissed with Escape during compact/expanded navigation checks.
