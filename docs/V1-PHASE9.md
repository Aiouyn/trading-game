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

- **Clip: PASS at every window start (R-9-1c).** One rolling impact tally per asset over all flow, pools' closing flow included, with a half-life of 360 ticks. One-sided 95% upper bound of the 720-clip lift ratio, by window start (ticks after the first full day): pre 0: 1.0084 (mean 0.9956); pre 1: 1.0077 (0.9954); pre 180: 0.9873 (0.9137); pre 360: 1.0476 (0.8799); pre 540: 1.1904 (0.8909); pre 719: 1.4061 (0.9599). Worst start 1.4061 at 719 (gate 1.5). The earlier FAIL (5.5 to 30.1 at the straddling starts, R-9-1b) is gone; 9B.5 item 16 says why. The closing auction still erases most of one order's lift at the close (item 15); the gate no longer depends on it.
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
| Clip, world layer | **PASS** (R-9-1c) | 720 clips against one order, one a tick over 720 ticks, $240k, 20 seeds, at six window starts (the first full day plus 0, 1, 180, 360, 540, 719 ticks). Gate `self_impact_clip_ratio`, 1.5, at the worst start (1.4061). | `src/world/exploits/clip.test.ts` (one normal gate test per start), `scripts/exploits/clip.ts` |
| Clip, engine and company layers | **Existing** | The shared per-asset impact tally (`trading.ts` `permanentMove`, `marginalImpact`, `AssetState.impactTally`, R-9-1c) and the suites `src/engine/selfimpact.test.ts`, `src/engine/exploits.test.ts`, `src/world/company/exploits/x1-x2.test.ts`. The N-account rows in `src/engine/impact-tally.test.ts` and `src/engine/altpeak.test.ts` are PASS (9B.5 item 16). | (existing) |
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
| **self_impact_clip_ratio** (spec X1, world layer, 720 clips against one order) | `gate self_impact_clip_ratio` (PASS, R-9-1c) ; `scripts/exploits/clip.ts` | 20 seeds, $240k of SYN, 720 clips one a tick over 720 ticks against one order (each against a no-buy copy). One-sided 95% upper bound of the lift ratio by window start (ticks after the first full day): start 0: 1.0084 (mean 0.9956); start 1: 1.0077 (0.9954); start 180: 0.9873 (0.9137); start 360: 1.0476 (0.8799); start 540: 1.1904 (0.8909); start 719: 1.4061 (0.9599). | **PASS** (gate 1.5 at the worst start, 1.4061 at 719). The daily close still erases most of a day's permanent move of one order (9B.5 item 15); the pools' closing flow in the shared tally is what keeps the 720-clip reading at one order's level. |
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

- The bot put its four tier-1 shops into Avalon, two in `avalon:compute` and two in `avalon:media` (the pre-fix trace, days 0 to 364), and the neglected bot had all four in
  `avalon:compute`, the densest pool (the first draft said all four were in compute for excellent; corrected here). Its site rule scored income per dollar only, with the city fixed to `CITIES[0]`, and
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

**Fix, first pass (commit `e95d107`, bot only, no world rule changed).** `scripts/balance/wealth-rules.ts`:
- `siteScore`: a candidate scores its income per dollar times the share factor it would earn in its pool, given every
  business already there (the world's formula, `shareFactorFor`). `buyGreedy` picks the best score over the unlocked cities.
- `shouldExit`: a checked-in owner sells a shop (`biz.sell`) when its net has been negative in total over the window, then sets
  the style's levers. **Correction (review of R-9-9):** the rule was written with a 14-day window, but `shopsDay` keeps only
  `SHOP.value.window` (7) entries of net per shop, so `net.length < 14` always and the rule never fired. The first pass
  therefore sold nothing, and the "bot sells a shop that loses money" and "exits need two negative weeks" statements in the
  first draft of this section were wrong. The fix is in 9B.4b.
- The crew setting gets the shop's own demand (`setupFor(style, id, demand)`); the 3-star autopilot still holds the crew floor.
- Regression test: `scripts/balance/wealth-rules.test.ts`, which the first pass did not cover through the bot. Its 14-entry
  arrays were the cause of the miss.

**After the first pass (site rule only, the exit never fired; superseded by 9B.4b):**

| Style | wealth-1 | wealth-2 | wealth-3 | Rank days (seed 1 / 2 / 3) |
|---|---|---|---|---|
| excellent | $129.0M | $117.5M | $122.4M | R1 26 / 32 / 25; R2 85 / 92 / 82; R3 198 / 206 / 199; R4 338 / 342 / 340 |
| average | $23.7M | $9.9M | $25.9M | R1 38 / 36 / 35; R2 118 / 112 / 109; R3 272 / 317 / 272 |
| neglected | $6.4k | $5.8k | $12.7k | R1 never / never / 83 |

#### 9B.4b Exit window and the 365-day curves after the review (track p9/e, R-9-9 review)

**What the review found.** `shouldExit` defaulted to 14 days; the shop's net history holds 7 (`SHOP.value.window`), so the exit
never fired. The post-fix curves of 9B.4a therefore reflected the site rule alone. The 9 tests passed only because they fed
14-entry arrays the bot never produces. The first-draft residual 2 (neglected cash drifts down because exits need two negative
weeks) is withdrawn with the same cause.

**The fix (commit `82f7088`).**
- The bot's exit reads the window the world keeps: `shouldExit(net, windowDays = SHOP.value.window)`. The world rule is unchanged
  (the valuation window stays 7, so every world fingerprint is unchanged). The bot's rule and the world's valuation read one
  history.
- `scripts/balance/wealth.ts`: `checkIn` is exported and returns the number of sales; the CLI runs only when the file is the entry
  point (the `clip.ts` pattern), so the tests can call the owner's check-in. The bot output adds `bizCount` and `sold`.
- Tests. `wealth-rules.test.ts` judges the exit on 7-entry arrays (the world's length), and pins the 14-day window as a
  regression (a 14-day rule on 7 entries returns false). `wealth-checkin.test.ts` (new) runs the owner's check-in on a real game:
  nine game days of the world's own shop history (the net list holds 7 entries, checked), then `checkIn` sells the bot's loser and
  keeps its winner (`sold` is 1, the loser is gone from `g.businesses`, the winner stays with the bot); a shop with three days of
  history is kept. The loser's window is set by hand to -200 a day: in a nine-day trial with heavy settings (crew 1.5, quality 3,
  marketing 2, price 1.2, no maintenance) the shop still earned more than its costs, so a real loss was not reached in the test. Mutation check: with the 14-day default the
  integration test fails (`sold` is 0).

**Gates on the commit `82f7088` (the review's item 4, run here).**
- `npx next typegen` exit 0; `npx tsc --noEmit` exit 0 (the `windowDays` parameter is typed `number`, not the literal 7 that
  `as const` gives); ESLint on the four touched files: 0 errors.
- `npm run balance:shops` (the probe, 20 seeds, 40 game days, 4 jobs): PASS. Medians unchanged from 9B.4 (average T1 10.94,
  excellent 8.00, neglected 25.77, managed 10.38): the probe code path does not call the exit.
- Full `npx vitest run --maxWorkers=2`: 250 test files passed, 2 skipped; 2381 tests passed, 3 expected fail, 70 skipped, 21 todo;
  exit 0.

**The 365-day curves after the fix (`bot wealth-K 365 <style>`, seeds 1, 2, 3, commit `82f7088`).**

| Style | Net worth, day 365 (seed 1 / 2 / 3) | Rank R1 / R3 / R4 (days, seed 1 / 2 / 3) | Shops sold in the year | Shops owned at the end |
|---|---|---|---|---|
| excellent | $114.2M / $127.1M / $114.2M | R1 24 / 32 / 25; R3 203 / 200 / 198; R4 347 / 339 / 342 | 1 / 3 / 1 | 30 / 31 / 31 |
| average | $20.4M / $9.9M / $25.9M | R1 38 / 36 / 35; R3 278 / 317 / 272 | 1 / 0 / 0 | 26 / 21 / 28 |
| neglected | $136k / $137k / $140k | R1 104 / 104 / 101; R2 never | 39 / 38 / 38 | 4 / 4 / 4 |

The exit fires now (1 to 39 sales a seed, where the first pass had none). Excellent is above average on every seed (4 to 13 times the average
net worth of the same seed), and neglected is positive on every seed and far slower than average. Managed is not re-run here, so
the best style is not settled by this table. The VM table of 9B.4a (the 80-run table) is the lead's re-run after this commit. The per-day trace was not re-run after
the fix: the sale counts above are the evidence that the exit acts.

**Neglected churn (a finding, not changed here).** The neglected bot sells about 38 shops a year (one every nine game days) and
buys four more at each check-in while its cash allows (`buyGreedy` has no hold test). Each short life pays its early income before
the seven-day window turns negative, and each sale returns 70% of the cost (`businessSalePrice`), so the 30% haircut is the cost of
the churn. Neglected's positive curve is this cycle, not a steady business. A ruling is needed on whether a neglected owner should
re-buy after a sale. The bot's buy rule is not changed here.

**Residuals for the lead (not done here):**
1. **Scale (excellent, the review's item 3).** A tier-1 retail shop of the excellent style earns about 504 a day against a target of
   166 (3.0 times). That is the lever ceiling, not a demand glitch: income is `1.45 x target x served x price x (1 + 0.05 x quality)
   x mult x synergy` with served capped at the crew cap of 1.5, so the crew cap, quality 3 and price 1.05 give about 2.6 times the
   target before synergy, and the 1.1 same-sector and 1.05 feed synergies make the rest. With that ceiling, 30 shops compound to
   $114M to $127M in a game year. The O-6 check (`scripts/balance/supply-check.ts`) runs the NPC world with no bot, so it does not
   test the bot's faucet, and it was not run (15 to 35 minutes a seed, and it needs a bot-in-world variant). Lead ruling: is the
   compounding in budget, and should the tier caps or the share cap (1.8) bound it?
2. **NPC density is not calibrated to a year.** NPC shops are bought and never sold, and their location levels ratchet (9B.4a).
   The 40-day probe (S6) is blind to it. A world change would touch every world with NPCs, so it is a ruling.
3. **Balance gate (unchanged).** `npm run balance:shops` passes on this commit (see the gates above).
4. **Post-fix trace.** The per-day trace of the 9B.4a diagnosis (`bot ... --trace`) is not re-run after the fix. The sold count
   and the bizCount above are the evidence; a trace is the next step if the lead wants the mechanism of each sale.

#### 9B.4c Progressive business tax (R-9-10, track p9/f): effect on the 504-day curve

The tax is on the day step (commit `2c03eef`): each business's settled day net, after its costs, is taxed once per game day at its owner's bracket (rank basis, R-9-4), positive net only, booked to the `businessTax` sink. Default brackets (`src/content/tax.ts`): 0% to $250k, 10% to $2.5M, 20% to $25M, 30% to $250M, 40% above. The stabilizer shifts every rate by its error, at most 5 points, only while its levy is engaged, and keeps each rate in [0, 0.45].

Run: `scripts/balance/wealth.ts bot wealth 504 <style> --first=1 --seeds=2`, defaults, local machine, two seeds (`wealth-1`, `wealth-2`) per style. Each 504-game-day run took about 4 to 5 minutes here.

| Style | Game day (real day) | Pre-tax, `wealth-1` / `wealth-2` (3900f23) | With tax, `wealth-1` / `wealth-2` | Tax paid by the bot (504 days) |
|---|---|---|---|---|
| managed | 168 (day 7) | $559k / $708k | $595k / $559k | $25.9M / $24.2M |
| managed | 504 (day 21) | $99.3M / $116.6M | $64.3M / $60.2M | |
| excellent | 168 (day 7) | $3.39M / $3.50M | $3.54M / $2.26M | $147.3M / $111.0M |
| excellent | 504 (day 21) | $957M / $872M | $247M / $197M | |

Rank first seen, game days (with tax, `wealth-1` / `wealth-2`): managed R1 49 / 49, R2 124 / 124, R3 274 / 282; excellent R1 24 / 24, R2 79 / 82, R3 186 / 219, R4 376 / 407.

Reading against the R-9-10 gate (two seeds only; the gate is 20 seeds, tuned on prefix `wealth` and confirmed on `wealthH`, the lead's VM run):
- managed day 21 in [$15M, $60M]: $64.3M and $60.2M, at or just above the top. Not yet inside the gate.
- managed day 7 in [$300k, $1.5M]: $595k and $559k, inside.
- excellent day 21 at or below $400M: $247M and $197M, inside. Excellent day 7 at or below $5M: $3.5M and $2.3M, inside.
- neglected in week 1 unchanged: not run in this step (the gate's 20-seed table, neglected included, is the lead's VM run).

Caveats, recorded as V1 limits:
- The pre-tax column is the same bot at commit 3900f23, which settled each shop one tick after the day close. The tax commit settles shops on the closing tick (before the card), so the pre-tax column differs from the tax column by that one-tick shift as well as by the tax.
- A business sold partway through a day is removed without its day settlement, so that day's partial income is neither taxed nor costed (sale is a choice the owner makes, as before).
- Trading gains are not taxed in V1 (R-9-10). Business valuation (`bizValuedIncome`, the trailing shop net) stays pre-tax, so a tax cut does not change a shop's mark; only cash moves.
- NPC shops pay the same tax (the rule is uniform over every business owner), so the NPC economy moves too.
- The displayed rate is rounded to a whole percent, so a stabilizer shift of 0.4 points reads as the same bracket.
- Tuning knob: `TAX_BRACKETS` (JSON `[[threshold, rate], ...]`, validated at startup), documented in the header of `scripts/balance/wealth.ts`.

#### 9B.4d Bracket tuning on the VM and the held-out confirmation (lead, R-9-10)

Runs on the 56-core VM, 504 game days (21 real days), one process per run, branch p9/f at d7e2fa9 (owner-group basis,
sold-shop settlement). Real day 7 is game day 168 and day 21 is game day 504. Gate (R-9-10): managed p50 at day 21 in
[$15M, $60M] and at day 7 in [$300k, $1.5M]; excellent p50 at day 21 <= $400M and at day 7 <= $5M; neglected unchanged in
week 1.

Tuning, seed prefix `wealth`, 20 seeds per style (managed and excellent), three bracket sets:

| Set | Brackets (threshold: rate) | Managed d7 p50 | Managed d21 p50 (p90) | Excellent d7 p50 | Excellent d21 p50 (p90) |
|---|---|---|---|---|---|
| Pre-tax (v1 3204e66) | none | $621k | $110.4M ($119.7M) | $3.6M | $957.3M ($1.16B) |
| A | 0: 0%, $250k: 10%, $2.5M: 20%, $25M: 30%, $250M: 40% | $553k | $59.0M ($63.9M) | $2.6M | $267.4M ($289.5M) |
| **B (chosen)** | 0: 0%, $250k: 10%, $2.5M: 25%, $25M: 35%, $250M: 45% | $547k | **$52.3M** ($55.2M) | $2.3M | **$183.2M** ($230.5M) |
| C | 0: 0%, $100k: 10%, $1M: 20%, $10M: 30%, $100M: 40% | $547k | $55.7M ($60.1M) | $2.1M | $198.7M ($223.3M) |

A passes on the edge (managed $59.0M against the $60M top). B passes with margin and keeps the top bracket inside the 25 to
45% of 01 §8.2. B is the default in `src/content/tax.ts`.

Held-out confirmation, set B, seed prefix `wealthH` (never used for tuning), 20 seeds per style:

| Style | d1 p50 | d7 p50 (p90) | d21 p50 (p90) | R1 | R2 | R3 | R4 |
|---|---|---|---|---|---|---|---|
| neglected | $6k | $30k ($30k) | $247k ($253k) | 20/20, gd 99 | 20/20, gd 486 | 0/20 | 0/20 |
| average | $15k | $669k ($734k) | $53.3M ($72.9M) | 20/20, gd 35 | 20/20, gd 109 | 20/20, gd 321 | 0/20 |
| managed | $8k | $552k ($583k) | $53.0M ($55.4M) | 20/20, gd 42 | 20/20, gd 125 | 20/20, gd 292 | 0/20 |
| excellent | $19k | $2.5M ($2.9M) | $198.7M ($247.0M) | 20/20, gd 24 | 20/20, gd 83 | 20/20, gd 211 | 20/20, gd 415 |

Gate on the held-out seeds: **PASS** (managed $552k at day 7 and $53.0M at day 21; excellent $2.5M and $198.7M; neglected
$30k at day 7 against $29k pre-tax).

Against 01 §8.4 (median $500k at day 7 and $20M at day 21; top 1% $5M and $400M): week 1 sits on the median. At day 21 the
managed and average bots, both far more present than the 1 to 2 hours a day of the §8.4 engaged player, sit at about 2.6x the
median and well under the top-1% path; the excellent bot (online 16 of 24 hours) sits at half the top-1% path. Growth
decelerates week by week (median net worth, compounded per real day): managed 101%, 44%, 33%; average 88%, 36%, 37%;
excellent 125%, 53%, 22%. Week 3 is still faster than the §8.4 path implies after day 21 (about 8% a real day from day 21 to
day 56); the runs stop at day 21, so the deceleration after it is not measured here (open item).

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

14. **R-9-1b (per-account key; superseded by item 16, R-9-1c: one tally per asset): the impact tally is rolling (half-life 360 ticks), charged as a marginal at mid.** (a) Built as ruled: `Account.impactTally` per asset (tick, buy, sell), decayed by half every `IMPACT_HALF_LIFE` = 360 ticks, with no calendar-day reset. Temporary impact is `marginalImpact` on that tally and the permanent move is `permanentMove` on it, both at the fill's pre-trade mid notional (was the day's fill-price notional). `dayMidTraded` is gone. `dayTraded` is kept for the C5 crowd guard only. Pool flows no longer add to a player fill's permanent move (the tally is the player's own). The option dealer's delta hedge runs on the trader's tally. A world with no player orders writes no tally (`impact-day.test.ts`, `companyHooks.test.ts`). (b) Pins moved by the ruling, player-order worlds only: the `companyHooks.test.ts` digests (`61f445d2` to `b799f0b0`, `e80f9cd0` to `ada90663`), `selfimpact.test.ts` (one fill's move on the mid notional), `impact-tally.test.ts` (a second account starts fresh; 720 clips in one tick are one order; a day of clips pays 0.85 to 1.0 of one order's temporary cost, because the tally decays; 720 clips over a day lift 1.10 to 1.12 against one order, because the clips land later and less of their move has decayed by the reading). Calibration and every order-free fingerprint are unchanged. (c) **ROUTED to the lead: per account, splitting one block across N accounts is not neutral.** Each account starts on a fresh tally, so on SYN the first-tick permanent move grows by sqrt(N) (measured 1.41, 3.16 and 10.0 for N = 2, 10 and 100 against one account) and the temporary cost of the impact part falls by about 1/sqrt(N). The Ledger 2026-10-09 shared tally kept this neutral; the ruling's reason (one account's flow cheapens another's) is an allocation point, and the split is a real gain for a manipulator. Recorded as `it.fails`: `impact-tally.test.ts` (`impact_split_accounts`, `temp_split_same_tick` N = 2, 10, 100, `temp_whale_alt_same_tick`, `impact_alt_hunt`), `altpeak.test.ts` (whale plus alt summed peaks, an alt's buy lifting the main's peak, plain and guard, and N-account marks). This re-opens the alt-lifted peak and the temporary split rows in `docs/V1-ACCEPTANCE.md`. A rolling window keyed per asset (shared across accounts, the same marginal and decay) keeps the Ledger invariant and passes the single-account gate; that is a one-line change of the key, not made here because the ruling says per account. The lead decides. (d) The clip gate under R-9-1b reads every window start and is FAIL at the straddling starts; the cause is the closing auction, not the tally (9B.3 and item 15).
15. **The clip gate reads the day's close (new residual, for the lead).** The game universe runs the closing auction (`ecology: full`, `universe.ts`: six pools set each day's close). In the seeds checked, the close erased about 90% of a day's permanent move: the one-order lift is 7.7e-4 just before the close and 7.0e-5 just after, and the 720-clip lift falls the same way. A 720-tick window always holds one close. The reading after its last tick is therefore the post-close residual: a one-order lift that filled before the close is erased, and clips that fill after the close still count (pre 360: one order 7.1e-5, 720 clips 2.8e-4). The aligned window (pre 0, close on the reading tick) reads a residual for both copies, so the earlier 1.01 (R-9-1, 9B) is not evidence of the impact law; the 9B.3 straddle numbers were the same residual. The reading point is the lead's ruling: read the lift before the day's close (what a manipulator sells into; the aligned pre-close ratio is 1.13 on seed 1), or keep the post-close reading and accept the straddle FAIL, or change the close. Not changed here.

### 9B.6 Gates and checks on the final tree

- `npx next typegen` and `npx tsc --noEmit`: exit 0 on the final tree.
- ESLint on the touched files (`court.ts`, `social.ts`, `funds/*`, `company/insiders.ts`, `src/world/exploits/*`, `deal-index.test.ts`, `collusion-chain.test.ts`, `scripts/exploits/clip.ts`): 0 errors, 0 warnings.
- Vitest, broad (`src/world src/engine`, `--maxWorkers=3`), final tree: 167 test files passed, 2 skipped; 1,608 tests passed, 70 skipped, 21 todo, and 4 expected failures, which are the four FAIL gates (clip, ad farm unlinked, insider unlinked, fund-tip unlinked investor). A first broad run caught a regression of this pass (a funds to collusion import cycle that left a prune constant undefined); it is fixed by `funds/link.ts` and covered by the rerun.
- Determinism: the fund link change and the index bump add no random draw. Worlds with no device, gift, loan, alliance or mirror link keep their fingerprints on these paths.
- Money identity: the fund link change refuses deposits and self-matches only; the index bump makes a closed debt read as closed. No money move changed.

### 9B.7 Open items (routed)

- **Clip (closed by R-9-1c):** the gate passes at every window start (9B.3). The reading after the daily close still shows the close's residual (item 15); the lead may still want the reading point before the close (what a manipulator sells into). Not required for the gate.
- **Unlinked accounts (Mathis, lead):** ad farm, insider alts and fund-tip investors. FAIL until an account-level identity layer exists (a phone or account check outside the world). The alternative is a deferral by ruling.
- **Collusion transitivity (lead):** transitive groups or direct links (9B.5 item 7).
- **Raw net worth readers (Ledger):** the boards, and the comeback and fine peaks (9B.5 items 1 and 8).
- **Default collection (lead):** whether a partly collected default stays open (9B.5 item 9).
- **Ops classification (lead):** Launchpad buzz and launch fee with ad cash (9B.5 item 11).
- **Retry lottery from R0 (Mathis):** the fastest-climber $100k floor (01 §14.4). Not built.
- **Options route and the alliance deposit (Ledger):** not probed.
- **365-day rank table (lead):** three seeds per style are in 9B.4b; the 80-run VM table is the lead's re-run after commit `82f7088`.
- **Honest-baseline money EV for bust, alt-peak, insider (lead):** not built; needs a money definition for the rank and the points.
- **Perk value:** the bust perks (Old contacts, Lessons, Second wind) are not measured against the $2,500 cap in 01 §14.
- **Pre-fix numbers:** the alt-peak pre-fix numbers were observed (R2 for the loan and gift routes, not linked). The ad-farm and insider pre-fix numbers were not measured.
- **X4 to X15:** land with the systems they test.
16. **R-9-1c: one impact tally per asset over all flow (amends item 14's per-account key).** (a) Built as ruled: `AssetState.impactTally` (tick, buy, sell) is the one rolling tally per asset, half-life `IMPACT_HALF_LIFE` = 360, no calendar-day reset. Every printed fill (every account, and the option dealer's hedge) reads it for its permanent move and its temporary marginal, then joins it. The pools' closing flow (`sim.ts` `ecologyStep`) joins it at the close. `Account.impactTally` is removed. (b) Deviation fixed (reviewer item 4): pool and Street flows now enter the tally that a player fill's permanent move reads; fc64a21 dropped them. (c) Pins: a world with player orders moves by representation (the tally sits on the asset, the digest hashes it). `companyHooks.test.ts`: the player-order digest is b799f0b0 in the R-9-1b layout and e711a12b now (re-keyed to the R-9-1b layout it reproduces b799f0b0, so the single-account dynamics are unchanged); the ecology-full digest moves to 54dc4f79 (the pools' closing write). A world with no player orders and no ecology writes no tally and keeps its fingerprint (`companyHooks.test.ts`, `impact-day.test.ts`). (d) N-account splits are neutral: `impact-tally.test.ts` (`impact_split_accounts`, `temp_split_same_tick` N = 2, 10, 100, `temp_whale_alt_same_tick`, `impact_alt_hunt`) and `altpeak.test.ts` (whale plus alt, alt's buy, the N-account marks) are passing gates now (were `it.fails`, ROUTED by item 14). (e) **The clip gate passes at every window start** (`clip.test.ts`, one normal test per start, worst 1.4061 at 719). Measured: with the pools' closing flow outside the tally (the R-9-1b layout) the straddling starts read 5.5 to 30.1; with it inside, they read 0.99 to 1.41. A single account's key (per account or per asset) does not change this; the pools' write does, because a post-close clip then pays on a tally that already holds the day's close flow. This is the reading that R-9-1c asked for, not a change of the reading point or of the close. Caveat for the lead: the pass rests on the pools' flow entering the tally, and the 1.41 at start 719 is close to the 1.5 gate over 20 seeds.


## 9C. Load and calibration residuals

Worktree `.claude/worktrees/p9-c`, branch `p9/c`. Binding spec: `docs/team/specs/lead-phase9.md`, track 9C, with the rulings R-9-8b (the load gate) and R-9-11 (O-2). The branch merged `v1` at `b342164` to take those rulings. All times in this section are UTC.

Commits: `6b378a0` (load: backlog, connect ramp, retry), `f127566` (O-12 sector factor), `149c760` (O-2 wiring, first probe), `60bc0be` and `4803ec2` (first record, O-2 on the engine path, review repairs), `2470bd2` (record before the rulings), `b342164` (merge of `v1`), `83ab191` (the `mcap_20` window fix), `de0739a` (the R-9-8b script and a first record, superseded by this section), and the commit that carries this section.

| Item | Verdict |
|---|---|
| 9C.1 Load, R-9-8b (5 s tick, 4,000 clients, 3 repeats, gate: all welcomed, fan-out p99 < 2.5 s, overrun p99 < 0.5 s) | **PASS** on `90138b4`, 3 of 3 (fan-out p99 896 to 934 ms, overrun p99 24 to 35 ms, 4,000 welcomed in about 5 s). FAIL on HEAD before `f3730f2` (a per-view cost of 13 ms, now 0.2 ms). Open, not gated: the public tick (every 60 ticks) stalls every socket for 2 to 4 s (9C.1). |
| 9C.2 O-2 residual rho, engine path, 200 seeds | **FAIL, known V1 limit (R-9-11)**: median 0.597 and p90 0.927 by the probe's quantile (0.596 and 0.925 by the average-of-two-middles and interpolated definitions), 0 of 200 seeds at or below 0.15. Owner Quant, post-V1. |
| 9C.3 O-12 sector shock from the engine's factor | **Done** (see 9C.3). |
| 9C.4 AUSD stablecoin band | **UNDECIDED** at 2 s.e. under the class band `[0.6, 1.1]` applied by ruling. Not a pass. |

### 9C.1 Load under R-9-8b: 4,000 clients, production tick

**Gate (R-9-8b, unchanged).** At the production tick (`TICK_MS=5000`) all 4,000 clients welcomed, the fan-out p99 (the server's tick start, the `serverTime` stamp of each tick message, to the last client's receipt) under 2.5 s, and the overrun p99 (the gap between consecutive tick starts minus the nominal tick, from the welcome's `tickMs`) under 0.5 s. Three repeats, each with a 60 s measured window after a settle of up to 240 s, the default connect ramp (200 per 250 ms). The 1 s stress run is reported with the same numbers and is not gated. The script is `scripts/load/socket-load.mjs`, unchanged; its exit code is the gate. Each run starts a fresh world server from this worktree on port 8919. The runner (`run-gate.sh`, scratch, not committed) keeps one server per run, preloads a process observer (exit and uncaught events, memory every 10 s), and stops the server itself after the client ends.

**Result: PASS, 3 of 3, on the final commit `90138b4`.** Sample size: 12 ticks, 11 gaps per window (the p99 is the maximum of the window).

| Run (scratch file) | Tick | Welcomed (settle) | Ticks (gaps) in window | Fan-out p50 / p99 | Overrun p50 / p99 | Gate |
|---|---|---|---|---|---|---|
| final repeat 1 (`final-r1.out`) | 5,000 | 4,000 in 5.1 s | 12 (11) | 899 / 934 ms | 2 / 24 ms | **PASS** |
| final repeat 2 (`final-r2.out`) | 5,000 | 4,000 in 5.1 s | 12 (11) | 893 / 921 ms | 0 / 35 ms | **PASS** |
| final repeat 3 (`final-r3.out`) | 5,000 | 4,000 in 5.4 s | 12 (11) | 865 / 896 ms | -1 / 27 ms | **PASS** |
| final 1 s stress (`final-stress-1s.out`) | 1,000 | 4,000 in 12.0 s | 61 (60) | 881 / 1,933 ms | -2 / 1,165 ms | FAIL (not gated) |

The 1 s stress has one stall, at tick 780 (2,230 ms in its log, `server-final-stress-1s.log`). Tick 780 is the public tick (below). Earlier 1 s runs of the same code measured that tick at 3.6 to 4.0 s, so the size of the stall varies between runs.

**Cause of the HEAD failure (fixed in `f3730f2`).** The per-view cost. Probe: the load script's world (4,000 joins with no device; 1 in 10 accounts buys HLCN 1 at once, as the welcome does), then `playerView` for every account each tick (`probe-view.ts`, scratch). Before the fix: 13.3 ms a view, 53 s of views a tick. After: 0.20 ms a view, about 0.8 s a tick. The CPU profile before the fix put 3,697 of 5,288 ms under `linkedAccounts`, called from the comeback card's ad refusal (`adsUsedToday`) and from `taxBasisOf` of every shop. Within it, `directPartners` re-sorted every funding and mirror key on each call, and `ownerRoots` re-ran the union-find over every human on each call. The cost grows with the mirror map: the 400 same-tick buyers of the load world make 40,740 mirror keys. (The earlier record's 1.05 ms a view came from a different probe, 200 accounts without orders; it is kept as recorded.)

**The fix.**
- `src/world/collusion.ts`: a link index (owner group and direct partners of every account), built once per link version. `touchLinks` bumps the version on every link write: an alliance join, leave or kick, a registration device, a gift or a loan, a recorded fill (the mirror counts), the mirror prune, a new account. The index is also keyed on the players and collusion objects, so a replaced map is read fresh. `linkedAccountsUncached` keeps the R-9-3 rules as written, for the check.
- `src/world/social.ts`: `taxBasisOf` reads the active loans through a receivable index keyed on the deal version. It sums the leaving receivables in the deal book's order, so the result is bit-identical to the scan it replaces. `bumpDeals` now also runs after the balance changes of a repayment, a loan acceptance and the day close, not only before them.
- `src/world/view.ts` and `server/index.ts` (`90138b4`): on a public tick the top list is serialized once and each socket adds only its own rows (`directoryWire`). The text equals `JSON.stringify(directoryFor(...))` for every viewer.
- Determinism: the answers are identical to the uncached reference, so game results do not change. The full vitest suite passes on the final commit (260 files, 2,451 tests).
- Tests: `collusion-cache.test.ts` compares cached against uncached after every link write, over 25 seeded sequences of 220 writes, and checks that each link source invalidates. `tax-basis-cache.test.ts` compares the indexed basis against the scan, bit for bit, over 12 seeded deal sequences of 160 steps. `view-directory.test.ts` compares the directory text for every viewer of a 620-player world. Disabling `touchLinks` fails both link tests (checked). The existing tests that write `allianceId` directly now call `touchLinks`.

**The server "ends about 5 minutes in" (not a server failure on the fixed code).** The four r911 "gone" times (5 min 4 s to 5 min 18 s) are the runner's own kill: `run-load-r911.sh` stopped the wrapper with `taskkill` when its client ended with the server still alive, and the watcher recorded the process gone 8 to 14 s later. The client's health fetch was refused during the HEAD settle, when the reconnect flood had 57,578 retries (1006 closes), and the client then exited 1. Plausibly the flood filled the accept queue; not tested. On the fixed code, the instrumented runs keep the server alive past 5 min and past tick 780 (tick 795 at the health check, heap 58 to 66 MB, flat), with no exit event, no uncaught exception and no unhandled rejection in the log. The r910 servers (HEAD, no watcher) logged their last slow tick 2 min 17 s to 2 min 49 s after start, which the runner kill does not explain; not isolated, and not reproduced on the fixed code.

**The public tick (every 60 ticks; not in the gate windows).** Each 60th tick (`BOARD_EVERY`, 5 min at 5 s) sends every socket the public part (`pub`: boards, economy, alliances, 134 kB) and the directory (130 kB). That is 264 kB to each of 4,000 sockets, about 1.06 GB in one tick. Measured at 5 s: a long instrumented run whose window reaches tick 789 (`prod-long-780.out`) has tick 780 at 3.9 s, with fan-out p99 3,547 ms (the max of 66 ticks) and overrun p99 98 ms. The host snapshot in that same tick takes 220 to 232 ms (`instrument-snap.mjs`), so the snapshot is not the stall. The gated windows (ticks about 735 to 747) do not reach tick 780, so the gate as written does not see this stall; a window that does reach it fails the fan-out gate. The directory change above does not shorten it: the cost is the payload. Changing the payload (send the public part on change, or spread it over ticks) is a protocol decision for the lead; not changed here.

**Mirror map growth (not changed).** The mirror pairs grow with the square of the same-tick buyers (40,740 keys for 400 buyers), and the prune drops only pairs quiet for 10 game days. The link index makes the read cheap; the map and the snapshot (14.5 MB of state at 4,000 accounts) still grow. This is a rule question (the match window or the prune), not a performance fix.

**Environment.** The worktree's `node_modules` was a junction to the tycoon worktree, which is now empty, and then to the main install, which predates `ws` (no `ws` package there). The worktree's `node_modules` is now a real directory of junctions to each package of the main install, plus `ws` 8.22.0 and `@types/ws` 8.18.2 taken from the npm cache with their lockfile integrity checked. No `npm install` was run.

### 9C.2 O-2: the residual surprise s and the rho gate (engine path, R-9-11)

**Wiring (done).** A filing of a company with a consensus carries its residual surprise (`FilingPublic.surprise = { s, d, margin }`, optional):

- the actuals (`revenue`, `ocf`, `backlogContribution`) against the consensus snapshotted at the close (`pendingFile.consensus`), over `D = max(EV_20, 0.25 mcap_20)`;
- a pending filing saved before O-2 has no snapshot and carries no surprise (it does not read the next quarter's `c.consensus`); a private company's snapshot is null and carries none;
- `consensus.ocf` is the annualized E* read scaled to the quarter (`eStar * 63 / 252`), a proxy: the consensus carries OCF only through E*;
- `mcap_20` is the mean of the 20 closed bars of the engine (`bridge.ts` `mcap20`, the engine's bars times shares out), falling back to the filed fair value with no bars. **Fixed in `83ab191`:** the window ended one bar before the close. The engine pushes a day's bar at the next day's start, so the close bar sits at index `len - lag`; the window now ends there, inclusive. The test is `rho.test.ts`, "mcap_20 is the mean of the 20 bars ending at the close".

**The engine path.** `rhoOfListedSeed` (`src/world/company/rho.ts`, used by `scripts/balance/rho-probe.ts`) runs each seed on the engine path: the IPO orders, then `listedWorld(seed, { engine: true })` and `stepEngineTo` step every tick with `stepGame` (the engine's matching and day-boundary bars, the company step and day, the sector factor of 9C.3). No bot trades the listed stock.

**The probe.** `rho = sd(s_filing) / sd(s_quarter)` over the 7 pairs of 8 post-listing quarters, where `s_quarter` is the same expression with the consensus replaced by the previous quarter's filed actuals, over the same D. Gate (Quant 6.2 (c)): median <= 0.15 and p90 <= 0.25 across seeds. The probe's quantile is `quantile()` in `rho.ts`: the value at index `floor(n q)` with no interpolation.

**Result on the fixed code: FAIL, a known V1 limit (R-9-11).** 200 seeds (`rho-1` to `rho-200`), four processes of 50 (`--first 1, 51, 101, 151`), one sector (`tech`), 8 quarters each, on the engine path. The probes ran after the window fix was made in the working tree (`bridge.ts` edited 21:18 UTC, probes started 21:26 UTC); the fix was committed as `83ab191`. The four `rho.json` files (scratch `p9/rho-engine-fix/p1` to `p4`) were combined and recomputed for this record:

| Measure (200 seeds) | Value | Gate |
|---|---|---|
| Median, the probe's quantile (0-based index floor(200 x 0.5) = 100) | **0.5972** | <= 0.15 **FAIL** |
| Median, average of the two middle values | 0.5964 | |
| p90, the probe's quantile (index 180) | **0.9271** | <= 0.25 **FAIL** |
| p90, linear interpolation | 0.9254 | |
| p95, linear interpolation | 1.0553 | reported |
| Mean, min, max | 0.6313, 0.1618, 1.6718 | |
| Seeds with rho <= 0.15 | **0 of 200** | |
| Seeds with rho <= 0.25 | 5 of 200 | |
| Non-finite s or rho | 0 | must be 0 |
| True median per process (50 seeds each) | 0.5968, 0.5586, 0.5778, 0.6180 | |

**The ruling's numbers.** R-9-11 quotes "median 0.597, p90 0.925". The median matches the probe's quantile (0.5972). The p90 of 0.925 is the interpolated value; the probe's own p90 is 0.927. The verdict does not depend on the definition: both p90 values and both medians fail their gates, and 0 of 200 seeds are at or below 0.15. The earlier probe on `4803ec2` (before the window fix, the same 200 seeds) gave 0.5955 and 0.9281 by the probe's quantile; the fix moves the median by +0.002 and the p90 by -0.001, so the residual is not sensitive to the `mcap_20` window in this configuration.

**Source of the residual: a hypothesis, not isolated.** The OCF term is the likely largest source (its consensus is the E* proxy, which lags a quarter in which revenue falls). This was not measured; a decomposition needs the per-term rows in `rho.json` (`sdRev`, `sdOcf`, `sdCb`, which were recorded), and a targeted run, which was not done. R-9-11: O-2 is a known V1 limit, owner Quant, post-V1 (isolate the term, then retune the weekly signal noise or the consensus update). Player companies list late (R2, $50M filed value), so the exposure in V1 is small. No further compute on it in Phase 9.

**Test status.** `src/world/company/rho.test.ts`: the wiring is tested directly (a listed filing's `s` equals `valuation.surprise` on the closing snapshot, finite and with a positive D; a private company's filings carry no surprise; a pre-O-2 pending filing carries none; `mcap_20` ends at the close bar). On the engine path the listed asset books bars (the engine keeps the last 30). `rho_residual` runs over 3 seeds on the engine path: its probe-is-finite check is a plain test and passes; its gate assertion is `it.fails` with the title "(R-9-11: known V1 limit, owner Quant, post-V1; measured FAIL in 9C.2)". The `V1-ACCEPTANCE.md` row `rho_residual` is FAIL with this ruling.

**Known limit of the `mcap_20` test (non-blocking).** The "close bar at index `len - lag`" test restates the formula that `bridge.ts` uses. It guards the index against a later edit, but it cannot catch a change in the engine's bar timing: a `DayBar` carries no day stamp (`c`, `n`, `u` only), so an independent check of which bar is the close needs a stamp or a known price path. Not built.

**Not run.** The six-sector sweep (`rho_engine` of the Quant probe; this covers one sector), `rho_ev_robust` and `rho_by_spread` (the `fx_close_payout` twin and the spread-bucket fixtures are not built), `alt_prefiling_edge` and `signal_joint_v15` (the bot harnesses are not in this worktree).

### 9C.3 O-12: the company sector shock is the engine's sector factor

**Done (commit `f127566`).** A company sector's level moves each day by the engine's sector factor return: the sum of the engine's per-tick sector draws over the day, on the G22 unit reading `F_s = sum z * sqrt(dt)`, `dt = 1 / (ticksPerDay * daysPerYear)`. The company's own stream (`co:sector:*`) is gone.

- There is no second stream. Each company sector holds a cursor: the engine's sector state and tick at the last company day (`src/world/company/sectorFactor.ts`). The factor is the engine's own draws replayed with the same `Rng` calls as `sim.ts` (`new Rng(state)`, one `normal()`, `state()`), and the replay must land on the engine's current state, or the day throws. No engine change: the engine's fingerprints do not move.
- Founding takes the engine's sector state as the cursor. A save from before O-12 is migrated (`bridge.ts` `migrateAll`) to the engine state at its tick.
- Worlds without player companies never run `companyDay` (the company world is created by founding), so their fingerprints do not move. The engine fingerprint suites (`src/engine/calibration.test.ts`, `ecology.test.ts`, `src/world/funds/property.test.ts`) pass unchanged.
- `scripts/balance/company-calibrate.ts` uses `seedSectorSource`, the engine's sector streams for the seed at the release rate (720 ticks a day).
- The company constant `sectorShockScale` is removed (`src/content/company.ts`); the comment in its place points here.

**Tests.** No test asserted a numeric value of the old stream, so no assertion was changed. Fixtures that moved the clock without drawing the engine's sector streams (`b1fixture.ts`, `backstop.test.ts`, `insiders.test.ts`, and the trade ticks of `exploits/sequences.ts`) now draw them through `jumpEngineTicks`. A test that revisits an earlier day (the tape window tests) moves the clock back: `advanceTo` re-anchors the cursors there (`reanchorSectors`). The server never rewinds. `sectorFactor.test.ts` (9 tests): the replay equals the engine's state after N steps; `jumpEngineTicks` equals `stepMany`; a day's factor is the engine's and the cursor lands on the engine; a foreign stream is refused; a cursor ahead of the clock is refused; the day factor has unit variance per year (6,000 days, within 15%); the no-engine source starts at tick 0 on the seed streams; the real game loop (`stepGame` through two day boundaries with a founded company) keeps the cursors on the engine and moves a sector level; a world without companies is not moved by `companyDay`. `determinism.test.ts` (commit `4803ec2`): the same seed run twice on the engine path gives an identical company world, with the cursors at the engine's tick; a different seed differs.


**Runs.** Touched company suites on `83ab191` (`src/world/company` and `scripts/balance/bands.test.ts`, `npx vitest run --maxWorkers=2`): 56 files passed, 2 skipped (58); 504 tests passed, 1 expected failure, 69 skipped, 20 todo. Gates before the commit: `npx next typegen` and `npx tsc --noEmit` exit 0; ESLint on the touched files 0 errors. **Full suite** (`npx vitest run --maxWorkers=2`, once, on the tree of this record: `de0739a` plus the script header and this section; no source change since `83ab191`): 254 files passed, 2 skipped (256); 2,414 tests passed, 4 expected failures, 70 skipped, 20 todo (2,508); exit 0 (746 s; the log is `t5-full-vitest.log` in the scratch folder). The earlier run on `83ab191` gave the same counts (`t4-full-vitest.log`).


### 9C.4 AUSD: the stablecoin volatility band at 300 seeds x 720 ticks

**Ruling: the stablecoin class band `[0.6, 1.1]` on the RMS ratio, applied to AUSD** (`scripts/balance/bands.ts`, `UNIVERSE_VOL_BANDS.AUSD`, with its mechanism written next to the number). The ruling follows the lead's rule for a band that still straddles. A ruling is a band, not a verdict: the verdict below is UNDECIDED.

**Run.** `scripts/balance/run.ts --universe --assets AUSD --seeds 50 --first K --tpd 720 --years 1` in six processes (K = 1, 51, 101, 151, 201, 251), 300 seeds in all, started 19:03, finished about 20:17. **Deviation:** one game year per seed, not the default five. A seed-year took about 82 s on this machine under load, so five years at 300 seeds would be about 34 CPU-hours; this was not run. The RMS and its standard error are combined over the six parts with the delta method `se = se(mean x²) / (2 RMS)` that `run.ts` uses.

| Measure | Value |
|---|---|
| Seeds | 300 |
| RMS of the AUSD vol ratio | **1.032** |
| Standard error (delta method) | 0.154 |
| 2 s.e. interval | **[0.725, 1.340]** |
| Median seed ratio | 0.070 |
| Seeds with ratio below 0.3 | 78% |
| Largest seed ratio | 9.23 (27% of the mean square; the RMS without it is 0.886) |
| Per-part RMS (50 seeds each), with s.e. | 0.524 ± 0.160; 1.122 ± 0.180; 1.584 ± 0.554; 0.910 ± 0.187; 0.783 ± 0.189; 0.954 ± 0.200 |

**Verdict (the verdict code is `bands.ts` `verdictOf`, PASS only when estimate ± 2 s.e. lies inside the band; `run.ts` lists UNDECIDED and does not count it as a failure).**
- Under the general band `[0.85, 1.4]`: the 2 s.e. interval straddles 0.85, so it is **UNDECIDED**.
- Under the class band `[0.6, 1.1]`: the point estimate 1.032 is inside, but the 2 s.e. interval straddles 1.1 (upper edge 1.340), so it is **UNDECIDED** as well. It is not a FAIL under either band and is not a PASS.

**Mechanism.** AUSD's variance is set by its rare depeg jumps (0.25 a year, down 6% on average). In 78% of the seeds the year has no depeg and the ratio sits on the no-jump shoulder, below 0.3. The seeds that depeg carry the RMS, which is why the per-part RMS ranges from 0.52 to 1.58. The 50-seed parts are noisy for this reason; a 5-year run would sample more depegs per seed, but this run does not do that.

**Not done.** FLUX, the other stablecoin (0.5 jumps a year, undecided at 8 seeds with 0.778), has no 300-seed run here and keeps the general band. The 5-year, 300-seed AUSD run is not done (cost above). A 2-s.e. verdict within the class band needs more depeg samples than 300 one-year seeds give.

### 9C. Not done and open

- **R-9-8b load gate: PASS on `90138b4`, 3 of 3 (9C.1).** The HEAD failure was the per-view cost of the link groups (fixed in `f3730f2`). The gate windows do not reach a public tick.
- **Public tick stall (9C.1, lead decision).** Every 60th tick (`BOARD_EVERY`) sends each socket 264 kB (the public part and the directory): tick 780 takes 2 to 4 s at 1 s and 3.9 s at 5 s, with fan-out p99 3.5 s in a window that reaches it. The snapshot in that tick is 220 to 232 ms and is not the cause. Fix options are a protocol change (send the public part on change, or spread it over ticks) or a smaller boards payload. Not done here.
- **The "server ends at 5 minutes" of the r911 record (9C.1):** the runner killed the server at its client's end. On the fixed code the server lives past 5 min and past tick 780 with no exit or uncaught event. The r910 ends (no watcher, last slow tick 2 min 17 s to 2 min 49 s in) are not isolated.
- **Mirror map growth (9C.1):** 400 same-tick buyers give 40,740 mirror keys, so the map and the snapshot grow with the square of the buyers. A match-window or prune rule question, not changed here.
- **O-2 gate (R-9-11):** FAIL, a known V1 limit, owner Quant, post-V1. The OCF term is a hypothesis that was not isolated.
- **The `mcap_20` test restates the formula (9C.2):** non-blocking; an independent bar-timing check needs a day stamp on `DayBar`.
- The six-sector rho sweep, `rho_ev_robust`, `rho_by_spread`, `alt_prefiling_edge` and `signal_joint_v15` (9C.2).
- The 5-year AUSD run at 300 seeds and the FLUX run (9C.4).
