# V1 Phase 5: status (Launchpad, lead spec v1 with the v1.1 amendments)

Scope: Phase 5 Launchpad, as set in `docs/team/specs/lead-launchpad.md` (L1 to L8), with the binding "Amendments v1.1" section at its end (L6.1, L6.2, L6.3, L8.1 and the ratified deviations).
Branch: `p5/lp`, worktree `.claude/worktrees/p5-lp`. Base: `4ede148`. Status date: 2026-10-11.
Status words as in `docs/V1-PHASE4.md`: **Done**, **Partial**, **Not built**, **Deferred**, **Decided**.

## 0. Phase 5 status (current)

### 0.1 Commits

| Commit | What |
|---|---|
| `b1d3bed` | v1.1 world: L6.1 fast pump and slow bleed, L6.2 post-graduation unwind, the cancel rule, the tuned L6 constants, and `v11.test.ts` |
| `741f84d` | NPC launches on in the server's game world (`server/host.ts`); `createGame` default stays off |
| `288dcb2` | L8.1 gate harness: life-end NPC net, paired excess, idle drift control, `--npc` overrides |
| (this doc) | `docs: V1 Phase 5 status` |

Gates at `b1d3bed` (the world commit): `npx tsc --noEmit` exit 0; `npx eslint` on the touched files 0 errors; `npx vitest run` (full suite) 187 files, 1843 tests, all pass; `src/world/launchpad` 80 tests pass (67 before this phase, 13 new in `v11.test.ts`).

### 0.2 Spec items L1 to L8

| Item | Status | Commits | Notes |
|---|---|---|---|
| L1 Scope and placement | **Done** | `b1d3bed`, `741f84d` | World layer only. NPC launches are on in the server's game world and off in every bare test world. Determinism and the zero-sum test pass. |
| L2 Launch | **Done** (cancel is a ratified deviation) | `b1d3bed` | Cancel now refused only after another player trades; refund is half the fee (see 0.4). Gates, fee, limits and moderation are unchanged from earlier commits. |
| L3 Bonding curve | **Done** (unchanged) | `b1d3bed` | Curve math and the 1% fee are unchanged. NPC fee sink halves now book on the `npcRetail` line (see 0.4). |
| L4 Graduation | **Done** (unchanged); L6.2 **Done** | `b1d3bed` | The cohort's position unwinds through `placeOrder` with a one-day half-life. |
| L5 Anti-rug | **Done** (unchanged) | | Vesting world check, rug flag and suits are as in earlier commits. |
| L6 Hype and NPC flow | **Done** for the v1.1 mechanics; tuned (L6.3); the gate is **Partial** | `b1d3bed` | L6.1 and L6.2 are built and tested. The shape and the NPC net pass at 200 seeds. The retail strategy fails the paired gate by 0.46 points (section 3). |
| L7 App (Launchpad) | **Not re-checked** in this pass | | No client code was touched. The e2e suite was not run (section 0.5). |
| L8 Gates | **Partial** | `288dcb2` and this doc | Four of the five strategies pass at 200 seeds, along with the shape, the identity and the idle control. Retail fails. |

### 0.3 Gate at 50 and 200 seeds (authoritative: 200)

The gate is `scripts/balance/launchpad.ts`, 30 game days per seed, seeds `lp-01` to `lp-200`, on the committed defaults (section 2.4). The excess of each bot is its return minus the GX buy-and-hold on the same seed; the pass line is the one-sided 95% bound of the mean excess (mean + 1.645 SE over seeds).

| Check | Pass line | 50 seeds | 200 seeds | Result at 200 |
|---|---|---|---|---|
| creatorDump: mean excess / one-sided 95% | <= 0 | -0.138 / -0.106 | -0.133 / -0.119 | **Pass** |
| sniper | <= 0 | -0.302 / -0.282 | -0.294 / -0.285 | **Pass** |
| flipper | <= 0 | -0.254 / -0.227 | -0.263 / -0.249 | **Pass** |
| buzzPumper | <= 0 | -0.807 / -0.783 | -0.796 / -0.785 | **Pass** |
| retail | <= 0 | 0.000 / +0.051 | -0.010 / +0.0046 | **Fail** (by 0.46 points) |
| dead within 7 game days, launches from day 3 | >= 70% | 77.8% | 77.4% | **Pass** |
| graduation rate | 1% to 5% | 1.17% | 1.16% | **Pass** |
| 10x within 30 game days | <= 0.5% | 0 | 0.0012% (1 token of 80,372) | **Pass** |
| NPC cohort net per token over life (npcRetail, section 0.4) | <= 0 | -8.0 | -9.6 | **Pass** |
| money identity, worst residual per game day | < 0.005 | 3.5e-7 | 3.8e-7 | **Pass** |
| idle control: valuation drift (net worth minus cash), worst seed | = 0 | 0 | 0 | **Pass** |
| observed launches | | 20,029 | 80,372 | |
| booked npcRetail net per launch (reference, not gated) | | +4.0 | +2.3 | |
| GX mean return over the seeds (benchmark) | | +1.0% | +0.4% | |

Gate result at 200 seeds: **false** (retail). The 50-seed table is kept because it is the screen that the lead's tuning rule asks for. The 200-seed run is `balance-out/lp-v11-a200.json` (ignored by git; reproduce with `npx tsx scripts/balance/launchpad.ts --seeds 200 --days 30`).

### 0.4 Deviations and readings (for the lead to rule on)

1. **Cancel (ratified, v1.1).** A creator may cancel a live launch only before another player has traded it. The creator's own dev buy does not block a cancel (the token then dies and its curve still pays sellers), and the NPC cohort does not block it either (NPCs are not accounts). A cancel sells the cohort's tokens back to the curve and refunds half the $1,000 fee (`lpRefund`); the other half stays a sink. The refusal copy in en and fr now says "another player".
2. **NPC launches on in the game world (ratified, v1.1).** `server/host.ts` passes `launchpadNpc: true` to `createGame`, which is what the e2e world runs through. `createGame`'s default stays off, so the bare test worlds keep their fingerprints. The state flag is stored with the Launchpad state, so an existing snapshot without a Launchpad keeps none until a fresh world is created. **No game-world fingerprint test changed**: the full suite (187 files) passes unchanged with the flag on in the server world.
3. **npcRetail booking.** An NPC fill's fee sink halves now book on the `npcRetail` line (both halves when the token has no creator), not on `lpTradeFee`. Without this the line counts the cohort's own buy fees as money it injected, so a flat cohort looked like a faucet. The money identity closes to the cent, and player fees are booked as before.
4. **Idle-bot zero check (L8.1), reading.** The idle control never trades. Its net worth must move only with its cash, to the cent, on every seed (the drift is exactly zero). A zero *raw* return was not the test: idle cash earns deposit interest (the idle control's raw return is positive in the smoke runs), and an idle bot's paired excess is minus the GX return by construction. **The lead should confirm this reading.**
5. **NPC cohort net, the gated measure (L6.1).** The gate uses the life-end measure per observed launch: the cohort's curve buys, less its own 1% buy fee, less its gross sells, less the liquidation value of the inventory it still holds on a live curve. A graduated token counts once it has had ten game days to unwind (its last share is then 0.1%). Dead tokens are flat in tokens (liquidated at death), so they need no mark. The raw booked line per launch is also reported (+2.3 at 200 seeds). Graduated inventory is not marked at the engine's mid, because that mark is optimistic (the unwind happens at lower book prices). **The lead should confirm this measure.**
6. **Observed launches** keep the earlier rule: a launch counts when it is at least ten game days old at the end of the run, so its life has run out.

### 0.5 Open items

- **Retail fails the paired gate by 0.46 points at 200 seeds** (section 3). This is the one open gate. It is a ruling question as much as a tuning one.
- **L7 and e2e not run.** The Launchpad app was not re-checked, and the Playwright specs for launch, trade and graduation were not run in this pass. The e2e world now runs NPC launches, so the feed and the Quay tabs will show world tokens; a look at the e2e expectations is needed before the next merge.
- **Old worlds get no NPC launches** (flag set at creation only). A live world started before this commit keeps running without them until it is recreated; the lead should decide whether to turn the flag on at boot.
- **The 10x check samples the price at day boundaries**, not intraday. A spike inside a day can be missed.
- **The GX benchmark** has a non-zero mean and wide spread over seeds. A bot that holds cash has an excess of minus the GX return, so the paired excess of the cash-holding control depends on the GX draw. This is inherent in the spec's benchmark and bears on the retail ruling (section 3.3).
- **Balance rigidity.** The L6.3 constants are the only numbers moved. The curve, fees, launch gates, vesting, the rug rules and the ban are unchanged, as the spec requires.

## 1. v1.1 mechanics (what changed in `b1d3bed`)

### 1.1 L6.1 demand comes from arrivals, bought with a short half-life

- Every buzz arrival adds pending NPC demand: the launch's own buzz, each viral shock, each Quay billboard or Wire promo, and each copycat buy (`src/world/launchpad/demand.ts`). Demand is `buzz added x NPC.DEMAND_PER_BUZZ`, in dollars.
- The cohort buys the pending demand with a buy half-life of `NPC.BUY_HALF_TICKS` ticks (3 at the tuned set).
- An arrival resets the cohort's reference peak to the buzz now.

### 1.2 Capitulation, profit taking and the time share; flat at death

- Each tick the cohort sells `floor(npcBal x share)` tokens, where `share = min(1, CAPIT x (1 - buzz / peak) + PROFIT x gain + TIME)`. `gain` is the price over the cohort's cost, and only a positive gain counts. The sell is at any price, and never more than the cohort holds.
- At death (no trade for 24 game days, or the cash clock) and at a cancel, the cohort's tokens are sold to the curve in one fill (`liquidateCohort`, `trade.ts`), so the cohort is flat in tokens over the token's life.
- The NPC fee halves book on the `npcRetail` line (deviation 3).

### 1.3 L6.2 post-graduation unwind

- A graduated token's cohort position is sold into the liquidity book through `placeOrder`, the engine's normal order path, every tick: a share `1 - 0.5^(1/TPD)` of what it still holds (a one-game-day half-life), less the sells already resting (`openSellQty`).
- The proceeds are swept to the `npcRetail` sink each tick, and `lpFills` keeps no holder lots for the cohort account (`isNpcAccount`).

### 1.4 Tests

`src/world/launchpad/v11.test.ts` (13 tests): the arrivals and the copycat amount; the buy half-life (pending halves in three ticks); the fade sells under the cohort's cost; the cohort never sells what it does not hold; an old snapshot without the new fields loads; the flat-at-death rule and the money identity across it; the cancel after the NPC sniper has traded; the unwind through `placeOrder`, its one-day share, the sweep, and no holder lots for the cohort; the cancel after the creator's own dev buy (refund half, sells still allowed); the refusal after another player's buy; the liquidation valuation in net worth; and the game-world flag.

## 2. Tuning (L6.3)

### 2.1 Where the work started

At `4ede148` (set C, the v1.1 starting point) the gate failed on flipper and retail and had no graduations. The first v1.1 model, with the first set of constants, gave 67% dead within 7 days, 2.5% graduations, and an NPC net far above zero. Part of that net was a booking artifact (deviation 3). The rest was real: see 2.2.

### 2.2 Root cause of the NPC cohort's sign

- **Dead tokens are roughly flat** before fees. The cohort buys the arrivals and is liquidated at death.
- **Graduated tokens are where the cohort loses.** The cohort's demand is essentially the whole raise (on a typical graduation the cohort bought about $45k of the $44k raise, diagnostic run `balance-out/diag-d3.json`). Then the unwind into the book loses a further 1 to 2% (the book's impact and spread). Graduation is therefore driven by the cohort, and the cohort pays for it.
- **Fast exits help.** A high capitulation rate lowers the cohort's exposure to the fade, and so lowers the life net. Profit taking helps too, but at high rates it cuts graduations below the 1% floor, because the cohort sells into the rise before the raise is complete.
- **Retail's excess does respond to the exit speed.** Across the twenty-odd settings tried, retail's 10-seed mean excess went from +0.05 (slow exits) to about -0.02 (fast exits), and it stayed near -0.02 for every fast-exit set. Its 200-seed mean is -0.010 (section 3.3).

### 2.3 Parameter sets tried

Ten seeds each unless marked. "Booked" is the raw npcRetail line per launch; "life" is the gated measure. Retail is shown as its mean excess and its one-sided 95% bound. The NPC defaults not listed are the v1.1 values (`BUY_HALF_TICKS` 3, `TIME_SELL_PER_TICK` 0.00002, the viral law, the base buzz, the sniper).

| Set | DEMAND_PER_BUZZ | PROFIT | CAPIT | BUY_HALF | Other | Dead 7d | Grad | Retail mean / 1s95 | Booked net | Life net |
|---|---|---|---|---|---|---|---|---|---|---|
| a10 (first model, old booking) | 2000 | 0.0005 | 0.01 | 3 | | 66.7% | 2.51% | +0.012 / +0.078 | 93.8 | |
| c1 | 2000 | 0.002 | 0.002 | 3 | | 66.3% | 2.46% | +0.049 / +0.129 | 91.0 | |
| c2 / d1 | 1000 | 0.002 | 0.002 | 3 | | 76.0% | 1.67% | +0.013 / +0.072 | 65.7 | |
| d2 | 1000 | 0.005 | 0.0005 | 3 | | 75.7% | 1.52% | +0.015 / +0.072 | 119.3 | |
| d3 | 500 | 0.002 | 0.002 | 3 | | 83.3% | 0.96% | -0.022 / +0.012 | 47.6 | |
| d4 | 1000 | 0.002 | 0.002 | 6 | | 76.1% | 1.50% | +0.014 / +0.073 | 64.2 | |
| e1 | 500 | 0.002 | 0.01 | 3 | | 83.7% | 0.96% | -0.021 / +0.011 | 20.1 | |
| e2 | 500 | 0.002 | 0.005 | 3 | | 83.6% | 0.96% | -0.023 / +0.009 | 29.3 | |
| e3 | 250 | 0.002 | 0.002 | 3 | | 88.2% | 0.64% | -0.021 / +0.012 | 35.6 | |
| e4 | 500 | 0.002 | 0.002 | 2 | | 83.3% | 0.98% | -0.022 / +0.012 | 44.2 | |
| f1 | 500 | 0.002 | 0.01 | 3 | VIRAL_PER_DAY 0.08 | 80.9% | 1.11% | +0.008 / +0.048 | 26.7 | |
| f2 | 700 | 0.002 | 0.01 | 3 | | 80.4% | 1.20% | -0.025 / +0.006 | 23.4 | |
| f3 | 500 | 0.0005 | 0.01 | 3 | | 83.7% | 1.03% | -0.021 / +0.011 | 21.6 | |
| f4 | 500 | 0.002 | 0.02 | 3 | | 83.7% | 0.96% | -0.020 / +0.012 | 13.9 | |
| g1 | 700 | 0.002 | 0.05 | 3 | | 80.8% | 1.20% | -0.018 / +0.013 | 11.0 | |
| g2 | 700 | 0.002 | 0.1 | 3 | | 81.1% | 1.20% | -0.018 / +0.014 | 7.3 | |
| g3 | 700 | 0.002 | 0.05 | 3 | TIME 0.0002 | 80.9% | 1.20% | -0.018 / +0.013 | 10.5 | |
| g4 | 700 | 0.002 | 0.05 | 6 | | 81.0% | 1.06% | -0.018 / +0.014 | 9.7 | |
| h1 | 700 | 0.02 | 0.05 | 3 | | 81.3% | 0.71% | -0.018 / +0.014 | 4.6 | |
| h2 | 700 | 0.005 | 0.05 | 3 | | 80.9% | 1.06% | -0.018 / +0.014 | 8.4 | |
| h3 | 700 | 0.02 | 0.1 | 3 | | 81.5% | 0.71% | -0.017 / +0.014 | 1.3 | |
| **h4 (chosen)** | **1000** | **0.02** | **0.1** | **3** | | **77.7%** | **1.06%** | **-0.018 / +0.013** | **5.3** | **-10.4** |
| 50 seeds, chosen | 1000 | 0.02 | 0.1 | 3 | | 77.8% | 1.17% | 0.000 / +0.051 | 4.0 | -8.0 |
| 200 seeds, chosen | 1000 | 0.02 | 0.1 | 3 | | 77.4% | 1.16% | -0.010 / +0.0046 | 2.3 | -9.6 |

Notes on the table. The "life" column exists from set h4 on (the measure was changed after h3; the earlier sets report the booked net only). Set h3 reached a booked net of 1.3, but its graduation rate of 0.71% fails the floor. At demand 500 most sets sit at 0.96% to 0.98%, below the 1% floor; f1 and f3 pass only just (1.11% and 1.03%), and at demand 250 (set e3) graduations are 0.64%.

### 2.4 Chosen set

`NPC.DEMAND_PER_BUZZ` 1000, `NPC.PROFIT_PER_TICK` 0.02, `NPC.CAPIT_PER_TICK` 0.1. The rest is unchanged: `BUY_HALF_TICKS` 3, `TIME_SELL_PER_TICK` 0.00002, the viral law, the base buzz and the sniper.

It is the set that passed the dead, graduation and life-net checks at 10 seeds with the most margin on each. The 200-seed run then confirmed the shape, the life net and the identity, and retail failed by 0.46 points.

## 3. Gate results and the retail question

### 3.1 Why the gate is not reported as a pass

Four of the five strategies pass at 200 seeds, and so do the shape, the identity and the idle control. The retail strategy fails. Its one-sided 95% bound is +0.0046 at a mean of -0.010. Passing needs the mean at or below about -0.015 at this spread.

### 3.2 Retail's spread

Across seeds, retail's excess has a standard deviation of 0.125 at 200 seeds (0.22 at 50). The distribution is fat-tailed. Its median is -0.017, and one seed (`lp-36`) contributes +1.40. In that seed the retail bot bought a token's curve tokens early, at about $0.000015 each, and the token then graduated and doubled. The engine marks that position at mid, which is correct. At 50 seeds that one seed alone moves the mean by +0.028.

### 3.3 Root cause and what was not done

- Retail's excess is noise-dominated: its mean is near zero, and a few lucky graduated bags set the spread. The sampling error at 200 seeds is about 0.009, so a true mean of about -0.015 is needed to pass.
- The mean moved only between -0.017 and -0.025 across the fast-exit sets, and +0.013 to +0.049 across the slow-exit sets. So retail responds to the L6 constants, but no tried set reached -0.015 at 200 seeds without losing the graduation floor or the life-net sign.
- Changing the retail bot's rules to make it lose would be gaming the gate, so it was not done. Nor was the benchmark changed.
- **For the lead's ruling:** either retail is kept as a gated bot and needs a larger sample or a structural change to the L6 model, or the spec's benchmark (GX buy-and-hold for a bot that holds cash) is reconsidered for bots that do not trade the index. A bot that holds cash is judged against the index by construction, so its excess is minus the GX return, and the GX draw decides its sign.

## 4. Checks

- `npx next typegen && npx tsc --noEmit`: exit 0 at `b1d3bed`.
- `npx eslint` on the touched files: 0 errors.
- `npx vitest run --maxWorkers=2` (full suite): 187 files, 1843 tests pass, 70 skipped, 21 todo, unchanged by the flag.
- `src/world/launchpad`: 80 tests pass (13 new).
- `scripts/balance/launchpad.ts` at 200 seeds: identity residual 3.8e-7, idle drift exactly 0 on every seed, one token of 80,372 reaches 10x within the run.
- Not run: the Playwright suite and any e2e check of the Launchpad app.
