# Listener acceptance sessions

Use these sessions to check whether a first-time listener can use the music player and optional radio without coaching. Fourteen open inventory rows require observed listener evidence. The other fourteen require engineering, live-service or device evidence. This protocol prepares those observations; no listener session has been run or passed.

The original protocol baseline is merged main commit `93fcb02f700ffc103bdc0422b80378e455e9ba84`, including the player-shortcut and library-retry fixes. The 17 October provider-edit revision adds the conditional pending-key case to Task 10 before any cohort has started. Record the actual app revision in each session. Use at least 1280×720 at 100% app zoom. Smaller windows and enlarged zoom remain deferred.

## Participants and scoring

Run one pilot to find ambiguous prompts and setup mistakes. Keep its results separate. The planned validation cohort is five first-time listeners who have not developed or reviewed this app, including people who want music only and people who want their own radio. A participant who read the expected results below is no longer an uncoached participant. This small sample describes the observed cohort, not the whole user population.

Read only the participant prompt for each task. Observe silently. Asking the participant to explain their understanding is part of the task; naming a control, suggesting a route or correcting a mistaken choice is help. Record the first attempt before giving help. Stop if the participant asks to stop.

Each of ten tasks scores one unassisted success only if its observable result is met within its time limit. Help, a wrong result, abandonment or timeout scores zero. Record the cause and any later assisted success separately. The time limits are test boundaries, not product performance promises. Allow about 45 minutes per session, including preparation between tasks.

The planned denominator is 50 first attempts. The usability milestone requires at least 45 unassisted successes, plus all critical checks below. Do not drop difficult tasks, unfinished sessions or participants after seeing results. A facilitator/setup fault invalidates that attempt; document it and arrange a replacement attempt before calculating the final cohort result. Revise the protocol or cohort only before the validation starts, preserving the earlier version. A pilot, partial cohort or agent walkthrough cannot establish the 90% milestone.

Any lost edit, exposed credential, unrequested paid work, silent selected-recording replacement, automatic retry of uncertain paid work, duplicate advancement/replayed speech, or inaccessible essential control blocks acceptance regardless of the score. Incorrect understanding of preparation cost or the independence of the two radio switches also blocks acceptance. The full current requirements, individual inventory checks and final denominator audit remain mandatory even if this task score reaches 90%.

## Facilitator preparation

Use an isolated installation/account and disposable app data. Do not copy personal provider credentials into a fixture or publish credentials in notes. Verify both opt-ins are off before the music-only task. Supply the listener with the server/account information they need through the normal private channel, not in the results sheet.

Prepare and dry-run the following states on the recorded revision before inviting a participant:

- A reachable music library with an album, meaningful metadata and audible tracks. Ordinary listening must work with no AI keys.
- A source and preset host available for optional setup, while retaining the real empty/setup actions where the task requires them. Begin Task 2 with Advanced manual tools collapsed.
- Two clearly different profiles with separate names, settings and activity. One profile is being edited and the other is selected for playback. The facilitator identifies these starting conditions to the participant without showing the controls used to change them.
- A fresh matching saved recording, an empty pool, a named partial-source warning, global reviewed history, and a saved script with an unsaved edit. Stage these between tasks; do not alter state secretly during a task.
- Short audible music or a suitable near-ending position so Task 4 can observe a natural song ending. Record how the starting state was prepared.
- A controlled failure of the preparation stop save for Task 6. Keep the normal renderer, preload and service path. Name the substituted failure in the results; it is not a real disk-outage claim.
- For Task 9, actual source-backed provider output with recorded source URLs/dates, saved provenance and separate authorization for its provider requests. A facilitator checks factual support against the sources before playback. Previously generated local audio may be replayed without new generation. Substitute recordings can test UI discovery, but cannot pass S12 or D19, or the live portion of D10.

Do not enable or dispatch paid work merely to stage a session. The cost-understanding tasks can stop before activation. Any later real activation needs the account holder's explicit choice. Record substituted and live inputs separately. If a required live input is unavailable, keep that row open rather than treating the substitute as a pass.

## Tasks

The expected results are for the facilitator. Show the participant only the prompt column, one task at a time. Keep exact spoken observations and wrong turns in the notes rather than summarizing them as a pass.

| Task | Participant prompt | Observable result | Limit | Main checks |
| --- | --- | --- | --- | --- |
| 1 | Listen to an album you choose. Find its artist and remaining time. Pause it, then get a different song ready without making sound. | Finds ordinary music without radio setup; reads the table/player comfortably; paused Next/Previous retains pause and the chosen song is ready. Note confusing controls or text. | 3 min | V06,V16,Q11 |
| 2 | Keep your music available while setting up a host for science news. Choose what interests you and how the host should sound. Visit your music and return before saving. | Finds optional setup and shared management, returns with the full draft, explicitly saves it, and does not unintentionally enable either opt-in. Manual tools remain collapsed unless deliberately opened. | 6 min | V06,V16,T01,Q11 |
| 3 | Before spending credits, tell me what will choose your music, what creates new news, what lets you hear it, and what could cost money even if no recording is made. | Understands the listener chooses music, mood describes delivery, preparation and playback are separate, text assessment can cost without audio, required providers and limits are visible, and manual work/previews are outside automatic limits. Do not activate to obtain an answer. | 3 min | A02,D03,R02,Q11 |
| 4 | Hear an already saved news update at a song ending using the profile named by the facilitator. Then try the same setup when no recording is ready. | Finds saved-news playback, chooses the intended profile, separately enables breaks, recognizes the suitable-ending wait, and understands that an empty pool leaves music playing. No generation is requested. | 4 min | R02,D05,Q11 |
| 5 | Pause your music. What happens to future news preparation? Now return to music-only listening while keeping new stories prepared for later. | Correctly distinguishes music pause, DJ playback off and preparation off. Disabling breaks does not claim preparation stopped or discard saved audio. | 3 min | A13,R02,Q11 |
| 6 | Stop future automatic preparation for the named profile. The first attempt did not save. Go to your music, return, and finish stopping it. | Notices failure, retains the draft and visible retry, successfully stops the intended profile, and can still use saved news. Does not mistake music Pause or Disable DJ for stopping preparation. | 3 min | A13,Q11 |
| 7 | Tell me which profile is preparing news, which is being heard, what the last check did, what happens next, and where this story came from. Explain the source warning. | Correctly identifies different editing/playback contexts, named status/counters and next check, global reviewed history, source references and incomplete coverage. No stale status is read as current. | 4 min | A11,R02,S12 |
| 8 | Review and change the wording of a news update. Find out what creating a new version would cost, then return to normal listening without creating one. | Deliberately finds the collapsed manual tools, understands the text/voice cost boundary, retains the edit through navigation, and sends no preparation or voice request. | 3 min | T01,A02,V16 |
| 9 | Listen to a news break over music and one between songs. Choose the approach you prefer. Tell me what you understood and anything that sounded wrong or interrupted you. | Finds the transition controls, understands waiting/empty-pool behavior, hears intelligible source-backed delivery without clipping, doubled speech or an abrupt cutoff, and can explain the story. Record relevance, names/pronunciation, volume and interruption ratings separately. | 6 min | S12,D05,D10,D19 |
| 10 | You want to leave this music account. Before confirming, explain what will be lost, what stays on this Mac and whether a request already sent could still cost money. Cancel once, then sign out. | Finds sign-out, understands unsaved draft loss, retained profiles/keys/recordings, preparation pause and possible charges. Cancel preserves state; explicit confirmation leaves the account signed out without silently resuming preparation. When the facilitator stages a pending provider-key save, understands the conditional notice that it can finish after sign-out, while entered key text is cleared. | 3 min | A14,Q11 |

For Task 9, collect independent 1–5 ratings for intelligibility, comfortable music/voice balance and interruption quality, plus the listener's own explanation of the story. Record specific words that were unclear. A passing listening observation requires intelligible delivery, comfortable balance and interruption ratings of at least 4, correct understanding of the story, and no clipped/repeated speech. Keep subjective preference between transition styles separate from defects. These ratings do not prove source factual accuracy or billing; retain the independent live evidence too.

## Session record

Create a result record only after a real session. Until then, leave the result fields empty. Store no passwords, tokens or unnecessary identifying information.

| Field | Record |
| --- | --- |
| Session | Pseudonymous ID, date, pilot or validation, first-time status and relevant familiarity with music apps |
| Environment | Exact app revision, macOS version, architecture, display, viewport/zoom and audio output |
| Inputs | Isolated account/profile names, live or substituted source/audio, provenance reference and provider authorization reference |
| Each task | Start/end time, unassisted result, observed route/wrong turns, help, reason for failure and exact comprehension answer |
| Critical checks | Each invariant observed, contradicted or not exercised, with evidence location |
| Listening | Exact story explanation, unclear names/words, each rating, preferred transition and concrete playback defect |
| Follow-up | Reproduced issue, fix/PR, and fresh verification; never overwrite the original failed observation |

After a session, link evidence to each relevant inventory row and retain its named proof kinds. One successful route cannot close every variant in a broad row. Review failures, change the app or wording, and verify the affected behavior before another uncoached session. Record whether later participants used a different revision; do not combine revisions into a single acceptance claim without reviewing the changes. Use fresh participants to verify discovery changes. A returning participant can verify a recovery fix, but cannot count as a new first-time observation.

## Other evidence still required

These fourteen open checks do not contain a U proof requirement. Several still need a human operator, real service or device. No app change is presumed from an unverified check.

| Check | Evidence that would close the gap |
| --- | --- |
| V10 | Actual native titlebar dragging and traffic-light/window behavior in desktop context, complementing the existing minimize/restore/full-screen evidence |
| V11 | Actual bundled-font/translucency legibility on standard and Retina display scales |
| V12 | Implemented app captured with real desktop context, clearly distinguished from the generated concept |
| C06 | Empty access followed by a real Jellyfin access grant, with Retry recovering without reauthentication |
| P05 | Live read-only permission behavior and the unknown-lookup branch, matched with the existing controlled permission evidence |
| M16 | Physical media controls on the actual paused/playing music and active-speech session |
| M17 | Actual supported Jellyfin conversion/codec playback and seeking, with the tested combination named |
| A05 | Actual sleep/quit/return behavior and one coalesced due check, with dispatch/history evidence and no backlog |
| S03 | Actual entitled X recent-search delivery and useful partial results, with bearer secrecy retained |
| Q06 | Complete essential-control names, visible focus and keyboard operation, including pending/failure states and source groups |
| Q08 | Actual recovery actions outside live status/error announcements and usable loading/error/empty states across the required flows |
| Q09 | VoiceOver operation through music, setup, pending/failure/recovery and dialogs |
| Q10 | Explicitly named supported macOS/architecture/display combinations and actual hardware integration |
| Q13 | Current source-to-inventory completeness and individually reviewed critical-invariant evidence before any completion or overall percentage claim |

The [acceptance checklist](ACCEPTANCE_CHECKLIST.md) remains authoritative for all 187 rows, including the two deferred checks. This guide does not promote any row or replace the 27 STAR stories, seven parent gates or original requirement denominator.
