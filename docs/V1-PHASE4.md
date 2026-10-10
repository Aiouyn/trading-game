# V1 Phase 4: status

Scope: Phase 4 of the V1 plan (companies, managed shops, player-run funds), as set in the Phase 4 decisions file (`DECISIONS.md` sections 1 to 3) and `ROADMAP.md` 2.2. Only stage A is on v1 so far.
Branch: `v1`. Status date: 2026-10-10. Measured at `3d43d22` (v1 after the last stage A merge). This file was committed after that.
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
- `court.ts`: the victim's share of a fine stays `creditExternal` (the p3/c2 rule). The VCF advance on a fund verdict uses `credit` into the fund account. A fund account is not a player, so `shiftBaselines` does nothing on it. The advance therefore raises the fund's NAV, and so the manager's funds claim (section 4.3, open item 5).

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

### 2.3 A1 open items

- No UI for the levers (stage C). Until then new shops sit at the neglect defaults (crew 0.55).
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
- S5 verdict: fine = min(35% of NW, max($100k, 8% of NW)). Award = 100% disgorgement of the gain plus 1.5x harm, paid from the manager's stake first, then cash down to the court floor. The unpaid balance gets a 50% VCF advance. Eight-week ban from opening a fund. The convicted fund winds down.
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
- The VCF advance is credited to the fund at once. Recovery from garnishment and the 10% VCF share of each fine are not modelled.

Other interpretations in `6c63fb3` (one real hour is 720 ticks, one game day; linked accounts are the same player or an alliance mate; the breaker reads the week's high) are as written there and are not listed as confirmed.

### 4.4 A4 open items

- The advance raises the fund's NAV, so the manager's funds claim rises with it. The victim's share of a fine stays out of the day and arrival figures (p3/c2). Whether the VCF advance should do the same is for the lead to decide (open item 5).
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

1. **Shops gates.** Excellent misses at every tier (0.45 to 0.6x), and neglected misses at every tier (3.3 to 4.2x). Stage B tunes both. The ladder against a flat lock is open (Mathis, `shops.md` 6.2).
2. **Shops economy.** The stabilizer band has not been rechecked after the new sinks (`shops.md` risk 7). Owner: Ledger.
3. **Company freeze.** The G22 reading is recorded in code. The spec is still NOT FROZEN. Owner: Ledger.
4. **Company engine wiring.** A2 wires filings and signals into the engine (`companyPrintShare`, G21) and binds the sector shock to `sectorRng`.
5. **VCF advance and the manager's day figures.** Decide whether a fund-verdict advance sits outside the day and arrival figures. Owner: lead.
6. **Lever UI, refusal copy and the funds UI.** Stage C.
7. **Insider seam.** `insiderId` is not set by the company module yet.
