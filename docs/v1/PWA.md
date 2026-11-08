# M2-05 · Quay as a mobile web app (PWA)

## What ships
- `/manifest.webmanifest` (src/app/manifest.ts → src/pwa/manifest.ts): name "Quay · Port Avalon", short name "Quay", start `/`, standalone, dark theme. The icon is the existing quay glyph (`public/quay-icon.svg`, pinned to the glyph source by tests/unit/pwa).
- `/sw.js` (src/app/sw.js/route.ts → src/pwa/swSource.ts), one per build, registered after load in production builds only (never in `next dev` or the e2e hooks build).
- `public/offline.html`: a static offline screen.

## Safety rules
- **Cache allowlist only.** `quay-static-<build sha>` holds `/offline.html`, `/quay-icon.svg` and `/manifest.webmanifest`, nothing else. No HTML pages, RSC payloads, `/api/*`, `/_next/*` or anything personalised is ever stored, so sign-out and account switches cannot leak data through the service worker. App data fetches stay `cache: "no-store"` and auth replies stay `cache-control: no-store`.
- **No offline writes.** The worker never handles a non-GET request. Orders, auth and every write go to the network as before; nothing is queued, stored or replayed. The Broker's existing bounded in-flight retry (3 tries within about a second, same idempotency key) is unchanged.
- **Truthful offline.** Navigations are network-only. Only when the network fails does the worker serve the static offline screen, which shows no prices or balances and says nothing is sent or queued. It checks whether Quay is reachable again (an uncached, cookie-less request for the public manifest, on load, when the browser reports a connection, and every 10 s); when it is, it says so and offers Reload. It never reloads by itself. An already-open app keeps its existing "Offline · read-only snapshot" pill.
- **Upgrades.** A new build installs a fresh allowlist and deletes only older `quay-static-*` caches. A new worker takes over silently and nothing reloads the page, so an order ticket in progress is kept.
- **No install prompt.** Quay never shows its own install prompt or listens for `beforeinstallprompt`. Installing is the browser's own UI.

## Install path (player)
- **Android Chrome / desktop Chrome and Edge:** the browser menu's "Install app" / "Add to Home screen" (or the address-bar install icon).
- **iOS / iPadOS Safari:** Share → Add to Home Screen. Safari has no install prompt and ignores SVG manifest icons, so the home-screen icon may be a page snapshot.
- **Firefox desktop:** no install support.
- Verified in automation: Chromium reports no installability errors (`Page.getInstallabilityErrors`) against the production build. Actual OS installation was not performed.
