# onmywave iOS implementation plan

21 October 2026. Proposed implementation for the [iOS PRD](PRD.md). No Expo application or repository restructuring is implemented by this planning change.

## Recommended stack and alternatives

Use React Native with Expo, TypeScript, Expo Router, development builds, pnpm workspaces and TanStack Query. Start with Expo Audio for the playback feasibility spike. Retain separate Electron and native UIs. The recommendation is based on this app's TypeScript code and native audio requirements, not a universal market ranking.

| Option | Assessment for this app |
| --- | --- |
| Expo with development builds | Recommended. Reuses portable TypeScript, supplies native integration/build tooling and permits custom Swift modules if audio needs them. |
| React Native without Expo tooling | Similar domain reuse, but more native build/configuration work without an identified benefit here. |
| SwiftUI and AVFoundation | Strong native control; requires a second implementation of domain/service logic or a language bridge. Reconsider only if the native audio spike exposes a broader Expo integration problem. |
| Electron UI in a WebView | Reuses markup but does not solve iOS audio lifecycle or deliver the requested native interaction quality. |

Use the current supported stable Expo SDK at kickoff and lock the complete compatible React Native, React, Xcode and native-library set. Use `expo install` compatibility checks and Expo Doctor. Do not force the desktop's React 19.2.7 or Node constraints onto an incompatible SDK. Expo Go is insufficient for validating this app's native build and configuration. [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)

pnpm already manages desktop dependencies. Expo supports workspace monorepos and automatic Metro configuration. Start with workspace scripts and filtered tasks. Turborepo can add task scheduling/caching later, but it does not make code portable or improve iOS background execution. Add it only after measuring a useful cacheable cross-package build workload. [Expo monorepos](https://docs.expo.dev/guides/monorepos/), [Turborepo repository guidance](https://turborepo.dev/docs/crafting-your-repository)

## Repository layout and extraction

Make the existing desktop-light Git repository the common repository. The outer music directory contains several separate projects and is not the monorepo root. Historical desktop requirements mention sibling desktop/ios folders, but no such current iOS app was found. Do not incorporate unrelated checkouts or landing-page repositories.

Initially retain Electron at the repository root to avoid combining an app move with the first mobile work. Add `apps/ios` and `packages/domain`, then `packages/jellyfin` and `packages/news` only when each has a real second consumer. One lockfile owns the workspace. A later optional move to `apps/desktop` must separately update Vite, packaging, CI, hooks, release scripts and asset paths while preserving the bundle ID and installed data directory.

| Current code | Destination and treatment |
| --- | --- |
| `src/shared/playlist-entries.ts`, `shuffle-queue.ts`, `dj-playback.ts`, `news-transitions.ts`, `news-pool.ts`, `workflow.ts`, `sources.ts` | Audit and extract pure functions/contracts to `packages/domain`; inject clock/random/IDs where required. Both apps consume one implementation. |
| `src/shared/types.ts` | Split portable domain/result types from Electron bridge/update/resource types. Do not export the whole Wave API as the mobile architecture. |
| `src/main/jellyfin.ts` | Extract HTTP protocol/normalization/auth ordering into `packages/jellyfin` with injected transport, credentials and persistence. Preserve recovery and permission behavior. |
| `src/main/news.ts`, `prepared-news.ts`, `news-workflow.ts` | Incrementally separate provider/source parsing, eligibility, budgets and recovery from Node crypto/Buffer, files, timers and storage. Put portable orchestration in `packages/news`; keep runtime execution adapters separate. |
| `src/main/storage.ts`, `keychain.ts`, `media.ts` | Keep Electron implementations. Write iOS adapters for Keychain, transactional metadata, files and authenticated native media. `wave-media://` is desktop-only. |
| `src/renderer/player.tsx`, `dj-playback.tsx` | Extract event/state policies only after behavior is characterized. Replace browser audio, animation-frame fades and polling with native playback scheduling. |
| `src/renderer/pages`, components, styles | Rebuild with native components. Reuse copy, validation and query definitions only when DOM/window dependencies have been removed. |
| TanStack Query usage | Reuse server-state patterns; scope keys to account/authentication/library revisions and wire focus/network lifecycle to React Native. Keep queue and drafts outside server cache. |

Enforce package boundaries with TypeScript exports and lint restrictions. Domain packages import neither Electron/Node nor React Native/DOM globals. Platform apps depend on packages; packages never depend on an app. Share data/rules before attempting shared hooks. Avoid a universal component library in this migration.

## Platform contracts

Define narrow operations around actual consumers rather than duplicating every IPC method. Reuse `Result<T>` and error classifications where appropriate.

| Contract | Required behavior |
| --- | --- |
| Credential store | Async read/save/delete with commit ordering, presence/status for UI and explicit secure-store failure. User keys are never bundled app credentials. |
| Jellyfin repository | Auth, library/catalog/lyrics reads and playlist mutations; preserve authentication revision and uncertain-write markers. |
| Media resolver | Resolve ephemeral authenticated stream/artwork resources and conversion offset/duration; revoke on authentication changes. Native transport owns credentials, headers and redirect validation. |
| Playback service | Commands plus authoritative native events for position, occurrence, completion reason, interruptions, route changes and DJ delivery token. Commands carry generation/identity to reject late work. |
| Local repository | Versioned transactions for settings, queue, claims, runs, counters and metadata; durable audio files commit only when complete. |
| Preparation runner | Source/provider execution under saved authorization, request IDs, cancellation, caps, editorial provenance, coverage and uncertain-outcome recovery. |

Use Expo SecureStore for small secrets, Expo SQLite for transactional local state and Expo FileSystem for recordings/artwork. Choose Keychain accessibility that permits the intended locked-device playback after first unlock; avoid per-read biometric prompts on active stream renewal. Test locked access, reinstall persistence and explicit deletion rather than assuming SecureStore behaves like Electron safeStorage. [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)

For audio plus database writes, save to a temporary file, validate completion, move to its durable path and commit metadata. Reconcile orphan/partial files after interruption without generating again. Keep histories and counters transactional. Preserve local identity, schema migrations and per-account queue/cache separation. Provider settings remain app-global as specified in the PRD.

## Audio decision and physical device gate

Current Expo Audio documentation includes playlist APIs, remote-source HTTP headers, background playback configuration and lock-screen metadata. These make it the first candidate, not proof of the app's DJ semantics. [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/)

Before building the complete UI, make a development build on a physical iPhone and prove authenticated Jellyfin playback, native queue advancement and seeking with representative direct and converted files. Verify the pinned SDK's actual APIs rather than relying on latest documentation for another version.

Run IOS-04 through IOS-07 and IOS-11 from the PRD using short fixtures first, then a 60-minute locked session. For DJ transitions use the same saved take over vocal, instrumental and abrupt endings, in both placements. Listen to the recordings and compare transition order, speech completeness, seek retention, pause behavior, next-track entry and delivery history. Inject a crash between reservation, start intent, voice invocation and final-history commit.

JavaScript timers and React renders must not determine background fade timing or queue advancement. The native player owns audio timing. If Expo Audio passes music but lacks reliable mixing/remote commands/durable delivery events, implement a narrow local Expo module backed by AVFoundation. Keep the shared policy contract and Expo build workflow. [Expo Modules API](https://docs.expo.dev/modules/overview/)

React Native Track Player is an alternative to investigate if a verified native queue/remote-command gap remains. Its queue support alone would not prove overlapping DJ playout. Compare the exact release, Expo compatibility, maintenance/license and device behavior before adding it. Do not combine multiple independently controlling audio-session libraries by default.

The gate fails if music stalls at locked track boundaries, tokens leak, remote commands target the wrong occurrence, speech truncates/repeats, fades depend on suspended JS, or interruptions violate pause intent. Do not build around a known failure. Resolve it with the native adapter or explicitly revise scope with Anton. Keep basic transport and DJ claims independently observable so successful music playback cannot conceal failed radio behavior.

## News execution options

| Option | Capability and cost |
| --- | --- |
| Local active-app execution | Fastest proposal. Port source/provider logic, keep BYOK and durable local artifacts, run due checks only while active, pause on background and recover uncertain calls conservatively. No hosted account/operations. Changes availability of automatic preparation. |
| Best-effort OS task | Optional optimization only after the local runner is correct. Cannot promise hourly checks or completed generation. A denied/delayed task must leave honest status. |
| Backend worker | Required if unattended preparation is a release requirement. Adds service auth, tenant isolation, secret custody, scheduler/queue, per-user budgets, artifacts, deletion/retention and operations. |

For the backend option, a server transaction reserves a room run and its article URLs under an idempotency key before any chargeable call. Persist each submitted stage; do not claim exactly-once provider charging where the provider offers no idempotency guarantee. Device termination does not cancel server work unless an explicit authenticated cancellation reaches it. Deliver ready metadata/audio through an authenticated API, independently of push delivery. Keep Jellyfin music direct; do not route music through this backend.

A managed database/auth/object-storage/job service can shorten infrastructure setup, but vendor selection follows the scheduler, data-region, privacy, pricing and retry requirements. No vendor account or subscription is created by this plan. A backend does not automatically solve cross-device queue, room or Keychain synchronization; define that separately if wanted.

## Native interface implementation

Use Expo Router stacks and the supported native tab implementation for the selected SDK. Current docs contain different import paths across SDK versions, including unstable APIs; record the exact version and fallback to supported native navigation components if required. Native materials and tab accessories should follow OS behavior rather than hardcoded glass effects. [Expo native tabs](https://docs.expo.dev/router/advanced/native-tabs/)

Build the navigation, mini-player, Now Playing, song list and one settings form before repeating patterns. Use React Native's list primitives initially and measure on the 10,000-song fixture; add a specialized list library only for an observed limit. Use system image caching/native artwork support, native action menus where available and accessible edit actions. Keep complex motion optional. Apply the project's frontend and code guidelines during implementation.

## Delivery sequence and estimates

Estimates are engineering judgment, not a vendor benchmark or a delivery commitment. Assume one full-time engineer comfortable with React Native and iOS audio, existing Jellyfin fixtures, device/developer-account access and prompt product decisions. They exclude store-review waiting and a backend. Team roles below are proposed owners, not started implementation assignments.

| Milestone | Owner | Depends on | Effort | Reviewable result and exit gate |
| --- | --- | --- | --- | --- |
| 0. Set baseline and resolve lifecycle | Morgan with Anton, Maya and Victor | PRD review | 1 to 2 days | Parity checklist, scheduling decision, device/server matrix, SDK/native dependency pins and distribution-rights check started |
| 1. Prove native audio | Maya | 0 | 3 to 5 days | Physical development build with authenticated streams, locked queue/remote commands, interruption/seek tests and both DJ placements. Produce findings and native-module estimate. |
| 2. Establish shared packages | Boris/Nadia review, Maya integration | Stable contracts from 1 | 3 to 5 days | pnpm workspace, portable rules and first Jellyfin client extraction consumed by both apps; desktop checks and focused desktop smoke pass |
| 3. Deliver music client internally | Maya with Steve/Elena review | 2 | 5 to 8 days | Connection, libraries, browse/search, native queue/player, restoration and failure recovery. Not the final parity release. |
| 4. Complete music operations | Maya | 3 | 3 to 5 days | Playlist writes/recovery, lyrics, accessible editing and native route/control polish |
| 5. Complete personal radio | Maya with Boris/Nadia review | Audio gate and 4 | 7 to 12 days | Rooms, source/DJ management, keys, previews, preparation/history/files and native DJ delivery with all lifecycle/recovery cases |
| 6. Harden and submit candidate | Morgan coordinates reviews | 5 | 4 to 7 days | IOS-01 through IOS-14 evidence, privacy/rights/review access complete and TestFlight candidate ready |

Base effort is 26 to 44 engineering days, roughly 6 to 9 working weeks with contingency. The high-risk radio milestone may grow if native mixing or provider portability needs more work. A custom native audio adapter adds an initial planning allowance of 5 to 10 days. Backend scheduling adds an initial allowance of 10 to 20 days plus operating costs and review; re-estimate after its contract is designed. Do not quote a full-parity App Store delivery date from the music-only milestone.

Each milestone changes one concern in reviewable PRs. Characterize behavior before moving it, keep extraction and phone UI changes separate, and run focused desktop checks after any shared change. Never combine the monorepo move, new audio engine, provider redesign and visual rewrite into one PR.

## Verification and release operations

Use manual device checks and focused integration/end-to-end flows for the affected behavior. Do not add a unit-test framework by default. Keep repository formatting, lint, TypeScript, production build, dependency/security checks and hooks. Add workspace-aware checks so a shared package change validates both consumers. Mobile validation includes Expo Doctor, compatible dependency checks and a release-mode iOS build.

Use a deterministic local Jellyfin fixture for paging, account races, uncertain writes and converted audio; retain at least one live compatible Jellyfin verification. Use fixture providers for preparation stages and failures. Paid live validation requires explicit spend authorization; implementation can progress with fixtures until that check. Record what was audible, simulated, fixture-backed or live.

Keep short device logs free of keys/URLs with secrets and capture screenshots for UI changes at matching states/viewports. Review the PRD acceptance IDs with device model, OS, app/SDK version, server version, build revision and result. Profile startup, memory, battery/thermal behavior and playback over the locked session, especially during foreground preparation. No quantitative battery claim is made before measurement.

Use local Xcode/Expo development builds during the spike; EAS Build and Submit are a convenient distribution path. Configure development, preview and production profiles and keep Apple credentials out of PR jobs. TestFlight precedes production submission. [EAS Build](https://docs.expo.dev/build/introduction/)

Use App Store releases for native changes. EAS Update is optional after release; if adopted, pin compatible runtime versions and stage/rollback updates. It cannot deliver new native modules or replace store review obligations. [EAS runtime versions](https://docs.expo.dev/eas-update/runtime-versions/)

Before submission, provide a working review account/catalog and explain optional AI setup without exposing real user keys. Review GPL-3.0-only distribution compatibility, dependency/media rights, privacy labels/manifests, AI data-sharing consent, BYOK/payment rules and background-mode use. These are concrete release gates for the existing code and optional provider workflow. [Apple review guidance](https://developer.apple.com/app-store/review/guidelines/)

## Network compatibility work

Prefer HTTPS. A user-configured Jellyfin server may use local IPs, `.local` names, reverse-proxy paths or nonstandard ports. Validate API, artwork and AVFoundation transport separately. ATS exceptions and local-network privacy are different mechanisms. Use the narrowest justified configuration and exercise local HTTP/HTTPS, public HTTPS, IPv4/IPv6, denied permission and invalid/self-signed certificates on the supported OS versions. Do not globally disable transport security to make a sample server work. Public insecure servers may need an explicitly documented unsupported state if a safe release configuration cannot support them. [Apple local networking ATS key](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking), [Apple transport security](https://developer.apple.com/documentation/security/preventing-insecure-network-connections)

The native player must support authenticated ranges and conversion seek offsets without credentials embedded in URLs. Verify cross-origin redirects for streams and artwork, not just JSON requests. If a third-party player cannot enforce the boundary, use the native resolver rather than weaken it. Preserve cancellation/revocation when credentials or accounts change.

## Planning review and current evidence

Maya and Victor independently inspected the implementation and proposed architectures, then challenged the backend and playback assumptions. Both support Expo and pnpm workspaces without initial Turborepo. Both accept local provider execution only with an explicit scheduling limitation. Their reservation is that active-app preparation is not complete lifecycle parity with desktop. Morgan's planning decision is to present that as a product choice and preserve backend scheduling as the route if unattended preparation is required.

The source inspection established actual shared rules, browser-dependent playback, Electron media/credential/storage boundaries and local scheduled news execution. Official Expo documentation established available integration APIs and background-task limits. No iOS app, physical-device audio test, Expo compatibility build or App Store approval is claimed. Milestone 1 is designed to falsify the largest implementation assumption before most of the UI work.
