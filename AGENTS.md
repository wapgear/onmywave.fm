# desktop-light conventions

Run `pnpm run format` after editing code, then `pnpm run check` before handing it over. The Quality workflow runs the same checks. Prefer focused manual or end-to-end verification for behavior changes; do not add unit tests unless requested.

## Commits and pull requests

Work on a feature branch and submit a PR to `main`. Keep the installed pre-commit hook and server-side required checks enabled; do not bypass them. Run `pnpm run format`, then `pnpm run check` before committing. Keep untrusted PR code out of privileged workflows, use SHA-pinned actions and least-privilege tokens, and keep release credentials out of PR jobs. See [contribution guidance](CONTRIBUTING.md) for hook setup and repository protections.

## Formatting and ordering

Oxfmt owns import sorting and ordinary formatting. Oxlint runs Stylistic for statement spacing. Oxlint requires exactly two blank lines after the final import, including before comments. Use one blank line:

- Between top-level declarations and statements, including types, constants, functions, classes, and exports.
- Before and after `useMemo`, `useCallback`, and `memo` declarations.
- Before and after effect statements.
- Before a JSX return. Compact guard clauses and callback returns may stay compact.

Import groups are Node builtins, external packages, internal modules, relative modules, and styles. Keep imports before executable code and merge duplicate imports from the same module. Side-effect imports keep their execution order, especially fonts, CSS, and initialization modules. Do not add a competing import sorter. Oxfmt collapses the two-line import gap; the format command restores it with Oxlint, and the format check normalizes only that gap before comparing Oxfmt output.

Put exported or multiline component types and multiline props in colocated `ComponentName.types.ts` files, using `import type` in components and consumers. For pages, use the page stem, such as `Settings.types.ts`. Keep single-line, non-exported aliases and single-line inline props in their current module. If another extracted type needs a local alias, move that alias into the type file too, since it is now shared. The `local/component-types` lint rule rejects exported aliases/interfaces, multiline aliases/interfaces, and multiline component props in renderer source files. It also catches local declarations exported through an export list. Type-only imports and re-exports from companion files remain allowed.

For new components, prefer imports, any retained local types, module constants/helpers, then components. Inside a component, prefer context/state/refs and data hooks, derived values and memos, callbacks/handlers, effects, then guards and JSX. Dependencies take priority over this reading order. All Hooks must run unconditionally before early returns. Never mechanically sort Hooks, dependency arrays, or executable declarations.

## React

Keep render pure and props/state immutable. Derive values during render instead of mirroring them with effects. Use effects to synchronize external systems, and clean up subscriptions, timers, audio, and requests. Include every reactive dependency; explain any narrowly necessary disable directive.

Use `useMemo` and `useCallback` for measured work or required stable identity. Do not add them to every expression. Define components at module scope, use stable keys, and preserve accessible names, keyboard access, and focus behavior. Render untrusted source text as text; raw HTML is prohibited by lint.

Oxlint runs the recommended React Hooks checks plus component/hook factory validation through its JavaScript plugin host. It also runs type-aware correctness checks, including unhandled and misused promises. Oxlint explicitly checks JSX keys, duplicate props, unsafe HTML, children props, state mutation, and external-link protection. These checks supplement behavior review.

## Electron

Renderer code uses the typed `window.wave` API. Static and literal dynamic Node/Electron imports are prohibited there. Keep credentials, filesystem access, provider calls, and validation in main. Preload exposes named capabilities and strips IPC event objects from callbacks; never expose raw `ipcRenderer` or generic IPC methods.

Keep context isolation, sandboxing, and web security enabled. Do not enable Node integration, insecure content, experimental features, or webviews. Use asynchronous IPC and validate the sender frame and input in main before privileged operations. Lint guards common unsafe syntax, but aliases and computed configurations still require review.

Preserve the restrictive CSP, custom application protocol, denied navigation/new windows, permission handlers, validated external URLs, encrypted credential storage, and cancellation during disconnect/quit. Keep blocking I/O and long CPU work off the UI thread. Keep Electron and production dependencies patched. Broad dependency upgrades and architectural refactors require their own scoped work.

References: [React rules](https://react.dev/reference/rules), [React Hooks lint rules](https://react.dev/reference/eslint-plugin-react-hooks), [effects](https://react.dev/learn/you-might-not-need-an-effect), [memoization](https://react.dev/reference/react/useMemo), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc), and [Electron performance](https://www.electronjs.org/docs/latest/tutorial/performance).
