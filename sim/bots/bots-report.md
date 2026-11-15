# Bot balance report

20 worlds (seeds 1–20), 20 years, 5,000 people. Each strategy played each world in its own process, acting once a week through the player. The stock index is the equal-weight price change of the shares listed at the start that were still listed at the end. Books were checked every 30 days and on the last day.

## Flags

- None.

## Strategies

| Strategy | p10 | median | p90 | bankrupt | dead | prison | caught | ann. return | index ann. | excess |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| do nothing | 1.03x | 1.36x | 1.98x | 0/20 | 0/20 | 0/20 | 0 | 1.5% | 13.6% | -12.0% |
| index investor | 3.35x | 4.30x | 5.87x | 0/20 | 0/20 | 0/20 | 3 | 7.6% | 13.5% | -6.5% |
| bond ladder | 1.73x | 2.49x | 4.20x | 0/20 | 0/20 | 0/20 | 1 | 4.7% | 13.7% | -8.9% |
| momentum | 0.54x | 0.66x | 0.92x | 0/20 | 0/20 | 0/20 | 5 | -2.0% | 13.7% | -16.2% |
| value | 0.88x | 1.12x | 1.79x | 0/20 | 0/20 | 0/20 | 4 | 0.6% | 14.4% | -14.4% |
| gambler | 0.73x | 0.94x | 1.48x | 0/20 | 0/20 | 0/20 | 15 | -0.3% | 13.3% | -13.9% |
| memecoin | 0.81x | 1.14x | 2.25x | 0/20 | 0/20 | 0/20 | 8 | 0.6% | 14.2% | -14.0% |
| insider | 0.83x | 1.14x | 1.92x | 0/20 | 0/20 | 0/20 | 2 | 0.6% | 14.9% | -14.5% |
| raider | 0.67x | 0.99x | 4.09x | 0/20 | 0/20 | 0/20 | 6 | -0.0% | 13.8% | -14.1% |
| landlord | 1.37x | 1.86x | 2.37x | 0/20 | 0/20 | 0/20 | 1 | 3.1% | 13.5% | -10.8% |
| random | 0.95x | 1.47x | 2.20x | 0/20 | 0/20 | 0/20 | 2 | 1.9% | 14.2% | -12.7% |

Final net worth is the multiple of the player’s worth on day 0. Annualised return uses the days the run actually lived. Excess is that return minus the same world’s index. Caught is charges and convictions of anyone who was the player, counting a case once.

## Exploits

No run finished above 50× starting net worth.
## Missing commands

None. Every strategy had the commands it needed.

## Cost

Wall clock 6936s on 4 cores. Sum of run times 27673s across 220 runs. No paid model API.
