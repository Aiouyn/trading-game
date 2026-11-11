# Unit: Wire rumor claims resolve and move lnV

**Branch:** `eng/claims-resolve`  
**Base:** `110583b0aa73ece1dc3b856665f3be0405f1acc3` (`eng/market-calibration`)  
**Worktree:** `/workspace/avalon/claims-resolve`  
**When written:** 2026-11-11 17:49:59 Europe/Paris — before product-code edits.  
**Owner:** t128u / "please continue to work" (2026-11-11 17:46 Europe/Paris). Next single code unit after Gatekeeper code PASS on 110583b0.

## Observable player outcome

A **RUMOR** on the Wire is an unresolved claim, not a finished fact. While it is pending, it can move the named asset's **price** through the 05 §6.3 belief overlay, but it does **not** move fundamental value **lnV**. When the claim resolves, the player can see the **true or false outcome on that same Wire item**, and in the **price**:

- **True (CONFIRMED):** the owner path delivers the real value shock `X` to **lnV**, and the belief overlay hands off (no double count). The item becomes `phase: realized` and shows the value price effect.
- **False (FIZZLED or DENIED):** lnV is unchanged; belief releases and the price recovers. The item becomes `phase: eased`.

Verified **NEWS** and demo **crisis** stories are unchanged: NEWS remains a permanent print at publish (a known fact); crises still use forecast → hit/eased residuals (04:1033).

## Spec cites (export/vision-review/complete)

- **05:324** — A shock with uncertainty (a rumor, a claim) does **not** enter `lnV`; it enters the belief overlay until it resolves.
- **05:847–851** — A claim is a statement not yet a verified fact (15 Wire post, 16 `Rumor`, …). 05 reads the structured claim, never the text. Asserted move `a_c` from the 22 kind table, or the size the owner module would give the fact if true.
- **05:854–867** — Overlay `b_c = a·cr·reach·(1−e^{−age/τ_spread})·decay`, `τ_spread = PARAM.mkt_belief_spread_ticks (30)`, decay half-life `PARAM.mkt_belief_hl_days (5)`, `b` capped at ±0.5. `b` enters the price; `lnV` is unchanged while unresolved.
- **05:869–871** — Resolution. **True:** owner module delivers real value shock `X` to `lnV` (§3.3.4); `b_c` is released over `PARAM.mkt_belief_handoff_ticks (15)`; no double count. **False:** `b_c` releases with half-life **60 ticks**; the source's record updates.
- **05:1010–1011** — Acc. 48: a credible false claim moves the price then reverts with a 60-tick half-life. Acc. 49: a true claim hands off from BELIEF to the fact with no double count.
- **16:188–193** — `RumorSource` (`hiddenAccuracy`, `resolved`, `hits`); `Rumor` (`publishTick`, `resolvesByTick`, `isTrue` **SEALED** until resolution, `resolution: PENDING | CONFIRMED | FIZZLED | DENIED`).
- **16:562–565** — Rumors: `hiddenAccuracy ~ U(PARAM.rumor_accuracy_min = 0.40, PARAM.rumor_accuracy_max = 0.70)` never shown; players infer it from `hits / resolved`. `isTrue = rng < hiddenAccuracy`. Horizon **U(1, 5) game days**. True → CONFIRMED when the event happens; false → FIZZLED 70% or DENIED 30%.
- **16:772** — `world.rumor.published` / `.resolved` are PUBLIC (`isTrue` sealed until resolved).
- **15:625** — Player statements that assert checkable facts are resolved by 16 after `PARAM.statement_resolve_game_days = 5`; FALSE updates surveillance, TRUE raises credibility. **Out of this unit** (no player `soc.wire.post` pipeline here).
- **23:236–239, 1010** — `mkt_belief_cap`, `mkt_belief_handoff_ticks = 15`, `mkt_belief_hl_days = 5`, `mkt_belief_spread_ticks = 30`; rumor volume params.
- **V1-BOARD.md:44 / :82** — Wire + crises → prices (already landed); this unit adds rumor **resolution** on that Wire.

## V1 bounds (not invented design; compress only what this catalog already compresses)

- **First playable slice only:** existing catalog **RUMOR** Wire stories (today: `tide-downgrade` and any other `kind: "RUMOR"` company story). Not the full 15 player-statement pipeline, not 20 rumor-author farm, not 8 rumors/day, not analyst notes, rebuttals, F15, or 13 manipulation.
- **One demo source** for those catalog rumors, with a seeded `hiddenAccuracy` in [0.40, 0.70] and a public `hits / resolved` record shown with the existing Wire `sourceRecord` / band UI (no new contract fields).
- **Horizon compression:** 16:564 is U(1, 5) **game days**. This catalog already compresses crisis watch → outcome to **12 ticks** (`STORY_EVERY × 2`, `wireStories.ts`). This unit uses the same quartet as one horizon unit: `resolvesByTick = publishTick + 12 × U(1, 5)` (12..60 ticks), seeded, never past a later story on the same item. Disclosed as V1 cadence, not a rewrite of 16.
- **lnV in this catalog:** there is no full 05/06 equity value layer (anchor pull, hourly Research line). This unit keeps a per-equity **lnV** that starts at the listing log mark and moves only with **confirmed value** (permanent NEWS prints already in the book, plus a CONFIRMED rumor's `X`). Belief residuals and demo-crisis decaying residuals do **not** move lnV. No new fair-value UI.
- **Price mapping:** pending belief is a **separate residual** on marks (not `shockResidual`, not permanent `applyShock`). Catalog story `bp` is the owner-module size of `X` if the claim is true (05:851).
- **Wire contract:** reuse existing `StoryPhase`: pending → `forecast`; CONFIRMED → `realized` (effects at the resolve tick); FIZZLED/DENIED → `eased`. Same item id is updated (`world.rumor.resolved`). `isTrue` never goes to the client before resolution (16:192, 16:772). MockFeed / WIR-9 fixtures stay as they are.
- **Out:** player statements (15:625); 20 rumor sources / 8 per day; Circle whispers; tips; cause-vector BELIEF tracer; Research-tier fair-value line; POLICY/RECOVERY; 07/FX; meme-failure farm; changing `channels.ts` / `schema.ts` unless a blocker appears.

## Acceptance

1. **Publish:** a RUMOR item appears as `phase: "forecast"`, with no realized value effect at that tick. The named asset's **price** may move as belief ramps (`τ_spread = 30`); **lnV is unchanged** at publish (05:324).
2. **True:** at `resolvesByTick`, the same item is `realized` and carries the value price effect. lnV has moved by `X` (catalog `bp` as a log/bp shock). After the 15-tick handoff, the residual belief is gone and the mark is not double-counted (mark change from the pending belief plus the resolve step equals the lnV move, within a minor unit).
3. **False:** at `resolvesByTick`, the same item is `eased`, lnV is unchanged, and the belief residual releases with half-life 60 ticks; the price reverts toward the pre-claim path (05:871, 05:1010). False outcomes split FIZZLED 70% / DENIED 30% (16:565), seeded.
4. **Sealed truth:** `isTrue` is not on the Wire item before resolution. After resolution, the public record `hits / resolved` increments (`hits` only on CONFIRMED).
5. **Unchanged paths:** NEWS still permanent-prints at publish and moves lnV; demo crises still use residual HL; M1-09 crises→prices still holds; WIR-9 mock "3 of 7 past claims held up" still holds on MockFeed fixtures.
6. **Determinism:** same seed, same tick path → same rumors, resolutions, marks, lnV, and Wire items. Tick-by-tick ≡ catch-up jump across a window that includes publish and resolve (belief, residuals, lnV, item phase).
7. **Restart:** persist claims, source record, belief residuals, handoff state, and lnV atomically with the existing storm-world file store (temp+rename). Mid-claim stop/start continues without double-opening the same claim id and without re-applying `X`. Older snapshots without the new fields start empty (no claims; lnV = current log mark).
8. **Proofs** run on a **clean store** (fresh `.data`) only. Repo checks + affected e2e once in a clean temp worktree, free port, never :3199.

## Checks

lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, npm test, then the affected e2e batch once (desktop+phone) on a clean worktree.
