# Work order 116: coins and launches that move every minute

Read `AGENTS.md`, `sim/README.md`, `sim/modules/crypto/` (majors, memecoins, pools, manias, rugs, the board from order 115), `sim/modules/markets/minutes.ts` and the live clock in `sim/server.ts` (order 113), `src/apps/launchpad/` (read only) and the people model in `sim/modules/economy/people.ts` and `sim/modules/psyche/`.

You own `sim/modules/crypto/` and the coin parts of `sim/modules/markets/minutes.ts`. Do not touch `src/`.

## Why

The owner could not find the launches. Order 115 put the Launchpad back on the desk, but:
- The city's own memecoins only launch from day 90, so a new arrival sees an empty board for three months.
- Coins and memecoins are repriced once a day at 09:30; between that, the 1-minute chart is noise around a flat price.
- Memecoin bars carry no volume.

The first version's Launchpad felt alive: coins launched all the time, pumped and died within hours, and you could watch it happen.

## Do

1. **Launches from the first hour**: real people in the city (crypto-minded, gamblers, the young, the bored rich) launch memecoins at all hours, several a game day, more in a mania and fewer in a slump. Each launcher, name and ticker follows from who they are. Tickers are unique among live coins.
2. **Minute-by-minute price discovery**: memecoin and major-coin prices move from real buys and sells by the city's traders every game minute, through each coin's pool or book. Pumps, dumps, king-of-the-hill races, slow bleeds and rugs happen within hours, not days. Majors are calmer and follow the city's mood and money.
3. **Volume and trades**: every minute bar carries volume; the tape shows real trades with who traded (anonymous handles from real people) and size.
4. **The player's trades move the price** like anyone else's, with the slippage of the pool.
5. Deterministic from the seed and the player's actions, bounded memory, books balanced; the 10-year headless run stays under 100 s (coin minute activity can be lighter when no player is watching, as long as daily results agree).

## Done

On an `arrival` start, run the clock at x25 for one game day and show: how many coins launched and by whom, one coin's 1-minute candles with volume through a pump and a dump, the tape, and one rug. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
