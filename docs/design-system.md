# Renderer controls

Use these existing shared patterns before adding a new control. Keep domain state, mutations, and permission checks in their current owners.

| Element | Shared implementation | Contract |
| --- | --- | --- |
| Text action | `components/Button/Button.component.tsx` | Secondary, primary, destructive, ghost. Forwards native attributes and refs. Set `type="submit"` for form actions and `type="button"` for cancel or auxiliary actions. |
| Icon action | `components/IconButton/IconButton.component.tsx` | Required label; shared square sizes, native tooltip by default. Preserve state-specific labels and keyboard-shortcut titles. SVG children are decorative. |
| Modal | `Dialog` in `components/Shared.tsx` | Native dialog with a compact fixed header and inset content-only scrolling, named heading, initial focus, Escape/backdrop dismissal, close lock and focus restoration. Use `wide` for editors. Do not create a second modal implementation. |
| Modal actions | `DialogActions` in `components/Shared.tsx` | Shared trailing alignment, spacing, responsive wrapping and readable long labels. Actions remain inside their owning form. |
| Fields | Native input/select/textarea with global field rules | Shared height, surface, border, radius and focus. Native labels and `aria-describedby` associate help/errors. Set `aria-invalid` on known invalid fields. Keep checkboxes, radios, ranges and compact search controls as explicit variants. |
| Short tooltip | Native `title` | Brief action-specific supplemental help. IconButton supplies it automatically and supports a shortcut-rich override. Essential instructions belong in visible text or associated descriptions. |
| Contextual help | `InfoHelp` | Longer explanations use the shared Dialog. Do not put interactive or required content in a title tooltip. |
| Popover frame | `popover-surface` class | Common surface, border, radius and shadow on native popovers. Low-specificity defaults allow local size constraints. FilterSelect and TrackTable retain their distinct placement, focus and keyboard behavior. |
| Listening sidebar | App-owned drawer | Queue, lyrics, song details and DJ share one active drawer, close/Escape handling and trigger focus return. DJ uses an inset panel above the player; its opener is an icon in the bottom-right tools. |
| Tabs | `ConfigurationTabs` | Shared selected/hover/focus styling, arrow/Home/End navigation and roving tab stop. Use associated tabpanels. Settings section navigation remains navigation. |

Common tokens live in `styles.css`: control sizes/gap/radius/focus width, field height/radius/background/border, popover radius/shadow, and dialog padding/radius/background/shadow. Change the shared rule for a common pattern; add a local exception only when its layout or native interaction requires it.

Apple references: [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets), [Offering help](https://developer.apple.com/design/human-interface-guidelines/offering-help), and [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).

Supplementary explanations belong in a named `InfoHelp` beside the relevant heading. Prefer short labels to repeated subtitles and field hints. Keep live state, validation, setup blockers, paid-request authorization, limits and action consequences visible at the point of use. Composite search fields draw one inset focus ring on the container; hidden inputs and custom pickers must retain a visible shared `--focus` ring on their visible control.

## Content and spacing

Give each settings group one heading. Use `SectionHeading` when it needs an explanation, with a short, descriptive help label. Place scheduling rules, defaults, examples, configuration instructions and preview details inside its `InfoHelp`; do not repeat them as a subtitle or paragraph under the fields. Keep related groups together, such as announcement frequency followed by transition timing.

Each page has one primary `h1`. Content embedded below Settings navigation uses `PageHeading as="h2"` for its subsection title and actions, retaining focus refs without repeating a full-size page header.

Keep current state and required actions visible: errors, unsaved/saved feedback, setup blockers, and brief consequences such as “Uses ElevenLabs credits” or “Pauses your music.” The associated help can explain the details. An `aria-describedby` target must exist while the field is rendered; do not point it at content mounted only when help opens. Contextual help opens with Enter, closes with Escape and restores focus to its info button.

Use the shared spacing scale from `styles.css` rather than one-off gaps:

| Token | Size | Use |
| --- | --- | --- |
| `--space-1` | 4px | Small offsets |
| `--space-2` | 8px | Label/control and icon/text spacing |
| `--space-3` | 12px | Help paragraphs and compact groups |
| `--space-4` | 16px | Form rows and heading-to-content spacing |
| `--space-6` | 24px | Form column spacing |
| `--space-8` | 32px | Settings groups and navigation-to-content spacing |

`preference-form` and `preference-fields` own the 16px form gap. Labels inside them have no extra bottom margin; `preference-row` aligns inline controls and wraps when needed. Keep section margins and fieldset margins at zero inside these layouts so spacing is applied once. General settings uses a 32px group gap, without additional section padding or separator borders. Global settings defaults use low specificity and apply section spacing only to direct children, leaving nested provider forms and dialogs to their own layout.

Settings → Playback uses page-owned `SettingsSubsection` disclosures for News & voice, Song announcements and DJ transitions. They start collapsed, show the current configuration and unsaved/saving/error status in the summary, and mount detailed controls only while expanded. A retained draft reopens its subsection when returning to Playback. News/voice, announcements and transitions have independent drafts, validation and save actions; save only the fields owned by that form. Collapsing transitions unmounts and stops its audio preview. The player’s DJ settings shortcut opens Playback and focuses its first visible summary. General retains appearance, account, libraries and updates; Sources, DJs and Provider keys remain separate destinations.

Optional previews use a closed native disclosure instead of a second always-visible instructional section. Expanding it reveals the controls and live feedback; collapsing an active preview stops its audio. Preserve playback and save behavior when simplifying presentation.

## Reuse inventory (28 October 2026)

Shared renderer UI lives in `src/renderer/components/`. Check this directory before adding a control; keep components used only inside one feature in that feature's `components/` folder.

| Pattern | Existing component | Current consumers |
| --- | --- | --- |
| Page section navigation | `SectionNavigation/SectionNavigation.component.tsx` | Settings and News bucket share compact, rounded section buttons, theme colors, hover and selected states. Optional counts stay visible, including zero. Page owners retain their navigation state and behavior; News bucket wraps the same category buttons at narrow widths, preserving visible counts and keyboard access. |
| Heading with contextual help | `SectionHeading/SectionHeading.component.tsx` | Appearance, announcement settings, transition settings, provider keys, News setup, and DJ Voice/Host preferences. Supports semantic h2/h3 headings and local row spacing; forwards heading IDs, refs and focus attributes; keeps heading margins from shifting the help icon. |
| Collection playback actions | `CollectionPlaybackActions/CollectionPlaybackActions.component.tsx` | Albums and Playlists share Play, Play next and Add to end buttons. Callers retain the song order and command callbacks; empty collections disable all three actions. |
| Collection browser and detail | `MusicCollection/MusicCollectionPage.component.tsx`, `MusicCollection/VirtualCollectionGrid.component.tsx` | Albums and Artists share search, virtualized tiles, keyboard navigation, back/focus restoration and track actions. Page wrappers retain their data adapters and domain metadata. |
| Collection header | `CollectionHeading/CollectionHeading.component.tsx` | Albums, Artists and Playlists. |
| Song rows and actions | `TrackTable/TrackTable.component.tsx` | Albums, Playlists and Songs. |
| Select with filtering | `FilterSelect/FilterSelect.component.tsx` | Songs and News setup. |
| DJ identity | `DJAvatar/DJAvatar.component.tsx` | DJ management and News setup. |
| Library selection | `LibraryChooser.tsx`, `LibrarySelection.tsx` | Connection and Settings; the app owns selection lifetime. |
| Provider credentials | `ProviderKeys/ProviderKeys.component.tsx` | Settings and Sources; app-owned edit state. |
| Update UI | `AppUpdates/AppUpdates.component.tsx` | App-level update prompts and Settings. |
| Feedback and common presentation | `Empty`, `ErrorNotice`, `Artwork`, `PageHeading`, `TrackDuration` in `Shared.tsx` | Library pages, setup pages and shared player/sidebar components. |
| Automatic preparation controls | `WorkflowPreferences/WorkflowPreferences.component.tsx` | News setup, with shared preparation-issue types used by News room settings. Promoted out of Settings; component, styles and types stay together. |

Button, IconButton, Dialog, DialogActions, InfoHelp and ConfigurationTabs remain the existing shared primitives described above. Player, Queue, Lyrics, Inspector, DJSidebar, AddPlaylist and RenderErrorBoundary are also centralized app components. `VoicePreview` stays in `pages/DJs/components/`, where DJEditor and DJPreview share it; it has no consumers outside that feature. Page-owned editors and news panels remain beside their pages.

The import audit found no remaining component imports from another page's private `components/` directory. The app still imports NewsBucket navigation types from its owning page; that is a type contract, not a duplicate UI implementation.

## Consistency obligations (2 November 2026)

These rules extend the existing system. Captures, independent block reviews, counterexamples and decisions live in [the consistency audit](verification/design-consistency/README.md).

- `SORT_GROUP`: keep the song sort criterion and direction together when the filter row wraps; retain the shared 8px control gap and existing compact controls.
- `NAV_RESIZE_FOCUS`: keyboard focus on the sidebar separator shows a small neutral grip. Preserve its transient pointer divider and avoid a full-height accent outline.
- `QUEUE_TARGETS`: compact queue reorder controls and grips use at least 24×24px targets. Preserve the 54px row rhythm and the existing hover/focus action pattern, with clear space before Remove.
- `SOURCE_LIMIT`: both source-choice flows explain the 20-source cap and how to recover at the cap. Associate the visible description with its group. Use singular source counts when appropriate.
- `URL_CONSTRAINTS`: feed and server fields describe their accepted address format and report unsupported addresses before submission. Feed URLs use the shared source normalizer; server input mirrors the HTTP(S), no-credentials, no-query/fragment service contract. Main-process validation remains authoritative.
- `TRANSITION_PREVIEW`: editing timings stops the old preview audio while retaining its disclosure state. Collapsing the preview or its parent subsection still stops it.
- `LYRICS_PANE`: expanded lyrics remains a named, nonmodal complementary pane. The covered library is inert; navigation and player controls remain available. Do not imply a modal dialog without modal behavior.

Executable measurements cover registered captures only. Keyboard, saving, recovery and task judgments require their own interaction/review evidence. A green finite rule report does not certify all states, native behavior, accessibility or design quality.
