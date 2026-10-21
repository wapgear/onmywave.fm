# Desktop simplification delivery plan

The October 21, 2026 review identified eight changes. Each linked issue records the problem, proposed solution, acceptance criteria, and verification. Deliver one focused PR at a time against current main, then verify its merge and issue closure before starting the next implementation.

| Order | Issue | Status |
| --- | --- | --- |
| 1 | [reuse Jellyfin search results across pages](https://github.com/wapgear/onmywave.fm/issues/172) | Merged in [#180](https://github.com/wapgear/onmywave.fm/pull/180); issue closed |
| 2 | [isolate playback progress from library and queue renders](https://github.com/wapgear/onmywave.fm/issues/173) | Merged in [#182](https://github.com/wapgear/onmywave.fm/pull/182); issue closed |
| 3 | [run DJ scheduling clocks only when needed](https://github.com/wapgear/onmywave.fm/issues/174) | Merged in [#183](https://github.com/wapgear/onmywave.fm/pull/183); issue closed |
| 4 | [coalesce playback checkpoints and skip unchanged saves](https://github.com/wapgear/onmywave.fm/issues/175) | Implemented; coalescing, retries, rollback, unload and lifecycle fixtures passed; awaiting PR checks |
| 5 | [remove unused weather fields from news workflows](https://github.com/wapgear/onmywave.fm/issues/176) | Planned |
| 6 | [make room profiles the source of active configuration](https://github.com/wapgear/onmywave.fm/issues/177) | Planned |
| 7 | [simplify formatting and component type conventions](https://github.com/wapgear/onmywave.fm/issues/178) | Planned |
| 8 | [reconcile prepared news only after publication changes](https://github.com/wapgear/onmywave.fm/issues/179) | Planned |

## Delivery rules

Preserve existing security, accessibility, data recovery, sorting, and explicit playback intent. Use fixture services and disposable app data for verification. Run formatting, the full quality checks, the dependency audit, and required GitHub checks. Include matched screenshots for UI changes. Do not bypass hooks or branch protections.

Search verification must count real service transport requests. Progress isolation must be measured by renderer commit counts. Idle clocks must be checked alongside active transition timing. Persistence must retain the five-second checkpoint target and the latest pending snapshot. Migrations must preserve existing news and per-room configuration. Recovery changes must cover failures after durable sidecar publication within the same app session.

The existing multi-library full scan remains unchanged because it preserves merged ordering. No dependency removal or framework replacement is planned.
