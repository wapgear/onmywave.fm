# DJ readiness verification

The fixture loads the actual renderer through Vite with the existing playback-progress bridge fixture. It supplies disposable local state, songs, and saved news recordings. No server credentials or paid provider calls are used.

Run from the repository root with `node docs/verification/dj-readiness/server.mjs`, then open `http://127.0.0.1:5203`. These are manual browser checks, not an automated test runner.

## Verified behavior

- First use shows preparation, saved audio, playback, paid-generation disclosure, and a direct Manage sources action. The action opens Sources; Back to setup restores focus to the originating setup control.
- `?saved` supplies three eligible recordings and no provider keys. Opening DJ controls and enabling playback leaves preparation off. Closing returns focus to the player DJ trigger.
- `?saved&provider-pending` and `?saved&provider-error` preserve the three-recording count and allow playback. Preparation status labels the provider uncertainty. The ready message says automatic preparation is optional.
- `?pending` shows checking saved recordings; `?unknown` shows unavailable status and Refresh status. Neither claims zero recordings.
- `?different` labels the saved-audio setup profile separately from the active playback profile and offers Review playback profile.
- `?unconfirmed` simulates a saved playback change whose refresh fails. The summary shows Change not confirmed and offers Check playback status.
- `?saved&save-error` rejects the enable request. Playback remains off; the summary shows Save failed, last confirmed Off, and Review DJ controls.
- An unsaved mood edit retains the saved profile's eligibility count, offers Review setup, and does not save or prepare news implicitly.
- `?setup` has configured sources and DJ but no saved recordings or provider keys. Provider keys opens the existing settings page; Back to setup restores the Settings tab and focus.

`results.json` contains DOM observations and fixture state captured during these interactions. The rejected-save fixture returns before recording the successful-save call, so its call list contains only playback preparation. Source review independently checked that no new generation or activation calls were added.

## Visual checks

Before and after images use the same first-use state and News bucket view at 1280×800 and 960×700. Both sizes were visually inspected; the smaller layout stacks the next action below the status facts and has no horizontal overflow.

## Limits

The fixture verifies renderer state, navigation, focus, and bridge calls. It does not verify native audio decoding, audible playback, VoiceOver, real provider status, or first-time-user comprehension. No real keys were entered.
