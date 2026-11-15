# Bot balance report

20 worlds (seeds 1–20), 20 years, 5,000 people. Each strategy played each world in its own process, acting once a week through the player. The stock index is the equal-weight price change of the shares listed at the start that were still listed at the end. Books were checked every 30 days and on the last day.

## Flags

- **raider** seed 7 broke the books on day 2159 (last day of year 6): option margin cash 4,264,764 != claims 4,274,580, a gap of 9,816 cents. The player never traded an option. That week six people bought short-dated puts on Silicrest (`opt.insider`). See the trace under Exploits.
- No strategy’s 10th percentile beat the index. Doing nothing (median 1.36×) was not within 20% of the index. The insider was caught in 1 of 20 runs, neither never nor always.

## Strategies

| Strategy | p10 | median | p90 | bankrupt | dead | prison | caught | ann. return | index ann. | excess |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| do nothing | 1.03x | 1.36x | 1.98x | 0/20 | 0/20 | 0/20 | 0 | 1.5% | 13.6% | -12.0% |
| index investor | 3.35x | 4.11x | 5.66x | 0/20 | 0/20 | 0/20 | 4 | 7.3% | 13.6% | -6.6% |
| bond ladder | 1.73x | 2.56x | 4.20x | 0/20 | 0/20 | 0/20 | 1 | 4.8% | 13.9% | -9.1% |
| momentum | 0.54x | 0.66x | 0.92x | 0/20 | 0/20 | 0/20 | 4 | -2.0% | 13.7% | -16.3% |
| value | 0.88x | 1.12x | 1.59x | 0/20 | 0/20 | 0/20 | 3 | 0.6% | 14.4% | -14.4% |
| gambler | 0.82x | 1.22x | 1.84x | 0/20 | 0/20 | 0/20 | 2 | 1.0% | 14.0% | -13.9% |
| memecoin | 0.81x | 1.15x | 2.25x | 0/20 | 0/20 | 0/20 | 7 | 0.7% | 14.0% | -13.8% |
| insider | 0.87x | 1.11x | 1.77x | 0/20 | 0/20 | 0/20 | 1 | 0.5% | 17.2% | -15.5% |
| raider | 0.66x | 0.91x | 2.71x | 0/19 | 0/19 | 0/19 | 6 | -0.5% | 13.7% | -14.1% |
| landlord | 1.09x | 1.50x | 2.80x | 0/20 | 0/20 | 0/20 | 2 | 2.0% | 14.4% | -13.1% |
| random | 0.95x | 1.42x | 2.27x | 0/20 | 0/20 | 0/20 | 2 | 1.8% | 13.9% | -12.6% |

Final net worth is the multiple of the player’s worth on day 0. Annualised return uses the days the run actually lived. Excess is that return minus the same world’s index. Caught is charges and convictions of anyone who was the player, counting a case once.

## Exploits

No run finished above 50× starting net worth.

### raider seed 7 — books do not balance

The run stopped on day 2159. Worth that morning was $118,807, from $150,000 at the start. The options clearing house threw during the step:

```
option margin cash 4264764 != claims 4274580

[day 2154] opt.insider p_3938: Ania Norulsen bought a short-dated put on Silicrest while its monthly figures were still unpublished
[day 2155] opt.insider p_2993: Orus Iswenby bought a short-dated put on Silicrest while its monthly figures were still unpublished
[day 2156] opt.insider p_4569: Veren Rosmarwick bought a short-dated put on Silicrest while its monthly figures were still unpublished
[day 2157] opt.insider p_2478: Faren Zellinstone bought a short-dated put on Silicrest while its monthly figures were still unpublished
[day 2158] opt.insider p_4129: Hala Rosfarwell bought a short-dated put on Silicrest while its monthly figures were still unpublished
[day 2159] opt.insider p_4485: Elin Belquinstone bought a short-dated put on Silicrest while its monthly figures were still unpublished
```

The same day’s other recorded events are ordinary house sales. The other 219 runs, including every other bot on seed 7, balanced.
## Missing commands

- **gambler**: option: there is no command to buy or write a call or a put
- **landlord**: buy, sell or let property: the player has no property command

## Cost

Wall clock 6005s on 4 cores. Sum of run times 23852s across 220 runs. No paid model API.
