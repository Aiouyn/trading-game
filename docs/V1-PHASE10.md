# V1 Phase 10: the realism pass

Binding rulings: `docs/team/specs/lead-phase10.md` (R-10-1 to R-10-7). The evaluation that raised them: `docs/V1-EVALUATION.md`.
This file records the track that owns R-10-7 (the realism fixes outside trading and the Launchpad).

## 10D. Realism fixes elsewhere (R-10-7, branch `p10/fix`)

### 10D.0 Status

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Returns: day change and "since you arrived" on one basis | done (the close and the day record in `92463ab`; the arrival base in this track) | `src/world/close.ts`, `src/world/ledger.ts`, `src/world/view.ts`, `src/world/rivalsBoard.ts` |
| 2 | Legal: fee, counsel and total on separate lines; no negative cash; File disabled below the evidence minimum with the reason | done | `src/world/court.ts`, `src/world/view.ts` (`filing`), `src/components/apps/legal/LegalApp.tsx`, `src/world/court-filing.test.ts` |
| 3 | Company: receivables by product type; the "receivables build-up" ledger line | partly: consumer 1 day and the ledger line are done; B2B held at 10 days (the spec's 30 is not applied, 10D.2 item 4) | `src/content/company.ts`, `src/world/company/company.ts`, `src/components/apps/company/labels.ts`, `src/components/apps/company/Overview.tsx`, `src/world/company/receivables.test.ts` |
| 4 | French: rank and licence names, number formats in generated text, English-leak audits | done (the `os/OsUpdate.tsx` hunk is a deviation, 10D.4) | `src/i18n/fr-realism.test.ts`, `src/i18n/fr-screens.test.ts`, `src/world/text/roles.ts`, `src/i18n/tokens.ts`, `src/i18n/en.json`, `src/i18n/fr.json` |
| 5 | Rivals: a ladder of fictional rival funds per rank band | done | `src/content/rivalLadder.ts`, `src/world/rivalLadder.ts`, `src/world/rivalLadder.test.ts`, `src/world/rivalsBoard.ts`, `src/components/apps/broker/RivalsCard.tsx` |
| 6 | Auctions: lots drawn per rank band; a minimum rank per lot | done | `src/world/auctions.ts`, `src/world/auction-bands.test.ts`, `src/components/apps/sixd/AuctionsPanel.tsx` |
| 7 | Research Desk: a monthly subscription with a one-week trial | done (the `os/ResearchDesk.tsx` hunk is a deviation, 10D.4) | `src/content/learning.ts`, `src/world/work.ts`, `src/world/work.test.ts`, `src/components/os/ResearchDesk.tsx` |
| 8 | Wire: no verbatim CEO quote reused across two firms in a week | done | `src/world/text/roles.ts`, `src/world/text/exec-distinct.test.ts`, `src/world/news.ts` |

### 10D.1 Rulings made in this track

- **Returns basis (one basis).** The day record keeps the mid total (`p.netWorth`, the header's and the Portfolio's figure).
  The liquidation mark (`markNetWorth`) stays the rank basis only (peak, rank, rank-up checks). Before this change the day close
  read the mark and the header read the mid total: a probe with $500k in HLCN gave -0.815% on the close and -0.797% on the header
  the same day (a $93.54 gap, the exit haircut). A world with no open positions keeps the same figure on both bases.
- **Day base.** The day change is against the prior close's equity plus the external cash in during the day
  (`nwBase = nwOpen + extDay` in `close.ts`). Ruling: when no cash comes in during the day the base is exactly the prior close's
  equity. With a mid-day grant the base includes the grant, because a base without it would show the gains on that grant as a
  percentage of money the player never held (a $5,000 grant on a $5,250 book would turn a $100 gain into a 1.9% gain). This is the
  time-weighted form a broker uses for a deposit. `returns-basis.test.ts` pins it.
- **Status strip (UX fork; read only here).** `NetWorthFigures.tsx` computes `todayPct = (nw - dayStart.netWorth) /
  dayStart.netWorth` with `nw` the mid total. That is the same base the close now uses, because `dayStart.netWorth` is the prior
  close's mid total and moves with external cash (`core.ts` `shiftBaselines`). The formula needs no change; the strip must keep
  reading `dayStart.netWorth` and must not substitute the liquidation mark.
- **Arrival base.** "Since you arrived" is a percentage of net invested capital: the starting cash plus the external cash, both
  sides (`arrival.invested`). The onboarding grant is external, so it is part of the base.
- **Rivals since start.** The board's "since start" for the player is the arrival change (the Portfolio's figure), not the net
  worth over the starting cash. The old base read a grant as gain.
- **Receivables.** `SectorEcon.receivableDays`: discretionary (consumer goods, paid by card) 1 day; the B2B sectors (software,
  pharma, food, industrial, security) keep 10 days for now (10D.2 item 4). The day's sales book in full as `sales`; the change in
  the receivable balance is its own line, `receivables build-up`, so a first sale never reads as a sales outflow.
- **Legal bar.** A filing needs half the claim's bar (20 evidence points; 27.5 for a model theft). The view carries the count per
  defendant per claim kind (`view.filing`), so the app blocks File with the same numbers the engine uses. No reason is shown until a
  defendant is chosen (a reason that names nobody is a bug).
- **Auction bands.** Lots are drawn from three bands by item rank (R0-R1, R2-R3, R4-R6), one lot per band first, then round the
  bands again. The lot's minimum rank is its item's rank; the bid refusal already checked it.
- **Rival ladder.** Six fictional funds per rank band, anchored geometrically between the band's rank threshold and the next (the
  floor is $500, the ceiling $500B). Each fund's path is a mean-reverting log walk (theta 0.02, sigma 0.012 a game day), drawn from
  a stream keyed by the world seed and the fund's id. The paths are pure reads: nothing in the engine, the accounts or the ledger
  moves on their account. The board ranks the player among all rivals (engine and ladder) and shows the engine's three plus the
  four ladder funds above and the four below the player.
- **Wire quotes.** A firm moves past a CEO quote another firm was given in the same real week (`REAL_WEEK`). When every quote of
  that tone is already out that week, the print carries the neutral line `txt.exec.none` (no quote), so no quote is ever repeated.
  The check reads the earnings lines already on the wire, so no new state is stored.
- **Wire moves.** The end-of-event move is a `#mpct` token: en keeps the wire's "−3.5%" (one decimal, true minus sign), fr prints
  "−3,5 %". The rival voice's percentage is a `#pct` token too.
- **Research Desk economics.** `DESK = { minRank: 'R3', monthlyFee: 20_000, trialDays: 7, periodDays: 30, filesKeep: 40 }`. The
  trial is free and charges nothing at unlock; the first fee falls due at the trial's end; a month that cannot be paid locks the
  desk and keeps the files. The fee is about four weeks of the old weekly upkeep (5,000); the $50,000 set-up fee is gone.
- **French audit.** `fr-realism.test.ts` fails on an English rank or licence name, or a decimal point between digits, in any French
  value, and checks the generated rank-up, licence, wire and since-arrival text. `fr-screens.test.ts` fails on a component that
  reads a rank or licence name straight from the content tables or the view (`RANKS[..].name`, `LICENSES[..].name`, `next.name`,
  `rank.name`). Its pattern has positive and negative controls, so a pattern that goes blind fails the audit itself.

### 10D.2 Residuals and open items

1. **Engine rivals keep their own persona lines.** The three engine funds keep the named voices (`txt.rival.hale|pinn|vetch`);
   ladder funds share a generic voice (`txt.rival.fund.*`, eight variants each way).
2. **Status strip rank.** `StatusStrip.tsx` prints the rank ordinal (`rankOrdinal`), not the rank name, so the French audit does not
   need it. Not edited (UX fork).
3. **Company receivables.** Consumer goods now settle in one day; the B2B sectors are unchanged at 10 days.
4. **B2B receivables at 30 days (spec R-10-7) are not applied.** Tried in this track: `receivableDays: 30` for tech, pharma, food,
   industrial and security moves 13 company tests (`company.test.ts`, `ipo.test.ts`, `debt.test.ts`, `funding.test.ts`,
   `commerce.test.ts`, `b1review.test.ts`, `rho.test.ts`, `determinism.test.ts`, `exploits/x-series.test.ts`, `receivables.test.ts`).
   The first days' receivable build drains the founding cash, so IPO allocation, pool proceeds, the debt cure and a plant build all
   change, and the same-seed determinism test ran past its time limit. Applying the 30 days needs a founding-capital ruling and a
   fixture pass on those tests. Until the lead rules, the B2B sectors stay at 10.
5. **Rivals and the ecology gates.** The ladder funds are pure reads with no engine state, so the ecology, clip and wealth gates are
   not moved by this track. They were not re-run beyond the full vitest run.
6. **Screens.** The R-10-7 views are shot by `tests/e2e/p10Fix.spec.ts` (desk, rivals board, portfolio, legal, auctions; en and fr).

### 10D.3 Gates

- `npx next typegen` and `npx tsc --noEmit`: exit 0.
- `npx eslint` on the 39 touched source files: 0 errors.
- `npx vitest run --maxWorkers=3`, full suite on the tree before the audit fix: 2,671 passed, 4 expected-fail, 70 skipped, 20 todo.
  The one failure was the French screens audit; the BankApp line was a false positive in its pattern. The pattern is tightened and
  carries controls; `src/i18n` then runs 7 files and 28 tests, all passing.
- Determinism: the engine is untouched (`git diff a38fbb6 -- src/engine` lists no files), so the engine sim output is unchanged by
  construction. The same-seed world tests (`src/world/company/determinism.test.ts` and the rest) pass. The world-state changes are
  intended and limited to the features they touch: the auction lot draw, the desk billing, the company working capital, and the
  wire quote keys when two firms would share one.
- Screens: see 10D.5.

### 10D.4 Deviations from the file ownership rules (reasoned)

The brief keeps `src/components/os/*` and the shell with the UX fork. Two edits in that area are needed for the world changes to
compile and for the French audit to pass. Each is a few lines and can be dropped at merge time if the UX fork takes these hunks:

- `src/components/os/ResearchDesk.tsx`: the copy reads `DESK.monthlyFee` and `DESK.trialDays` instead of the removed `unlockCost`
  and `weeklyUpkeep`. Without it `tsc` fails, and the desk would show the removed $50,000 fee (item 7).
- `src/components/os/OsUpdate.tsx`: the rank-up ceremony names ranks through `t(\`rank.${id}\`)` instead of `RANKS[].name` (item 4).
  Without it the French ceremony shows English rank names, and the screens audit fails.

Nothing else under `src/shell`, `src/components/os`, `StatusStrip`, `NetWorthFigures`, `BrokerApp.tsx` or `TerminalLayout.tsx` is
edited. `NetWorthFigures.tsx` and `StatusStrip.tsx` are read only (10D.1 and 10D.2).

### 10D.5 Screens

Pending: the Playwright run of `tests/e2e/p10Fix.spec.ts` at 1440x900 and 390x844, en and fr, into
`scratchpad/p10/shots-p10-fix/`. This section is filled from that run.
