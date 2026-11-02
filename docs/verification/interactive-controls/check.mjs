import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const evidence = JSON.parse(await readFile(path.join(directory, 'button-states.json'), 'utf8'));
const initial = (id) => evidence.default.find((control) => control.id === id);
const transparent = 'rgba(0, 0, 0, 0)';
const linkTarget = (control) => control.height >= 32 && Number.parseFloat(control.paddingInline) >= 8;
const checks = [
  ['LINK_TARGET', linkTarget(initial('link'))],
  ['DISCLOSURE_TARGET', initial('disclosure').height >= 32 && Number.parseFloat(initial('disclosure').paddingInline) >= 8],
  ['LINK_HOVER', evidence.hover.link.hover && evidence.hover.link.background === transparent && evidence.hover.link.underline === 'underline' && evidence.hover.link.color !== initial('link').color],
  ['DISABLED_STATES', ['disabled-link', 'aria-disabled-link'].every((id) => evidence.hover[id].hover && evidence.hover[id].background === transparent && evidence.hover[id].color === initial(id).color && evidence.hover[id].underline === 'none')],
  ['KEYBOARD_FOCUS', evidence.keyboard.focus && evidence.keyboard.outline === 'solid' && evidence.keyboard.outlineWidth === '2px' && evidence.keyboard.underline === 'underline'],
  ['LINK_WRAPPING', initial('wrapped-link').height > initial('link').height && initial('wrapped-link').width <= 160],
  ['VARIANT_HOVER', ['secondary', 'primary', 'destructive'].every((id) => evidence.hover[id].hover && evidence.hover[id].background !== initial(id).background && evidence.hover[id].color === initial(id).color)],
  ['NO_HOVER_LAYOUT_SHIFT', Object.entries(evidence.hover).every(([id, control]) => control.height === initial(id).height && control.width === initial(id).width)],
  ['REJECT_BROKEN_TARGET', !linkTarget(initial('broken-link'))],
];
const report = { scope: 'Recorded actual shared Button fixture at 1280x720, light theme. The intentional 12px target must fail LINK_TARGET. This checks finite interaction evidence, not the entire app or WCAG compliance.', checks: checks.map(([rule, passed]) => ({ rule, passed })) };
await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
for (const [rule, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${rule}`);
if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
