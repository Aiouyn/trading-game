# Unit: V1 alpha telemetry (error logging, basic analytics, feedback)

**Branch:** `eng/alpha-telemetry`  
**Base:** `32e86cb3abdaf1a14df3090158428b7c9ccfb8a2` (`eng/calibration-test-speed`)  
**Worktree:** `/workspace/avalon/alpha-telemetry`  
**When written:** 2026-11-11 21:53:38 Europe/Paris — before product-code edits.  
**Owner:** V1 IN: error logging, basic analytics, feedback. Stacked on the calibration-speed tip. If Gatekeeper findings on earlier heads are forwarded through the parent, those come first.

No external services, no deploy, no third-party scripts, no cookies beyond the existing auth session cookie. `/broker` first-load stays ≤ 215 KB gz (lazy-load the telemetry UI so the guest first-load does not request that chunk).

## Player outcome

- When the client or a same-origin API throws, a short fallback is shown and the server appends a structured JSON line (request id, route, message). No PII or secrets in the log.
- A few named product events are counted server-side under an anonymous id: `signup`, `session_start`, `first_trade`, `first_wire_open`, `statement_post`.
- An in-game **Feedback** button on desktop and phone opens a short form (loaded on click) and POSTs the text plus the current route to a local feedback log.

## Contract

**Logs.** Directory `QUAY_TELEMETRY_DIR` or `.data/telemetry`: `errors.jsonl`, `events.jsonl`, `feedback.jsonl`. One JSON object per line. Tests point the dir at a temp folder and never write the product `.data` tree.

**Error log (server).** `{ ts, requestId, route, message, level }`. `message` is scrubbed (no `Authorization` / `Cookie` / tokens / emails / `acc_…` account ids) and capped (~2k). Request id: honor `x-request-id` or mint a UUID and echo it on the telemetry routes. `POST /api/telemetry/error` (same-origin CSRF, raw body cap, rate-limited) is the client reporter. A React error boundary wraps the shell, shows a private-safe fallback, and posts there. Server helpers can write the same file.

**Analytics.** `{ ts, event, anonId }`. Named events only (list above). Signed-in `anonId` is a hash (`anon_` + sha256, not the account id or handle). Guests may send a localStorage id (not a cookie). Server hooks: `signup` and `session_start` on register/login, `statement_post` on a non-replay accepted post, `first_trade` on the account’s first accepted broker order. `first_wire_open` is posted by the client the first time the Wire app becomes live in that browser (unless opted out). Opt-out-friendly: `localStorage quay.telemetry.optout`, a visible opt-out in the feedback panel, and `DNT: 1` / `Sec-GPC: 1` skip *analytics* (errors and feedback still accepted). Server also honors a local opt-out list of anon ids. No third-party pixels.

**Feedback.** `POST /api/telemetry/feedback` with `{ text, route }`, CSRF-safe, raw body cap, text ≤ 1000 characters, rate-limited. Stored as `{ ts, requestId, route, text }` with the same scrubber. The button (`data-testid=quay-feedback`) is on desktop (status strip) and phone (status bar), visible on first load of `/broker` and `/wire`. Click loads the form chunk (`data-testid=quay-feedback-form`); submit shows a short thanks (`data-testid=quay-feedback-thanks`). Guests may send feedback.

**Budget.** Guest `/broker` first-load gz ≤ 215 KB. The form module is not requested until the button is clicked.

## Acceptance

1. Unit tests: error POST writes a scrubbed JSON line with request id and route; oversize / no-origin rejected; rate limit holds. Events are counted by anon id; signup/session_start/statement_post/first_trade hooks fire once as specified; DNT/opt-out skips analytics; no `acc_` or emails in any log file. Feedback POST stores text+route; cap and CSRF apply.
2. Repo checks (lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, npm test) on the exact head. If launchpad-calibration times out (it should not, after 32e86cb3), isolate and disclose.
3. Affected e2e once on a clean temp tree, fresh `.data`: M2-01, M1-09, WIR-9, WIR-A, M1-10, **and a new desktop+phone feedback journey** (open the button, submit a short note, see thanks; form chunk was not in the document before click). Delete the temp tree. Preview :3199 stays 200. Pre-push stray-init; normal push, no force, no PR. Evidence-only GK-HANDOFF.

## Not in this unit

Third-party APM, email, dashboards, 05/13, Voices, 16:557, 18:204, POLICY/RECOVERY, 07/FX, meme-failure farm. No overall GO.
