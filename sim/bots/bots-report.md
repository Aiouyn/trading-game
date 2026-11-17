# Bot balance report

10 worlds (seeds 1–10), 10 years, 5,000 people. Each strategy played each world in its own process, acting once a week through the player. The stock index is the exchange's capitalisation-weighted total return: price change plus the after-tax dividend reinvested. Books were checked every 30 days and on the last day.

## Flags

- **do nothing** 10th percentile 1.04x beats the index median 0.78x (too safe).
- **bond ladder** 10th percentile 1.24x beats the index median 0.91x (too safe).

## Strategies

| Strategy | p10 | median | p90 | bankrupt | calls | dead | prison | caught | ann. return | index ann. | excess |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| do nothing | 1.04x | 1.26x | 1.58x | 0/10 | 0 | 0/10 | 1/10 | 2 | 2.2% | -2.4% | 4.7% |
| index investor | 0.49x | 0.78x | 0.96x | 0/10 | 0 | 0/10 | 1/10 | 2 | -2.5% | 1.1% | -2.7% |
| bond ladder | 1.24x | 1.48x | 1.89x | 0/10 | 0 | 0/10 | 0/10 | 0 | 3.9% | -1.0% | 5.0% |
| momentum | 0.65x | 1.14x | 1.28x | 0/10 | 0 | 0/10 | 1/10 | 1 | 1.3% | -1.9% | 0.6% |
| value | 0.87x | 1.62x | 2.86x | 0/10 | 0 | 0/10 | 1/10 | 1 | 4.9% | -0.1% | 5.0% |
| gambler | 0.02x | 0.08x | 0.36x | 10/10 | 10 | 0/10 | 0/10 | 0 | -24.7% | -1.7% | -22.3% |
| memecoin | 0.85x | 0.96x | 1.14x | 0/10 | 0 | 0/10 | 3/10 | 7 | -0.4% | -0.8% | 0.5% |
| insider | 0.48x | 0.67x | 0.82x | 0/10 | 0 | 0/10 | 2/10 | 2 | -4.0% | -2.6% | -2.6% |
| raider | 0.02x | 0.14x | 1.49x | 10/10 | 65 | 0/10 | 0/10 | 1 | -17.9% | -1.6% | -17.5% |
| landlord | 0.39x | 0.49x | 0.57x | 0/10 | 0 | 0/10 | 3/10 | 5 | -6.8% | -2.0% | -5.1% |
| random | 0.29x | 0.45x | 0.60x | 0/10 | 0 | 0/10 | 1/10 | 6 | -7.6% | 1.0% | -7.7% |

Final net worth is the multiple of the player’s worth on day 0. Annualised return uses the days the run actually lived. Excess is that return minus the same world’s index. Bankrupt is a court declaration against anyone who was the player. Calls counts margin calls, on stock loans and on written options, for those same people. Caught is charges and convictions of anyone who was the player, counting a case once.

## Exploits

No run finished above 50× starting net worth.
## Missing commands

None. Every strategy had the commands it needed.

## Cost

Wall clock 2603s on 3 cores. Sum of run times 7726s across 110 runs. No paid model API.
