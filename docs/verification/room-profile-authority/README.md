# Room profile authority

Run `node docs/verification/room-profile-authority/verify.cjs` from the repository root. It loads the actual storage and scheduler modules with disposable local-state files. Electron's data directory and the prepared-audio boundary are mocked; no providers are contacted.

All seven scenarios passed: legacy-only seeding; stored profiles winning over stale aliases; canonical alias-free JSON; atomic migration failure and retry; corrupt-profile rejection preserving the file; independent editor/playback selection; all-profile source cleanup; and a scheduled completion updating its owning inactive profile while leaving the active profile unchanged. Source review also checked main's workflow save, profile activation, disconnect/recovery pause, and affected-run mutations. The script does not execute the native IPC handlers.

Renderer verification used the existing fixture server with `window.__fixtureSeed={dj:true,everySongs:1,availableTakes:2}` and no flat state aliases. At 1280×800, open News bucket → Settings. Matched before/after screenshots were visually inspected and retain the same layout and selections.

Added a second profile with mood `Cool` and interests `Space` to fixture state, invalidated the local-state query, then switched the editor through its select. The form showed those values while `djPlayback.roomId` stayed `default-room`. Edited the mood to `Edited cool`; switching displayed the unsaved-changes dialog, and Cancel preserved the edit. Save setup submitted `expectedProfileId: second-room`, the edited mood and `Space` interests, then cleared dirty state. The fixture's save/activate bridge was mocked for these renderer interactions; durable behavior is exercised separately by the file-based check.

No live profile upgrade, native Electron IPC, or paid generation was exercised.
