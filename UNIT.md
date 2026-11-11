# Unit: fail-closed rumor secret + company denials on the Wire

**Branch:** `eng/claims-statements`  
**Base:** `90e8cae79788ca544fb014dc204e298adc50daf3` (`eng/claims-authors`)  
**Worktree:** `/workspace/avalon/claims-statements`  
**When written:** 2026-11-11 19:19:30 Europe/Paris — before product-code edits.  
**Owner:** continue-nonstop after 90e8cae7 was sent to Gatekeeper. Fold in Gatekeeper's b8257aaf qualification on missing-secret snapshots first, then the next playable 15/16 slice. If findings on 90e8cae7 or further findings on b8257aaf arrive through the parent, fix those first (b8257aaf fixes on `eng/claims-resolve`; 90e8cae7 fixes on `eng/claims-authors`).

This unit is two stacked pieces in one batch: (1) fail closed when a rumors snapshot is present but its secret is missing or empty; (2) the smallest coherent player-visible 15/16 step after the farm: a company responds to a pending rumor on the Wire, and that response moves belief per 05.

## 1. Fail-closed rumor secret (b8257aaf qualification)

Gatekeeper's bounded PASS (qualified) on b8257aaf, qualifications, item: "Missing-secret snapshots boot with a newly generated random key rather than refusing to load. That key is not predictable. Already-published truths are preserved."

Today `normalizeRumorSnapshot` and `RumorBook` generate a new `randomBytes(32)` key when a rumors snapshot exists but `secret` is absent or empty, and the book boots anyway. That quietly rotates the HMAC key under stored pending claims (false-kind draws and later farm/desk seals would use a different key than the one that sealed them).

**Behavior in this unit:**

- **Brand-new world** (no storm snapshot, or a storm snapshot with no `rumors` object): still generate a 32-byte hex key, persist it, and run as today.
- **A rumors snapshot exists** (a `rumors` object that normalizes as a book — source, claims list, etc.) **but `secret` is missing or empty**, and no test injection supplies a secret: **do not generate a new key**. Log a loud server error (`console.error` with an unmistakable prefix) and **fail closed by refusing to construct / hydrate the rumor book** (throw a dedicated error). `LiveMarket` does not start that world. Pending claims are not silently re-keyed or resolved under a new secret. Simpler and safer than a half-started book that leaves claims frozen inside a running clock.
- Tests may still inject `opts.secret` / `rumorSecret` explicitly; that is not a silent rotation.
- Pre-rumor storm worlds (`snap.rumors` absent) stay an upgrade path: first rumors boot generates a key.

## 2. Company response: the playable slice

### Observable player outcome

While a catalog rumor (desk or farm) is still **PENDING**, the subject company can issue a **public denial on the Wire** as a `STATEMENT` item. The player can open the feed, see the company respond, and see the rumor's pending price pressure shrink. The rumor itself stays pending: truth remains sealed, and later CONFIRMED / FIZZLED / DENIED is unchanged. A denial does not print `X` and does not resolve the claim.

### Spec cites (export/vision-review/complete)

- **05:849, 05:854–860, 05:864–867** — a claim includes a company rebuttal; credibility is  
  `cr_c = clamp(0.15 + 0.45 × srcRecord + 0.25 × evidence + 0.15 × prestigeReach − 0.30 × rebuttal, 0, 1)`  
  with `rebuttal` **1** if the target published a verifiable rebuttal (12 M4), **0.5** for an unverifiable denial, else **0**. Belief `b_c` is proportional to `cr_c`. This catalog slice still has no evidence refs and no 14 prestige, so those terms stay 0 (already the 90e8cae7 desk formula). This unit adds only the `rebuttal` term.
- **05:860** — the rebuttal term on `cr_c`: `0.5` for an unverifiable denial, `1` for a verifiable rebuttal, else `0`. This unit uses `0.5`.
- **12:520** — the M4 verifiable-rebuttal path (counsel/PR, filings, a 13 case). Scope cite only: that player verb, its cost, and `rebuttal = 1` are **out**. It does not define the `0.5` term.
- **16:565** — at horizon, a false rumor is FIZZLED (70%) or DENIED (30%: "the subject issues a public denial, a news item"). That **resolution-time** DENIED path already exists and is unchanged. This unit's denial is a **mid-pending** Wire statement; it is not a resolution.
- **15:606, 15:625 (§3.10.1 / §3.10.4)** — the Wire carries `STATEMENT`; player statements are a separate `soc.wire.post` verb (≤ 280 characters, $500 fee, 3 per game day, 5-game-day resolve, Voices). Company denials use the existing `STATEMENT` kind so they are visible in the feed. No `channels.ts` / `schema.ts` edit (`STATEMENT` is already a `WireKind`).
- **16:573** — "05 applies no price effect for statements (DEFAULT, Mathis may override: prevents talk-up schemes)." 15:625 says 05 may read player statements with asset tags as bounded sentiment. This unit follows **16:573**: the company denial moves belief only through the **05:860 rebuttal term on the existing rumor claim**, not by treating the STATEMENT as its own 05 impulse. Player-authored statements do not move marks in this unit.
- **22:1164** — `REBUTTAL` claim kind ("offsets an active claim", −0.5 × the rebutted claim, company / 12 M4). Not used here; the 05 rebuttal *flag* on the original claim is the smaller coherent hook.

### Smallest coherent piece — what is in, what is out

**In**

- Fail-closed missing/empty secret, and fail-closed when a `rumors` key is present but not a valid snapshot; a missing `rumors` key still generates a key.
- One unverifiable company denial per eligible pending rumor, published as a Wire `STATEMENT` (`{company} denies the rumor` / FR), with a cause string, the company and asset as entities, and a slot linking it to the rumor id. No `isTrue`, no secret, no `hiddenAccuracy`.
- Scheduling is **seed-only** (never the HMAC secret): a denial tick strictly after `publishTick` and strictly before `resolvesByTick`. Every desk catalog rumor that has room for that tick gets a denial (so TIDE is reliably visible). Farm rumors get a denial on a seeded subset (enough to prove the path; not necessarily all 8/day). At most one denial per claim; idempotent across jump and restart.
- On the denial tick: set `rebuttal = 0.5` on that claim and recompute pending belief immediately.
  - Desk: `claim.cr` becomes `claimCredibility(hits, resolved, 0.5)` = `clamp(0.15 + 0.45 × Beta(2,2) − 0.15, 0, 1)`, so `b_c` shrinks in proportion to `cr`.
  - Farm: the 16:566 impulse has no rebuttal term. Rescale that tick's farm overlay by the same 05 ratio `cr(hits, resolved, 0.5) / cr(hits, resolved, 0)` so the denial shrinks belief without flipping the 16:566 sign. Fresh-author farm impulse stays 0.
- Integer-carry marks, ±0.5 cap, 15-tick true handoff, false 60-tick HL, HMAC seals, lastTick resume, and boot-hydration (not continuation identity) stay as on 90e8cae7. Do not claim 16:564 "never past real due time."

**Out** (cited, not stubbed)

- 12 M4 verifiable rebuttals, filings, 13 cases, `rebuttal = 1`.
- Full **15:625** player statements: `soc.wire.post`, $500 sink, 3/day cap, evidence refs, Voices / `reachWeight`, 5-game-day TRUE/FALSE/OPINION resolve, 13/surveillance on FALSE. The Wire already accepts `STATEMENT`; this unit uses it for company denials only. UI polish for a composer belongs to the UI builder when that verb is built.
- **16:557** paid analyst-note tiers (T1/T2/T3 daily notes, fees, forecasts). Not a free-feed item. NPC analyst claims as a second 05 source are a later slice.
- F15, Circle whispers, tips, Terminal 1-tick head start, player-owned outlets (15:627), POLICY/RECOVERY, 07/FX, meme-failure farm. No `channels.ts` / `schema.ts` edits.

## Acceptance

1. **New world:** no snapshot, or a storm snapshot with no `rumors` object, constructs a book, generates a 64-hex secret, and persists it. Two fresh worlds get different keys.
2. **Missing secret, fail closed:** a rumors snapshot with claims (or an otherwise valid empty book object) but missing or empty `secret`, and no injected secret, throws a dedicated error, logs a loud server error, does not invent a key, and does not boot `LiveMarket`. Injecting a test secret still hydrates that snapshot.
3. **Company denial is visible:** after a desk rumor has been pending through its denial tick, the Wire has a `STATEMENT` item naming the company and denying the rumor, with no `isTrue`. The rumor item stays `phase: "forecast"` / `PENDING`.
4. **Belief moves:** at that tick, the rumor's `rebuttal` is 0.5 and its pending overlay shrinks by the 05 ratio above (desk: via `cr`; farm: via the same ratio on the 16:566 contribution). lnV is unchanged. A later true resolve still prints `X` on the fact-only mark and runs the 15-tick handoff; a later false resolve still does not print `X` and still releases on the 60-tick HL.
5. **Determinism:** same seed + same secret + same tick path → same denial ticks, items, and marks. `advanceTo(jump)` equals tick-by-tick across a window that includes a denial and a resolve.
6. **Restart** is boot hydration: restored tick, `parseWireSnapshot` non-null, denial item and rebuttal flag rematerialized, no second denial, no double `X`. Do not claim continuation hashes after further steps.
7. **Secret stays off** market JSON, Wire JSON, and the client bundle. The denial item does not carry it.
8. **Unchanged:** HMAC seals, 15-tick handoff, farm 20 authors / 8-a-day, M1-09 quiet window (no farm before the first close), WIR-9 fixtures, NEWS, demo crises. Proofs on a clean store only.

## Checks

lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, npm test, then the affected e2e batch once (desktop+phone: M1-09-wire, WIR-9, WIR-A) in a clean temp worktree with fresh `.data`, free port, never :3199 or :3102; delete the temp tree after. Honest proofs. Normal push. GK-HANDOFF. Do not contact Gatekeeper.
