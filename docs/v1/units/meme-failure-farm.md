# UNIT — meme failure farm
Written **2026-11-11T17:50:27.979123+01:00 Europe/Paris**, before implementation or tests. Base `110583b0aa73ece1dc3b856665f3be0405f1acc3`; branch `sys/meme-failure-farm`; worktree `/workspace/avalon/sys-meme-failure-farm`.

## Player outcome / scope
A new isolated engine API models paid immediate launches and the complete token journey using the base's real curve, graduation and finite-book functions. A player can lose through actual creator dumping or vanishing liquidity: NPC launchers sell owned allocations into rallies, may abandon only at low hype, and a thin book for seven game days delists discovery and marks retained wallets at zero. A rug flag describes an executed creator dump, never random confiscation. Tokens/cash are not deleted to fake death; no cash, credit or refill is created. This is a standalone engine/farm integration seam, not silently mounted into the shared web runtime. Existing launchpad account/state formats and UI are unchanged.

## Sources / resolved gaps
- complete/06-ASSET-CLASSES.md:748-762: hourly hype formula, H0 .6; NPC rally sale cap 20% hourly volume, abandonment probability .5 at H<.15; liquidity<$1,000 for seven game days → delisted/zero marked retained wallets. 90% near-zero in a chapter is a measurement, not a kill quota.
- complete/06-ASSET-CLASSES.md:1042-1045 and 1234: locked liquidity prevents LP withdrawal rugs. Owner overrides disabled launch/$5M with immediate $1,000 game money, already in base docs/v1/LAUNCHPAD.md:36-38 and rules.ts.
- complete/05-MARKETS-PRICE-ENGINE.md:364,437,508 and owner override: use the existing finite `fillOnBook`, never a last-resort maker. Graduation reuses `graduationOf`, not an AMM stand-in.
- Creator dump thresholds use the base's documented older design-of-record p10 L5 (origin/p10/lp docs/team/specs/lead-launchpad.md:58-67): >=50% graduation holding sold within 24 GD, or >=3% supply in a GD with >=40% price drop. No Court, identities graph, claims or Wire work.
- Small gaps: abandonment draw once per game hour with a stateless seed/coin/hour stream; NPC reserve is explicit launcher's wallet, never implicit funding. Liquidity is settled real cash backing (virtual X0 excluded), not displayed market cap. Thin clock is continuous sampled game-hour state for both curve and graduated book, with seven consecutive days. Batch catch-up replays supplied hourly inputs, never fills a gap with a made-up path. Delisting irreversible per coin; market recovery comes from fresh finite-funded launches, not resurrecting holders for free.

## Acceptance / proof contract
1. A just-created wallet can launch with exactly 100,000 cents; replay is exactly once; insufficient cash/refused trades change nothing. Existing curve fees, creator cap and graduation math retained.
2. Every operation conserves `sum(wallet cash)+real curve cash+book cash+sink`; each token's sum(wallet tokens)+unsold or book tokens equals 1B. Negative balances/over-selling impossible; book exhaustion partial/no fill; no LP withdrawal API.
3. Creator dump positive cases and honest slow-sell negative cases; daily threshold/drop boundaries; flags are monotone and public without private wallet IDs.
4. NPC actions bounded by owned tokens, cash, real hourly volume and hype; abandonment only NPC, deterministic, persisted, terminal for NPC activity; no random failure quota.
5. <$1,000 exactly for seven days delists; equality resets clock; genuine replenishment before death resets it; retained tokens at zero valuation and removed discovery. New launches can grow the market after crashes using already existing money.
6. Strict versioned checkpoints, atomic file save, corrupt state rejected without repair/reset; save failure leaves engine unchanged. Fresh file store restart equals uninterrupted state, repeat operations no-op, batch jump equals hourly stepping (full state equality).
7. Multi-seed/multi-coin chapter failure report with measured denominators and near-zero definition; report target miss honestly, no parameter tuning to force a pass. Include finite-book/adversarial traces and clean-store evidence.
8. Exact checks from package.json: npm run lint; npm run typecheck; npm run build; node tools/check-hooks.mjs .next/static .next/server; node tools/ci/route-budget.mjs /broker; ledger npx vitest run test/map-no-dup.test.ts; npm test. One clean-worktree affected e2e, ports 3400–3499, fresh .data. No skipped check called pass.

## Architecture grounding / choice
Existing LaunchpadService owns atomic player persistence, and BrokerService sweeps own finite books. Reusing those shared services' entire live state would require auth, order, catalog, quote and UI-parser changes and collide with Builder. Alternative A: mount lifecycle in existing auth/Broker sweep immediately (large shared blast radius). Alternative B (chosen): a self-contained engine with explicit state, commands and hourly input frames; existing pure settlement functions do all price/cash math, and a file-store adapter makes replay/proofs auditable. Runtime integration is an explicit later planned unit, not a claim of live behavior. No new generic engine framework or hidden global clock.

Phases: [x] ground / [x] compare sketches / [x] select without human blocking / [ ] implement / [ ] prove / [ ] commit+push. No cloud/local-subagent tools are available or allowed; architectural comparison performed locally rather than spawning cloud workers.

## Gatekeeper delta — replay/catalog fixes; calibration remains OPEN before mount

- Replay fingerprints now sort object keys recursively. Both new receipts and pre-fix V1 unsorted JSON fingerprints are compared canonically; replay never rewrites a receipt/checkpoint. Regression `replays reordered launch and trade fields across restart (legacy receipt=%s)` covers launch and trade, fresh file restart, identical first reply, byte-unchanged store and genuine name/amount conflict. Both variants failed before the fix with `IDEMPOTENCY_CONFLICT` instead of the saved `LAUNCHED` reply.
- The canonical live `ASSETS` catalog reserves normalized tickers **and** asset names, case-insensitively, for both launch fields. Refusals precede fee, cooldown or supply mutation. Four `rejects reserved catalog identity ... without a fee` cases failed before the fix (HALC, ORCA, mixed-case Halcyon Shipping and lowercase halc name). All existing valid launch/trade economics stay unchanged. Source: complete/22-CONTENT-CATALOGS.md:1068 prohibits launch/equity/reserved ticker collisions.

### Premise investigation (written before the 24-seed rerun)
**Premise tested:** the authored `final mark <= 1% of listing price OR delisted` cohort statistic is the spec's fully defined “90% go to ~0 within a chapter” calibration band. **Result: not supported.** Searches of complete/01, 06 and 20 find no numeric near-zero percentage cutoff or price reference for that target.

- complete/06-ASSET-CLASSES.md:759-762 explicitly describes NPC meme coins: :760 Poisson births, 10^9–10^12 supply, Tidepool seeded with $20k–$200k LTX and 50% supply, H0=.6; :761 real rally sales (20% hourly volume above H=.4) and low-hype abandonment (probability .5 below H=.15, **stops activity**, not liquidates or confiscates); :762 gives the exact death rule (<$1,000 liquidity for seven game days, delist and retain wallets marked zero), then calls “90% go to ~0 within a chapter” a balance target, **not a hard rule**. It does not define a numeric surviving-price “~0” cutoff, reference price, final-vs-ever observation or rolling-birth denominator.
- Horizon is defined: complete/20-VERIFICATION-AND-BALANCE.md:11 and complete/01-EVALUATION-OF-V3.md:145 say one chapter is **1,344 game days / 56 real days**. That does not resolve whether a late spawn gets a full chapter of exposure or only the remainder of a calendar chapter. This proof deliberately fixes births at hour zero and samples the final mark after 32,256 hourly frames per seed.
- complete/20-VERIFICATION-AND-BALANCE.md:1130: flag-off bands/hunts still run in G3 with harness flag on; they block the activation release, not unrelated releases. :1144 warns against seed overfitting; :1149 forbids modelled results posing as system proof; :1150 forbids widening bands to ship. This isolated 24-DEV-seed cohort is neither a full population/harness nor G3 certification.

**Decision:** do not change abandonment, death thresholds, price dynamics, seed liquidity, cohort composition or any economic parameter to hit a quota. In this finite-book cohort, an abandoned launcher stops trading, while remaining holders and book cash persist; abandonment is not permission to zero their money or withdraw locked liquidity (06:1045). The authored 1% diagnostic is retained and explicitly labelled non-spec in `measurement-contract.json`; the proof increases from 8 to **24 seeds (17–40), 12 coins each**, and separately records real delistings. Gatekeeper's untuned comparison was 214/288 = 74.3%; the new-HEAD rerun result and per-seed spread are in the external SHA evidence, not an activation pass.

**Open item needing owner words before mount:** specify the numeric ~0 cutoff/reference price, ever-crossed versus final observation, cohort/late-spawn exposure and acceptable approximate-90% band; then implement/validate the actual activated venue/population mechanism with funded agents and the required harness seed classes. A measurement-definition decision does not waive a demonstrated shortfall. No forced outcomes or cash/token creation/destruction is introduced here.

Validation evidence for this delta lives under `/workspace/avalon/evidence/sys-meme-failure-farm/<new HEAD SHA>/`: full-bar command logs/status, adapted Gatekeeper repros (only import/output paths and stale diagnostic text changed, original evidence untouched), restart/jump/conservation JSON and all 24 chapter states. Pre-fix 6-failure evidence is copied there from `review-delta-red/`. Fresh e2e worktree uses its own empty `.data` and ports 3410–3419; no other worker worktree is modified. Remote CI, overall GO and runtime mount remain out of scope.

## Hardening unit — boundary validation + calibration decision (started 2026-11-12T00:08:18+01:00 Europe/Paris)
Written at the start, before code changes. Tip `c7b31bd5`; commits are appended, no history rewrite, no push. Scope: (1) strict plain-JSON boundary reusing the sys/fx `src/server/market/fx/json.ts` pattern: reject NaN/Infinity, required null, toJSON, getters, Proxy, sparse arrays, class instances and unknown fields before acceptance or save; (2) settle the near-zero calibration definition from the complete spec with citations. Status: [x] boundary [x] calibration decision [x] checks on 16fb3b10 [x] proofs [x] commit (no push). Results and evidence: `/workspace/avalon/evidence/sys-meme-failure-farm/hardening/`.

### (1) Boundary
- `src/server/launchpad/failureFarm/json.ts`: body copied verbatim from sys/fx be3e296a `src/server/market/fx/json.ts:4`. It reads descriptors only and checks `isProxy` first, so no getter, `toJSON`, or trap runs.
- `boundary.ts`: exact keys and JSON types for commands, frames, and observations. A required `null` is refused.
- Every entry point validates first: `commandFarm` and `execute` throw `INVALID_FARM_COMMAND`; `advanceFarm` and `advance` throw `INVALID_FARM_FRAME`; `parseFarm`, genesis, and `save` throw `BAD_FARM_CHECKPOINT`; `createFarm` throws `BAD_GENESIS`. No receipt, fingerprint, clone, or save happens before validation.
- Economic refusals (non-integer amount, wrong fee, cooldown, cash) are unchanged, persisted receipts.
- Tests: `tests/unit/launchpad/launchpad-failure-farm-boundary.test.ts`. It has 25 command, 17 frame, and 12 checkpoint cases, plus genesis and Gatekeeper-alias tests. Each case asserts zero getter/`toJSON`/trap calls, unchanged bytes, and an equal real restart. The command cases then show that the valid request with the same key is fresh and replays once. 50 of 56 fail on c7b31bd5 source.

### (2) Calibration decision: definition chosen, band NOT met, not tuned
**Definition (pre-registered in `measurement-contract.json` v3 before the run).** "~0" means dead under the 06 death rule: liquidity below $1,000 for seven consecutive game days, then `DELISTED`, with tokens "marked at 0" (`complete/06-ASSET-CLASSES.md:762`). The public event is `mkt.meme.dead` (`06:1139`). This is the only numeric zero the complete spec assigns to a meme coin. The 90% sentence sits in the same bullet as the death rule (`06:762`). No other line in complete/01, 06, 20, or 23 defines a price cutoff. Horizon: one chapter, 1,344 game days from birth (`20-VERIFICATION-AND-BALANCE.md:11`; `01-EVALUATION-OF-V3.md:145`).

**Measured on clean deterministic seeds 17–40 (24 × 12 = 288 coins).**
- Dead: **72/288 = 25.0%** (3/12 on every seed). All 72 are the thin curve launches. **0/216** graduated coins die.
- Secondary authored diagnostics, not the definition: final mark ≤1% of listing 214/288 (74.3%); ever ≤1% during the chapter 262/288 (91.0%); final market cap below $1,000 196/288 (68.1%). I report the 91% figure because it was measured. Switching to it after seeing it would be definition shopping (20:1144 E1, :1150 E7).
- All 24 final-state SHA-256 digests equal the c7b31bd5 cohort, so this unit changes nothing economically. Conservation holds every hour, with cash delta 0.

**Why the measured rate is the correct output of the rules, and why it says nothing about the band:**
1. In the finite book (owner override; `05:364,437,508`), book cash leaves only through real sales. All 216 graduated books end the chapter with $42,888–$43,001 of cash, far above the $1,000 death line, while marks fall up to 99.95%. The 06 death rule measures Tidepool **pool** liquidity (`06:760,762`). In a constant-product pool, the reserve value falls with price. A finite book's cash does not.
2. The holders in this cohort never sell. The spec names frozen agents as an invalid way to judge a market (`20:1145` E2, `20:664` Rule 3.5.5). Abandoned launchers "stop all activity" (`06:761`), so their allocation is frozen by rule.
3. Sensitivity bound, not counted (`holder-exit-sensitivity.json`): the retail holder offers its whole position once a game day after public abandonment. After 60 game days, only 75/288 coins are dead (3 extra), because daily finite-book fills drain only about $150–$400 of book cash per game day.
4. Every engine law involved is fixed by the spec: $1,000 and seven days (`06:762`), probability 0.5 below H 0.15, 20% rally sales above H 0.4 (`06:761`), and the hype constants (`06:747-754`). No engine parameter is honestly free to reach 90%. Authoring holder exits or a mass-exit population to hit the target would be tuning to the test (`20:1144` E1). The band can only be judged with an activated, adaptive, player-level population at G3 (`20:1130`, `20:1146` E3).

**OPEN before mount; needs owner words:**
- (a) What "pool liquidity" means for the owner's finite book. Options are book cash (current), executable bid depth near the mark, or something else. This choice decides whether price collapse can kill a graduated coin.
- (b) Whether "~0" is the death state (chosen here) or a price cutoff. If it is a cutoff: the number, final versus ever, and the late-birth denominator.
- (c) The G3 activated-population run for the band (`20:1130`). Without an owner change to (a), the measured gap stays.

No forced outcome, no minting, no money destroyed.

## Premise attack — pre-registered rules (written 2026-11-12T00:48+01:00 Europe/Paris, BEFORE implementation or any run)
Moved from the root `UNIT.md` to this file at this point. The calibration missed twice: 214/288 under the authored 1% cutoff, then 72/288 under the 06:762 death state. The premise under attack is that a graduated coin's *raw book cash* is the 06:762 "pool liquidity", and that holders may stay frozen. I resolve both gaps here, with citations, before running anything. "~0" stays the 06:762 death state: liquidity below $1,000 for 7 game days, then `DELISTED` and marked at 0. Only the liquidity measurement and holder behaviour change. Seeds 17–40, 12 coins each, one 1,344-game-day chapter. Whatever comes out is reported, and nothing is tuned afterwards.

### Rule A — liquidity of a graduated coin on the finite book
- **Why raw cash is wrong.** 06:760-762 measures liquidity in a Tidepool constant-product pool. A pool's quote reserve, and so its value, falls with the price, because every price fall is a sale into the pool. A finite book keeps its resting cash no matter where the mark goes. Cash that can only be reached by selling far below the price is not liquidity at that price. The finite-book equivalent of pool liquidity is the cash a seller can actually receive near the price.
- **Measurement.** `liquidity(BOOK) = min(book.cash, cost(qmax))`. `qmax` is the largest whole-token sale whose base-ladder price stays within band X below the mark. It uses the same `depthQuote` spread/skew, `ladderImpact` square-root impact, `baseDepthInputs` depth, and `centsOf` rounding as `fillOnBook` (05 §3.4; `src/server/broker/book.ts`). It differs from `fillOnBook` in two ways: no per-tick consumption (a fresh measurement, `used = 0`), and band X replaces the per-tick band. Curve coins keep their real curve cash: the bonding curve is a pool whose reserve already falls with the price.
- **Band X = max(0.05, 3·σ_d)**, measured from the last price. σ_d = the coin's template vol / √364, the same σ the book uses. That gives X ≈ 0.30–0.31 for vol 1.9–2.0.
  - Source: 05-MARKETS-PRICE-ENGINE.md:560 gives `max(0.05, 3 × σ_d)` as the closing/fix/settlement band, "measured from the last price".
  - That is the spec's band for a once-a-day reference price. The death clock is a daily-scale test (7 game days, 06:762). The meme daily reference is the 540 mark (05:255), and memes have no auction, so this daily reference band is the closest spec analogue.
  - The per-tick band `max(tickBandMin 0.040, 6σ_tick)` (05:356, :560) is rejected. It throttles one tick (5 s) and refreshes every tick. At listing it gives only about $384 of depth, which would delist every graduated coin seven days after birth. That would be a forced outcome, not a measurement.
- Conservation is unchanged. `cashTotal` still counts the full book cash. Only the thin/death clock and the public `liquidityCents` use the new measure. No cash moves because of it.

### Rule B — cohort holders act by the spec's own behaviour
- **Frozen holders are invalid** (20:1145 E2; 20:664). Agents act only through ordinary trades and public views (20:585-592 Rule 3.5.2). NPCs respect their balance sheets (20:666 Rule 3.5.6).
- **RETAIL pool, the spec's retail behaviour for memes (05:832, 05:826):**
  - Signal per game hour: `noise N(0,1) + 0.5·tanh(r_1d/σ_d) + attention + 0.3·dip(EXPANSION)`. The attention and dip terms are 0 here: the cohort has no Wire mentions and no regime. Belief is inactive.
  - Target `pos* = w·tanh(signal)`, in ADV units, with meme weight w = 3.0.
  - Rate cap `w·0.15` ADV per game day. The per-tick clamp `±rate/ticksPerDay` (05:826) is summed over the 30 ticks of each hour into one hourly order.
  - ADV = meme turnover 0.15 × supply = 150,000,000 tokens (05:356; `ADV_TOKENS`).
  - The target form is the base's `targets()` (`src/server/broker/pools.ts`). The noise uses the farm's own stream `farm:<seed>:<ticker>:retail:<wallet>:<hour>`. r_1d is read from the coin's last 24 hourly closes, and is 0 until 24 exist (base convention).
- **Who holds.** The cohort's existing retail wallet, with the same $3,000,000 genesis cash and the same paid initial buys, becomes an NPC wallet of kind `RETAIL`. The engine trades it once per game hour on every graduated coin, after the launcher step, using only the coin's public price history.
- **Spot only:** `pos* ≥ 0`, so no shorting. Buys are bounded by its own cash and sells by its own tokens. Every order goes through `fillOnBook` with partial fills. There is no last-resort buyer, no mint, and no transfer outside the book.
- **Not modelled, stated now:**
  - The pools' 10-day off-book position decay ("investors replaced by background holders", 05:826). It would need tokens moving outside the book.
  - The DEGEN pool (05:840). It is leveraged by definition, liquidates through 07, and needs credit this unit does not have.
  - The VALUE pool (05:830). It needs a value layer, and memes have no fundamental V in 06 §3.11.2.
- **Abandonment response (06:761).** The launcher "stops all activity". Its allocation stays in its wallet and is never sold or burned. The spec gives no other holder a panic multiplier on abandonment, so none is added. Holders respond only through the public price and returns they see. The NPC launcher's rally sales (20% of hourly volume while H > 0.4) and its abandonment draw are unchanged.

### Input size limits (same delta)
- Every string in a command or frame, including object keys, is at most 256 UTF-16 units. Otherwise `INVALID_FARM_COMMAND` / `INVALID_FARM_FRAME`.
- Every string in a checkpoint is at most 4,096 units. Command fingerprints are canonical JSON of bounded inputs.
- A checkpoint file is at most 16 MiB (16,777,216 bytes). `load` rejects it before reading and `save` before writing, with `BAD_FARM_CHECKPOINT`, and the existing file stays unchanged.
- Checkpoint format v2 adds the coin's `closes` (≤24 hourly marks) and the `RETAIL` wallet kind. v1 is rejected, never migrated, and the file is preserved.

Stop rule: run once, report the number and the remaining reason, and do not tune.

### Result of the single pre-registered run (seeds 17–40, implementation commit `1e216e74`, run finished 2026-11-12 ~00:58 Europe/Paris)
- **Dead (06:762): 275/288 = 95.5%.** The per-seed range is 9/12 to 12/12 (75%–100%).
  - Thin curve launches: 72/72 dead.
  - Graduated coins: 203/216 dead (94.0%).
  - Graduated deaths happened between game day 53 and day 1,301 (median 428).
- **Above the ~90% target by about 5.5 points. Not tuned.** The rules, band, weights and seeds are exactly as pre-registered above. The stop rule holds: no second run with changed parameters.
- **What drives it.** All 203 graduated deaths kept at least $31,878 of resting book cash (median $66k, maximum $2.24M), so none died because cash ran out. They died because near-price depth fell below $1,000 after their marks collapsed (Rule A). The RETAIL pool both buys and sells. Its buys add cash to books, so it does not mechanically cause death.
- **Survivors.** 13 graduated coins are still live at chapter end. Their marks are 1.4%–308,852% of listing, and their near-price liquidity is $959–$2.09M. One coin (seed 26) has $959 and its thin clock is running.
- **Money and accounting.** Conservation was checked every hour on every seed; every cash delta is 0 and every coin keeps 1B tokens. The restart, jump and repeat proofs pass. No coin was forced, no money was minted or burned, and there is no last-resort buyer.
- **Remaining reason, stated without tuning.** The overshoot comes from the cohort design and the omitted pools:
  - All births are at hour 0 with a full chapter of exposure.
  - The DEGEN and VALUE pools and the off-book pool decay are omitted (Rule B).
  - Band X is an analogue: memes have no auction, so 05:560's settlement band is applied to the 540-mark daily reference.
  - This is a 24-DEV-seed isolated cohort, not a G3 activated population (20:1130). It is not a certification.

### Status qualifications (Gatekeeper on 011c3bb8, recorded 2026-11-12 ~01:05 Europe/Paris)
- **Rule A is a pre-registered candidate, not settled.** The executable-bid-depth liquidity reading (band `max(0.05, 3σ_d)`, 05:560) is pending an owner reading, which the parent is routing through Builder. The 275/288 result holds only under that candidate. Until it is confirmed, treat the calibration as conditional.
- **The farm stays default-off.** `src/server/launchpad/failureFarm` has no import from any runtime route, service or UI (`rg failureFarm src` outside the module returns nothing). There is no flag to turn it on, and nothing in this unit mounts it.
- **Citation gap in the target sentence.** 06:762 attributes "90% go to ~0 within a chapter" to "(01)". `complete/01-EVALUATION-OF-V3.md` (217 lines) contains no such sentence. Neither do `VISION-V3.md`, `VISION-V2.md` or `VISION-REVIEW.md`, which have no meme-death target at all. The only line that exists for the target is `06-ASSET-CLASSES.md:762` itself, so this unit cites only that line for the target. The chapter-length citations (`01-EVALUATION-OF-V3.md:145`, `20-VERIFICATION-AND-BALANCE.md:11`) do exist and were checked.
- **Size before semantics.** Previously, a 2 MB name reached the name rules and was refused as a persisted `BAD_NAME`. Now the boundary rejects any string over 256 units right after the descriptor-only plain-JSON check, which never reads string contents. The error is `INVALID_FARM_COMMAND`, and it happens before `tickerOk`/`nameOk`/moderation, any fingerprint, any receipt and any save. Checkpoints are size-checked first too: file bytes before read, strings before shape parsing.
