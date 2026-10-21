# Search snapshot verification

Run `node docs/verification/search-snapshots/verify.cjs` from the repository root with installed dependencies. This focused integration exercise loads the real Jellyfin service through TypeScript and substitutes only its fetch transport. It uses fixture data and makes no server or paid provider requests.

The 240-song fixture originally required three upstream requests per UI page, nine requests across pages 0, 80, and 160. The snapshot implementation requires three requests for the first page and none for either following page. The complete ordered result contains the same 240 unique song IDs.

`results.json` records the exercised pagination, normalized search, refresh, in-flight sharing, failed refresh, session change, key isolation, bounded eviction, and unchanged single-library browsing scenarios. Failed first-page refresh deliberately invalidates the old snapshot so later pages cannot silently mix refreshed and stale results. A later request can retry the full search.

This verifies service behavior and request counts, not real-server latency or memory use. No renderer code changed in this item.
