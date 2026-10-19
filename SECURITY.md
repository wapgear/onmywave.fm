# Security policy

## Reporting a vulnerability

Do not post credentials, exploit details, or private app data in a public issue.

Use [GitHub private vulnerability reporting](https://github.com/wapgear/onmywave.fm/security/advisories/new), which is enabled for this repository. If the form is temporarily unavailable, open a public issue asking for a private contact method without including vulnerability details. A dedicated security email and response SLA are not currently established.

A private report should include the affected revision, operating system, reproduction steps, likely impact, and a minimal example with synthetic credentials and data.

## Supported versions

The project is in early development. Security fixes target the latest main branch; there is no maintained release support matrix yet.

## Handling local data

The app handles Jellyfin credentials, provider API keys, source content, listening state, and generated recordings. Review screenshots and logs before sharing them. Never attach the contents of `~/Library/Application Support/onmywave-light/` or Keychain exports to an issue.

Jellyfin tokens use Electron safeStorage, with session-only sign-in when protected storage is unavailable. OpenAI and ElevenLabs keys can be shared with other onmywave apps through macOS Keychain. Source snapshots, scripts, audio, and general settings are local files and should not be treated as encrypted secrets.

Use HTTPS for remote servers. Treat source content and server metadata as untrusted input. Preserve the isolated renderer, sandbox, restrictive content security policy, validated external URLs, and explicit IPC operations when contributing.
