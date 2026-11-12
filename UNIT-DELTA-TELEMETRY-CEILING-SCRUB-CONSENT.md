# UNIT-DELTA: telemetry disk ceiling, secret scrub, and 21 opt-in

**Branch:** `eng/alpha-telemetry`  
**Base:** `72410cc82683b71f50e3fc3e1db379323686dabc`  
**Worktree:** `/workspace/avalon/alpha-telemetry`  
**When written:** 2026-11-11 22:46:41 Europe/Paris — before product-code edits.  
**Owner:** Gatekeeper **NO-GO** on 72410cc8 (REVIEW in `/workspace/avalon/evidence/launchpad/gatekeeper/72410cc8/`). Disk is unbounded: unauthenticated same-origin POSTs append `errors.jsonl` / `events.jsonl` / `feedback.jsonl` with no rotation or byte cap; the rate limit only slows the fill. That is B1. B2 is the incomplete scrub. Four cheap quals fold into the same batch. Charge path is unchanged. Do not raise the 215 KB first-load budget.

This delta does not replace UNIT.md. It tightens the V1 telemetry contract.

## B1 — Hard byte ceiling

Every file under `QUAY_TELEMETRY_DIR` (or `.data/telemetry`) is subject to a hard cap, and the directory as a whole has a hard cap.

- Per live jsonl file: **64 KB**. When an append would pass that, rotate: `name.jsonl` → `name.jsonl.1` → `name.jsonl.2` → `name.jsonl.3`, dropping the oldest. At most **4** files exist per stream (live + 3 rotations).
- Directory: **1 MB** total (every file in the dir, including rotations and the server secret). If an append would pass the dir cap, drop the oldest rotated files across streams until it fits; if it still would not fit, **reject the write** (the HTTP handler returns 503 for that POST). Never grow past the ceiling.
- Appends stay serialized on the existing write chain so concurrent POSTs cannot race past the cap.
- Proof: a unit flood (and a small HTTP flood) that would have grown without bound instead leaves the directory at **≤ 1 MB**, with at most 4 files per stream.

## B2 — Scrub secrets (matrix proof)

`scrubTelemetryText` (applied to every logged message, route, and feedback text, including stack strings) must:

1. Fold like the statements PII matrix (`foldForPersonalData`): NFKC, strip ZWSP / format / control chars, fold `[at]` / `(at)` / `{at}` and spaced `at` to `@`.
2. Strip **query strings and fragments** from every logged URL (http(s), protocol-relative, and path-style), including URLs inside stack traces. `?token=` and `#frag` never land in a log line.
3. Redact **IPv4**, **IPv6** (including `::1`), **phone** numbers, and **email** (plain, fullwidth, ZWSP-split, and folded `[at]` / `(at)`).
4. Keep the existing Authorization / Bearer / Cookie / JWT / `acc_…` redactions and the 2k cap.

A matrix unit test lists each case (input → must not appear, must contain `[redacted]` or a query-stripped URL). Gatekeeper's missed rows from `proof/telemetry-scrub.json` are in the matrix: `alice[at]example.com`, ZWSP-split email, `+33 6 12 34 56 78`, IPv4, IPv6, `?token=` in a URL and in a stack.

## Quals (same batch)

1. **Streaming body cap.** `TELEMETRY_MAX_BODY_BYTES` (4096) is enforced while reading the request stream. The handler never buffers a body past the cap (no full `arrayBuffer()` of an oversize payload). Oversize still returns 400 “Request body is too large.” Proof: a chunked/streamed body larger than the cap is refused, and the stream is cancelled after the cap (bytes pulled ≤ cap + one chunk).
2. **Salted anon id.** `anon_` is HMAC-SHA256 of the account id with a **per-world server secret** as the HMAC key (never concatenated as a prefix, never sent to the client, never logged). The secret is created and persisted on first use under the telemetry dir (mode 0600) when the dir is empty of logs; if logs already exist and the secret is missing or empty, **fail closed** like the rumor secret (do not mint a new key; refuse analytics hashes). Tests inject the secret. Knowing only `acc_…` must not be enough to compute the anon id.
3. **Per-client rate limit.** The existing per-kind numbers (30 errors / 30 events / 8 feedback / 8 opt-out per 60s) apply **per client**: session token hash when signed in, guest `anonId` when present, plus IP when `QUAY_TRUST_PROXY=1`. A global backstop (120 errors / 120 events / 32 feedback / 32 opt-out per 60s) still applies so a swarm cannot fill the disk at unbounded concurrency. One client hitting its cap must not 429 a different client.
4. **21 first-launch opt-in.** Analytics are **off** until the player Accepts (DNT / Sec-GPC still skip). A small unobtrusive first-launch prompt (Accept / Decline) is **lazy-loaded** so the guest `/broker` first-load does not request that chunk (same rule as the Feedback form: not before interaction; budget stays ≤ 215 KB). Decline is remembered; Accept is remembered and POSTed to the server so hooks honor it. The Feedback panel remains the in-game place to revoke or grant. Errors and feedback stay accepted without consent. Server hooks (`signup`, `session_start`, …) do not write analytics for an anon id that has not consented.

## Acceptance

1. UNIT-DELTA written first (this file). Matrix + flood + streaming + HMAC + per-client rate-limit unit proofs.
2. Exact-head checks: lint, typecheck, build, check-hooks, route-budget /broker (≤ 215 KB, consent and feedback form chunks **not** in the first-load list), ledger map-no-dup, official `npm test`.
3. Affected e2e once on a clean temp tree, fresh `.data`, desktop and phone: Feedback journey (form still not requested before click) and the first-launch consent prompt (Accept / Decline persist; analytics stay off until Accept). Delete the temp tree. Preview :3199 stays 200.
4. Pre-push stray-init; normal push, no force, no PR. Evidence-only delta GK-HANDOFF.

## Not in this delta

Raising the 215 KB cap. Admin reader for feedback.jsonl. ZWSP-vs-`\b` on short negation markers. 16:557, 18:204, POLICY/RECOVERY, 07/FX, meme-failure farm. No overall GO.
