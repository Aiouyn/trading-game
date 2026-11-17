# Bot balance report

20 worlds (seeds 1–20), 20 years, 5,000 people. Each strategy played each world in its own process, acting once a week through the player. The stock index is the exchange's capitalisation-weighted total return: price change plus the after-tax dividend reinvested. Books were checked every 30 days and on the last day.

## Flags

- **bond ladder** 10th percentile 2.12x beats the index median 1.60x (too safe).
- **momentum** 10th percentile 2.13x beats the index median 1.48x (too safe).
- **value** 10th percentile 2.09x beats the index median 1.40x (too safe).
- **do nothing** median 1.72x is within 20% of the index median 1.57x (playing is not rewarded).
- **insider** was caught in every run (20/20).

## Strategies

| Strategy | p10 | median | p90 | bankrupt | dead | prison | caught | ann. return | index ann. | excess |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| do nothing | 1.20x | 1.72x | 2.65x | 0/20 | 0/20 | 2/20 | 3 | 2.7% | 2.3% | 0.3% |
| index investor | 0.71x | 1.71x | 4.59x | 0/20 | 0/20 | 3/20 | 5 | 2.7% | 2.1% | 0.3% |
| bond ladder | 2.12x | 3.23x | 4.16x | 0/20 | 0/20 | 1/20 | 2 | 6.0% | 2.4% | 3.6% |
| momentum | 2.13x | 4.24x | 12.20x | 0/20 | 0/20 | 3/20 | 7 | 7.5% | 2.0% | 4.7% |
| value | 2.09x | 4.85x | 10.74x | 0/20 | 0/20 | 1/20 | 5 | 8.2% | 1.7% | 6.0% |
| gambler | 1.19x | 2.58x | 7.62x | 0/20 | 0/20 | 2/20 | 4 | 4.9% | 2.3% | 3.3% |
| memecoin | 0.91x | 1.71x | 5.84x | 0/20 | 0/20 | 2/20 | 11 | 2.7% | 2.4% | 2.2% |
| insider | 0.67x | 1.54x | 6.09x | 0/20 | 0/20 | 16/20 | 58 | 2.2% | 2.0% | -0.1% |
| raider | 0.82x | 4.22x | 15.18x | 0/20 | 0/20 | 1/20 | 1 | 7.4% | 1.4% | 6.1% |
| landlord | 1.38x | 2.43x | 5.04x | 0/20 | 0/20 | 3/20 | 7 | 4.5% | 2.6% | 2.3% |
| random | 1.03x | 1.46x | 2.39x | 0/20 | 0/20 | 5/20 | 8 | 1.9% | 2.2% | -0.9% |

Final net worth is the multiple of the player’s worth on day 0. Annualised return uses the days the run actually lived. Excess is that return minus the same world’s index. Caught is charges and convictions of anyone who was the player, counting a case once.

## Exploits

No run finished above 50× starting net worth.
## Missing commands

None. Every strategy had the commands it needed.

## Cost

Wall clock 7450s on 4 cores. Sum of run times 29768s across 220 runs. No paid model API.
