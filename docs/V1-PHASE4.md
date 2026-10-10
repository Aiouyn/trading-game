# V1 Phase 4: status

Scope: Phase 4 of the V1 plan (shops and companies, player-run funds), as set in `~/.claude/plans/expressive-sprouting-aurora.md` (Phase 4), the Phase 4 lead decisions file (`p4/DECISIONS.md`, sections 1 to 4) and `docs/team/vision/ROADMAP.md` 2.2.
Branch: `v1` in `.claude/worktrees/tycoon`. Status date: 2026-10-10.
Status words as in `docs/V1-PHASE1.md` and `docs/V1-PHASE3.md`: **Done**, **Partial**, **Not built**, **Deferred**, **Decided**.

The sections below are the full Phase 4 status. Section 0 is the summary and is current. Sections 1 to 9 are the detail written branch by branch during the phase; section 9 is updated for the merge of `p4/ops`. Section 10 records the merge of `p4/d1` and `p4/d2` and the gate run on the merged `v1`.

## 0. Phase 4 status (current, after the `p4/d1` and `p4/d2` merge)

### 0.1 Branches

| Branch | Head | Merged to v1 | Status |
|---|---|---|---|
| `p4/a1` managed shops | `4b77962` | `0ad43e2` | Merged (section 2) |
| `p4/a3` company world core | `b09fe01` | `5a23eba` | Merged (section 3) |
| `p4/a4` player-run funds (world) | `d4ca8f6` | `3d43d22` | Merged (section 4) |
| `p4/a2` company engine hooks | `f6ed59c` | `3dfbc2a` | Merged (section 3a) |
| `p4/tune` shop gates, VCF advance | `f634f01` | `ee80574` | Merged (sections 2.2a, 4.4) |
| `p4/b1` market path | `4d70686` | `583f573` | Merged (section 7) |
| `p4/b2` governance and failure | `dbe40ad` | `f981061` | Merged (section 8) |
| `p4/ops` company operations half | `83dc4d9` | `a8ff5b9` | Merged (section 9) |
| `p4/cap` company Capital tab | `c731500` | `0daa58a` | Merged (this table; no section of its own) |
| `p4/biz` businesses shop management | `ae481aa` | `8665762` | Merged (this table; no section of its own) |
| `p4/d1` Tape company checks as Vitest | `3972eea` | `908c615` | Merged in this pass (section 10); **partial** |
| `p4/d2` exploit suites X1 to X15 | `e5486b7` | `c04504b` | Merged in this pass (section 10); **partial** |
| `p4/ex` Exchange app, player stocks and funds UI | `6de3ac3` | merged | The pending doc change was committed in `p4-ex` (`6de3ac3`), then the branch was merged `--no-ff`. One doc conflict (both sides appended a section; the Exchange section is now 11). `s8-no-reveal` allowlist gained `revenueBand` (filed-only band). See section 11. |

Each merge was `--no-ff`. The `p4/d1` and `p4/d2` merges had no conflicts. Neither branch had uncommitted work at merge time (`p4-d1` and `p4-d2` were clean; `p4-ex` was not).

### 0.2 Plan items

Plan Phase 4 items, as written in `expressive-sprouting-aurora.md`, with the status at this merge.

| Plan item | Status | Commits | Notes |
|---|---|---|---|
| Shops: the 156-business catalog becomes managed shops (engine and world) | **Done** | `3b7ab6c`, `4b77962` (merge `0ad43e2`) | Levers, offline ramp, value guards (S4, S5). |
| Shops: management levers in the Businesses app (crew, price, quality, maintenance, marketing, manager, morale) | **Done** | `ae481aa` (merge `8665762`) | Refusals inline with three-part copy. Overdraft notice is an i18n key (closes A1 open item). |
| Shops: visible reviews, queues and morale | **Done** | `ae481aa` | Rolling star reviews, queue, served versus demand, morale. |
| Shops: payback gates (well run 9 to 11 gd, excellent 7 to 8, neglected 20 to 30, every tier, 20 seeds) | **Done** | `f3d03f3`, `f634f01` (merge `ee80574`) | Gate: `npm run balance:shops`. |
| Shops: re-tune with `scripts/balance/wealth.ts` management variants | **Partial** | `f3d03f3`, `f634f01` | `wealth.ts` has the three styles and presence patterns. The five-year `run.ts` economy check is open (O-6). The managed row sits above S3's payback (O-8). |
| Company world core: sectors, demand and logit share, R&D (quality, patents, pharma gates), hiring caps, tiers Seed, Growth, Late | **Done** | `943f7c6`, `b09fe01` (merge `5a23eba`) | |
| Company engine hooks: value source (`companyPrintShare` = 1 on player stocks), IPO through `appendAsset`, window enforcement (`closedWindow`, `windowClosing`), sell-only plans with escrow, buybacks, takeover tender | **Done** | `3fcd667`, `f6ed59c` (merge `3dfbc2a`) | Sector shock is still a world stream, not `sectorRng` (O-12). |
| Private rounds | **Done** | `0ed0dcb`, `4d70686` (merge `583f573`); `f0aa5af`, `c731500` (merge `0daa58a`) | Refused after listing and during the IPO, with copy. |
| Quarterly filings and weekly signals into the value pool | **Done** | `943f7c6`, `3fcd667` | Tape rows for signals and filings pass at 20 seeds (section 10.2). |
| IPO at 0.9 x V, float 15 to 49%, 168 gd lockup, at most 5% of float per buyer | **Done** | `0ed0dcb`, `4d70686`, `f0aa5af` | Rule suites `s7` (d1). Underwriting fee base is open (O-4). |
| Trading window F+2 to F+21 | **Done** | `3fcd667`, `0ed0dcb` | Tape `window_boundaries` and `closed_window_bypass` pass in suites. |
| Plans (sell-only, escrow, every reject code) and buybacks | **Done** | `3fcd667`, `f6ed59c`, `0ed0dcb` | Tape `s4` suites. Plan surveillance points are not wired (O-15). |
| Covenants and guarantees, consequence shown first | **Done** | `0ed0dcb` (debt), `c731500` (guarantee gate) | Capital tab shows the consequence before the control. |
| Bankruptcy, limited liability, 63 gd clawbacks | **Done** | `b730107`, `dbe40ad`, `3972eea` | `3972eea` fixed a dividend that was never a covered payout. |
| CEO change and freeze | **Partial** | `b730107` (A+10, freeze A..A+31, 252 gd cooling) | The CEO-change action has no UI, only notices (O-16). |
| Takeover tender floor 1.2 x VWAP30 | **Done** | `b730107`, `dbe40ad` | Floor read from the daily company tape. |
| Antitrust refusal above 60% sector share | **Done** | `b730107` | |
| Insider backstop through the court (`insider` case kind) | **Partial** | `b730107` (`backstop.ts`) | The case works. Window and plan surveillance points are not called yet (O-15), and the company side does not set `insiderId` (O-14). |
| Exploit map X1 to X15 as tests | **Partial** | `e5486b7` (merge `c04504b`) | X1 to X15 are named suites. The bot and pump rows (X1, X2, X6, X8, X10 parts) are `it.todo` in `blocked.test.ts`. X3, X5, X11 were fixed. |
| Exploit map N1 to N17 as tests | **Partial** | `b730107`, `dbe40ad`, `e5486b7`, `75ca35b` | N2, N10 and N16 are not named in any test. |
| G22 settled with the passing reading, documented | **Done** | `943f7c6` (C1, section 3.1) | Rho checks stay blocked on G22 (O-2). |
| Founder template with reachable first goals | **Done** | `b4b349e`, `83dc4d9` | Founding at R2, first-goals card, five-step checklist. |
| "What the market sees" toggle | **Done** | `b4b349e`, `83dc4d9` | Renders `CompanyPublic` only (`marketOf`). |
| Inline explanation on every refusal code | **Done** | `b4b349e`, `b730107`, `c731500`, `f0aa5af` | Copy in en and fr, three parts. Not audited code by code in this pass. |
| Executives with traits, board votes, franchising | **Done** | `b730107` (`governance.ts`, `franchise.ts`), `b4b349e` (UI) | NPC pools vote by the fair-value rule. |
| Supply deals at arm's length; related-party revenue never counts | **Done** | `b730107` (`supply.ts`), `75ca35b` (s5 suites) | |
| Company app per `velvet-company-app.md` (corrected to Quant v1.7) | **Done** | `b4b349e`, `83dc4d9` (ops); `f0aa5af` (Capital tab) | Spec now at v1.5 (the plan says v1.4). |
| Capital tab (cap table, private round, IPO, window, plans, buybacks, debt, dividends, takeover, failure) | **Done** | `f0aa5af`, `c731500` (merge `0daa58a`) | Owner-only view `capital`. |
| `CompanyFounderView` lint-confined to the Company app | **Done** | `b4b349e`, `83dc4d9` | `boundary.test.ts` (TS compiler API). |
| Company Overview, R&D, People, Deals and Notices | **Partial** | `b4b349e`, `83dc4d9` | Overview decision applies at once, with no next-day staging (O-17). The Filings view is not built. |
| Player-run funds (world): custody, mandate, fees, gates, surveillance, S5 penalties | **Done** | `6c63fb3`, `d4ca8f6` (merge `3d43d22`); `f3d03f3` (VCF advance) | Property test over sequences (section 4.3). |
| Funds UI (in the Exchange app) and the fund board (net return, Sharpe, $1M minimum) | **Done** | `p4/ex` merge | Section 11. |
| Exchange app for player stocks | **Done** | `p4/ex` merge | Visible on the shelf after Portfolio. Section 11. |
| Tape company checks as Vitest suites (Quant v1.7) | **Partial** | `d4bf1ce`, `75ca35b`, `3972eea` (merge `908c615`) | 8 statistical rows pass at 20 seeds. 18 rows are NOT RUN (section 10.2). |
| Gates: exploit map and money-flow invariants and zero-sum | **Partial** | `e5486b7` (merge `c04504b`) | Zero-sum has a KNOWN DEFECT (O-3). |
| Gates: balance (`balance:shops`) | **Done** | `ee80574` | |
| Gates: ecology gates, socket load (4,000 clients), play-by-hand on desktop and phone, screenshot tour | **Not run** | none | Listed in the plan's Verification section. Not run in this pass (O-19). |

Launchpad is Phase 5 and is not in scope here.

### 0.3 Lead rulings (all recorded)

Each ruling is listed once with where it is recorded.

**Shops** (`p4/DECISIONS.md`, section 1)
- S1. Management drives payback. Payback is about 10 gd when well run, 7 to 8 when excellent, 20 to 30 when neglected. Tier ladder 10/15/30/50/80/120 for well-run play. (Mathis's locked decision.)
- S2. Levers: crew, price level, quality, maintenance, marketing, manager (1 to 3 stars), morale. Feedback: star reviews, queue, morale.
- S3. One game day is one real hour. A once-a-real-day player with a manager and sane settings reaches the well-run payback.
- S4. Offline: full income for 8 gd, ramp to 25% by day 16. A manager extends full income to 16 gd. Automation no longer gives 100% forever.
- S5. Exploit guard: value uses a trailing 7-gd average of steady-state income, capped by the tier's fair multiple. Hires have a minimum term or a severance. Price changes take effect at the next game day, at most once a day.
- S6. Calibrate with NPC presence. Gate: well run 9 to 11 gd, excellent 7 to 8, neglected 20 to 30, every tier, 20 seeds.

**Company building** (`p4/DECISIONS.md`, section 2)
- C1. G22 is settled with the passing reading (unit-scale F_s, no unobserved working-capital or cost surprises). Recorded in section 3.1.
- C2. Architecture: company state in `src/world/company/*`; generic engine hooks; player stocks get no catalyst earnings and no options.
- C3. Implement CB-001 to CB-113 with v1.7 numbers (the list is in section 0.2).
- C4. Minimal designs for CB-114 to CB-120: executives, board votes, franchising, supply deals, founder template, and three-part refusal copy for every code.
- C5. The Velvet app spec is corrected to v1.7 (clawback box, public plan rows without the minimum price, Late-tier index clause, insider filing instruments, IPO can't-buy rule).
- C6. `CompanyFounderView` is imported only from the Company app, enforced by a compiler-API test.

**Player-run funds** (`p4/DECISIONS.md`, section 3; ROADMAP 2.2)
- Fees: management 2% or less a year, performance 20% or less above a high-water mark crystallized each game quarter, custody sink 0.25%. No per-trade fee.
- Deposits and redemptions settle at the next day-close NAV. Redemption gate 20% a day. Early exit fee 1%, paid into the fund within 2 real days. Investor limit 25% of the investor's own NW. Investor accounts at least 7 real days old and not linked to the manager.
- Safeguards 1 to 6: custody (no manager withdrawal except its own share and crystallized fees); mandate with leverage 1.5x or less, positions 20% of NAV or less, 24 real hours of notice to change; no related-party trading and a 5% cap with filing for insider assets; a front-running check; absent-manager freeze after 72 real hours, wind-down after 14 days; drawdown breaker at -30% from the high-water mark within one game week.
- S5 penalties go through the court. The manager's stake is first-loss for restitution. Acceptance: a property test over 10,000 random action sequences shows a manager never withdraws investor money.

**Stage A and B rulings** (sections 1, 4.4)
- The victim's share of a fine stays `creditExternal` (the p3/c2 rule).
- Ruling B (stage B): the VCF advance goes to non-manager investors, not into the fund (`advanceToInvestors`). The fund's cash and NAV do not move.

**Market path and governance** (section 8.3; from the B1 and B2 review)
1. Unallocated IPO float is a booked faucet, outside capital, like the NPC investor pools. Accepted.
2. Owner links use alliances only in V1. The collusion graph is not in `src`; it belongs to the anti-cheat work in Phases 6 and 9. Known limitation recorded (see O-5).
3. Forced liquidation and squeeze buy-ins inside a closed window are allowed. Escrowed shares add no collateral (`collateralEquityOf`).
4. Extra reject codes accepted: `tenderNoBidder`, `buybackBadSpec`, `roundAfterListing`, `roundDuringIpo`.

**Operations half** (section 9)
- NPC rival shares stay private. The rivals table shows names and prices only.
- The import boundary allows exactly the Company app, `world/company/views.ts`, `world/company/index.ts`, `world/view.ts` (the transport of the owner's own view, a lead ruling) and world tests.
- The founding capital input is `company-found-capital`.

**Exchange visibility**
- C-38: Exchange stays hidden on `v1` until `p4/ex` lands (commit `347c4d2`). The ops merge had unhidden it. No separate ruling file was found; the commit cites C-38.

**Deviations declared for lead or Ledger sign-off** (section 7.3). Status at this merge:
1. Founder sell cap covers the founder account only. Open for sign-off (O-7).
2. Unallocated float is a booked faucet. Accepted by ruling 1.
3. Underwriting fee base is the gross float value. Open (O-4).
4. Alts and collusion graph. Open, owner Ledger (O-5).
5. Derivatives on the founder's stock are not filed. The engine refuses options on company stocks, so no founder derivative can trade in v1. Revisit when listed options exist (O-18).
6. Default triggers are stricter than the spec's five-day rule. Ledger to confirm (O-7).
7. Pool sale proceeds stay in the pool account. Money is conserved, but the investors' sale proceeds are misattributed. Owner Quant (O-9).

### 0.4 Gates

**Gates on the merged `v1` in this pass** (after `p4/d1` and `p4/d2`, merge `c04504b`):

| Command | Result |
|---|---|
| `npx next typegen` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=4` | 171 files passed, 2 skipped. 1704 tests passed, 2 expected fail, 70 skipped, 21 todo (1797). 201.9 s |
| `npx eslint src scripts server` | 0 errors, 15 warnings (the pre-existing `react/jsx-no-literals` in `Welcome.tsx` and unused vars in `game.test.ts`) |
| `npm run build` (Turbopack) | PASS |
| `npm run e2e -- --workers=2` | see section 10.3 |
| i18n key parity (en and fr) | 2575 keys each, equal sets |

**Gates recorded on `p4/d1` alone** (`p4-d1` worktree, head `3972eea`):

| Command | Result |
|---|---|
| `npx vitest run --maxWorkers=4` | 155 files passed, 1 skipped. 1599 tests passed, 115 skipped (the wait register) |
| `scripts/balance/company-tape.ts` at 20 seeds | 8 rows PASS: `co_determinism`, `co_ledger_balances`, `private_no_signals`, `signal_cadence`, `window_boundaries`, `plan_min_lead`, `ipo_float_bounds`, `signal_bias_correct`. 18 rows NOT RUN. Exit 0. |
| `npx next typegen`, `npx tsc --noEmit` | exit 0 (`75ca35b` message) |
| `npx eslint --max-warnings 0` on touched files | exit 0 (`75ca35b` message) |

**Gates recorded on `p4/d2` alone** (`p4-d2` worktree, head `e5486b7`):

| Command | Result |
|---|---|
| `npx vitest run --maxWorkers=4` | 153 files passed, 1 skipped. 1584 tests passed, 1 skipped, 21 todo (`d2-full-vitest`, 22:56). A later full run gave 1587 passed, 2 expected fail, 1 skipped, 21 todo. |
| `npx next typegen` | exit 0 |
| `npx tsc --noEmit` | no output in the log |
| `npx eslint` | no output in the log for the company work |

The `p4/d2` tsc and eslint logs record no errors. They are not counted as recorded exit codes. The merged `v1` run in this pass is the gate for both branches.

### 0.5 Open items

Owners are named as in the Phase 4 files. "Lead" is the lead for ruling and merge decisions.

| ID | Item | Owner |
|---|---|---|
| O-1 | Closed: `p4/ex` merged into `v1` (section 11). | done |
| O-2 | Rho checks (`rho_residual`, `rho_ev_robust`, `rho_by_spread`, `rho_engine`, `alt_prefiling_edge`, `signal_joint_v15`) are blocked. G22 is settled but the engine never computes the residual surprise `s` (`valuation.ts` has no caller), so rho cannot be measured. Also `engine-staging` is not merged. | Quant (residual `s`, probe), Forge (wire the caller) |
| O-3 | **Zero-sum defect (KNOWN DEFECT).** An ordinary stock has no counterparty account. A buy takes its notional and commission out of the world, and a sell mints its notional. Pinned as `it.fails` in `zerosum.test.ts`. Not fixed. | Ledger (ruling pending), Forge (fix) |
| O-4 | Underwriting fee base is the gross float value, including the NPC book's share. Spec 5.1 does not name the base. | Ledger (sign-off) |
| O-5 | Collusion graph for alt accounts is not in `src`. Only alliances define owner links (ruling 2). A founder-controlled account outside an alliance can subscribe to an IPO and trade outside the window. | Ledger (spec), Forge (anti-cheat, Phases 6 and 9) |
| O-6 | Five-year `run.ts` economy check for shops is still open. The stabilizer was rechecked on three 40-day seeds and never engaged. | Ledger |
| O-7 | Sign-off on B1 deviations 1 (sell cap scope) and 6 (default triggers stricter than spec 5). | Ledger |
| O-8 | Managed sits at 1.3 to 1.5 against S3's about 1.0. Options: restate S3 as an ungated reference; extend the full-income window to 24 days (an S4 change); or lower the star cost and re-hold excellent. | Lead |
| O-9 | Pool sale proceeds are misattributed to the pool account (B1 deviation 7). | Quant |
| O-10 | Company spec is still NOT FROZEN (G22 reading recorded in code). | Ledger |
| O-11 | Tape rows not built or not run: the bot harnesses (`cap_carry_edge`, `signal_postprint_drift`, `company_print_full_npc_untouched`, X6, X8, X10 rows), the E-UI rows (no Playwright specs for them), and the ABSENT features (credibility EWMA, other income, consolidation, `self_match`, forward cap, eslint canary, AD_GRANT cash). | Tape (rows), Quant (features), Velvet (E-UI) |
| O-12 | The sector shock is a world stream, not the engine's `sectorRng` (`sim.ts` owns `sectorRng`). Binding is not done. | Forge, Quant |
| O-13 | VCF advance: lead to confirm the manager's day-figure part (section 4.4). | Lead |
| O-14 | `insiderId` is not set on company assets (the company module does not set it; `funds/trade.ts` reads it). The insider seam is incomplete. | Forge |
| O-15 | Surveillance points from window abuse and plan abuse are not called by the company module (B2 gap: "for B1 to call"). | Forge |
| O-16 | Built in `p4/ui2` (section 12): the CEO change has its screen, with the days before confirming. Still open: NPC acquirer bids are an API, not scheduled. NPC CEO policy, dividends and covenants are not modelled in B2 (dividends and covenants exist in B1). | Quant (NPC policy) |
| O-17 | Built in `p4/ui2` (section 12): next-day-close staging of the Overview decision, the "was" tick, the next-gen launch and the Filings tab. Open for Velvet: copy sign-off on the new strings (en and fr). | Velvet (copy sign-off) |
| O-18 | Derivatives on the founder's company stock are not filed (B1 deviation 5). Revisit when listed options on company stocks exist. | Forge |
| O-19 | Plan verification not run in this pass: `scripts/ecology/gates.ts full`, `scripts/load/socket-load.mjs` (4,000 clients, tick p99 under 2.5 s), play-by-hand on desktop and phone in English and French, and the screenshot tour. | Lead |
| O-21 | Pre-existing lint warnings: 15 (`react/jsx-no-literals` in `Welcome.tsx`, unused vars in `game.test.ts`). Zero errors. | Velvet (copy keys), Forge (unused vars) |

The Phase 4 items above that are **Partial** or **Not built** are the ones that block closing the phase. Items O-1, O-3 and O-19 are the largest.

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

### 5.1 Checks at `ee80574` (re-measured on `f4a208c`, which changes docs only)

The section 5 table above is the stage A measurement at `3d43d22`. The checks below are the stage B gates at `ee80574`. The code is the same at `f4a208c`, because that commit touches only docs.

| Command | Result |
|---|---|
| `npx vitest run --maxWorkers=4` | 122 files, 1308 passed, 1 skipped (re-run 2026-10-10) |
| `npx playwright test --workers=1` (`E2E_PORT=3211 E2E_WORLD_PORT=8801 E2E_BUILD_CMD="npx next build --webpack"`) | Exit 1. 495 tests: 185 passed, 1 failed, 303 skipped (by project), 6 did not run (the close-card projects, which depend on the failed phone project). 15.9 min. The failure is in the phone project, see below. |
| `npx playwright test --workers=2` (run 2 of the stage B gate) | 192 passed, 0 failed, 303 skipped (13.2 min). This is the only full green run at `ee80574`. |
| `npx playwright test` with the default workers (8 on this host) | 83 passed, 77 failed, 58 skipped, 277 did not run. This run is not a gate: see the classification below. |

The one `--workers=1` failure: `tests/e2e/learning.spec.ts:7` on the phone project ("a closed trade lands in the journal as a row"). The Portfolio close button `close-HLCN` was covered by the day-close card (`data-testid="close-card"`, "THE PORT AVALON CLOSE", day 5). The test does not dismiss the card, so the click waited 60 s. The card opens when a game day closes during a test. This is a test-side gap, not a load flake, and it is not fixed here.

Classification of the default-workers run (the "load flakes" label in f4a208c is not a diagnosis):
- The run has 77 failed entries: 18 desktop, 12 desktop-1000, 10 desktop-1920, 12 desktop-900, 25 phone. f4a208c named eight desktop failures; the log has 77.
- The error lines in that run: 61 `worker process exited unexpectedly (code=3221225794)`, 9 `ENOSPC: no space left on device`, and 6 waits for `html[data-game=ready]` that timed out after 30 s (desktop and desktop-1920). Only the ENOSPC lines have a stated cause. The worker exits and the ready timeouts are not diagnosed.
- Matched against the `--workers=1` run, the 77 entries split into 35 passed, 41 skipped by design, and 1 failed (the phone learning test above). The 41 are project-gated: the shell specs call `onlyIn(...)` (`tests/e2e/shell/support.ts`), so a viewport they do not list is skipped, not run. Those entries are not evidence of a failure in that project.
- All eight tests named in f4a208c pass at `--workers=1` on the desktop project: screens "chat", research-desk "dom_no_trader_names", learning "at Operator the desk opens for a fee", shell focus "the state is kept per save", shell keys "AZERTY", shell deeplinks "@route_every_app", no-leak "L3 and L4", and ceremony "a drag in progress holds the ceremony back".

Disk: C: had 4.43 GB free before the `--workers=1` run, 3.8 GB at its lowest, and 4.4 GB after it. A reading of about 0.25 GB, which f4a208c's review mentions, is not in any log in this repo. Playwright writes `test-results/` (traces and screenshots on failure) and `playwright-report/`. Both are gitignored, and both still hold the artifacts of the runs above.

## 6. Open items

1. **Shops gates.** Resolved in stage B (2.2a): all three gated styles hold on every tier at 20 seeds (`npm run balance:shops`). Still open: the ladder against a flat lock (Mathis, `shops.md` 6.2), and the managed row, which is above S3's well-run payback (lead).
2. **Shops economy.** The stabilizer was rechecked on three 40-day seeds in stage B (2.2a) and never engaged. A five-year `run.ts` check is still open. Owner: Ledger.
3. **Company freeze.** The G22 reading is recorded in code. The spec is still NOT FROZEN. Owner: Ledger.
4. **Company engine wiring.** A2 wires filings and signals into the engine (`companyPrintShare`, G21) and binds the sector shock to `sectorRng`.
5. **VCF advance and the manager's day figures.** Resolved in stage B: the advance goes to the investors, not the fund, and sits outside their day and arrival figures (4.4). Owner: lead to confirm the day-figure part.
6. **Lever UI, refusal copy and the funds UI.** Stage C.
7. **Insider seam.** `insiderId` is not set by the company module yet.
8. **Managed against S3 (lead decision).** Managed sits at 1.3 to 1.5 against S3's about 1.0. The manager's star cost is one part and the S4 ramp against once-a-real-day presence is the rest (2.2a). Options: restate S3 as an ungated reference; extend the manager's full-income window to 24 days (an S4 change); or lower the star cost and re-hold excellent with another lever. Owner: lead.

## 7. B1: market path (`p4/b1`)

### 7.1 What is in

- IPO (`ipo.ts`): eligibility by tier and rank, the one-day book, the price at 0.9 x filed V, float 15 to 49%, at most 5% of the float per buyer with pro rata, the founder's and pool shares locked 168 gd, listing through `listCompanyStock`.
- Insiders (`insiders.ts`): roster, window F+2..F+21 per filing, the windowClosing warning at F+17, and the founder's next-day filing of stock trades.
- Programs (`programs.ts`): sell-only plans and buybacks as world commands on the engine's programs. The cancel route reports `planImmutable` and `buybackImmutable` through `cancelOrderResult`.
- Debt, covenants and guarantees (`debt.ts`), dividends (`payouts.ts`), and the public view (`views.ts`, no plan minimum price, no plan size).

### 7.2 Review fixes (`p4/b1`, the commit after `0ed0dcb`)

- **Founder sell cap (HIGH).** The engine tracks one cap per capped account and asset (`sellCaps`, `sold` in `restrictions.ts`). The fill loop in `trading.ts` clips window sells and plan fills to one room a game day. A plan sells first: the open plan quantity is reserved against the other sells. A plan day above the room is a `cap` skip (`planSkipped` reason `cap`), never a price hold. The world sets the cap at listing (2% of shares outstanding, founder only) and sets it once for older listed saves. Tests: `src/engine/sellCap.test.ts` and `src/world/company/b1review.test.ts`.
- **Private rounds (HIGH).** `raiseRound` refuses `roundAfterListing` and `roundDuringIpo`, with en and fr copy. Tests cover both, and that no shares move.
- **Underwriting fee (MEDIUM).** 5% of the gross float value is booked as a sink (`underwriting` line, `COMPANY.ipo.underwritingFee`). The total moves by the booked faucet less the sink.
- **NPC pool dividend (MEDIUM).** A dividend on the pool's shares is paid to the NPC investors in the cap table, pro rata to their shares. The pool keeps no cash of its own. Money is conserved.
- **Leverage (MEDIUM).** Covenant and buyback leverage use EBITDA annualized to four quarters (`annualEbitdaOf`). The dividend's FCF test stays TTM.
- **Cure rate and default (MEDIUM).** While a cure is open, the bank rate adds 0.05% a game day. A day's interest the cash cannot cover is a missed payment, so the company defaults and no money moves.
- **View day (LOW).** `publicCompanyView` requires `day`. Every caller passes it.
- **Founder window-close line (LOW).** On the close, the founder gets one line: how many orders were cancelled and the day the window reopens (`nextOpenDay`). Nothing is public.

### 7.3 Declared deviations and rulings (for lead or Ledger sign-off)

1. **Sell cap scope.** The cap covers the founder account only, not alts or the treasury. Forced liquidations (margin, squeeze) are broker trades and are not capped. The commit-time check is unchanged.
2. **Unallocated float is a booked faucet.** The NPC book pays for shares it takes up in an undersubscribed IPO as a booked faucet (`post(..., 'ipo', npcShares * P)`), as the B1 brief sets it. Undersubscription can therefore book faucet money up to the unallocated float's value. Sign-off needed, or the book pays from its own cash.
3. **Underwriting fee base.** The 5% fee applies to the gross float value, including the NPC book's share. Spec 5.1 does not name the base.
4. **Alts and the collusion graph (open).** `ownerSetOf`, the roster and the IPO exclusion use `linked()`, which is same-alliance only. No collusion graph exists in `src`. A founder-controlled account outside an alliance can subscribe to the IPO, and the window does not cover it. Spec 5.1 and 6.1 require the graph. Owner: Ledger.
5. **Derivatives on the founder's stock are not filed.** The engine refuses options on company stocks (`tradeOption`, hook 1), so no founder derivative trade can happen in v1. The filing for them is not wired. Revisit when listed options on company stocks exist.
6. **Default triggers.** Interest accrues daily, so cash below zero with a facility drawn always misses that day's interest. That default fires at once. The spec's five-day cash rule (§5) is therefore not a separate rule in B1, and it is stricter than the spec. Ledger to confirm.
7. **Pool sales proceeds (open).** When the NPC pool sells on its schedule, the proceeds stay in the pool account. Only dividends reach the investors. Money is conserved, but the investors' sale proceeds are misattributed. Owner: Quant.

### 7.4 Checks at the B1 review commit

| Command | Result |
|---|---|
| `npx next typegen` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=4` | 129 files, 1386 tests pass, 1 skipped |
| `npx eslint --max-warnings 0` (touched files) | exit 0 |

## 8. Merge of `p4/b1` (market path) and `p4/b2` (governance and failure) into v1

### 8.1 Merges

- `583f573`: `p4/b1` merged with `--no-ff`. No conflicts.
- `f981061`: `p4/b2` merged with `--no-ff`. Nine files conflicted (`src/content/company.ts`, `src/engine/index.ts`, `src/engine/restrictions.ts`, `src/world/company/{bridge,company,filings,types}.ts`, `src/world/game.ts`, `src/world/types.ts`). Both intents are kept: the union of commands, reject codes and copy, with `en.json` and `fr.json` key sets equal.
- `eb98e74`: the closed-trade journal e2e test dismisses the day-close card before its clicks (phone). No assertion changed.

### 8.2 Integration decisions

1. **Filed debt.** `balance.debt` is bank debt (B1) plus loans in from players (B2). `loansOut` is a receivable. Net debt everywhere (the private mark, the filed signals, buyback leverage, the covenant at filing and live) is `debt - (cash - relatedCash) - loansOut`. The public debt band includes loans in.
2. **Company books.** `post` lives in `books.ts` (B2). The B1 modules import it from there.
3. **Owner links are the alliances (ruling 2).** `syncAllianceLinks` rebuilds the world's `linked` map from the players' alliances on every company command and day step. A member who leaves an alliance leaves the owner set. B1's IPO exclusion, `allianceSetOf`, uses the same rule. The B2 test that linked an alt by hand now uses an alliance, since the sync is the V1 rule.
4. **Day step order.** B1 runs first (filings, IPO listing, debt, listed days, programs). B2 runs the bankruptcy delisting before the filings, then the takeover watch and the tape, then the insider backstop last.
5. **Listed records** carry `floatCap` (B1). The B2 fixtures set it.

### 8.3 Lead rulings (recorded)

1. **Unallocated IPO float is a booked faucet.** The float the NPC underwriter buys in an undersubscribed IPO is booked outside capital, like the NPC investor pools. Accepted. This is the B1 deviation 2 in 7.3.
2. **Owner links use alliances only in V1.** The collusion graph for alt accounts is not in `src`. It belongs to the anti-cheat work in the security phases (Phase 6 and 9). **Known limitation:** a founder-controlled account outside an alliance is not in the owner set. The IPO book, the insider window and the backstop treat it as an outside account, so it can subscribe to an IPO and trade the stock outside the window. This is the B1 deviation 4 in 7.3.
3. **Forced liquidation and squeeze buy-ins inside a closed window are allowed.** The insider does not choose them. Escrowed shares are excluded from collateral (`collateralEquityOf` in `trading.ts`: locked shares add no collateral).
4. **Extra reject codes accepted:** `tenderNoBidder`, `buybackBadSpec`, `roundAfterListing`, `roundDuringIpo`. `tenderNoBidder` is the engine's code for a tender with no bidder account. The world maps it to `takeoverNoBidder` for the screen. The other three have en and fr copy.

### 8.4 Checks at the merge

| Command | Result |
|---|---|
| `npx next typegen` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=4` | 137 files, 1477 tests pass, 1 skipped (after the CEO-freeze test moved its alt into an alliance) |
| `npx eslint src scripts server` | 0 errors, 15 warnings (the same pre-existing `react/jsx-no-literals` and unused-var warnings) |
| `npm run build` (Turbopack) | PASS |
| `npm run e2e -- --workers=2` | First full run: 184 passed, 303 skipped, 2 failed, 6 blocked. The 2 failures were the learning test on desktop and phone, fixed in `eb98e74` and the follow-up helper. The 6 blocked were the three `close-card` specs on the `close-card` and `close-card-phone` projects, which depend on `phone`. |
| `npm run e2e` re-checks | `learning.spec.ts`: 8 of 8 pass. The close-card projects, run with the dependency edge kept: 6 of 6 pass. Total: 192 passed, 303 skipped, 0 failed. |

The close-card re-check ran through a temporary Playwright config outside the repo (the full suite's dependency projects otherwise run too). It was removed and is not committed.

## 9. Company app, operations half (`p4/ops`)

Scope: the Company app shell (`src/components/apps/company/`) and the founder's operations views, per Velvet's spec
(`docs/team/specs/velvet-company-app.md` v1.5, corrected to Quant v1.7). Branch `p4/ops`, merged to `v1` at `a8ff5b9` (commits `b4b349e`, `83dc4d9`).

What is in:
- Shell: a rail of views (`company-rail`, a tab row on the phone), the "What the market sees" toggle (`company-view-toggle`),
  and the founding flow until the player has a company. The market side renders `CompanyPublic` only (`marketOf` in
  `model.ts`; the key table is checked against the type by `satisfies`).
- Founding (C4 template): name, sector, city and starting capital, at R2. The first-goals card reads `goalsDone`.
- Products and demand: price inside the engine's band, marketing, quality against the ready mark, share, the public rivals.
- R&D: running projects with the frozen odds (plus or minus 5 points) and the gain in quality-score points (bear, base, bull).
  One project at a time. Starting a project shows the frozen band only after it starts, not as a preview.
- People: headcount by role with the cap, hire and let go, and the four executive seats (trait, holder, salary, term).
- Deals: franchising (4 to 8% royalty, at most three per sector) and supply deals with a registered company.
- Notices: CEO change, freeze, cooling-off, distress, bankruptcy and the personal guarantee amount.
- Every refusal is inline with its code (`company-refusal`, `data-code`), copy from `company.refusal.<code>.{what,why,do}`.
- Import boundary (C6): `src/components/apps/company/boundary.test.ts` (TypeScript compiler API) fails on any named import or
  re-export of `CompanyFounderView`, `founderCompanyView` or `ownCompanyView` outside `src/world/**` and the Company app.
  The world layer builds the view for its owner (`PlayerView.company`); no screen outside the Company app names it.
- `CapitalTab.tsx` is a placeholder with the agreed props `{ companyId: string }` for the capital work.
- Exchange was made visible in this branch. Commit `347c4d2` hid it again (C-38) because `p4/ex` was not merged; see 0.3.
  Launchpad stays hidden until Phase 5.

Fix pass on the review (same branch):
- Overview: the decision card (the first product's quality project at three S_ref levels, with odds, gain, runway before and
  after, and the clock line), the runway chart (payroll-only cash as now, against the chosen decision), and the five-step
  checklist (a guide, folded to one line when done). The numbers come from `src/world/company/preview.ts` (pure).
- R&D: the odds of each pharma gate, the patents in force (`product.patents`, active only), and a second start is sent to the
  engine and refused as `projectBusy` (the button is no longer disabled).
- People: the G&A span line (`gaSpan`), and an executive's severance (`severanceOf`, 21 gd of salary) shown before the firing,
  which asks a second click (`ConfirmButton`).
- Market side: every `CompanyPublic` field has its section (registry, listed, balance, filings, signals, insider trades,
  buybacks, plan skips and ends, distress, covenant, credibility).
- Rulings: NPC rival shares stay private (Velvet: the public competitors table is all a founder can know about rivals; the
  per-product share is private). The rivals table shows names and prices. The import boundary now allows exactly the Company
  app, `world/company/views.ts`, `world/company/index.ts`, `world/view.ts` (the transport of the owner's own view, a lead ruling)
  and world tests; `boundary.test.ts` also catches namespace access, `typeof`, star and dynamic imports.
- The founding capital input is `company-found-capital` (it collided with the Capital tab root `company-capital`).
- Exchange: the brief asked for it visible, but C-38 holds instead (hidden until p4-ex lands, commit `347c4d2`, see 0.3).

Still open: the Overview decision is applied at once through the engine's `startProject` (Velvet asks for the next-day-close
staging, which the engine does not have yet); the "was" tick on the slider; the CEO change action (only the notices); the
launch of next-gen products (the founder view does not carry the launch credits yet); the capital tab (loans, dividends,
buybacks, the IPO, the trading plan) and the Filings view.

## 10. Merge of `p4/d1` and `p4/d2` into v1, gates, and the e2e fix

### 10.1 Merges

- `908c615`: `p4/d1` (heads `d4bf1ce`, `75ca35b`, `3972eea`) merged `--no-ff`. No conflicts. Brings `scripts/balance/company-tape.ts`, the suites in `src/world/company/tape/`, `wait-register.test.ts`, and the dividend clawback fix in `3972eea` (a dividend paid to a player is now a covered payout, so the 63-gd clawback can reach it).
- `c04504b`: `p4/d2` (head `e5486b7`) merged `--no-ff`. No conflicts. Brings the X-series suites, the invariants property test, the zero-sum test, and three fixes with regression tests: X3 (a capital or round above `MAX_MONEY` is refused), X5 (a short holder owes the dividend on its short), X11 (company stock fills run against the NPC book, and a missing book fills nothing).
- `p4/ex` not merged. Its worktree `p4-ex` has uncommitted `docs/V1-PHASE4.md` work, so the branch was skipped under the merge rule. Its six committed commits (head `636d9a1`) stay on the branch. See O-1.
- Neither merged branch had uncommitted work at merge time.

### 10.2 Tape company checks (`p4/d1`)

Script run at 20 seeds (`scripts/balance/company-tape.ts`, the `p4-d1` run, head `3972eea`): 8 rows PASS, exit 0. The rows that pass are `co_determinism`, `co_ledger_balances`, `private_no_signals`, `signal_cadence`, `window_boundaries`, `plan_min_lead`, `ipo_float_bounds`, `signal_bias_correct`.

The script does not run 18 rows (it prints them as NOT RUN): `cap_carry_edge`, `signal_postprint_drift`, `alt_prefiling_edge`, `reanchor_public_edge`, `signal_joint_v15`, `signal_noise_reversion`, `rho_residual`, `rho_ev_robust`, `rho_by_spread`, `rho_engine`, `overflow_not_booked`, `hiring_full_print`, `revenue_noise_quarterly`, `filing_tick_order`, `company_print_full_npc_untouched`, `honest_cancel_no_charge`, `signal_fake_ev`, `backlog_repay_outside_covered`. Each of these names appears in a Vitest suite under `src/world/company/tape/`, or in `blocked.test.ts`. Rows that cannot run are skipped and tagged in `wait-register.test.ts`. Tags: WAIT-INSTR, WAIT-DEFERRED, WAIT-PENDING, BLK-G22, BLK-LEDGER, ABSENT, E-UI, EN, B-HARNESS, U-TODO, L-TODO, N/A. A skipped row is not counted as a pass.

Tape found and fixed one defect: the dividend clawback (`3972eea`). Quant v1.7 corrections recorded in `75ca35b`: the G21 unit check reads `companyPrintShare` and requires it to be exactly 1; the salary cap floor of $50 binds below $1.26M TTM revenue (not $126k).

Vitest at the `p4-d1` head: 155 files passed, 1 skipped, 1599 tests passed, 115 skipped (the wait register). `npx next typegen` and `npx tsc --noEmit` exit 0. `eslint --max-warnings 0` on the touched files exit 0.

### 10.3 Exploit suites (`p4/d2`)

- X-series suites `X1` to `X15` run here, with their ids in the test names. The rows that need bots or pump probes are `it.todo` in `src/world/company/exploits/blocked.test.ts`, with the reason for each: X1, X2 (parts), X6, X8 and X10 (bot harness absent, or deferred to M30), `rho_*` and `alt_prefiling_edge` (G22 and probe absent), `cap_carry_edge` (bot harness absent; the trade-count guard in `trade-guard.ts` is unit-tested and applied to no bot yet), `signal_postprint_drift` and `company_print_full_npc_untouched` (engine-staging not merged).
- `invariants.property.test.ts`: seeded random company sequences (2000 runs of 30 steps, 50 exact replays). Checks invariants 1, 2, 3, 4, 6, 18, 19 and 23 directly. Invariant 1 covers company stock only. Invariants 5, 14 and 22 have no passing check (5 is `it.todo` as `agm_sign_test`, with no AGM in v1).
- `zerosum.test.ts`: per-day world zero-sum for a listed company, to the cent. **KNOWN DEFECT, not fixed:** an ordinary stock has no counterparty account, so a buy takes its notional and commission out of the world and a sell mints its notional. Pinned as `it.fails` and as an exclusion for buy and sell. Ledger ruling pending (O-3).
- `d2` gate logs: vitest 153 files passed, 1 skipped (1584 tests passed at 22:56; a later full run gave 1587 passed, 2 expected fail, 1 skipped, 21 todo). `npx next typegen` exit 0.

### 10.4 Gates on the merged v1 and the e2e fix

Gate table for the merged v1 is in section 0.4. The e2e run needed one fix.

- **E2E run 1** (`npm run e2e -- --workers=2`, `test-results` cleaned first): 210 passed, 1 failed, 303 skipped, 3 did not run (11.0 min). The failure is `tests/e2e/shops.spec.ts`, "a lever shows at once, a price waits for the next game day, and a second price change that day is refused", on the `close-card-phone` project. A game day ended during the test on its own, and the day-close card (`close-card`) opened over the Shops tab. The tab click waited 60 s for the card to leave. The 3 "did not run" are the close-card specs, which depend on the phone project.
- **Fix** (test side; no product change): `dismissCloseCard(page)` is called before the `tab-shops` click in that test. The helper was already in `tests/e2e/helpers.ts` and the import already in `shops.spec.ts`, from `b670616`. Commit: see the git log for `test(e2e): clear the day-close card before the Shops tab click`.
- **E2E run 2** (after the fix, `test-results` cleaned first): 213 passed, 304 skipped, 0 failed, 0 did not run, exit 0 (9.9 min). The skipped entries are project-gated (`onlyIn` in `tests/e2e/shell/support.ts`), as in earlier phases. 213 + 304 = 517, the full Playwright count.

The gate for this pass is the run 2 result.

### 10.5 What this pass did not check

Plan verification items not run here: `scripts/ecology/gates.ts full`, `scripts/load/socket-load.mjs`, play-by-hand on desktop and phone in English and French, and the screenshot tour. These are O-19 in section 0.5.

## 11. The Exchange app (`p4/ex`)

The Quay app `exchange` is visible from Phase 4 (`src/shell/apps.ts`: `available: true`, on the shelf after Portfolio). Launchpad stays hidden until Phase 5. A deep link to `/exchange` opens the window (no "Coming later" notice).

### 11.1 What is in

- **Player stocks** (`StocksTab.tsx`): every listed player company, from `publicCompanyView` only (`CompanyPublic`). Each row shows the window state, the trailing filed revenue band (late companies), the last five weekly signals, the last four filings with their income, balance and cash-flow lines, the founder's filed trades, the sell plans and their skips (day and reason; no minimum price), buyback programs, the takeover line and the backstop note. Trade opens the Broker on the ticker.
- **IPO books** (`IposTab.tsx`): the books open today, with price, float, shares offered, the 5% cap per buyer, and the listing day. Subscribe sends `company.ipoOrder`. The form refuses an order above the viewer's room under the cap (`exchange.ipo.overCap`, three parts) before anything is sent, and shows the room left. A blocked account sees the owner-set or the 7-game-day reason in three parts (`company.refusal.*`). The book's other orders are never shown: the view carries only the viewer's own subscription.
- **Player-run funds** (`FundsTab.tsx`): the open funds (`publicFunds`), with mandate, fees, NAV history, AUM bucket and public filings. The investor list and other holders' units are never in the view. Invest (`fund.deposit`) and redeem (`fund.redeem`) show the early-exit fee and the 25% limit before the player sends, and refusals inline in three parts (`funds.refusal.<code>.what/why/do`).
- **Trading as the fund** (`src/components/apps/broker/OrderTicket.tsx`): a manager's Broker ticket has a "Trade as" selector (me or the fund). In fund mode the ticket checks the fund's cash, position and mandate class, sends `fund.trade` through the fund account (market or limit only), and shows a fund refusal inline in three parts. The selector is absent for everyone else.
- **Holdings** (`HoldingsTab.tsx`): the viewer's own units, what waits for a redemption, what is owed, the early-exit window, and any front-running case.
- **Manager console** (`ManageTab.tsx`): open a fund (`fund.create`, Operator rank, 14 game days, $250k stake, mandate and fees), then the console of the fund: notices (freeze with the wind-down day, breaker, a pending mandate with its remaining time, a front-running case, a verdict), the NAV, the cash and positions, the stake floor and AUM cap, fees accrued and crystallized, a trade ticket through the fund account (`fund.trade`, market or limit, inside the mandate), and the mandate change (`fund.mandate`, 24 real hours of notice).

### 11.2 Views and copy

- `src/world/exchange/view.ts` builds `ExchangeView`, carried in `PlayerView.exchange`. Every number is computed here; the screens format them. Tests: `src/world/exchange/view.test.ts` (13 cases: the public-only shape, the IPO exclusions and room under the cap, holdings, the console and its filing days, the mandate notice, the fee and day helpers).
- Copy: `src/components/apps/exchange/copy.ts`, tested by `copy.test.ts` (every key a helper can return exists in en and fr). The 28 fund refusals moved from one line to `.what / .why / .do` in en and fr, and `funds.test.ts` checks the three parts.
- All strings use `exchange.*` keys (en and fr, same key set). `react/jsx-no-literals` is clean on the touched files.

### 11.3 Deviations (for lead or Quant)

1. **Consensus is not shown.** Quant v1.7 §11 `CompanyPublic` has no consensus field (the NPC consensus is an engine estimate). The Exchange shows the public signals instead.
2. **The IPO 5% cap is enforced in the form, not in the world.** `company.ipoOrder` accepts an order above the cap and `allocateIpo` cuts it at allocation (N8, `ipo.test.ts` "ipo-cap"). The Exchange refuses it before sending, so a player never meets the silent cut. A direct command over the cap is still accepted by the world. Owner: Quant to decide whether the world should refuse it too.
3. **Takeover status has no public field.** `CompanyPublic` carries no takeover state, and a tender settles in one step, so the Exchange says so ("Takeover bids settle in one step: no offer stays open to watch."). A public history of tenders would need a view field. Owner: Quant (view) and Forge.
4. **Velvet spec corrected to Quant v1.7** (`docs/team/specs/velvet-company-app.md` v1.5, DECISIONS C5): the clawback box, the public plan row without the minimum price, the Late-tier index clause, the insider filing instrument, and the IPO can't-buy rule.

### 11.4 e2e

`tests/e2e/exchangeFunds.spec.ts` runs two flows: the manager's fund create and, from the Broker, a market buy through the fund account (the "Trade as" selector); and an investor's flow where a manager opens a fund, an investor (registered first, aged 7 real days by the admin advance) deposits, sees the holding, redeems (the early-exit notice shows), and is paid at the next day close. The spec matches the time-advancing pattern, so `playwright.config.ts` runs it in the close-card projects (`CLOSE_SPECS` now also matches `exchangeFunds.spec.ts`).

`tests/e2e/exchangeIpo.spec.ts` covers the IPO path: a founder requests an IPO on the Capital tab, an investor sees the book, a subscription above the 5% room is refused in the form before it is sent, a subscription within the cap is sent and shown as the viewer's own order, and after a game day the allocation is in the investor's account and the company is in the Stocks tab. The founder's filed history is set by the admin seam `admin.ipoReady` (`POST /api/admin/ipo-ready`, `makeIpoReady` in `helpers.ts`): three padded filed quarters and a filed value at the $50M minimum. Every other IPO rule, the request, the book and the listing are the world's own. The seam is tested in `src/world/company/ipo.test.ts`. The filed history cannot be reached by advancing the world in a test run (three quarters are about 190 game days).

`tests/e2e/exchangeLayout.spec.ts` checks the Exchange at its declared minimum window (420 x 300) on every tab: no sideways scroll, no stat figure split across lines, and every `.num` in the view (not only the stats) free of ellipsis and of overflow past its box. The manager's console in `exchangeFunds.spec.ts` is checked at the same size.

### 11.5 Shop figures and the daily-close cost

- Figures never truncate. `Stat` (`ui.tsx`) keeps the app-wide `truncate` for the other apps, as in v1; a new `figure` prop makes the value one unbreakable line. The Exchange's stat row and its `Fact` cells use the same rule (`Fact` is nowrap by default; `prose` wraps at spaces for the band and bucket words), and the Exchange's four-column grids start at `@xl` so each cell holds a long figure. The Businesses shop card (`ShopCard.tsx`) passes `figure` to its four stats and steps its grid down to one column before a cell is too narrow (two columns from 22rem, four from 40rem). `shops.spec.ts` asserts one line per figure (the text's client rects) and no overflow, at the minimum window and in the window the player opens. Other apps' stats still truncate with an ellipsis (v1 behaviour, not changed here).
- The per-view cost. `playerView` was slow and grew with the number of game days played, up to ten (the daily-close lines). The cause was `usd()` in `src/world/text/template.ts`, which called `toLocaleString` (about 28 us a call) about fifty times per view. The Exchange is not the cause: `exchangeView` measured 0.006 to 0.08 ms per player with and without a listing. The formatter is now cached (about 1.2 us a call, the same text, pinned by `template.test.ts`). A view costs 0.2 to 0.4 ms at ticks 2.9k to 23k, flat after the tenth day. With a listed company, a 20k-tick advance measured 0.3 ms a tick in the step and 0.4 to 0.7 ms a view.
- The cause predates the Exchange (`usd` came in with p3 a2, `65ac2bd`). The 108 ms a tick in the earlier probe was not reproduced: the probe world had no listing, and the step plus the views came to well under 2 ms a tick here.

### 11.6 E2E build note

The default E2E build (`npm run build`, Turbopack) fails in a git worktree with "Symlink node_modules could not be resolved", because `node_modules` is a junction there. Run the specs with `E2E_BUILD_CMD="npx next build --webpack"`. This is a worktree setup issue, not a code defect.

### 11.7 A company listing reaches the client's config

The IPO e2e found a real bug, present on this branch since the company engine hooks (A2): a company's listing did not move the list version (`market.listings.seq`), so a client never received the new asset's definition. The client's config then had one asset fewer than the frame, the mirror truncated the frame to the config, and a holding in the new stock read past the end of the mirror's asset array (`priceAt` threw, and the shell showed "This page couldn't load"). The fix is in the engine: `appendAsset` and `replaceDef` (a delisting) bump `listings.seq` through `bumpListVersion` (`src/engine/listings.ts`). `listingsDay` assigns its own sequence at the end of the day, so the NPC listings roll and their version are unchanged. The regression test is `src/world/company/ipo.test.ts` ("the list version follows a company listing"): the version moves, the frame of that tick carries the defs, and a client mirror has every asset.

### 11.8 E2E run order and registrations

- The time-advancing specs (closeCard, shops, exchangeFunds, exchangeIpo) now run one at a time: `playwright.config.ts` chains them, each project depending on the one before (desktop, then phone). With `--workers=2`, one project ran two of them in parallel, and their day advances collided in the shared world.
- The e2e world's `REGISTER_LIMIT` is 2,000 accounts per IP per hour (it was 500). The full suite registers more than 500 from localhost in one run, and the register then stalled on the welcome screen. A failed desktop project also stops its dependent close projects from running, so one stall hid three of them.

## 12. Company app, O-16 and O-17 (`p4/ui2`)

Scope: the four items of O-17 and O-16 (section 0.5): the Overview decision staged for the next close, the "was" tick, the next-gen launch, the Filings tab, and the CEO change. Velvet's spec is `docs/team/specs/velvet-company-app.md` (section 5 for staging).

What is in:
- **Staging (O-17).** Actions `stageProject` and `cancelStaged` (`company.ts`). A stage is checked at once with the start checks (`unknownProduct`, `negativeAmount`, `noRdStaff`, `projectBusy`, `insufficientFunds`). It is kept as `Company.staged` (one decision: a second confirm the same day replaces it). The close applies it in `companyTick`, before the company's day step of the closing day, through the same start function as the R&D tab. A refusal at the close drops it, and the event `staged` (status `dropped`, with the code) becomes a founder note. The R&D tab's start stays immediate. The fields are optional, so an old save loads with nothing staged.
- **"Was" tick.** `Company.inForce` holds the quality spend last started or applied per product. The Overview marks the level whose spend is in force ("Mid · was") and reads "Was $X", or "Nothing in force yet".
- **Lines.** "Applies at the close of Day N. You can change it until then." and the staged value with a cancel action. The confirm reads "Confirm for the Day N close".
- **Launch (O-17).** The founder view carries `launchCredits` (generation, quality score, ready). The R&D tab shows the first credit: at the ready mark (score 55 or more) it opens the launch form (name, price). Below it, the score and the mark only. The refusals are the engine's existing ones (`noLaunchCredit`, `productCap`, `priceOutOfBand`), copied in three parts. The ready mark is a screen threshold. The engine does not gate the launch on it, because the tape guard `quality_score_display_only` forbids reading the displayed score in `company.ts`.
- **Filings (O-17).** A `filings` tab for the founder: each filed quarter (newest first) with its income, balance sheet and cash flow lines, its filed day and its period close, and the next filing day (`nextFilingDay`: the public schedule, the next close plus the filing lag, never the unfiled quarter). Seed and Growth see the registry line and no statements. Figures are stacked `Stat` figures (the `figure` prop), so none truncates or splits at 390. The Exchange's filing rows are inline JSX in `StocksTab.tsx`, not a component, so they are not reused here (a refactor, not done).
- **CEO change (O-16).** A CEO section on People. Before the founder confirms, it shows the days: the announcement today, the change effective ten game days later, the freeze of the departing CEO's accounts to the end of the exit freeze (A..A+31), and the ex-CEO's cooling (252 game days from the effective day). The successor is an outside executive (an NPC). The engine accepts a player holder too, and the UI does not offer it. A confirm is a second click. The refusals are the engine's existing ones (`ceoChangePending`, `exCeoCooling`, `boardRejected`, `notController`, `companyBankrupt`).
- Copy: 65 new keys, the same set in en and fr. The Overview confirm key changed its value (it now carries the day).

Checks (this pass, worktree `p4-ui2`):
- `src/world/company/staging.test.ts` (new): 11 tests for staging (replace, cancel, drop at the close, apply before the day step), the launch credit, the next filing day and the CEO plan.
- `src/components/apps/company/Filings.test.tsx` (new): 3 render tests (the empty Filings, two filed quarters with 34 whole figures, the launch states).
- `company.spec.ts`: the busy-project test is rewritten for staging (the R&D start, then the Overview refusal at once). New: staging, the next-gen launch, Filings and CEO flows.
- `companyUi2.spec.ts` (new): fit at the minimum window and at 390 (no sideways scroll, no truncated or split figure in the new blocks). Screenshots of each new block, en and fr, desktop and phone, when `P4UI2_SHOTS` is set.
- Gates: `npx tsc --noEmit` exit 0 (after `npx next typegen`); the full `vitest` run passes (1746 passed, 2 expected fail); `eslint` on the touched files, 0 errors. E2E: `company.spec.ts` and `companyUi2.spec.ts` on both projects, 24 passed (on ports 3212 and 8809, because another session held 3200 and 8797).
- Screenshots: 16 PNGs in the scratchpad `shots-p4ui2` (`en` and `fr`, `desktop` and `phone`; the staged decision, the next-gen launch, the Filings list and the CEO change, each shot on its own).

Not done, and why:
- The Filings view is not shown with a filed quarter in e2e: a quarter needs game days to pass, and the shared e2e world does not advance in this spec. The component test covers the filed view with a constructed filing.
- The staged decision is not shown applied in e2e (it applies at a real close). The engine test covers the close, and the e2e covers the stage and cancel.
- A ready next-gen launch is not in e2e (it needs a next-gen success). The component test covers the ready and waiting states.
