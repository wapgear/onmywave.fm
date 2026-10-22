# Catalog responsiveness verification

Run the same fixture against the committed baseline and the working service:

```sh
node --expose-gc docs/verification/catalog-responsiveness/verify.cjs \
  --baseline-ref=5a47954c8f40d8aa3af6a6c4e02c72a4197a0be2 --benchmark-only \
  > docs/verification/catalog-responsiveness/baseline.json
node --expose-gc docs/verification/catalog-responsiveness/verify.cjs \
  > docs/verification/catalog-responsiveness/after.json
```

The baseline runner loads `git show REF:src/main/jellyfin.ts` with Node's module compiler at the original file path. Relative imports still resolve from `src/main`, and no source file is changed. The fixture and harness are identical in both runs; their SHA-256 is recorded in each result. Both results also record the compiled service source hash.

The fixture has 12,000 songs in one library and 12,600 songs across three libraries. It includes 9,000 search matches in one library and 9,449 unique matches across three, with title, artist, and album paths represented. It includes one intentional duplicate ID across libraries. Every upstream response has a controlled 8 ms delay. Five samples capture first-page latency, request count, peak concurrent requests, result count, and heap growth. Heap growth is a process-level diagnostic that includes runtime and retained fixture allocation; use it directionally.

With matching fixtures, median search latency changed from 296.92 ms to 107.97 ms for one library and from 401.83 ms to 95.42 ms for three libraries. The upstream call counts stayed at 21 and 31 respectively; peak concurrency rose from one to three and from one to four. Three-library browse changed from 261.63 ms to 110.69 ms across the same 27 page requests. Single-library browse remained one request at 9.91 ms baseline and 10.38 ms after. Median heap growth fell from 26.4 MB to 22.4 MB for one-library search, from 24.3 MB to 20.1 MB for three-library search, and from 39.1 MB to 21.6 MB for three-library browse. The fixture demonstrates scheduling and local sorting behavior; it does not predict production Jellyfin response times.

The independently prepared Boris and Nadia proposals converged on bounded parallel fanout with exact full-union results. The reservation was a service-wide four-request cap and subscriber-aware cancellation: canceling one coalesced caller must leave another alive, while the last cancellation must release work and permit an immediate same-key retry. The implementation keeps start-page refresh behavior and the existing two-view cache. It does not stream provisional results because provider ordering can differ from the app comparator, while exact global pages require the complete union.

The service verifier also checks all five sort modes in both directions with tie-heavy fixtures, title/artist/album coverage, filtering, global deduplication, false-positive album-track rejection, zero-request later-page reuse, album snapshots, pre-aborted requests, session replacement, failing search/browse sibling cleanup, retry, and the global concurrency cap. It passed against service SHA `a699a56d1508c58b431722b91c16d7fdbc2c0b33a073de5da15dfdd2dd6affe6`. Renderer, preload, and IPC transport are covered separately by [catalog-transport verification](../catalog-transport/README.md), which uses the real IPC and QueryObserver path with extracted service code. No native app or live Jellyfin server verification was performed.
