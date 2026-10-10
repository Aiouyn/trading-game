# V1 Phase 4: status

Scope: Phase 4 of the V1 plan (companies, managed shops, player-run funds), as set in the Phase 4 decisions file (`DECISIONS.md` sections 1 to 3) and `ROADMAP.md` 2.2. Stage A (world layer) and stage B (the company engine hooks and the tuning) are on v1.
Branch: `v1`. Status date: 2026-10-10. Stage A was measured at `3d43d22`. Stage B and the checks in section 5.1 were measured at `ee80574` (v1 after the `p4/a2` and `p4/tune` merges). This file was committed after that.
Status words as in `docs/V1-PHASE1.md` and `docs/V1-PHASE3.md`: **Done**, **Partial**, **Not built**, **Deferred**, **Decided**.

## 1. Stage A merged

Stage A is three world-layer branches. Each merged `--no-ff`, one at a time, with `npx next typegen`, `npx tsc --noEmit` and `npx vitest run --maxWorkers=4` after each.

| Branch | Head merged | Merge commit | Notes |
|---|---|---|---|
| `p4/a1` managed shops | `4b77962` | `0ad43e2` | Clean merge. |
| `p4/a3` company world core | `b09fe01` | `5a23eba` | Conflict in `src/i18n/en.json` and `fr.json` only. Both key sets kept; en and fr key sets equal. |
| `p4/a4` player-run funds | `d4ca8f6` | `3d43d22` | Conflicts in i18n (both sides kept), `src/world/core.ts`, `game.ts`, `types.ts` and `court.ts`. See the notes below. |

Conflict resolutions in `p4/a4`:
- `core.ts`: net worth carries both `companies` (A3) and `funds` (A4) in the breakdown and in the total.
- `game.ts`: the day runs `companyDay` and then `fundsDay`. Both command families are routed.
- `types.ts`: `GameState` has both optional fields (`companies`, `funds`), and the command union has both sets.
- `court.ts`: the victim's share of a fine stays `creditExternal` (the p3/c2 rule). The VCF advance on a fund verdict was first credited into the fund account, which raised the fund's NAV and so the manager's funds claim. Stage B moved it to the non-manager investors (section 4.4).

### 1.1 Stage B merged

Stage B is two branches: the company engine hooks (`p4/a2`, section 3a) and the tuning of the managed-shop gates (`p4/tune`, section 2.2a). Both merged `--no-ff` into v1 with no conflicts. Neither branch had uncommitted work in its worktree at merge time.

| Branch | Head merged | Merge commit | Notes |
|---|---|---|---|
| `p4/a2` company engine hooks | `f6ed59c` | `3dfbc2a` | Clean merge. Two commits: `3fcd667` (hooks) and `f6ed59c` (review fixes). |
| `p4/tune` shop gates | `f634f01` | `ee80574` | Clean merge. Two commits on top of `f3d03f3`: the shop gates and the funds VCF advance, then the gate logic under vitest and the crew clamp test. |

## 2. A1: managed shops (`p4/a1`, commit `4b77962`)

What it does (full text in the commit body of `3b7ab6c` and `4b77962`):
- Levers per shop: crew (0.5 to 2.0), price (one change per game day, next day), quality (0 to 3), marketing (0 to 3, a flow), maintain, and a manager (1 to 3 stars, a week of salary prepaid, no refund). Refusals return codes (`SHOP_REFUSAL`).
- Crew caps the demand served. Costs are a share of the well-run net target, so each tier carries the same margin.
- Offline ramp (S4): full income for 8 game days away (16 with a manager), then linear to 25% by day 16 (24 with a manager). Automation adds 5 points per level above that, capped at 50%.
- Attrition: an unattended shop with no manager drifts crew toward 0.5. The NPC shops count as attended.
- Valuation (S5): net worth values a shop at 0.6 x invested + 6 x trailing 7-day net income, with income capped at 1.25 x the well-run target.
- Manager autopilot (review fix): holds the crew floor (0.75 / 1 / 1.25 by stars), the quality floor and caps the price. The owner keeps the other levers.
- Overdraft (review fix): costs stay obligations; the owner is told when cash goes negative.
- Migration: `server/host.ts` runs `migrateShops` after a snapshot loads, before command replay. Existing shops get the well-run settings.
- Retired upgrades: staff and marketing (`biz.axis.retired`). Equipment, location, automation and R&D stay.

### 2.1 Calibration (`4b77962`, supersedes the `3b7ab6c` table)

Median payback in game days, with the p10 to p90 range in brackets. 20 seeds, 40 game days, NPC shops present (`scripts/balance/wealth.ts`). Payback past day 40 is projected from days 10 to 40.

| Tier (ladder) | Well-run (average) | Excellent | Idle (online 16 of 24, sets nothing) | Managed (once a real day, 2-star manager) | Casual (once a real day, no manager) | Neglected (once a real day, sets nothing) |
|---|---|---|---|---|---|---|
| T1 (10) | 11 [10-13] | 6 [5-7] | 20 [19-21] | 12 [11-14] | 11 [10-12] | 33 [31-34] |
| T2 (15) | 15 [14-18] | 9 [7-10] | 29 [27-30] | 17 [15-47] | 27 [26-62] | 50.5 [45-52] |
| T3 (30) | 29 [27-41] | 15 [13-22] | 59 [56-61] | 37 [34-75] | 50 [47-90] | 116 [105-122] |
| T4 (50) | 49 [46-158] | 24 [21-40] | 94 [91-100] | 59 [54-60] | 97 [83-174] | 201 [181-220] |
| T5 (80) | 77 [72-211] | 37 [34-72] | 152 [146-160] | 96 [87-132] | 155 [140-214] | 329 [297-332] |
| T6 (120) | 118 [107-143] | 54 [49-89] | 236 [220-273] | 148 [133-181] | 236 [226-260] | 503 [454-557] |

Style definitions: well-run = well-run settings, online 16 of 24 game days. Excellent = 3-star manager, price 1.05, quality 3, marketing 2, crew tracking demand. Idle = online 16 of 24, sets nothing.

### 2.2 Gate against the tier ladder

Lead ruling (ladder-relative, replacing the literal per-tier bands, which cannot hold together on the 10/15/30/50/80/120 ladder): well-run 0.9 to 1.1x of the ladder, excellent 0.7 to 0.8x, neglected 2 to 3x. The neglected band is read as the once-a-real-day column, which the A1 commit names as the neglected row.

Ratios are the table medians divided by the ladder value.

| Style | Ruling | T1 | T2 | T3 | T4 | T5 | T6 | Status |
|---|---|---|---|---|---|---|---|---|
| Well-run | 0.9 to 1.1x | 1.10 | 1.00 | 0.97 | 0.98 | 0.96 | 0.98 | Pass at every tier |
| Excellent | 0.7 to 0.8x | 0.60 | 0.60 | 0.50 | 0.48 | 0.46 | 0.45 | Miss at every tier |
| Neglected (once a real day, sets nothing) | 2 to 3x | 3.30 | 3.37 | 3.87 | 4.02 | 4.11 | 4.19 | Miss at every tier |
| Idle (for reference, no ruling) | none | 2.00 | 1.93 | 1.97 | 1.88 | 1.90 | 1.97 | Not gated |
| Managed (for reference, no ruling) | none | 1.20 | 1.13 | 1.23 | 1.18 | 1.20 | 1.23 | Not gated |

The two misses the lead named are excellent at T1 (0.6x) and once-a-real-day with no manager at T1 (3.3x). The table shows the same misses at every tier. Nothing is tuned in stage A. Tuning is stage B.

Rank timing (bot, 4 seeds, 40 game days): R1 (Hustler, 20k net worth) reached by excellent 3 of 4, median game day 30. Every other style 0 of 4 by day 40. R2 (250k): none. Median net worth at day 40: neglected 11.1k, casual 8.3k, average 12.3k, excellent 23.3k, idle 15.6k, managed 12.1k.

The literal lock "every tier 9 to 11" would need a 600M megaproject to earn about 60M a day to pay back in 10 days. The ladder-relative gate is kept. Whether to lock to a flat band or keep the ladder is still open (`shops.md` 6.2, Mathis).

### 2.2a Stage B tuning (`p4/tune`): the gates hold

The gate is `npm run balance:shops` (`scripts/balance/shop-gates.ts`). It runs `scripts/balance/wealth.ts probe` on 20 seeds, in parallel processes, with NPC competition present, and exits 1 when a gate is out of band. Bands are the ruling in 2.2 (ratio of the median payback to the ladder value).

The measure changed too. Payback is now the fractional game day the cumulative line crosses the cost, not the whole day. At T1 (10 days) one whole day is 10% of the gate. The tables in 2.1 and 2.2 are whole days; stage A on the same seeds gave well-run 1.10, 1.00, 1.00, 0.96, 0.97, 0.97, excellent 0.65 to 0.45 and neglected 3.30 to 4.19 (whole days).

Final table, regenerated from HEAD (`f3d03f3` code, 20 seeds, 40 game days, fractional days, median; ratio to the ladder in brackets):

| Style | T1 (10) | T2 (15) | T3 (30) | T4 (50) | T5 (80) | T6 (120) | Gate |
|---|---|---|---|---|---|---|---|
| Well-run (average) | 10.9 (1.09) | 15.5 (1.03) | 31.5 (1.05) | 53.2 (1.06) | 84.0 (1.05) | 125.5 (1.05) | 0.9 to 1.1: pass |
| Excellent | 7.7 (0.77) | 10.8 (0.72) | 22.3 (0.74) | 36.9 (0.74) | 58.1 (0.73) | 87.6 (0.73) | 0.7 to 0.8: pass |
| Neglected (once a real day, sets nothing) | 25.8 (2.58) | 32.0 (2.13) | 75.1 (2.50) | 134.1 (2.68) | 220.8 (2.76) | 336.5 (2.80) | 2 to 3: pass |
| Casual (reference) | 11.4 (1.14) | 28.8 (1.92) | 60.8 (2.03) | 107.7 (2.15) | 180.8 (2.26) | 282.8 (2.36) | not gated |
| Idle (reference) | 13.9 (1.39) | 19.9 (1.32) | 41.6 (1.39) | 69.2 (1.38) | 111.1 (1.39) | 167.6 (1.40) | not gated |
| Managed (reference) | 13.1 (1.31) | 18.9 (1.26) | 43.1 (1.44) | 72.0 (1.44) | 115.4 (1.44) | 176.3 (1.47) | not gated |

Causes found in stage A:
- Excellent was too strong. At the crew cap (2.0) a busy pool saturates, so the net per game day was about 1.9 to 2.0 times the well-run target against 1.05. The cost stack was light: marketing 0.1 per level, quality 0.05 per level, manager 0.05 per star. Tier 1 is not saturated, so the cap made the high tiers faster than T1, and no single cost lever could fix both.
- Neglected was too weak. Its income is capped by crew (the crew drifts to 0.5 and nothing else pays). Its 0.67 offline factor over a real-day cycle and the opex then left a net of about 0.22 target per game day. The S4 offline shape was not touched.

Changes (`src/content/shops.ts`, unless noted):

| Constant | Stage A | Stage B | Why |
|---|---|---|---|
| `crew.max` | 2.0 | 1.5 | the crew cap saturates the excellent style, which holds it on the band at every tier |
| `crew.purchase` | 0.55 | 0.75 | a new shop keeps most of its staff while unattended (a valid crew step now) |
| `crew.attritionRate` | 0.03 | 0.01 | staff drift slowly: a slow leak, not a walk-out |
| `quality.costPerLevel` | 0.05 | 0.14 | excellent (level 3) carries the cost of its quality |
| `marketing.costPerLevel` | 0.10 | 0.13 | excellent (level 2) carries the cost of its marketing |
| `marketing.appealPerLevel` | 0.25 | 0.26 | small demand lift (kept; its effect on the gated numbers is small) |
| `manager.costPerStar` | 0.05 | 0.08 | a 3-star manager costs more (`managed` moves to about 1.3 to 1.5 as a result) |
| `reviews.start` | 1.0 | 1.2 | a new shop opens near the well-run target (its effect alone is not isolated) |

Code: `shopsDay` clamps a crew above the cap (a save from before the cap keeps its staff only up to it); `scripts/balance/wealth.ts` takes the excellent crew from `SHOP.crew`; payback is fractional. The offline ramp (S4), the 25% floor, the manager's 16 days, the net-worth valuation and the crew floors are unchanged. No state schema changed, and no randomness was added, so replays are exact and old saves load. The band logic is in `scripts/balance/shop-gates-rules.ts`, unit-tested by `scripts/balance/shop-gates.test.ts` (vitest). The clamp is tested in `src/world/shops.test.ts`. This repo has no CI config, so the probe gate (about 3.5 minutes on 20 seeds) stays the manual `npm run balance:shops`.

Verified at HEAD: the table reproduces from raw probe rows. Four cells differed from the commit message (average T4 and T6, excellent T3 and T4, neglected T4); this table is the reference, and the commit message is not amended.

Whole-day check (the same rows, each payback rounded up to a whole game day): average T1 is 1.10 and excellent T1 is 0.80, both on the inclusive band edge; every other gated cell is inside its band. The gates pass on either measure, but the two T1 cells are edges, not margins. The gate uses fractional days (the metric change above).

Managed (reference, not gated) is about 1.3 to 1.5 against S3's "managed reaches the well-run payback" (about 1.0). Measured cause: the manager's star cost is one part, and the S4 ramp is the rest. With the manager's star cost set to 0 (a temporary edit, four seeds, reverted and not committed), managed is 1.00 to 1.19 by tier. The rest is structural: a once-a-real-day owner is away 23 game days in 24, so a manager's 16 full days and then the ramp average about 0.875 of full income (a rough cycle estimate). S3's target cannot hold with S4's shape and once-a-real-day presence. This needs a lead ruling (open item 8). Stage B changes nothing for it.

Stabilizer (risk 7), rechecked: three seeds, 40 game days each, NPC competition present (a throwaway script, not committed). The sink multiplier was 1.000 on every day of all three runs. Supply growth was negative in the first days (shops being bought) and below 1.5% a game day after day 6 in seed 1, under the 4% target. Shop costs were 20 to 23% of all sinks. The new sinks only lower wealth growth, so they cannot engage the stabilizer. Not checked: the five-year `run.ts` economy.

### 2.3 A1 open items

- No UI for the levers (stage C). Until then new shops sit at the neglect defaults (crew 0.75, from stage B; 0.55 at stage A).
- The economy stabilizer band has not been rechecked after the new sinks (`shops.md` risk 7).
- The overdraft notice is English text. It needs an i18n key with the inbox work (stage C).
- Morale is derived from crew load only. Manager stars change only the review bonus and the offline window.

## 3. A3: company world core (`p4/a3`, commits `943f7c6` and `b09fe01`)

World layer only: `src/world/company/*`. `GameState.companies` is optional, so old saves and worlds with no company behave as before. No engine pricing is touched. Filings and signals are data for A2, which wires them into the engine's value source (`companyPrintShare`, G21).

### 3.1 Settled reading: G22

Recorded in `src/content/company.ts` (DECISIONS C1). F_s is the unit-variance sector shock, the sum of z sqrt(dt) with dt = 1/252 year. There are no unobserved working-capital or cost surprises. Under this reading the engine's rho probe passes: median 0.1012 against the 0.15 band, p90 0.1824 against 0.25.

The other reading tested (Tape's 3% working-capital and 1% cost noise) fails, at 0.2695 and 0.5006. The band was not loosened and revenue noise was not cut.

The freeze itself is not decided here. The header of `docs/team/specs/quant-company-building.md` still says NOT FROZEN, and Ledger's freeze decision is needed to change it (open item 3).

### 3.2 What is in

- Sector economics: gross margin by sector at the reference load, unit cost, price, T0, delta, cycle beta, input index and patents.
- Demand: logit share with an outside option against 3 to 5 NPC rivals, weekly reaction, quarterly entry and exit, imitation with a 126 game-day half-life.
- R&D: odds, gain, quality score, pharma gates, patents, and a shown band. One project at a time.
- Hiring: 3 game-day fill, ramp, G&A span, and Seed, Growth and Late headcount caps. Headcount cost is printed in full (no cap; G18).
- Tiers move on frozen statements at filing. Private rounds at 0.70 V, NPC investor pools only, at most 25% of post-money.
- Quarterly freeze with a sha256 digest and filing at close + 3 days. Weekly signals with noise drawn once per filing (G20).
- Founder template (R2, $150k, one product at $50, 5 Ops, 2 Sales, 2 R&D, 1 G&A), four goals, and refusal copy for 21 codes in en and fr (what, why, do).

### 3.3 Review fixes (`b09fe01`)

- Discretionary spend (marketing, R&D) is paid from the opening cash of the day. An unfunded day spends nothing. Mandatory costs are always paid. Hires need `hireRunwayDays` (5) of wages in cash.
- Marketing: finite amounts only, at most 10,000 per product per game day, and at most the cash on hand.
- Distress is an event on the day cash goes below zero.
- A next-gen success grants a launch credit. Launching a product spends one.
- Sales and R&D effort scale with the G&A span.
- Private mark: the filed inputs after filing. Before filing, the run rate after 21 trading days (`privateMarkDays`), else the last closed quarter, else cash. A single day of sales is never annualized.
- Net worth counts a founded private company at 0.85 x V x ownership (`netWorthBreakdown.companies`). Founding costs only the haircut.
- The company world is created only by a successful found.

### 3.4 Calibration (`scripts/balance/company-calibrate.ts`)

Tech, D0 790, 252 game days, 24 seeds: 1.902% of capital per game day (target 1.90), 116.8 units per game day, revenue 5,839, EBITDA 3,464, FCF 2,853 per game day. Discretionary (D0 1340): 1.741%. The spec's 260 units per day (50% gross margin) is not matched by tech. The yield target is.

### 3.5 A3 open items

- Known proposals, not in the spec: PE_s and EVS_s are flat; the cost-project gain, the NPC price floor, the plant C0 and multiplier, overtime at 1.5 x Ops wage per unit, and the NPC investor pool sizes.
- The sector shock is a world stream, not the engine's `sectorRng`. A2 should bind them (SPEC:197).
- Out of stage A: debt, covenants, dividends, buybacks, IPO, plans, windows, CEO, takeover, antitrust, executives, board, franchising, supply deals and the lint boundary (B or C).

### 3a. A2: company engine hooks (`p4/a2`, commits `3fcd667` and `f6ed59c`)

The engine enforces six generic hooks for player companies. The world layer decides the numbers (DECISIONS C2, hooks 1 to 6). Rule numbers live in `src/content/company.ts` (`COMPANY.trading`) and reach the engine through `WorldConfig.companyRules`. `DEFAULT_COMPANY_RULES` equals them (a test pins this). Saves stay plain JSON, and every new field is optional, so old saves load.

| Hook | Where | What it does |
|---|---|---|
| 1. Value source | `AssetDef.valueSource` `'company'` (`companyPrintShare`, default 1), `src/engine/types.ts` | A company's value moves only through `printCompanyValue`, on the next tick. The value takes the full print. The price takes `companyPrintShare` at once. The ecology close prints it through the value pool, like news. No diffusive value shock, drift, jumps, catalysts, world-event value moves or options (`tradeOption` refuses). The price still diffuses and is pulled to value. |
| 2. IPO and delisting | `listCompanyStock` appends the asset at the IPO price (`appendAsset`); delisting goes through `delistAsset` | A delisting ends live plans as `terminated`. |
| 3. Windows and lockups | `src/engine/restrictions.ts` | Covered accounts trade only on their open days. `placeOrder` refuses `closedWindow` (with `rejectUntil`, the next open day) and `lockup`. A covered order accepted in the last 5 open days carries `windowClosing`. Open covered orders are cancelled at the first tick of a closed day (a `restricted` event). Options on a covered underlying are refused in closed windows. Plans skip the window, not the lockup. |
| 4. Sell-only plans | `src/engine/programs.ts` | `commitPlan` refuses `planSellOnly`, `planFloorTooHigh`, `planLimit`, `planInLockup`, `planTooSoon`, `planUnfunded`, `planBanned`, `planExists` and `planBadSpec`. `editPlan` and `cancelPlan` always refuse `planImmutable`. Escrow is the locked shares. A plan sells out of escrow only, as a limit at `minPrice`. A price skip is held to end day + 63, and a halt or a volume release ends the hold. Events `planSkipped` and `planEnded`. Manual sells over the free shares are refused (`stacking`). Program ids are accepted only from the engine's own runner (`placeProgramOrder`). A buy that names a plan is `planSellOnly`, and any other program route is `programOrderReserved`. |
| 5. Buybacks | `src/engine/programs.ts` | `addBuyback` refuses `buybackTooLarge` (more than 1% of float a day) and `closedWindow` (any day outside the treasury window, with `untilDay`). `programsDay` buys the fixed daily quantity through the same checks. |
| 6. Takeover tender | `src/engine/companyAssets.ts` | `tenderOffer` refuses `tenderBelowFloor` (1.2 x VWAP30, or the mid if there is no volume yet) and `tenderUnfunded`. Otherwise every holder (long, short and locked) settles at one price through `settleAsset` and `delistAsset`. The bidder pays exactly the settled total, and plans end as `tender`. VWAP30 is the sum of close x units over the sum of units, for the last 30 closed days (`AssetState.bars`, company stocks only). |

Review fixes (`f6ed59c`):
- Buybacks: the 1%-of-float cap is a sum over every buyback in the asset, per game day. A program filed against a float other than the asset's is refused (`buybackBadSpec`). `buybackTooLarge` reports the headroom.
- Margin and escrow: a liquidation sells only unlocked shares, so escrow and price holds are never sold. Margin collateral excludes locked shares (`collateralEquityOf`, used by the margin call, the liquidation, `buyingPower` and `liquidationPrice`). A liquidation does not cancel program orders. Plan fills are clamped to what the account holds, and a plan order that cannot sell releases its escrow. A plan day refused at placement now releases its escrow, so a plan can end.
- Forced trades in a closed window (margin liquidation, squeeze buy-in) are a documented exception, not scoped in. Refusing them would leave a covered account under-margined. The exception is in `restrictions.ts` and pinned by a test.
- Tender: a bidder is required (`tenderNoBidder`, a new reject code). With no bidder nothing settles and nobody is credited.
- Price hold: a plan order records whether its last limit check failed on price (`priceMissed`). An unsold remainder is a price hold when that check failed.
- `cancelOrderResult` returns `planImmutable` (plan) or `buybackImmutable` (buyback) for any cancel attempt. `cancelOrder` keeps its behavior. `modifyOrder` returns `buybackImmutable` for buybacks.

Tests: `src/engine/companyHooks.test.ts`, 41 tests (31 for the hooks, 10 for the review fixes). Bare-engine identity holds: the sha256 of two seeded runs (one with `gameConfig`, one with ecology full) is unchanged by the branch, at `61f445d2...` and `e80f9cd0...`.

Open items for A2:
- Lead: should lockup shares also be untouchable in a margin call? Today a margin liquidation never sells escrow or price holds, but it can sell lockup shares through the closed-window exception above. The question is open.
- Not in this stage: the world wiring (IPO book, founder grants, filing-day window and plan calls), the margin and lockup interaction for plan accounts (company accounts are cash accounts), the 2%-of-shares-a-day founder cap (`planSkipped` with `cap` is not emitted), the stacking cap on same-side open orders beyond escrow, and the refusal copy.

## 4. A4: player-run funds (`p4/a4`, commits `6c63fb3` and `d4ca8f6`)

### 4.1 What is in (DECISIONS section 3, ROADMAP 2.2)

- Custody: the fund is its own engine account (`FUND:<id>`). The manager's only receipts are his own redemption value and crystallized fees.
- Mandate: asset classes, leverage at most 1.5x, a position at most 20% of NAV. A change needs 24 real hours of notice.
- Fees: management at most 2% a game year, accrued daily, crystallized each quarter (63 game days). Performance at most 20% above the high-water mark. Custody sink 0.25% a game year.
- Deposits and redemptions settle at the day-close NAV. The gate is 20% of AUM per day, pro rata, and is off while frozen, winding down, in the breaker, or in a mandate notice. An early exit within 2 real days pays 1% that stays in the fund.
- Investors: at most 25% of own net worth after a deposit, an account at least 7 real days old, not linked to the manager.
- Manager stake at least 10% of AUM, and AUM at most 10x the stake.
- Opening a fund: Operator (R3), an account at least 14 game days old, stake at least $250k, no S5 verdict in the last 8 real weeks, one open fund at a time.
- Related party: a fund order is refused while the manager or a linked account holds an opposite open order in that asset. Insider or 1%-of-float assets are capped at 5% of NAV and filed publicly.
- Front-running: a fund fill within a game day of a personal fill of the manager, same asset and side, adds evidence and the harm. At the civil bar a court case opens.
- Absent manager: no command for 72 real hours freezes trading and opens redemptions. Frozen for 14 game days, then the fund winds down at market.
- Breaker: NAV per unit 30% below the last game week's high freezes new trades for one game day.
- S5 verdict: fine = min(35% of NW, max($100k, 8% of NW)). Award = 100% disgorgement of the gain plus 1.5x harm, paid from the manager's stake first, then cash down to the court floor. The unpaid balance gets a 50% VCF advance, paid to the non-manager investors pro rata to units (4.4). Eight-week ban from opening a fund. The convicted fund winds down.
- Public view: name, mandate, fees, NAV history, filings, AUM bucket and manager handle. No investor list and no holder units.

### 4.2 Review fixes (`d4ca8f6`)

- Caps count queued orders. Two same-tick buys of 19% of NAV: the second is refused.
- Related party is checked at entry and before every engine step. An alliance change that puts a resting fund order opposite a linked order cancels the fund order.
- Surveillance counts only the manager's own fund orders. A forced sale is not discretionary.
- Manager stake floor on redemptions: while investors are in, the manager's own redemption may not take the stake below max(10% of AUM, $250k).
- S5 fine formula: the headroom term is removed.
- Float check uses `floatShares` with a fallback to `sharesOutstanding`.

### 4.3 Property test and the confirmed interpretations

Property test (`src/world/funds/property.test.ts`): 10,000 seeded sequences of 12 random actions, plus scripted openings (a stress crash every 20th sequence, a front-running pattern every 25th, and a scripted alliance case every 9th). 200 sequences replay exactly. About 8.5 s. Invariants are checked after every action:
- no negative units or payables, and reserved units equal the open redemption requests;
- claims sum to fund equity;
- manager receipts stay within his entitlement, and investors are paid no more than credited;
- manager cash rises only by fund payouts;
- the related-party invariant holds before every step, and the mandate caps hold on every accepted buy, with open buys counted;
- transfer-only commands leave total cash unchanged.

Mutation checks (not committed): a planted 1% overpayment to the manager fails the property test. Disabling the pre-step related-party guard fails it too.

Unit tests (`src/world/funds/funds.test.ts`): 46 tests, one or more per rule.

Interpretations confirmed by the lead:
- The stake floor applies only while other holders (or a deposit) are in the fund. A sole manager may take the stake to zero.
- The VCF advance is paid to the non-manager investors, pro rata to their units at the verdict (stage B, lead ruling B). Recovery from garnishment and the 10% VCF share of each fine are not modelled.

Other interpretations in `6c63fb3` (one real hour is 720 ticks, one game day; linked accounts are the same player or an alliance mate; the breaker reads the week's high) are as written there and are not listed as confirmed.

### 4.4 A4 open items

- Resolved in stage B (`p4/tune`, lead ruling B). The advance no longer enters the fund: `advanceToInvestors` (`src/world/funds/flows.ts`, called from `fundVerdict` in `src/world/court.ts`) credits each non-manager holder, reserved units included, pro rata to units at the verdict. The fund's cash and NAV do not move, so the manager's claim is unchanged. The payment goes through `creditExternal` (the rule for the victim's share of a fine), so it stays out of the day and arrival figures, and each investor gets a `funds.vcf.paid` notice (en and fr). Tests: the split is pro rata (1:3), and a unit test checks that the fund's cash, NAV and the manager's claim do not move.
- Not in stage A: the fund UI (the UI must translate `funds.refusal.*`, and personal-order refusals return a code), the company insider seam (`insiderId` is set by nothing yet), the fund board (net return, Sharpe, $1M minimum), and engine-wide cash conservation. The conservation check is exact for transfer-only commands only, because fees, interest and dividends are booked inside `step` with no ledger.

## 5. Checks at `3d43d22`

| Command | Result |
|---|---|
| `npx next typegen` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=4` | 120 files, 1256 tests pass, 1 skipped |
| `npx eslint src scripts server` | 0 errors, 15 warnings (the Phase 3 warnings: `react/jsx-no-literals` in `Welcome.tsx`, unused vars in `game.test.ts`) |
| `npm run build` (Turbopack) | PASS |
| `npm run e2e` (with `E2E_BUILD_CMD="npx next build --webpack"`) | PASS. 495 tests: 192 passed, 0 failed, 303 skipped (by project, as in Phase 3). |

## 6. Open items

1. **Shops gates.** Resolved in stage B (2.2a): all three gated styles hold on every tier at 20 seeds (`npm run balance:shops`). Still open: the ladder against a flat lock (Mathis, `shops.md` 6.2), and the managed row, which is above S3's well-run payback (lead).
2. **Shops economy.** The stabilizer was rechecked on three 40-day seeds in stage B (2.2a) and never engaged. A five-year `run.ts` check is still open. Owner: Ledger.
3. **Company freeze.** The G22 reading is recorded in code. The spec is still NOT FROZEN. Owner: Ledger.
4. **Company engine wiring.** A2 wires filings and signals into the engine (`companyPrintShare`, G21) and binds the sector shock to `sectorRng`.
5. **VCF advance and the manager's day figures.** Resolved in stage B: the advance goes to the investors, not the fund, and sits outside their day and arrival figures (4.4). Owner: lead to confirm the day-figure part.
6. **Lever UI, refusal copy and the funds UI.** Stage C.
7. **Insider seam.** `insiderId` is not set by the company module yet.
8. **Managed against S3 (lead decision).** Managed sits at 1.3 to 1.5 against S3's about 1.0. The manager's star cost is one part and the S4 ramp against once-a-real-day presence is the rest (2.2a). Options: restate S3 as an ungated reference; extend the manager's full-income window to 24 days (an S4 change); or lower the star cost and re-hold excellent with another lever. Owner: lead.
