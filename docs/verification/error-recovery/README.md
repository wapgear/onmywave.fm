# Render recovery verification

Run `node docs/verification/error-recovery/server.mjs` from the repository root, then open `http://127.0.0.1:5204`. This is a manual fixture of the actual renderer with synthetic audio and the existing playback-progress bridge. It uses no credentials, live Jellyfin server, provider keys, or paid calls.

The fixture instruments SongsPage and ReadyApp to throw an error containing a fake credential and private URL marker. Its controls and hidden DOM output expose synthetic audio, queue identity, bridge-call counts, and captured diagnostic labels. Reset fixture clears its disposable session-storage checkpoint; it does not access real application data.

## Scenarios exercised

1. Start music, navigate to Albums, then Fault page. Before the change this removed the player and navigation. After the change only the selected route is replaced by a readable fallback. The same queue keys, current occurrence, and audio instances remain; music stays playing. Play/pause and navigation to Albums still work. Advancing the synthetic clock during failure updates the player position to 50 seconds.
2. On All songs, Arm page fault, then type in Search. Removing the focused input moves focus to the fallback heading. Clear fault, then activate Retry page with Enter. The restored All songs heading receives focus. Navigation away from failure preserves focus on the selected sidebar button. Collection-detail retry targets were independently reviewed to prefer their Back buttons.
3. Open `?dj`, start music, Schedule fixture news, and End current song. While the synthetic DJ is on air, arm a page fault and type in Search. The same speech, audio-instance count, queue, and current occurrence survive failure and retry. End speech advances to the second queue occurrence once. The fixture records one delivery start and one heard write.
4. Change volume after a position update to save a fixture checkpoint, then Fault shell. The broader fallback states that music may have stopped and offers Reload app. Its removed audio instances are paused, and focus moves from the removed route control to the root fallback heading. Enter on Reload app restores the last saved second occurrence at 10 seconds with playback paused. Session storage substitutes for the main-process store here; this does not test native process persistence.
5. Page and shell faults produce only the static `[render-error] caught` diagnostic label. The fake secret, private URL, raw error, and component stack are absent from the recovery UI and captured diagnostics. React root error callbacks are explicitly configured because React otherwise reports errors by default. See [React createRoot error reporting](https://react.dev/reference/react-dom/client/createRoot#error-logging-in-production).

`results.json` records the observed identities, counters, focus targets, and reload outcome. Audio-instance counts include the fixture's discarded Strict Mode instance; unchanged counts across page failure and retry establish that recovery did not create another player.

## Visual checks and limits

Before/after screenshots show the same playing two-song fixture after the same page exception at 1280×800 and 960×700. Fixture controls are hidden in the captures. The baseline is blank because the uncaught render error removed the entire React tree. Both recovered layouts were visually inspected. A separate image records the broader fallback.

The fixture verifies renderer orchestration and synthetic delivery, not audible output, native decoding, VoiceOver, real providers, or production preload/IPC. Standard React error boundaries cover rendering and lifecycle failures. Existing request and action error paths still handle asynchronous and event-handler failures. A root failure unmounts playback providers; continuity is promised only for a contained page failure, and reload can recover only the last saved checkpoint.
