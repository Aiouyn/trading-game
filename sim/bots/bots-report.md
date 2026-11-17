# Bot balance report

6 worlds (seeds 1–6), 10 years, 5,000 people. Each strategy played each world in its own process, acting once a week through the player. The stock index is the exchange's capitalisation-weighted total return: price change plus the after-tax dividend reinvested. Books were checked every 30 days and on the last day.

## Flags

- **do nothing** median 1.22x is within 20% of the index median 1.26x (playing is not rewarded).

## Strategies

| Strategy | p10 | median | p90 | bankrupt | calls | dead | prison | caught | ann. return | index ann. | excess |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| do nothing | 0.98x | 1.22x | 1.50x | 0/6 | 0 | 0/6 | 0/6 | 0 | 2.0% | 2.4% | -1.1% |
| index investor | 1.18x | 1.39x | 1.81x | 0/6 | 0 | 0/6 | 0/6 | 0 | 3.4% | 2.0% | 0.7% |
| bond ladder | 1.09x | 1.19x | 1.54x | 0/6 | 0 | 0/6 | 1/6 | 1 | 1.8% | 2.3% | -0.8% |
| momentum | 1.14x | 1.29x | 1.74x | 0/6 | 0 | 0/6 | 0/6 | 0 | 2.6% | 2.4% | 0.6% |
| value | 1.10x | 1.36x | 1.92x | 0/6 | 0 | 0/6 | 0/6 | 0 | 3.1% | 2.5% | 0.2% |
| gambler | -0.03x | 0.04x | 0.18x | 6/6 | 6 | 0/6 | 0/6 | 0 | -27.7% | 2.1% | -29.2% |
| memecoin | 0.71x | 0.92x | 1.04x | 0/6 | 0 | 0/6 | 1/6 | 3 | -0.9% | 2.7% | -3.6% |
| insider | 0.95x | 1.26x | 1.70x | 0/6 | 0 | 0/6 | 1/6 | 2 | 2.3% | 2.5% | -0.4% |
| raider | 0.03x | 0.53x | 8.58x | 3/6 | 3 | 0/6 | 0/6 | 0 | -7.6% | 2.4% | -9.7% |
| landlord | 0.78x | 1.79x | 2.32x | 0/6 | 0 | 0/6 | 1/6 | 2 | 6.0% | 1.7% | 4.3% |
| random | 0.55x | 0.81x | 1.14x | 0/6 | 0 | 0/6 | 2/6 | 8 | -2.2% | 2.6% | -3.8% |

Final net worth is the multiple of the player’s worth on day 0. Annualised return uses the days the run actually lived. Excess is that return minus the same world’s index. Bankrupt is a court declaration against anyone who was the player, and an ending worth below the day-0 worth. A recovery after a declaration is not both rich and bankrupt. Calls counts margin calls, on stock loans and on written options, for those same people. Caught is charges and convictions of anyone who was the player, counting a case once.

## Exploits

No run finished above 50× starting net worth.
## Missing commands

None. Every strategy had the commands it needed.

## Cost

Wall clock 3802s on 3 cores. Sum of run times 11245s across 66 runs. No paid model API.
