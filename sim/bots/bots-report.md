# Bot balance report

3 worlds (seeds 1–3), 10 years, 5,000 people. Each strategy played each world in its own process, acting once a week through the player. The stock index is the exchange's capitalisation-weighted total return: price change plus the after-tax dividend reinvested. Books were checked every 30 days and on the last day.

## Flags

- **raider** 10th percentile 9.81x beats the index median 1.24x (too safe).

## Strategies

| Strategy | p10 | median | p90 | bankrupt | calls | dead | prison | caught | ann. return | index ann. | excess |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| do nothing | 0.99x | 1.00x | 1.45x | 0/3 | 0 | 0/3 | 1/3 | 2 | -0.0% | 3.9% | -4.0% |
| index investor | 1.25x | 1.70x | 2.19x | 0/3 | 0 | 0/3 | 0/3 | 1 | 5.5% | 2.7% | 0.7% |
| bond ladder | 1.17x | 1.22x | 1.78x | 0/3 | 0 | 0/3 | 0/3 | 0 | 2.0% | 2.8% | -0.8% |
| momentum | 1.10x | 1.50x | 2.24x | 0/3 | 0 | 0/3 | 1/3 | 1 | 4.2% | 2.8% | 0.2% |
| value | 1.21x | 1.38x | 2.25x | 0/3 | 0 | 0/3 | 1/3 | 1 | 3.2% | 3.8% | -1.1% |
| gambler | 0.48x | 0.77x | 1.96x | 3/3 | 3 | 0/3 | 0/3 | 0 | -2.6% | 3.4% | -5.6% |
| memecoin | 0.85x | 0.89x | 1.16x | 0/3 | 0 | 0/3 | 1/3 | 2 | -1.1% | 2.9% | -4.7% |
| insider | 1.11x | 1.27x | 1.93x | 0/3 | 0 | 0/3 | 1/3 | 1 | 2.4% | 3.4% | -1.3% |
| raider | 9.81x | 10.25x | 12.45x | 3/3 | 19 | 0/3 | 0/3 | 0 | 26.2% | 2.2% | 23.3% |
| landlord | 0.31x | 0.40x | 0.59x | 0/3 | 0 | 0/3 | 0/3 | 0 | -8.8% | 3.6% | -12.7% |
| random | 0.32x | 0.52x | 0.85x | 0/3 | 0 | 0/3 | 1/3 | 5 | -6.4% | 3.1% | -9.9% |

Final net worth is the multiple of the player’s worth on day 0. Annualised return uses the days the run actually lived. Excess is that return minus the same world’s index. Bankrupt is a court declaration against anyone who was the player. Calls counts margin calls, on stock loans and on written options, for those same people. Caught is charges and convictions of anyone who was the player, counting a case once.

## Exploits

No run finished above 50× starting net worth.
## Missing commands

None. Every strategy had the commands it needed.

## Cost

Wall clock 520s on 5 cores. Sum of run times 2463s across 33 runs. No paid model API.
