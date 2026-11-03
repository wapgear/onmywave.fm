# Song removal queue

Jellyfin's `DELETE /Items/{itemId}` endpoint deletes the item and its file location; its documented user-data update fields have no removal timestamp or tombstone. This sidecar instead records a requested removal and exposes it to a future cleanup worker after a seven-day grace period. It does not delete files or call Jellyfin's delete endpoint. See [Jellyfin's item deletion implementation](https://github.com/jellyfin/jellyfin/blob/master/Jellyfin.Api/Controllers/LibraryController.cs#L335-L375) and the [user-data update fields](https://typescript-sdk.jellyfin.org/interfaces/generated-client.UpdateUserItemDataDto.html).

The service has its own SQLite database. Jobs store a canonical Jellyfin song ID, the first client's UTC removal time, the first server receipt time and the resulting purge time. A globally unique job row supports one cleanup queue; a separate user relation lets the authenticated user retrieve their own removals. The first successful server receipt fixes `purgeAfter` at receipt time plus seven days. Retries preserve both timestamps and add no duplicate request. The client timestamp is retained for display and is never used to decide eligibility. The service never accepts file paths.

## Deploy

Run these commands from the music stack directory that contains `compose.yaml`:

First, copy `server/song-removals/` from this repository into the music stack directory, preserving that path. Then:

1. Create `slskd/secrets/song-removals-worker-token` with a random printable ASCII secret of at least 32 characters. Restrict it to the service account (mode `0600`). The same file is mounted read-only into the API and the pipeline container.
2. Set `ONMYWAVE_ALLOWED_USER_IDS` to the UUIDs of the Jellyfin accounts permitted to request global library removals. Separate multiple UUIDs with commas. Find the IDs in Jellyfin's user management page or API.
3. Ensure the stack root's `song-removals/` data directory exists and is writable by container UID/GID `1000:1000`. Stop the API before backing up this directory so its SQLite database and journal files form a consistent copy.
4. Start the stack with the base compose file and this overlay:

   ```sh
   docker compose -f compose.yaml -f server/song-removals/compose.yaml -f server/song-removals/compose.same-url.yaml config --quiet
   docker compose -f compose.yaml -f server/song-removals/compose.yaml -f server/song-removals/compose.same-url.yaml up -d --build
   ```

The gateway listens inside Docker on port `8097` and forwards all Jellyfin routes plus `/OnMyWave/RemovedSongs` to the appropriate service. The recommended `compose.same-url.yaml` overlay moves the external Jellyfin port from `8096` to the gateway while preserving the same host and port already used by the desktop. This keeps queued removals under the same local server identity. Compose 2.24.4 or newer is required for the `!reset` and `!override` tags. Using only the song-removal overlay publishes the gateway on host port `8097`; switching a desktop connection from `8096` to `8097` creates a different local server identity, so use that option only when no removals are pending. An existing reverse proxy can instead route `/OnMyWave/` to the sidecar and other paths to Jellyfin without changing the client URL. Add TLS at the trusted reverse proxy for remote access; do not expose this plain HTTP gateway directly to the internet.

The overlay adds `SONG_REMOVALS_API_URL` and mounts the worker token into the pipeline, ready for future worker code. The current pipeline ignores these settings. No cleanup worker is included.

## API

The client uses its Jellyfin `Authorization: MediaBrowser ... Token="..."` credential:

- `POST /OnMyWave/RemovedSongs/{songId}` with `{"removedAt":"2026-11-03T14:20:00Z"}` records an audio item visible to an allowlisted Jellyfin user. The response is `{ "songId": "<32 lowercase hex>", "removedAt": "<UTC>", "purgeAfter": "<UTC>" }`.
- `GET /OnMyWave/RemovedSongs` returns that user's requested items in the same shape. The result is capped at 100,000 rows.

The sidecar validates the Jellyfin token by calling `/Users/Me`; it checks that the user is allowlisted before accepting access. A new song ID is checked through `/Users/{userId}/Items/{songId}` and must be an audio item. A retry for an existing ID returns the original job even if Jellyfin no longer exposes that item. A second allowed user can associate their request with that global job.

The future pipeline worker uses its separate bearer secret:

- `GET /OnMyWave/RemovedSongs/due?after=0&limit=100` returns matured rows as `{ "items": [{ "id": 1, "songId": "...", "removedAt": "...", "receivedAt": "...", "purgeAfter": "..." }], "nextCursor": 1 }`.
- Follow `nextCursor` only during the current sweep; restart each later sweep at `after=0`, because more rows may mature after an earlier cursor passed them. `id` is a stable deduplication key. The route grants read-only access. It does not claim or acknowledge jobs, and it does not delete anything.

The worker response intentionally contains Jellyfin IDs and timestamps, not host paths. Future cleanup code must resolve each current Jellyfin item path through trusted server-side metadata and handle missing, changed, or multiply-linked files safely. The current import loop revisits completed originals and recreates missing library symlinks. A future worker must suppress tombstoned IDs in that import loop before unlinking a library entry, or the song will reappear on the next import pass.

Run the manual HTTP integration check with `python3 server/song-removals/verify.py`. It starts a fake Jellyfin HTTP server and the real sidecar in a temporary directory, then checks authentication, per-user item access, idempotent requests, seven-day timing, worker paging, invalid input and database persistence after restart. The script advances only temporary database rows when exercising the due-time boundary; it does not connect to or change a real Jellyfin server.
