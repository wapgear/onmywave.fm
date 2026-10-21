# Formatting convention simplification

Run `node docs/verification/format-conventions/verify.cjs` from the repository root. It creates disposable renderer/main source fixtures and removes them afterward. Run it separately from full quality checks so deliberately invalid fixtures are not picked up by another lint process.

Verified that genuine formatting errors fail Oxfmt, formatter output passes, and local multiline exported component props pass type-aware lint. Negative fixtures still fail for renderer Node imports, conditional Hooks, unsafe HTML, synchronous IPC, and insecure Electron options.

Two consecutive `pnpm run format` runs produced byte-for-byte identical tracked files. Production-source changes were checked against the previous revision and consist only of collapsing the extra blank line after imports. Existing companion type files remain. No rendered behavior changed, so no new screenshots are needed.

`pnpm run check` and `pnpm audit` passed. Hooks, workflows, correctness rules, security rules, and React Hooks checks remain enabled.
