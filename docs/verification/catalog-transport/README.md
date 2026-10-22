# Catalog cancellation transport verification

Run `node docs/verification/catalog-transport/verify.cjs` from the repository root. It uses the actual renderer catalog helper, TanStack Query observer lifecycle, preload API, main IPC registration and cancellation functions, and Jellyfin service. TypeScript parses the main source and selects the named functions and declarations, so the assertions exercise the current implementation rather than a copied handler. Electron's transport and server fetch are replaced with disposable in-memory fixtures.

The scenarios verify cancellation before dispatch, cancellation reaching upstream fetch, a surviving shared caller, query-key replacement without an error or retry, cancellation after the last observer unsubscribes, sender/frame validation, request-ID validation and duplicate rejection, late cancellation, and renderer teardown cleanup. The request registry must be empty at the end.

This is a focused integration check. It does not launch native Electron, operate an installed application, verify native navigation events, or measure real-server timing. The renderer changes affect request lifecycle and retain the existing markup, controls, and loading/error presentation. Large-catalog measurements and service-specific lifecycle checks are in `../catalog-responsiveness/`.
