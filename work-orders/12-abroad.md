# Work order 12: the rest of the world and the exchange rate

You own `sim/modules/abroad/`. Add one `w.use(abroad)` line in `sim/run.ts`, right after `economy`. Economy needs two hooks; add them to `sim/modules/economy/index.ts` in the style of the existing `govFund` hook (an optional function read from `w.state`, doing nothing when the module is off), and keep that change under 40 lines. Read the other modules' state; change them only through functions they export. Read `AGENTS.md` and `sim/README.md` first.

## Why

Port Avalon is one country with no outside world, so there are no imports, no exports, no foreign currency and no forex market. A port city lives on trade. This order adds the rest of the world as one large aggregate economy (not simulated people) with its own currency, central bank rate, prices and demand, and a floating exchange rate set by real flows.

## Build

1. **A foreign currency in the ledger** (`FX:USD` style instrument, integer cents), a foreign central bank rate that follows its own slow cycle, and a foreign price level with its own inflation. All content (size of the world, starting rate, starting exchange rate, which goods are traded) in a raw file `sim/content/abroad.txt`, parsed with `sim/kernel/content.ts` like the other raws.
2. **Trade through the ledger.** Foreign buyers order domestic goods each day through the economy's normal buying path (hook 1), in quantities that depend on the domestic price in foreign currency: a weaker home currency sells more. Domestic firms can buy inputs from abroad (hook 2) when the foreign price converted at today's rate beats the cheapest domestic seller, so oil, metals and machinery are partly imported. Every crossing pays in the seller's currency through the forex market below.
3. **A forex market.** An order book for the home currency against the foreign one, using the existing order-book code in markets if it fits, or a dealer bank that quotes a spread and holds inventory. Flows that set the rate: exporters selling foreign earnings, importers buying foreign currency, investors moving money toward the higher interest rate (carry), and the funds in markets holding a share of foreign bonds. The rate is never set by formula; it is whatever clears.
4. **Shocks travel.** A foreign recession cuts export orders; a jump in the foreign rate pulls capital out and weakens the home currency; a weaker currency raises import prices and feeds home inflation through firms' unit costs. Each step emits events with causes, so `--explain fx.rate` reads like a story.
5. **Stats line**: exchange rate, exports and imports per day, trade balance, foreign assets held at home, carry flow.

## Done

`node sim/run.ts --years 30 --seed 1` finishes with books balanced every day; the exchange rate moves by plausible amounts (a few percent a month at most outside crises), the trade balance swings with the cycle, and home inflation and unemployment are no worse than without the module (compare `--without abroad`). Commit to `v1-build`, push, and reply with the stats for years 5, 15 and 30, one `--explain fx.rate` chain, and your cost. Then stop.
