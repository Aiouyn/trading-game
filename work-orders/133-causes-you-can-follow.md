# Work order 133: causes a player can follow

Read `AGENTS.md`, `sim/README.md`, `sim/modules/media/` (`paper.ts` around 123 and 503), `sim/modules/markets/index.ts` around 1343 and 1703 (after order 131's changes), `sim/modules/economy/`, `sim/modules/energy/`, `sim/modules/commodities/`, `sim/modules/earnings/`, `sim/modules/signals/`, `sim/modules/history/`, `src/apps/research/` and `src/apps/wire/`. Audit text: `D:/tg-work/audits/Port Avalon Market Launchpad and Interface Audit.txt` ("Eight shocks in paired worlds", sector table) and `Port Avalon Playtest and Simulation Audit.txt` (C01, C02, I01, W04).

You own `sim/modules/media/`, `signals/`, `earnings/`, `history/`, how shocks and news reach traders in `economy/`, `energy/` and `markets/`, `src/apps/research/` and `src/apps/wire/`. Order 131 has just landed; keep its market facts. Keep both sides on any rebase conflict.

## Why

- **Why? repeats the move.**
  - "Why?" on Coppercliff's −6% gives two versions of the decline, with no originating input.
  - Fallback movers attach the latest global market move to another instrument.
  - The text says the CEO "marked" the stock when the market machinery set the price.
- **Shocks reach futures, not shares.**
  - A drought sent grain futures +49% within two weeks while Goldenfield Farms moved 0% to +3.6%. It fell 55% only six weeks later.
  - The oil embargo, mine collapse and fab fire showed the same lag.
  - Harbourline rose on its own port strike. Northgrid rose after the heatwave cut its output.
- **Sectors move alike.** Most move 1.2–1.8% a day with similar index correlation. Operating data does not explain the differences.
- **Research Desk can't support a thesis.** No accounts, no comparables, no exposures, no sources.
- **Knowledge has no path.** A CEO says "You heard it here first" about an outage already in the paper.

## Do

1. **Why? shows real causes.**
   - Every price-move explanation names the inputs that changed it: an earnings surprise against expectations, a published event with its time, order flow, or the valuation rule and its inputs when a mark moved without trades.
   - It links the exact story and session, and the firm, press and portfolio resolve the same event ids.
   - Unrelated news never appears as evidence, and no move is attached to the wrong instrument.
2. **News travels.** When a drought, outage, fire, strike or embargo becomes knowable (published, or known to insiders), traders who can see it revise their forecasts of the exposed firms. Exposed shares then react within sessions, in proportion to exposure, not weeks later through accounts. Record when each forecast changed and whether a trade or only the mark moved.
3. **Explain the signs.** Trace sales volume, price, marginal cost, profit and financing for the strike and heatwave cases, and fix what is wrong. If a rise is genuine (pricing power, for example), the paper and Why? say so.
4. **Sectors driven by operations.**
   - The oil producer is driven by extraction cost and the curve.
   - The airline by load factor and fuel.
   - Insurance by claims and reserves.
   - Tech by orders and capacity.
   - Retail by footfall and margins.
   Each sector's daily moves and index correlation then differ for a stated reason.
5. **A research dossier per firm.** As of today:
   - Income statement, balance sheet and cash flow.
   - Unit economics, key counterparties, inventory, debt maturities, ownership.
   - Comparables in the same sector.
   - Exposures to commodities, rates and FX.
   - Upcoming dates, forecast ranges, and sources with confidence.
6. **Who knows what.** Facts carry a disclosure time, source and confidence. Private information travels only through people with a plausible route to it. Nobody presents published news as a secret.

## Done

Run paired same-seed worlds (seeds 1, 27 and 118) with a drought, a plant outage and a fab fire against a control. Print, for each, the exposed share's move at days 1, 5 and 15 after it became public, and the futures' moves. Then show:
- in the game: a Why? for an earnings-surprise move and for a news-driven move
- the dossier for Northgrid in Research, as Playwright headless Chrome screenshots at 1600x900 (import from `node_modules/playwright`, `channel: 'chrome'`, wait for `load`, never `networkidle`)

Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
