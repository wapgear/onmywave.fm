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

Optional previews use a closed native disclosure instead of a second always-visible instructional section. Expanding it reveals the controls and live feedback; collapsing an active preview stops its audio. Preserve playback and save behavior when simplifying presentation.
