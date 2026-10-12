# V1 Phase 9: status

This file records each Phase 9 track's status. Track 9A (acceptance matrix) is recorded here first. The matrix is
`docs/V1-ACCEPTANCE.md`; its counts and per-row commands are the source of truth for the acceptance state.


Scope: Phase 9 as set in `docs/team/specs/lead-phase9.md` (binding). This file holds section 9B (Exploits and the wealth curve). Tracks 9A (acceptance matrix), 9C (load and calibration residuals) and 9D (docs) add their own sections when they land.
Branch: `p9/b`, worktree `.claude/worktrees/p9-b`, from `v1` at `deae39c`. Status date: 2026-10-12.
Status words as in `docs/V1-PHASE6.md`: **Done**, **Partial**, **Not built**, **Deferred**, **Decided**. Gate results are **PASS** or **FAIL**. A FAIL is routed to the owner named in its row and is not passed by changing a constant.


## 9A acceptance matrix

**Counts** (regenerated from the tape spec tables and the Vitest title index): see the header of `docs/V1-ACCEPTANCE.md`.
At the last regeneration: PASS 167, PARTIAL 5, NOT RUN 63, NOT BUILT 264, DEFERRED 17, N/A 6 (total 522).

**Runs of this pass (last commit of track 9A):**
- Full Vitest (`npx vitest run --maxWorkers=3`): 236 files passed, 2 skipped (238); 2333 tests passed, 70 skipped, 21 todo;
  exit 0. The baseline before the new tests was 232 files and 2311 tests.
- `npx next typegen` and `npx tsc --noEmit`: exit 0.
- `npx eslint` on the four test files touched in this pass: exit 0.
- Not run: any Playwright spec (every NOT RUN row names one), and the harness bands in `scripts/balance` and `scripts/ecology`.

**Reviewer findings and how this pass answered them:**
- Items 1 to 4 (PASS rows backed only by todo or skip): cap_carry_edge and signal_postprint_drift are NOT BUILT; the desk
  rank-loss row is N/A; X10 is PARTIAL (hash PASS, ratio DEFERRED).
- Item 5 (matrix contradicts the tree): link_carries_no_state is PASS (route.hunts); event_invalid_values is PARTIAL (its
  test exists); the matrix is regenerated.
- Item 6 (wm_slot_exact): the test asserts the exact refused set and that each refusal is a min-size refusal. Row PARTIAL.
- Items 7 and 8 (gates not written): event_replay_bytes now runs 20 seeds (PASS). event_invalid_values stays PARTIAL (20 x 1,
  no flash halt). X2 (ecology) stays PARTIAL. M07 unit runs 30 game days of one seeded run plus 3 seeds on day 1 (PASS, the
  reading is written on the row).
- Item 9 (M02): the test asserts that dayShock is the only field changed besides lnP (PASS; the deviation is recorded above).
- Item 10 (wm_free_clamp): the re-snap clause is tested through the projection; the reducer cannot store an under-min free
  rect, so the row stays PARTIAL.
- Item 11 (wm_focus_is_top): a count guard (more than 1,000 raise checks) makes the raise check the real assertion.
- Item 12 (shockprice_not_event): every non-test source file under src is walked; the known callers are listed and no event
  module calls a test shock.
- Item 13 (describe citations): described above; generator now refuses todo-only describes.

**Not done in this pass (9A):** most NOT BUILT rows (onboarding, Hooks, company E-UI and B-HARNESS, rivals bots, bust and ad
farming, perf rows) were not implemented as tests. Those rows stay NOT BUILT with their named reason.

**Status vocabulary.** PASS, PARTIAL (part of the row passes; the named remainder is not met or not written), FAIL,
NOT RUN, NOT BUILT, DEFERRED (ruling named), N/A (reason given).

**Rules applied in this pass (after the reviewer's findings on 02139aa):**
- A PASS needs an executable `it()` or `test()`. A `describe` whose block holds only `it.todo` or `it.skip` does not
  back a row. The matrix generator now refuses such describes.
- A row whose spec gate is larger than the written test is PARTIAL, not PASS, and names the unwritten part.
- A row whose spec claim is not what the code does is PARTIAL until the spec wording or the test is corrected, and the
  deviation is written here.

**Reasoned deviations and rulings recorded in this pass:**
- `M02 unit`: the spec says `shockPrice` changes only `assets[id].lnP`. The code also sets the day's Test-shock field
  `dayShock` on that asset (`src/engine/sim.ts`, `shockPrice`), so the close prints and labels the move. The design is
  deliberate (the comment at that line says so). The row is PARTIAL until the test asserts `dayShock`.
- `desk_rank_loss_keeps_files`: N/A by lead ruling D-13 (rank never drops, so no rank-loss lock exists).
- `event_invalid_values`: the spec gate is 200 seeds x 5 game years with the flash ±15% halt checked. The written test is
  20 seeds x 1 year and checks NaN, Infinity and the floor. `worldEvents.ts` has no ±15% halt clause. PARTIAL.
- `wm_slot_exact`: at 1440 x 900 the Broker fits 4 of 12 slots (L2, R2, L23, R23). The other 8 are refused as too small.
  The spec says every slot at that size. PARTIAL. The 1920 x 1080 half is covered in the same test.
- `cap_carry_edge`, `signal_postprint_drift`: the bots and probes are `it.todo` in
  `src/world/company/exploits/blocked.test.ts` (blocked: the bot harness and the engine probe are not in the worktree,
  and the binding gate is engine-staging). NOT BUILT. N17 and X10 (company) take the worst of their gates.
- Describe-title citations: a PASS row may name a `describe` title when that describe holds executable `it()` tests
  (checked by the generator). Rows that name only a todo or skip describe are not PASS.

## 9B. Exploits and the wealth curve

### 9B.0 Summary

This revision answers the Phase 9B review (blocking items 1 to 4, non-blocking items 5 to 10).

- **Clip (spec X1, 720 clips against one order, 20 seeds): FAIL.** The one-sided 95% upper bound of the lift ratio is 2.035 against the gate of 1.5 (mean 1.805). Routed to Ledger and Quant, with the lever in 9B.3. K is not changed.
- **Unlinked alts: FAIL, on three routes.** An alt with its own device and no money link is paid its own ten ad breaks a real day (+$2,500 a day, against EV <= 0). Its trade on a tip is not flagged. A tipped investor who deposits into an unlinked fund is not flagged on the manager's trade. Each is a recorded FAIL gate (`it.fails`, so the suite stays green while the gap is open). The lever is an account-level identity layer, which is outside the world rules, so a lead ruling is needed: defer, or build it.
- **Named suites built (PASS):** ad cash through a transfer, a loan, a fund deposit, a court settlement, a margin buy, a Launchpad round trip and a business round trip; fund-based tip routes for a tipped manager and for a linked investor. **Not built:** the options route (needs a Derivatives-rank account), the retry lottery from R0 (Mathis's decision), and the honest-baseline money EV for the bust, alt-peak and insider runs.
- **Money-rule fixes this revision:** the fund investor-link and self-match checks used the alliance alone; they now use the collusion graph, so a device-, gift- or loan-linked alt can no longer deposit into the manager's fund. The court's loan-default verdict did not bump the deal index, so the loans-owed index went stale and kept a closed debt in the rank basis.
- **Rank-time table: Partial.** The table runs to 120 game days, not 365. R2 to R4 are censored (no seed reaches them). The 365-day run is not done (9B.4).
- **Non-blocking:** item 5 fixed (bump in the court verdict, regression test); item 6 corrected (9B.5); item 7 pinned with a test and routed to a ruling; item 8 analysed (no money moves through those readers; ruling); item 9 analysed (not probed; residual); item 10 corrected (9B.4).

### 9B.1 Items

| Item | Status | What | Where |
|---|---|---|---|
| Alt-peak, loan route | **Done (fixed)** | A loan owed is subtracted from the rank basis. A 0% loan from a rich account no longer raises the borrower's rank peak. | `src/world/social.ts` (`loansOwedOf`, `unearnedCashOf`), `src/world/assets.ts` (`refreshNetWorth`) |
| Alt-peak, gift route | **Done (fixed)** | Gift cash received, net of gift cash given, is subtracted from the rank basis (`Player.giftsNet`). | `social.ts` (`noteGift`), `types.ts` |
| Alt-peak, funding link | **Done (fixed)** | An accepted loan counts as player-to-player money for the collusion graph (funding link, `FUNDING_MIN_GIFTS` = 2). | `social.ts` (`respondDeal`) |
| Ad farm, linked cap | **Done (fixed)** | The sponsor cap is one count for the collusion group (`linkedAccounts`). A second linked account adds no breaks: one honest account and a linked pair are both paid ten. | `src/world/sponsor.ts` (`adsUsedToday`, `finishBreak`), `src/world/exploits/ad-farm.test.ts` |
| Ad farm, restricted-cash laundering | **Done (tested, partial)** | Ad cash cannot leave by a transfer, a loan, a fund deposit, a court settlement or a margin buy. A Launchpad round trip and a business round trip keep the proceeds restricted. Not covered: the option refusal (needs a Derivatives-rank account) and the alliance deposit. | `src/world/exploits/launder.test.ts`, `ad-farm.test.ts` (laundering block) |
| Ad farm, unlinked alts | **FAIL (routed)** | Two accounts with separate devices and no money or trade link are two profiles; each is paid ten a real day. Gate `ad_farm_unlinked_alt`. | `ad-farm.test.ts` (`it.fails`) |
| Insider alts, linked alt | **Done (fixed)** | A tip counts for every account in the trader's collusion group. An order by a linked alt on a tip stock is flagged, on the alt. | `src/world/tips.ts` (`openTipsFor`) |
| Insider alts, unlinked alt | **FAIL (routed)** | An alt with its own device and no money from the tip holder trades unflagged. Gate `insider_alt_unlinked`. | `insider-alts.test.ts` (`it.fails`) |
| Insider alts, fund route, tipped manager | **Done** | The manager's order through the fund is the manager's, and is flagged on the manager. | `src/world/exploits/fund-tips.test.ts` |
| Insider alts, fund route, linked investor | **Done (fixed)** | A tipped investor linked to the manager (device, gifts, loans, alliance or mirror) can no longer deposit into the fund (`fundInvestorLink`). Before the fix, the alliance was the only link. | `src/world/funds/link.ts` (`linked`), `fund-tips.test.ts` |
| Insider alts, fund route, unlinked investor | **FAIL (routed)** | A tipped investor with no link deposits; the fund's trade is not flagged on the investor. Gate `fund_tip_unlinked_investor`. The same identity limit as an unlinked alt. | `fund-tips.test.ts` (`it.fails`) |
| Clip, world layer | **FAIL (routed)** | 720 clips against one order, one a tick over 720 ticks, $240k, 20 seeds. Gate `self_impact_clip_ratio`, 1.5. | `src/world/exploits/clip.test.ts`, `scripts/exploits/clip.ts` |
| Clip, engine and company layers | **Existing** | The day tally across accounts (`trading.ts` `permanentMove`, `marginalImpact`) and the suites `src/engine/selfimpact.test.ts`, `src/engine/exploits.test.ts`, `src/world/company/exploits/x1-x2.test.ts`. | (existing) |
| Bust farm, window money | **Done (passes)** | Six busts, one per 8-week window: fresh money is $5,000 each window; a second bust in a window pays nothing; the money identity holds across the six busts. | `src/world/exploits/bust-farm.test.ts` |
| Bust farm, honest-baseline EV | **Not built** | The probe checks the designed bust path's window money, not its EV against an honest account. The spec's EV needs a money model the spec does not give (ruling). | — |
| Bust farm, retry lottery from R0 | **Not built** | A bust and retry every 8 weeks from R0 is a free rank race. The fastest-climber floor ($100k, 01 §14.4) that would close it is Mathis's decision. | (ROADMAP 2.6 item 3) |
| Alt-peak and insider, honest-baseline EV | **Not built** | Both probes run one deterministic world (no draws on the path), so one world checks the rule, but there is no EV across seeds against an honest baseline (the rank and the points are not money). | — |
| Named suites: laundering through funds, Launchpad, court settlements, shops | **Done (PASS)** | See 9B.3 (laundering block). | `src/world/exploits/launder.test.ts` |
| Named suites: options route | **Not built** | Needs a Derivatives-rank account and a listed contract. The rule `adOptionRefusal` is in place (`game.ts`); it is not probed. | — |
| Collusion groups are transitive | **Pinned (ruling pending)** | A chain of two funding links joins its two ends. The test pins the rule; the rule is not changed. | `src/world/collusion-chain.test.ts` |
| Wealth curve (four styles) | **Done** | `scripts/balance/wealth.ts bot`: neglected, average, managed, excellent; 20 seeds each; 120 game days each. | 9B.4 |
| Rank-time table | **Partial** | Days to R1 at p10, p50, p90 over 20 seeds at 120 game days. R2 to R4 are censored (no seed reaches them). The 365-day table is not run. | 9B.4 |
| X4 to X15 (later items) | **Deferred** | Splits, dividends, founder stock, resignation pumps, shorting, takeovers, crime, ownership, capital stack, AGMs, rent, investment projects. Each lands with the system it tests (spec, `tape-stonks-exploits.md`). | — |

Fixed in this revision (each regression test was checked to fail when its fix is reverted):

| Fix | File | Regression |
|---|---|---|
| Fund investor link and fund self-match use the collusion graph (was the alliance alone) | `src/world/funds/link.ts` (`linked` calls `isLinkedAccount`; used by `funds/rules.ts` `depositRefusal`, `funds/guard.ts`, and the fund roster in `company/insiders.ts`). `funds/state.ts` does not import the graph: `core.ts` imports `funds/state.ts` and `collusion.ts` imports `core.ts`, so a cycle through `state.ts` left `MIRROR_PRUNE_TICKS` undefined (caught by `collusion.test.ts`, fixed by the separate module). | `fund-tips.test.ts`, "a tipped investor linked to the manager ... cannot deposit" (the deposit was accepted before the fix) |
| The court's loan-default verdict bumps the deal index | `src/world/court.ts` (calls `bumpDeals`, now exported from `social.ts`) | `src/world/deal-index.test.ts` (loans owed 10,039.72 stale before the fix, 0 after) |

No money move changed: the fund link fix only refuses deposits and self-matches that the graph links; the index fix only makes an already-closed debt read as closed.

### 9B.2 Commits

| Commit | What |
|---|---|
| `c267067` | Fix: alt-peak (loan and gift rank basis, funding link for loans), ad-farm linked cap, insider-alt tip group; probes `alt-peak.test.ts`, `ad-farm.test.ts`, `insider-alts.test.ts`, `clip.test.ts` |
| `7f4923b` | Test: `bust-farm.test.ts` |
| `3d64278` | This section, first pass |
| review pass | The clip at 720 clips (`scripts/exploits/clip.ts`), the FAIL gates, the launder, fund-tip, deal-index and collusion-chain tests, the fund link and index fixes, this section. `git log p9/b` lists them after `3d64278`. |

### 9B.3 Gates

Each gate is a test in `src/world/exploits/`, or a regression test beside its module. Numbers are from the run on this tree. A gate recorded FAIL is written with `it.fails`, so the suite is green while the gap is open. When the gap closes, the test fails, and this table must move to PASS.

| Gate | Test name | Numbers | Result |
|---|---|---|---|
| **self_impact_clip_ratio** (spec X1, world layer, 720 clips against one order) | `gate self_impact_clip_ratio (FAIL, routed to Ledger)`; `scripts/exploits/clip.ts` | 20 seeds, $240k of SYN, 720 clips one a tick over 720 ticks against one order (same notional, same seeded world, each against a no-buy copy). Lift ratio per seed: min 1.1185, median 1.6375, max 3.4452, mean 1.8054. One-sided 95% upper bound 2.0353 (t(0.95,19) = 1.729). | **FAIL** (gate 1.5). Routed to Ledger (rank mark) and Quant (impact). Lever, as the spec names it: a permanent move that does not grow with the clip count for the same notional, or a rank mark that excludes the player's own flow. The spec quotes a 720-clip lift of 1.83% on SYN; the lifts here are 0.004% to 0.02% (log, after the last tick). The gate is a ratio, so the difference in scale is noted, not reconciled. |
| Ad farm, linked pair | `two accounts linked by a shared device share ten breaks a real day` | Paid 10 of cap 10 | PASS |
| Ad farm, honest baseline (EV of a linked second account) | `honest baseline: a second linked account adds no breaks to the group` | One honest account paid 10 in 12 attempts; a linked pair paid 10 in 12 attempts each; the second account adds 0 beyond the cap | PASS |
| **ad_farm_unlinked_alt** (spec EV <= 0) | `gate ad_farm_unlinked_alt (FAIL, routed)` | Owner paid 10, unlinked alt paid 10 in one real day (+$2,500 at $250 a break) | **FAIL** (routed to Mathis: identity layer) |
| Launder, transfer and loan | `a transfer or a loan of the whole lot is refused (adCashTransfer)` | Loan and transfer of a $2,000 lot refused `adCashTransfer` | PASS |
| Launder, fund deposit | `a fund deposit of the whole lot is refused (fundCash)` | `depositRefusal` returns `fundCash` for a deposit above spendable cash (checked on a stub open fund, because the funds fixture is private to `funds.test.ts`) | PASS |
| Launder, court settlement | `a court settlement offer of the whole lot is refused` | Offer refused; settlement stays 0 | PASS |
| Launder, Launchpad round trip | `a Launchpad round trip ... leaves the proceeds restricted` | Buy $150 of a token with the $2,000 lot (allowed: a trade), sell back; restricted = cash, spendable 0; a loan of the proceeds refused `adCashTransfer` | PASS |
| Launder, business round trip | `a business round trip ... leaves the proceeds restricted` | Buy a shop with a $40,000 lot (allowed: a business), sell it; spendable 0 | PASS |
| Fund tip, tipped manager | `a tipped manager who trades the tip stock through the fund is flagged on the manager` | Flags > 0 on the manager | PASS |
| Fund tip, linked investor | `a tipped investor linked to the manager (two gifts) cannot deposit` | Refused `fundInvestorLink` (before the fix: accepted) | PASS (fixed) |
| **fund_tip_unlinked_investor** | `gate fund_tip_unlinked_investor (FAIL, routed)` | Investor deposits; manager trades the tip stock; flags on the investor 0 | **FAIL** (routed to Mathis: identity layer) |
| Insider alt, linked | `an alt linked by a shared device buys the tip stock` | Flags on the alt: 1; points 11.00 | PASS |
| **insider_alt_unlinked** | `gate insider_alt_unlinked (FAIL, routed)` | Flags on the alt: 0 | **FAIL** (routed to Mathis: identity layer) |
| Insider alt, self | `the holder trading the tip itself is flagged` | Flags > 0 | PASS |
| Alt-peak, loan | `a 0% loan of $300k from a rich main leaves the alt at its own rank (R0)` | Alt net worth after the loan over $300k; rank R0 (before the fix: R2) | PASS |
| Alt-peak, control | `control: the same $300k earned ranks the account to R2` | R2 | PASS (the test is not vacuous) |
| Alt-peak, gift | `a $300k gift to an R1 alt (net of the 5% tax) does not lift its rank above R1` | Rank R1 (before the fix: R2) | PASS |
| Alt-peak, link | `two accepted loans from main to alt link the two accounts` | Linked (before the fix: not linked) | PASS |
| Bust farm, window money | `six busts, one per window: fresh money <= $5,000 a window ...` | Fresh money per window 5,000 in all six windows (total 30,000); second bust blocked in each window; money identity holds (4 digits) | PASS |
| Deal index after a court verdict | `after a won loan-default verdict, the borrower owes nothing` | Loans owed 10,039.72 before the fix (stale); 0 after | PASS (fixed) |
| Collusion chain (ruling pending) | `a chain of two funding links joins the two ends` | A and C joined through B (two gifts each); a single gift is not a link | PASS (pins the transitive rule) |
| Existing clip gates | `src/engine/selfimpact.test.ts`, `src/engine/exploits.test.ts` | Ran in the broad suite (9B.6) | PASS |

### 9B.4 Wealth curve and rank-time table

Command: `npx tsx scripts/balance/wealth.ts bot wealth-<k> 120 <style>` for k = 1 to 20, 120 game days, NPCs on (the wealth bot's own setup). One game day is one real hour. The bot is the greedy investor in `wealth.ts` (its own buy rule and presence pattern per style), not a human model.

Net worth at day 120 and valued income per game day, p10, p50, p90 over 20 seeds:

| Style | Net worth p10 | p50 | p90 | Valued income per day p10 | p50 | p90 |
|---|---|---|---|---|---|---|
| neglected | 3,148 | 5,807 | 9,861 | 0 | 0 | 0 |
| average | 15,634 | 18,382 | 22,070 | 2 | 107 | 145 |
| managed | 10,080 | 14,827 | 24,270 | 1 | 12 | 121 |
| excellent | 13,212 | 21,502 | 29,159 | 2 | 77 | 230 |

Rank-time table, **Partial**: days to first reach each rank (game days, p10, p50, p90 over the seeds that reached it; reached counts out of 20). The spec asks for days to R1 to R4 at p10, p50, p90 on a 365-day horizon. This table is 120 days.

| Style | R1 (Hustler, $20k peak) | R2 (Owner, $250k) | R3 (Operator, $5M) | R4 (Mogul, $100M) |
|---|---|---|---|---|
| neglected | 0 of 20 | censored (0 of 20) | censored (0 of 20) | censored (0 of 20) |
| average | 7 of 20: 75, 107, 114 | censored (0 of 20) | censored (0 of 20) | censored (0 of 20) |
| managed | 5 of 20: 79, 89, 114 | censored (0 of 20) | censored (0 of 20) | censored (0 of 20) |
| excellent | 13 of 20: 52, 74, 107 | censored (0 of 20) | censored (0 of 20) | censored (0 of 20) |

Reading: within 120 game days, the greedy wealth bot reaches R1 in most seeds only with the excellent style, and no seed reaches R2 ($250k). R2 to R4 are censored, not measured. **The 365-day table is not built here (the 365-day curves are in 9B.4a).** The spec's table is 20 seeds in four styles, 80 runs; a 120-day run took about ten minutes per seed with three runs in parallel on this shared machine, so 365 days is roughly 13 hours of wall time here. That is the next step for Ledger, with the same seeds.

Raw per-seed rows: the scratchpad `p9/wealth/` folder. The per-seed rows are the `out-<style>-<k>.json` files, one object per seed. The `<style>.jsonl` files are concurrent appends from the parallel runs, and their lines are interleaved (5 bad lines in `neglected`). `summarize.cjs` reads both, skips a line it cannot parse (counts it as bad) and keeps one row per seed. The table reproduces from the `out-*.json` rows alone (R1 days and percentiles match). The earlier claim of one JSON line per seed was wrong and is withdrawn.

#### 9B.4a Wealth curve at 365 days (track p9/e)

**The VM run that opened this track** (lead, 365 game days, 20 seeds x 4 styles, `bot wealth-K 365 <style>`, before any change
here). Net worth at day 365, p50 over the seeds, and the rank reached by the seeds:

| Style | Net worth p50, day 365 | Rank reached | Shape |
|---|---|---|---|
| average | $70.8k | R1 20/20 at p50 day 137 | steady growth |
| managed | $40.7k | | |
| excellent | $6.5k | R1 14/20 | wealth-1 peaks $13.2k near day 88 to 168, then $0.8k by day 328 (valued income 46) |
| neglected | -$7.4k | | wealth-1 falls from $6.1k (day 88) to -$6.0k (day 328), income 0 |

Against the locked payback (about 10 game days well run, 7 to 8 excellent, 20 to 30 neglected), excellent was not the best style
and neglected was ruinous. Raw rows: the scratchpad `p9/` folder (`trace-*-1.jsonl`, `census-*.jsonl`, `v2-*.jsonl`).

**Diagnosis** (per-day trace, `bot ... --trace`, and the NPC census, `census wealth-1 365`; numbers in
`scratchpad/p9/NOTES-wealth.md`):

- The bot put its four tier-1 shops into Avalon, three of them in one city-sector pool, `avalon:compute` (the densest pool, and
  the neglected bot had all four there). Its site rule scored income per dollar only, with the city fixed to `CITIES[0]`, and
  the ties went to the same definition. The pool held 12 NPC shops at day 50 and 20 by day 330 (NPC shops are bought and never sold; their location levels rise from
  mean 0.24 at day 30 to 1.27 at day 364, and location adds 0.2 logit per level). The share of each bot shop fell from 0.14 to 0.03,
  and demand from 0.82 to 0.59 at the same price, which is the share-factor floor (0.35) in all but name.
- Excellent's cost stack (crew 1.25 held by the 3-star autopilot, quality 3, marketing 2, the manager, maintenance) is about 1.24
  x the target a day. Revenue at the crowded share is about 1.75 x demand, so excellent breaks even at demand 0.71 and was at
  0.55 to 0.65. Costs ran on: 869 a day against 650 to 900 of income from day 90, cash +$8.9k at day 120 and -$8.0k at day 364.
  The bot never reacted, and it never sold a shop.
- Neglected sat on the same floor, its condition fell to 0 by day 150 (revenue halved below 50), and its cash went to -$12.4k. Its
  check-in every 24 game days restarts the offline window, so its average offline rate is about 0.54, not the 0.25 floor.

**Which rule is the culprit.** The bot. The world rules are right and are unchanged: the logit share dilutes each shop by the
pool's mass (a shop among 20 competitors earns a small share, which is what the probe's `rivals` column measures); the
costs are obligations paid whatever the revenue, as property upkeep is (`propertyDay`), and the overdraft is a notice; the
offline ramp is S4, locked. A real owner in that pool would lose money too; the bot had no site rule that priced the
competition and no exit, so it sat in the worst pool for a year. The NPC census is a world question for the lead, not
changed here: NPC shops keep their location levels and their pool mass, and the 40-day probe (S6) sees about half of the
densest pool's day-330 mass.

**Fix (commit `e95d107`, bot only, no world rule changed).** `scripts/balance/wealth-rules.ts`:
- `siteScore`: a candidate scores its income per dollar times the share factor it would earn in its pool, given every
  business already there (the world's formula, `shareFactorFor`). `buyGreedy` picks the best score over the unlocked cities.
- `shouldExit` (14 game days of negative net, summed): a checked-in owner sells that shop (`biz.sell`), then sets the
  style's levers. The sale is the owner's choice on the books, so every style makes it.
- The crew setting gets the shop's own demand (`setupFor(style, id, demand)`); the 3-star autopilot still holds the crew floor.
- Regression test: `scripts/balance/wealth-rules.test.ts` (9 tests: the share factor alone and crowded, the marketing lift, an
  empty pool beats a crowded one even at a 10% better return, the exit window and its edges).

**After (the same command, `bot wealth-K 365 <style>`, after the fix):**

| Style | wealth-1 | wealth-2 | wealth-3 | Rank days (seed 1 / 2 / 3) |
|---|---|---|---|---|
| excellent | $129.0M | $117.5M | $122.4M | R1 26 / 32 / 25; R2 85 / 92 / 82; R3 198 / 206 / 199; R4 338 / 342 / 340 |
| average | $23.7M | $9.9M | $25.9M | R1 38 / 36 / 35; R2 118 / 112 / 109; R3 272 / 317 / 272 |
| neglected | $6.4k | $5.8k | $12.7k | R1 never / never / 83 |

Gates after the fix: excellent above average on every seed; neglected positive on every seed and far slower.

**Residuals for the lead (not done here):**
1. **Scale.** Once the bot runs in sparse pools, the best style compounds to $120M to $130M in a game year and reaches R4 at day
   338 to 342. The old bot never got there. That is the locked ladder (payback 7 to 10 game days) running until the tier caps
   bind (4, 6, 8, 10, 12, 15 shops), and the rank table will now show R3 and R4 within the year. Part of the money is new cash:
   business income is a faucet (`credit(..., 'business income')`), and O-6 already flagged supply growth (13.5x to 19.1x in
   five years). Not re-checked here: `scripts/balance/economy.ts` on this bot. Lead ruling: is the compounding in budget, and
   should the tier caps or the share cap (1.8) be the bound?
2. **Neglected is flat, not growing.** Positive and slower, but cash drifts down (about $6.7k at day 160 to $3.1k at day 326 on
   seed 1) because the bot's exits need two negative weeks in a row and the on-off income hovers near the cost. A ruling on
   whether a neglected shop should sell sooner is open.
3. **NPC density is not calibrated to a year.** NPC shops are bought and never sold, and their location levels ratchet. The
   probe's 40-day calibration (S6) is blind to it. A world change (NPC purchases spread across pools, or NPC exits) would change
   every world with NPCs, so it is a ruling, not made here.
4. **Balance gate (unchanged).** `npm run balance:shops` (the probe, 20 seeds, 40 days) passes on this commit: every gate holds on
   every tier, and the medians are the 2.2b table (average T1 10.94, excellent 8.00, neglected 25.77). The probe code path is
   untouched by this track.

### 9B.5 Deviations, rulings and residuals

1. **The rank basis subtracts loans owed and net gifts received, not the boards.** `netWorthPeak` (rank) follows the basis; `netWorth` and the boards still count borrowed cash. A loan can still lift an alt on a board until it is repaid. Ledger to decide whether boards use the basis too.
2. **Loans count as funding links.** `FUNDING_MIN_GIFTS` (2) counts accepted loans as well as transfers. This changes the collusion graph of any world with loans.
3. **The sponsor cap is one count per collusion group, summed.** Each account's breaks count once, on that account; the group's count is the sum of its members' breaks that real day.
4. **The ad-farm gate is the spec's gate: EV <= 0 against the honest baseline.** The earlier wording ("the designed cap, not an EV band") is withdrawn. A linked second account adds no breaks (honest-baseline test, 9B.3), so its EV is 0. An unlinked alt is FAIL (9B.3).
5. **The clip gate is the spec's attack.** The earlier revision ran 60 clips against one order, which is weaker than X1's 720 and is withdrawn. The gate is 720 clips against one order over 20 seeds, with the one-sided 95% bound: FAIL (9B.3). K is not changed to pass it.
6. **Transfer refusal.** The ad-farm laundering test asserts `adCashTransfer` on a $2,000 lot, so the ad rule is the reason. The earlier statement that the 10%-of-net-worth cap refuses first is withdrawn. A $250 balance is not tested.
7. **Collusion groups are transitive (ruling pending).** `groupRoots` is a union-find over every link (device, alliance, funding, mirror), so a chain A to B to C joins A and C. `collusion-chain.test.ts` pins this. The effect on honest players: two people who lend each other twice share the sponsor cap (`adsUsedToday`), the founder sell cap (`syncGroupSellCap`) and the tip flags. The options for the lead: keep transitive groups (conservative against rings, but it costs honest lenders), or direct links only (no shared cap through a third party, but a ring of three evades). Not changed here.
8. **Other readers of raw net worth (analysed, ruling pending).** `eca.ts` (fine cap, `peak = max(netWorthPeak, netWorth)`): a loan raises the borrower's fine ceiling, which is harsher, not a gain. `comeback.ts` (chapter peak at line 142 and the shown peak at line 332) is display only. The card's `low` test (line 318) also reads raw net worth, which keeps a borrower above the line, so it is conservative. No money moves through any of these. Ruling: move them to the rank basis, or keep raw. Not changed.
9. **Loan-funded trading profit (residual, not probed).** The rank basis is mark minus owed, so a profit on borrowed cash raises the basis by that profit, as it would on owned cash. That is a real gain, not a printer. The lender bears the default risk. Default collection is `min(headroom - fine, outstanding)` in `court.ts`, and the deal is then closed as repaid, so a partly collected default forgives the rest. That is a ruling for the lead: keep the remainder open, or keep the write-off. Not probed.
10. **Wealth data hygiene.** Corrected in 9B.4.
11. **Restricted-cash routes (analysed).** The lot rule (`restrictedNow` = min(lots, cash)) keeps the proceeds of a sale restricted until the lot expires, so a Launchpad or business round trip does not free the cash (9B.3, laundering block). Ad cash may still pay a Launchpad buzz and a launch fee (`cashOf`): a token promotion and a launch cost. The rule says "not for ops", so whether buzz and launch fees are ops is a ruling for the lead. They are sinks, not income, so this is not a printer. The shop manager prepay (`hireManager`) is a business cost and is not probed separately.
12. **Named-suite scope.** Built: funds, Launchpad, court settlements, the business round trip, transfers, loans, margin, and the fund-tip routes. Not built: options (needs a Derivatives account), the shop manager prepay (a business cost, the same rule as a business purchase), the alliance deposit, the retry lottery from R0, and the honest-baseline money EV for bust, alt-peak and insider.
13. **The fund link rule now reaches the company insider roster.** `company/insiders.ts` (`rosterOf`) used the same alliance-only `linked` for "a fund that the owner, or a linked player, manages trades the stock". It now uses the collusion graph, so a fund managed by a device-, gift- or loan-linked player joins the roster. A world with no device, gift, loan or mirror link is unchanged. Listed for the lead to confirm.

### 9B.6 Gates and checks on the final tree

- `npx next typegen` and `npx tsc --noEmit`: exit 0 on the final tree.
- ESLint on the touched files (`court.ts`, `social.ts`, `funds/*`, `company/insiders.ts`, `src/world/exploits/*`, `deal-index.test.ts`, `collusion-chain.test.ts`, `scripts/exploits/clip.ts`): 0 errors, 0 warnings.
- Vitest, broad (`src/world src/engine`, `--maxWorkers=3`), final tree: 167 test files passed, 2 skipped; 1,608 tests passed, 70 skipped, 21 todo, and 4 expected failures, which are the four FAIL gates (clip, ad farm unlinked, insider unlinked, fund-tip unlinked investor). A first broad run caught a regression of this pass (a funds to collusion import cycle that left a prune constant undefined); it is fixed by `funds/link.ts` and covered by the rerun.
- Determinism: the fund link change and the index bump add no random draw. Worlds with no device, gift, loan, alliance or mirror link keep their fingerprints on these paths.
- Money identity: the fund link change refuses deposits and self-matches only; the index bump makes a closed debt read as closed. No money move changed.

### 9B.7 Open items (routed)

- **Clip (Ledger, Quant):** the lever in 9B.3. FAIL until the engine has a permanent move that does not grow with the clip count, or a rank mark that excludes the player's own flow.
- **Unlinked accounts (Mathis, lead):** ad farm, insider alts and fund-tip investors. FAIL until an account-level identity layer exists (a phone or account check outside the world). The alternative is a deferral by ruling.
- **Collusion transitivity (lead):** transitive groups or direct links (9B.5 item 7).
- **Raw net worth readers (Ledger):** the boards, and the comeback and fine peaks (9B.5 items 1 and 8).
- **Default collection (lead):** whether a partly collected default stays open (9B.5 item 9).
- **Ops classification (lead):** Launchpad buzz and launch fee with ad cash (9B.5 item 11).
- **Retry lottery from R0 (Mathis):** the fastest-climber $100k floor (01 §14.4). Not built.
- **Options route and the alliance deposit (Ledger):** not probed.
- **365-day rank table (Ledger):** not run; the 120-day table is Partial.
- **Honest-baseline money EV for bust, alt-peak, insider (lead):** not built; needs a money definition for the rank and the points.
- **Perk value:** the bust perks (Old contacts, Lessons, Second wind) are not measured against the $2,500 cap in 01 §14.
- **Pre-fix numbers:** the alt-peak pre-fix numbers were observed (R2 for the loan and gift routes, not linked). The ad-farm and insider pre-fix numbers were not measured.
- **X4 to X15:** land with the systems they test.
