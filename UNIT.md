# Unit: player Wire statements (`soc.wire.post`)

**Branch:** `eng/player-statements`  
**Base:** `19dd11861f102e5f812850c185f34dbc13a55cdf` (`eng/analyst-notes`)  
**Worktree:** `/workspace/avalon/player-statements`  
**When written:** 2026-11-11 20:11:26 Europe/Paris — before product-code edits.  
**Owner:** continue-nonstop after 35803f3f and 19dd1186 were sent to Gatekeeper. First player-facing claim verb: a signed-in player posts a short statement about an asset on the Wire. If Gatekeeper findings on 19dd1186, 35803f3f, or earlier claims heads arrive through the parent, fix those first (on their own branches).

## Player outcome

A signed-in player can post a short public statement about a listed asset from the Wire panel, on desktop and phone. The post costs **$500** game cash, taken atomically (insufficient cash is rejected, no row). A player may post at most **three times per game day**. The statement appears on the Wire as a **STATEMENT** that names the player's handle. It has **no direct price effect**. Guests cannot post. A second account can see the public statement and cannot see the first account's cash or other private ledger.

## Spec cites

- **15:625 / 15:766** — `soc.wire.post` `{ text, assetTags, evidenceRefs }`: ≤ 3 per game day; fee; text filter → STATEMENT.
- **15:625 §3.10.4** — ≤ 280 characters; fee `PARAM.wire_post_fee_real = $500` (23:954); sink `WIRE_POST_FEE` (15:747); max 3 per game day per character.
- **16:573 §3.6.10** — statements are never `impactHint`ed; **05 applies no price effect for statements** (DEFAULT; prevents talk-up schemes). This slice follows that default.
- **15:307–308** — STATEMENT is already a WireKind. Do not add a kind.
- **15:828 / 16:573** — player statements are the player-facing path (NPC analysts already use STATEMENT as a note). Company denials and T1 notes stay as they are.

## Design

### Intent and API

`POST /api/wire` is the first playable `soc.wire.post`. GET `/api/wire` stays a public read (no account, no write). POST requires a signed-in session (guests 401). Body: `{ idempotencyKey, text, assetTags }` only (no `evidenceRefs` this slice). At least one and at most three asset tags; each must be a listed catalog `assetId`.

Idempotency: same key + same fingerprint returns the first decision and does not charge or append a second row (existing broker key rules: 8–64 `[A-Za-z0-9_-]`, conflict 409 when the key was used for a different body).

### Fee, cap, cash

Fee is **50_000 cents** ($500). Debit **spendable** cash (`cashCents - reservedCashCents`) so working BUY reserves are not stolen. If spendable < 50_000, reject, write nothing. Starting cash remains $10,000 (`START_CASH_CENTS`), so a fresh account can post. The reason code is `WIRE_POST_FEE` (SINK) on any receipt the ledger already has a place for; do not invent a second money path.

Cap: 3 posts per **game day** per account, using `dayOfTick` of the live market tick. A fourth post that day is rejected; cash unchanged. A new game day resets the count. Count published posts by this account for that day (idempotent retries of an accepted post do not consume an extra slot).

Atomicity: the cash debit, the public Wire row, the cap count, and the idempotency record are committed in **one** `AuthService` lock and **one** store save (extend the auth snapshot with a public `wirePosts` array). A failed save rolls back all of it. Do not debit in the auth store and append the row somewhere else.

### Text: length and sanitizing

- Trim, NFC, strip C0/C1 control characters (keep newline as space).
- Length ≤ **280** Unicode code points after sanitize; empty text is rejected.
- Personal-data patterns (emails, phone numbers) are **rejected** (21's chat rule, applied as the wire text filter).
- Profanity and slurs from the existing Launchpad abuse floor (`ABUSE_TERMS` in `moderate.ts`) are **masked** in the stored and displayed text (21), not stored raw.
- Server is the authority; the client may preview the limit but cannot bypass it.

### Wire row (public)

Id `w-p-${id}` (no collision with `w-${tick}`, `w-h-*`, `w-r-*`, `w-d-*`, `w-a-*`). Kind **STATEMENT**. Headline key `wire.statement.player` (EN/FR), slots include `handle`, `text` (sanitized), `asset` / company, `authorId`. Entities: the tagged asset(s) and an actor for the handle. `causeKey` `wire.cause.player-statement`. **No `effects`, no `isTrue`, no `sourceRecord` / `sourceBand`** (no resolution yet). `publishTick` is the live market tick. `retainStories` / `STORY_KEEP` apply like other rows; pending-rumor holds are unchanged (these ids are not rumor ids).

GET `/api/wire` **merges** durable player posts into the clock's stories (sorted by tick then id). Player posts are **not** clock catalog stories and do not go through `publishStory` / `applyShock` / `openRumor` / the rumor book. Mid-run LiveMarket restart still shows them, because they live in the auth store, not in the clock epoch. A second process is out of scope (same single-process auth limit as today).

### No price effect (16:573)

Do not call `applyShock`, `applyLogMove`, `openRumor`, or write a rumor claim. Marks, M1-05 golden, M1-09 live catalog schedule, and digest4000 versus 19dd1186 stay unchanged. Do not claim digest identity if an unrelated file is touched; this unit must not move marks.

### Persistence, isolation, restart

- Public: the STATEMENT row (handle, text, assets, tick). Any signed-in or guest GET of the server Wire may see it once it is on the merged feed (guest fixtures remain the mock feed, as today).
- Private: cash, reserved cash, positions, orders, fills, idempotency records, remaining daily cap. `GET /api/broker/me` is the caller's ledger only. A second account's `me` does not include the first account's cash or keys. The Wire item must not carry cash or other ledger fields.
- Restart: FileAuthStore rematerializes `wirePosts` and cash; GET `/api/wire` still lists the posts; the cap still counts them. Idempotent retry after restart still returns the first decision.

### Composer (minimal)

Signed-in only, in the existing Wire panel (`Feed` / `App.tsx`), both desktop and phone. Follow existing Wire CSS, chips, 28/44 hit targets, focus ring, EN+FR strings. A compact control (a "Post a statement" disclosure or equivalent) so the **default** signed-in chrome stays close to today: M1-09 "the story and its effect fit" on a 390 / 520 window, and WIR-A `?empty=1` / guest fixtures, must not grow a permanent composer stack that breaks those tests. Opening the disclosure lets the player pick 1–3 listed assets, type ≤ 280, see the $500 fee and remaining posts today, and submit. The UI builder polishes later. No new filter chip (Statements already exists). No `channels.ts` / `schema.ts` edits unless a parse rejects a legal STATEMENT (it should not).

## Acceptance

1. Signed-in POST with valid text, one listed asset, spendable cash ≥ $500, under the daily cap: 200, STATEMENT `w-p-*` on GET `/api/wire` with the handle and sanitized text, cash down by exactly 50_000 cents, `WIRE_POST_FEE`. Quotes unchanged vs a no-post reference at the same tick.
2. Insufficient spendable cash: rejected, no row, cash unchanged. A 4th post in the same game day: rejected, no 4th row, cash unchanged. Empty, too long, PII, or bad/missing asset tags: rejected, no charge. Guest POST: 401, no write.
3. Same `idempotencyKey` + same body: first decision replayed, no second charge or row. Same key + different body: 409.
4. After a process restart on the same FileAuthStore, the row and the cash debit are still there; a replay of the same key does not charge again.
5. Account B sees A's public STATEMENT and does not see A's cash or private ledger.
6. Composer works on desktop and phone for a signed-in player; guests do not get it. Repo checks (lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, npm test) on the exact head. Affected e2e once on a clean temp tree, fresh `.data`, including M2-01, M1-09, WIR-9, WIR-A, **and a new desktop+phone spec** that posts, sees the statement, checks cash dropped by 500, hits the cap, refreshes and sees it persist, and confirms a second account cannot see the first's private state. Delete the temp tree. Preview :3199 stays 200; never bind :3199 or :3102. Pre-push stray-init check (`pf@test` `init`, `tracked.txt`); normal push, no force, no PR.

## Follow-ups (out unless a tiny hook is required for coherence)

- 5-game-day TRUE/FALSE/OPINION resolution (`PARAM.statement_resolve_game_days`).
- 05 belief / surveillance / 13 manipulation on false factual claims (16:573 already forbids a direct price effect in this slice).
- Voices, `reachWeight`, followers-only distribution, evidence refs (up to 5).
- 15:828-adjacent NPC outlet mastheads; player `soc.wire.mute`.
- Full 21 moderator queue (`HELD_FOR_REVIEW`).

## Not in this unit

Paid analyst tiers, company-denial changes, POLICY/RECOVERY, 07/FX, meme-failure farm. No 16:564 due-time claim. No overall GO.

## Checklist

- [ ] UNIT.md written and committed before product-code edits.
- [ ] Post API, atomic fee, cap, sanitize, merge onto GET `/api/wire`, tests, proof (no product `.data`).
- [ ] Minimal signed-in composer, EN+FR, desktop and phone.
- [ ] Checks on the exact head; affected e2e in a temp tree including the new spec; delete the temp tree.
- [ ] Pre-push stray-init check; normal push; GK-HANDOFF under evidence only.
