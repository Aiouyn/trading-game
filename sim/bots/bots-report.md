# Bot balance report

6 worlds (seeds 1–6), 10 years, 5,000 people. Each strategy played each world in its own process, acting once a week through the player. The stock index is the exchange's capitalisation-weighted total return: price change plus the whole dividend payout, before the holder's tax, reinvested. Books were checked every 30 days and on the last day.

## Flags

- **do nothing** median 1.19x is within 20% of the index median 1.49x (playing is not rewarded).
- **insider** was never caught.

## Strategies

| Strategy | p10 | median | p90 | bankrupt | calls | dead | prison | caught | ann. return | index ann. | excess |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| do nothing | 0.99x | 1.19x | 1.54x | 0/6 | 0 | 0/6 | 0/6 | 0 | 1.8% | 4.1% | -2.1% |
| index investor | 1.25x | 1.90x | 2.45x | 0/6 | 0 | 0/6 | 0/6 | 0 | 6.6% | 5.5% | 0.1% |
| bond ladder | 1.06x | 1.29x | 1.67x | 0/6 | 0 | 0/6 | 0/6 | 0 | 2.5% | 5.2% | -1.9% |
| momentum | 1.07x | 1.91x | 2.53x | 0/6 | 0 | 0/6 | 0/6 | 0 | 6.7% | 4.2% | 1.9% |
| value | 1.35x | 1.77x | 2.84x | 0/6 | 0 | 0/6 | 0/6 | 1 | 5.8% | 3.6% | 1.9% |
| gambler | 0.01x | 0.11x | 0.19x | 6/6 | 6 | 0/6 | 0/6 | 0 | -20.3% | 6.3% | -29.3% |
| memecoin | 0.73x | 0.85x | 1.02x | 0/6 | 0 | 0/6 | 0/6 | 0 | -1.6% | 4.5% | -6.2% |
| insider | 1.31x | 1.53x | 2.31x | 0/6 | 0 | 0/6 | 0/6 | 0 | 4.3% | 4.3% | 0.4% |
| raider | 0.01x | 0.04x | 6.05x | 3/6 | 3 | 1/6 | 0/6 | 0 | -27.4% | 4.1% | -31.9% |
| landlord | 1.39x | 1.97x | 2.45x | 0/6 | 0 | 0/6 | 0/6 | 0 | 7.0% | 4.6% | 1.4% |
| random | 0.77x | 1.23x | 4.03x | 0/6 | 0 | 0/6 | 0/6 | 0 | 2.1% | 4.6% | -3.1% |

Final net worth is the multiple of the player’s worth on day 0. Annualised return uses the days the run actually lived. Excess is that return minus the same world’s index. Bankrupt is a court declaration against anyone who was the player, and an ending worth below the day-0 worth. A recovery after a declaration is not both rich and bankrupt. Calls counts margin calls, on stock loans and on written options, for those same people. Caught is charges and convictions of anyone who was the player, counting a case once.

## Problems

Simulation behaviour that the bots expose. Not changed here (work order 97 does not touch sim modules).

- **Index below target.** The capitalisation-weighted total return runs 3.6% to 6.3% a year (median 4.5%) against the 6 to 9% target. The growth from work order 95 is not showing up in the index as expected; cause not yet traced.
- **Index differs by strategy in the same world.** Its median annual return ranges from 3.6% (value) to 6.3% (gambler), so the index is not independent of what the player does. Excess is still taken against each run's own index.
- **Idle money lags.** Do nothing earns 1.8% a year against the index's 4.1% median, and the do-nothing flag fires (median 1.19x against 1.49x).
- **Insider never caught.** Zero charges in six runs (two of six in the work order 85 table). Cause not yet traced.
- **Bond ladder trails.** It earns 2.5% a year against the index's 4.5%; bond yields sit well under equity returns.

## Exploits

No run finished above 50× starting net worth.
## Missing commands

None. Every strategy had the commands it needed.

## Cost

Wall clock 1528s on 3 cores. Sum of run times 4553s across 66 runs. No paid model API.
