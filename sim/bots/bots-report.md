# Bot balance report

20 worlds (seeds 1–20), 20 years, 5,000 people. Each strategy played each world in its own process, acting once a week through the player. The stock index is the exchange's capitalisation-weighted price index (market value of listed shares over their value at the open). Books were checked every 30 days and on the last day.

## Flags

- **index investor** 10th percentile 4.53x beats the index median 3.77x (too safe).
- **momentum** 10th percentile 5.63x beats the index median 3.81x (too safe).
- **value** 10th percentile 7.63x beats the index median 3.79x (too safe).
- **gambler** 10th percentile 29.09x beats the index median 3.94x (too safe).
- **insider** 10th percentile 4.28x beats the index median 3.78x (too safe).
- **insider** was caught in every run (20/20).
- **gambler** seed 3 finished at 70.80x (above 50×, likely exploit).
- **gambler** seed 6 finished at 61.53x (above 50×, likely exploit).
- **gambler** seed 8 finished at 109.69x (above 50×, likely exploit).
- **gambler** seed 9 finished at 53.47x (above 50×, likely exploit).
- **gambler** seed 13 finished at 58.52x (above 50×, likely exploit).
- **gambler** seed 19 finished at 85.17x (above 50×, likely exploit).
- **value** seed 19 act threw: day 6120: Maximum call stack size exceeded
- **value** seed 19 act threw: [day 6120] firm.succession frm_sawyer: Quinis Verorstone (36) becomes chief executive of Sawyer and Sons, spouse of Torin Wenkelford, after Torin Wenkelford left to run Meridian Fuels
[day 6120] firm.succession frm_beacon_net: Torin Wenkelford (36) becomes chief executive of Beacon Networks, spouse of Quinis Verorstone, after Quinis Verorstone left to run Sawyer and Sons
[day 6120] firm.succession frm_meridian_fuel: Quinis Verorstone (36) becomes chief executive of Meridian Fuels, spouse of Torin Wenkelford, after Torin Wenkelford left to run Beacon Networks
[day 6120] firm.succession frm_sawyer: Torin Wenkelford (36) becomes chief executive of Sawyer and Sons, spouse of Quinis Verorstone, after Quinis Verorstone left to run Meridian Fuels
[day 6120] firm.succession frm_beacon_net: Quinis Verorstone (36) becomes chief executive of Beacon Networks, spouse of Torin Wenkelford, after Torin Wenkelford left to run Sawyer and Sons
[day 6120] firm.succession frm_meridian_fuel: Torin Wenkelford (36) becomes chief executive of Meridian Fuels, spouse of Quinis Verorstone, after Quinis Verorstone left to run Beacon Networks
[day 6120] firm.succession frm_sawyer: Quinis Verorstone (36) becomes chief executive of Sawyer and Sons, spouse of Torin Wenkelford, after Torin Wenkelford left to run Meridian Fuels
[day 6120] firm.succession frm_beacon_net: Torin Wenkelford (36) becomes chief executive of Beacon Networks, spouse of Quinis Verorstone, after Quinis Verorstone left to run Sawyer and Sons
- **value** seed 19 act threw: [day 6038] opt.insider p_2864: Belel Oryanstone bought a short-dated call on Verdant Agrichem while its monthly figures were still unpublished
[day 6038] opt.insider p_3992: Ela Isnorham bought a short-dated put on Polymera while its monthly figures were still unpublished
[day 6039] opt.insider p_1708: Wenis Belsalby bought a short-dated call on Verdant Agrichem while its monthly figures were still unpublished
[day 6040] opt.insider p_1000: Tora Corjorwell bought a short-dated call on Verdant Agrichem while its monthly figures were still unpublished
[day 6059] opt.insider p_2755: Linus Ordanley bought a short-dated put on Verdant Agrichem while its monthly figures were still unpublished
[day 6119] opt.insider p_4019: Dania Perdanell bought a short-dated put on The Daily Herald while its monthly figures were still unpublished
- **value** seed 19 broke the books: day 6120: Maximum call stack size exceeded

## Strategies

| Strategy | p10 | median | p90 | bankrupt | dead | prison | caught | ann. return | index ann. | excess |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| do nothing | 0.96x | 1.28x | 2.36x | 0/20 | 0/20 | 0/20 | 0 | 1.2% | 6.9% | -5.3% |
| index investor | 4.53x | 5.53x | 6.83x | 0/20 | 0/20 | 5/20 | 12 | 8.9% | 6.9% | 2.0% |
| bond ladder | 1.51x | 2.49x | 3.41x | 0/20 | 0/20 | 0/20 | 1 | 4.6% | 6.7% | -2.1% |
| momentum | 5.63x | 6.95x | 12.68x | 0/20 | 0/20 | 2/20 | 9 | 10.2% | 6.9% | 3.9% |
| value | 7.63x | 9.92x | 16.42x | 0/20 | 0/20 | 3/20 | 20 | 12.2% | 6.9% | 5.3% |
| gambler | 29.09x | 37.86x | 72.24x | 0/20 | 0/20 | 3/20 | 29 | 19.9% | 7.1% | 12.9% |
| memecoin | 0.84x | 1.21x | 1.85x | 0/20 | 0/20 | 0/20 | 8 | 1.0% | 6.7% | -5.7% |
| insider | 4.28x | 5.87x | 8.70x | 0/20 | 0/20 | 19/20 | 57 | 9.2% | 6.9% | 2.2% |
| raider | 0.62x | 0.82x | 7.06x | 0/20 | 0/20 | 3/20 | 7 | -1.0% | 6.6% | -7.2% |
| landlord | 1.32x | 1.93x | 2.60x | 0/20 | 0/20 | 0/20 | 0 | 3.3% | 6.9% | -3.8% |
| random | 3.21x | 4.22x | 6.47x | 0/20 | 0/20 | 4/20 | 17 | 7.5% | 7.1% | 0.0% |

Final net worth is the multiple of the player’s worth on day 0. Annualised return uses the days the run actually lived. Excess is that return minus the same world’s index. Caught is charges and convictions of anyone who was the player, counting a case once.

## Exploits

### gambler seed 3 — 70.80x

Start $150,000, end $10,619,884, 7200 days. Year-end worth: day 360 $790,178; day 720 $1,107,394; day 1080 $1,093,847; day 1440 $1,209,320; day 1800 $1,262,362; day 2160 $2,771,547; day 2520 $2,997,638; day 2880 $3,439,083; day 3240 $4,059,020; day 3600 $4,209,273; day 3960 $4,393,477; day 4320 $4,509,202; day 4680 $4,741,875; day 5040 $4,972,115; day 5400 $5,212,777; day 5760 $5,596,563; day 6120 $6,822,132; day 6480 $8,281,540; day 6840 $9,622,168; day 7200 $10,619,884.

Biggest up-days:

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

- Day 1890: $1,348,181 → $1,511,057

```
[day 1889] loan.default p_5000: Danin Yanwenby missed three payments on 99420
  <- [day 1859] cb.rate cb: policy rate 4.75% -> 6.00%
    <- [day 1859] macro.cpi: CPI 0.95% on the month, 5.7% on the year
      <- [day 1859] firm.price frm_northgrid: electricity price +2.9% this month (unit cost 1.5%, 0 tight days)
        <- [day 1829] firm.price frm_blackvein: coal price +48.1% this month (unit cost 49.4%, 12 tight days)
        <- [day 1829] macro.wage: wages 0.68% this month
      <- [day 1859] firm.price frm_voltana: electricity price +2.8% this month (unit cost 1.5%, 0 tight days)
        <- [day 1829] firm.price frm_blackvein: coal price +48.1% this month (unit cost 49.4%, 12 tight days)
        <- [day 1829] macro.wage: wages 0.68% this month
      <- [day 1859] firm.price frm_vantage_motors: vehicles price +2.0% this month (unit cost 1.7%, 0 tight days)
        <- [day 1859] firm.price frm_irongate: steel price +2.5% this month (unit cost 1.5%, 0 tight days)
        <- [day 1859] firm.price frm_forgeworks: steel price +2.6% this month (unit cost 1.5%, 0 tight days)
        <- [day 1859] firm.price frm_skylite: aluminium price +2.1% this month (unit cost 1.5%, 0 tight days)
        <- [day 1859] firm.price frm_silicrest: semiconductors price +2.1% this month (unit cost 0.9%, 11 tight days)
    <- [day 1859] macro.jobs: unemployment 7.4%
      <- [day 1829] macro.demand: household spending 0.50M per day
        <- [day 1829] macro.cpi: CPI 1.05% on the month, 4.8% on the year
        <- [day 1829] macro.jobs: unemployment 5.2%
        <- [day 1799] cb.rate cb: policy rate 3.75% -> 4.00%
  <- [day 1792] person.breakdown p_5000: Danin Yanwenby (34) stops working at Titan Machine Works for sixty days after a loss at Titan Machine Works
    <- [day 1792] person.thought p_5000: Danin Yanwenby (34) cannot shake it: a loss at Titan Machine Works
      <- [day 1792] firm.insider frm_titan_machine: Titan Machine Works insiders see a monthly loss of 1420 with a week still to run
        <- [day 1769] firm.price frm_titan_machine: industrial machinery price -4.3% this month (unit cost -0.6%, 0 tight days)

[day 1889] loan.default p_5000: Danin Yanwenby missed three payments on 64682
  <- [day 1859] cb.rate cb: policy rate 4.75% -> 6.00%
    <- [day 1859] macro.cpi: CPI 0.95% on the month, 5.7% on the year
      <- [day 1859] firm.price frm_northgrid: electricity price +2.9% this month (unit cost 1.5%, 0 tight days)
        <- [day 1829] firm.price frm_blackvein: coal price +48.1% this month (unit cost 49.4%, 12 tight days)
        <- [day 1829] macro.wage: wages 0.68% this month
      <- [day 1859] firm.price frm_voltana: electricity price +2.8% this month (unit cost 1.5%, 0 tight days)
        <- [day 1829] firm.price frm_blackvein: coal price +48.1% this month (unit cost 49.4%, 12 tight days)
        <- [day 1829] macro.wage: wages 0.68% this month
      <- [day 1859] firm.price frm_vantage_motors: vehicles price +2.0% this month (unit cost 1.7%, 0 tight days)
        <- [day 1859] firm.price frm_irongate: steel price +2.5% this month (unit cost 1.5%, 0 tight days)
        <- [day 1859] firm.price frm_forgeworks: steel price +2.6% this month (unit cost 1.5%, 0 tight days)
        <- [day 1859] firm.price frm_skylite: aluminium price +2.1% this month (unit cost 1.5%, 0 tight days)
        <- [day 1859] firm.price frm_silicrest: semiconductors price +2.1% this month (unit cost 0.9%, 11 tight days)
    <- [day 1859] macro.jobs: unemployment 7.4%
      <- [day 1829] macro.demand: household spending 0.50M per day
        <- [day 1829] macro.cpi: CPI 1.05% on the month, 4.8% on the year
        <- [day 1829] macro.jobs: unemployment 5.2%
        <- [day 1799] cb.rate cb: policy rate 3.75% -> 4.00%
  <- [day 1792] person.breakdown p_5000: Danin Yanwenby (34) stops working at Titan Machine Works for sixty days after a loss at Titan Machine Works
    <- [day 1792] person.thought p_5000: Danin Yanwenby (34) cannot shake it: a loss at Titan Machine Works
      <- [day 1792] firm.insider frm_titan_machine: Titan Machine Works insiders see a monthly loss of 1420 with a week still to run
        <- [day 1769] firm.price frm_titan_machine: industrial machinery price -4.3% this month (unit cost -0.6%, 0 tight days)

[day 1889] loan.default p_5000: Danin Yanwenby missed three payments on 31
  <- [day 1859] cb.rate cb: policy rate 4.75% -> 6.00%
    <- [day 1859] macro.cpi: CPI 0.95% on the month, 5.7% on the year
      <- [day 1859] firm.price frm_northgrid: electricity price +2.9% this month (unit cost 1.5%, 0 tight days)
        <- [day 1829] firm.price frm_blackvein: coal price +48.1% this month (unit cost 49.4%, 12 tight days)
        <- [day 1829] macro.wage: wages 0.68% this month
      <- [day 1859] firm.price frm_voltana: electricity price +2.8% this month (unit cost 1.5%, 0 tight days)
        <- [day 1829] firm.price frm_blackvein: coal price +48.1% this month (unit cost 49.4%, 12 tight days)
        <- [day 1829] macro.wage: wages 0.68% this month
      <- [day 1859] firm.price frm_vantage_motors: vehicles price +2.0% this month (unit cost 1.7%, 0 tight days)
        <- [day 1859] firm.price frm_irongate: steel price +2.5% this month (unit cost 1.5%, 0 tight days)
        <- [day 1859] firm.price frm_forgeworks: steel price +2.6% this month (unit cost 1.5%, 0 tight days)
        <- [day 1859] firm.price frm_skylite: aluminium price +2.1% this month (unit cost 1.5%, 0 tight days)
        <- [day 1859] firm.price frm_silicrest: semiconductors price +2.1% this month (unit cost 0.9%, 11 tight days)
    <- [day 1859] macro.jobs: unemployment 7.4%
      <- [day 1829] macro.demand: household spending 0.50M per day
        <- [day 1829] macro.cpi: CPI 1.05% on the month, 4.8% on the year
        <- [day 1829] macro.jobs: unemployment 5.2%
        <- [day 1799] cb.rate cb: policy rate 3.75% -> 4.00%
  <- [day 1792] person.breakdown p_5000: Danin Yanwenby (34) stops working at Titan Machine Works for sixty days after a loss at Titan Machine Works
    <- [day 1792] person.thought p_5000: Danin Yanwenby (34) cannot shake it: a loss at Titan Machine Works
      <- [day 1792] firm.insider frm_titan_machine: Titan Machine Works insiders see a monthly loss of 1420 with a week still to run
        <- [day 1769] firm.price frm_titan_machine: industrial machinery price -4.3% this month (unit cost -0.6%, 0 tight days)

[day 1889] law.offence p_5000: Danin Yanwenby left $99420 unpaid after a default
  <- [day 1889] loan.default p_5000: Danin Yanwenby missed three payments on 99420
    <- [day 1859] cb.rate cb: policy rate 4.75% -> 6.00%
      <- [day 1859] macro.cpi: CPI 0.95% on the month, 5.7% on the year
        <- [day 1859] firm.price frm_northgrid: electricity price +2.9% this month (unit cost 1.5%, 0 tight days)
        <- [day 1859] firm.price frm_voltana: electricity price +2.8% this month (unit cost 1.5%, 0 tight days)
        <- [day 1859] firm.price frm_vantage_motors: vehicles price +2.0% this month (unit cost 1.7%, 0 tight days)
      <- [day 1859] macro.jobs: unemployment 7.4%
        <- [day 1829] macro.demand: household spending 0.50M per day
    <- [day 1792] person.breakdown p_5000: Danin Yanwenby (34) stops working at Titan Machine Works for sixty days after a loss at Titan Machine Works
      <- [day 1792] person.thought p_5000: Danin Yanwenby (34) cannot shake it: a loss at Titan Machine Works
        <- [day 1792] firm.insider frm_titan_machine: Titan Machine Works insiders see a monthly loss of 1420 with a week still to run
```

- Day 7171: $10,379,949 → $10,529,848

```
(no event that day names the player; the move is a mark)
```

- Day 5880: $5,790,226 → $5,935,495

```
[day 5879] loan.default p_5000: Danin Yanwenby missed three payments on 102448
  <- [day 5819] cb.rate cb: policy rate 6.00% -> 6.25%
    <- [day 5819] macro.cpi: CPI 0.32% on the month, 2.6% on the year
      <- [day 5819] firm.price frm_salar: lithium price +2.5% this month (unit cost 0.3%, 25 tight days)
        <- [day 5791] firm.stockout frm_salar: sold out of lithium; demand unmet
    <- [day 5819] macro.jobs: unemployment 5.3%
      <- [day 5789] macro.demand: household spending 0.75M per day
        <- [day 5789] macro.cpi: CPI 0.40% on the month, 3.7% on the year
        <- [day 5789] macro.jobs: unemployment 5.9%
        <- [day 5759] cb.rate cb: policy rate 5.25% -> 5.75%
  <- [day 5707] person.breakdown p_5000: Danin Yanwenby (45) withdraws and stops looking for work after a month without work
    <- [day 5707] person.thought p_5000: Danin Yanwenby (45) cannot shake it: a month without work
      <- [day 5699] macro.demand: household spending 0.75M per day
        <- [day 5699] macro.cpi: CPI 0.18% on the month, 4.2% on the year
        <- [day 5699] macro.jobs: unemployment 4.6%
        <- [day 5669] cb.rate cb: policy rate 4.00% -> 4.25%

[day 5879] loan.default p_5000: Danin Yanwenby missed three payments on 6
  <- [day 5819] cb.rate cb: policy rate 6.00% -> 6.25%
    <- [day 5819] macro.cpi: CPI 0.32% on the month, 2.6% on the year
      <- [day 5819] firm.price frm_salar: lithium price +2.5% this month (unit cost 0.3%, 25 tight days)
        <- [day 5791] firm.stockout frm_salar: sold out of lithium; demand unmet
    <- [day 5819] macro.jobs: unemployment 5.3%
      <- [day 5789] macro.demand: household spending 0.75M per day
        <- [day 5789] macro.cpi: CPI 0.40% on the month, 3.7% on the year
        <- [day 5789] macro.jobs: unemployment 5.9%
        <- [day 5759] cb.rate cb: policy rate 5.25% -> 5.75%
  <- [day 5707] person.breakdown p_5000: Danin Yanwenby (45) withdraws and stops looking for work after a month without work
    <- [day 5707] person.thought p_5000: Danin Yanwenby (45) cannot shake it: a month without work
      <- [day 5699] macro.demand: household spending 0.75M per day
        <- [day 5699] macro.cpi: CPI 0.18% on the month, 4.2% on the year
        <- [day 5699] macro.jobs: unemployment 4.6%
        <- [day 5669] cb.rate cb: policy rate 4.00% -> 4.25%

[day 5879] loan.default p_5000: Danin Yanwenby missed three payments on 22842
  <- [day 5819] cb.rate cb: policy rate 6.00% -> 6.25%
    <- [day 5819] macro.cpi: CPI 0.32% on the month, 2.6% on the year
      <- [day 5819] firm.price frm_salar: lithium price +2.5% this month (unit cost 0.3%, 25 tight days)
        <- [day 5791] firm.stockout frm_salar: sold out of lithium; demand unmet
    <- [day 5819] macro.jobs: unemployment 5.3%
      <- [day 5789] macro.demand: household spending 0.75M per day
        <- [day 5789] macro.cpi: CPI 0.40% on the month, 3.7% on the year
        <- [day 5789] macro.jobs: unemployment 5.9%
        <- [day 5759] cb.rate cb: policy rate 5.25% -> 5.75%
  <- [day 5707] person.breakdown p_5000: Danin Yanwenby (45) withdraws and stops looking for work after a month without work
    <- [day 5707] person.thought p_5000: Danin Yanwenby (45) cannot shake it: a month without work
      <- [day 5699] macro.demand: household spending 0.75M per day
        <- [day 5699] macro.cpi: CPI 0.18% on the month, 4.2% on the year
        <- [day 5699] macro.jobs: unemployment 4.6%
        <- [day 5669] cb.rate cb: policy rate 4.00% -> 4.25%

[day 5879] loan.default p_5000: Danin Yanwenby missed three payments on 30
  <- [day 5819] cb.rate cb: policy rate 6.00% -> 6.25%
    <- [day 5819] macro.cpi: CPI 0.32% on the month, 2.6% on the year
      <- [day 5819] firm.price frm_salar: lithium price +2.5% this month (unit cost 0.3%, 25 tight days)
        <- [day 5791] firm.stockout frm_salar: sold out of lithium; demand unmet
    <- [day 5819] macro.jobs: unemployment 5.3%
      <- [day 5789] macro.demand: household spending 0.75M per day
        <- [day 5789] macro.cpi: CPI 0.40% on the month, 3.7% on the year
        <- [day 5789] macro.jobs: unemployment 5.9%
        <- [day 5759] cb.rate cb: policy rate 5.25% -> 5.75%
  <- [day 5707] person.breakdown p_5000: Danin Yanwenby (45) withdraws and stops looking for work after a month without work
    <- [day 5707] person.thought p_5000: Danin Yanwenby (45) cannot shake it: a month without work
      <- [day 5699] macro.demand: household spending 0.75M per day
        <- [day 5699] macro.cpi: CPI 0.18% on the month, 4.2% on the year
        <- [day 5699] macro.jobs: unemployment 4.6%
        <- [day 5669] cb.rate cb: policy rate 4.00% -> 4.25%

[day 5879] loan.default p_5000: Danin Yanwenby missed three payments on 1114
  <- [day 5819] cb.rate cb: policy rate 6.00% -> 6.25%
    <- [day 5819] macro.cpi: CPI 0.32% on the month, 2.6% on the year
      <- [day 5819] firm.price frm_salar: lithium price +2.5% this month (unit cost 0.3%, 25 tight days)
        <- [day 5791] firm.stockout frm_salar: sold out of lithium; demand unmet
    <- [day 5819] macro.jobs: unemployment 5.3%
      <- [day 5789] macro.demand: household spending 0.75M per day
        <- [day 5789] macro.cpi: CPI 0.40% on the month, 3.7% on the year
        <- [day 5789] macro.jobs: unemployment 5.9%
        <- [day 5759] cb.rate cb: policy rate 5.25% -> 5.75%
  <- [day 5707] person.breakdown p_5000: Danin Yanwenby (45) withdraws and stops looking for work after a month without work
    <- [day 5707] person.thought p_5000: Danin Yanwenby (45) cannot shake it: a month without work
      <- [day 5699] macro.demand: household spending 0.75M per day
        <- [day 5699] macro.cpi: CPI 0.18% on the month, 4.2% on the year
        <- [day 5699] macro.jobs: unemployment 4.6%
        <- [day 5669] cb.rate cb: policy rate 4.00% -> 4.25%
```

- Day 2010: $1,859,648 → $1,994,818

```
[day 2009] loan.default p_5000: Danin Yanwenby missed three payments on 88946
  <- [day 1979] cb.rate cb: policy rate 5.50% -> 2.75%
    <- [day 1979] macro.cpi: CPI -0.52% on the month, 3.3% on the year
      <- [day 1979] firm.price frm_northgrid: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
      <- [day 1979] firm.price frm_voltana: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
      <- [day 1979] firm.price frm_blackvein: coal price -32.7% this month (unit cost -32.9%, 0 tight days)
        <- [day 1979] firm.price frm_northgrid: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)  (see above)
        <- [day 1979] firm.price frm_voltana: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)  (see above)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
    <- [day 1979] macro.jobs: unemployment 15.4%
      <- [day 1949] macro.demand: household spending 0.49M per day
        <- [day 1949] macro.cpi: CPI -0.05% on the month, 4.3% on the year
        <- [day 1949] macro.jobs: unemployment 12.8%
        <- [day 1919] cb.rate cb: policy rate 7.00% -> 7.25%
  <- [day 2001] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 48% of wages and cut 17% of the staff
    <- [day 1979] macro.demand: household spending 0.44M per day
      <- [day 1979] macro.cpi: CPI -0.52% on the month, 3.3% on the year  (see above)
      <- [day 1979] macro.jobs: unemployment 15.4%  (see above)
      <- [day 1949] cb.rate cb: policy rate 7.25% -> 5.50%
        <- [day 1949] macro.cpi: CPI -0.05% on the month, 4.3% on the year
        <- [day 1949] macro.jobs: unemployment 12.8%

[day 2009] loan.default p_5000: Danin Yanwenby missed three payments on 485
  <- [day 1979] cb.rate cb: policy rate 5.50% -> 2.75%
    <- [day 1979] macro.cpi: CPI -0.52% on the month, 3.3% on the year
      <- [day 1979] firm.price frm_northgrid: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
      <- [day 1979] firm.price frm_voltana: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
      <- [day 1979] firm.price frm_blackvein: coal price -32.7% this month (unit cost -32.9%, 0 tight days)
        <- [day 1979] firm.price frm_northgrid: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)  (see above)
        <- [day 1979] firm.price frm_voltana: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)  (see above)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
    <- [day 1979] macro.jobs: unemployment 15.4%
      <- [day 1949] macro.demand: household spending 0.49M per day
        <- [day 1949] macro.cpi: CPI -0.05% on the month, 4.3% on the year
        <- [day 1949] macro.jobs: unemployment 12.8%
        <- [day 1919] cb.rate cb: policy rate 7.00% -> 7.25%
  <- [day 2001] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 48% of wages and cut 17% of the staff
    <- [day 1979] macro.demand: household spending 0.44M per day
      <- [day 1979] macro.cpi: CPI -0.52% on the month, 3.3% on the year  (see above)
      <- [day 1979] macro.jobs: unemployment 15.4%  (see above)
      <- [day 1949] cb.rate cb: policy rate 7.25% -> 5.50%
        <- [day 1949] macro.cpi: CPI -0.05% on the month, 4.3% on the year
        <- [day 1949] macro.jobs: unemployment 12.8%

[day 2009] loan.default p_5000: Danin Yanwenby missed three payments on 1724
  <- [day 1979] cb.rate cb: policy rate 5.50% -> 2.75%
    <- [day 1979] macro.cpi: CPI -0.52% on the month, 3.3% on the year
      <- [day 1979] firm.price frm_northgrid: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
      <- [day 1979] firm.price frm_voltana: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
      <- [day 1979] firm.price frm_blackvein: coal price -32.7% this month (unit cost -32.9%, 0 tight days)
        <- [day 1979] firm.price frm_northgrid: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)  (see above)
        <- [day 1979] firm.price frm_voltana: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)  (see above)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
    <- [day 1979] macro.jobs: unemployment 15.4%
      <- [day 1949] macro.demand: household spending 0.49M per day
        <- [day 1949] macro.cpi: CPI -0.05% on the month, 4.3% on the year
        <- [day 1949] macro.jobs: unemployment 12.8%
        <- [day 1919] cb.rate cb: policy rate 7.00% -> 7.25%
  <- [day 2001] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 48% of wages and cut 17% of the staff
    <- [day 1979] macro.demand: household spending 0.44M per day
      <- [day 1979] macro.cpi: CPI -0.52% on the month, 3.3% on the year  (see above)
      <- [day 1979] macro.jobs: unemployment 15.4%  (see above)
      <- [day 1949] cb.rate cb: policy rate 7.25% -> 5.50%
        <- [day 1949] macro.cpi: CPI -0.05% on the month, 4.3% on the year
        <- [day 1949] macro.jobs: unemployment 12.8%

[day 2009] loan.default p_5000: Danin Yanwenby missed three payments on 26443
  <- [day 1979] cb.rate cb: policy rate 5.50% -> 2.75%
    <- [day 1979] macro.cpi: CPI -0.52% on the month, 3.3% on the year
      <- [day 1979] firm.price frm_northgrid: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
      <- [day 1979] firm.price frm_voltana: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
      <- [day 1979] firm.price frm_blackvein: coal price -32.7% this month (unit cost -32.9%, 0 tight days)
        <- [day 1979] firm.price frm_northgrid: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)  (see above)
        <- [day 1979] firm.price frm_voltana: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)  (see above)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
    <- [day 1979] macro.jobs: unemployment 15.4%
      <- [day 1949] macro.demand: household spending 0.49M per day
        <- [day 1949] macro.cpi: CPI -0.05% on the month, 4.3% on the year
        <- [day 1949] macro.jobs: unemployment 12.8%
        <- [day 1919] cb.rate cb: policy rate 7.00% -> 7.25%
  <- [day 2001] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 48% of wages and cut 17% of the staff
    <- [day 1979] macro.demand: household spending 0.44M per day
      <- [day 1979] macro.cpi: CPI -0.52% on the month, 3.3% on the year  (see above)
      <- [day 1979] macro.jobs: unemployment 15.4%  (see above)
      <- [day 1949] cb.rate cb: policy rate 7.25% -> 5.50%
        <- [day 1949] macro.cpi: CPI -0.05% on the month, 4.3% on the year
        <- [day 1949] macro.jobs: unemployment 12.8%

[day 2009] loan.default p_5000: Danin Yanwenby missed three payments on 4926
  <- [day 1979] cb.rate cb: policy rate 5.50% -> 2.75%
    <- [day 1979] macro.cpi: CPI -0.52% on the month, 3.3% on the year
      <- [day 1979] firm.price frm_northgrid: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
      <- [day 1979] firm.price frm_voltana: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
      <- [day 1979] firm.price frm_blackvein: coal price -32.7% this month (unit cost -32.9%, 0 tight days)
        <- [day 1979] firm.price frm_northgrid: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)  (see above)
        <- [day 1979] firm.price frm_voltana: electricity price -11.3% this month (unit cost -13.8%, 0 tight days)  (see above)
        <- [day 1949] firm.price frm_titan_machine: industrial machinery price -3.0% this month (unit cost 0.4%, 0 tight days)
        <- [day 1889] macro.wage: wages 0.29% this month
    <- [day 1979] macro.jobs: unemployment 15.4%
      <- [day 1949] macro.demand: household spending 0.49M per day
        <- [day 1949] macro.cpi: CPI -0.05% on the month, 4.3% on the year
        <- [day 1949] macro.jobs: unemployment 12.8%
        <- [day 1919] cb.rate cb: policy rate 7.00% -> 7.25%
  <- [day 2001] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 48% of wages and cut 17% of the staff
    <- [day 1979] macro.demand: household spending 0.44M per day
      <- [day 1979] macro.cpi: CPI -0.52% on the month, 3.3% on the year  (see above)
      <- [day 1979] macro.jobs: unemployment 15.4%  (see above)
      <- [day 1949] cb.rate cb: policy rate 7.25% -> 5.50%
        <- [day 1949] macro.cpi: CPI -0.05% on the month, 4.3% on the year
        <- [day 1949] macro.jobs: unemployment 12.8%
```

- Day 6721: $9,115,232 → $9,245,952

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

### gambler seed 8 — 109.69x

Start $150,000, end $16,453,277, 7200 days. Year-end worth: day 360 $623,523; day 720 $931,151; day 1080 $984,801; day 1440 $1,045,832; day 1800 $1,542,293; day 2160 $1,794,399; day 2520 $1,736,885; day 2880 $1,945,091; day 3240 $2,609,807; day 3600 $2,854,617; day 3960 $3,190,024; day 4320 $3,702,148; day 4680 $4,133,967; day 5040 $4,609,628; day 5400 $5,268,181; day 5760 $6,471,976; day 6120 $8,105,815; day 6480 $10,000,700; day 6840 $13,600,236; day 7200 $16,453,277.

Biggest up-days:

- Day 6060: $7,426,597 → $7,754,147

```
[day 6059] loan.default p_5000: Elen Orhalard missed three payments on 254141
  <- [day 5969] cb.rate cb: policy rate 7.75% -> 7.50%
    <- [day 5969] macro.cpi: CPI 0.25% on the month, 3.8% on the year
      <- [day 5969] firm.price frm_titan_machine: industrial machinery price +1.6% this month (unit cost 0.4%, 30 tight days)
        <- [day 5939] macro.demand: household spending 0.78M per day
    <- [day 5969] macro.jobs: unemployment 4.0%
      <- [day 5939] macro.demand: household spending 0.78M per day
        <- [day 5939] macro.cpi: CPI 0.17% on the month, 4.0% on the year
        <- [day 5939] macro.jobs: unemployment 4.0%
        <- [day 5909] cb.rate cb: policy rate 9.00% -> 8.25%

[day 6059] loan.default p_5000: Elen Orhalard missed three payments on 74643
  <- [day 5969] cb.rate cb: policy rate 7.75% -> 7.50%
    <- [day 5969] macro.cpi: CPI 0.25% on the month, 3.8% on the year
      <- [day 5969] firm.price frm_titan_machine: industrial machinery price +1.6% this month (unit cost 0.4%, 30 tight days)
        <- [day 5939] macro.demand: household spending 0.78M per day
    <- [day 5969] macro.jobs: unemployment 4.0%
      <- [day 5939] macro.demand: household spending 0.78M per day
        <- [day 5939] macro.cpi: CPI 0.17% on the month, 4.0% on the year
        <- [day 5939] macro.jobs: unemployment 4.0%
        <- [day 5909] cb.rate cb: policy rate 9.00% -> 8.25%

[day 6059] loan.default p_5000: Elen Orhalard missed three payments on 3993
  <- [day 5969] cb.rate cb: policy rate 7.75% -> 7.50%
    <- [day 5969] macro.cpi: CPI 0.25% on the month, 3.8% on the year
      <- [day 5969] firm.price frm_titan_machine: industrial machinery price +1.6% this month (unit cost 0.4%, 30 tight days)
        <- [day 5939] macro.demand: household spending 0.78M per day
    <- [day 5969] macro.jobs: unemployment 4.0%
      <- [day 5939] macro.demand: household spending 0.78M per day
        <- [day 5939] macro.cpi: CPI 0.17% on the month, 4.0% on the year
        <- [day 5939] macro.jobs: unemployment 4.0%
        <- [day 5909] cb.rate cb: policy rate 9.00% -> 8.25%

[day 6059] loan.default p_5000: Elen Orhalard missed three payments on 7
  <- [day 5969] cb.rate cb: policy rate 7.75% -> 7.50%
    <- [day 5969] macro.cpi: CPI 0.25% on the month, 3.8% on the year
      <- [day 5969] firm.price frm_titan_machine: industrial machinery price +1.6% this month (unit cost 0.4%, 30 tight days)
        <- [day 5939] macro.demand: household spending 0.78M per day
    <- [day 5969] macro.jobs: unemployment 4.0%
      <- [day 5939] macro.demand: household spending 0.78M per day
        <- [day 5939] macro.cpi: CPI 0.17% on the month, 4.0% on the year
        <- [day 5939] macro.jobs: unemployment 4.0%
        <- [day 5909] cb.rate cb: policy rate 9.00% -> 8.25%

[day 6059] law.offence p_5000: Elen Orhalard left $254141 unpaid after a default
  <- [day 6059] loan.default p_5000: Elen Orhalard missed three payments on 254141
    <- [day 5969] cb.rate cb: policy rate 7.75% -> 7.50%
      <- [day 5969] macro.cpi: CPI 0.25% on the month, 3.8% on the year
        <- [day 5969] firm.price frm_titan_machine: industrial machinery price +1.6% this month (unit cost 0.4%, 30 tight days)
      <- [day 5969] macro.jobs: unemployment 4.0%
        <- [day 5939] macro.demand: household spending 0.78M per day
```

- Day 7194: $16,213,239 → $16,459,494

```
(no event that day names the player; the move is a mark)
```

- Day 7164: $15,949,070 → $16,188,328

```
(no event that day names the player; the move is a mark)
```

- Day 7134: $15,719,714 → $15,957,282

```
(no event that day names the player; the move is a mark)
```

- Day 7104: $15,488,526 → $15,721,899

```
(no event that day names the player; the move is a mark)
```

- Day 7074: $15,267,919 → $15,497,197

```
(no event that day names the player; the move is a mark)
```

### gambler seed 9 — 53.47x

Start $150,000, end $8,020,923, 7200 days. Year-end worth: day 360 $926,999; day 720 $1,257,438; day 1080 $1,250,348; day 1440 $1,354,870; day 1800 $2,759,342; day 2160 $2,784,423; day 2520 $3,068,942; day 2880 $3,395,622; day 3240 $3,773,287; day 3600 $4,141,239; day 3960 $4,214,031; day 4320 $4,497,377; day 4680 $4,571,311; day 5040 $4,904,470; day 5400 $5,212,003; day 5760 $5,577,845; day 6120 $6,274,288; day 6480 $7,014,570; day 6840 $8,690,155; day 7200 $8,020,923.

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

- Day 6510: $7,108,228 → $7,357,242

```
[day 6509] loan.default p_5000: Nora Elorford missed three payments on 198466
  <- [day 6479] cb.rate cb: policy rate 7.50% -> 8.00%
    <- [day 6479] macro.cpi: CPI 0.71% on the month, 4.6% on the year
      <- [day 6479] firm.price frm_titan_machine: industrial machinery price +1.9% this month (unit cost 0.5%, 30 tight days)
        <- [day 6449] macro.demand: household spending 0.81M per day
      <- [day 6479] firm.price frm_civitas: public works price +1.6% this month (unit cost 0.4%, 17 tight days)
        <- [day 6452] firm.stockout frm_civitas: sold out of public works; demand unmet
    <- [day 6479] macro.jobs: unemployment 4.0%
      <- [day 6449] macro.demand: household spending 0.81M per day
        <- [day 6449] macro.cpi: CPI 0.37% on the month, 4.3% on the year
        <- [day 6449] macro.jobs: unemployment 4.3%
        <- [day 6419] cb.rate cb: policy rate 7.00% -> 7.25%
  <- [day 5655] person.breakdown p_5000: Nora Elorford (45) stops working at Kestrel Builders for sixty days after wages unpaid at Kestrel Builders
    <- [day 5655] person.thought p_5000: Nora Elorford (45) cannot shake it: wages unpaid at Kestrel Builders
      <- [day 5655] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 94% of wages and cut 6% of the staff
        <- [day 5639] macro.demand: household spending 0.74M per day

[day 6509] loan.default p_5000: Nora Elorford missed three payments on 52368
  <- [day 6479] cb.rate cb: policy rate 7.50% -> 8.00%
    <- [day 6479] macro.cpi: CPI 0.71% on the month, 4.6% on the year
      <- [day 6479] firm.price frm_titan_machine: industrial machinery price +1.9% this month (unit cost 0.5%, 30 tight days)
        <- [day 6449] macro.demand: household spending 0.81M per day
      <- [day 6479] firm.price frm_civitas: public works price +1.6% this month (unit cost 0.4%, 17 tight days)
        <- [day 6452] firm.stockout frm_civitas: sold out of public works; demand unmet
    <- [day 6479] macro.jobs: unemployment 4.0%
      <- [day 6449] macro.demand: household spending 0.81M per day
        <- [day 6449] macro.cpi: CPI 0.37% on the month, 4.3% on the year
        <- [day 6449] macro.jobs: unemployment 4.3%
        <- [day 6419] cb.rate cb: policy rate 7.00% -> 7.25%
  <- [day 5655] person.breakdown p_5000: Nora Elorford (45) stops working at Kestrel Builders for sixty days after wages unpaid at Kestrel Builders
    <- [day 5655] person.thought p_5000: Nora Elorford (45) cannot shake it: wages unpaid at Kestrel Builders
      <- [day 5655] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 94% of wages and cut 6% of the staff
        <- [day 5639] macro.demand: household spending 0.74M per day

[day 6509] law.offence p_5000: Nora Elorford left $198466 unpaid after a default
  <- [day 6509] loan.default p_5000: Nora Elorford missed three payments on 198466
    <- [day 6479] cb.rate cb: policy rate 7.50% -> 8.00%
      <- [day 6479] macro.cpi: CPI 0.71% on the month, 4.6% on the year
        <- [day 6479] firm.price frm_titan_machine: industrial machinery price +1.9% this month (unit cost 0.5%, 30 tight days)
        <- [day 6479] firm.price frm_civitas: public works price +1.6% this month (unit cost 0.4%, 17 tight days)
      <- [day 6479] macro.jobs: unemployment 4.0%
        <- [day 6449] macro.demand: household spending 0.81M per day
    <- [day 5655] person.breakdown p_5000: Nora Elorford (45) stops working at Kestrel Builders for sixty days after wages unpaid at Kestrel Builders
      <- [day 5655] person.thought p_5000: Nora Elorford (45) cannot shake it: wages unpaid at Kestrel Builders
        <- [day 5655] firm.cashCrunch frm_kestrel_build: no cash and no credit: paid 94% of wages and cut 6% of the staff
```

- Day 1620: $1,457,388 → $1,634,539

```
[day 1619] loan.default p_5000: Nora Elorford missed three payments on 21214
  <- [day 1589] cb.rate cb: policy rate 11.25% -> 8.00%
    <- [day 1589] macro.cpi: CPI -0.04% on the month, 7.6% on the year
      <- [day 1589] firm.price frm_sawyer: lumber price -4.1% this month (unit cost -1.9%, 0 tight days)
        <- [day 1589] firm.price frm_tallpine: timber price -3.2% this month (unit cost -0.1%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1589] firm.price frm_bedrock: cement price -3.9% this month (unit cost -1.2%, 0 tight days)
        <- [day 1589] firm.price frm_greystone: sand and gravel price -2.7% this month (unit cost -0.1%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1589] firm.price frm_tallpine: timber price -3.2% this month (unit cost -0.1%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.43M per day
    <- [day 1589] macro.jobs: unemployment 18.9%
      <- [day 1559] macro.demand: household spending 0.43M per day
        <- [day 1559] macro.cpi: CPI 0.33% on the month, 8.2% on the year
        <- [day 1559] macro.jobs: unemployment 15.3%
        <- [day 1529] cb.rate cb: policy rate 10.75% -> 11.75%
  <- [day 1544] firm.layoffs frm_quanta: sales of semiconductors below plan: laying off staff
    <- [day 1529] macro.demand: household spending 0.44M per day
      <- [day 1529] macro.cpi: CPI 0.97% on the month, 7.3% on the year
        <- [day 1529] firm.price frm_kestrel_build: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
        <- [day 1529] firm.price frm_cornerstone: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
        <- [day 1529] firm.price frm_urbana: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
      <- [day 1529] macro.jobs: unemployment 9.3%
        <- [day 1499] macro.demand: household spending 0.48M per day
      <- [day 1499] cb.rate cb: policy rate 9.50% -> 10.75%
        <- [day 1499] macro.cpi: CPI 1.11% on the month, 7.2% on the year
        <- [day 1499] macro.jobs: unemployment 6.9%

[day 1619] loan.default p_5000: Nora Elorford missed three payments on 3485
  <- [day 1589] cb.rate cb: policy rate 11.25% -> 8.00%
    <- [day 1589] macro.cpi: CPI -0.04% on the month, 7.6% on the year
      <- [day 1589] firm.price frm_sawyer: lumber price -4.1% this month (unit cost -1.9%, 0 tight days)
        <- [day 1589] firm.price frm_tallpine: timber price -3.2% this month (unit cost -0.1%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1589] firm.price frm_bedrock: cement price -3.9% this month (unit cost -1.2%, 0 tight days)
        <- [day 1589] firm.price frm_greystone: sand and gravel price -2.7% this month (unit cost -0.1%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1589] firm.price frm_tallpine: timber price -3.2% this month (unit cost -0.1%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.43M per day
    <- [day 1589] macro.jobs: unemployment 18.9%
      <- [day 1559] macro.demand: household spending 0.43M per day
        <- [day 1559] macro.cpi: CPI 0.33% on the month, 8.2% on the year
        <- [day 1559] macro.jobs: unemployment 15.3%
        <- [day 1529] cb.rate cb: policy rate 10.75% -> 11.75%
  <- [day 1544] firm.layoffs frm_quanta: sales of semiconductors below plan: laying off staff
    <- [day 1529] macro.demand: household spending 0.44M per day
      <- [day 1529] macro.cpi: CPI 0.97% on the month, 7.3% on the year
        <- [day 1529] firm.price frm_kestrel_build: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
        <- [day 1529] firm.price frm_cornerstone: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
        <- [day 1529] firm.price frm_urbana: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
      <- [day 1529] macro.jobs: unemployment 9.3%
        <- [day 1499] macro.demand: household spending 0.48M per day
      <- [day 1499] cb.rate cb: policy rate 9.50% -> 10.75%
        <- [day 1499] macro.cpi: CPI 1.11% on the month, 7.2% on the year
        <- [day 1499] macro.jobs: unemployment 6.9%

[day 1619] loan.default p_5000: Nora Elorford missed three payments on 22696
  <- [day 1589] cb.rate cb: policy rate 11.25% -> 8.00%
    <- [day 1589] macro.cpi: CPI -0.04% on the month, 7.6% on the year
      <- [day 1589] firm.price frm_sawyer: lumber price -4.1% this month (unit cost -1.9%, 0 tight days)
        <- [day 1589] firm.price frm_tallpine: timber price -3.2% this month (unit cost -0.1%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1589] firm.price frm_bedrock: cement price -3.9% this month (unit cost -1.2%, 0 tight days)
        <- [day 1589] firm.price frm_greystone: sand and gravel price -2.7% this month (unit cost -0.1%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1589] firm.price frm_tallpine: timber price -3.2% this month (unit cost -0.1%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.43M per day
    <- [day 1589] macro.jobs: unemployment 18.9%
      <- [day 1559] macro.demand: household spending 0.43M per day
        <- [day 1559] macro.cpi: CPI 0.33% on the month, 8.2% on the year
        <- [day 1559] macro.jobs: unemployment 15.3%
        <- [day 1529] cb.rate cb: policy rate 10.75% -> 11.75%
  <- [day 1544] firm.layoffs frm_quanta: sales of semiconductors below plan: laying off staff
    <- [day 1529] macro.demand: household spending 0.44M per day
      <- [day 1529] macro.cpi: CPI 0.97% on the month, 7.3% on the year
        <- [day 1529] firm.price frm_kestrel_build: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
        <- [day 1529] firm.price frm_cornerstone: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
        <- [day 1529] firm.price frm_urbana: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
      <- [day 1529] macro.jobs: unemployment 9.3%
        <- [day 1499] macro.demand: household spending 0.48M per day
      <- [day 1499] cb.rate cb: policy rate 9.50% -> 10.75%
        <- [day 1499] macro.cpi: CPI 1.11% on the month, 7.2% on the year
        <- [day 1499] macro.jobs: unemployment 6.9%

[day 1619] loan.default p_5000: Nora Elorford missed three payments on 40613
  <- [day 1589] cb.rate cb: policy rate 11.25% -> 8.00%
    <- [day 1589] macro.cpi: CPI -0.04% on the month, 7.6% on the year
      <- [day 1589] firm.price frm_sawyer: lumber price -4.1% this month (unit cost -1.9%, 0 tight days)
        <- [day 1589] firm.price frm_tallpine: timber price -3.2% this month (unit cost -0.1%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1589] firm.price frm_bedrock: cement price -3.9% this month (unit cost -1.2%, 0 tight days)
        <- [day 1589] firm.price frm_greystone: sand and gravel price -2.7% this month (unit cost -0.1%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1589] firm.price frm_tallpine: timber price -3.2% this month (unit cost -0.1%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.43M per day
    <- [day 1589] macro.jobs: unemployment 18.9%
      <- [day 1559] macro.demand: household spending 0.43M per day
        <- [day 1559] macro.cpi: CPI 0.33% on the month, 8.2% on the year
        <- [day 1559] macro.jobs: unemployment 15.3%
        <- [day 1529] cb.rate cb: policy rate 10.75% -> 11.75%
  <- [day 1544] firm.layoffs frm_quanta: sales of semiconductors below plan: laying off staff
    <- [day 1529] macro.demand: household spending 0.44M per day
      <- [day 1529] macro.cpi: CPI 0.97% on the month, 7.3% on the year
        <- [day 1529] firm.price frm_kestrel_build: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
        <- [day 1529] firm.price frm_cornerstone: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
        <- [day 1529] firm.price frm_urbana: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
      <- [day 1529] macro.jobs: unemployment 9.3%
        <- [day 1499] macro.demand: household spending 0.48M per day
      <- [day 1499] cb.rate cb: policy rate 9.50% -> 10.75%
        <- [day 1499] macro.cpi: CPI 1.11% on the month, 7.2% on the year
        <- [day 1499] macro.jobs: unemployment 6.9%

[day 1619] loan.default p_5000: Nora Elorford missed three payments on 9933
  <- [day 1589] cb.rate cb: policy rate 11.25% -> 8.00%
    <- [day 1589] macro.cpi: CPI -0.04% on the month, 7.6% on the year
      <- [day 1589] firm.price frm_sawyer: lumber price -4.1% this month (unit cost -1.9%, 0 tight days)
        <- [day 1589] firm.price frm_tallpine: timber price -3.2% this month (unit cost -0.1%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1589] firm.price frm_bedrock: cement price -3.9% this month (unit cost -1.2%, 0 tight days)
        <- [day 1589] firm.price frm_greystone: sand and gravel price -2.7% this month (unit cost -0.1%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1589] firm.price frm_tallpine: timber price -3.2% this month (unit cost -0.1%, 0 tight days)
        <- [day 1559] macro.demand: household spending 0.43M per day
    <- [day 1589] macro.jobs: unemployment 18.9%
      <- [day 1559] macro.demand: household spending 0.43M per day
        <- [day 1559] macro.cpi: CPI 0.33% on the month, 8.2% on the year
        <- [day 1559] macro.jobs: unemployment 15.3%
        <- [day 1529] cb.rate cb: policy rate 10.75% -> 11.75%
  <- [day 1544] firm.layoffs frm_quanta: sales of semiconductors below plan: laying off staff
    <- [day 1529] macro.demand: household spending 0.44M per day
      <- [day 1529] macro.cpi: CPI 0.97% on the month, 7.3% on the year
        <- [day 1529] firm.price frm_kestrel_build: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
        <- [day 1529] firm.price frm_cornerstone: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
        <- [day 1529] firm.price frm_urbana: housing price +1.8% this month (unit cost 0.2%, 30 tight days)
      <- [day 1529] macro.jobs: unemployment 9.3%
        <- [day 1499] macro.demand: household spending 0.48M per day
      <- [day 1499] cb.rate cb: policy rate 9.50% -> 10.75%
        <- [day 1499] macro.cpi: CPI 1.11% on the month, 7.2% on the year
        <- [day 1499] macro.jobs: unemployment 6.9%
```

- Day 2430: $2,826,353 → $2,992,248

```
[day 2429] loan.default p_5000: Nora Elorford missed three payments on 152890
  <- [day 2399] cb.rate cb: policy rate 8.75% -> 8.50%
    <- [day 2399] macro.cpi: CPI 0.22% on the month, 4.3% on the year
      <- [day 2369] macro.demand: household spending 0.56M per day
        <- [day 2369] macro.cpi: CPI 0.28% on the month, 4.5% on the year
        <- [day 2369] macro.jobs: unemployment 6.2%
        <- [day 2099] cb.rate cb: policy rate 9.25% -> 9.00%
    <- [day 2399] macro.jobs: unemployment 5.0%
      <- [day 2369] macro.demand: household spending 0.56M per day  (see above)
  <- [day 2383] firm.layoffs frm_titan_machine: sales of industrial machinery below plan: laying off staff
    <- [day 2369] macro.demand: household spending 0.56M per day  (see above)

[day 2429] loan.default p_5000: Nora Elorford missed three payments on 892
  <- [day 2399] cb.rate cb: policy rate 8.75% -> 8.50%
    <- [day 2399] macro.cpi: CPI 0.22% on the month, 4.3% on the year
      <- [day 2369] macro.demand: household spending 0.56M per day
        <- [day 2369] macro.cpi: CPI 0.28% on the month, 4.5% on the year
        <- [day 2369] macro.jobs: unemployment 6.2%
        <- [day 2099] cb.rate cb: policy rate 9.25% -> 9.00%
    <- [day 2399] macro.jobs: unemployment 5.0%
      <- [day 2369] macro.demand: household spending 0.56M per day  (see above)
  <- [day 2383] firm.layoffs frm_titan_machine: sales of industrial machinery below plan: laying off staff
    <- [day 2369] macro.demand: household spending 0.56M per day  (see above)

[day 2429] loan.default p_5000: Nora Elorford missed three payments on 9433
  <- [day 2399] cb.rate cb: policy rate 8.75% -> 8.50%
    <- [day 2399] macro.cpi: CPI 0.22% on the month, 4.3% on the year
      <- [day 2369] macro.demand: household spending 0.56M per day
        <- [day 2369] macro.cpi: CPI 0.28% on the month, 4.5% on the year
        <- [day 2369] macro.jobs: unemployment 6.2%
        <- [day 2099] cb.rate cb: policy rate 9.25% -> 9.00%
    <- [day 2399] macro.jobs: unemployment 5.0%
      <- [day 2369] macro.demand: household spending 0.56M per day  (see above)
  <- [day 2383] firm.layoffs frm_titan_machine: sales of industrial machinery below plan: laying off staff
    <- [day 2369] macro.demand: household spending 0.56M per day  (see above)

[day 2429] loan.default p_5000: Nora Elorford missed three payments on 77
  <- [day 2399] cb.rate cb: policy rate 8.75% -> 8.50%
    <- [day 2399] macro.cpi: CPI 0.22% on the month, 4.3% on the year
      <- [day 2369] macro.demand: household spending 0.56M per day
        <- [day 2369] macro.cpi: CPI 0.28% on the month, 4.5% on the year
        <- [day 2369] macro.jobs: unemployment 6.2%
        <- [day 2099] cb.rate cb: policy rate 9.25% -> 9.00%
    <- [day 2399] macro.jobs: unemployment 5.0%
      <- [day 2369] macro.demand: household spending 0.56M per day  (see above)
  <- [day 2383] firm.layoffs frm_titan_machine: sales of industrial machinery below plan: laying off staff
    <- [day 2369] macro.demand: household spending 0.56M per day  (see above)

[day 2429] loan.default p_5000: Nora Elorford missed three payments on 2615
  <- [day 2399] cb.rate cb: policy rate 8.75% -> 8.50%
    <- [day 2399] macro.cpi: CPI 0.22% on the month, 4.3% on the year
      <- [day 2369] macro.demand: household spending 0.56M per day
        <- [day 2369] macro.cpi: CPI 0.28% on the month, 4.5% on the year
        <- [day 2369] macro.jobs: unemployment 6.2%
        <- [day 2099] cb.rate cb: policy rate 9.25% -> 9.00%
    <- [day 2399] macro.jobs: unemployment 5.0%
      <- [day 2369] macro.demand: household spending 0.56M per day  (see above)
  <- [day 2383] firm.layoffs frm_titan_machine: sales of industrial machinery below plan: laying off staff
    <- [day 2369] macro.demand: household spending 0.56M per day  (see above)
```

- Day 1590: $1,278,186 → $1,428,324

```
[day 1589] loan.default p_5000: Nora Elorford missed three payments on 71164
  <- [day 1559] cb.rate cb: policy rate 11.75% -> 11.25%
    <- [day 1559] macro.cpi: CPI 0.33% on the month, 8.2% on the year
      <- [day 1559] firm.price frm_sawyer: lumber price -4.8% this month (unit cost -1.5%, 0 tight days)
        <- [day 1559] firm.price frm_tallpine: timber price -3.0% this month (unit cost 0.5%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1559] firm.price frm_bedrock: cement price -4.3% this month (unit cost -0.9%, 0 tight days)
        <- [day 1559] firm.price frm_greystone: sand and gravel price -3.0% this month (unit cost 0.5%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1559] firm.price frm_ruddy_metals: copper price +3.2% this month (unit cost 1.4%, 30 tight days)
        <- [day 1530] firm.stockout frm_ruddy_metals: sold out of copper; demand unmet
        <- [day 1530] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1559] firm.price frm_coppercliff: copper ore price +1.9% this month (unit cost 0.5%, 30 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
    <- [day 1559] macro.jobs: unemployment 15.3%
      <- [day 1529] macro.demand: household spending 0.44M per day
        <- [day 1529] macro.cpi: CPI 0.97% on the month, 7.3% on the year
        <- [day 1529] macro.jobs: unemployment 9.3%
        <- [day 1499] cb.rate cb: policy rate 9.50% -> 10.75%
  <- [day 1544] firm.layoffs frm_quanta: sales of semiconductors below plan: laying off staff
    <- [day 1529] macro.demand: household spending 0.44M per day  (see above)

[day 1589] loan.default p_5000: Nora Elorford missed three payments on 4088
  <- [day 1559] cb.rate cb: policy rate 11.75% -> 11.25%
    <- [day 1559] macro.cpi: CPI 0.33% on the month, 8.2% on the year
      <- [day 1559] firm.price frm_sawyer: lumber price -4.8% this month (unit cost -1.5%, 0 tight days)
        <- [day 1559] firm.price frm_tallpine: timber price -3.0% this month (unit cost 0.5%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1559] firm.price frm_bedrock: cement price -4.3% this month (unit cost -0.9%, 0 tight days)
        <- [day 1559] firm.price frm_greystone: sand and gravel price -3.0% this month (unit cost 0.5%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1559] firm.price frm_ruddy_metals: copper price +3.2% this month (unit cost 1.4%, 30 tight days)
        <- [day 1530] firm.stockout frm_ruddy_metals: sold out of copper; demand unmet
        <- [day 1530] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1559] firm.price frm_coppercliff: copper ore price +1.9% this month (unit cost 0.5%, 30 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
    <- [day 1559] macro.jobs: unemployment 15.3%
      <- [day 1529] macro.demand: household spending 0.44M per day
        <- [day 1529] macro.cpi: CPI 0.97% on the month, 7.3% on the year
        <- [day 1529] macro.jobs: unemployment 9.3%
        <- [day 1499] cb.rate cb: policy rate 9.50% -> 10.75%
  <- [day 1544] firm.layoffs frm_quanta: sales of semiconductors below plan: laying off staff
    <- [day 1529] macro.demand: household spending 0.44M per day  (see above)

[day 1589] loan.default p_5000: Nora Elorford missed three payments on 65
  <- [day 1559] cb.rate cb: policy rate 11.75% -> 11.25%
    <- [day 1559] macro.cpi: CPI 0.33% on the month, 8.2% on the year
      <- [day 1559] firm.price frm_sawyer: lumber price -4.8% this month (unit cost -1.5%, 0 tight days)
        <- [day 1559] firm.price frm_tallpine: timber price -3.0% this month (unit cost 0.5%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1559] firm.price frm_bedrock: cement price -4.3% this month (unit cost -0.9%, 0 tight days)
        <- [day 1559] firm.price frm_greystone: sand and gravel price -3.0% this month (unit cost 0.5%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1559] firm.price frm_ruddy_metals: copper price +3.2% this month (unit cost 1.4%, 30 tight days)
        <- [day 1530] firm.stockout frm_ruddy_metals: sold out of copper; demand unmet
        <- [day 1530] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1559] firm.price frm_coppercliff: copper ore price +1.9% this month (unit cost 0.5%, 30 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
    <- [day 1559] macro.jobs: unemployment 15.3%
      <- [day 1529] macro.demand: household spending 0.44M per day
        <- [day 1529] macro.cpi: CPI 0.97% on the month, 7.3% on the year
        <- [day 1529] macro.jobs: unemployment 9.3%
        <- [day 1499] cb.rate cb: policy rate 9.50% -> 10.75%
  <- [day 1544] firm.layoffs frm_quanta: sales of semiconductors below plan: laying off staff
    <- [day 1529] macro.demand: household spending 0.44M per day  (see above)

[day 1589] loan.default p_5000: Nora Elorford missed three payments on 28785
  <- [day 1559] cb.rate cb: policy rate 11.75% -> 11.25%
    <- [day 1559] macro.cpi: CPI 0.33% on the month, 8.2% on the year
      <- [day 1559] firm.price frm_sawyer: lumber price -4.8% this month (unit cost -1.5%, 0 tight days)
        <- [day 1559] firm.price frm_tallpine: timber price -3.0% this month (unit cost 0.5%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1559] firm.price frm_bedrock: cement price -4.3% this month (unit cost -0.9%, 0 tight days)
        <- [day 1559] firm.price frm_greystone: sand and gravel price -3.0% this month (unit cost 0.5%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1559] firm.price frm_ruddy_metals: copper price +3.2% this month (unit cost 1.4%, 30 tight days)
        <- [day 1530] firm.stockout frm_ruddy_metals: sold out of copper; demand unmet
        <- [day 1530] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1559] firm.price frm_coppercliff: copper ore price +1.9% this month (unit cost 0.5%, 30 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
    <- [day 1559] macro.jobs: unemployment 15.3%
      <- [day 1529] macro.demand: household spending 0.44M per day
        <- [day 1529] macro.cpi: CPI 0.97% on the month, 7.3% on the year
        <- [day 1529] macro.jobs: unemployment 9.3%
        <- [day 1499] cb.rate cb: policy rate 9.50% -> 10.75%
  <- [day 1544] firm.layoffs frm_quanta: sales of semiconductors below plan: laying off staff
    <- [day 1529] macro.demand: household spending 0.44M per day  (see above)

[day 1589] loan.default p_5000: Nora Elorford missed three payments on 735
  <- [day 1559] cb.rate cb: policy rate 11.75% -> 11.25%
    <- [day 1559] macro.cpi: CPI 0.33% on the month, 8.2% on the year
      <- [day 1559] firm.price frm_sawyer: lumber price -4.8% this month (unit cost -1.5%, 0 tight days)
        <- [day 1559] firm.price frm_tallpine: timber price -3.0% this month (unit cost 0.5%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1559] firm.price frm_bedrock: cement price -4.3% this month (unit cost -0.9%, 0 tight days)
        <- [day 1559] firm.price frm_greystone: sand and gravel price -3.0% this month (unit cost 0.5%, 0 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
      <- [day 1559] firm.price frm_ruddy_metals: copper price +3.2% this month (unit cost 1.4%, 30 tight days)
        <- [day 1530] firm.stockout frm_ruddy_metals: sold out of copper; demand unmet
        <- [day 1530] firm.inputShort frm_ruddy_metals: could not buy enough copper ore; output cut
        <- [day 1559] firm.price frm_coppercliff: copper ore price +1.9% this month (unit cost 0.5%, 30 tight days)
        <- [day 1529] macro.wage: wages 0.48% this month
    <- [day 1559] macro.jobs: unemployment 15.3%
      <- [day 1529] macro.demand: household spending 0.44M per day
        <- [day 1529] macro.cpi: CPI 0.97% on the month, 7.3% on the year
        <- [day 1529] macro.jobs: unemployment 9.3%
        <- [day 1499] cb.rate cb: policy rate 9.50% -> 10.75%
  <- [day 1544] firm.layoffs frm_quanta: sales of semiconductors below plan: laying off staff
    <- [day 1529] macro.demand: household spending 0.44M per day  (see above)
```

- Day 6991: $7,938,253 → $8,055,358

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

Wall clock 6509s on 4 cores. Sum of run times 25931s across 220 runs. No paid model API.
