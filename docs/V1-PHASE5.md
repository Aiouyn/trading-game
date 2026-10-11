# V1 Phase 5: status (Launchpad, lead spec v1 with the v1.1 and v1.2 amendments)

Scope: Phase 5 Launchpad, as set in `docs/team/specs/lead-launchpad.md` (L1 to L8), with the binding "Amendments v1.1" and "Amendments v1.2" sections at its end.
Branch: `p5/lp`, worktree `.claude/worktrees/p5-lp`. v1.1 base: `4ede148`. v1.2 base: `cbb24d8`. Status date: 2026-10-11.
Status words as in `docs/V1-PHASE4.md`: **Done**, **Partial**, **Not built**, **Deferred**, **Decided**.

## 0. Phase 5 status (current)

### 0.1 Verdict

**Held-out gate (lh, 200 seeds): FAIL.** Re-run after the sniper fix (section 6, the repair pass; same verdict, shape now also fails). The table below is the v1.2 state before that pass. The v1.2 gate (L8.2) requires every bot at or below zero at one-sided 95% on the held-out prefix `lh`. Two of the eight bots fail: the random retail bot (mean excess +5.70 points, one-sided +8.37) and the pump seller (mean -0.13, one-sided +0.71). Six bots pass. The shape (dead within 7 game days, graduation rate, 10x rate), the NPC life net, the money identity and the idle control all pass on the held-out seeds.

The tuning screen on `lx` (50 seeds) had failed four bots: flipper, retail, pump seller and post-graduation buyer (section 2). On `lh-200` the flipper and the post-graduation buyer pass, but only because the held-out GX draw was higher (section 3). Retail and the pump seller fail on both prefixes.

No constants were changed after the held-out run. Nothing was tuned on `lh`.

### 0.2 Commits

| Commit | Amendment | What |
|---|---|---|
| `99fe466` | v1.1 spec | lead Launchpad spec v1.1 (fast pump, slow bleed; post-graduation unwind; paired gate; ratified deviations) |
| `4ede148` | v1.1 base | in-place account cash (30-day seed 5.4 min to 20 s, same output); gate measures day-3+ cohorts; L6 tuning set C |
| `b1d3bed` | v1.1 | L6.1 fast pump and slow bleed, L6.2 post-graduation unwind, the cancel rule, the tuned L6 constants, `v11.test.ts` |
| `741f84d` | v1.1 | NPC launches on in the server's game world (`server/host.ts`); `createGame` default stays off |
| `288dcb2` | v1.1 | L8.1 gate harness: life-end NPC net, paired excess, idle drift control, `--npc` overrides |
| `caf497b` | v1.1 | `docs: V1 Phase 5 status` (gate at 10, 50 and 200 seeds) |
| `c78f29b` | v1.2 spec | lead Launchpad spec v1.2 (instant arrivals, no copycat buzz, finite tails, held-out gate with chaser and pump-seller bots) |
| `cbb24d8` | v1.2 review | review items 6, 8, 9, 14: cancel rule from lots and tape on old snapshots, refused NPC demand kept, v11 tests renamed and strengthened, harness seed prefixes, a 30-gd post-graduation 10x window |
| `e3fb81a` | v1.2 | L6.4 instant arrivals, L6.5 no copycat, L6.6 finite tails (Pareto alpha 2.5, floor 2.2; arrival capped at the cash to graduation); `v11.test.ts` extended |
| `fdee353` | v1.2 | L8.2 harness: viral chaser (per tick), pump seller, post-graduation buyer; eight gated strategies; the probe deleted |
| `1678d34` | v1.2 | L6 constants tuned on `lx-50` (`VIRAL_SCALE` 0.2 to 12, `VIRAL_ALPHA` 2.5 to 2.2, `TIME_SELL_PER_TICK` 0.00002 to 0.5); table in the commit message |
| (this doc) | v1.2 | `docs: V1 Phase 5 status (v1.2, lh-200 held-out gate FAIL)` |

Gates at `1678d34` (the last code commit): `npx next typegen && npx tsc --noEmit` exit 0; `npx eslint` on the touched files 0 errors; `src/world/launchpad` 90 tests pass; full `npx vitest run --maxWorkers=2` 187 files, 1853 pass, 70 skipped, 21 todo. This pass changed no code (the held-out run and this doc only), so those gates stand. Section 4 has the run at the final commit.

### 0.3 Spec items L1 to L8 (with v1.1 and v1.2 amendments)

| Item | Status | Commits | Notes |
|---|---|---|---|
| L1 Scope and placement | **Done** | `b1d3bed`, `741f84d` | World layer only. NPC launches are on in the server's game world and off in every bare test world. Determinism and the zero-sum test pass. |
| L2 Launch | **Done** (cancel is a ratified deviation) | `b1d3bed`, `cbb24d8` | Cancel refused only after another player trades; refund is half the fee (deviation 1). Gates, fee, limits and moderation unchanged. |
| L3 Bonding curve | **Done** (unchanged) | | Curve math and the 1% fee unchanged. NPC fee sink halves book on `npcRetail` (deviation 3). |
| L4 Graduation | **Done** (unchanged); L6.2 **Done** | `b1d3bed` | The cohort's position unwinds through `placeOrder` with a one-game-day half-life. |
| L5 Anti-rug | **Done** (unchanged) | | Vesting world check, rug flag and suits as in earlier commits. |
| L6 Hype and NPC flow | **Done** for the v1.1 and v1.2 mechanics (L6.1 to L6.6); constants tuned (L6.3); the gate is **Partial** | `b1d3bed`, `e3fb81a`, `1678d34` | Instant arrivals, no copycat and finite tails are built and tested. The shape and the NPC life net pass on `lx-50` and `lh-200`. Retail and pump seller fail on `lh-200` (section 3). |
| L7 App (Launchpad) | **Not re-checked** in this pass | | No client code changed in v1.1 or v1.2. The e2e suite and the Playwright specs were not run (section 0.6). |
| L8 Gates | **Partial** (held-out FAIL) | `288dcb2`, `fdee353`, `1678d34` | Eight strategies are gated, plus the idle control. The held-out `lh-200` run fails on retail and pump seller (section 3). |

### 0.4 Gate results: `lx-50` (tuning screen) and `lh-200` (held-out, authoritative)

The gate is `scripts/balance/launchpad.ts`, 30 game days per seed, committed defaults (`1678d34`). The excess of each bot is its return minus the GX buy-and-hold on the same seed. The pass line is one-sided 95% (mean + 1.645 SE over seeds) at or below 0. Figures are in percentage points of return.

The `lx-50` run is the tuning screen (seeds `lx-01` to `lx-50`). The `lh-200` run is the held-out confirmation (seeds `lh-01` to `lh-200`), which no tuning step has seen.

**Bots, all eight, on `lh-200` (authoritative):**

| Bot | Mean return | Mean excess | One-sided 95% | Result |
|---|---|---|---|---|
| creatorDump | -13.13% | -14.67 | -13.23 | Pass |
| sniper | -7.40% | -8.95 | -7.86 | Pass |
| flipper | +0.18% | -1.37 | -0.66 | Pass (cash holder, see section 3) |
| buzzPumper | -78.38% | -79.93 | -77.94 | Pass |
| retail | +7.24% | +5.70 | +8.37 | **Fail** |
| viralChaser | -27.41% | -28.96 | -27.87 | Pass |
| pumpSeller | +1.41% | -0.13 | +0.71 | **Fail** |
| postGradBuyer | -0.12% | -1.67 | -0.95 | Pass (cash holder, see section 3) |

GX mean return over the `lh-200` seeds: +1.55% (standard deviation across seeds about 6.1%). Bot gate: **6 of 8 pass, 2 fail (retail, pump seller)**.

**Bots, all eight, on `lx-50` (tuning screen, reference):**

| Bot | Mean excess | One-sided 95% | Result |
|---|---|---|---|
| creatorDump | -14.16 | -12.63 | Pass |
| sniper | -8.07 | -6.17 | Pass |
| flipper | -0.14 | +1.29 | **Fail** (cash holder: excess = minus GX draw plus interest) |
| buzzPumper | -81.33 | -79.00 | Pass |
| retail | +5.58 | +9.99 | **Fail** (fat right tail from lucky graduated bags) |
| viralChaser | -28.48 | -26.13 | Pass |
| pumpSeller | +1.07 | +2.79 | **Fail** (earns other bots' buy pumps) |
| postGradBuyer | -0.47 | +0.97 | **Fail** (cash holder most days, GX-limited) |

GX mean return over the `lx-50` seeds: +0.34%.

**Shape, NPC life net and identity (on `lh-200`, with the `lx-50` figures beside them):**

| Check | Pass line | lh-200 result | lx-50 result | Result (lh-200) |
|---|---|---|---|---|
| dead within 7 game days (launches from day 3) | >= 70% | 76.05% (76,051 launches) | 75.66% | Pass |
| graduation rate (observed launches) | 1% to 5% | 1.34% (1,075 of 80,234) | 1.34% | Pass |
| 10x within 30 game days of graduation | <= 0.5% | 0.0012% (1 of 80,234) | 0.000% | Pass |
| NPC cohort life net per token (L6.1, deviation 5) | <= 0 | -6.41 | -7.19 | Pass |
| NPC booked `npcRetail` net per token (reference, not gated) | | -0.56 | -0.47 | |
| money identity, worst residual per game day | < 0.005 | 6.4e-8 | 6.1e-8 | Pass |
| idle control: valuation drift, worst seed | = 0 | 0 | 0 | Pass |
| observed launches (of all created) | | 80,234 (of 120,144) | 20,121 | |

Shape result on `lh-200`: **Pass** on all six rows.

**Gate result at `lh-200`: FAIL** (retail and pump seller). The gate is `false` in `balance-out/launchpad-lh200.json`, and the process exits 1.

### 0.5 Deviations and readings (for the lead to rule on)

1. **Cancel (ratified, v1.1, reading in v1.2).** A creator may cancel a live launch only before another player has traded it. The creator's own dev buy does not block a cancel, and the NPC cohort does not block it (NPCs are not accounts, per the v1.2 reading). A cancel sells the cohort's tokens back to the curve and refunds half the $1,000 fee (`lpRefund`); the other half stays a sink.
2. **NPC launches on in the game world (ratified, v1.1).** `server/host.ts` passes `launchpadNpc: true` to `createGame`. `createGame`'s default stays off, so bare test worlds keep their fingerprints. No game-world fingerprint test changed.
3. **npcRetail booking.** An NPC fill's fee sink halves book on `npcRetail` (both halves when the token has no creator), not on `lpTradeFee`. Without this the line counted the cohort's own buy fees as injected money. The identity closes to the cent; player fees are booked as before.
4. **Idle control (L8.1, ratified reading).** The idle control never trades. Its net worth must move only with its cash, to the cent, on every seed. A zero raw return was not the test: idle cash earns deposit interest, so the paired excess of an idle bot is minus the GX return by construction.
5. **NPC cohort net, the gated measure (L6.1, ratified in v1.2).** Life-end measure per observed launch: the cohort's curve buys, less its 1% buy fee, less its gross sells, less the liquidation value of the inventory still held on a live curve. A graduated token counts once it has had ten game days to unwind. Dead tokens are flat in tokens and need no mark. The raw booked line per launch is reported beside it, not gated.
6. **Observed launches.** A launch counts when it is at least ten game days old at the end of the run.
7. **Benchmark for cash-holding bots (open, section 5).** A bot that holds cash is judged against GX buy-and-hold by construction, so its excess is minus the GX draw plus interest. Its gate result therefore depends on the GX draw of the seed set, not on its trades. This applies to the flipper and the post-graduation buyer, which fail on `lx-50` and pass on `lh-200`.

### 0.6 Open items

- **Held-out gate fails (`lh-200`).** Retail and pump seller fail. The result is in section 3. Per the lead's rule, the next move is a ruling, not a re-tune on `lh`.
- **Retail's pass line is a single-seed tail.** Retail's median excess on `lh-200` is -0.98 points, but its mean is +5.70, and one seed (`lh-97`) has an excess of +222 points, so it alone contributes +1.11 points of the mean. Without that seed the mean is +4.61. The result is a fat right tail from lucky graduated bags, not a broad edge.
- **Pump seller fails by 0.71 points.** Its mean is -0.13 and its median -0.39. It is the closest failing bot. Its edge on `lx-50` came from other bots' buy pumps; that diagnosis was not repeated on `lh`.
- **L7 and e2e not run.** The Launchpad app was not re-checked, and the Playwright specs for launch, trade and graduation were not run in this phase. The e2e world runs NPC launches, so the feed and the Quay tabs show world tokens; the e2e expectations need a look before a merge.
- **Old worlds get no NPC launches.** The flag is set at creation only. A live world started before the flag keeps running without them until it is recreated; the lead should decide whether to turn the flag on at boot.
- **The 10x check samples the price at each tick** (since the 30-gd window fix in `cbb24d8`), not intraday. A spike inside a tick can still be missed.
- **Balance rigidity.** The L6 constants are the only numbers moved. The curve, fees, launch gates, vesting, rug rules and the ban are unchanged, as the spec requires.

## 1. Mechanics by amendment

### 1.1 L6.1 (v1.1) fast pump, slow bleed

- Each buzz arrival adds pending NPC demand (`demand.ts`). The cohort buys pending demand with a buy half-life, then sells as hype fades: per tick, sell share = capitulation x (1 - buzz / peak) + profit taking x gain + time term, never more than the cohort holds.
- At death and at a cancel, the cohort is liquidated to the curve in one fill (`liquidateCohort`, `trade.ts`), so it is flat in tokens over a token's life.
- The NPC fee halves book on `npcRetail` (deviation 3).

### 1.2 L6.2 (v1.1) post-graduation unwind

- A graduated token's cohort position is sold into the liquidity book through `placeOrder` every tick: a share `1 - 0.5^(1/TPD)` of what it still holds (one-game-day half-life), less resting sells.
- Proceeds sweep to `npcRetail` each tick. `lpFills` keeps no holder lots for the cohort account (`isNpcAccount`).

### 1.3 L6.4 (v1.2) instant arrivals

- A buzz arrival (launch buzz, viral shock, buzz item) is bought by the cohort in full in the tick it arrives (`absorb.ts`). No half-life: no player can act before it.
- A refused buy keeps its demand pending.

### 1.4 L6.5 (v1.2) no copycat

- Player buys add no buzz. `LP.BUY_BUZZ_PER_100` and `NPC.BUY_HALF_TICKS` are removed.

### 1.5 L6.6 (v1.2) finite tails

- Viral and launch-buzz laws are Pareto with alpha at least 2.2 (`TAIL_ALPHA_MIN`), so mean and variance are finite. One arrival's demand is capped at the spend that takes the curve from its current point to graduation, plus one cent (`demand.ts` `arrivalCap`).

### 1.6 Tests

`src/world/launchpad/v11.test.ts` covers the v1.1 mechanics (arrivals, half-life, fade, flat at death, cancel rules, unwind, valuation) and the v1.2 mechanics (instant absorption, no copycat, absorb refusal and graduation, the arrival cap, the tail floor). `src/world/launchpad`: 90 tests pass at `1678d34`.

### 1.7 L8.2 bots (v1.2)

- **Viral chaser:** buys within a tick of a buzz rise of 0.25 or a day-volume rise of 1,000; exits at -10%, +50% or after two game days.
- **Pump seller:** $150 stakes in tokens under two game days old, at most four at once; sells into any pump of 5% above its last level, or after three game days.
- **Post-graduation buyer:** buys $1,000 of a graduation within two game hours of it; sells into the unwind after two game hours of hold.

## 2. Tuning (L6.3) on `lx`

### 2.1 Where v1.2 started

v1.1 constants with the v1.2 mechanics (instant arrivals, finite tails) gave 0 graduations and about 97% dead within 7 days at `VIRAL_SCALE` 0.2: the viral shocks were too small to lift a curve to graduation.

### 2.2 Search

Tuning used 10-seed screens on `lx`, then 50 seeds. Rounds: scale 0.2 to 8 to 12 at alpha 2.2 to 2.5; `TIME_SELL_PER_TICK` at 0.03, 0.01, 0.1 (fast reversal), then 0.5 and 1.0. The time term at 1.0 raised the NPC net (+11, fail) and the chaser (+6.5, fail), so 0.5 was kept.

### 2.3 Chosen set (`1678d34`)

| Constant | v1.1 value | v1.2 value |
|---|---|---|
| `VIRAL_SCALE` | 0.2 | 12 |
| `VIRAL_ALPHA` | 2.5 | 2.2 (the `TAIL_ALPHA_MIN` floor) |
| `TIME_SELL_PER_TICK` | 0.00002 | 0.5 |

Other L6 constants unchanged from v1.1 (`DEMAND_PER_BUZZ` 1000, `PROFIT_PER_TICK` 0.02, `CAPIT_PER_TICK` 0.1, `BASE0` 0.008, `LAUNCHES_PER_DAY` 20, sniper 100 to 400).

Why: with instant arrivals and finite tails, scale 12 gives raise-sized shocks that graduate about 1.3% of launches. The fast time term keeps the NPC life net negative and reverts most pumps inside a decision window.

### 2.4 What the search could not fix

- **Pump seller** earns other bots' buy pumps, not its cohort's. No constant closed it.
- **Flipper and post-graduation buyer** hold cash most days. Their excess is the GX draw plus interest. The GX standard deviation over 30 days across seeds is about 6 to 8%, which is larger than the bots' trading effect, so their result turns on the seed set.
- **Retail** has a mean near zero on the median and a right tail from lucky graduated bags.

Changing bot rules to make them lose would be gaming the gate, so it was not done, and neither was the benchmark.

## 3. Held-out confirmation `lh-200`

Run: `npx tsx scripts/balance/launchpad.ts --prefix lh --seeds 200 --days 30 --out balance-out/launchpad-lh200.json` at `1678d34`. Seeds `lh-01` to `lh-200`. Output JSON: `balance-out/launchpad-lh200.json` (git-ignored). Run time about 51 minutes (09:02 to 09:53).

**Result: FAIL.** Retail (+5.70, one-sided +8.37) and pump seller (-0.13, one-sided +0.71) fail. Flipper and post-graduation buyer pass.

- **Retail.** Mean excess +5.70 points, the same sign and size as on `lx-50` (+5.58). The median is -0.98 and the maximum single seed is +222 points: that one seed contributes +1.11 points to the mean. Without it the mean is +4.61. This is the graduated-bag tail named on `lx`, and the held-out run confirms it. The rule does not admit a fix that makes retail lose, so the bot stays as specified.
- **Pump seller.** Mean -0.13, median -0.39, one-sided +0.71. It is the closest failing bot. Its edge on `lx` was other bots' buy pumps; not re-diagnosed on `lh`.
- **Flipper and post-graduation buyer** pass on `lh-200` (-0.66 and -0.95 one-sided). They fail on `lx-50` (+1.29 and +0.97). Both hold cash most days, so their excess is minus the GX draw plus interest. The held-out GX mean is +1.55% against +0.34% on `lx`. The pass on `lh` is a benchmark effect, not evidence that the bots lose on trades. The gate's pass or fail for a cash holder follows the GX draw of the seeds.

The shape, identity and idle control pass on `lh-200` (section 0.4).

## 4. Checks

- `npx next typegen && npx tsc --noEmit`: exit 0 at `1678d34`.
- `npx eslint` on the touched files: 0 errors.
- `npx vitest run --maxWorkers=2` (full suite): 187 files, 1853 pass, 70 skipped, 21 todo, at `1678d34`.
- `src/world/launchpad`: 90 tests pass.
- Not run: Playwright and any e2e check of the Launchpad app (no client change in v1.1 or v1.2).

## 5. Open rulings for the lead

1. **Gate verdict.** The held-out gate fails on retail and pump seller. Options: (a) keep the gate as written and accept the constants as not passing; (b) change the retail bot's sample (a larger seed set, or a trimmed-mean statistic), which needs a ruling because it changes the gate; (c) a structural change to L6 for the pump seller.
2. **Benchmark for cash-holding bots.** Flipper and post-graduation buyer hold cash most days, so their paired excess is minus the GX draw by construction. Either the benchmark is reconsidered for bots that do not trade the index, or the gate's result for them is left to the GX draw.
3. **Retail's tail.** A bot that buys random live tokens has a mean near zero on the median and a right tail from graduated bags. A ruling on the statistic is needed (mean versus median) before the gate can pass.
4. **Pump seller.** It earns the buy pumps of other bots. This is a structural question about who can front-run a pump under L6.4.
5. **NPC flag at boot.** Decide whether old worlds turn NPC launches on at boot.
6. **e2e.** Run the Playwright suite for L7 (launch, trade, graduation, layout) before the next merge.

## 6. Repair pass (review items, p5 second review)

Branch `p5/lp` at the commits below; the app branch `p5/ui` merges it (see `V1-PHASE5` in `p5/ui`).

| Commit | Item | What |
|---|---|---|
| `e5b29fe` | 2 | The NPC sniper fills inside the launch command (`sniperEnter`, `launch.ts`), after the launch's own buzz, as L6.4 does for arrivals. Its exit stays in `flow.ts`. Front-runner bot added to L8.2. |
| `20f0371` | 6, 7 | World launch names are coined words (same 48 by 36 counts, so the draws and the economics do not move). Graduation records the graduation price as the chart's last point. |

### 6.1 Front-runner probe (item 2), 10 seeds `lq`

- Before the fix: buy $2,000 on the launch tick, sell at launch+2 (after the sniper's launch+2 buy): +129.1 points mean excess, positive on every seed.
- After the fix, same seeds, same bot: -69.6 points (lq-10, the v1.2 probe seeds) excess, one-sided -64.8 points. No edge.
- Control with the bot removed, current code: dead within 7 game days 75.8%, NPC life net -7.36, the same as before the fix. The sniper change does not move the shape.
- The bot itself does: with it on, dead within 7 game days is 0%. A round trip at launch resets the cash clock at launch+2, so death falls past the 7-day line (item 10, section 5).

### 6.2 Gates after the sniper fix (flow changed, so re-run)

**Tuning screen, `lx-50` (after the fix; the bot is gated from here on):**

| Bot | Mean return | Mean excess | One-sided 95% | Result |
|---|---|---|---|---|
| creatorDump | -13.83% | -14.17 | -12.63 | Pass |
| sniper | -7.45% | -7.79 | -5.88 | Pass |
| flipper | 0.19% | -0.14 | 1.29 | **Fail** |
| buzzPumper | -81.01% | -81.35 | -79.02 | Pass |
| retail | 5.93% | 5.59 | 9.75 | **Fail** |
| viralChaser | -98.95% | -99.29 | -97.85 | Pass |
| pumpSeller | 1.18% | 0.84 | 2.52 | **Fail** |
| postGradBuyer | -0.14% | -0.47 | 0.97 | **Fail** |
| frontRunner | -67.40% | -67.74 | -64.99 | Pass |

GX mean return over the seeds: 0.34%. Launches observed: 20121. Bot gate: 5 of 9 pass.

| Check | Pass line | Value | Result |
|---|---|---|---|
| dead within 7 game days (launches from day 3) | >= 70% | 0.00% | **Fail** |
| graduation rate | 1% to 5% | 1.34% | Pass |
| 10x within 30 game days of graduation | <= 0.5% | 0.0000% | Pass |
| NPC cohort life net per token | <= 0 | -23.08 | Pass |
| money identity, worst residual per game day | < 0.005 | 5.2e-8 | Pass |
| idle control valuation drift | = 0 | | Pass |

Gate: **FAIL**.


**Held-out, `lh-200` (after the fix; authoritative, no tuning on `lh`):**

| Bot | Mean return | Mean excess | One-sided 95% | Result |
|---|---|---|---|---|
| creatorDump | -13.13% | -14.68 | -13.23 | Pass |
| sniper | -7.14% | -8.69 | -7.60 | Pass |
| flipper | 0.18% | -1.37 | -0.66 | Pass |
| buzzPumper | -78.63% | -80.18 | -78.21 | Pass |
| retail | 7.46% | 5.92 | 8.60 | **Fail** |
| viralChaser | -98.94% | -100.48 | -99.78 | Pass |
| pumpSeller | 1.38% | -0.16 | 0.68 | **Fail** |
| postGradBuyer | -0.12% | -1.67 | -0.95 | Pass |
| frontRunner | -67.63% | -69.18 | -68.01 | Pass |

GX mean return over the seeds: 1.55%. Launches observed: 80234. Bot gate: 7 of 9 pass.

| Check | Pass line | Value | Result |
|---|---|---|---|
| dead within 7 game days (launches from day 3) | >= 70% | 0.00% | **Fail** |
| graduation rate | 1% to 5% | 1.34% | Pass |
| 10x within 30 game days of graduation | <= 0.5% | 0.0012% | Pass |
| NPC cohort life net per token | <= 0 | -22.76 | Pass |
| money identity, worst residual per game day | < 0.005 | 5.1e-8 | Pass |
| idle control valuation drift | = 0 | | Pass |

Gate: **FAIL**.


### 6.3 What the re-run shows

- **The sniper fix holds.** The front-runner that made +129 points on the probe seeds now has a mean excess of -69.6 points (one-sided -64.8) on the same seeds. It is gated and passes on `lx-50` and `lh-200`.
- **The shape gate fails, because of the bot, not the sniper.** Dead within 7 game days is 0.00% on both prefixes. The cohort's deaths read 7.00 days to two decimals (301 of 398 launches on lq-01), but the gate compares ticks against 5,040, and each death lands a tick or more past it: the round trip at launch restarts the cash clock at launch+2, which pushes the death across the 7-day line. Without the bot, the same code gives 75.8% (lq-10 control). This is review item 10 and a ruling for the lead (section 5, item 7).
- **Other bots move with the front-runner.** The viral chaser's mean return on `lh-200` is -98.9% (about -100 points excess), against about -28 points in section 0.4. Its counterparties changed when the front-runner joined the world. Retail and the pump seller are essentially unchanged.
- **Gate result, both runs: FAIL.** `lh-200`: shape (dead within 7 days, 0%), retail (one-sided +8.60) and pump seller (one-sided +0.68). `lx-50`: shape, flipper, retail, pump seller and post-graduation buyer.

### 6.3a App checks on the merged v1.2 build (p5/ui)

- Full vitest on `p5/ui` after the merge: 190 files pass (2 skipped), 1884 tests pass, 70 skipped, 21 todo.
- Full Playwright run on `p5/ui`, 2 workers: 234 passed, 0 failed, 307 skipped by project and device rules. The first run had two failures in the creator-launch spec: the bar read 0.09% where the spec expected 0.00% (the sniper's fill). The spec now checks the bar is above zero and below 5%; the rerun passes.
- Design screens re-taken on v1.2 (32 files, desktop and phone, en and fr). Checked: the phone tab row wraps and no label is cut; the dead page gives its reason; the graduated page reads "Graduated" and draws its chart.

### 6.4 Rulings the lead still needs (not changed by this pass)

7. **Shape measure at the clock boundary (review item 10).** The 7-day death measure compares ticks to 5,040. The front-runner's round trip restarts the cash clock and moves deaths past it: 0% with the bot, 75.8% without. Options: a tolerance on the measure, a measure on the death day rounded to whole days, or a rule for when a round trip resets the clock. The gate is not changed here.
8. **Readings to ratify (review item 11).** `TIME_SELL_PER_TICK` at 0.5 sells half the cohort's inventory every tick (about 5 seconds of game time), which is not the slow bleed of L6.1. `SELL_BUZZ_PER_100` (a sell-driven buzz cut) is not in the v1.2 text and is not implemented.
9. **Held-out verdict (review item 3).** The `lh-200` gate fails on retail and pump seller, as in section 3. No re-tune on `lh` was made.
10. **Cancel fee.** A cancelled launch's cohort liquidation pays the creator's 0.5% fee (the creator is paid on NPC fills too). It is small (about $1 on the probe) and consistent with L3; the lead may want it stated.

## 8. v1.4: the launch cohort, short virality, allocation locked until graduation

Spec: `docs/team/specs/lead-launchpad.md`, "Amendments v1.4" (L6.9, L6.10, L5.1). Commit `6002e6d` set the constants; this section records the tests, the UI and the first screen.

### 8.1 Settings (`src/world/launchpad/constants.ts`)

| Constant | v1.3 | v1.4 |
|---|---|---|
| `BASE0` (launch buzz scale) | 0.008 | 21 (about $3,000 of NPC demand at launch) |
| `BASE0_ALPHA` | 2.5 | 8 |
| `VIRAL_PER_DAY` (r0) | 1.2 | 1.0 per game day |
| `VIRAL_TAU_DAYS` | 1 | 0.5 |
| `BLEED_HALF_TAU` | 1 | 0.3 (cohort half-life 0.15 game days) |
| `CAPIT_PER_TICK` | 0.1 | 0 (off) |
| `PROFIT_PER_TICK` | 0.02 | 0 (off) |

Unchanged: `DEMAND_PER_BUZZ` 1000, `VIRAL_SCALE` 12, `VIRAL_ALPHA` 2.2, sniper, launches per day 20.

### 8.2 Allocation locked until graduation (`src/world/launchpad/vest.ts`)

- The creator allocation is locked before graduation. The curve refuses a sell into it (`lockedGrad`, "Unlocks after graduation").
- From the graduation tick: nothing before the cliff (2 game days), then linear to all of it at 14 game days (`lockedEngineSell`).
- A token that never graduates keeps the allocation locked for good, including after its death.
- `vestCliffDay` and `vestEndDay` return null before graduation; the token page, holdings, ticket and creator console read the null as "Unlocks after graduation".

### 8.3 Tests

Updated to the v1.4 rules (keeping each test's intent): the creator cap (allocation 50M, room is the rest of the 100M cap), vesting from graduation, the cash-death tests (the launch cohort is sold back first, so the curve's cash is under the line), the view's launch progress bound and the e2e launch-share bound (both the share a 99th-percentile launch buys, about 70.7% of the curve; see 8.5, not a fixed guess). New: the allocation is locked before graduation and stays locked after a death; the vesting schedule starts at the graduation tick. `src/world/launchpad` passes (125 tests in `launchpad.test.ts` and the other files).

### 8.4 Balance: `lx-50` at v1.4 (`balance-out/lead/F50.json`)

| Bot | Pass | Mean excess (per $) | One-sided 95% bound |
|---|---|---|---|
| creatorDump | no | -49.93% | 0.00% |
| sniper | yes | -4.11% | -3.09% |
| flipper | yes | -75.08% | -73.75% |
| buzzPumper | yes | -84.47% | -84.21% |
| retail | yes | -2.04% | -0.03% |
| viralChaser | yes | -8.35% | -7.58% |
| pumpSeller | no | +0.79% | +3.00% |
| postGradBuyer | yes | -1.46% | -1.06% |
| frontRunner | yes | -2.28% | -2.19% |
| floorSprayer | no | -1.41% | +0.52% |

Shape (gated): dead within 7 game days from day 3, 70.6%; graduation rate 1.72%; 10x rate 0. All three pass. The NPC net is reported, not gated (L5.1 gate rows): +18.67 per token (booked +59.58), with no players in that world.

Checks on this run: residual max 5.4e-6, ledger max 1.7e-9. Creator dump, pump seller and floor sprayer fail; the held-out `lh-200` run decides. It is pending.

### 8.5 The launch share (view and e2e bounds)

The launch buzz is `BASE0 * (u^(-1/alpha) - 1)` with BASE0 21 and alpha 8 (`launch.ts`), so the mean cohort is 21/7 = 3 buzz = $3,000 and the tail is heavy. Through the constant product (fee left out, an upper bound) and the $400 sniper maximum, a cohort buys this share of the curve at once:

| Cohort | Demand | Share of curve (+ sniper $400) |
|---|---|---|
| median (p50) | $1,901 | 15.1% (17.8%) |
| mean | $3,000 | 22.4% (24.8%) |
| p95 | $9,539 | 52.1% (53.5%) |
| p99 | $16,344 | 69.9% (70.8%) |

The UI-facing bounds use p99 with the sniper: the view test (`view.test.ts`, `cohortShareBound`) and the e2e spec (`tests/e2e/launchpad.spec.ts`, `p99Share`). The bound is a function of the cohort figure, not a fixed number; it rejects a token whose launch is far off the v1.4 cohort, and accepts a normal one with a 1% chance of a false failure per run.

Measured on the view's own fixture (`lpWorld`, no NPC launches, one launch per seed, 60 seeds `measure-0` to `measure-59`): min 1.9%, median 14.7%, mean 20.9%, max 78.6%. At least one launch in 60 (the 78.6% run) is above the p99 bound, which is the tail the bound leaves out. The spec's "16% to 28% across runs" is not backed by these runs and is not used. The e2e run's own launch share is not recorded here: the Playwright run reads one draw per run.
