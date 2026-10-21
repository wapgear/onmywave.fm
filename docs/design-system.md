# Renderer controls

Use these existing shared patterns before adding a new control. Keep domain state, mutations, and permission checks in their current owners.

| Element | Shared implementation | Contract |
| --- | --- | --- |
| Text action | `components/Button/Button.component.tsx` | Secondary, primary, destructive, ghost. Forwards native attributes and refs. Set `type="submit"` for form actions and `type="button"` for cancel or auxiliary actions. |
| Icon action | `components/IconButton/IconButton.component.tsx` | Required label; shared square sizes, native tooltip by default. Preserve state-specific labels and keyboard-shortcut titles. SVG children are decorative. |
| Modal | `Dialog` in `components/Shared.tsx` | Native dialog, named heading, initial focus, Escape/backdrop dismissal, close lock and focus restoration. Use `wide` for editors. Do not create a second modal implementation. |
| Modal actions | `DialogActions` in `components/Shared.tsx` | Shared trailing alignment, spacing, responsive wrapping and readable long labels. Actions remain inside their owning form. |
| Fields | Native input/select/textarea with global field rules | Shared height, surface, border, radius and focus. Native labels and `aria-describedby` associate help/errors. Set `aria-invalid` on known invalid fields. Keep checkboxes, radios, ranges and compact search controls as explicit variants. |
| Short tooltip | Native `title` | Brief action-specific supplemental help. IconButton supplies it automatically and supports a shortcut-rich override. Essential instructions belong in visible text or associated descriptions. |
| Contextual help | `InfoHelp` | Longer explanations use the shared Dialog. Do not put interactive or required content in a title tooltip. |
| Popover frame | `popover-surface` class | Common surface, border, radius and shadow on native popovers. Low-specificity defaults allow local size constraints. FilterSelect, TrackTable and DJPopover retain their distinct placement, focus and keyboard behavior. |
| Tabs | `ConfigurationTabs` | Shared selected/hover/focus styling, arrow/Home/End navigation and roving tab stop. Use associated tabpanels. Settings section navigation remains navigation. |

Common tokens live in `styles.css`: control sizes/gap/radius/focus width, field height/radius/background/border, popover radius/shadow, and dialog padding/radius/background/shadow. Change the shared rule for a common pattern; add a local exception only when its layout or native interaction requires it.

Apple references: [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets), [Offering help](https://developer.apple.com/design/human-interface-guidelines/offering-help), and [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).
