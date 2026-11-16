# Work order 43: paper fortunes

You may read every module. Change only what the cause requires: the markets, banking (margin lending), options and corporate modules, and the bots' measures in `sim/bots/run.ts`. Read `AGENTS.md`, `sim/README.md` and `sim/bots/bots-report.md` first.

## The problem

After the last tuning, every strategy wins too easily. In the bot report (20 worlds, 20 years): the leveraged gambler ends at 90 to 1,329 times its money in all 20 worlds, growing about 1.5 times every year with no losing world; the raider reaches 90 to 350 times in 7 worlds; the index investor and momentum end near 10 times while the index they are measured against ends near 2.5 times. The gambler's traces show no events on its biggest days: "the move is a mark". The suspected loop: the player buys a large share of a thinly traded stock, its last price rises, the position is valued at that price, the bank lends more against it, and the player buys more. The fortune exists only on paper: nobody could buy those shares back at that price.

## What to do

1. **Prove or disprove the loop with traces** before changing anything: for the gambler on two seeds, print per month the player's share of each stock's shares outstanding, the stock's daily volume, the last price against what selling the whole position into the order book would fetch, and the margin loan.
2. **Fix it at the source**, the way real markets do: margin lenders lend against what a position would fetch, with a haircut that grows with the position's size against daily volume; marks on a large position use a liquidation price (the book's depth), not the last trade; prices respond to a large buyer and fall back when it stops. If a raider wins by buying a firm and marking its own stake, the same rules apply.
3. **Measure against the right index.** Report the index as total return (price plus dividends reinvested), so a passive investor who reinvests dividends should land close to it.

## Targets on the new bot report

The index investor within 2 points a year of the total-return index; no strategy whose 10th percentile beats the index median; the gambler's median above the index but with real losses (some worlds below 1×, some margin calls or bankruptcies); no run above 50× unless its trace shows a real, sellable gain. Rerun `node sim/bots/run.ts --worlds 20 --years 20 --pop 5000` and commit the report.

## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`); the economy is no worse than now. Commit after `git pull --rebase`, push, and reply with the before and after numbers this order asks for and your cost. Then stop.
