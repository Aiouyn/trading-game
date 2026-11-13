# Work order 16: earnings, analysts and guidance

You own `sim/modules/earnings/`. Add one `w.use(earnings)` line in `sim/run.ts`, after `markets`. Read the other modules' state; publish news through social's exported functions. Read `AGENTS.md` and `sim/README.md` first.

## Why

Share prices today move on order flow and news, but nobody reports profits. Real markets run on the earnings calendar: quarterly reports, guidance, analyst consensus, and the surprise against it. That is also where insiders gain an edge and where a player can do research.

## Build

1. **Quarterly reports.** Every listed firm reports revenue, costs, profit, earnings per share, cash and debt each quarter, on staggered dates, computed from its real ledger flows. A report is a published fact (news) and an event whose causes are the firm's month events (stockouts, price changes, layoffs, shocks).
2. **Guidance.** The chief executive gives next-quarter guidance from their own forecast, shaded by their traits (an optimistic or dishonest chief guides high). Big misses against guidance hurt their standing (psyche, board patience in the succession rules).
3. **Analysts are people** working at the banks and funds. Each covers a few firms, forecasts earnings from what they know (public data plus facts they learn from contacts), and issues buy, hold or sell ratings. Consensus is the average. Good analysts are right more often; their track record is kept.
4. **The surprise moves the price.** Funds and household investors in markets read the report against consensus: a beat raises their valuation, a miss lowers it, so the order book moves, not a formula. Before the report, people who know the numbers (staff in finance, the chief, their contacts) hold a private fact: insider trading becomes possible here, and the law module can see it.
5. **Stats line**: reports this year, average surprise, share of beats, best and worst analyst.

## Done

`node sim/run.ts --years 10 --seed 1` finishes with books balanced every day; each listed firm reports 40 times, prices react to surprises in both directions, and `--explain earnings.report` prints a chain from the report back to what happened in the firm. Save and reload still match. Commit after `git pull --rebase`, push, and reply with one firm's last four reports, that chain, and your cost. Then stop.
