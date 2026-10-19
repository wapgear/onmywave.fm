# Contributing

Start with the [README](README.md) to run the app. Use Node.js 24 and pnpm 10.34.7, and keep `pnpm-lock.yaml` in sync with dependency changes.

## Issues

Search existing issues before opening a new one. For a bug, describe what you did, what you expected, and what happened. Include macOS, app revision, and Jellyfin versions. Screenshots should hide server URLs, account details, API keys, and private library information. Report security issues using [SECURITY.md](SECURITY.md).

For a larger feature or dependency change, open an issue first so the scope can be discussed. The project is in early development; an issue or pull request does not guarantee a response or merge date.

## Local commit checks

`pnpm install --frozen-lockfile` installs the tracked `.githooks/pre-commit` hook for this checkout. Existing custom hooks are preserved; include the commands from this hook in your own setup. Run `pnpm run hooks:install` to install it again after cloning or moving the checkout. CI and source archives do not install Git hooks.

The hook rejects commits on `main`, obvious credential/private-key filenames, generated output, staged whitespace errors, and failures from `pnpm run check`. It checks the working tree without rewriting files or changing the staging area. For partially staged changes, GitHub CI checks the actual submitted tree. Filename checks do not detect every secret; GitHub secret scanning and push protection provide the server-side checks for supported secret formats.

## Pull requests

1. Fork the repository and create a branch for one focused change.
2. Read [AGENTS.md](AGENTS.md) for the source conventions.
3. Make the change and manually exercise the affected flow. Use a disposable library for playlist writes and local sample data for screenshots.
4. Run `pnpm run format`, `pnpm run check`, and `pnpm audit`.
5. Describe the problem, the resulting behavior, what you verified, and any checks you could not run. Include before/after screenshots for visible changes.

Prefer focused manual or end-to-end verification. New unit tests and test frameworks are not required by default. Do not bypass the local hook or required CI checks. Provider-backed checks are optional and may cost money; state whether you used fixtures or live services.

Keep filesystem access, credentials, and provider calls in main. Expose named operations through the typed preload bridge. Preserve renderer isolation and validate IPC inputs. Avoid unrelated refactors and broad dependency upgrades.

Do not commit `.env` files, tokens, personal app data, generated builds, or recordings from private sources. Bundled artwork, fonts, audio, and other assets need provenance and redistribution rights. Update [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the bundled license texts when dependencies or assets change.

Main requires a pull request, an up-to-date branch, passing `quality` and `dependency-review` checks, and resolved review threads. Force pushes and branch deletion are blocked. Approval count is zero so the solo maintainer can merge their own PR; ownership in `.github/CODEOWNERS` requests maintainer review without blocking self-authored PRs.

Dependency review rejects newly introduced advisories of moderate severity or higher, including development dependencies. Upgrade or remove the affected dependency before merging. Any justified advisory exception must be narrow, documented in the PR, and reviewed by the maintainer; do not weaken the global severity threshold. CodeQL scans JavaScript/TypeScript and GitHub Actions on PRs, pushes to main, and weekly. Its alerts require maintainer triage and are not initially a required merge check. Dependabot proposes weekly updates and security fixes; updates are not automatically merged.

Fork workflows need maintainer approval for outside collaborators. Workflows use commit-pinned actions, read-only checkout credentials, and no release or provider secrets. Never run untrusted PR code with `pull_request_target` or on a self-hosted runner. Signed release publishing remains a separate maintainer operation.

Contributions must be compatible with the project's [GPL-3.0-only license](LICENSE). Preserve upstream copyright and license notices.

Treat contributors respectfully. Keep feedback about the work, avoid harassment or personal attacks, and respect people's privacy. Maintainers may close or remove abusive contributions.
