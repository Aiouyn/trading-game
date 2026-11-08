# M2-05 · Quay as a mobile web app (PWA)

## What ships
- `/manifest.webmanifest` (src/app/manifest.ts → src/pwa/manifest.ts): name "Quay · Port Avalon", short name "Quay", start `/`, standalone, dark theme. The icon is the existing quay glyph (`public/quay-icon.svg`, pinned to the glyph source by tests/unit/pwa).
- `/sw.js` (src/app/sw.js/route.ts → src/pwa/swSource.ts), one per build, registered after load in production builds only (never in `next dev` or the e2e hooks build).
- `public/offline.html`: a static offline screen that shows the last own `me` snapshot read-only with its tick (doc 19 Rule 3.17.5, doc 17 §3.19).
- `src/pwa/meSnapshot.ts`: the one sanitised snapshot record behind it (see below).

## Safety rules
- **Cache allowlist only.** `quay-static-<build sha>` holds `/offline.html`, `/quay-icon.svg` and `/manifest.webmanifest`, nothing else. No HTML pages, RSC payloads, `/api/*`, `/_next/*` or anything personalised is ever stored by the service worker. The only personal data kept for offline is the snapshot record below, and it's not a cached response. App data fetches stay `cache: "no-store"` and auth replies stay `cache-control: no-store`.
- **No offline writes.** The worker never handles a non-GET request. Orders, auth and every write go to the network as before; nothing is queued, stored or replayed.
- **Known-offline boundary in the app** (src/shell/contracts/network.ts). While the browser reports offline:
  - every channel view is held `stale` (useChannel), so Broker's existing freeze disables Review and Place for pointer and keyboard;
  - the ticket says "You're offline. Prices shown are the last received. Place is off until you're back online.";
  - the strip's market phase reads "Offline · not live" with the dashed reconnecting ring and dimmed clock, next to the existing "Offline · read-only snapshot" pill;
  - the order door sends no POST ("You're offline. Nothing was sent.").
- **Lost in flight.** If a Place request may have left and no answer came back, the ticket says "No answer from the server. This order may have gone through. Check Open orders and Positions before placing it again." It never says cancelled. Once the browser reports offline, retrying stops; nothing is re-sent on reconnect. The existing idempotency key and the `me` sync settle what happened. Online transient errors keep the existing same-key retry (3 tries within about a second).
- **Reconnect.** Channels ask for a fresh snapshot. Place needs a fresh estimate and an explicit press; no order is placed automatically.
- **Truthful offline.** Navigations are network-only. Only when the network fails does the worker serve the static offline screen, which shows no market prices, shows the last own snapshot read-only (or says there is none) and says nothing is sent or queued. It checks whether Quay is reachable again (an uncached, cookie-less request for the public manifest, on load, when the browser reports a connection, and every 10 s); when it is, the heading, title and status say "back online" together and it offers Reload. It never reloads by itself. An already-open app keeps its existing "Offline · read-only snapshot" pill.
- **Upgrades.** A new build installs a fresh allowlist and deletes only older `quay-static-*` caches. A new worker takes over silently and nothing reloads the page, so an order ticket in progress is kept.
- **No install prompt.** Quay never shows its own install prompt or listens for `beforeinstallprompt`. Installing is the browser's own UI.

## Offline `me` snapshot
- **What.** The offline screen shows a large "Offline · last update Day D HH:MM" label (doc 17 §3.19), the tick, when this device saved it, cash, cash held for working orders, positions (asset, qty, avg cost) and working orders (side, qty, asset, type and price, status). It says the copy is read-only and not live. It shows no market prices, marks, values, P/L or net worth (those need market data), no handle and no email. Back online, the label reads "Not live · last update …" until Reload.
- **Where.** One localStorage record, `quay.offline.me.v1`, written by the app (src/pwa/meSnapshot.ts) from each server ledger (`/api/broker/me` or an order reply) that a signed-in feed adopts. localStorage is used rather than a Cache Storage entry because it is a simpler built-in: writes are synchronous, so there are no write races, and the static page can read it. The service worker caches no API responses.
- **Allowlist.** `{v, acct, savedAt, tick, cash, held, positions[{asset, qty, avgCost}], orders[{asset, side, type, qty, filled, limit?, stop?, status}]}`. `acct` is the opaque server account id (`acc_` + 32 hex), used only to tell accounts apart; it is not a credential. Not stored: fills, intents, alerts, order ids, session, cookie, token, password hash, handle, email, the raw response. Unknown keys at any level, bad values, more than 64 positions or orders, or more than 16 KB make the record unreadable. Both the app and the offline page then treat it as absent ("No saved snapshot on this device"). The page renders it with `textContent` only.
- **Who may write.** Only the session's current account (set by src/shell/authSession.ts). A ledger from any other feed, such as a late reply for a signed-out account, is refused, so it cannot restore that account's record.
- **When it goes.** Sign-out deletes it, and so does a definite signed-out answer from `/api/auth/me` (expired session) or another account signing in. A network error only stops writes; the record stays for the offline screen. Blocked or full storage keeps nothing and never throws.
- **Device persistence.** The record lives on this device in this browser profile until one of the events above. If a session expires and Quay is never opened online again on that device, the last account's snapshot stays there. Anyone with access to that browser profile could read it, as they could the open app.

## Install path (player)
- **Android Chrome / desktop Chrome and Edge:** the browser menu's "Install app" / "Add to Home screen" (or the address-bar install icon).
- **iOS / iPadOS Safari:** Share → Add to Home Screen. Safari has no install prompt and ignores SVG manifest icons, so the home-screen icon may be a page snapshot.
- **Firefox desktop:** no install support.
- Verified in automation: Chromium reports no installability errors (`Page.getInstallabilityErrors`) against the production build. Actual OS installation was not performed.
