# STONKS-9800 — Market Simulation & Trading

Reverse-engineered from `data.win` (GMS2, bytecode v17, not YYC) by decompiling all
3,063 code entries with UndertaleModTool 0.9.2.0 + Underanalyzer. Decompiled GML lives in
`D:\stonks-re\full\code\`. Every formula below is copied verbatim from the decompiled
source unless explicitly marked INFERRED.

Notation: `gml_Object_o_control_Step_0.gml` = main game loop (237 KB),
`gml_Object_o_birza_Other_10.gml` = the exchange settlement pass.

---

## 1. Market shape

| Quantity | Value | Source |
|---|---|---|
| Listed companies | **30** (`global.numberofcompany`); many loops hardcode `for (i=0;i<30;i++)` | `generate_company.gml:153`, `o_birza_Other_10.gml:4` |
| Commodities | **6** (`global.commodity_player[i]`, `commodity_price[i]`) | `figa2.gml:52` |
| Sectors | **8** (`company_field[i] = irandom(7)`) | `generate_company.gml:46` |
| Exchange rate | `global.kurs`, RUB per USD | `o_control_Step_0.gml:1040-1071` |

### The three-layer price stack

```
company_price[i]        fundamental valuation (company "value", RUB)
company_hype[i]         speculative multiplier
rynochek                macro market multiplier
trend                   long-run macro trend

company_stockprice[i] = company_price[i] * 0.8 * company_hype[i] * rynochek * trend
price_stock(i)         = company_stockprice[i] / company_number_a[i]   <- quoted price
```
`update_price.gml:10`, `price_stock.gml:5`. The `0.8` is a constant haircut. Note the quoted
price is **total valuation / share count**, so issuing shares dilutes the quote directly.

---

## 2. Fundamental drift

**CORRECTION (verified against `o_control_Step_0.gml:1464-1485`):** the *daily* fundamental
drift for every listed company is `price *= (1 + 0.00225 · company_profit)`. The `0.00225` is
never a literal — it is `0.0015 * 1.5`:

```gml
// o_control_Step_0.gml:1469-1471
var pepsa = company_price[i] * 0.0015 * company_profit[i];
company_price[i]       = company_price[i] + (pepsa * 1.5);      // == price * 0.00225 * profit
company_stockprice[i]  = company_price[i] * 0.8 * company_hype[i] * rynochek * trend;
```

So `company_profit` is a **per-day fractional growth coefficient**: `profit = 0.3` →
+0.0675%/day, i.e. ~+28%/year compounded.

There is a second, weaker variant used for *instantaneous events* rather than the daily tick
(`update_price.gml:9`), with a **9× smaller** coefficient:

```gml
company_price[i] += company_price[i] * 0.001 * company_profit[i];
```

and at company *creation* a one-off `* 0.01 * profit` (`generate_company.gml:32`).

**Low-hype profit drag** (`o_control_Step_0.gml:1464-1468`) — hype below 0.5 bleeds profit:

```gml
if (company_hype[i] < 0.5) {
    var hypeminus = (1 - company_hype[i]) * 0.005;
    company_profit[i] -= company_profit[i] * hypeminus;
}
```
At hype = 0.5 the drag is 0.25%/day; at hype → 0.14 (the floor) it is 0.43%/day. A mild
negative-feedback loop that punishes abandoned names.

### 2.1 Pump & dump — the main catalyst for cheap stocks

`o_control_Step_0.gml:1472-1485`, **~0.9% per company per day** (`irandom(111) == 1`),
gated on the quoted share price being under 500:

```gml
if (irandom(111) == 1) {
    var price_1 = company_stockprice[i] / company_number_a[i];
    if (price_1 < 500) {
        company_price[i]       *= random_range(2, 4);
        company_hype[i]         = random_range(1.2, 2.2);     // absolute set, not multiplied
        company_hype_effect[i]  = irandom_range(5, 60);
        company_stockprice[i]  *= random_range(3, 22);          // 3x-22x spike
        update_price(i);
        create_notification(txt(76), txt(irandom_range(1456, 1461)));   // "News"
    }
}
```

This is the single largest price discontinuity in the game: a **3×–22× instantaneous spike**
in quoted price, accompanied by a public news item (ids 1456–1461). It only ever fires on
sub-500 stocks, i.e. the neglected small caps. Note `company_hype` is *assigned* a fresh
1.2–2.2 rather than multiplied, so hype jumps absolutely, and `update_price` then re-derives
stockprice from the (already inflated) `company_price`.

**Design read:** penny-stock speculation is the intended early-game strategy. The noise is
concentrated exactly where a player with little capital can reach it.

**Market-cap ceiling brake** (`o_control_Step_0.gml:1087`): when the per-share price exceeds a
re-rolled `irandom_range(5e6, 2.5e7)`, both price and stockprice are multiplied by
`random_range(0.98, 0.993)` — a −0.7…−2% daily bleed that prevents unbounded runaway.

---

## 3. Macro layer

### 2.1 `rynochek` — oscillating market regime

Day tick (`o_control_Step_0.gml:131-146`):

```gml
if (rynok_up == 1) rynochek += random_range(0.003, 0.01);
else              rynochek -= random_range(0.003, 0.01);

if (rynochek > random_range(1.1, 1.3)) rynok_up = 0;   // hit upper band -> start falling
if (rynochek < random_range(0.7, 0.9))  rynok_up = 1;   // hit lower band -> start rising
```

Initialised `rynochek = random_range(0.98, 1.02)` (`o_control_Create_0.gml:745`).

This is a **direction-flip random walk with re-randomised bounds**: the upper band is drawn
fresh from [1.1, 1.3] and the lower from [0.7, 0.9] every single day, so the oscillation
period and amplitude are themselves stochastic. Expected drift ≈ 0 over the long run.

Headline index level: `global.price_koef = round(1000 * rynochek * trend)`
(`o_control_Step_0.gml:258`).

### 2.2 `trend` — long-run macro trend with regime shocks

```gml
trend += random_range(-0.01, 0.01);                              // line 785
trend_target += random_range(0.01, -0.01);                       // line 836 (mean-reversion pull)
...
trend_target = clamp(trend_target, 0.7, 20);                     // line 903
trend = lerp(trend, trend_target, random_range(0.001, 0.01));    // line 904
price_building = lerp(price_building, trend * 603000,  random_range(0.002, 0.01));  // 905
price_cars     = lerp(price_cars,     trend * 3030000, random_range(0.005, 0.01));  // 906
trend += random_range(-0.02, 0.023);                             // line 907
```

Real-estate and car prices are pure affine functions of `trend` — there is no independent
property market, they are a way to launder/expose macro exposure with an asset-class skin.

**Shock events.** Every market-open day (`global.mode == 1 && holyday == 0`), `shans_random_events`
increments; a shock fires when `(irandom(100) + 150) < shans_random_events || irandom(1000) == 5`
(`o_control_Step_0.gml:837`) ≈ **1.5%/day plus a 0.1% panic roll**.

| `randomchange` | `trend_target` | `price_building` | `trend` |
|---|---|---|---|
| 0 | `*= random_range(2, 2.8)` | `*= random_range(1.2, 1.3)` | `+= 0.2` |
| 1 | `*= random_range(1.6, 1.8)` | `*= random_range(1.1, 1.2)` | `+= 0.15` |
| 2 | `*= random_range(1.2, 1.5)` | `*= random_range(1.05, 1.1)` | `+= 0.1` |
| 3 | `*= random_range(0.8, 0.9)` | `*= random_range(0.9, 0.95)` | `-= 0.05` |
| 4 | `*= random_range(0.6, 0.7)` | `*= random_range(0.75, 0.85)` | `-= 0.1` |
| 5 | `*= random_range(0.3, 0.4)` | `*= random_range(0.6, 0.75)` | `-= 0.2` |
| 6 | `+= random_range(0.1, -0.1)` | — | — |
| 7 (crash) | `*= random_range(0.2, 0.4)` | `/= 2` | `*= random_range(0.7, 0.8)` |

Guards: if `trend_target < 0.82` the draw is forced to 0/1 (bullish);
if `trend_target > random_range(4, 11)` forced to 5/7 (bearish). The market is therefore
**mean-reverting around 1.0 with multiplicative bursts** — a classic regime-switching
log-price process, clamped to [0.7, 20].

### 2.3 Exchange rate `kurs` is coupled to the macro trend

`o_control_Step_0.gml:1040-1071`. A stepped random walk with re-rolled thresholds:

```gml
if (kurs < irandom_range(28,33))  kurs = irandom_range(28,33);
if (kurs < irandom_range(33,56))  kurs += 3;
if (kurs < irandom_range(66,89))  kurs += 1;
if (kurs > irandom_range(277,522)) kurs -= 1;
if (trend > 4) kurs += (kurs < irandom_range(200,255)) ? random_range(0.1,2) : random_range(-0.05,0.25);
if (trend < 0.9 && kurs > random_range(177,300)) kurs -= random_range(0.1, 2);
```

Boom → ruble appreciates (kurs falls); bust → depreciates. Sample save has `kurs = 90.8`.

---

## 4. Order flow & market impact

### 4.1 Two settlement passes (`vkladka`)

`o_birza_Other_10.gml` runs the exchange close in phases:

| `vkladka` | Meaning |
|---|---|
| `0` | **Long/spot desk** — settles `company_ac` |
| `1` | **Short desk** — settles `company_short` |
| `2`, `3` | (unused in the settlement branch) |
| `4` | **Commodities** — `commodity_player`, `comm_*` |

### 4.2 Market impact is linear in size, normalised by share count

Long side (`o_birza_Other_10.gml:11-25`):

```gml
zmina = 1;
qtyDelta = comp_ac_buy[i];
company_ac[i] += qtyDelta;
if (qtyDelta != 0) {
    zmina += (qtyDelta / max(1, company_number_a[i]));
    with (o_birza) { update_price2(i, zmina); }
}
```

Short side (line 54) is the mirror: `zmina -= (qtyDelta / max(1, company_number_a[i]))`.

**So impact = order_qty / shares_outstanding, added to a unit multiplier.** Since
`company_number_a ≈ 362,200…401,800`, buying 4,000 shares ≈ +1% price impact. Impact is
*linear and un-saturating* — the same size costs the same at any price or depth. There is
no order book, no bid/ask, no partial fills, no slippage curve.

### 4.3 The volatility floor inside `update_price2`

`update_price.gml:27`:

```gml
function update_price2(arg0, arg1) {
    var minimumrandom = random_range(0.12, 0.34);
    if (arg1 < minimumrandom) arg1 = minimumrandom;
    if (company_hype[arg0] < 0.1) company_hype[arg0] = 0.14;

    if (arg1 < 0.99 && company_hype_effect[arg0] > 0) company_hype_effect[arg0] = -2;
    if (arg1 > 1.01 && company_hype_effect[arg0] < 0) company_hype_effect[arg0] =  1;

    company_stockprice[arg0] *= arg1;
    company_hype[arg0]      *= arg1;
    ...
}
```

Critical and easy to miss: **`minimumrandom` is re-drawn on every call** and acts as a hard
floor on the multiplier. A single impact event can therefore never drop a stock below
12–34% of its prior value in one step, but the floor itself is redrawn each time — so
sell-side pressure produces a stochastically *randomised* magnitude rather than a
deterministic one. `company_hype` is multiplied by the same factor as the price, so hype
and price move together (they are not independent).

`company_hype_effect` is a sign-flipping momentum/reversal flag: any move >1% forces it to
+1, any move <1% forces it to −2.

### 4.4 Price-impact feedback from accumulated position drift

`o_birza_Other_10.gml:207-248`, per company per day:

```gml
var change_vv = (company_ac[i] - ac_vchera[i]) * 0.00001 * bonus_vplyv;
company_hype[i] += change_vv;
zmina += change_vv;
```

Accumulating a position quietly pumps hype at `1e-5` per share/day.

---

## 5. Anti-manipulation / wash-trade detection ("фарц" / forq)

`o_birza_Other_10.gml:151-251`. Per company per day:

```gml
var bylo  = ac_vchera[i] / company_number_a[i];   // yesterday's holding per share
var stalo = company_ac[i]  / company_number_a[i];  // today's
var check = stalo - bylo;
var pepeps = company_ac[i] - ac_vchera[i];         // raw share delta
var riznycya = pepeps;
```

Gated on `global.diff_fsa == 1` (difficulty/feature flag) and `company_kupleno[i] != 0`:

- If `checkdays[i] > 0` (cooldown active) and the move breaches the band, **violation**:
  ```gml
  if (company_kupleno[i] > 0 && (riznycya + company_riznycya[i]) < max(-1000, -company_kupleno[i] * 0.25)) porushennya(abs(company_kupleno[i]));
  if (company_kupleno[i] < 0 && (riznycya + company_riznycya[i]) >  abs(min(1000,  company_kupleno[i]) * 0.25)) porushennya(abs(company_kupleno[i]));
  ```
  Band = **±25% of position, floored/capped at ±1000 shares.**
- Otherwise arm a watch: `checkdays[i] = clamp(round(abs(riznycya)/400), 7, 15)` days.
- A move with `|check| >= 0.01` (1% of share count in a day) fires the public market
  notification and applies:
  ```gml
  // down
  company_hype[i] *= random_range(0.96, 0.99) * bonus_vplyv;
  zmina -= random_range(0.01, 0.03) * bonus_vplyv;
  company_hype_effect[i] = -irandom_range(5, 20);
  company_sovet[i] -= round(check * 75);
  // up
  company_hype[i] *= random_range(1.001, 1.019) * bonus_vplyv;
  company_hype_effect[i] = irandom_range(5, 20);
  company_sovet[i] += round(check * 50);
  ```
  then `update_price2(i, zmina)`.

Note the **asymmetry**: moving *up* requires 1.4× the move of moving *down*
(`+50` vs `−75` board effect), and the down-branch has a real price penalty
(`0.96…0.99` hype and `−0.01…−0.03` price) while the up-branch's multiplier
`1.001…1.019` is roughly the mirror. Net: rapid accumulation is punished harder than rapid
distribution — it is a de-risking mechanic dressed as surveillance.

`porushennya()` is the violation handler (the court/lawyer/insider system).

---

## 6. Trade execution & P&L (`figa`)

`figa.gml` — pre-trade P&L preview; executed in `o_birza_Other_10.gml:98-136`.

**Long side (`vkladka == 0`):**

```gml
// sell (comp_ac_buy < 0)
comp_pribil[i] = -(round(stockprice/number_a) * comp_ac_buy[i]) * global.kommisia;
money_pribil  += comp_pribil[i];
money_pribil2 += (-((round(stockprice/number_a) - company_ac_average[i]) * comp_ac_buy[i]));

// buy (comp_ac_buy > 0)
comp_trata[i] = round(stockprice/number_a) * comp_ac_buy[i];
money_trata += comp_trata[i];

balance = money_pribil - money_trata;
```

**Short side (`vkladka == 1`)** buys are collateralised at a multiplier:

```gml
money_trata += round(stockprice/number_a) * comp_ac_buy[i];      // qtyDelta > 0
balance = money_pribil - (money_trata * (2 - global.short_procent));
```

and at settlement the short cover costs `round(stockprice/number_a) * qtyDelta * (2 - short_procent)`
(`o_birza_Other_10.gml:66`).

So **`short_procent` is the borrow haircut**: you must post `(2 - short_procent)×` notional
for a short. `short_procent = 0` → 2× collateral; `short_procent = 1` → 1× (unlevered).

**Cost basis** is a running VWAP (`o_birza_Other_10.gml:107`):
```gml
new_avg = (old_average*old_kilkist + round(price_stock(i))*old_buy) / company_ac[i];
```
with NaN/Inf fallback to `average_ac_price(i) = company_rashod[i] / company_ac_bought_number[i]`.

**Taxes.** Settlement splits gross from net:
```gml
money_add(max(0, money_pribil2));
global.money += (money_pribil - money_pribil2);
```
`money_pribil2` accumulates the **cost-basis-adjusted** P&L, `money_pribil` the raw one; the
difference is the tax base. Long-side selling additionally multiplies by `global.kommisia`
(commission). Short settlement uses a flat 5%: `money_add(money_trata * 0.05)`.

**Total short liability:** `short_dolg = max(0, Σ round(stockprice/number_a) * company_short[i])`
(`o_birza_Other_10.gml:140-148`).

---

## 7. Order entry, position limits, rate limits

`o_birza_Draw_0.gml:854-940` (the draw event *is* the order-entry handler).

**Click-to-fill, no order book.** Holding the BUY button repeatedly adds
`global.mnozhitel * max(nazhatie * 0.03, 1)` shares per tick (`nazhatie` = hold duration),
where `nazhatie > 16 && nazhatie % 3 == 0` gates full-rate fills.

Each fill costs **market time**, not money:
```gml
o_control.timer += speedlimit;
```
with `speedlimit` by difficulty (`o_birza_Step_0.gml:18-41`):

| `global.diff_limits` | `speedlimit` |
|---|---|
| 0 | 0.004 |
| 1 | 0.004 |
| 2 | 0.014 |
| 3 | 0.02 |

Modifiers: `check_level_rep(4) >= 2` → `× 0.8`; `vkladka == 4` (commodities) → `× 0.03`.
The day advances at `timer > 100`, so **`diff_limits` literally sets how many shares you can
move per in-game day** — difficulty is a liquidity/throughput dial.

**Ownership cap** (the 25% rule):
```gml
company_limit[i]        = min(1, global.min_all_limit + random(0.170001));   // generate_company.gml:41
company_limit_kil[i]    = round(company_limit[i] * company_number_a[i]);
company_limit_kil_perk[i] = company_limit_kil[i] * random_range(1.05, 1.08);  // perk unlock
```
Breaching triggers `limitno = 1`, resets the cap to the current holding, and (reputation ≥ 4)
restores it from `company_limit_kil_perk`. **The cap is enforced with a 5-share tolerance**:
`(comp_ac_start[i] + comp_ac_buy[i]) >= (company_limit_kil[i] - 5)`.

**Fill size is a UI lot-size setting**, not a cheat — `global.mnozhitel` cycles
50 → 25 → 10 → 5 as the player steps down a control (`o_birza_Draw_0.gml:405-419`);
`oPlayer_Step_0.gml:233` also sets it to 2. Each fill adds
`mnozhitel * max(nazhatie * 0.03, 1)` shares, so lot size and hold duration compound.

**Solvency gates:**
```gml
// long
if ((global.money - cena) >= -balance && (comp_ac_buy[i] + comp_ac_start[i]) < company_number_a[i])
// short
if ((limit - cena - global.short_dolg) >= -balance && (comp_ac_buy[i]+comp_ac_start[i]+comp_ac2_start[i]) < company_number_a[i])
```

**The margin ceiling** (`o_birza_Create_0.gml:45`) — `limit`:

```gml
limit = (round(global.money + ((global.fortune - global.money) * 0.6)) + 100000) - global.short_dolg;
```

i.e. **cash + 60% of illiquid net worth + a 100,000 buffer − outstanding short liability.**
Borrowing power therefore scales with your property/car/art/stake holdings, not just cash,
and shrinks as you add shorts. Hard rule: long + short together must stay under
`number_a` — you cannot reach 100%.

Trading is blocked when `holyday != 0` (market closed) or `global.totalbankrupt != 0`.
It is also force-closed by the insider-trading ban (`o_birza_Create_0.gml:48`):
`if (global.insader_zaborona == 1) { holyday = 1; prichina = txt(1281); }`.

---

## 8. Corporate actions driven by price level

`o_control_Step_0.gml:1074-1143`, per company per market-open day:

- **Reverse split** — `price_stock(i) < irandom_range(100, 2500)` and `irandom(4) == 1` (25%)
  → `split_company(i, 1, choose(2,3,5))`.
- **Forward split** — `days_without[i] <= 0` and `priceacc > irandom_range(1e6, 1.1e7)`
  → `split_company(i, 0, choose(2,3,4))`, cooldown `irandom_range(150,333)` days.
- **New share issue / rights offering** — `priceacc > irandom_range(4.7e6, 3.1e7)`, 25% roll,
  and your stake `proc_prov < company_control[i]`:
  ```gml
  ssfdsf = random_range(1.1, 1.18);
  company_number_a[i] = round(company_number_a[i] * ssfdsf);
  prprs  = round(company_ac[i] * ssfdsf) - company_ac[i];   // shares issued to you
  moneyneed = round(prprs * newpriceone * 0.3);             // 30% of market
  create_question(txt(539), txt(2843), buynew);
  ```
  If instead `proc_prov >= company_control[i]` (you are the controller), you choose via
  `create_question2(..., buynew_q, buynew_no)` at **25%** of market — *you* are the one
  placing the shares. `company_limit_kil[i]` is scaled by the same factor so the % cap holds.
- **Bankruptcy** → `company_price[bankrupt_dali] *= random_range(0.3, 0.45)` and the successor
  gets `company_profit += 0.4` (`delete_company.gml:73,89`).

**Dilution is the primary balancing force**: the game issues stock to keep per-share prices
inside a band, which mechanically caps the quoted price.

---

## 9. Commodities

`commodity_update.gml` — 6 independent mean-reverting series, daily:

```gml
commodity_koef_target[i] += ±0.01   // 7 different mean-reversion guards, each with
                                    // a freshly re-rolled random_range threshold
commodity_koef[i] = lerp(commodity_koef[i],
                         commodity_koef_target[i] * abs(global.rynochek - 2),
                         random_range(0.001, 0.01));
commodity_koef[i] += random_range(0.0099, -0.0099);
commodity_price[i] = round(commodity_start_price[i] * commodity_koef[i] * global.kurs);
```

Note `abs(rynochek - 2)`: since `rynochek` oscillates around 1.0 and is clamped well below
2 in practice, this factor sits near 1.0 — commodities are **almost unlevered to the macro
cycle**, unlike stocks which carry `rynochek` multiplicatively. Commodities are a low-vol,
currency-hedged asset class. Series ring buffer trimmed at 90 points.

---

## 10. Company fundamentals at creation

`generate_company.gml` (`function generate_company(arg0)`):

```gml
company_price[i]     = random_range(1933237440, 6722356520);   // ~1.9–6.7e9 RUB
                      // (or nikkei_price * random_range(0.5,0.9) when seeding from an index)
company_hype[i]      = random_range(0.88, 1.1);
company_profit[i]    = random_range(-0.2, 0.38);   // unlucky: -0.38..-0.01; lucky: 0.4..0.7
company_hype_effect[i] = irandom_range(-5, 5);
company_number_a[i]  = irandom_range(362200, 401800);
company_control[i]  = random_range(33, 50);
company_rezerv[i]    = round(company_price[i] * random_range(1, 3));
company_char[i][0..3] = irandom_range(30, 70);
company_char[i][4]   = lerp(0.13, 3, company_hype[i]) * 100;   // hype-driven 5th department
company_points[i]   = 100;
```

**Capital allocation across 4 business lines** (`big_data`, lines 62-85): the first line is
`global.diff_profit * 100 + irandom_range(-3, 3)` percent; the remaining three split the rest
in proportion to the weights `[25, 25, 25]` (25% each of the remainder), with the rounding
remainder distributed one unit at a time. So line 0 carries the margin and lines 1-3 split
the balance equally.

**Income** (lines 93-102):
```gml
dohodmesyac[i][p]       = company_price[i] * company_profit[i] * (big_data[i][0] / 100);   // 12 months
dohodnachalogoda[i]    = company_price[i] * company_profit[i] * (big_data[i][0] / 100) * 12;
lastprice[i]           = company_stockprice[i] / company_number_a[i];
dohodmesyac_all[i][month] = company_price[i] * company_profit[i];
```

**Market opinion picker** `random_porada.gml`: `irandom(3)` selects one of
{max hype, max profit, min hype, min profit}, scanned over companies with
`company_price > 100 && company_liq == 0`, returning `[mode, top_company]`. This is what
drives market commentary ("Company X is leading/lagging").

---

## 11. Price history ring buffer

`chart_add_data` (`gml_Script_chart_add_data.gml`) appends to a `ds_list` per series.
Stocks trim the head once `o_control.gameday > 2` (`update_price.gml:11-22`); commodities
trim at >90 (`commodity_update.gml:41`). Sample save holds **272 float32 per stock**
(`chart_series_data_0..29`) and 272 for the secondary `chart2` series — chart2 is a
comparison/benchmark track. Series values stored are
`company_stockprice[i] / company_number_a[i]`, i.e. the quoted per-share price.

---

## 12. Summary of the actual market model

Despite the presentation (order book UI, bid/ask-ish two-desk layout, per-stock charts),
**there is no matching engine**. The market is:

1. A **fundamental-growth random walk** per stock: `price *= (1 + 0.00225 · profit)` daily
   (a `0.001`-coefficient variant exists for instantaneous events), gated by a market-cap
   ceiling brake.
2. Priced as `fundamental × 0.8 × hype × rynochek × trend`.
3. Impacted by **linear, size-proportional price pressure** from your own net order flow
   (`qty / shares_outstanding`), with a stochastically re-drawn floor at 12–34%.
4. Embedded in a **two-factor macro** (`rynochek` oscillating around 1.0 with re-randomised
   bands; `trend` mean-reverting to `trend_target` with ~1.5%/day multiplicative shocks).
5. Restrained by **dilution** — the game issues stock when the per-share price gets too high.
6. Punished for **speed**, not size: rapid position change triggers the FSA wash-trade
   detector; the penalty band is ±25% of your position with a 7–15 day cooldown.

The exploitable structure (and the thing worth taking for a design) is that impact is
*linear and uncapped* while the *floor is randomised* — so the optimal play is to batch
size into fewer, larger orders and to never be net-negative on a day you also went up.

---

## 13. Reputation, fees and unlocks (`o_birza_Create_0.gml`)

`check_level_rep(N)` (`gml_GlobalScript_check_level_rep.gml`) is just a threshold ladder over
player stat `global.char[N]`: `>=5` → level 1, `>=10` → 2, `>=20` → 3, `>=35` → 4, `>=50` → 5.

| Gate | Effect |
|---|---|
| `check_level_rep(4) >= 4` | Restores the ownership cap from `company_limit_kil_perk[i]` after a breach (`o_birza_Draw_0.gml:860`) |
| `check_level_rep(4) >= 2` | `speedlimit *= 0.8` — **faster fills** |
| `check_level_rep(4) >= 5` | `global.kommisia = 0.99; global.short_procent = 0.99;` — best possible fees, locked |
| `check_level_rep(0) >= 5` | `bonus_vplyv = 1.25 + min(1, (global.char[0] - 40) * 0.01)` |
| `global.char[4] >= 5` | **Unlocks short selling** → `global.short_av = 1` |

**`bonus_vplyv` is a stat-driven hype amplifier.** It multiplies every hype and price
adjustment inside the manipulation pass (§5) — for *both* the up and down branches. Range is
`[0.85, 2.25]`: `char[0] = 40` → 1.25, `char[0] >= 140` → 2.25. High reputation means your
trades move the market more, in both directions.

**Fee parameters** (`o_control_Create_0.gml:516`, re-rolled `o_control_Step_0.gml:715`):
- `global.kommisia = random_range(0.96, 0.99)` — long-side sell commission.
- `global.short_procent = random_range(0.97, 0.99)`, re-rolled `random_range(0.97, 0.995)`;
  short collateral is `2 - short_procent` ≈ **1.01–1.03× notional**, i.e. essentially
  unlevered, with the small buffer acting as the borrow cost.

## 14. Difficulty levers (market-relevant subset)

| Variable | Values | Effect |
|---|---|---|
| `global.diff_limits` | 0,1,2,3 | `speedlimit` 0.004 / 0.004 / 0.014 / 0.02 → **shares movable per in-game day** |
| `global.min_all_limit` | easy path 1, 0.75, 0.45, 0.22 (`o_control_Create_0.gml:942-954`); other path 1, 0.56, 0.31, 0.11 (`o_control_Step_1.gml:29-41`) | Base ownership cap = `min(1, min_all_limit + random(0.17))`. **On the easiest setting you may own 100% of a company** — the "25% rule" is difficulty-dependent, not a constant. |
| `global.diff_profit` | 0, 0.06, 0.12, 0.25, 0.15 (`o_pc_menu_Step_2.gml:13-22`) | Sets `big_data[i][0] = diff_profit*100 ± 3`, the share of revenue from business line 0. **At `diff_profit = 0` companies earn nothing at all** (`dohodmesyac = price * profit * 0/100`). This is the single largest difficulty lever in the economy. |
| `global.diff_fsa` | 0 / 1 | Enables the wash-trade detector (§5) |
| `global.short_av` | 0 / 1 | Short selling availability |

## 15. Resolved open questions

- **`limit`** — solved, §7: `cash + 0.6·(fortune − cash) + 100000 − short_dolg`.
- **`bonus_vplyv`** — solved, §13: reputation-gated, `[0.85, 2.25]`, from `char[0]`.
- **`global.mnozhitel`** — solved, §7: UI lot-size selector (50/25/10/5, and 2 on `oPlayer`).
- **`global.diff_profit`** — solved, §14: difficulty-set revenue concentration, 0…0.25.
- **`update_price2`'s `minimumrandom` floor** — UNRESOLVED BY INTENT. The code gives no
  comment; behaviour is indistinguishable from deliberate sell-side noise. Treated above as
  a crash guard with a stochastic side effect.
- **`global.char[0..7]` index meanings** — delegated; the mapping lives in the localisation
  table and is covered by the economy/companion documents.

---

## Appendix A — `txt(N)` resolution and world-building

`txt(N)` indexes `stonks.csv` column 2 (English), which is a complete 4,289-entry table
(id 0..4289; row 0 is the header marker `w`). Resolver output is in
`D:\stonks-re\localization\`. Because every notification id in the code resolves, the
**setting is Japan**: the market regulator is the *Financial Services Agency* (FSA), the
currency is the yen (`global.kurs` = JPY per USD), NPCs are named from `names.csv` /
`surnames.csv` (Japanese given names and surnames, e.g. Akihiko, Sato, Suzuki), and the
end-game goal is turning Tokyo into "Neo Tokyo" via a company called *Future Tech*
(`txt(1571-1572)`).

Resolved ids used in the sections above:

| id | text | system |
|---|---|---|
| `txt(76)` | "News" | header for all market news |
| `txt(1107)` | "Stockbroker" | title for limit-hit / short-unlock notices |
| `txt(1570)` | "…your reputation has opened new doors… offering you the chance to engage in short trading. Benefit from borrowed [shares]" | short-selling unlock |
| `txt(1573)` | "There are no more shares of this company on the stock exchange." | ownership-cap breach |
| `txt(1281)` | "You are prohibited from trading on the stock exchange." | insider ban |
| `txt(1568)` | "Last purchase price" | `company_lastprice` label |
| `txt(1534)` | "Shares of \<arg0\> each" | long trade log line |
| `txt(1563)` | "Shares of \<arg0\> each (short)" | short trade log line |
| `txt(1584)` | "The Financial Services Agency may find such actions suspicious and investigate you for potential market manipulation." | wash-trade detector tooltip |
| `txt(1582/1583)` | "You recently bought a lot of shares in this company. Be careful about selling them quickly." / "…sold a lot… be careful about buying back quickly." | watchlist banner in the UI |
| `txt(2742/2743)` | "…a board member of \<company\> has offloaded a significant portion of their shares…" / "…significantly increased their stake…" | `company_vsovete == 1` (board member) price move |
| `txt(2744/2745)` | "…\<name\>, CEO of \<company\>, has sold off a large tranche of shares…" / "…has doubled down on their commitment…" | `company_vsovete == 2` (CEO) price move |
| `txt(2842)` | "\<company\> is set to issue more shares, aiming to fund its expansion plans." | new-issue news |
| `txt(2843)` | "As a major shareholder in \<company\>, you are being offered \<numshares\> new shares at a discounted price of {moneyneed}" | discounted rights placement |
| `txt(2844)` | "Our company \<company\> needs new investments. As a controlling shareholder, **you** should help us issue new shares." | controller-side placement |
| `txt(539)` | "Board of directors" | title for the above |
| `txt(4078/4079)` | "Prediction" / "The stars are telling you today:" | fortune-teller macro forecast |
| `txt(3160/3161)` | "Recent changes in global oil prices lead to mild economic uncertainty…" / "A small decrease in exports results in a moderate economic slowdown." | `randomchange == 3` |

**Macro shock texts confirm the §2.2 table one-for-one** (`o_control_Step_0.gml:849-901`):

| `randomchange` | bullish/bearish | text ids |
|---|---|---|
| 0 | bull | `3157` "The Japanese yen reaches a new high, making imports cheaper…" / `1398` |
| 1 | bull | `3158` "A government campaign to promote domestic travel…" |
| 2 | bull | `3159` "Japan's manufacturing sector reports a modest increase in output…" |
| 3 | bear | `3160` oil prices / `3161` exports decrease |
| 4 | bear | `3162` "Allegations of misconduct in major banks…" / `1411` |
| 5 | crash | `3163` electronics/auto demand down / `3164` "Japan faces a severe recession triggered by trade conflicts…" |
| 6 | neutral | — |
| 7 | crash | `1413` |

This is strong independent evidence that the shock table was read correctly: each numeric
branch is annotated in the string table with a matching economic narrative.

**Advisor NPC and the five departments.** `txt(218)` = "Amy", the adviser who issues
department warnings. From `mycompany_step.gml:61-165`, the `level_viddil` indices map to:

| `level_viddil` index | Department | warning id / text |
|---|---|---|
| 1 | Operations (production) | `2536` "Our production is not enough. It's time to expand our operations department." |
| 2 | Marketing | `2538` "Our products lack advertising. We need to develop our marketing department." |
| 3 | Research | `2537` "Our company could be more advanced. Maybe we should expand our research department?" |
| 4 | HR | `2535` "Our company has grown and we need to develop the HR department." |
| 5 | Finance | `2539` "It is becoming increasingly difficult for us to keep track of the market situation. We need to develop our financial department." |

Each warning fires when `max_best_level > now_level_viddil_koef[i] + 0.1` persists for
**16 consecutive days** (`viddilN_series == 16`), then fires at most once per
`irandom_range(40, 100)` days. Indices 0 and 6 of `level_viddil` are unreferenced in this
path — likely unused or legacy.

**Department indices independently confirmed** by the per-department UI objects' `idd`
field, which matches the warning-text mapping exactly:

| `idd` | object | `txt(2090-2096)` |
|---|---|---|
| 0 | `o_comp_main` | Headquarters |
| 1 | `o_comp_oper` | Operations |
| 2 | `o_comp_sale` | Sales & Marketing |
| 3 | `o_comp_rnd` | Research & Development |
| 4 | `o_comp_hr` | Human Resources |
| 5 | `o_comp_finance` | Finance |
| 6 | `o_comp_it` | IT & Systems |

(`o_comp_building` carries no `idd` — it is the facility/building object, not a department.)

**Short selling, in the game's own words** — `txt(1464)`, the broker's disclosure:

> "Remember that for my convenience, I sell all purchased short shares immediately, so you
> get the funds to your account. But you will need to buy them back and give them to the
> broker."

Confirms the code: a short increments `company_short[i]` and credits cash without touching
`company_ac[i]`; cover is settled later at `(2 − short_procent) × notional`.

**Pump & dump news texts** — `txt(1456-1461)`, all six framed as turnaround stories
("Defying all predictions… has made a stunning recovery", "a miraculous recovery from its
previous slump", "Proving that it's not over until it's over"). The spike is always
narrated as a *rescue*, never as speculation — the player is meant to read it as good news.


