# Bot balance report

20 worlds (seeds 1–20), 20 years, 5,000 people. Each strategy played each world in its own process, acting once a week through the player. The stock index is the exchange's capitalisation-weighted price index (market value of listed shares over their value at the open). Books were checked every 30 days and on the last day.

## Flags

- **index investor** 10th percentile 4.45x beats the index median 3.69x (too safe).
- **momentum** 10th percentile 5.61x beats the index median 3.78x (too safe).
- **value** 10th percentile 7.63x beats the index median 3.82x (too safe).
- **gambler** 10th percentile 29.09x beats the index median 3.89x (too safe).
- **insider** 10th percentile 4.28x beats the index median 3.78x (too safe).
- **insider** was caught in every run (20/20).
- **gambler** seed 3 finished at 59.55x (above 50×, likely exploit).
- **gambler** seed 6 finished at 61.53x (above 50×, likely exploit).
- **gambler** seed 8 finished at 92.75x (above 50×, likely exploit).
- **gambler** seed 9 finished at 52.36x (above 50×, likely exploit).
- **gambler** seed 13 finished at 58.52x (above 50×, likely exploit).
- **gambler** seed 19 finished at 85.17x (above 50×, likely exploit).

## Strategies

| Strategy | p10 | median | p90 | bankrupt | dead | prison | caught | ann. return | index ann. | excess |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| do nothing | 0.97x | 1.33x | 2.36x | 0/20 | 0/20 | 0/20 | 0 | 1.5% | 6.9% | -5.3% |
| index investor | 4.45x | 5.65x | 6.83x | 0/20 | 0/20 | 4/20 | 13 | 9.0% | 6.7% | 2.1% |
| bond ladder | 1.51x | 2.44x | 3.17x | 0/20 | 0/20 | 0/20 | 2 | 4.5% | 6.6% | -2.4% |
| momentum | 5.61x | 7.26x | 11.70x | 0/20 | 0/20 | 3/20 | 12 | 10.4% | 6.9% | 3.5% |
| value | 7.63x | 9.60x | 16.42x | 0/20 | 0/20 | 4/20 | 22 | 12.0% | 6.9% | 5.3% |
| gambler | 29.09x | 37.86x | 63.90x | 0/20 | 0/20 | 3/20 | 25 | 19.9% | 7.0% | 12.9% |
| memecoin | 0.84x | 1.21x | 1.85x | 0/20 | 0/20 | 0/20 | 8 | 1.0% | 6.7% | -5.7% |
| insider | 4.28x | 5.87x | 8.72x | 0/20 | 0/20 | 19/20 | 58 | 9.2% | 6.9% | 2.2% |
| raider | 0.62x | 0.82x | 7.06x | 0/20 | 0/20 | 3/20 | 7 | -1.0% | 6.6% | -7.2% |
| landlord | 1.45x | 1.95x | 3.34x | 0/20 | 0/20 | 0/20 | 0 | 3.4% | 6.9% | -3.5% |
| random | 3.21x | 4.31x | 6.81x | 0/20 | 0/20 | 4/20 | 22 | 7.6% | 7.1% | 0.2% |

Final net worth is the multiple of the player’s worth on day 0. Annualised return uses the days the run actually lived. Excess is that return minus the same world’s index. Caught is charges and convictions of anyone who was the player, counting a case once.

## Exploits

### gambler seed 3 — 59.55x

Start $150,000, end $8,932,035, 7200 days. Year-end worth: day 360 $790,178; day 720 $1,107,393; day 1080 $1,093,846; day 1440 $1,209,319; day 1800 $1,633,803; day 2160 $2,738,085; day 2520 $2,926,277; day 2880 $3,116,996; day 3240 $3,385,307; day 3600 $3,543,937; day 3960 $3,606,440; day 4320 $3,753,045; day 4680 $4,168,019; day 5040 $4,430,716; day 5400 $4,615,363; day 5760 $4,867,836; day 6120 $5,055,187; day 6480 $6,329,390; day 6840 $7,517,991; day 7200 $8,932,035.

Biggest up-days:

- Day 6300: $5,433,797 → $5,777,846

```
[day 6299] loan.default p_5000: Danin Yanwenby missed three payments on 338103
  <- [day 6239] cb.rate cb: policy rate 5.50% -> 6.00%
    <- [day 6239] macro.cpi: CPI 0.26% on the month, 3.0% on the year
      <- [day 6239] firm.price frm_deepwell: crude oil price -2.2% this month (unit cost 0.4%, 0 tight days)
        <- [day 6209] macro.demand: household spending 0.74M per day
    <- [day 6239] macro.jobs: unemployment 8.2%
      <- [day 6209] macro.demand: household spending 0.74M per day
        <- [day 6209] macro.cpi: CPI 0.62% on the month, 2.4% on the year
        <- [day 6209] macro.jobs: unemployment 7.2%
        <- [day 6179] cb.rate cb: policy rate 4.00% -> 4.50%

[day 6299] loan.default p_5000: Danin Yanwenby missed three payments on 52
  <- [day 6239] cb.rate cb: policy rate 5.50% -> 6.00%
    <- [day 6239] macro.cpi: CPI 0.26% on the month, 3.0% on the year
      <- [day 6239] firm.price frm_deepwell: crude oil price -2.2% this month (unit cost 0.4%, 0 tight days)
        <- [day 6209] macro.demand: household spending 0.74M per day
    <- [day 6239] macro.jobs: unemployment 8.2%
      <- [day 6209] macro.demand: household spending 0.74M per day
        <- [day 6209] macro.cpi: CPI 0.62% on the month, 2.4% on the year
        <- [day 6209] macro.jobs: unemployment 7.2%
        <- [day 6179] cb.rate cb: policy rate 4.00% -> 4.50%

[day 6299] loan.default p_5000: Danin Yanwenby missed three payments on 10290
  <- [day 6239] cb.rate cb: policy rate 5.50% -> 6.00%
    <- [day 6239] macro.cpi: CPI 0.26% on the month, 3.0% on the year
      <- [day 6239] firm.price frm_deepwell: crude oil price -2.2% this month (unit cost 0.4%, 0 tight days)
        <- [day 6209] macro.demand: household spending 0.74M per day
    <- [day 6239] macro.jobs: unemployment 8.2%
      <- [day 6209] macro.demand: household spending 0.74M per day
        <- [day 6209] macro.cpi: CPI 0.62% on the month, 2.4% on the year
        <- [day 6209] macro.jobs: unemployment 7.2%
        <- [day 6179] cb.rate cb: policy rate 4.00% -> 4.50%

[day 6299] loan.default p_5000: Danin Yanwenby missed three payments on 119
  <- [day 6239] cb.rate cb: policy rate 5.50% -> 6.00%
    <- [day 6239] macro.cpi: CPI 0.26% on the month, 3.0% on the year
      <- [day 6239] firm.price frm_deepwell: crude oil price -2.2% this month (unit cost 0.4%, 0 tight days)
        <- [day 6209] macro.demand: household spending 0.74M per day
    <- [day 6239] macro.jobs: unemployment 8.2%
      <- [day 6209] macro.demand: household spending 0.74M per day
        <- [day 6209] macro.cpi: CPI 0.62% on the month, 2.4% on the year
        <- [day 6209] macro.jobs: unemployment 7.2%
        <- [day 6179] cb.rate cb: policy rate 4.00% -> 4.50%

[day 6299] law.offence p_5000: Danin Yanwenby left $338103 unpaid after a default
  <- [day 6299] loan.default p_5000: Danin Yanwenby missed three payments on 338103
    <- [day 6239] cb.rate cb: policy rate 5.50% -> 6.00%
      <- [day 6239] macro.cpi: CPI 0.26% on the month, 3.0% on the year
        <- [day 6239] firm.price frm_deepwell: crude oil price -2.2% this month (unit cost 0.4%, 0 tight days)
      <- [day 6239] macro.jobs: unemployment 8.2%
        <- [day 6209] macro.demand: household spending 0.74M per day
```

- Day 240: $300,749 → $626,918

```
[day 239] loan.default p_5000: Danin Yanwenby missed three payments on 93341
  <- [day 209] cb.rate cb: policy rate 7.25% -> 8.50%
    <- [day 209] macro.cpi: CPI 0.01% on the month, 4.5% on the year
      <- [day 209] firm.price frm_n66: healthcare price +2.8% this month (unit cost 1.2%, 30 tight days)
        <- [day 179] macro.wage: wages 1.20% this month
      <- [day 209] firm.price frm_signalpoint: telecoms price -2.7% this month (unit cost 0.7%, 0 tight days)
        <- [day 179] macro.demand: household spending 0.40M per day
      <- [day 209] firm.price frm_beacon_net: telecoms price -2.6% this month (unit cost 0.7%, 0 tight days)
        <- [day 179] macro.demand: household spending 0.40M per day
    <- [day 209] macro.jobs: unemployment 13.1%
      <- [day 179] macro.demand: household spending 0.40M per day
        <- [day 179] macro.cpi: CPI 1.97% on the month, 4.5% on the year
        <- [day 179] macro.jobs: unemployment 3.3%
        <- [day 149] cb.rate cb: policy rate 2.25% -> 5.00%
  <- [day 0] player.arrive p_5000: Danin Yanwenby arrives, aged 30, and takes a job at Roadmark Logistics
    <- [day 0] genesis: world created from seed '3'  (outside shock)

[day 239] loan.default p_5000: Danin Yanwenby missed three payments on 195048
  <- [day 209] cb.rate cb: policy rate 7.25% -> 8.50%
    <- [day 209] macro.cpi: CPI 0.01% on the month, 4.5% on the year
      <- [day 209] firm.price frm_n66: healthcare price +2.8% this month (unit cost 1.2%, 30 tight days)
        <- [day 179] macro.wage: wages 1.20% this month
      <- [day 209] firm.price frm_signalpoint: telecoms price -2.7% this month (unit cost 0.7%, 0 tight days)
        <- [day 179] macro.demand: household spending 0.40M per day
      <- [day 209] firm.price frm_beacon_net: telecoms price -2.6% this month (unit cost 0.7%, 0 tight days)
        <- [day 179] macro.demand: household spending 0.40M per day
    <- [day 209] macro.jobs: unemployment 13.1%
      <- [day 179] macro.demand: household spending 0.40M per day
        <- [day 179] macro.cpi: CPI 1.97% on the month, 4.5% on the year
        <- [day 179] macro.jobs: unemployment 3.3%
        <- [day 149] cb.rate cb: policy rate 2.25% -> 5.00%
  <- [day 0] player.arrive p_5000: Danin Yanwenby arrives, aged 30, and takes a job at Roadmark Logistics
    <- [day 0] genesis: world created from seed '3'  (outside shock)

[day 239] law.offence p_5000: Danin Yanwenby left $93341 unpaid after a default
  <- [day 239] loan.default p_5000: Danin Yanwenby missed three payments on 93341
    <- [day 209] cb.rate cb: policy rate 7.25% -> 8.50%
      <- [day 209] macro.cpi: CPI 0.01% on the month, 4.5% on the year
        <- [day 209] firm.price frm_n66: healthcare price +2.8% this month (unit cost 1.2%, 30 tight days)
        <- [day 209] firm.price frm_signalpoint: telecoms price -2.7% this month (unit cost 0.7%, 0 tight days)
        <- [day 209] firm.price frm_beacon_net: telecoms price -2.6% this month (unit cost 0.7%, 0 tight days)
      <- [day 209] macro.jobs: unemployment 13.1%
        <- [day 179] macro.demand: household spending 0.40M per day
    <- [day 0] player.arrive p_5000: Danin Yanwenby arrives, aged 30, and takes a job at Roadmark Logistics
      <- [day 0] genesis: world created from seed '3'  (outside shock)

[day 239] law.offence p_5000: Danin Yanwenby left $195048 unpaid after a default
  <- [day 239] loan.default p_5000: Danin Yanwenby missed three payments on 195048
    <- [day 209] cb.rate cb: policy rate 7.25% -> 8.50%
      <- [day 209] macro.cpi: CPI 0.01% on the month, 4.5% on the year
        <- [day 209] firm.price frm_n66: healthcare price +2.8% this month (unit cost 1.2%, 30 tight days)
        <- [day 209] firm.price frm_signalpoint: telecoms price -2.7% this month (unit cost 0.7%, 0 tight days)
        <- [day 209] firm.price frm_beacon_net: telecoms price -2.6% this month (unit cost 0.7%, 0 tight days)
      <- [day 209] macro.jobs: unemployment 13.1%
        <- [day 179] macro.demand: household spending 0.40M per day
    <- [day 0] player.arrive p_5000: Danin Yanwenby arrives, aged 30, and takes a job at Roadmark Logistics
      <- [day 0] genesis: world created from seed '3'  (outside shock)
```

- Day 7172: $8,697,512 → $8,845,661

```
(no event that day names the player; the move is a mark)
```

- Day 7171: $8,551,793 → $8,697,512

```
(no event that day names the player; the move is a mark)
```

- Day 6812: $7,329,243 → $7,449,857

```
(no event that day names the player; the move is a mark)
```

- Day 6811: $7,210,443 → $7,329,243

```
(no event that day names the player; the move is a mark)
```

### gambler seed 6 — 61.53x

Start $150,000, end $9,229,728, 7200 days. Year-end worth: day 360 $561,274; day 720 $926,727; day 1080 $953,203; day 1440 $1,126,458; day 1800 $1,941,307; day 2160 $2,565,514; day 2520 $3,019,730; day 2880 $3,260,107; day 3240 $3,452,284; day 3600 $3,428,925; day 3960 $3,673,863; day 4320 $4,026,368; day 4680 $4,352,930; day 5040 $4,697,819; day 5400 $5,192,906; day 5760 $6,172,848; day 6120 $7,011,604; day 6480 $7,475,172; day 6840 $8,240,872; day 7200 $9,229,728.

Biggest up-days:

- Day 1620: $1,249,168 → $1,480,024

```
[day 1619] loan.default p_5000: Belen Salzelwell missed three payments on 35154
  <- [day 1589] cb.rate cb: policy rate 11.75% -> 6.25%
    <- [day 1589] macro.cpi: CPI -0.70% on the month, 6.6% on the year
      <- [day 1589] firm.price frm_freshway: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
      <- [day 1589] firm.price frm_grocermart: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
      <- [day 1589] firm.price frm_dailybasket: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
    <- [day 1589] macro.jobs: unemployment 11.9%
      <- [day 1559] macro.demand: household spending 0.48M per day
        <- [day 1559] macro.cpi: CPI -0.10% on the month, 7.9% on the year
        <- [day 1559] macro.jobs: unemployment 9.6%
        <- [day 1529] cb.rate cb: policy rate 11.25% -> 12.50%

[day 1619] loan.default p_5000: Belen Salzelwell missed three payments on 35565
  <- [day 1589] cb.rate cb: policy rate 11.75% -> 6.25%
    <- [day 1589] macro.cpi: CPI -0.70% on the month, 6.6% on the year
      <- [day 1589] firm.price frm_freshway: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
      <- [day 1589] firm.price frm_grocermart: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
      <- [day 1589] firm.price frm_dailybasket: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
    <- [day 1589] macro.jobs: unemployment 11.9%
      <- [day 1559] macro.demand: household spending 0.48M per day
        <- [day 1559] macro.cpi: CPI -0.10% on the month, 7.9% on the year
        <- [day 1559] macro.jobs: unemployment 9.6%
        <- [day 1529] cb.rate cb: policy rate 11.25% -> 12.50%

[day 1619] loan.default p_5000: Belen Salzelwell missed three payments on 64686
  <- [day 1589] cb.rate cb: policy rate 11.75% -> 6.25%
    <- [day 1589] macro.cpi: CPI -0.70% on the month, 6.6% on the year
      <- [day 1589] firm.price frm_freshway: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
      <- [day 1589] firm.price frm_grocermart: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
      <- [day 1589] firm.price frm_dailybasket: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
    <- [day 1589] macro.jobs: unemployment 11.9%
      <- [day 1559] macro.demand: household spending 0.48M per day
        <- [day 1559] macro.cpi: CPI -0.10% on the month, 7.9% on the year
        <- [day 1559] macro.jobs: unemployment 9.6%
        <- [day 1529] cb.rate cb: policy rate 11.25% -> 12.50%

[day 1619] loan.default p_5000: Belen Salzelwell missed three payments on 4272
  <- [day 1589] cb.rate cb: policy rate 11.75% -> 6.25%
    <- [day 1589] macro.cpi: CPI -0.70% on the month, 6.6% on the year
      <- [day 1589] firm.price frm_freshway: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
      <- [day 1589] firm.price frm_grocermart: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
      <- [day 1589] firm.price frm_dailybasket: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
    <- [day 1589] macro.jobs: unemployment 11.9%
      <- [day 1559] macro.demand: household spending 0.48M per day
        <- [day 1559] macro.cpi: CPI -0.10% on the month, 7.9% on the year
        <- [day 1559] macro.jobs: unemployment 9.6%
        <- [day 1529] cb.rate cb: policy rate 11.25% -> 12.50%

[day 1619] loan.default p_5000: Belen Salzelwell missed three payments on 4519
  <- [day 1589] cb.rate cb: policy rate 11.75% -> 6.25%
    <- [day 1589] macro.cpi: CPI -0.70% on the month, 6.6% on the year
      <- [day 1589] firm.price frm_freshway: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
      <- [day 1589] firm.price frm_grocermart: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
      <- [day 1589] firm.price frm_dailybasket: groceries price -6.2% this month (unit cost -9.4%, 0 tight days)
        <- [day 1589] firm.price frm_hearthstone: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1589] firm.price frm_pantryco: packaged food price -13.5% this month (unit cost -16.4%, 0 tight days)
        <- [day 1499] macro.wage: wages 0.52% this month
    <- [day 1589] macro.jobs: unemployment 11.9%
      <- [day 1559] macro.demand: household spending 0.48M per day
        <- [day 1559] macro.cpi: CPI -0.10% on the month, 7.9% on the year
        <- [day 1559] macro.jobs: unemployment 9.6%
        <- [day 1529] cb.rate cb: policy rate 11.25% -> 12.50%
```

- Day 360: $339,064 → $561,274

```
[day 359] loan.default p_5000: Belen Salzelwell missed three payments on 107745
  <- [day 329] cb.rate cb: policy rate 1.25% -> 1.75%
    <- [day 329] macro.cpi: CPI 0.21% on the month, 3.3% on the year
      <- [day 329] firm.price frm_titan_machine: industrial machinery price +1.9% this month (unit cost 0.1%, 30 tight days)
        <- [day 299] macro.demand: household spending 0.40M per day
    <- [day 329] macro.jobs: unemployment 6.1%
      <- [day 299] macro.demand: household spending 0.40M per day
        <- [day 299] macro.cpi: CPI 0.11% on the month, 3.1% on the year
        <- [day 299] macro.jobs: unemployment 10.7%
        <- [day 269] cb.rate cb: policy rate 4.25% -> 2.25%
  <- [day 352] person.breakdown p_5000: Belen Salzelwell (30) quits Harbourline Freight after cannot cover the week
    <- [day 352] person.thought p_5000: Belen Salzelwell (30) cannot shake it: cannot cover the week
      <- [day 329] macro.demand: household spending 0.40M per day
        <- [day 329] macro.cpi: CPI 0.21% on the month, 3.3% on the year  (see above)
        <- [day 329] macro.jobs: unemployment 6.1%  (see above)
        <- [day 299] cb.rate cb: policy rate 2.25% -> 1.25%

[day 359] loan.default p_5000: Belen Salzelwell missed three payments on 62751
  <- [day 329] cb.rate cb: policy rate 1.25% -> 1.75%
    <- [day 329] macro.cpi: CPI 0.21% on the month, 3.3% on the year
      <- [day 329] firm.price frm_titan_machine: industrial machinery price +1.9% this month (unit cost 0.1%, 30 tight days)
        <- [day 299] macro.demand: household spending 0.40M per day
    <- [day 329] macro.jobs: unemployment 6.1%
      <- [day 299] macro.demand: household spending 0.40M per day
        <- [day 299] macro.cpi: CPI 0.11% on the month, 3.1% on the year
        <- [day 299] macro.jobs: unemployment 10.7%
        <- [day 269] cb.rate cb: policy rate 4.25% -> 2.25%
  <- [day 352] person.breakdown p_5000: Belen Salzelwell (30) quits Harbourline Freight after cannot cover the week
    <- [day 352] person.thought p_5000: Belen Salzelwell (30) cannot shake it: cannot cover the week
      <- [day 329] macro.demand: household spending 0.40M per day
        <- [day 329] macro.cpi: CPI 0.21% on the month, 3.3% on the year  (see above)
        <- [day 329] macro.jobs: unemployment 6.1%  (see above)
        <- [day 299] cb.rate cb: policy rate 2.25% -> 1.25%

[day 359] law.offence p_5000: Belen Salzelwell left $107745 unpaid after a default
  <- [day 359] loan.default p_5000: Belen Salzelwell missed three payments on 107745
    <- [day 329] cb.rate cb: policy rate 1.25% -> 1.75%
      <- [day 329] macro.cpi: CPI 0.21% on the month, 3.3% on the year
        <- [day 329] firm.price frm_titan_machine: industrial machinery price +1.9% this month (unit cost 0.1%, 30 tight days)
      <- [day 329] macro.jobs: unemployment 6.1%
        <- [day 299] macro.demand: household spending 0.40M per day
    <- [day 352] person.breakdown p_5000: Belen Salzelwell (30) quits Harbourline Freight after cannot cover the week
      <- [day 352] person.thought p_5000: Belen Salzelwell (30) cannot shake it: cannot cover the week
        <- [day 329] macro.demand: household spending 0.40M per day

[day 359] law.offence p_5000: Belen Salzelwell left $62751 unpaid after a default
  <- [day 359] loan.default p_5000: Belen Salzelwell missed three payments on 62751
    <- [day 329] cb.rate cb: policy rate 1.25% -> 1.75%
      <- [day 329] macro.cpi: CPI 0.21% on the month, 3.3% on the year
        <- [day 329] firm.price frm_titan_machine: industrial machinery price +1.9% this month (unit cost 0.1%, 30 tight days)
      <- [day 329] macro.jobs: unemployment 6.1%
        <- [day 299] macro.demand: household spending 0.40M per day
    <- [day 352] person.breakdown p_5000: Belen Salzelwell (30) quits Harbourline Freight after cannot cover the week
      <- [day 352] person.thought p_5000: Belen Salzelwell (30) cannot shake it: cannot cover the week
        <- [day 329] macro.demand: household spending 0.40M per day
```

- Day 5430: $5,222,642 → $5,415,630

```
[day 5429] loan.default p_5000: Belen Salzelwell missed three payments on 149325
  <- [day 5399] cb.rate cb: policy rate 3.50% -> 3.25%
    <- [day 5399] macro.cpi: CPI 0.07% on the month, 1.2% on the year
      <- [day 5399] firm.price frm_verdant: fertilizer price -3.0% this month (unit cost 0.1%, 0 tight days)
        <- [day 5369] macro.demand: household spending 0.72M per day
      <- [day 5399] firm.price frm_titan_machine: industrial machinery price +2.3% this month (unit cost 0.1%, 29 tight days)
        <- [day 5369] macro.demand: household spending 0.72M per day
    <- [day 5399] macro.jobs: unemployment 8.4%
      <- [day 5369] macro.demand: household spending 0.72M per day
        <- [day 5369] macro.cpi: CPI -0.00% on the month, 1.4% on the year
        <- [day 5369] macro.jobs: unemployment 7.3%
        <- [day 5339] cb.rate cb: policy rate 4.00% -> 3.75%

[day 5429] loan.default p_5000: Belen Salzelwell missed three payments on 42682
  <- [day 5399] cb.rate cb: policy rate 3.50% -> 3.25%
    <- [day 5399] macro.cpi: CPI 0.07% on the month, 1.2% on the year
      <- [day 5399] firm.price frm_verdant: fertilizer price -3.0% this month (unit cost 0.1%, 0 tight days)
        <- [day 5369] macro.demand: household spending 0.72M per day
      <- [day 5399] firm.price frm_titan_machine: industrial machinery price +2.3% this month (unit cost 0.1%, 29 tight days)
        <- [day 5369] macro.demand: household spending 0.72M per day
    <- [day 5399] macro.jobs: unemployment 8.4%
      <- [day 5369] macro.demand: household spending 0.72M per day
        <- [day 5369] macro.cpi: CPI -0.00% on the month, 1.4% on the year
        <- [day 5369] macro.jobs: unemployment 7.3%
        <- [day 5339] cb.rate cb: policy rate 4.00% -> 3.75%

[day 5429] loan.default p_5000: Belen Salzelwell missed three payments on 1733
  <- [day 5399] cb.rate cb: policy rate 3.50% -> 3.25%
    <- [day 5399] macro.cpi: CPI 0.07% on the month, 1.2% on the year
      <- [day 5399] firm.price frm_verdant: fertilizer price -3.0% this month (unit cost 0.1%, 0 tight days)
        <- [day 5369] macro.demand: household spending 0.72M per day
      <- [day 5399] firm.price frm_titan_machine: industrial machinery price +2.3% this month (unit cost 0.1%, 29 tight days)
        <- [day 5369] macro.demand: household spending 0.72M per day
    <- [day 5399] macro.jobs: unemployment 8.4%
      <- [day 5369] macro.demand: household spending 0.72M per day
        <- [day 5369] macro.cpi: CPI -0.00% on the month, 1.4% on the year
        <- [day 5369] macro.jobs: unemployment 7.3%
        <- [day 5339] cb.rate cb: policy rate 4.00% -> 3.75%

[day 5429] law.offence p_5000: Belen Salzelwell left $149325 unpaid after a default
  <- [day 5429] loan.default p_5000: Belen Salzelwell missed three payments on 149325
    <- [day 5399] cb.rate cb: policy rate 3.50% -> 3.25%
      <- [day 5399] macro.cpi: CPI 0.07% on the month, 1.2% on the year
        <- [day 5399] firm.price frm_verdant: fertilizer price -3.0% this month (unit cost 0.1%, 0 tight days)
        <- [day 5399] firm.price frm_titan_machine: industrial machinery price +2.3% this month (unit cost 0.1%, 29 tight days)
      <- [day 5399] macro.jobs: unemployment 8.4%
        <- [day 5369] macro.demand: household spending 0.72M per day
```

- Day 2100: $2,342,045 → $2,482,716

```
[day 2099] loan.default p_5000: Belen Salzelwell missed three payments on 140293
  <- [day 2069] cb.rate cb: policy rate 4.25% -> 4.75%
    <- [day 2069] macro.cpi: CPI 0.21% on the month, 2.7% on the year
      <- [day 2069] firm.price frm_titan_machine: industrial machinery price -2.0% this month (unit cost -0.2%, 0 tight days)
        <- [day 2039] macro.demand: household spending 0.50M per day
    <- [day 2069] macro.jobs: unemployment 4.1%
      <- [day 2039] macro.demand: household spending 0.50M per day
        <- [day 2039] macro.cpi: CPI 0.24% on the month, 3.0% on the year
        <- [day 2039] macro.jobs: unemployment 5.6%
        <- [day 2009] cb.rate cb: policy rate 3.75% -> 4.00%

[day 2099] loan.default p_5000: Belen Salzelwell missed three payments on 378
  <- [day 2069] cb.rate cb: policy rate 4.25% -> 4.75%
    <- [day 2069] macro.cpi: CPI 0.21% on the month, 2.7% on the year
      <- [day 2069] firm.price frm_titan_machine: industrial machinery price -2.0% this month (unit cost -0.2%, 0 tight days)
        <- [day 2039] macro.demand: household spending 0.50M per day
    <- [day 2069] macro.jobs: unemployment 4.1%
      <- [day 2039] macro.demand: household spending 0.50M per day
        <- [day 2039] macro.cpi: CPI 0.24% on the month, 3.0% on the year
        <- [day 2039] macro.jobs: unemployment 5.6%
        <- [day 2009] cb.rate cb: policy rate 3.75% -> 4.00%

[day 2099] law.offence p_5000: Belen Salzelwell left $140293 unpaid after a default
  <- [day 2099] loan.default p_5000: Belen Salzelwell missed three payments on 140293
    <- [day 2069] cb.rate cb: policy rate 4.25% -> 4.75%
      <- [day 2069] macro.cpi: CPI 0.21% on the month, 2.7% on the year
        <- [day 2069] firm.price frm_titan_machine: industrial machinery price -2.0% this month (unit cost -0.2%, 0 tight days)
      <- [day 2069] macro.jobs: unemployment 4.1%
        <- [day 2039] macro.demand: household spending 0.50M per day
```

- Day 6903: $8,522,938 → $8,636,285

```
(no event that day names the player; the move is a mark)
```

- Day 6902: $8,411,209 → $8,522,938

```
(no event that day names the player; the move is a mark)
```

### gambler seed 8 — 92.75x

Start $150,000, end $13,912,623, 7200 days. Year-end worth: day 360 $623,523; day 720 $931,151; day 1080 $984,800; day 1440 $1,045,830; day 1800 $1,727,849; day 2160 $1,716,241; day 2520 $1,587,107; day 2880 $1,779,553; day 3240 $2,262,773; day 3600 $2,478,994; day 3960 $2,790,724; day 4320 $3,090,623; day 4680 $4,006,563; day 5040 $4,477,870; day 5400 $4,913,659; day 5760 $5,690,105; day 6120 $7,485,930; day 6480 $8,676,975; day 6840 $11,489,885; day 7200 $13,912,623.

Biggest up-days:

- Day 6030: $6,774,360 → $7,202,497

```
[day 6029] loan.default p_5000: Elen Orhalard missed three payments on 100358
  <- [day 5969] cb.rate cb: policy rate 8.75% -> 8.50%
    <- [day 5969] macro.cpi: CPI 0.29% on the month, 4.8% on the year
      <- [day 5969] firm.price frm_forgeworks: steel price +2.9% this month (unit cost 0.9%, 30 tight days)
        <- [day 5940] firm.inputShort frm_forgeworks: could not buy enough iron ore; output cut
        <- [day 5969] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 5939] macro.wage: wages 0.28% this month
      <- [day 5969] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 5940] firm.stockout frm_redhill: sold out of iron ore; demand unmet
      <- [day 5969] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.6%, 26 tight days)
        <- [day 5939] macro.demand: household spending 0.80M per day
    <- [day 5969] macro.jobs: unemployment 4.4%
      <- [day 5939] macro.demand: household spending 0.80M per day
        <- [day 5939] macro.cpi: CPI 0.18% on the month, 4.9% on the year
        <- [day 5939] macro.jobs: unemployment 4.4%
        <- [day 5909] cb.rate cb: policy rate 10.00% -> 9.25%
  <- [day 5820] firm.layoffs frm_voltana: sales of electricity below plan: laying off staff
    <- [day 5819] firm.price frm_voltana: electricity price +1.6% this month (unit cost 1.1%, 0 tight days)
      <- [day 5789] firm.price frm_blackvein: coal price +1.8% this month (unit cost 1.8%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
        <- [day 5759] firm.price frm_titan_machine: industrial machinery price +2.4% this month (unit cost 0.6%, 27 tight days)
        <- [day 5759] macro.wage: wages 0.91% this month
      <- [day 5789] firm.price frm_saltmarsh_gas: natural gas price +1.8% this month (unit cost 1.6%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
        <- [day 5759] firm.price frm_titan_machine: industrial machinery price +2.4% this month (unit cost 0.6%, 27 tight days)
        <- [day 5759] macro.wage: wages 0.91% this month
      <- [day 5789] firm.price frm_titan_machine: industrial machinery price +2.6% this month (unit cost 0.9%, 30 tight days)
        <- [day 5789] firm.price frm_ruddy_metals: copper price +1.7% this month (unit cost 1.4%, 0 tight days)
        <- [day 5789] firm.price frm_silicrest: semiconductors price +1.6% this month (unit cost 1.6%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
      <- [day 5789] macro.wage: wages 0.83% this month
        <- [day 5789] macro.jobs: unemployment 5.1%
        <- [day 5789] macro.cpi: CPI 1.35% on the month, 6.9% on the year

[day 6029] loan.default p_5000: Elen Orhalard missed three payments on 706
  <- [day 5969] cb.rate cb: policy rate 8.75% -> 8.50%
    <- [day 5969] macro.cpi: CPI 0.29% on the month, 4.8% on the year
      <- [day 5969] firm.price frm_forgeworks: steel price +2.9% this month (unit cost 0.9%, 30 tight days)
        <- [day 5940] firm.inputShort frm_forgeworks: could not buy enough iron ore; output cut
        <- [day 5969] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 5939] macro.wage: wages 0.28% this month
      <- [day 5969] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 5940] firm.stockout frm_redhill: sold out of iron ore; demand unmet
      <- [day 5969] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.6%, 26 tight days)
        <- [day 5939] macro.demand: household spending 0.80M per day
    <- [day 5969] macro.jobs: unemployment 4.4%
      <- [day 5939] macro.demand: household spending 0.80M per day
        <- [day 5939] macro.cpi: CPI 0.18% on the month, 4.9% on the year
        <- [day 5939] macro.jobs: unemployment 4.4%
        <- [day 5909] cb.rate cb: policy rate 10.00% -> 9.25%
  <- [day 5820] firm.layoffs frm_voltana: sales of electricity below plan: laying off staff
    <- [day 5819] firm.price frm_voltana: electricity price +1.6% this month (unit cost 1.1%, 0 tight days)
      <- [day 5789] firm.price frm_blackvein: coal price +1.8% this month (unit cost 1.8%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
        <- [day 5759] firm.price frm_titan_machine: industrial machinery price +2.4% this month (unit cost 0.6%, 27 tight days)
        <- [day 5759] macro.wage: wages 0.91% this month
      <- [day 5789] firm.price frm_saltmarsh_gas: natural gas price +1.8% this month (unit cost 1.6%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
        <- [day 5759] firm.price frm_titan_machine: industrial machinery price +2.4% this month (unit cost 0.6%, 27 tight days)
        <- [day 5759] macro.wage: wages 0.91% this month
      <- [day 5789] firm.price frm_titan_machine: industrial machinery price +2.6% this month (unit cost 0.9%, 30 tight days)
        <- [day 5789] firm.price frm_ruddy_metals: copper price +1.7% this month (unit cost 1.4%, 0 tight days)
        <- [day 5789] firm.price frm_silicrest: semiconductors price +1.6% this month (unit cost 1.6%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
      <- [day 5789] macro.wage: wages 0.83% this month
        <- [day 5789] macro.jobs: unemployment 5.1%
        <- [day 5789] macro.cpi: CPI 1.35% on the month, 6.9% on the year

[day 6029] loan.default p_5000: Elen Orhalard missed three payments on 23032
  <- [day 5969] cb.rate cb: policy rate 8.75% -> 8.50%
    <- [day 5969] macro.cpi: CPI 0.29% on the month, 4.8% on the year
      <- [day 5969] firm.price frm_forgeworks: steel price +2.9% this month (unit cost 0.9%, 30 tight days)
        <- [day 5940] firm.inputShort frm_forgeworks: could not buy enough iron ore; output cut
        <- [day 5969] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 5939] macro.wage: wages 0.28% this month
      <- [day 5969] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 5940] firm.stockout frm_redhill: sold out of iron ore; demand unmet
      <- [day 5969] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.6%, 26 tight days)
        <- [day 5939] macro.demand: household spending 0.80M per day
    <- [day 5969] macro.jobs: unemployment 4.4%
      <- [day 5939] macro.demand: household spending 0.80M per day
        <- [day 5939] macro.cpi: CPI 0.18% on the month, 4.9% on the year
        <- [day 5939] macro.jobs: unemployment 4.4%
        <- [day 5909] cb.rate cb: policy rate 10.00% -> 9.25%
  <- [day 5820] firm.layoffs frm_voltana: sales of electricity below plan: laying off staff
    <- [day 5819] firm.price frm_voltana: electricity price +1.6% this month (unit cost 1.1%, 0 tight days)
      <- [day 5789] firm.price frm_blackvein: coal price +1.8% this month (unit cost 1.8%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
        <- [day 5759] firm.price frm_titan_machine: industrial machinery price +2.4% this month (unit cost 0.6%, 27 tight days)
        <- [day 5759] macro.wage: wages 0.91% this month
      <- [day 5789] firm.price frm_saltmarsh_gas: natural gas price +1.8% this month (unit cost 1.6%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
        <- [day 5759] firm.price frm_titan_machine: industrial machinery price +2.4% this month (unit cost 0.6%, 27 tight days)
        <- [day 5759] macro.wage: wages 0.91% this month
      <- [day 5789] firm.price frm_titan_machine: industrial machinery price +2.6% this month (unit cost 0.9%, 30 tight days)
        <- [day 5789] firm.price frm_ruddy_metals: copper price +1.7% this month (unit cost 1.4%, 0 tight days)
        <- [day 5789] firm.price frm_silicrest: semiconductors price +1.6% this month (unit cost 1.6%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
      <- [day 5789] macro.wage: wages 0.83% this month
        <- [day 5789] macro.jobs: unemployment 5.1%
        <- [day 5789] macro.cpi: CPI 1.35% on the month, 6.9% on the year

[day 6029] loan.default p_5000: Elen Orhalard missed three payments on 129480
  <- [day 5969] cb.rate cb: policy rate 8.75% -> 8.50%
    <- [day 5969] macro.cpi: CPI 0.29% on the month, 4.8% on the year
      <- [day 5969] firm.price frm_forgeworks: steel price +2.9% this month (unit cost 0.9%, 30 tight days)
        <- [day 5940] firm.inputShort frm_forgeworks: could not buy enough iron ore; output cut
        <- [day 5969] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 5939] macro.wage: wages 0.28% this month
      <- [day 5969] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 5940] firm.stockout frm_redhill: sold out of iron ore; demand unmet
      <- [day 5969] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.6%, 26 tight days)
        <- [day 5939] macro.demand: household spending 0.80M per day
    <- [day 5969] macro.jobs: unemployment 4.4%
      <- [day 5939] macro.demand: household spending 0.80M per day
        <- [day 5939] macro.cpi: CPI 0.18% on the month, 4.9% on the year
        <- [day 5939] macro.jobs: unemployment 4.4%
        <- [day 5909] cb.rate cb: policy rate 10.00% -> 9.25%
  <- [day 5820] firm.layoffs frm_voltana: sales of electricity below plan: laying off staff
    <- [day 5819] firm.price frm_voltana: electricity price +1.6% this month (unit cost 1.1%, 0 tight days)
      <- [day 5789] firm.price frm_blackvein: coal price +1.8% this month (unit cost 1.8%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
        <- [day 5759] firm.price frm_titan_machine: industrial machinery price +2.4% this month (unit cost 0.6%, 27 tight days)
        <- [day 5759] macro.wage: wages 0.91% this month
      <- [day 5789] firm.price frm_saltmarsh_gas: natural gas price +1.8% this month (unit cost 1.6%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
        <- [day 5759] firm.price frm_titan_machine: industrial machinery price +2.4% this month (unit cost 0.6%, 27 tight days)
        <- [day 5759] macro.wage: wages 0.91% this month
      <- [day 5789] firm.price frm_titan_machine: industrial machinery price +2.6% this month (unit cost 0.9%, 30 tight days)
        <- [day 5789] firm.price frm_ruddy_metals: copper price +1.7% this month (unit cost 1.4%, 0 tight days)
        <- [day 5789] firm.price frm_silicrest: semiconductors price +1.6% this month (unit cost 1.6%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
      <- [day 5789] macro.wage: wages 0.83% this month
        <- [day 5789] macro.jobs: unemployment 5.1%
        <- [day 5789] macro.cpi: CPI 1.35% on the month, 6.9% on the year

[day 6029] loan.default p_5000: Elen Orhalard missed three payments on 34642
  <- [day 5969] cb.rate cb: policy rate 8.75% -> 8.50%
    <- [day 5969] macro.cpi: CPI 0.29% on the month, 4.8% on the year
      <- [day 5969] firm.price frm_forgeworks: steel price +2.9% this month (unit cost 0.9%, 30 tight days)
        <- [day 5940] firm.inputShort frm_forgeworks: could not buy enough iron ore; output cut
        <- [day 5969] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 5939] macro.wage: wages 0.28% this month
      <- [day 5969] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 5940] firm.stockout frm_redhill: sold out of iron ore; demand unmet
      <- [day 5969] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.6%, 26 tight days)
        <- [day 5939] macro.demand: household spending 0.80M per day
    <- [day 5969] macro.jobs: unemployment 4.4%
      <- [day 5939] macro.demand: household spending 0.80M per day
        <- [day 5939] macro.cpi: CPI 0.18% on the month, 4.9% on the year
        <- [day 5939] macro.jobs: unemployment 4.4%
        <- [day 5909] cb.rate cb: policy rate 10.00% -> 9.25%
  <- [day 5820] firm.layoffs frm_voltana: sales of electricity below plan: laying off staff
    <- [day 5819] firm.price frm_voltana: electricity price +1.6% this month (unit cost 1.1%, 0 tight days)
      <- [day 5789] firm.price frm_blackvein: coal price +1.8% this month (unit cost 1.8%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
        <- [day 5759] firm.price frm_titan_machine: industrial machinery price +2.4% this month (unit cost 0.6%, 27 tight days)
        <- [day 5759] macro.wage: wages 0.91% this month
      <- [day 5789] firm.price frm_saltmarsh_gas: natural gas price +1.8% this month (unit cost 1.6%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
        <- [day 5759] firm.price frm_titan_machine: industrial machinery price +2.4% this month (unit cost 0.6%, 27 tight days)
        <- [day 5759] macro.wage: wages 0.91% this month
      <- [day 5789] firm.price frm_titan_machine: industrial machinery price +2.6% this month (unit cost 0.9%, 30 tight days)
        <- [day 5789] firm.price frm_ruddy_metals: copper price +1.7% this month (unit cost 1.4%, 0 tight days)
        <- [day 5789] firm.price frm_silicrest: semiconductors price +1.6% this month (unit cost 1.6%, 0 tight days)
        <- [day 5789] firm.price frm_northgrid: electricity price +10.8% this month (unit cost 9.8%, 25 tight days)
        <- [day 5789] firm.price frm_voltana: electricity price +10.7% this month (unit cost 9.8%, 21 tight days)
      <- [day 5789] macro.wage: wages 0.83% this month
        <- [day 5789] macro.jobs: unemployment 5.1%
        <- [day 5789] macro.cpi: CPI 1.35% on the month, 6.9% on the year
```

- Day 1800: $1,407,442 → $1,727,849

```
[day 1799] loan.default p_5000: Elen Orhalard missed three payments on 17095
  <- [day 1769] cb.rate cb: policy rate 8.50% -> 8.25%
    <- [day 1769] macro.cpi: CPI 0.08% on the month, 5.9% on the year
      <- [day 1769] firm.price frm_titan_machine: industrial machinery price -4.7% this month (unit cost -0.7%, 0 tight days)
        <- [day 1739] macro.demand: household spending 0.50M per day
      <- [day 1769] firm.price frm_redhill: iron ore price -2.7% this month (unit cost 0.0%, 7 tight days)
        <- [day 1739] macro.demand: household spending 0.50M per day
      <- [day 1769] firm.price frm_forgeworks: steel price -2.3% this month (unit cost -1.1%, 4 tight days)
        <- [day 1769] firm.price frm_redhill: iron ore price -2.7% this month (unit cost 0.0%, 7 tight days)  (see above)
        <- [day 1649] macro.wage: wages 0.31% this month
    <- [day 1769] macro.jobs: unemployment 6.0%
      <- [day 1739] macro.demand: household spending 0.50M per day
        <- [day 1739] macro.cpi: CPI 0.35% on the month, 6.3% on the year
        <- [day 1739] macro.jobs: unemployment 8.6%
        <- [day 1679] cb.rate cb: policy rate 9.75% -> 8.75%
  <- [day 1708] firm.layoffs frm_cornerstone: sales of housing below plan: laying off staff
    <- [day 1679] macro.demand: household spending 0.51M per day
      <- [day 1679] macro.cpi: CPI 0.30% on the month, 7.0% on the year
        <- [day 1679] firm.price frm_titan_machine: industrial machinery price -2.5% this month (unit cost -0.0%, 3 tight days)
      <- [day 1679] macro.jobs: unemployment 10.2%
        <- [day 1649] macro.demand: household spending 0.52M per day
      <- [day 1619] cb.rate cb: policy rate 9.50% -> 9.75%
        <- [day 1619] macro.cpi: CPI 0.40% on the month, 4.4% on the year
        <- [day 1619] macro.jobs: unemployment 5.6%

[day 1799] loan.default p_5000: Elen Orhalard missed three payments on 9943
  <- [day 1769] cb.rate cb: policy rate 8.50% -> 8.25%
    <- [day 1769] macro.cpi: CPI 0.08% on the month, 5.9% on the year
      <- [day 1769] firm.price frm_titan_machine: industrial machinery price -4.7% this month (unit cost -0.7%, 0 tight days)
        <- [day 1739] macro.demand: household spending 0.50M per day
      <- [day 1769] firm.price frm_redhill: iron ore price -2.7% this month (unit cost 0.0%, 7 tight days)
        <- [day 1739] macro.demand: household spending 0.50M per day
      <- [day 1769] firm.price frm_forgeworks: steel price -2.3% this month (unit cost -1.1%, 4 tight days)
        <- [day 1769] firm.price frm_redhill: iron ore price -2.7% this month (unit cost 0.0%, 7 tight days)  (see above)
        <- [day 1649] macro.wage: wages 0.31% this month
    <- [day 1769] macro.jobs: unemployment 6.0%
      <- [day 1739] macro.demand: household spending 0.50M per day
        <- [day 1739] macro.cpi: CPI 0.35% on the month, 6.3% on the year
        <- [day 1739] macro.jobs: unemployment 8.6%
        <- [day 1679] cb.rate cb: policy rate 9.75% -> 8.75%
  <- [day 1708] firm.layoffs frm_cornerstone: sales of housing below plan: laying off staff
    <- [day 1679] macro.demand: household spending 0.51M per day
      <- [day 1679] macro.cpi: CPI 0.30% on the month, 7.0% on the year
        <- [day 1679] firm.price frm_titan_machine: industrial machinery price -2.5% this month (unit cost -0.0%, 3 tight days)
      <- [day 1679] macro.jobs: unemployment 10.2%
        <- [day 1649] macro.demand: household spending 0.52M per day
      <- [day 1619] cb.rate cb: policy rate 9.50% -> 9.75%
        <- [day 1619] macro.cpi: CPI 0.40% on the month, 4.4% on the year
        <- [day 1619] macro.jobs: unemployment 5.6%

[day 1799] loan.default p_5000: Elen Orhalard missed three payments on 22350
  <- [day 1769] cb.rate cb: policy rate 8.50% -> 8.25%
    <- [day 1769] macro.cpi: CPI 0.08% on the month, 5.9% on the year
      <- [day 1769] firm.price frm_titan_machine: industrial machinery price -4.7% this month (unit cost -0.7%, 0 tight days)
        <- [day 1739] macro.demand: household spending 0.50M per day
      <- [day 1769] firm.price frm_redhill: iron ore price -2.7% this month (unit cost 0.0%, 7 tight days)
        <- [day 1739] macro.demand: household spending 0.50M per day
      <- [day 1769] firm.price frm_forgeworks: steel price -2.3% this month (unit cost -1.1%, 4 tight days)
        <- [day 1769] firm.price frm_redhill: iron ore price -2.7% this month (unit cost 0.0%, 7 tight days)  (see above)
        <- [day 1649] macro.wage: wages 0.31% this month
    <- [day 1769] macro.jobs: unemployment 6.0%
      <- [day 1739] macro.demand: household spending 0.50M per day
        <- [day 1739] macro.cpi: CPI 0.35% on the month, 6.3% on the year
        <- [day 1739] macro.jobs: unemployment 8.6%
        <- [day 1679] cb.rate cb: policy rate 9.75% -> 8.75%
  <- [day 1708] firm.layoffs frm_cornerstone: sales of housing below plan: laying off staff
    <- [day 1679] macro.demand: household spending 0.51M per day
      <- [day 1679] macro.cpi: CPI 0.30% on the month, 7.0% on the year
        <- [day 1679] firm.price frm_titan_machine: industrial machinery price -2.5% this month (unit cost -0.0%, 3 tight days)
      <- [day 1679] macro.jobs: unemployment 10.2%
        <- [day 1649] macro.demand: household spending 0.52M per day
      <- [day 1619] cb.rate cb: policy rate 9.50% -> 9.75%
        <- [day 1619] macro.cpi: CPI 0.40% on the month, 4.4% on the year
        <- [day 1619] macro.jobs: unemployment 5.6%

[day 1799] loan.default p_5000: Elen Orhalard missed three payments on 45842
  <- [day 1769] cb.rate cb: policy rate 8.50% -> 8.25%
    <- [day 1769] macro.cpi: CPI 0.08% on the month, 5.9% on the year
      <- [day 1769] firm.price frm_titan_machine: industrial machinery price -4.7% this month (unit cost -0.7%, 0 tight days)
        <- [day 1739] macro.demand: household spending 0.50M per day
      <- [day 1769] firm.price frm_redhill: iron ore price -2.7% this month (unit cost 0.0%, 7 tight days)
        <- [day 1739] macro.demand: household spending 0.50M per day
      <- [day 1769] firm.price frm_forgeworks: steel price -2.3% this month (unit cost -1.1%, 4 tight days)
        <- [day 1769] firm.price frm_redhill: iron ore price -2.7% this month (unit cost 0.0%, 7 tight days)  (see above)
        <- [day 1649] macro.wage: wages 0.31% this month
    <- [day 1769] macro.jobs: unemployment 6.0%
      <- [day 1739] macro.demand: household spending 0.50M per day
        <- [day 1739] macro.cpi: CPI 0.35% on the month, 6.3% on the year
        <- [day 1739] macro.jobs: unemployment 8.6%
        <- [day 1679] cb.rate cb: policy rate 9.75% -> 8.75%
  <- [day 1708] firm.layoffs frm_cornerstone: sales of housing below plan: laying off staff
    <- [day 1679] macro.demand: household spending 0.51M per day
      <- [day 1679] macro.cpi: CPI 0.30% on the month, 7.0% on the year
        <- [day 1679] firm.price frm_titan_machine: industrial machinery price -2.5% this month (unit cost -0.0%, 3 tight days)
      <- [day 1679] macro.jobs: unemployment 10.2%
        <- [day 1649] macro.demand: household spending 0.52M per day
      <- [day 1619] cb.rate cb: policy rate 9.50% -> 9.75%
        <- [day 1619] macro.cpi: CPI 0.40% on the month, 4.4% on the year
        <- [day 1619] macro.jobs: unemployment 5.6%

[day 1799] loan.default p_5000: Elen Orhalard missed three payments on 39503
  <- [day 1769] cb.rate cb: policy rate 8.50% -> 8.25%
    <- [day 1769] macro.cpi: CPI 0.08% on the month, 5.9% on the year
      <- [day 1769] firm.price frm_titan_machine: industrial machinery price -4.7% this month (unit cost -0.7%, 0 tight days)
        <- [day 1739] macro.demand: household spending 0.50M per day
      <- [day 1769] firm.price frm_redhill: iron ore price -2.7% this month (unit cost 0.0%, 7 tight days)
        <- [day 1739] macro.demand: household spending 0.50M per day
      <- [day 1769] firm.price frm_forgeworks: steel price -2.3% this month (unit cost -1.1%, 4 tight days)
        <- [day 1769] firm.price frm_redhill: iron ore price -2.7% this month (unit cost 0.0%, 7 tight days)  (see above)
        <- [day 1649] macro.wage: wages 0.31% this month
    <- [day 1769] macro.jobs: unemployment 6.0%
      <- [day 1739] macro.demand: household spending 0.50M per day
        <- [day 1739] macro.cpi: CPI 0.35% on the month, 6.3% on the year
        <- [day 1739] macro.jobs: unemployment 8.6%
        <- [day 1679] cb.rate cb: policy rate 9.75% -> 8.75%
  <- [day 1708] firm.layoffs frm_cornerstone: sales of housing below plan: laying off staff
    <- [day 1679] macro.demand: household spending 0.51M per day
      <- [day 1679] macro.cpi: CPI 0.30% on the month, 7.0% on the year
        <- [day 1679] firm.price frm_titan_machine: industrial machinery price -2.5% this month (unit cost -0.0%, 3 tight days)
      <- [day 1679] macro.jobs: unemployment 10.2%
        <- [day 1649] macro.demand: household spending 0.52M per day
      <- [day 1619] cb.rate cb: policy rate 9.50% -> 9.75%
        <- [day 1619] macro.cpi: CPI 0.40% on the month, 4.4% on the year
        <- [day 1619] macro.jobs: unemployment 5.6%
```

- Day 4620: $3,661,123 → $3,907,072

```
[day 4619] loan.default p_5000: Elen Orhalard missed three payments on 71453
  <- [day 4589] cb.rate cb: policy rate 6.25% -> 6.00%
    <- [day 4589] macro.cpi: CPI 0.05% on the month, 3.9% on the year
      <- [day 4589] firm.price frm_salar: lithium price +1.9% this month (unit cost 0.1%, 29 tight days)
        <- [day 4577] firm.stockout frm_salar: sold out of lithium; demand unmet
      <- [day 4589] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.1%, 20 tight days)
        <- [day 4559] macro.demand: household spending 0.64M per day
    <- [day 4589] macro.jobs: unemployment 6.3%
      <- [day 4559] macro.demand: household spending 0.64M per day
        <- [day 4559] macro.cpi: CPI 0.25% on the month, 3.9% on the year
        <- [day 4559] macro.jobs: unemployment 8.6%
        <- [day 4529] cb.rate cb: policy rate 7.50% -> 6.75%
  <- [day 4619] firm.cashCrunch frm_titan_machine: no cash and no credit: paid 77% of wages and cut 17% of the staff
    <- [day 4589] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.1%, 20 tight days)  (see above)

[day 4619] loan.default p_5000: Elen Orhalard missed three payments on 39036
  <- [day 4589] cb.rate cb: policy rate 6.25% -> 6.00%
    <- [day 4589] macro.cpi: CPI 0.05% on the month, 3.9% on the year
      <- [day 4589] firm.price frm_salar: lithium price +1.9% this month (unit cost 0.1%, 29 tight days)
        <- [day 4577] firm.stockout frm_salar: sold out of lithium; demand unmet
      <- [day 4589] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.1%, 20 tight days)
        <- [day 4559] macro.demand: household spending 0.64M per day
    <- [day 4589] macro.jobs: unemployment 6.3%
      <- [day 4559] macro.demand: household spending 0.64M per day
        <- [day 4559] macro.cpi: CPI 0.25% on the month, 3.9% on the year
        <- [day 4559] macro.jobs: unemployment 8.6%
        <- [day 4529] cb.rate cb: policy rate 7.50% -> 6.75%
  <- [day 4619] firm.cashCrunch frm_titan_machine: no cash and no credit: paid 77% of wages and cut 17% of the staff
    <- [day 4589] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.1%, 20 tight days)  (see above)

[day 4619] loan.default p_5000: Elen Orhalard missed three payments on 55
  <- [day 4589] cb.rate cb: policy rate 6.25% -> 6.00%
    <- [day 4589] macro.cpi: CPI 0.05% on the month, 3.9% on the year
      <- [day 4589] firm.price frm_salar: lithium price +1.9% this month (unit cost 0.1%, 29 tight days)
        <- [day 4577] firm.stockout frm_salar: sold out of lithium; demand unmet
      <- [day 4589] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.1%, 20 tight days)
        <- [day 4559] macro.demand: household spending 0.64M per day
    <- [day 4589] macro.jobs: unemployment 6.3%
      <- [day 4559] macro.demand: household spending 0.64M per day
        <- [day 4559] macro.cpi: CPI 0.25% on the month, 3.9% on the year
        <- [day 4559] macro.jobs: unemployment 8.6%
        <- [day 4529] cb.rate cb: policy rate 7.50% -> 6.75%
  <- [day 4619] firm.cashCrunch frm_titan_machine: no cash and no credit: paid 77% of wages and cut 17% of the staff
    <- [day 4589] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.1%, 20 tight days)  (see above)

[day 4619] loan.default p_5000: Elen Orhalard missed three payments on 8
  <- [day 4589] cb.rate cb: policy rate 6.25% -> 6.00%
    <- [day 4589] macro.cpi: CPI 0.05% on the month, 3.9% on the year
      <- [day 4589] firm.price frm_salar: lithium price +1.9% this month (unit cost 0.1%, 29 tight days)
        <- [day 4577] firm.stockout frm_salar: sold out of lithium; demand unmet
      <- [day 4589] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.1%, 20 tight days)
        <- [day 4559] macro.demand: household spending 0.64M per day
    <- [day 4589] macro.jobs: unemployment 6.3%
      <- [day 4559] macro.demand: household spending 0.64M per day
        <- [day 4559] macro.cpi: CPI 0.25% on the month, 3.9% on the year
        <- [day 4559] macro.jobs: unemployment 8.6%
        <- [day 4529] cb.rate cb: policy rate 7.50% -> 6.75%
  <- [day 4619] firm.cashCrunch frm_titan_machine: no cash and no credit: paid 77% of wages and cut 17% of the staff
    <- [day 4589] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.1%, 20 tight days)  (see above)

[day 4619] loan.default p_5000: Elen Orhalard missed three payments on 19875
  <- [day 4589] cb.rate cb: policy rate 6.25% -> 6.00%
    <- [day 4589] macro.cpi: CPI 0.05% on the month, 3.9% on the year
      <- [day 4589] firm.price frm_salar: lithium price +1.9% this month (unit cost 0.1%, 29 tight days)
        <- [day 4577] firm.stockout frm_salar: sold out of lithium; demand unmet
      <- [day 4589] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.1%, 20 tight days)
        <- [day 4559] macro.demand: household spending 0.64M per day
    <- [day 4589] macro.jobs: unemployment 6.3%
      <- [day 4559] macro.demand: household spending 0.64M per day
        <- [day 4559] macro.cpi: CPI 0.25% on the month, 3.9% on the year
        <- [day 4559] macro.jobs: unemployment 8.6%
        <- [day 4529] cb.rate cb: policy rate 7.50% -> 6.75%
  <- [day 4619] firm.cashCrunch frm_titan_machine: no cash and no credit: paid 77% of wages and cut 17% of the staff
    <- [day 4589] firm.price frm_titan_machine: industrial machinery price +1.8% this month (unit cost 0.1%, 20 tight days)  (see above)
```

- Day 7194: $13,719,759 → $13,921,317

```
(no event that day names the player; the move is a mark)
```

- Day 7164: $13,532,389 → $13,728,642

```
(no event that day names the player; the move is a mark)
```

- Day 7134: $13,350,524 → $13,544,979

```
(no event that day names the player; the move is a mark)
```

### gambler seed 9 — 52.36x

Start $150,000, end $7,854,541, 7200 days. Year-end worth: day 360 $926,999; day 720 $1,257,438; day 1080 $1,211,592; day 1440 $1,274,966; day 1800 $2,450,149; day 2160 $2,535,981; day 2520 $2,652,442; day 2880 $2,749,946; day 3240 $2,955,945; day 3600 $2,992,311; day 3960 $3,176,359; day 4320 $3,535,488; day 4680 $3,690,472; day 5040 $3,849,591; day 5400 $4,113,387; day 5760 $4,574,633; day 6120 $5,217,768; day 6480 $6,127,119; day 6840 $7,007,935; day 7200 $7,854,541.

Biggest up-days:

- Day 270: $304,408 → $668,721

```
[day 269] loan.default p_5000: Nora Elorford missed three payments on 46792
  <- [day 239] cb.rate cb: policy rate 8.25% -> 4.25%
    <- [day 239] macro.cpi: CPI -1.37% on the month, 3.2% on the year
      <- [day 239] firm.price frm_dailybasket: groceries price -1.9% this month (unit cost -0.1%, 4 tight days)
        <- [day 209] macro.demand: household spending 0.39M per day
      <- [day 239] firm.price frm_grocermart: groceries price -1.5% this month (unit cost -0.1%, 11 tight days)
        <- [day 209] macro.demand: household spending 0.39M per day
      <- [day 239] firm.price frm_emporia: general retail price -1.9% this month (unit cost -0.2%, 9 tight days)
        <- [day 209] macro.demand: household spending 0.39M per day
    <- [day 239] macro.jobs: unemployment 20.4%
      <- [day 209] macro.demand: household spending 0.39M per day
        <- [day 209] macro.cpi: CPI -0.02% on the month, 4.6% on the year
        <- [day 209] macro.jobs: unemployment 14.6%
        <- [day 179] cb.rate cb: policy rate 5.00% -> 7.25%
  <- [day 0] player.arrive p_5000: Nora Elorford arrives, aged 30, and takes a job at Silicrest
    <- [day 0] genesis: world created from seed '9'  (outside shock)

[day 269] loan.default p_5000: Nora Elorford missed three payments on 101520
  <- [day 239] cb.rate cb: policy rate 8.25% -> 4.25%
    <- [day 239] macro.cpi: CPI -1.37% on the month, 3.2% on the year
      <- [day 239] firm.price frm_dailybasket: groceries price -1.9% this month (unit cost -0.1%, 4 tight days)
        <- [day 209] macro.demand: household spending 0.39M per day
      <- [day 239] firm.price frm_grocermart: groceries price -1.5% this month (unit cost -0.1%, 11 tight days)
        <- [day 209] macro.demand: household spending 0.39M per day
      <- [day 239] firm.price frm_emporia: general retail price -1.9% this month (unit cost -0.2%, 9 tight days)
        <- [day 209] macro.demand: household spending 0.39M per day
    <- [day 239] macro.jobs: unemployment 20.4%
      <- [day 209] macro.demand: household spending 0.39M per day
        <- [day 209] macro.cpi: CPI -0.02% on the month, 4.6% on the year
        <- [day 209] macro.jobs: unemployment 14.6%
        <- [day 179] cb.rate cb: policy rate 5.00% -> 7.25%
  <- [day 0] player.arrive p_5000: Nora Elorford arrives, aged 30, and takes a job at Silicrest
    <- [day 0] genesis: world created from seed '9'  (outside shock)

[day 269] loan.default p_5000: Nora Elorford missed three payments on 211698
  <- [day 239] cb.rate cb: policy rate 8.25% -> 4.25%
    <- [day 239] macro.cpi: CPI -1.37% on the month, 3.2% on the year
      <- [day 239] firm.price frm_dailybasket: groceries price -1.9% this month (unit cost -0.1%, 4 tight days)
        <- [day 209] macro.demand: household spending 0.39M per day
      <- [day 239] firm.price frm_grocermart: groceries price -1.5% this month (unit cost -0.1%, 11 tight days)
        <- [day 209] macro.demand: household spending 0.39M per day
      <- [day 239] firm.price frm_emporia: general retail price -1.9% this month (unit cost -0.2%, 9 tight days)
        <- [day 209] macro.demand: household spending 0.39M per day
    <- [day 239] macro.jobs: unemployment 20.4%
      <- [day 209] macro.demand: household spending 0.39M per day
        <- [day 209] macro.cpi: CPI -0.02% on the month, 4.6% on the year
        <- [day 209] macro.jobs: unemployment 14.6%
        <- [day 179] cb.rate cb: policy rate 5.00% -> 7.25%
  <- [day 0] player.arrive p_5000: Nora Elorford arrives, aged 30, and takes a job at Silicrest
    <- [day 0] genesis: world created from seed '9'  (outside shock)

[day 269] law.offence p_5000: Nora Elorford left $101520 unpaid after a default
  <- [day 269] loan.default p_5000: Nora Elorford missed three payments on 101520
    <- [day 239] cb.rate cb: policy rate 8.25% -> 4.25%
      <- [day 239] macro.cpi: CPI -1.37% on the month, 3.2% on the year
        <- [day 239] firm.price frm_dailybasket: groceries price -1.9% this month (unit cost -0.1%, 4 tight days)
        <- [day 239] firm.price frm_grocermart: groceries price -1.5% this month (unit cost -0.1%, 11 tight days)
        <- [day 239] firm.price frm_emporia: general retail price -1.9% this month (unit cost -0.2%, 9 tight days)
      <- [day 239] macro.jobs: unemployment 20.4%
        <- [day 209] macro.demand: household spending 0.39M per day
    <- [day 0] player.arrive p_5000: Nora Elorford arrives, aged 30, and takes a job at Silicrest
      <- [day 0] genesis: world created from seed '9'  (outside shock)

[day 269] law.offence p_5000: Nora Elorford left $211698 unpaid after a default
  <- [day 269] loan.default p_5000: Nora Elorford missed three payments on 211698
    <- [day 239] cb.rate cb: policy rate 8.25% -> 4.25%
      <- [day 239] macro.cpi: CPI -1.37% on the month, 3.2% on the year
        <- [day 239] firm.price frm_dailybasket: groceries price -1.9% this month (unit cost -0.1%, 4 tight days)
        <- [day 239] firm.price frm_grocermart: groceries price -1.5% this month (unit cost -0.1%, 11 tight days)
        <- [day 239] firm.price frm_emporia: general retail price -1.9% this month (unit cost -0.2%, 9 tight days)
      <- [day 239] macro.jobs: unemployment 20.4%
        <- [day 209] macro.demand: household spending 0.39M per day
    <- [day 0] player.arrive p_5000: Nora Elorford arrives, aged 30, and takes a job at Silicrest
      <- [day 0] genesis: world created from seed '9'  (outside shock)
```

- Day 6240: $5,437,639 → $5,708,443

```
[day 6239] loan.default p_5000: Nora Elorford missed three payments on 277174
  <- [day 6209] cb.rate cb: policy rate 3.00% -> 2.75%
    <- [day 6209] macro.cpi: CPI 0.06% on the month, 0.4% on the year
      <- [day 6209] firm.price frm_civitas: public works price +2.0% this month (unit cost 0.2%, 30 tight days)
        <- [day 6180] firm.stockout frm_civitas: sold out of public works; demand unmet
      <- [day 6209] firm.price frm_titan_machine: industrial machinery price -1.8% this month (unit cost 0.1%, 3 tight days)
        <- [day 6179] macro.demand: household spending 0.77M per day
    <- [day 6209] macro.jobs: unemployment 8.2%
      <- [day 6179] macro.demand: household spending 0.77M per day
        <- [day 6179] macro.cpi: CPI 0.01% on the month, 1.0% on the year
        <- [day 6179] macro.jobs: unemployment 5.3%
        <- [day 6149] cb.rate cb: policy rate 3.25% -> 3.00%

[day 6239] law.offence p_5000: Nora Elorford left $277174 unpaid after a default
  <- [day 6239] loan.default p_5000: Nora Elorford missed three payments on 277174
    <- [day 6209] cb.rate cb: policy rate 3.00% -> 2.75%
      <- [day 6209] macro.cpi: CPI 0.06% on the month, 0.4% on the year
        <- [day 6209] firm.price frm_civitas: public works price +2.0% this month (unit cost 0.2%, 30 tight days)
        <- [day 6209] firm.price frm_titan_machine: industrial machinery price -1.8% this month (unit cost 0.1%, 3 tight days)
      <- [day 6209] macro.jobs: unemployment 8.2%
        <- [day 6179] macro.demand: household spending 0.77M per day
```

- Day 6870: $7,077,817 → $7,327,721

```
[day 6869] person.thought p_5000: Nora Elorford (49) cannot shake it: cannot cover the week
  <- [day 6839] macro.demand: household spending 0.77M per day
    <- [day 6839] macro.cpi: CPI 0.06% on the month, 2.3% on the year
      <- [day 6809] macro.demand: household spending 0.79M per day
        <- [day 6809] macro.cpi: CPI -0.11% on the month, 2.9% on the year
        <- [day 6809] macro.jobs: unemployment 6.2%
        <- [day 6779] cb.rate cb: policy rate 5.75% -> 5.25%
    <- [day 6839] macro.jobs: unemployment 9.0%
      <- [day 6809] macro.demand: household spending 0.79M per day  (see above)
    <- [day 6809] cb.rate cb: policy rate 5.25% -> 5.00%
      <- [day 6809] macro.cpi: CPI -0.11% on the month, 2.9% on the year
        <- [day 6809] firm.price frm_irongate: steel price -2.7% this month (unit cost -0.8%, 0 tight days)
        <- [day 6809] firm.price frm_redhill: iron ore price -2.6% this month (unit cost -0.1%, 0 tight days)
        <- [day 6809] firm.price frm_forgeworks: steel price -2.0% this month (unit cost -0.8%, 2 tight days)
      <- [day 6809] macro.jobs: unemployment 6.2%
        <- [day 6779] macro.demand: household spending 0.79M per day

[day 6869] person.breakdown p_5000: Nora Elorford (49) quits St Margaret Health after cannot cover the week
  <- [day 6869] person.thought p_5000: Nora Elorford (49) cannot shake it: cannot cover the week
    <- [day 6839] macro.demand: household spending 0.77M per day
      <- [day 6839] macro.cpi: CPI 0.06% on the month, 2.3% on the year
        <- [day 6809] macro.demand: household spending 0.79M per day
      <- [day 6839] macro.jobs: unemployment 9.0%
        <- [day 6809] macro.demand: household spending 0.79M per day
      <- [day 6809] cb.rate cb: policy rate 5.25% -> 5.00%
        <- [day 6809] macro.cpi: CPI -0.11% on the month, 2.9% on the year
        <- [day 6809] macro.jobs: unemployment 6.2%

[day 6869] loan.default p_5000: Nora Elorford missed three payments on 217760
  <- [day 6839] cb.rate cb: policy rate 5.00% -> 4.50%
    <- [day 6839] macro.cpi: CPI 0.06% on the month, 2.3% on the year
      <- [day 6809] macro.demand: household spending 0.79M per day
        <- [day 6809] macro.cpi: CPI -0.11% on the month, 2.9% on the year
        <- [day 6809] macro.jobs: unemployment 6.2%
        <- [day 6779] cb.rate cb: policy rate 5.75% -> 5.25%
    <- [day 6839] macro.jobs: unemployment 9.0%
      <- [day 6809] macro.demand: household spending 0.79M per day  (see above)
  <- [day 6869] person.breakdown p_5000: Nora Elorford (49) quits St Margaret Health after cannot cover the week
    <- [day 6869] person.thought p_5000: Nora Elorford (49) cannot shake it: cannot cover the week
      <- [day 6839] macro.demand: household spending 0.77M per day
        <- [day 6839] macro.cpi: CPI 0.06% on the month, 2.3% on the year  (see above)
        <- [day 6839] macro.jobs: unemployment 9.0%  (see above)
        <- [day 6809] cb.rate cb: policy rate 5.25% -> 5.00%

[day 6869] loan.default p_5000: Nora Elorford missed three payments on 738
  <- [day 6839] cb.rate cb: policy rate 5.00% -> 4.50%
    <- [day 6839] macro.cpi: CPI 0.06% on the month, 2.3% on the year
      <- [day 6809] macro.demand: household spending 0.79M per day
        <- [day 6809] macro.cpi: CPI -0.11% on the month, 2.9% on the year
        <- [day 6809] macro.jobs: unemployment 6.2%
        <- [day 6779] cb.rate cb: policy rate 5.75% -> 5.25%
    <- [day 6839] macro.jobs: unemployment 9.0%
      <- [day 6809] macro.demand: household spending 0.79M per day  (see above)
  <- [day 6869] person.breakdown p_5000: Nora Elorford (49) quits St Margaret Health after cannot cover the week
    <- [day 6869] person.thought p_5000: Nora Elorford (49) cannot shake it: cannot cover the week
      <- [day 6839] macro.demand: household spending 0.77M per day
        <- [day 6839] macro.cpi: CPI 0.06% on the month, 2.3% on the year  (see above)
        <- [day 6839] macro.jobs: unemployment 9.0%  (see above)
        <- [day 6809] cb.rate cb: policy rate 5.25% -> 5.00%

[day 6869] loan.default p_5000: Nora Elorford missed three payments on 9
  <- [day 6839] cb.rate cb: policy rate 5.00% -> 4.50%
    <- [day 6839] macro.cpi: CPI 0.06% on the month, 2.3% on the year
      <- [day 6809] macro.demand: household spending 0.79M per day
        <- [day 6809] macro.cpi: CPI -0.11% on the month, 2.9% on the year
        <- [day 6809] macro.jobs: unemployment 6.2%
        <- [day 6779] cb.rate cb: policy rate 5.75% -> 5.25%
    <- [day 6839] macro.jobs: unemployment 9.0%
      <- [day 6809] macro.demand: household spending 0.79M per day  (see above)
  <- [day 6869] person.breakdown p_5000: Nora Elorford (49) quits St Margaret Health after cannot cover the week
    <- [day 6869] person.thought p_5000: Nora Elorford (49) cannot shake it: cannot cover the week
      <- [day 6839] macro.demand: household spending 0.77M per day
        <- [day 6839] macro.cpi: CPI 0.06% on the month, 2.3% on the year  (see above)
        <- [day 6839] macro.jobs: unemployment 9.0%  (see above)
        <- [day 6809] cb.rate cb: policy rate 5.25% -> 5.00%
```

- Day 1590: $1,201,777 → $1,334,416

```
[day 1589] loan.default p_5000: Nora Elorford missed three payments on 76786
  <- [day 1559] cb.rate cb: policy rate 10.25% -> 8.75%
    <- [day 1559] macro.cpi: CPI 0.14% on the month, 6.7% on the year
      <- [day 1559] firm.price frm_sawyer: lumber price -5.0% this month (unit cost -1.7%, 0 tight days)
        <- [day 1559] firm.price frm_tallpine: timber price -3.2% this month (unit cost 0.4%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
      <- [day 1559] firm.price frm_bedrock: cement price -4.5% this month (unit cost -1.0%, 0 tight days)
        <- [day 1559] firm.price frm_greystone: sand and gravel price -3.1% this month (unit cost 0.4%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
      <- [day 1559] firm.price frm_ruddy_metals: copper price +3.2% this month (unit cost 1.3%, 30 tight days)
        <- [day 1530] firm.stockout frm_ruddy_metals: sold out of copper; demand unmet
        <- [day 1530] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1559] firm.price frm_coppercliff: copper ore price +2.0% this month (unit cost 0.4%, 30 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
    <- [day 1559] macro.jobs: unemployment 13.6%
      <- [day 1529] macro.demand: household spending 0.44M per day
        <- [day 1529] macro.cpi: CPI 0.72% on the month, 5.9% on the year
        <- [day 1529] macro.jobs: unemployment 9.0%
        <- [day 1499] cb.rate cb: policy rate 9.00% -> 9.75%

[day 1589] loan.default p_5000: Nora Elorford missed three payments on 4729
  <- [day 1559] cb.rate cb: policy rate 10.25% -> 8.75%
    <- [day 1559] macro.cpi: CPI 0.14% on the month, 6.7% on the year
      <- [day 1559] firm.price frm_sawyer: lumber price -5.0% this month (unit cost -1.7%, 0 tight days)
        <- [day 1559] firm.price frm_tallpine: timber price -3.2% this month (unit cost 0.4%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
      <- [day 1559] firm.price frm_bedrock: cement price -4.5% this month (unit cost -1.0%, 0 tight days)
        <- [day 1559] firm.price frm_greystone: sand and gravel price -3.1% this month (unit cost 0.4%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
      <- [day 1559] firm.price frm_ruddy_metals: copper price +3.2% this month (unit cost 1.3%, 30 tight days)
        <- [day 1530] firm.stockout frm_ruddy_metals: sold out of copper; demand unmet
        <- [day 1530] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1559] firm.price frm_coppercliff: copper ore price +2.0% this month (unit cost 0.4%, 30 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
    <- [day 1559] macro.jobs: unemployment 13.6%
      <- [day 1529] macro.demand: household spending 0.44M per day
        <- [day 1529] macro.cpi: CPI 0.72% on the month, 5.9% on the year
        <- [day 1529] macro.jobs: unemployment 9.0%
        <- [day 1499] cb.rate cb: policy rate 9.00% -> 9.75%

[day 1589] loan.default p_5000: Nora Elorford missed three payments on 70
  <- [day 1559] cb.rate cb: policy rate 10.25% -> 8.75%
    <- [day 1559] macro.cpi: CPI 0.14% on the month, 6.7% on the year
      <- [day 1559] firm.price frm_sawyer: lumber price -5.0% this month (unit cost -1.7%, 0 tight days)
        <- [day 1559] firm.price frm_tallpine: timber price -3.2% this month (unit cost 0.4%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
      <- [day 1559] firm.price frm_bedrock: cement price -4.5% this month (unit cost -1.0%, 0 tight days)
        <- [day 1559] firm.price frm_greystone: sand and gravel price -3.1% this month (unit cost 0.4%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
      <- [day 1559] firm.price frm_ruddy_metals: copper price +3.2% this month (unit cost 1.3%, 30 tight days)
        <- [day 1530] firm.stockout frm_ruddy_metals: sold out of copper; demand unmet
        <- [day 1530] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1559] firm.price frm_coppercliff: copper ore price +2.0% this month (unit cost 0.4%, 30 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
    <- [day 1559] macro.jobs: unemployment 13.6%
      <- [day 1529] macro.demand: household spending 0.44M per day
        <- [day 1529] macro.cpi: CPI 0.72% on the month, 5.9% on the year
        <- [day 1529] macro.jobs: unemployment 9.0%
        <- [day 1499] cb.rate cb: policy rate 9.00% -> 9.75%

[day 1589] loan.default p_5000: Nora Elorford missed three payments on 25951
  <- [day 1559] cb.rate cb: policy rate 10.25% -> 8.75%
    <- [day 1559] macro.cpi: CPI 0.14% on the month, 6.7% on the year
      <- [day 1559] firm.price frm_sawyer: lumber price -5.0% this month (unit cost -1.7%, 0 tight days)
        <- [day 1559] firm.price frm_tallpine: timber price -3.2% this month (unit cost 0.4%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
      <- [day 1559] firm.price frm_bedrock: cement price -4.5% this month (unit cost -1.0%, 0 tight days)
        <- [day 1559] firm.price frm_greystone: sand and gravel price -3.1% this month (unit cost 0.4%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
      <- [day 1559] firm.price frm_ruddy_metals: copper price +3.2% this month (unit cost 1.3%, 30 tight days)
        <- [day 1530] firm.stockout frm_ruddy_metals: sold out of copper; demand unmet
        <- [day 1530] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1559] firm.price frm_coppercliff: copper ore price +2.0% this month (unit cost 0.4%, 30 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
    <- [day 1559] macro.jobs: unemployment 13.6%
      <- [day 1529] macro.demand: household spending 0.44M per day
        <- [day 1529] macro.cpi: CPI 0.72% on the month, 5.9% on the year
        <- [day 1529] macro.jobs: unemployment 9.0%
        <- [day 1499] cb.rate cb: policy rate 9.00% -> 9.75%

[day 1589] loan.default p_5000: Nora Elorford missed three payments on 5299
  <- [day 1559] cb.rate cb: policy rate 10.25% -> 8.75%
    <- [day 1559] macro.cpi: CPI 0.14% on the month, 6.7% on the year
      <- [day 1559] firm.price frm_sawyer: lumber price -5.0% this month (unit cost -1.7%, 0 tight days)
        <- [day 1559] firm.price frm_tallpine: timber price -3.2% this month (unit cost 0.4%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
      <- [day 1559] firm.price frm_bedrock: cement price -4.5% this month (unit cost -1.0%, 0 tight days)
        <- [day 1559] firm.price frm_greystone: sand and gravel price -3.1% this month (unit cost 0.4%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
      <- [day 1559] firm.price frm_ruddy_metals: copper price +3.2% this month (unit cost 1.3%, 30 tight days)
        <- [day 1530] firm.stockout frm_ruddy_metals: sold out of copper; demand unmet
        <- [day 1530] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1559] firm.price frm_coppercliff: copper ore price +2.0% this month (unit cost 0.4%, 30 tight days)
        <- [day 1529] macro.wage: wages 0.36% this month
    <- [day 1559] macro.jobs: unemployment 13.6%
      <- [day 1529] macro.demand: household spending 0.44M per day
        <- [day 1529] macro.cpi: CPI 0.72% on the month, 5.9% on the year
        <- [day 1529] macro.jobs: unemployment 9.0%
        <- [day 1499] cb.rate cb: policy rate 9.00% -> 9.75%
```

- Day 6991: $7,283,999 → $7,390,258

```
(no event that day names the player; the move is a mark)
```

- Day 6902: $7,482,223 → $7,583,486

```
(no event that day names the player; the move is a mark)
```

### gambler seed 13 — 58.52x

Start $150,000, end $8,777,554, 7200 days. Year-end worth: day 360 $826,499; day 720 $1,195,586; day 1080 $1,070,143; day 1440 $1,425,469; day 1800 $1,772,742; day 2160 $2,070,874; day 2520 $2,599,702; day 2880 $2,748,428; day 3240 $3,244,476; day 3600 $4,317,747; day 3960 $3,428,344; day 4320 $3,713,248; day 4680 $4,286,435; day 5040 $4,949,302; day 5400 $5,616,461; day 5760 $6,412,531; day 6120 $7,140,379; day 6480 $8,178,332; day 6840 $8,570,960; day 7200 $8,777,554.

Biggest up-days:

- Day 6240: $7,394,782 → $7,735,320

```
[day 6239] loan.default p_5000: Halen Corulell missed three payments on 327043
  <- [day 6209] cb.rate cb: policy rate 1.50% -> 1.75%
    <- [day 6209] macro.cpi: CPI 0.27% on the month, 0.7% on the year
      <- [day 6209] firm.price frm_n64: news price +1.7% this month (unit cost 0.2%, 30 tight days)
        <- [day 6180] firm.stockout frm_n64: sold out of news; demand unmet
      <- [day 6209] firm.price frm_daily_herald: news price +1.5% this month (unit cost 0.2%, 18 tight days)
        <- [day 6184] firm.stockout frm_daily_herald: sold out of news; demand unmet
      <- [day 6209] firm.price frm_n63: news price +1.5% this month (unit cost 0.2%, 21 tight days)
        <- [day 6180] firm.stockout frm_n63: sold out of news; demand unmet
    <- [day 6209] macro.jobs: unemployment 7.4%
      <- [day 6179] macro.demand: household spending 0.76M per day
        <- [day 6179] macro.cpi: CPI 0.06% on the month, 0.2% on the year
        <- [day 6179] macro.jobs: unemployment 4.3%
        <- [day 6149] cb.rate cb: policy rate 0.75% -> 1.00%
  <- [day 3960] person.facet p_5000: Halen Corulell lived through a bad year and will take less financial risk for life
    <- [day 3672] mkt.move frm_tallpine: eq:frm_tallpine close 4356 -> 4182 (-4.0%)
      <- [day 3600] shock.port_strike: dockworkers strike:freight capacity halves  (outside shock)
      <- [day 3659] cb.rate cb: policy rate 4.50% -> 4.75%
        <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
        <- [day 3659] macro.jobs: unemployment 8.1%
      <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
        <- [day 3659] firm.price frm_grocermart: groceries price -1.8% this month (unit cost -2.1%, 0 tight days)
        <- [day 3659] firm.price frm_freshway: groceries price -1.7% this month (unit cost -2.1%, 0 tight days)
        <- [day 3659] firm.price frm_harbourline: freight price -30.5% this month (unit cost -41.0%, 20 tight days)

[day 6239] loan.default p_5000: Halen Corulell missed three payments on 10
  <- [day 6209] cb.rate cb: policy rate 1.50% -> 1.75%
    <- [day 6209] macro.cpi: CPI 0.27% on the month, 0.7% on the year
      <- [day 6209] firm.price frm_n64: news price +1.7% this month (unit cost 0.2%, 30 tight days)
        <- [day 6180] firm.stockout frm_n64: sold out of news; demand unmet
      <- [day 6209] firm.price frm_daily_herald: news price +1.5% this month (unit cost 0.2%, 18 tight days)
        <- [day 6184] firm.stockout frm_daily_herald: sold out of news; demand unmet
      <- [day 6209] firm.price frm_n63: news price +1.5% this month (unit cost 0.2%, 21 tight days)
        <- [day 6180] firm.stockout frm_n63: sold out of news; demand unmet
    <- [day 6209] macro.jobs: unemployment 7.4%
      <- [day 6179] macro.demand: household spending 0.76M per day
        <- [day 6179] macro.cpi: CPI 0.06% on the month, 0.2% on the year
        <- [day 6179] macro.jobs: unemployment 4.3%
        <- [day 6149] cb.rate cb: policy rate 0.75% -> 1.00%
  <- [day 3960] person.facet p_5000: Halen Corulell lived through a bad year and will take less financial risk for life
    <- [day 3672] mkt.move frm_tallpine: eq:frm_tallpine close 4356 -> 4182 (-4.0%)
      <- [day 3600] shock.port_strike: dockworkers strike:freight capacity halves  (outside shock)
      <- [day 3659] cb.rate cb: policy rate 4.50% -> 4.75%
        <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
        <- [day 3659] macro.jobs: unemployment 8.1%
      <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
        <- [day 3659] firm.price frm_grocermart: groceries price -1.8% this month (unit cost -2.1%, 0 tight days)
        <- [day 3659] firm.price frm_freshway: groceries price -1.7% this month (unit cost -2.1%, 0 tight days)
        <- [day 3659] firm.price frm_harbourline: freight price -30.5% this month (unit cost -41.0%, 20 tight days)

[day 6239] loan.default p_5000: Halen Corulell missed three payments on 14139
  <- [day 6209] cb.rate cb: policy rate 1.50% -> 1.75%
    <- [day 6209] macro.cpi: CPI 0.27% on the month, 0.7% on the year
      <- [day 6209] firm.price frm_n64: news price +1.7% this month (unit cost 0.2%, 30 tight days)
        <- [day 6180] firm.stockout frm_n64: sold out of news; demand unmet
      <- [day 6209] firm.price frm_daily_herald: news price +1.5% this month (unit cost 0.2%, 18 tight days)
        <- [day 6184] firm.stockout frm_daily_herald: sold out of news; demand unmet
      <- [day 6209] firm.price frm_n63: news price +1.5% this month (unit cost 0.2%, 21 tight days)
        <- [day 6180] firm.stockout frm_n63: sold out of news; demand unmet
    <- [day 6209] macro.jobs: unemployment 7.4%
      <- [day 6179] macro.demand: household spending 0.76M per day
        <- [day 6179] macro.cpi: CPI 0.06% on the month, 0.2% on the year
        <- [day 6179] macro.jobs: unemployment 4.3%
        <- [day 6149] cb.rate cb: policy rate 0.75% -> 1.00%
  <- [day 3960] person.facet p_5000: Halen Corulell lived through a bad year and will take less financial risk for life
    <- [day 3672] mkt.move frm_tallpine: eq:frm_tallpine close 4356 -> 4182 (-4.0%)
      <- [day 3600] shock.port_strike: dockworkers strike:freight capacity halves  (outside shock)
      <- [day 3659] cb.rate cb: policy rate 4.50% -> 4.75%
        <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
        <- [day 3659] macro.jobs: unemployment 8.1%
      <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
        <- [day 3659] firm.price frm_grocermart: groceries price -1.8% this month (unit cost -2.1%, 0 tight days)
        <- [day 3659] firm.price frm_freshway: groceries price -1.7% this month (unit cost -2.1%, 0 tight days)
        <- [day 3659] firm.price frm_harbourline: freight price -30.5% this month (unit cost -41.0%, 20 tight days)

[day 6239] law.offence p_5000: Halen Corulell left $327043 unpaid after a default
  <- [day 6239] loan.default p_5000: Halen Corulell missed three payments on 327043
    <- [day 6209] cb.rate cb: policy rate 1.50% -> 1.75%
      <- [day 6209] macro.cpi: CPI 0.27% on the month, 0.7% on the year
        <- [day 6209] firm.price frm_n64: news price +1.7% this month (unit cost 0.2%, 30 tight days)
        <- [day 6209] firm.price frm_daily_herald: news price +1.5% this month (unit cost 0.2%, 18 tight days)
        <- [day 6209] firm.price frm_n63: news price +1.5% this month (unit cost 0.2%, 21 tight days)
      <- [day 6209] macro.jobs: unemployment 7.4%
        <- [day 6179] macro.demand: household spending 0.76M per day
    <- [day 3960] person.facet p_5000: Halen Corulell lived through a bad year and will take less financial risk for life
      <- [day 3672] mkt.move frm_tallpine: eq:frm_tallpine close 4356 -> 4182 (-4.0%)
        <- [day 3600] shock.port_strike: dockworkers strike:freight capacity halves  (outside shock)
        <- [day 3659] cb.rate cb: policy rate 4.50% -> 4.75%
        <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
```

- Day 1680: $1,567,643 → $1,751,861

```
[day 1679] loan.default p_5000: Halen Corulell missed three payments on 38901
  <- [day 1649] cb.rate cb: policy rate 8.00% -> 8.25%
    <- [day 1649] macro.cpi: CPI 0.43% on the month, 5.1% on the year
      <- [day 1649] firm.price frm_salar: lithium price +2.9% this month (unit cost 0.3%, 30 tight days)
        <- [day 1626] firm.stockout frm_salar: sold out of lithium; demand unmet
      <- [day 1649] firm.price frm_irongate: steel price +1.9% this month (unit cost 0.7%, 23 tight days)
        <- [day 1619] macro.demand: household spending 0.50M per day
      <- [day 1649] firm.price frm_coppercliff: copper ore price +1.8% this month (unit cost 0.4%, 30 tight days)
        <- [day 1624] firm.stockout frm_coppercliff: sold out of copper ore; demand unmet
    <- [day 1649] macro.jobs: unemployment 4.4%
      <- [day 1619] macro.demand: household spending 0.50M per day
        <- [day 1619] macro.cpi: CPI 0.33% on the month, 4.6% on the year
        <- [day 1619] macro.jobs: unemployment 5.0%
        <- [day 1589] cb.rate cb: policy rate 7.25% -> 7.75%

[day 1679] loan.default p_5000: Halen Corulell missed three payments on 143
  <- [day 1649] cb.rate cb: policy rate 8.00% -> 8.25%
    <- [day 1649] macro.cpi: CPI 0.43% on the month, 5.1% on the year
      <- [day 1649] firm.price frm_salar: lithium price +2.9% this month (unit cost 0.3%, 30 tight days)
        <- [day 1626] firm.stockout frm_salar: sold out of lithium; demand unmet
      <- [day 1649] firm.price frm_irongate: steel price +1.9% this month (unit cost 0.7%, 23 tight days)
        <- [day 1619] macro.demand: household spending 0.50M per day
      <- [day 1649] firm.price frm_coppercliff: copper ore price +1.8% this month (unit cost 0.4%, 30 tight days)
        <- [day 1624] firm.stockout frm_coppercliff: sold out of copper ore; demand unmet
    <- [day 1649] macro.jobs: unemployment 4.4%
      <- [day 1619] macro.demand: household spending 0.50M per day
        <- [day 1619] macro.cpi: CPI 0.33% on the month, 4.6% on the year
        <- [day 1619] macro.jobs: unemployment 5.0%
        <- [day 1589] cb.rate cb: policy rate 7.25% -> 7.75%

[day 1679] loan.default p_5000: Halen Corulell missed three payments on 16619
  <- [day 1649] cb.rate cb: policy rate 8.00% -> 8.25%
    <- [day 1649] macro.cpi: CPI 0.43% on the month, 5.1% on the year
      <- [day 1649] firm.price frm_salar: lithium price +2.9% this month (unit cost 0.3%, 30 tight days)
        <- [day 1626] firm.stockout frm_salar: sold out of lithium; demand unmet
      <- [day 1649] firm.price frm_irongate: steel price +1.9% this month (unit cost 0.7%, 23 tight days)
        <- [day 1619] macro.demand: household spending 0.50M per day
      <- [day 1649] firm.price frm_coppercliff: copper ore price +1.8% this month (unit cost 0.4%, 30 tight days)
        <- [day 1624] firm.stockout frm_coppercliff: sold out of copper ore; demand unmet
    <- [day 1649] macro.jobs: unemployment 4.4%
      <- [day 1619] macro.demand: household spending 0.50M per day
        <- [day 1619] macro.cpi: CPI 0.33% on the month, 4.6% on the year
        <- [day 1619] macro.jobs: unemployment 5.0%
        <- [day 1589] cb.rate cb: policy rate 7.25% -> 7.75%

[day 1679] loan.default p_5000: Halen Corulell missed three payments on 69454
  <- [day 1649] cb.rate cb: policy rate 8.00% -> 8.25%
    <- [day 1649] macro.cpi: CPI 0.43% on the month, 5.1% on the year
      <- [day 1649] firm.price frm_salar: lithium price +2.9% this month (unit cost 0.3%, 30 tight days)
        <- [day 1626] firm.stockout frm_salar: sold out of lithium; demand unmet
      <- [day 1649] firm.price frm_irongate: steel price +1.9% this month (unit cost 0.7%, 23 tight days)
        <- [day 1619] macro.demand: household spending 0.50M per day
      <- [day 1649] firm.price frm_coppercliff: copper ore price +1.8% this month (unit cost 0.4%, 30 tight days)
        <- [day 1624] firm.stockout frm_coppercliff: sold out of copper ore; demand unmet
    <- [day 1649] macro.jobs: unemployment 4.4%
      <- [day 1619] macro.demand: household spending 0.50M per day
        <- [day 1619] macro.cpi: CPI 0.33% on the month, 4.6% on the year
        <- [day 1619] macro.jobs: unemployment 5.0%
        <- [day 1589] cb.rate cb: policy rate 7.25% -> 7.75%

[day 1679] loan.default p_5000: Halen Corulell missed three payments on 60791
  <- [day 1649] cb.rate cb: policy rate 8.00% -> 8.25%
    <- [day 1649] macro.cpi: CPI 0.43% on the month, 5.1% on the year
      <- [day 1649] firm.price frm_salar: lithium price +2.9% this month (unit cost 0.3%, 30 tight days)
        <- [day 1626] firm.stockout frm_salar: sold out of lithium; demand unmet
      <- [day 1649] firm.price frm_irongate: steel price +1.9% this month (unit cost 0.7%, 23 tight days)
        <- [day 1619] macro.demand: household spending 0.50M per day
      <- [day 1649] firm.price frm_coppercliff: copper ore price +1.8% this month (unit cost 0.4%, 30 tight days)
        <- [day 1624] firm.stockout frm_coppercliff: sold out of copper ore; demand unmet
    <- [day 1649] macro.jobs: unemployment 4.4%
      <- [day 1619] macro.demand: household spending 0.50M per day
        <- [day 1619] macro.cpi: CPI 0.33% on the month, 4.6% on the year
        <- [day 1619] macro.jobs: unemployment 5.0%
        <- [day 1589] cb.rate cb: policy rate 7.25% -> 7.75%
```

- Day 1830: $1,778,661 → $1,957,041

```
[day 1829] loan.default p_5000: Halen Corulell missed three payments on 35806
  <- [day 1799] cb.rate cb: policy rate 9.25% -> 9.50%
    <- [day 1799] macro.cpi: CPI 0.70% on the month, 5.9% on the year
      <- [day 1799] firm.price frm_forgeworks: steel price +2.6% this month (unit cost 1.1%, 30 tight days)
        <- [day 1770] firm.inputShort frm_forgeworks: could not buy enough iron ore; output cut
        <- [day 1799] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 1769] macro.wage: wages 0.44% this month
      <- [day 1799] firm.price frm_ruddy_metals: copper price +2.2% this month (unit cost 1.2%, 14 tight days)
        <- [day 1770] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1799] firm.price frm_coppercliff: copper ore price +1.6% this month (unit cost 0.4%, 30 tight days)
        <- [day 1769] macro.wage: wages 0.44% this month
      <- [day 1799] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 1770] firm.stockout frm_redhill: sold out of iron ore; demand unmet
    <- [day 1799] macro.jobs: unemployment 7.8%
      <- [day 1769] macro.demand: household spending 0.53M per day
        <- [day 1769] macro.cpi: CPI 0.54% on the month, 6.0% on the year
        <- [day 1769] macro.jobs: unemployment 4.8%
        <- [day 1739] cb.rate cb: policy rate 8.75% -> 9.00%

[day 1829] loan.default p_5000: Halen Corulell missed three payments on 10415
  <- [day 1799] cb.rate cb: policy rate 9.25% -> 9.50%
    <- [day 1799] macro.cpi: CPI 0.70% on the month, 5.9% on the year
      <- [day 1799] firm.price frm_forgeworks: steel price +2.6% this month (unit cost 1.1%, 30 tight days)
        <- [day 1770] firm.inputShort frm_forgeworks: could not buy enough iron ore; output cut
        <- [day 1799] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 1769] macro.wage: wages 0.44% this month
      <- [day 1799] firm.price frm_ruddy_metals: copper price +2.2% this month (unit cost 1.2%, 14 tight days)
        <- [day 1770] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1799] firm.price frm_coppercliff: copper ore price +1.6% this month (unit cost 0.4%, 30 tight days)
        <- [day 1769] macro.wage: wages 0.44% this month
      <- [day 1799] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 1770] firm.stockout frm_redhill: sold out of iron ore; demand unmet
    <- [day 1799] macro.jobs: unemployment 7.8%
      <- [day 1769] macro.demand: household spending 0.53M per day
        <- [day 1769] macro.cpi: CPI 0.54% on the month, 6.0% on the year
        <- [day 1769] macro.jobs: unemployment 4.8%
        <- [day 1739] cb.rate cb: policy rate 8.75% -> 9.00%

[day 1829] loan.default p_5000: Halen Corulell missed three payments on 7998
  <- [day 1799] cb.rate cb: policy rate 9.25% -> 9.50%
    <- [day 1799] macro.cpi: CPI 0.70% on the month, 5.9% on the year
      <- [day 1799] firm.price frm_forgeworks: steel price +2.6% this month (unit cost 1.1%, 30 tight days)
        <- [day 1770] firm.inputShort frm_forgeworks: could not buy enough iron ore; output cut
        <- [day 1799] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 1769] macro.wage: wages 0.44% this month
      <- [day 1799] firm.price frm_ruddy_metals: copper price +2.2% this month (unit cost 1.2%, 14 tight days)
        <- [day 1770] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1799] firm.price frm_coppercliff: copper ore price +1.6% this month (unit cost 0.4%, 30 tight days)
        <- [day 1769] macro.wage: wages 0.44% this month
      <- [day 1799] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 1770] firm.stockout frm_redhill: sold out of iron ore; demand unmet
    <- [day 1799] macro.jobs: unemployment 7.8%
      <- [day 1769] macro.demand: household spending 0.53M per day
        <- [day 1769] macro.cpi: CPI 0.54% on the month, 6.0% on the year
        <- [day 1769] macro.jobs: unemployment 4.8%
        <- [day 1739] cb.rate cb: policy rate 8.75% -> 9.00%

[day 1829] loan.default p_5000: Halen Corulell missed three payments on 40090
  <- [day 1799] cb.rate cb: policy rate 9.25% -> 9.50%
    <- [day 1799] macro.cpi: CPI 0.70% on the month, 5.9% on the year
      <- [day 1799] firm.price frm_forgeworks: steel price +2.6% this month (unit cost 1.1%, 30 tight days)
        <- [day 1770] firm.inputShort frm_forgeworks: could not buy enough iron ore; output cut
        <- [day 1799] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 1769] macro.wage: wages 0.44% this month
      <- [day 1799] firm.price frm_ruddy_metals: copper price +2.2% this month (unit cost 1.2%, 14 tight days)
        <- [day 1770] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1799] firm.price frm_coppercliff: copper ore price +1.6% this month (unit cost 0.4%, 30 tight days)
        <- [day 1769] macro.wage: wages 0.44% this month
      <- [day 1799] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 1770] firm.stockout frm_redhill: sold out of iron ore; demand unmet
    <- [day 1799] macro.jobs: unemployment 7.8%
      <- [day 1769] macro.demand: household spending 0.53M per day
        <- [day 1769] macro.cpi: CPI 0.54% on the month, 6.0% on the year
        <- [day 1769] macro.jobs: unemployment 4.8%
        <- [day 1739] cb.rate cb: policy rate 8.75% -> 9.00%

[day 1829] loan.default p_5000: Halen Corulell missed three payments on 10262
  <- [day 1799] cb.rate cb: policy rate 9.25% -> 9.50%
    <- [day 1799] macro.cpi: CPI 0.70% on the month, 5.9% on the year
      <- [day 1799] firm.price frm_forgeworks: steel price +2.6% this month (unit cost 1.1%, 30 tight days)
        <- [day 1770] firm.inputShort frm_forgeworks: could not buy enough iron ore; output cut
        <- [day 1799] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 1769] macro.wage: wages 0.44% this month
      <- [day 1799] firm.price frm_ruddy_metals: copper price +2.2% this month (unit cost 1.2%, 14 tight days)
        <- [day 1770] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1799] firm.price frm_coppercliff: copper ore price +1.6% this month (unit cost 0.4%, 30 tight days)
        <- [day 1769] macro.wage: wages 0.44% this month
      <- [day 1799] firm.price frm_redhill: iron ore price +1.9% this month (unit cost 0.4%, 30 tight days)
        <- [day 1770] firm.stockout frm_redhill: sold out of iron ore; demand unmet
    <- [day 1799] macro.jobs: unemployment 7.8%
      <- [day 1769] macro.demand: household spending 0.53M per day
        <- [day 1769] macro.cpi: CPI 0.54% on the month, 6.0% on the year
        <- [day 1769] macro.jobs: unemployment 4.8%
        <- [day 1739] cb.rate cb: policy rate 8.75% -> 9.00%
```

- Day 6270: $7,738,767 → $7,900,957

```
[day 6269] loan.default p_5000: Halen Corulell missed three payments on 144845
  <- [day 6239] cb.rate cb: policy rate 1.75% -> 2.00%
    <- [day 6239] macro.cpi: CPI -0.07% on the month, 0.7% on the year
      <- [day 6209] macro.demand: household spending 0.74M per day
        <- [day 6209] macro.cpi: CPI 0.27% on the month, 0.7% on the year
        <- [day 6209] macro.jobs: unemployment 7.4%
        <- [day 6179] cb.rate cb: policy rate 1.00% -> 1.50%
    <- [day 6239] macro.jobs: unemployment 3.8%
      <- [day 6209] macro.demand: household spending 0.74M per day  (see above)
  <- [day 3960] person.facet p_5000: Halen Corulell lived through a bad year and will take less financial risk for life
    <- [day 3672] mkt.move frm_tallpine: eq:frm_tallpine close 4356 -> 4182 (-4.0%)
      <- [day 3600] shock.port_strike: dockworkers strike:freight capacity halves  (outside shock)
      <- [day 3659] cb.rate cb: policy rate 4.50% -> 4.75%
        <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
        <- [day 3659] macro.jobs: unemployment 8.1%
      <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
        <- [day 3659] firm.price frm_grocermart: groceries price -1.8% this month (unit cost -2.1%, 0 tight days)
        <- [day 3659] firm.price frm_freshway: groceries price -1.7% this month (unit cost -2.1%, 0 tight days)
        <- [day 3659] firm.price frm_harbourline: freight price -30.5% this month (unit cost -41.0%, 20 tight days)

[day 6269] loan.default p_5000: Halen Corulell missed three payments on 16998
  <- [day 6239] cb.rate cb: policy rate 1.75% -> 2.00%
    <- [day 6239] macro.cpi: CPI -0.07% on the month, 0.7% on the year
      <- [day 6209] macro.demand: household spending 0.74M per day
        <- [day 6209] macro.cpi: CPI 0.27% on the month, 0.7% on the year
        <- [day 6209] macro.jobs: unemployment 7.4%
        <- [day 6179] cb.rate cb: policy rate 1.00% -> 1.50%
    <- [day 6239] macro.jobs: unemployment 3.8%
      <- [day 6209] macro.demand: household spending 0.74M per day  (see above)
  <- [day 3960] person.facet p_5000: Halen Corulell lived through a bad year and will take less financial risk for life
    <- [day 3672] mkt.move frm_tallpine: eq:frm_tallpine close 4356 -> 4182 (-4.0%)
      <- [day 3600] shock.port_strike: dockworkers strike:freight capacity halves  (outside shock)
      <- [day 3659] cb.rate cb: policy rate 4.50% -> 4.75%
        <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
        <- [day 3659] macro.jobs: unemployment 8.1%
      <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
        <- [day 3659] firm.price frm_grocermart: groceries price -1.8% this month (unit cost -2.1%, 0 tight days)
        <- [day 3659] firm.price frm_freshway: groceries price -1.7% this month (unit cost -2.1%, 0 tight days)
        <- [day 3659] firm.price frm_harbourline: freight price -30.5% this month (unit cost -41.0%, 20 tight days)

[day 6269] loan.default p_5000: Halen Corulell missed three payments on 531
  <- [day 6239] cb.rate cb: policy rate 1.75% -> 2.00%
    <- [day 6239] macro.cpi: CPI -0.07% on the month, 0.7% on the year
      <- [day 6209] macro.demand: household spending 0.74M per day
        <- [day 6209] macro.cpi: CPI 0.27% on the month, 0.7% on the year
        <- [day 6209] macro.jobs: unemployment 7.4%
        <- [day 6179] cb.rate cb: policy rate 1.00% -> 1.50%
    <- [day 6239] macro.jobs: unemployment 3.8%
      <- [day 6209] macro.demand: household spending 0.74M per day  (see above)
  <- [day 3960] person.facet p_5000: Halen Corulell lived through a bad year and will take less financial risk for life
    <- [day 3672] mkt.move frm_tallpine: eq:frm_tallpine close 4356 -> 4182 (-4.0%)
      <- [day 3600] shock.port_strike: dockworkers strike:freight capacity halves  (outside shock)
      <- [day 3659] cb.rate cb: policy rate 4.50% -> 4.75%
        <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
        <- [day 3659] macro.jobs: unemployment 8.1%
      <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
        <- [day 3659] firm.price frm_grocermart: groceries price -1.8% this month (unit cost -2.1%, 0 tight days)
        <- [day 3659] firm.price frm_freshway: groceries price -1.7% this month (unit cost -2.1%, 0 tight days)
        <- [day 3659] firm.price frm_harbourline: freight price -30.5% this month (unit cost -41.0%, 20 tight days)

[day 6269] law.offence p_5000: Halen Corulell left $144845 unpaid after a default
  <- [day 6269] loan.default p_5000: Halen Corulell missed three payments on 144845
    <- [day 6239] cb.rate cb: policy rate 1.75% -> 2.00%
      <- [day 6239] macro.cpi: CPI -0.07% on the month, 0.7% on the year
        <- [day 6209] macro.demand: household spending 0.74M per day
      <- [day 6239] macro.jobs: unemployment 3.8%
        <- [day 6209] macro.demand: household spending 0.74M per day
    <- [day 3960] person.facet p_5000: Halen Corulell lived through a bad year and will take less financial risk for life
      <- [day 3672] mkt.move frm_tallpine: eq:frm_tallpine close 4356 -> 4182 (-4.0%)
        <- [day 3600] shock.port_strike: dockworkers strike:freight capacity halves  (outside shock)
        <- [day 3659] cb.rate cb: policy rate 4.50% -> 4.75%
        <- [day 3659] macro.cpi: CPI -0.24% on the month, 2.6% on the year
```

- Day 1650: $1,437,680 → $1,574,721

```
[day 1649] loan.default p_5000: Halen Corulell missed three payments on 56919
  <- [day 1619] cb.rate cb: policy rate 7.75% -> 8.00%
    <- [day 1619] macro.cpi: CPI 0.33% on the month, 4.6% on the year
      <- [day 1619] firm.price frm_salar: lithium price +2.8% this month (unit cost 0.5%, 30 tight days)
        <- [day 1589] macro.demand: household spending 0.49M per day
    <- [day 1619] macro.jobs: unemployment 5.0%
      <- [day 1589] macro.demand: household spending 0.49M per day
        <- [day 1589] macro.cpi: CPI 0.56% on the month, 4.8% on the year
        <- [day 1589] macro.jobs: unemployment 4.2%
        <- [day 1529] cb.rate cb: policy rate 7.00% -> 7.25%

[day 1649] loan.default p_5000: Halen Corulell missed three payments on 20949
  <- [day 1619] cb.rate cb: policy rate 7.75% -> 8.00%
    <- [day 1619] macro.cpi: CPI 0.33% on the month, 4.6% on the year
      <- [day 1619] firm.price frm_salar: lithium price +2.8% this month (unit cost 0.5%, 30 tight days)
        <- [day 1589] macro.demand: household spending 0.49M per day
    <- [day 1619] macro.jobs: unemployment 5.0%
      <- [day 1589] macro.demand: household spending 0.49M per day
        <- [day 1589] macro.cpi: CPI 0.56% on the month, 4.8% on the year
        <- [day 1589] macro.jobs: unemployment 4.2%
        <- [day 1529] cb.rate cb: policy rate 7.00% -> 7.25%

[day 1649] loan.default p_5000: Halen Corulell missed three payments on 268
  <- [day 1619] cb.rate cb: policy rate 7.75% -> 8.00%
    <- [day 1619] macro.cpi: CPI 0.33% on the month, 4.6% on the year
      <- [day 1619] firm.price frm_salar: lithium price +2.8% this month (unit cost 0.5%, 30 tight days)
        <- [day 1589] macro.demand: household spending 0.49M per day
    <- [day 1619] macro.jobs: unemployment 5.0%
      <- [day 1589] macro.demand: household spending 0.49M per day
        <- [day 1589] macro.cpi: CPI 0.56% on the month, 4.8% on the year
        <- [day 1589] macro.jobs: unemployment 4.2%
        <- [day 1529] cb.rate cb: policy rate 7.00% -> 7.25%

[day 1649] loan.default p_5000: Halen Corulell missed three payments on 42562
  <- [day 1619] cb.rate cb: policy rate 7.75% -> 8.00%
    <- [day 1619] macro.cpi: CPI 0.33% on the month, 4.6% on the year
      <- [day 1619] firm.price frm_salar: lithium price +2.8% this month (unit cost 0.5%, 30 tight days)
        <- [day 1589] macro.demand: household spending 0.49M per day
    <- [day 1619] macro.jobs: unemployment 5.0%
      <- [day 1589] macro.demand: household spending 0.49M per day
        <- [day 1589] macro.cpi: CPI 0.56% on the month, 4.8% on the year
        <- [day 1589] macro.jobs: unemployment 4.2%
        <- [day 1529] cb.rate cb: policy rate 7.00% -> 7.25%

[day 1649] loan.default p_5000: Halen Corulell missed three payments on 12630
  <- [day 1619] cb.rate cb: policy rate 7.75% -> 8.00%
    <- [day 1619] macro.cpi: CPI 0.33% on the month, 4.6% on the year
      <- [day 1619] firm.price frm_salar: lithium price +2.8% this month (unit cost 0.5%, 30 tight days)
        <- [day 1589] macro.demand: household spending 0.49M per day
    <- [day 1619] macro.jobs: unemployment 5.0%
      <- [day 1589] macro.demand: household spending 0.49M per day
        <- [day 1589] macro.cpi: CPI 0.56% on the month, 4.8% on the year
        <- [day 1589] macro.jobs: unemployment 4.2%
        <- [day 1529] cb.rate cb: policy rate 7.00% -> 7.25%
```

- Day 6901: $8,490,284 → $8,619,050

```
(no event that day names the player; the move is a mark)
```

### gambler seed 19 — 85.17x

Start $150,000, end $12,775,843, 7200 days. Year-end worth: day 360 $560,591; day 720 $916,047; day 1080 $834,530; day 1440 $1,407,674; day 1800 $3,217,867; day 2160 $3,544,368; day 2520 $4,342,454; day 2880 $3,797,595; day 3240 $4,090,641; day 3600 $4,527,719; day 3960 $5,218,386; day 4320 $5,528,102; day 4680 $5,973,019; day 5040 $6,909,331; day 5400 $7,365,961; day 5760 $7,758,855; day 6120 $8,511,092; day 6480 $9,055,622; day 6840 $10,767,824; day 7200 $12,775,843.

Biggest up-days:

- Day 1620: $1,480,143 → $1,784,901

```
[day 1619] loan.default p_5000: Elo Farandale missed three payments on 52550
  <- [day 1589] cb.rate cb: policy rate 8.50% -> 6.50%
    <- [day 1589] macro.cpi: CPI 0.04% on the month, 5.9% on the year
      <- [day 1589] firm.price frm_n64: news price -2.2% this month (unit cost 0.0%, 1 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
      <- [day 1589] firm.price frm_daily_herald: news price -2.1% this month (unit cost 0.0%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
      <- [day 1589] firm.price frm_n65: news price -2.0% this month (unit cost 0.0%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
    <- [day 1589] macro.jobs: unemployment 15.8%
      <- [day 1559] macro.demand: household spending 0.45M per day
        <- [day 1559] macro.cpi: CPI 0.30% on the month, 6.2% on the year
        <- [day 1559] macro.jobs: unemployment 14.5%
        <- [day 1529] cb.rate cb: policy rate 8.25% -> 9.00%
  <- [day 1539] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 67% of wages and cut 17% of the staff
    <- [day 1529] firm.price frm_kestrel_build: housing price +1.6% this month (unit cost 0.2%, 29 tight days)
      <- [day 1501] firm.stockout frm_kestrel_build: sold out of housing; demand unmet
        <- [day 1501] firm.inputShort frm_kestrel_build: could not buy enough copper; output cut
      <- [day 1501] firm.inputShort frm_kestrel_build: could not buy enough copper; output cut
        <- [day 1499] macro.demand: household spending 0.50M per day

[day 1619] loan.default p_5000: Elo Farandale missed three payments on 19762
  <- [day 1589] cb.rate cb: policy rate 8.50% -> 6.50%
    <- [day 1589] macro.cpi: CPI 0.04% on the month, 5.9% on the year
      <- [day 1589] firm.price frm_n64: news price -2.2% this month (unit cost 0.0%, 1 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
      <- [day 1589] firm.price frm_daily_herald: news price -2.1% this month (unit cost 0.0%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
      <- [day 1589] firm.price frm_n65: news price -2.0% this month (unit cost 0.0%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
    <- [day 1589] macro.jobs: unemployment 15.8%
      <- [day 1559] macro.demand: household spending 0.45M per day
        <- [day 1559] macro.cpi: CPI 0.30% on the month, 6.2% on the year
        <- [day 1559] macro.jobs: unemployment 14.5%
        <- [day 1529] cb.rate cb: policy rate 8.25% -> 9.00%
  <- [day 1539] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 67% of wages and cut 17% of the staff
    <- [day 1529] firm.price frm_kestrel_build: housing price +1.6% this month (unit cost 0.2%, 29 tight days)
      <- [day 1501] firm.stockout frm_kestrel_build: sold out of housing; demand unmet
        <- [day 1501] firm.inputShort frm_kestrel_build: could not buy enough copper; output cut
      <- [day 1501] firm.inputShort frm_kestrel_build: could not buy enough copper; output cut
        <- [day 1499] macro.demand: household spending 0.50M per day

[day 1619] loan.default p_5000: Elo Farandale missed three payments on 29466
  <- [day 1589] cb.rate cb: policy rate 8.50% -> 6.50%
    <- [day 1589] macro.cpi: CPI 0.04% on the month, 5.9% on the year
      <- [day 1589] firm.price frm_n64: news price -2.2% this month (unit cost 0.0%, 1 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
      <- [day 1589] firm.price frm_daily_herald: news price -2.1% this month (unit cost 0.0%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
      <- [day 1589] firm.price frm_n65: news price -2.0% this month (unit cost 0.0%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
    <- [day 1589] macro.jobs: unemployment 15.8%
      <- [day 1559] macro.demand: household spending 0.45M per day
        <- [day 1559] macro.cpi: CPI 0.30% on the month, 6.2% on the year
        <- [day 1559] macro.jobs: unemployment 14.5%
        <- [day 1529] cb.rate cb: policy rate 8.25% -> 9.00%
  <- [day 1539] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 67% of wages and cut 17% of the staff
    <- [day 1529] firm.price frm_kestrel_build: housing price +1.6% this month (unit cost 0.2%, 29 tight days)
      <- [day 1501] firm.stockout frm_kestrel_build: sold out of housing; demand unmet
        <- [day 1501] firm.inputShort frm_kestrel_build: could not buy enough copper; output cut
      <- [day 1501] firm.inputShort frm_kestrel_build: could not buy enough copper; output cut
        <- [day 1499] macro.demand: household spending 0.50M per day

[day 1619] loan.default p_5000: Elo Farandale missed three payments on 12100
  <- [day 1589] cb.rate cb: policy rate 8.50% -> 6.50%
    <- [day 1589] macro.cpi: CPI 0.04% on the month, 5.9% on the year
      <- [day 1589] firm.price frm_n64: news price -2.2% this month (unit cost 0.0%, 1 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
      <- [day 1589] firm.price frm_daily_herald: news price -2.1% this month (unit cost 0.0%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
      <- [day 1589] firm.price frm_n65: news price -2.0% this month (unit cost 0.0%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
    <- [day 1589] macro.jobs: unemployment 15.8%
      <- [day 1559] macro.demand: household spending 0.45M per day
        <- [day 1559] macro.cpi: CPI 0.30% on the month, 6.2% on the year
        <- [day 1559] macro.jobs: unemployment 14.5%
        <- [day 1529] cb.rate cb: policy rate 8.25% -> 9.00%
  <- [day 1539] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 67% of wages and cut 17% of the staff
    <- [day 1529] firm.price frm_kestrel_build: housing price +1.6% this month (unit cost 0.2%, 29 tight days)
      <- [day 1501] firm.stockout frm_kestrel_build: sold out of housing; demand unmet
        <- [day 1501] firm.inputShort frm_kestrel_build: could not buy enough copper; output cut
      <- [day 1501] firm.inputShort frm_kestrel_build: could not buy enough copper; output cut
        <- [day 1499] macro.demand: household spending 0.50M per day

[day 1619] loan.default p_5000: Elo Farandale missed three payments on 42335
  <- [day 1589] cb.rate cb: policy rate 8.50% -> 6.50%
    <- [day 1589] macro.cpi: CPI 0.04% on the month, 5.9% on the year
      <- [day 1589] firm.price frm_n64: news price -2.2% this month (unit cost 0.0%, 1 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
      <- [day 1589] firm.price frm_daily_herald: news price -2.1% this month (unit cost 0.0%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
      <- [day 1589] firm.price frm_n65: news price -2.0% this month (unit cost 0.0%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.45M per day
    <- [day 1589] macro.jobs: unemployment 15.8%
      <- [day 1559] macro.demand: household spending 0.45M per day
        <- [day 1559] macro.cpi: CPI 0.30% on the month, 6.2% on the year
        <- [day 1559] macro.jobs: unemployment 14.5%
        <- [day 1529] cb.rate cb: policy rate 8.25% -> 9.00%
  <- [day 1539] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 67% of wages and cut 17% of the staff
    <- [day 1529] firm.price frm_kestrel_build: housing price +1.6% this month (unit cost 0.2%, 29 tight days)
      <- [day 1501] firm.stockout frm_kestrel_build: sold out of housing; demand unmet
        <- [day 1501] firm.inputShort frm_kestrel_build: could not buy enough copper; output cut
      <- [day 1501] firm.inputShort frm_kestrel_build: could not buy enough copper; output cut
        <- [day 1499] macro.demand: household spending 0.50M per day
```

- Day 6870: $10,813,177 → $11,090,139

```
[day 6869] loan.default p_5000: Elo Farandale missed three payments on 268153
  <- [day 6839] cb.rate cb: policy rate 5.75% -> 5.50%
    <- [day 6839] macro.cpi: CPI 0.12% on the month, 3.1% on the year
      <- [day 6809] macro.demand: household spending 0.82M per day
        <- [day 6809] macro.cpi: CPI -0.07% on the month, 3.7% on the year
        <- [day 6809] macro.jobs: unemployment 7.6%
        <- [day 6749] cb.rate cb: policy rate 5.75% -> 6.00%
    <- [day 6839] macro.jobs: unemployment 7.0%
      <- [day 6809] macro.demand: household spending 0.82M per day  (see above)

[day 6869] loan.default p_5000: Elo Farandale missed three payments on 13062
  <- [day 6839] cb.rate cb: policy rate 5.75% -> 5.50%
    <- [day 6839] macro.cpi: CPI 0.12% on the month, 3.1% on the year
      <- [day 6809] macro.demand: household spending 0.82M per day
        <- [day 6809] macro.cpi: CPI -0.07% on the month, 3.7% on the year
        <- [day 6809] macro.jobs: unemployment 7.6%
        <- [day 6749] cb.rate cb: policy rate 5.75% -> 6.00%
    <- [day 6839] macro.jobs: unemployment 7.0%
      <- [day 6809] macro.demand: household spending 0.82M per day  (see above)

[day 6869] law.offence p_5000: Elo Farandale left $268153 unpaid after a default
  <- [day 6869] loan.default p_5000: Elo Farandale missed three payments on 268153
    <- [day 6839] cb.rate cb: policy rate 5.75% -> 5.50%
      <- [day 6839] macro.cpi: CPI 0.12% on the month, 3.1% on the year
        <- [day 6809] macro.demand: household spending 0.82M per day
      <- [day 6839] macro.jobs: unemployment 7.0%
        <- [day 6809] macro.demand: household spending 0.82M per day
```

- Day 6840: $10,560,199 → $10,767,824

```
[day 6839] loan.default p_5000: Elo Farandale missed three payments on 170898
  <- [day 6809] cb.rate cb: policy rate 6.00% -> 5.75%
    <- [day 6809] macro.cpi: CPI -0.07% on the month, 3.7% on the year
      <- [day 6809] firm.price frm_ruddy_metals: copper price -2.6% this month (unit cost -1.0%, 0 tight days)
        <- [day 6809] firm.price frm_coppercliff: copper ore price -1.6% this month (unit cost 0.1%, 0 tight days)
        <- [day 6749] macro.wage: wages 0.25% this month
      <- [day 6809] firm.price frm_irongate: steel price -2.3% this month (unit cost -0.6%, 0 tight days)
        <- [day 6779] macro.demand: household spending 0.81M per day
      <- [day 6809] firm.price frm_forgeworks: steel price -1.7% this month (unit cost -0.6%, 0 tight days)
        <- [day 6779] macro.demand: household spending 0.81M per day
    <- [day 6809] macro.jobs: unemployment 7.6%
      <- [day 6779] macro.demand: household spending 0.81M per day
        <- [day 6779] macro.cpi: CPI 0.39% on the month, 3.9% on the year
        <- [day 6779] macro.jobs: unemployment 9.1%
        <- [day 6749] cb.rate cb: policy rate 5.75% -> 6.00%

[day 6839] loan.default p_5000: Elo Farandale missed three payments on 31
  <- [day 6809] cb.rate cb: policy rate 6.00% -> 5.75%
    <- [day 6809] macro.cpi: CPI -0.07% on the month, 3.7% on the year
      <- [day 6809] firm.price frm_ruddy_metals: copper price -2.6% this month (unit cost -1.0%, 0 tight days)
        <- [day 6809] firm.price frm_coppercliff: copper ore price -1.6% this month (unit cost 0.1%, 0 tight days)
        <- [day 6749] macro.wage: wages 0.25% this month
      <- [day 6809] firm.price frm_irongate: steel price -2.3% this month (unit cost -0.6%, 0 tight days)
        <- [day 6779] macro.demand: household spending 0.81M per day
      <- [day 6809] firm.price frm_forgeworks: steel price -1.7% this month (unit cost -0.6%, 0 tight days)
        <- [day 6779] macro.demand: household spending 0.81M per day
    <- [day 6809] macro.jobs: unemployment 7.6%
      <- [day 6779] macro.demand: household spending 0.81M per day
        <- [day 6779] macro.cpi: CPI 0.39% on the month, 3.9% on the year
        <- [day 6779] macro.jobs: unemployment 9.1%
        <- [day 6749] cb.rate cb: policy rate 5.75% -> 6.00%

[day 6839] loan.default p_5000: Elo Farandale missed three payments on 40540
  <- [day 6809] cb.rate cb: policy rate 6.00% -> 5.75%
    <- [day 6809] macro.cpi: CPI -0.07% on the month, 3.7% on the year
      <- [day 6809] firm.price frm_ruddy_metals: copper price -2.6% this month (unit cost -1.0%, 0 tight days)
        <- [day 6809] firm.price frm_coppercliff: copper ore price -1.6% this month (unit cost 0.1%, 0 tight days)
        <- [day 6749] macro.wage: wages 0.25% this month
      <- [day 6809] firm.price frm_irongate: steel price -2.3% this month (unit cost -0.6%, 0 tight days)
        <- [day 6779] macro.demand: household spending 0.81M per day
      <- [day 6809] firm.price frm_forgeworks: steel price -1.7% this month (unit cost -0.6%, 0 tight days)
        <- [day 6779] macro.demand: household spending 0.81M per day
    <- [day 6809] macro.jobs: unemployment 7.6%
      <- [day 6779] macro.demand: household spending 0.81M per day
        <- [day 6779] macro.cpi: CPI 0.39% on the month, 3.9% on the year
        <- [day 6779] macro.jobs: unemployment 9.1%
        <- [day 6749] cb.rate cb: policy rate 5.75% -> 6.00%

[day 6839] law.offence p_5000: Elo Farandale left $170898 unpaid after a default
  <- [day 6839] loan.default p_5000: Elo Farandale missed three payments on 170898
    <- [day 6809] cb.rate cb: policy rate 6.00% -> 5.75%
      <- [day 6809] macro.cpi: CPI -0.07% on the month, 3.7% on the year
        <- [day 6809] firm.price frm_ruddy_metals: copper price -2.6% this month (unit cost -1.0%, 0 tight days)
        <- [day 6809] firm.price frm_irongate: steel price -2.3% this month (unit cost -0.6%, 0 tight days)
        <- [day 6809] firm.price frm_forgeworks: steel price -1.7% this month (unit cost -0.6%, 0 tight days)
      <- [day 6809] macro.jobs: unemployment 7.6%
        <- [day 6779] macro.demand: household spending 0.81M per day
```

- Day 7172: $12,573,290 → $12,776,294

```
(no event that day names the player; the move is a mark)
```

- Day 7171: $12,375,244 → $12,573,290

```
(no event that day names the player; the move is a mark)
```

- Day 6991: $11,681,723 → $11,869,947

```
(no event that day names the player; the move is a mark)
```

## Missing commands

None. Every strategy had the commands it needed.

## Cost

Wall clock 12012s on 4 cores. Sum of run times 47999s across 220 runs. No paid model API.
