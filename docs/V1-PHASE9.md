# V1 Phase 9: status

Scope: Phase 9 as set in `docs/team/specs/lead-phase9.md` (binding). This file holds section 9B (Exploits and the wealth curve). Tracks 9A (acceptance matrix), 9C (load and calibration residuals) and 9D (docs) add their own sections when they land.
Branch: `p9/b`, worktree `.claude/worktrees/p9-b`, from `v1` at `deae39c`. Status date: 2026-10-12.
Status words as in `docs/V1-PHASE6.md`: **Done**, **Partial**, **Not built**, **Deferred**, **Decided**.

## 9B. Exploits and the wealth curve

### 9B.1 Items

| Item | Status | What | Where |
|---|---|---|---|
| Alt-peak, loan route | **Done (fixed)** | A loan owed is subtracted from the rank basis. A 0% loan from a rich account no longer raises the borrower's rank peak. | `src/world/social.ts` (`loansOwedOf`, `unearnedCashOf`), `src/world/assets.ts` (`refreshNetWorth`) |
| Alt-peak, gift route | **Done (fixed)** | Gift cash received, net of gift cash given, is subtracted from the rank basis (`Player.giftsNet`). | `social.ts` (`noteGift`), `types.ts` |
| Alt-peak, funding link | **Done (fixed)** | An accepted loan counts as player-to-player money for the collusion graph (funding link, `FUNDING_MIN_GIFTS` = 2), so a loan-funded alt is linked to its lender. | `social.ts` (`respondDeal`) |
| Ad farm, linked cap | **Done (fixed)** | The sponsor cap is one count for the collusion group (`linkedAccounts`): device, gift or loan funding, alliance and mirrored fills. Before, only the alliance owner was a profile, so a device-linked alt got its own ten. | `src/world/sponsor.ts` (`adsUsedToday`, `finishBreak`) |
| Ad farm, restricted-cash laundering | **Done (tested, partial)** | Ad cash cannot leave by a loan or a transfer, and cannot margin-buy. Asserted on an account whose whole balance is one ad lot. Not covered by this probe: fund deposits, Launchpad buys, court settlements, the option refusal (needs a Derivatives-rank account) and the alliance deposit. | `src/world/exploits/ad-farm.test.ts` |
| Ad farm, unlinked alts | **Not fixed (documented limit)** | Two accounts with separate devices and no money or trade links are two profiles. Nothing in the world ties them. The control test pins this. | `ad-farm.test.ts` (control) |
| Insider alts, linked alt | **Done (fixed)** | A tip counts for every account in the trader's collusion group. An order by a linked alt on a tip stock is flagged, on the alt. The group is read only when an open tip on the asset exists. | `src/world/tips.ts` (`openTipsFor`) |
| Insider alts, unlinked alt | **Not fixed (documented limit)** | An alt with its own device and no money from the tip holder is not in the group. The control test pins this. | `insider-alts.test.ts` (control) |
| Clip, world layer | **Done (passes)** | One order against 60 clips of the same notional, one a tick, in the same seeded world. The one-sided 95% upper bound of the lift ratio over 20 seeds is 1.0025 (gate 1.5). | `src/world/exploits/clip.test.ts` |
| Clip, engine and company layers | **Existing** | The day tally across accounts (`trading.ts` `permanentMove`, `marginalImpact`) and the suites `src/engine/selfimpact.test.ts`, `src/engine/exploits.test.ts`, `src/world/company/exploits/x1-x2.test.ts`. | (existing) |
| Bust farm, window money | **Done (passes)** | Six busts, one per 8-week window: fresh money (fresh start and write-off) is $5,000 each window; a second bust in a window is blocked and pays nothing; the money identity holds across the six busts. | `src/world/exploits/bust-farm.test.ts` |
| Bust farm, retry lottery from R0 | **Not built** | A bust-and-retry account from R0 gets a free retry every 8 weeks. The fastest-climber floor ($100k, 01 §14.4) that would close it is not built and needs Mathis's decision. | (ROADMAP 2.6 item 3) |
| Wealth curve (four styles) | **Done** | `scripts/balance/wealth.ts bot`: neglected, average, managed, excellent; 20 seeds each; 120 game days each. | 9B.4 |
| Rank-time table | **Done (censored)** | Days to R1 at p10, p50, p90 over 20 seeds. R2 to R4 are not reached in 120 game days by any seed; reported as counts, not as percentiles. | 9B.4 |
| X4 to X15 (later items) | **Deferred** | Splits, dividends, founder stock, resignation pumps, shorting, takeovers, crime, ownership, capital stack, AGMs, rent, investment projects. Each lands with the system it tests (spec, `tape-stonks-exploits.md`). | — |

### 9B.2 Commits

| Commit | What |
|---|---|
| `c267067` | Fix: alt-peak (loan and gift rank basis, funding link for loans), ad-farm linked cap, insider-alt tip group; probes `alt-peak.test.ts`, `ad-farm.test.ts`, `insider-alts.test.ts`, `clip.test.ts` |
| `7f4923b` | Test: `bust-farm.test.ts` |
| (this commit) | This section |

### 9B.3 Gates

Each gate is a test in `src/world/exploits/`. Numbers are from the run on this tree.

| Gate | Test name | Numbers | Result |
|---|---|---|---|
| Alt-peak, loan | `a 0% loan of $300k from a rich main leaves the alt at its own rank (R0)` | Alt net worth after the loan is over $300k; rank R0 (before the fix: R2); peak under $250k | PASS |
| Alt-peak, control | `control: the same $300k earned ranks the account to R2` | R2 | PASS (the test is not vacuous) |
| Alt-peak, gift | `a $300k gift to an R1 alt (net of the 5% tax) does not lift its rank above R1` | Rank R1 (before the fix: R2) | PASS |
| Alt-peak, link | `two accepted loans from main to alt link the two accounts` | Linked (before the fix: not linked) | PASS |
| Ad farm, linked pair | `two accounts linked by a shared device share ten breaks a real day` | Paid 10 of cap 10 | PASS |
| Ad farm, unlinked control | `two unlinked accounts ... are paid their own ten each` | Paid 20 (ten each) | PASS (documented limit) |
| Ad farm, laundering | `an account whose whole balance is ad cash cannot lend it, transfer it or margin-buy with it` | Loan refused `adCashTransfer`; transfer refused by the cap first (see 9B.5); margin buy refused `adCashMargin`; balance unchanged | PASS |
| Insider alt, linked | `an alt linked by a shared device buys the tip stock` | Flags on the alt: 1; points 11.00 | PASS |
| Insider alt, unlinked control | `an alt with its own device ... is not flagged` | Flags on the alt: 0 | PASS (documented limit) |
| Insider alt, self | `the holder trading the tip itself is flagged` | Flags > 0 | PASS |
| Clip, world layer (`self_impact_clip_ratio`) | `the one-sided 95% upper bound of the lift ratio over 20 seeds is <= 1.5` | 20 seeds, 60 clips against 1 order, $240k. Mean 1.0004, median 0.9986, min 0.9925, max 1.0092, one-sided 95% upper 1.0025 (t(0.95,19) = 1.729) | PASS |
| Bust farm, window money | `six busts, one per window: fresh money <= $5,000 a window ...` | Fresh money per window 5,000 in all six windows (total 30,000); second bust blocked in each window; money identity holds (toBeCloseTo, 4 digits) | PASS |
| Existing clip gates | `src/engine/selfimpact.test.ts`, `src/engine/exploits.test.ts` | Ran in the broad suite (9B.6) | PASS |

The alt-peak, ad-farm and insider-alt gates are deterministic (no draws in the path), so one world per gate is the full check; the 20-seed bound is needed only for the clip gate, which depends on the seeded price path.

### 9B.4 Wealth curve and rank-time table

Command: `npx tsx scripts/balance/wealth.ts bot wealth-<k> 120 <style>` for k = 1 to 20, 120 game days, NPCs on (the wealth bot's own setup). One game day is one real hour. The bot is the greedy investor in `wealth.ts` (its own buy rule and presence pattern per style), not a human model.

Net worth at day 120 and valued income per game day, p10, p50, p90 over 20 seeds:

| Style | Net worth p10 | p50 | p90 | Valued income per day p10 | p50 | p90 |
|---|---|---|---|---|---|---|
| neglected | 3,148 | 5,807 | 9,861 | 0 | 0 | 0 |
| average | 15,634 | 18,382 | 22,070 | 2 | 107 | 145 |
| managed | 10,080 | 14,827 | 24,270 | 1 | 12 | 121 |
| excellent | 13,212 | 21,502 | 29,159 | 2 | 77 | 230 |

Rank-time table, days to first reach each rank (game days, p10, p50, p90 over the seeds that reached it; reached counts out of 20):

| Style | R1 (Hustler, $20k peak) | R2 (Owner, $250k) | R3 (Operator, $5M) | R4 (Mogul, $100M) |
|---|---|---|---|---|
| neglected | 0 of 20 | not reached | not reached | not reached |
| average | 7 of 20: 75, 107, 114 | not reached | not reached | not reached |
| managed | 5 of 20: 79, 89, 114 | not reached | not reached | not reached |
| excellent | 13 of 20: 52, 74, 107 | not reached | not reached | not reached |

Reading: within 120 game days, the greedy wealth bot reaches R1 in most seeds only with the excellent style, and no seed reaches R2 ($250k). The horizon is 120 game days, not the 365 the spec's rank-time table implies: a 120-day run took about 10 minutes with three runs in parallel on this shared machine, and 80 runs were needed. The R2 to R4 times are therefore censored, not measured. A run to 365 days is the next step for Ledger, with the same 20 seeds.

Raw per-seed rows: the scratchpad `p9/wealth/` folder (one JSON line per seed; `summarize.cjs` builds this table).

### 9B.5 Deviations and decisions

1. **The rank basis subtracts loans owed and net gifts received, not the boards.** `netWorthPeak` (rank) follows the basis; `netWorth` and the boards still count borrowed cash. A loan can still lift an alt on a board until it is repaid. Ledger to decide whether boards use the basis too.
2. **Loans count as funding links.** `FUNDING_MIN_GIFTS` (2) now counts accepted loans as well as transfers. This changes the collusion graph of any world with loans (the only world change in this section besides the fixes above).
3. **The sponsor cap is one count per collusion group, summed.** It replaces the alliance-owner profile (max over the account and its owner). Each account's breaks count once, on that account; the group's count is the sum of its members' breaks that real day.
4. **The ad-farm gate is the designed cap, not an EV band.** A linked alt beyond the group's ten has no paid break, so its EV is 0 by construction. The unlinked alt is a documented limit, not a band.
5. **Clip gate on the world layer uses a one-sided 95% bound.** Twenty seeds, t(0.95,19) = 1.729, the same form as the spec's "over enough seeds for a one-sided 95% bound".
6. **The transfer test reaches the ad refusal on a larger balance.** On a $250 balance the 10%-of-net-worth cap refuses first, so the test uses a $2,000 ad lot where the ad rule is the reason.
7. **Bust farm: window money, not a bot EV.** The probe checks what the designed bust path pays per window and that the money identity holds. A bot that tries a retry lottery from R0 is not built (9B.6).
8. **Wealth horizon is 120 game days.** See 9B.4.
9. **Balance finding for Ledger.** The greedy wealth bot's net worth at day 120 peaks at $30,386 (excellent, one seed; the largest in any style and seed), and no seed reaches R2 ($250k). Under this bot the R2 gate is not reached in 120 days; whether that is the design (a long climb) or a tuning issue is a Ledger question.

### 9B.6 Gates and checks on the final tree

- `npx next typegen` and `npx tsc --noEmit` on the final tree: exit 0.
- ESLint on the touched files (`types.ts`, `social.ts`, `assets.ts`, `sponsor.ts`, `tips.ts`, `src/world/exploits/*.test.ts`): exit 0, no errors or warnings.
- Vitest, the broad run (`src/engine src/world src/components src/game src/i18n src/shell src/content`, `--maxWorkers=3`) on the final tree: **218 files passed, 2 skipped; 2,139 tests passed, 70 skipped, 21 todo.** Includes the new probes and the existing engine clip suites.
- Money identity: the bust-farm probe and the existing `comeback.test.ts` check it across busts; the fix changes no money move (loan and gift cash still move as before; only the rank basis and the collusion groups change).
- Determinism: the rank basis and the sponsor cap read only state that exists in the save (`loansOwed` from the deal book, `giftsNet` optional, default 0). A world with no loans, no gifts, no ads and no tips keeps every fingerprint (no new draws).

### 9B.7 Open items

- **Unlinked alts** (ad farm and insider alts): a link needs a shared device, a gift or loan, an alliance or mirrored fills. Two accounts with separate devices and no money flow are not linked. The fix is an identity layer (phone or account-level checks), not a world rule.
- **Boards and loans**: boards rank by live net worth, which includes borrowed cash (9B.5 item 1).
- **Retry lottery from R0**: a bust and retry every 8 weeks from $5,000 is a free rank race. The fastest-climber $100k floor (01 §14.4) would close it; the decision is Mathis's.
- **Perk value**: the bust perks (Old contacts, Lessons, Second wind) are not measured against the $2,500 cap in 01 §14.
- **Pre-fix numbers for the ad farm and insider alts**: the alt-peak pre-fix numbers were observed (R2 for the loan and gift routes, not linked); the ad-farm and insider pre-fix numbers were not measured (the code path changed, the test asserts the post-fix state).
- **X4 to X15** (later exploit items): land with the systems they test.
