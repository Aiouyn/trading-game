# Unit: free-tier T1 NPC analyst notes as a second 05 claim source

**Branch:** `eng/analyst-notes`  
**Base:** `35803f3f81eb70329cc3dbb0e0c08b20e7d227ff` (`eng/wire-first-story`, stacked on `d23c141c`)  
**Worktree:** `/workspace/avalon/analyst-notes`  
**When written:** 2026-11-11 19:55:00 Europe/Paris — before product-code edits.  
**Owner:** continue-nonstop after 35803f3f exact-head checks and handoff. Free-tier NPC analyst notes (16:557 T1 / free daily note only, no paid tiers), shown on the Wire, using existing claim and belief machinery, smallest coherent slice.

Gatekeeper bounded PASS (qualified) on d23c141c arrived through the parent before this unit started. The remaining non-blocking qualification — malformed rows inside an otherwise valid `claims` array are still skipped silently — is **not** reopened on `eng/claims-statements`. It is the first product commit on this branch. Criteria for that fix live in `UNIT-DELTA-CORRUPT-CLAIM-ROWS.md`, written in the same docs pass, before any product-code edits. If further Gatekeeper findings on d23c141c, 35803f3f, or earlier claims heads arrive through the parent, those come first.

## Player outcome

Once per game day, a signed-in player reading the Wire sees a named NPC sector analyst's daily note: a headline, the research house, a listed company, and a forecast claim about that company. The note is free (no hire, no fee). It is a 05 claim: it can move belief while pending and later resolves true or false through the existing book. Desktop and phone, All and Statements filters.

## Why this slice, and what 16:557 is not in this unit

16:557 prices Analyst T1 / T2 / T3 at $100 / $600 / $2,500 per game day and `soc.world.analyst.hire` / `.fire` (16:742) is a paid, per-sector subscription (≤ 5 per character). The parent asked for **T1 / free daily note only, no paid tiers**.

This unit publishes the T1 *product* — a daily sector note from public data, forecast at σ 0.6 (the noisiest tier; E-29), by a named 22 §10.8 analyst — as a **free, public Wire item** for every player. It does not implement fees, `INFO_ANALYST_FEE`, hire/fire, the 5-analyst cap, QUANT_RAISED, Terminal, T2 (next-release forecasts with 04/09 model expectations), T3 (scenario chains), or a private subscriber-only feed.

## Spec cites

- **16:557** — T1: named NPC analyst per sector; daily sector note from public data; forecast at σ 0.6.
- **22:2518, 22:2674–2703** — twelve sector analysts, EDITOR actors without an outlet, each at a fictional research house.
- **22:1139–1145** — claim kinds tagged for an analyst note: `PRODUCT_DELAY` −0.08, `EARNINGS_BEAT` +0.05, `EARNINGS_MISS` −0.06.
- **05:849–871** — an NPC analyst note is a claim source; 05 reads the structured claim; `claimCredibility` Beta(2,2) (05:857–860); belief overlay, 15-tick true handoff, 60-tick false release.
- **15:307–308 / 15:606** — WireKind has no ANALYST kind. Do not add one in this slice.

## Design

### Wire kind and ids

Do **not** edit `channels.ts` / `schema.ts`. There is no `ANALYST` WireKind. Publish the note as **STATEMENT** (named author and `sourceRecord` are already legal on STATEMENT; company denials already use this kind). Headline, slots, entities (asset + analyst actor), and cause copy name the analyst and house so the row is not mistaken for a company denial or a player statement.

Ids: `w-a-${claimId}` (claim id itself may be `an-${day}` or similar). Must not collide with live `w-${tick}`, history `w-h-*`, farm `w-r-*`, or denial `w-d-*`. `slots.rumorId` holds the claim id so `retainStories` keeps a pending or just-resolved note the same way it keeps a denial's rumor.

15:828 ("NPCs do not post statements except as outlets") is recorded as a known tension: analysts are EDITOR actors without an outlet (22:2518). This slice still uses STATEMENT because that is the legal existing kind that carries a named author and a source record. We are not adding player `soc.wire.post` or outlet mastheads.

### Schedule

One note per game day, not one per sector per day (hired "per sector" stays out; eight daily notes on top of the farm's eight would flood `STORY_KEEP`).

Publish when `tick % TICKS_PER_DAY === 400` and `tick >= START_TICK + 21`. For seed-17's start day that is **27760**. The offset is after the M1-05 golden window (ticks 0, 1, 3, and 20 from START_TICK, i.e. 27700–27720) so that tape stays put. Mid-run resume does not open a second note for a day already opened (idempotent by id). Construct at START_TICK does not seed a note.

Schedule is public clock (no secret). Asset, kind, and analyst are seed-only draws (same style as `planFarmDay` / `rumorHash`), from the public catalog.

### Analysts, assets, kinds

Map listed **equity** sectors onto the 22 §10.8 roster. Skip GX (index), graduated coins, and VOLT (Utilities has no 22 analyst):

| asset | catalog sector | 22 sector | analyst | house |
|---|---|---|---|---|
| NMBS | Technology | TECH | Priya Holloway | Keystone Research |
| VRDN | Energy | ENERGY | Ragna Sæther | Fjell Energy Research |
| KILN | Materials | MATERIALS | Esteban Ferreyra | Cordillera Research |
| HALC | Industrials | INDUSTRIALS | Marek Vogel | Brenner & Kessel Research |
| AVB | Financials | FINANCIALS | Grace Abbott | Bayard Bank Research |
| ORCA | Health | HEALTH | Elise Morel | Lumière Santé Research |
| MRDN | Consumer | STAPLES | Camila Duarte | Granero Analytics |
| TIDE | Real estate | REAL_ESTATE | Hana Mori | Kaiyo Land Research |

Consumer → STAPLES is a documented mapping (catalog has "Consumer", not STAPLES/DISCRETIONARY). SEMI, DISCRETIONARY, MEDIA, and SECURITY have no listed equity in this catalog and are unused this slice.

Each day picks one of those eight (seed + day), one of the three analyst-note kinds, and the matching analyst. Same seed ⇒ same note. A different seed can differ.

### Claim and belief

Open through the existing `RumorBook.open()` as channel **`analyst`**. Belief uses the desk 05 path (`claimCredibility`, evidence 0, prestigeReach 0 this slice), **not** the farm 16:566 impulse. `normalizeRumorSnapshot` must persist and accept `channel: "analyst"`.

Each of the eight analysts is a `RumorSource` (`sourceId` `an-TECH` … `an-REAL_ESTATE`), created from seed+secret on first book start and on hydrate when absent (same upgrade shape as farm authors). Hidden accuracy is HMAC-sealed in a noisy band **[0.40, 0.55]** — the noisiest tier, σ 0.6, without standing up a 04/09 release-expectation engine this slice. Truth and horizon use the existing HMAC-SHA256(secret, seed\|kind\|id) draws and `resolvesByTick` (720..3600). The secret is never FNV input.

Public data only: listed catalog equities, public claim kinds, no private positions, no NON_PUBLIC facts (16:557 guards / L11).

Company denials do **not** fire on analyst notes this slice (`companyDenialTick` / `applyCompanyDenials` skip `channel === "analyst"`). A research note is not on the rumor-denial schedule.

On resolve, stamp the STATEMENT row (phase, cause, effects, source record) the same way farm rows are stamped. Causes: `wire.cause.analyst-note`, plus `-confirmed` / `-fizzled` / `-denied` if the shared resolver can still fizzle or deny (denied here means the claim resolved DENIED, not a company STATEMENT). Rebuild after restart includes these rows.

No `applyShock` at publish (pending claim: belief only; 05:324). Confirmed true still prints X on lnV and hands off over 15 ticks.

### Localization and filters

EN and FR headline, cause, and kind-adjacent copy. Statements filter shows the row (STATEMENT). All shows it. Rumors filter does not. WIR-A `?empty=1` baselines stay. No new filter chip.

## What must not change

- Live `storyAt` schedule, first live story still orca-trial at 27706, history `w-h-*` at t0.
- M1-05 golden / legacy tape at ticks 0, 1, 3, 20 (first note is at 27760).
- HMAC seals, 15-tick handoff, fail-closed missing/corrupt rumors (and, after the first commit, fail-closed invalid claim rows), company denials on desk/farm claims, farm 8/day.
- `channels.ts` / `schema.ts`. POLICY/RECOVERY, 07/FX, meme-failure farm, paid T2/T3.

**digest4000 will change versus 35803f3f.** A new 05 claim that opens at 27760 and moves belief inside the 4000-tick window changes marks. Document the new digest in the proof/handoff; do not claim identity with 35803f3f. Do not claim 16:564 “never past real due time.” Boot hydration, not continuation-hash identity.

## Acceptance

1. First commit (see UNIT-DELTA): any invalid claim row in a present `claims` array fails closed (`CorruptRumorSnapshotError`, loud log, store untouched) before mount; valid `claims: []` still boots.
2. On a fresh world, the first T1 note opens at 27760 (seed 17: deterministic asset, kind, named analyst and house). `/api/wire` has a STATEMENT id `w-a-*`, headline, asset entity, analyst entity, cause, `sourceRecord`, no `effects` at publish. Quotes at t0 through 27720 still match M1-05. After 27760, the target's belief can move; a no-note reference does not.
3. Same seed ⇒ same note. A second `wire()` / `snapshot()` does not open a second note that day. Jump ≡ step across the publish tick. Mid-run resume / boot hydration rematerializes the same claim id and Wire row, no second copy.
4. Resolution uses the existing book: true prints X and 15-tick handoff; false releases with 60-tick half-life; the author's public record updates; the Wire row is stamped.
5. No hire, fee, T2, or T3 path exists in this slice. Company denials do not append a `w-d-*` row for an analyst claim.
6. Repo checks (lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, npm test) on the exact head. Affected e2e once on a clean temp tree, fresh `.data`, including M2-01 and the Wire specs (M1-09, WIR-9, WIR-A), both projects. Delete the temp tree after. Preview :3199 stays 200; never bind :3199 or :3102.

## Not in this unit

Paid tiers, hire/fire, fees, T2/T3, Research Desk, 04/09 model expectations, a Gaussian forecast engine, private notes, a new WireKind, one-note-per-sector density, denials of analyst notes, player statements (`soc.wire.post`), mid-run re-seed of catalog NEWS, POLICY/RECOVERY, 07/FX, meme-failure farm. No overall GO.

## Checklist

- [ ] UNIT.md and UNIT-DELTA-CORRUPT-CLAIM-ROWS.md written and committed before product-code edits.
- [ ] First product commit: fail-closed invalid claim rows + test.
- [ ] Analyst notes: plan/open, sources, Wire STATEMENT, strings/causes EN+FR, resolve stamp, tests, proof (memory stores only, no product `.data`).
- [ ] Checks on the exact head; affected e2e in a temp tree, then delete it.
- [ ] Normal push, no PR, no force, no hook bypass. GK-HANDOFF under evidence only.
