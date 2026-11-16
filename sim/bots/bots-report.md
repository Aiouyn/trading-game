# Bot balance report

20 worlds (seeds 1–20), 20 years, 5,000 people. Each strategy played each world in its own process, acting once a week through the player. The stock index is the exchange's capitalisation-weighted total return (price change plus dividends reinvested, after the dividend tax a person pays). Books were checked every 30 days and on the last day.

## Flags

- **momentum** 10th percentile 5.80x beats the index median 4.58x (too safe).
- **value** 10th percentile 7.71x beats the index median 4.88x (too safe).
- **insider** was caught in every run (20/20).

## Strategies

| Strategy | p10 | median | p90 | bankrupt | dead | prison | caught | ann. return | index ann. | excess |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| do nothing | 0.96x | 1.39x | 2.04x | 0/20 | 0/20 | 0/20 | 0 | 1.6% | 8.0% | -6.6% |
| index investor | 4.69x | 5.73x | 6.82x | 0/20 | 0/20 | 4/20 | 15 | 9.1% | 8.3% | 1.1% |
| bond ladder | 1.32x | 2.41x | 3.20x | 0/20 | 0/20 | 0/20 | 0 | 4.5% | 8.2% | -4.0% |
| momentum | 5.80x | 6.86x | 10.89x | 0/20 | 0/20 | 4/20 | 12 | 10.1% | 7.9% | 2.5% |
| value | 7.71x | 9.92x | 14.22x | 0/20 | 0/20 | 5/20 | 23 | 12.2% | 8.2% | 4.1% |
| gambler | 3.69x | 5.85x | 16.49x | 0/20 | 0/20 | 4/20 | 11 | 9.2% | 8.8% | 1.0% |
| memecoin | 0.85x | 1.38x | 1.92x | 0/20 | 0/20 | 1/20 | 11 | 1.6% | 8.1% | -6.5% |
| insider | 3.79x | 5.83x | 6.61x | 0/20 | 0/20 | 18/20 | 55 | 9.2% | 7.7% | 0.9% |
| raider | 0.66x | 0.95x | 2.59x | 0/20 | 0/20 | 3/20 | 6 | -0.3% | 8.0% | -8.0% |
| landlord | 1.51x | 1.99x | 2.38x | 0/20 | 0/20 | 0/20 | 1 | 3.5% | 8.2% | -4.5% |
| random | 2.22x | 3.36x | 10.72x | 0/20 | 1/20 | 4/20 | 19 | 6.2% | 7.9% | -1.3% |

Final net worth is the multiple of the player’s worth on day 0. Annualised return uses the days the run actually lived. Excess is that return minus the same world’s index. Caught is charges and convictions of anyone who was the player, counting a case once.

## Exploits

No run finished above 50× starting net worth.
## Missing commands

None. Every strategy had the commands it needed.

## Cost

Wall clock 6792s on 4 cores. Sum of run times 26935s across 220 runs. No paid model API.
