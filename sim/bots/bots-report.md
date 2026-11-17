# Bot balance report

20 worlds (seeds 1–20), 20 years, 5,000 people. Each strategy played each world in its own process, acting once a week through the player. The stock index is the exchange's capitalisation-weighted total return: price change plus the after-tax dividend reinvested. Books were checked every 30 days and on the last day.

## Flags

- **bond ladder** 10th percentile 2.32x beats the index median 1.74x (too safe).
- **momentum** 10th percentile 2.49x beats the index median 1.53x (too safe).
- **value** 10th percentile 1.99x beats the index median 1.59x (too safe).
- **do nothing** median 2.01x is within 20% of the index median 1.70x (playing is not rewarded).

## Strategies

| Strategy | p10 | median | p90 | bankrupt | dead | prison | caught | ann. return | index ann. | excess |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| do nothing | 1.32x | 2.01x | 2.78x | 0/20 | 0/20 | 1/20 | 1 | 3.6% | 2.7% | 0.7% |
| index investor | 1.06x | 2.55x | 4.80x | 0/20 | 0/20 | 4/20 | 9 | 4.8% | 2.7% | 1.8% |
| bond ladder | 2.32x | 3.67x | 5.15x | 0/20 | 0/20 | 0/20 | 0 | 6.7% | 2.8% | 4.1% |
| momentum | 2.49x | 3.63x | 7.56x | 0/20 | 0/20 | 4/20 | 13 | 6.7% | 2.1% | 5.5% |
| value | 1.99x | 4.83x | 16.02x | 0/20 | 0/20 | 5/20 | 13 | 8.2% | 2.3% | 6.7% |
| gambler | 0.91x | 2.07x | 5.32x | 0/20 | 0/20 | 4/20 | 8 | 3.7% | 2.1% | 2.0% |
| memecoin | 0.92x | 1.60x | 3.62x | 0/20 | 0/20 | 1/20 | 13 | 2.4% | 2.2% | 0.6% |
| insider | 0.92x | 1.56x | 4.34x | 0/20 | 0/20 | 16/20 | 64 | 2.2% | 2.3% | 0.1% |
| raider | 0.59x | 8.81x | 30.00x | 0/20 | 0/20 | 2/20 | 3 | 11.5% | 2.1% | 10.1% |
| landlord | 1.45x | 2.24x | 5.33x | 0/20 | 0/20 | 3/20 | 4 | 4.1% | 2.0% | 2.6% |
| random | 1.22x | 1.52x | 2.60x | 0/20 | 0/20 | 3/20 | 9 | 2.1% | 2.5% | 0.3% |

Final net worth is the multiple of the player’s worth on day 0. Annualised return uses the days the run actually lived. Excess is that return minus the same world’s index. Caught is charges and convictions of anyone who was the player, counting a case once.

## Exploits

No run finished above 50× starting net worth.
## Missing commands

None. Every strategy had the commands it needed.

## Cost

Wall clock 7295s on 4 cores. Sum of run times 29154s across 220 runs. No paid model API.
