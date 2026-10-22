# Conditional prepared-news recovery

From the repository root, run:

```sh
node docs/verification/prepared-news-recovery/count-scans.cjs
node docs/verification/prepared-news-recovery/verify.cjs
```

The count script loads the actual prepared-news module with a disposable empty library and mocked Electron data directory. Before the change, three concurrent listings caused three recovery directory scans, and three later unchanged listings caused three more. Afterward, concurrent listings share one scan and later listings add zero. Recorded outputs are `before-scans.json` and `after-scans.json`.

All nine integration scenarios in `after-recovery.json` passed. They use the actual prepared-news module and real temporary files, with filesystem barriers/faults, mocked Electron/storage credentials and configuration, fake provider methods, and stubbed provider-settings validation. They cover concurrent readers, fresh missing/truncated recording availability, scan-error retry, preparation waiting for a scan, same-session sidecar/audio recovery, final index commit failure after audio succeeds, active publication before and after audio rename, and request reuse/claim-release history. Final-index recovery retained one script call and one render call rather than repeating provider work.

The overlap check exercises the public preparation entry point, which waits for recovery before provider work. It does not force the later private publication helper to overlap an otherwise unreachable scan. Publication windows are checked separately by blocking audio promotion before and after the actual rename; neither window exposes the active take early.

Formatting, full quality checks, audit, and independent source review passed. No live provider, native IPC, real audio decoding, or forced-process-termination durability was tested. No visible layout changed.
