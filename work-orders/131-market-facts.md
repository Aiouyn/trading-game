# Work order 131: market facts a trader can audit

Read `AGENTS.md`, `sim/README.md`, `sim/modules/markets/` (`index.ts`, `minutes.ts`, `bars.ts`, `noise.ts`), `sim/modules/bonds/`, `sim/modules/commodities/`, `sim/modules/options/`, the FX module (find it), the quote, order and `/view` code in `sim/server.ts`, and `sim/modules/media/paper.ts` around line 123. Audits of build cb828c8: `C:/Users/Mathis/Downloads/Port Avalon Market Launchpad and Interface Audit.pdf` (E01–E03, D01–D03) and `Port Avalon Playtest and Simulation Audit.pdf` (M01–M03, C03, F01, F03). Text copies: `D:/tg-work/audits/*.txt`.

You own `sim/modules/markets/`, `bonds/`, `commodities/`, `options/` and the FX module, plus the quote, valuation and order-lifecycle parts of `sim/server.ts`. Order 132 builds the screens on your work, so name new `/view` fields plainly in your summary. Orders 134 and 135 run at the same time; keep both sides on any rebase conflict.

## Why

The audit's top finding is that marks and executable prices are mixed up:
- **Zero-volume cliffs.**
  - The bank went from $17.32 to $324.77 (+1,775%) on day 270 with zero shares traded, in two of three seeds.
  - On day 150, Civitas jumped +200% and Cornerstone doubled, in all seeds.
  - The index moved +23.85% in one day.
  - The cause sits in `destination`, `collar` and the `dayClose` fallback.
- **The chart pretends.** The median name has no executions in 57–76% of open sessions. Marks still move on closed days. The minute layer interpolates and estimates volume, so candles, the volume pane and VWAP imply trading that never happened.
- **Calendars disagree.**
  - On Monday 08:00 the Broker's "today" shows Friday's bar.
  - The paper reports a Sunday close.
  - A list return of −9.1% sits beside the paper's −6.0%, with no stated base.
- **Account totals mix snapshots.** Net worth reads $4,999.70 on top and $4,999.00 in the tile, with +$1.50 beside a −$0.30 truth. "Today −$12.59" sits beside "−0.03%".
- **Orders have no record.**
  - A market-at-open order shows "@ $32.07".
  - A raw "ORDER buy 10 eq:frm_northgrid" row stays after the fill.
  - Treasury market orders sit invisible until the next day's tick 0.
  - Futures round trips cost nothing.
  - FX costs aren't shown before you trade.
  - North and Halo reject a buy with a message that mixes "no willing seller" and "insufficient cash".
  - Option prices show per unit while 100× is charged.
- **Methodology.**
  - The price index read 96.9 beside a total-return index of 100.0, and total return updates only monthly.
  - Sector "Return a year" shows before a year has passed.
  - A curve of 4.25% at 3 months against 3.94% at 10 years is labelled "Upward".
  - The headless Value strategy made +403% in year 3 while the index sat at 70.9.

## Do

1. **Separate facts per instrument.**
   - Official mark, with its rule and inputs.
   - Bid and ask, and executable size near them.
   - Last execution with time.
   - Session volume from real fills only.
   - The source of each bar (traded, indicative or backfilled) and of each volume figure (real or estimated).
   - Stops, margin, buy-ins and liquidations each state whether they use the mark or executable depth, and never trigger on a mark with no market.
2. **No cliffs without cause.** Find why the bank and construction names reprice 2–18× at a report with no trade. Pin the balance sheet, earnings anchor, book and divisor traces, and fix the model. A large repricing walks through trades over sessions, or comes with a disclosed reason and a gap at the open. Rerun seeds 1, 27 and 118: no instrument moves more than 40% in a day without a disclosed event and real volume.
3. **One session calendar** shared by the exchange, the paper, quotes and the UI. "Today" is the current session, or labelled as the last session with its date. Every return carries its base and window. Closed-session revaluations never print as trades.
4. **One account snapshot.**
   - Cash, quantities, marks, basis, fees and net worth come from one revision, and reconcile to the cent.
   - Daily change, investment return, external flows and spending are separate, labelled figures.
   - Today's percentage matches today's dollars.
5. **Order lifecycle.**
   - Every order has a record: status, reserved cash, fills with time and price, fees, partials, rejected remainder, cancel.
   - Market-at-open says so, with no price.
   - Treasury, futures, FX, options and coin orders say when they can execute next, and queue visibly.
   - Rejections give one reason: no seller, too little cash, closed session, or limit.
6. **Honest costs.**
   - Futures and FX have spreads and fees that grow with size and stress, shown before submission.
   - Options quote per share, per contract (×100), total cash, break-even and maximum loss.
   - Futures show the curve, spot against front month, and roll.
7. **Index methodology.** A divisor that ignores share and listing changes. A decomposition of the largest daily moves. Price and total-return indices on the same dates. Sector returns labelled by window. Curve shape named from the actual tenor spreads, consistent with the paper.
8. **Check skill returns.** Explain or fix the Value strategy's +403%: concentration, leverage, or the return calculation.

## Done

Run seeds 1, 27 and 118 for a year headless, and print:
- the largest one-day move per sector, with its volume and cause
- the index's largest moves, decomposed
- the share of open sessions with real fills

Show through the commands:
- a market-at-open order record
- a treasury order queued for the next session
- a futures and an FX round trip with their costs
- an options preview at ×100
- a net-worth snapshot that reconciles to the cent

Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
