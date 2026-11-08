# M2-05 · Quay as a mobile web app (PWA)

## What ships
- `/manifest.webmanifest` (src/app/manifest.ts → src/pwa/manifest.ts): name "Quay · Port Avalon", short name "Quay", start `/`, standalone, dark theme. The icon is the existing quay glyph (`public/quay-icon.svg`, pinned to the glyph source by tests/unit/pwa).
- `/sw.js` (src/app/sw.js/route.ts → src/pwa/swSource.ts), one per build, registered after load in production builds only (never in `next dev` or the e2e hooks build).
- `public/offline.html`: a static offline screen.

## Safety rules
- **Cache allowlist only.** `quay-static-<build sha>` holds `/offline.html`, `/quay-icon.svg` and `/manifest.webmanifest`, nothing else. No HTML pages, RSC payloads, `/api/*`, `/_next/*` or anything personalised is ever stored, so sign-out and account switches cannot leak data through the service worker. App data fetches stay `cache: "no-store"` and auth replies stay `cache-control: no-store`.
- **No offline writes.** The worker never handles a non-GET request. Orders, auth and every write go to the network as before; nothing is queued, stored or replayed.
- **Known-offline boundary in the app** (src/shell/contracts/network.ts). While the browser reports offline:
  - every channel view is held `stale` (useChannel), so Broker's existing freeze disables Review and Place for pointer and keyboard;
  - the ticket says "You're offline. Prices shown are the last received. Place is off until you're back online.";
  - the strip's market phase reads "Offline · not live" with the dashed reconnecting ring and dimmed clock, next to the existing "Offline · read-only snapshot" pill;
  - the order door sends no POST ("You're offline. Nothing was sent.").
- **Lost in flight.** If a Place request may have left and no answer came back, the ticket says "No answer from the server. This order may have gone through. Check Open orders and Positions before placing it again." It never says cancelled. Once the browser reports offline, retrying stops; nothing is re-sent on reconnect. The existing idempotency key and the `me` sync settle what happened. Online transient errors keep the existing same-key retry (3 tries within about a second).
- **Reconnect.** Channels ask for a fresh snapshot. Place needs a fresh estimate and an explicit press; no order is placed automatically.
- **Truthful offline.** Navigations are network-only. Only when the network fails does the worker serve the static offline screen, which shows no prices or balances and says nothing is sent or queued. It checks whether Quay is reachable again (an uncached, cookie-less request for the public manifest, on load, when the browser reports a connection, and every 10 s); when it is, the heading, title and status say "back online" together and it offers Reload. It never reloads by itself. An already-open app keeps its existing "Offline · read-only snapshot" pill.
- **Upgrades.** A new build installs a fresh allowlist and deletes only older `quay-static-*` caches. A new worker takes over silently and nothing reloads the page, so an order ticket in progress is kept.
- **No install prompt.** Quay never shows its own install prompt or listens for `beforeinstallprompt`. Installing is the browser's own UI.

## Install path (player)
- **Android Chrome / desktop Chrome and Edge:** the browser menu's "Install app" / "Add to Home screen" (or the address-bar install icon).
- **iOS / iPadOS Safari:** Share → Add to Home Screen. Safari has no install prompt and ignores SVG manifest icons, so the home-screen icon may be a page snapshot.
- **Firefox desktop:** no install support.
- Verified in automation: Chromium reports no installability errors (`Page.getInstallabilityErrors`) against the production build. Actual OS installation was not performed.
