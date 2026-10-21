# News-only workflow migration

Run `node docs/verification/workflow-news-only/verify.cjs` from the repository root. This loads the real workflow and storage modules, mocks only Electron's user-data location, and uses disposable files.

Verified legacy weather that is valid, malformed, or absent preserves enabled news, cadence, interests, daily limits, assessment counters, and run history. Weather is removed from returned settings and persisted profiles. An injected atomic rename failure preserves the original settings file; retry completes the migration.

Before this change the legacy weather property remained, and the fixture failed its no-weather assertion. No renderer or visible interface changed. This does not verify an installed application's upgrade on a real user profile.
