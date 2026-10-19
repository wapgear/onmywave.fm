# Contributing

Start with the [README](README.md) to run the app. Use Node.js 24 and npm, and keep `package-lock.json` in sync with dependency changes.

## Issues

Search existing issues before opening a new one. For a bug, describe what you did, what you expected, and what happened. Include macOS, app revision, and Jellyfin versions. Screenshots should hide server URLs, account details, API keys, and private library information. Report security issues using [SECURITY.md](SECURITY.md).

For a larger feature or dependency change, open an issue first so the scope can be discussed. The project is in early development; an issue or pull request does not guarantee a response or merge date.

## Pull requests

1. Fork the repository and create a branch for one focused change.
2. Read [AGENTS.md](AGENTS.md) for the source conventions.
3. Make the change and manually exercise the affected flow. Use a disposable library for playlist writes and local sample data for screenshots.
4. Run `npm run format`, `npm run check`, and `npm audit --omit=dev`.
5. Describe the problem, the resulting behavior, what you verified, and any checks you could not run. Include before/after screenshots for visible changes.

Prefer focused manual or end-to-end verification. New unit tests and test frameworks are not required by default. Do not bypass existing CI checks. Provider-backed checks are optional and may cost money; state whether you used fixtures or live services.

Keep filesystem access, credentials, and provider calls in main. Expose named operations through the typed preload bridge. Preserve renderer isolation and validate IPC inputs. Avoid unrelated refactors and broad dependency upgrades.

Do not commit `.env` files, tokens, personal app data, generated builds, or recordings from private sources. Bundled artwork, fonts, audio, and other assets need provenance and redistribution rights. Update [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the bundled license texts when dependencies or assets change.

Contributions must be compatible with the project's [GPL-3.0-only license](LICENSE). Preserve upstream copyright and license notices.

Treat contributors respectfully. Keep feedback about the work, avoid harassment or personal attacks, and respect people's privacy. Maintainers may close or remove abusive contributions.
