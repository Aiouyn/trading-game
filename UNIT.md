# Unit: multi-source rumor farm (20 authors, 8 per day)

**Branch:** `eng/claims-authors`  
**Base:** `4606e7aee7abe238b279306fe95bb49e5e2e4d6f` (`eng/claims-resolve`)  
**Worktree:** `/workspace/avalon/claims-authors`  
**When written:** 2026-11-11 18:11:22 Europe/Paris — before product-code edits.  
**Owner:** t130u / "I want everyone to be building none stop, we need to go way faster" (2026-11-11 17:53 Europe/Paris). Next claims slice after 4606e7ae; do not wait on Gatekeeper. If findings on 4606e7ae arrive later, fix them on `eng/claims-resolve` first, then rebase this branch.

## Observable player outcome

The Wire is no longer limited to the one catalog `tide-downgrade` desk rumor. **Twenty named rumor authors** each have a sealed accuracy and a public track record. About **eight new rumors a game day** appear on the Wire, each about a catalog equity, labeled as a rumor, with the **author's name and `hits / resolved` record** (and the public credibility band). While a rumor is pending, its **price impact is weighted by that author's credibility** — an unproven author (record shrunk back to 0.5) does not move the mark. When it resolves, the player sees the true or false outcome on that same item, and the author's record updates.

The catalog desk rumor path from 4606e7ae is unchanged (forecast → belief → CONFIRMED `X` / false 60-tick release). NEWS and demo crises are unchanged.

## Spec cites (export/vision-review/complete)

- **16:188–193** — `RumorSource` (`sourceId`, `actorId`, `nameKey`, `hiddenAccuracy`, `resolved`, `hits`, `stream`); `Rumor` (`rumorId`, `sourceId`, `publishTick`, `resolvesByTick`, `claim`, `isTrue` **SEALED** until resolution, `resolution: PENDING | CONFIRMED | FIZZLED | DENIED`).
- **16:343** — `RUMOR_SOURCE` count **20**, rumor output (§3.6.7).
- **16:562–565** — `PARAM.rumors_per_game_day = 8` world-wide, published by 20 `RUMOR_SOURCE` actors, each `hiddenAccuracy ~ U(PARAM.rumor_accuracy_min = 0.40, PARAM.rumor_accuracy_max = 0.70)` fixed at creation (never shown; players infer it from `hits / resolved`). Generation at day close for the next day: pick a subject; `isTrue = rng < hiddenAccuracy`; horizon U(1, 5) game days; true → CONFIRMED when the event happens; false → FIZZLED 70% or DENIED 30%.
- **16:566** — Price effect: `rumorImpulse = 0.5 × (2·credibility − 1) × expectedMove` (zero at credibility 0.5). `credibility` = the source's track record shrunk to `PARAM.rumor_cred_prior_mean = 0.5` with prior weight `PARAM.rumor_cred_prior_weight = 10`. The same estimator drives the public `credBand` (errata E-56 §3). Fade half-life `PARAM.rumor_fade_halflife_game_days = 1`. 05 applies it to NPC beliefs only (players decide for themselves). Harness gates (20): overall sign-accuracy in [0.50, 0.60]; trading every rumor at publication earns ≤ 0 after costs (out of this unit — no 20 rumor-trader bot here).
- **16:772** — `world.rumor.published` / `.resolved` are PUBLIC (`isTrue` sealed until resolved).
- **16:895 / acc. 33–34** — 8 rumors per game day on average over 30 days (±25%); source accuracies in [0.40, 0.70]; aggregate sign accuracy in [0.50, 0.60] over 200 days; false resolutions 70/30 ± 5% over 1,000 samples.
- **23:1007–1010, 23:1053–1056** — `rumor_accuracy_min/max`, `rumors_per_game_day = 8`, `rumor_fade_halflife_game_days = 1`, `rumor_cred_prior_mean = 0.5`, `rumor_cred_prior_weight = 10`, `rumor_cred_band_low = 0.40`, `rumor_cred_band_solid = 0.65`.
- **17:211 / E-56 §3** — no 0–1 credibility on the Wire; rumors carry `sourceRecord {hits, resolved}` and a server-computed band (LOW / MIXED / SOLID). This unit maps that band onto the existing `sourceBand` field (`low` / `mixed` / `solid`).
- **05:324, 05:847–871, 05:1010–1011** — a rumor does not enter lnV until it resolves; asserted move `a` from the 22 kind table; resolution True → `X` to lnV and 15-tick handoff (no double count); False → 60-tick half-life release.
- **22:1140–1160 / §4.11** — claim kinds and `assertedMove` (log) for rumors (e.g. product delay −0.08, takeover interest +0.15).
- **22:2740** — rumor template "{source} hears that {claim}" (one per `claim.factKind`).

## V1 bounds (not invented design; compress only what this catalog already compresses)

- **This slice:** the 20-author / 8-per-day public farm about **catalog equities**, with sealed truth, public records, credibility-weighted belief, and the same resolve → lnV / revert path as 4606e7ae. Not player statements (15:625, 16:574), not analyst notes, not rebuttals, not F15, not Circle whispers (16:571), not tips, not the 20 rumor-trader bot.
- **Subjects:** 16:563's "open real candidates" (bills, 09 takeovers, 13, shock precursors, earnings) are not in this catalog. Subjects are the **catalog equities**; each rumor draws a 22 §4.11 rumor kind and a sealed `isTrue`. Disclosed as V1 candidate compression, not a rewrite of 16.
- **Horizon:** farm rumors keep the same V1-compressed horizon as 4606e7ae: `resolvesByTick = publishTick + 12 × U(1, 5)` ticks (16:564 game days mapped onto the existing Wire quartet). This keeps the outcome on the same Wire item before `STORY_KEEP` rolls it off. Disclosed; not a 720-tick game-day wait.
- **Generation:** at **day close** (tick `day·720 + 719`) the book draws the next day's 8 rumors, scheduled at 8 distinct ticks in the next day (seeded, not on the catalog `STORY_EVERY` grid when it can avoid it). Exactly 8 per full game day (well inside acc. 33's 30-day ±25% band).
- **Authors:** 20 seeded `RUMOR_SOURCE`s, names from a fixed ordinary-name catalog (22 §0.4 style: given + family; content name-pool JSON is not in this tree). `hiddenAccuracy` sealed per source at creation. The catalog desk source (`wire-desk`) from 4606e7ae stays a separate, single source and is **not** one of the 20.
- **Credibility / belief:** farm rumors use **16:566**, not the 05 Beta(2,2) desk formula. `cred = (hits + 5) / (resolved + 10)`; `impulse = 0.5 × (2·cred − 1) × assertedMove` (0 at cred 0.5, so a fresh author does not move the mark); then the 05 spread (`τ_spread = 30`, so belief is still 0 on the publish tick) and fade with half-life **1 game day** (720 ticks) while pending. The ±0.5 belief cap still applies to the sum of desk + farm overlays. Desk `tide-downgrade` keeps the 05 `cr = 0.15 + 0.45 × Beta(2,2)` path.
- **Public band for farm authors:** E-56 cutoffs on that same `cred` score (`< 0.40` → `low`, `≥ 0.65` → `solid`, else `mixed`). The desk and WIR-9 fixtures keep the existing raw `hits/resolved` band (so "3 of 7" stays mixed and "0 of 2" stays low). No 0–1 credibility on the item. No `channels.ts` / `schema.ts` edit: author name lives in `slots.source` (and an `actor` entity); record stays `sourceRecord` + `sourceBand`.
- **lnV / conservation:** same as 4606e7ae. This slice's lnV is confirmed-rumor `X` only (desk + farm). Pending belief and crisis residuals do not enter lnV. True: print `X`, 15-tick handoff, no double count. False: lnV unchanged, 60-tick release. Tick-by-tick ≡ jump. Restart rematerializes `X` + belief without re-applying `X`.
- **Out:** player statements; analyst notes; rebuttals; F15; Circle whispers; tips; Terminal 1-tick head start; 20 rumor-trader bot / after-cost PnL gate (report sign-accuracy of the farm in proofs; do not invent a trader bot); POLICY/RECOVERY; 07/FX; meme-failure farm; changing `channels.ts` / `schema.ts` unless blocked.

## Acceptance

1. **Twenty authors** exist at clock start, each with a sealed `hiddenAccuracy` in [0.40, 0.70], a stable name, and a public `hits / resolved` starting at 0/0 (band `mixed` under E-56). Accuracies and names are deterministic in the seed.
2. **Eight rumors per full game day**, generated at the previous day close, published on the Wire as `kind: "RUMOR"`, `phase: "forecast"`, with `slots.source`, the claim, `sourceRecord` of **that author**, and the E-56 `sourceBand`. `isTrue` is not on the item. Subjects are catalog equities.
3. **Fresh-author belief is 0** (cred 0.5 → impulse 0) at every pending tick until that author has a record that leaves 0.5. A high-cred author's pending rumor moves the mark in the claimed direction; a low-cred author's impulse is discounted (and can change sign below 0.5) per 16:566. Publish-tick spread is still 0. The desk path is unchanged.
4. **Resolution** matches 4606e7ae: True → same item `realized`, lnV += `X`, 15-tick handoff, no double count, author's `hits` and `resolved` increment. False → `eased`, lnV unchanged, 60-tick HL, `resolved` only, 70/30 FIZZLED/DENIED. After resolution, later farm items from that author show the updated record and band.
5. **Sign accuracy:** hidden accuracies in [0.40, 0.70]; over a long seeded book run the fraction of `isTrue` lies in [0.50, 0.60] (16:895 acc. 33). 8 per day exact is inside the ±25% 30-day band.
6. **Unchanged paths:** catalog RUMOR desk, NEWS, demo crises, M1-09 crises→prices, WIR-9 fixtures.
7. **Determinism:** same seed, same tick path → same authors, rumors, resolutions, marks, lnV, and Wire items. Tick-by-tick ≡ jump across a window that includes a day close, publishes, and a resolve.
8. **Restart:** persist the 20 authors (accuracy + record), farm claims, planned-or-regenerable day book, belief, handoff, and lnV atomically with storm-world. Mid-run stop/start rematerializes `X` and does not double-open a rumor id or re-apply `X`. Older snapshots without `sources` start the 20 authors empty (accuracies from seed; records 0/0).
9. **Proofs** on a **clean store** (fresh `.data`) only. Repo checks + affected e2e once in a clean temp worktree, free port, never :3199.

## Checks

lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, npm test, then the affected e2e batch once (desktop+phone: M1-09-wire, WIR-9, WIR-A) on a clean worktree with fresh `.data`.
