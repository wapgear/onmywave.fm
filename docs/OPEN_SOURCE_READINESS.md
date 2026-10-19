# Open source readiness

Reviewed 19 October 2026 for `wapgear/onmywave.fm`, which is now public. This records repository preparation, not a signed-off binary release or a legal opinion about asset ownership.

## Prepared

- A full GPL v3 license is present and the package declares `GPL-3.0-only`. The existing license choice is unchanged.
- The README covers requirements, setup, features, provider costs, local data, development, and release limitations.
- Fresh screenshots use the actual renderer, fictional metadata, and built-in placeholders.
- Contribution guidance, issue templates, a pull request template, and a security reporting policy are present.
- Repository metadata and Node.js 24 requirements are recorded in the package and `.nvmrc`.
- Production dependency license texts, including font notices, are collected in `licenses/` and included by the packaging configuration.
- Existing CI checks formatting, lint, TypeScript, build, and production dependency advisories with read-only repository permissions and pinned Actions revisions.
- Local environment files, credentials/certificates, dependencies, build output, and coverage output have ignore rules.

## Open review items

- [ ] Resolve bundled-media rights listed in [third party notices](../THIRD_PARTY_NOTICES.md). The ElevenLabs generation account/plan and the rights to redistribute those recordings are not recorded here. Review the [applicable ElevenLabs terms](https://elevenlabs.io/terms-of-use) and the terms that applied when the clips were created. Record evidence of permissions or replace the assets. Generated portraits and design-reference images also need an origin and rights record.
- [ ] Visually review historical screenshots and evidence, including third party album artwork and desktop context. The new README screenshots avoid those inputs, but this cleanup did not approve all historical images for publication.
- [ ] Run a dedicated secret scanner across all Git refs and review personal data in historical docs. The targeted review below is useful but is not an exhaustive scan. If a real credential is found, revoke it first, then plan any necessary history cleanup with collaborators.
- [x] Enable private vulnerability reporting, secret scanning and push protection, Dependabot security updates, and a main ruleset requiring PRs and CI. Fork workflows require approval for outside collaborators; Actions require pinned commit SHAs. The checked-in ruleset is `.github/main-ruleset.json`. CodeQL produces alerts without being an initial merge gate.

## Before distributing binaries

- [ ] Resolve the media checks above and review dependency/runtime license resources in the packaged app. Include corresponding source and the applicable notices with the release. See the [GNU GPL v3 text](../LICENSE) and [GNU guidance](https://www.gnu.org/licenses/gpl-faq.html) for distribution requirements.
- [x] Configure signed and notarized Apple silicon DMG and ZIP releases. The release script verifies signing, notarization, and installer integrity; `npm run package:mac` remains an unsigned local app-directory build.
- [ ] Verify a clean install and startup on macOS without developer tooling or local credentials. Run a real Jellyfin playback/playlist smoke test and separately authorize any paid-provider checks.
- [ ] Review development-tool advisories before using the packaging pipeline for a public release. The full audit currently reports 8 moderate and 1 low finding through build tooling; the production-only audit reports zero. `npm audit fix --force` proposes dependency changes outside this cleanup and was not run.
- [ ] Write a release changelog and record supported macOS/CPU targets after testing them. Automatic updates now use the existing releases repository, with metadata and blockmaps published by the release script. An installed, signed version-to-version upgrade still needs verification.

## Review evidence and limits

`npm run check` passed, covering formatting, lint, TypeScript, and production build. `npm audit --omit=dev` reported zero vulnerabilities. A full `npm audit` reported the development-tool findings above. No dependency versions were changed by this cleanup.

A targeted text scan of tracked files and 1,648 historical Git blobs reachable from the locally available refs found no matches for common OpenAI/GitHub/AWS token patterns, private-key headers, or HTTP URLs with embedded user/password credentials. Binary files were excluded. This does not detect arbitrary Jellyfin tokens, every provider-key format, credentials absent from local refs, secrets inside images, or personal data.

Fresh All songs and Albums captures were visually inspected. They show the current production renderer with stubbed IPC data, blocked external HTTP(S) requests, and disposable local storage. This is a documentation capture, not live Jellyfin, audio-quality, or provider verification.

TrackTable context-menu and row-styling changes were prepared separately from this documentation cleanup. Historical verification records and product plans were retained because the acceptance documents link to them. The initial OSS cleanup changed no Git history, repository visibility, account settings, or releases. The subsequent naming change made the previous desktop repository private at `wapgear/onmywave-desktop-legacy` and renamed this source repository to `wapgear/onmywave.fm`. This source repository is now public. Repository security settings and branch rules were enabled in the subsequent protection change.
