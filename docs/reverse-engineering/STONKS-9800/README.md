# STONKS-9800 — Reverse Engineering Spec

**Target:** `STONKS-9800 Stock Market Simulator`, GOG build `0.6.2.19` (64-bit), GOG id `1688404720`
**Binary:** `D:\Games\STONKS-9800 Stock Market Simulator\` (a second, saveless copy sits in `D:\Game\`)
**Date of analysis:** 2026-10-14

This is a digest of a complete decompilation. Every formula below is copied from decompiled
source; each is traceable to `file.gml:LINE` in the extracted tree. Deep per-subsystem
references live in the companion documents listed in §16.

---

## 1. What it actually is

| Property | Value |
|---|---|
| Engine | **GameMaker Studio 2**, bytecode v17, **not YYC** (so fully decompilable) |
| Container | `data.win` (GameMaker chunked `FORM`/`GEN8` container) |
| Runtime | Mono VM (`Galaxy64.dll` = GOG Galaxy, *not* Unity) |
| Player shell | `STONKS-9800.exe`, GMS2 `VC_Runner` "Zeus" build |
| Content | 3,063 code entries · 2,310 scripts · 228 objects · 30 rooms · 27 shaders · 542 sprites · 191 sounds · 7 fonts · 8 extensions |
| Strings | 15,091 GMS strings + **4,289** localisation rows in external TSV |
| Identifiers | 10,345 variables |
| Setting | **Japan.** Regulator is the *Financial Services Agency*; currency is the yen; NPCs named from Japanese pools; end-goal is turning Tokyo into "Neo Tokyo" via *Future Tech* (`txt(1571-1572)`) |
| Start date | **1980-01-01** (`date_create_datetime(1979,12,31,0,0,0)`, `o_control_Create_0.gml:416`) |
| Listed firms | 30 (`global.numberofcompany = 6 + level_diff[5]`, `o_pc_menu_Step_2.gml:6`) |
| Commodities | 6 |

> **Toolchain note.** The REA repo referenced for this task is aimed at native binaries,
> .NET assemblies, JS/Electron and web apps. It has no Unity *or* GameMaker support, and its
> managed-code tools need .NET assemblies a GameMaker game does not contain. The path that
> actually worked: **UndertaleModTool 0.9.2.0 CLI + Underanalyzer** to decompile all 3,063 code
> entries to GML. REA's evidence-first discipline was still the right frame; the tool was wrong.

---

## 2. Control-flow ground truth (read this before anything else)

Two structural facts corrupt naive reading of this codebase.

**(a) There is no wall-clock timer.** A day is a 0→100 budget in the *instance* variable
`o_control.timer`. `timer > 100` (or `startgame2 == 1`) while in `RoomMain`/`r_company` fires
the day advance (`o_control_Step_0.gml:112`):

```gml
mydatetime = date_inc_day(mydatetime, 1);
timer = 0;
newday = 1;
```

Default `time_speed = 2` → `timer += 0.5`/frame → **198 frames ≈ 3.30 s/day @ 60 fps ≈ 20 min/in-game year.**
`time_speed == 1` is *pause*. When a minigame runs it sets `global.stop = 1` (Step `exit`s) and
pushes `o_control.timer` itself (+0.4 hikari, +0.25 meeting, +0.15 park/temple, +4…7 job phone).

**(b) `newday` is a one-frame latch guarding ~5,300 lines.** `Step_0.gml:84` clears it, `:130`
sets it, `:230` opens `if (newday == 1)`, `:5546` closes with `newday = 0`. So **lines 232–5545
execute exactly once per in-game day, not per frame** — and the decompiler's indentation does
not reveal this. Roughly thirty statements in that block look like per-frame code and are not.

Any reimplementation must make this gate explicit, or per-day tuning will silently become
per-frame and the whole economy will run ~198× too fast.

---

## 3. The market model

### 3.1 The price stack

```
company_price[i]       fundamental valuation
company_hype[i]        speculative multiplier
rynochek               macro market multiplier  (~1.0, oscillating)
trend                  long-run macro trend      (~1.0, mean-reverting)

company_stockprice[i] = company_price[i] * 0.8 * company_hype[i] * rynochek * trend
quote[i]              = company_stockprice[i] / company_number_a[i]     (~362k–402k shares)
```

`update_price.gml:10`, `price_stock.gml:5`. The constant `0.8` is a fixed haircut. Because the
quote is *valuation ÷ share count*, issuing stock dilutes the price directly — which is the
game's main balancing force (§3.6).

### 3.2 Fundamental drift

Daily, for every listed company (`o_control_Step_0.gml:1469-1471`):

```gml
var pepsa = company_price[i] * 0.0015 * company_profit[i];
company_price[i]      = company_price[i] + (pepsa * 1.5);          // == price * 0.00225 * profit
company_stockprice[i] = company_price[i] * 0.8 * company_hype[i] * rynochek * trend;
```

`company_profit` **is** a per-day fractional growth rate: `profit = 0.3` → +0.0675%/day ≈ +28%/yr.

A weaker variant with a **9× smaller** coefficient (`price * 0.001 * profit`) is used for
*instantaneous events* — `update_price()`, called from hype changes, mergers, splits,
bankruptcies, forecasts. At creation a one-off `price * 0.01 * profit` applies.

**Low-hype drag** (`o_control_Step_0.gml:1464-1468`) — below hype 0.5, profit bleeds:

```gml
if (company_hype[i] < 0.5) {
    var hypeminus = (1 - company_hype[i]) * 0.005;
    company_profit[i] -= company_profit[i] * hypeminus;
}
```
0.25%/day at hype 0.5, 0.43%/day at the 0.14 floor. A gentle negative-feedback loop punishing abandoned names.

### 3.3 Macro layer

**`rynochek`** — direction-flip random walk with **re-randomised bounds** (`Step_0.gml:131-146`):

```gml
if (rynok_up == 1) rynochek += random_range(0.003, 0.01);
else              rynochek -= random_range(0.003, 0.01);
if (rynochek > random_range(1.1, 1.3)) rynok_up = 0;    // upper band redrawn EVERY day
if (rynochek < random_range(0.7, 0.9)) rynok_up = 1;    // lower band redrawn EVERY day
```

Init `random_range(0.98, 1.02)`. The oscillation period and amplitude are themselves stochastic.

**`trend`** — mean-reverting to a target under regime shocks (`Step_0.gml:785-907`):

```gml
trend += random_range(-0.01, 0.01);
trend_target += random_range(0.01, -0.01);
trend_target = clamp(trend_target, 0.7, 20);
trend = lerp(trend, trend_target, random_range(0.001, 0.01));
price_building = lerp(price_building, trend * 603000,  random_range(0.002, 0.01));
price_cars     = lerp(price_cars,     trend * 3030000, random_range(0.005, 0.01));
trend += random_range(-0.02, 0.023);
```

Headline index: `global.price_koef = round(1000 * rynochek * trend)`.

**Regime shocks.** Each market-open day, `shans_random_events` increments; a shock fires when
`(irandom(100) + 150) < shans_random_events || irandom(1000) == 5` ≈ **1.5%/day + 0.1% panic roll**.

| # | `trend_target` | `price_building` | `trend` | narrative (`txt`) |
|---|---|---|---|---|
| 0 | `× 2.0–2.8` | `× 1.2–1.3` | `+0.2` | yen hits new high (`3157`) |
| 1 | `× 1.6–1.8` | `× 1.1–1.2` | `+0.15` | domestic-travel campaign (`3158`) |
| 2 | `× 1.2–1.5` | `× 1.05–1.1` | `+0.1` | manufacturing output up (`3159`) |
| 3 | `× 0.8–0.9` | `× 0.9–0.95` | `−0.05` | oil prices / exports down (`3160/3161`) |
| 4 | `× 0.6–0.7` | `× 0.75–0.85` | `−0.1` | bank misconduct (`3162`) |
| 5 | `× 0.3–0.4` | `× 0.6–0.75` | `−0.2` | electronics/auto slump (`3163`) |
| 6 | `± 0.1` | — | — | neutral |
| 7 | `× 0.2–0.4` | `÷ 2` | `× 0.7–0.8` | crash (`1413`) |

Guards force bullish draws when `trend_target < 0.82` and bearish when `> random_range(4,11)`.
Every branch is annotated in the string table with a matching economic narrative — independent
confirmation the table was read correctly.

**Property and car prices are pure affine functions of `trend`.** There is no independent
property market — they exist to launder macro exposure behind an asset-class skin.

**`global.kurs` (JPY/USD) is decoupled from equities.** Init `random_range(180,222)`, daily
`±1` with re-rolled soft bounds, plus a 8–23% revaluation on `pum == 20`. It has exactly
**two** non-display consumers: `commodity_price` (`commodity_update.gml:35`) and the
commercial-property *upgrade* price (`o_buildone_Draw_0.gml:203`). It does **not** touch stock
prices, real-estate purchase prices, cars, loans or taxes.

### 3.4 Order flow and market impact

There is **no order book, no bid/ask, no partial fills, no slippage curve**. Two settlement
passes run at the exchange close, selected by the instance flag `vkladka`:
`0` = long/spot desk, `1` = short desk, `4` = commodities (`o_birza_Other_10.gml`).

Impact is **linear and un-saturating** — order size normalised by shares outstanding:

```gml
zmina = 1;
qtyDelta = comp_ac_buy[i];
company_ac[i] += qtyDelta;
if (qtyDelta != 0) {
    zmina += (qtyDelta / max(1, company_number_a[i]));
    with (o_birza) { update_price2(i, zmina); }
}
```
(short side mirrors with `-=`). With ~380k shares, 4,000 shares ≈ +1% impact — and the same
size costs the same at any price or depth.

**The impact floor is re-randomised on every call** (`update_price.gml:27`):

```gml
var minimumrandom = random_range(0.12, 0.34);
if (arg1 < minimumrandom) arg1 = minimumrandom;
if (arg1 < 0.99 && company_hype_effect[arg0] > 0) company_hype_effect[arg0] = -2;
if (arg1 > 1.01 && company_hype_effect[arg0] < 0) company_hype_effect[arg0] =  1;
company_stockprice[arg0] *= arg1;
company_hype[arg0]      *= arg1;
```

So a single impact event can never drop a stock below 12–34% of its prior value, **but the
floor itself is redrawn each time** — sell pressure yields a *randomised* magnitude rather than
a deterministic one. Note `company_hype` is multiplied by the same factor as price: the two
are not independent. `company_hype_effect` is a sign-flipping momentum flag — any move >1%
forces it to +1, any move <1% forces it to −2.

`update_price2` is called from exactly three sites, all in `o_birza_Other_10.gml` (22, 59, 246).
**News never routes through it.**

### 3.5 Anti-manipulation ("FSA" wash-trade detector)

Gated on `global.diff_fsa == 1`. Per company per day (`o_birza_Other_10.gml:151-251`):

```gml
var check = (company_ac[i] - ac_vchera[i]) / company_number_a[i];   // Δholding per share
```

- Cooldown active (`company_checkdays[i] > 0`) and move breaches the band → **violation**
  (`porushennya()`), then the position is zeroed:
  ```gml
  if (company_kupleno[i] > 0 && (riznycya + company_riznycya[i]) < max(-1000, -company_kupleno[i] * 0.25)) porushennya(...);
  if (company_kupleno[i] < 0 && (riznycya + company_riznycya[i]) >  abs(min(1000,  company_kupleno[i]) * 0.25)) porushennya(...);
  ```
  Band = **±25% of position, floored/capped at ±1,000 shares**.
- Otherwise arm a watch: `company_checkdays[i] = clamp(round(abs(Δ) / 400), 7, 15)` days.
- `|check| >= 0.01` (1% of share count in a day) fires a public news item:
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

**Asymmetry:** moving *up* requires 1.4× the move of moving *down* (`+50` vs `−75` board
effect). Net effect: rapid accumulation is punished harder than rapid distribution. It is a
de-risking mechanic dressed as surveillance.

---

## 4. Trading

### 4.1 Order entry

Click-and-hold. Each fill adds `global.mnozhitel * max(nazhatie * 0.03, 1)` shares
(`nazhatie` = hold duration; full rate only when `nazhatie > 16 && nazhatie % 3 == 0`).
`global.mnozhitel` is a **UI lot-size selector** cycling 50 → 25 → 10 → 5.

**Fills cost market time, not money** (`o_birza_Draw_0.gml:920`): `o_control.timer += speedlimit`.

| `global.diff_limits` | `speedlimit` |
|---|---|
| 0 | 0.004 |
| 1 | 0.004 |
| 2 | 0.014 |
| 3 | 0.02 |

Modifiers: reputation track 4 ≥ 2 → `× 0.8`; `vkladka == 4` (commodities) → `× 0.03`.

**Difficulty is literally a liquidity dial** — it sets how many shares you can move per in-game day.

### 4.2 Position limits

```gml
company_limit[i]          = min(1, global.min_all_limit + random(0.170001));   // generate_company.gml:41
company_limit_kil[i]      = round(company_limit[i] * company_number_a[i]);
company_limit_kil_perk[i] = company_limit_kil[i] * random_range(1.05, 1.08);   // rep-track-4 unlock
```
Enforced with a 5-share tolerance. **The "25% rule" is not a constant** — `min_all_limit`
takes two different tables depending on difficulty path:
`{1, 0.75, 0.45, 0.22}` (`o_control_Create_0.gml:942-954`) and `{1, 0.56, 0.31, 0.11}`
(`o_control_Step_1.gml:29-41`). On the easiest setting you may own **100%** of a company.

### 4.3 Margin

```gml
limit = (round(global.money + ((global.fortune - global.money) * 0.6)) + 100000) - global.short_dolg;
```
(o_birza_Create_0.gml:45) — **cash + 60% of illiquid net worth + 100,000 buffer − outstanding short liability.**
Borrowing power scales with property/cars/art/stakes, not just cash, and shrinks as shorts grow.

Short collateral is `2 - short_procent`; `short_procent = random_range(0.97, 0.99)` → ≈ **1.01–1.03× notional**.
Commission `global.kommisia = random_range(0.96, 0.99)`; both lock to 0.99 at reputation track 4 ≥ 5.

Total short liability: `short_dolg = max(0, Σ quote[i] * company_short[i])`.

The broker states the mechanic plainly (`txt(1464)`): *"I sell all purchased short shares
immediately, so you get the funds to your account. But you will need to buy them back and give
them to the broker."*

### 4.4 Fees, reputation and unlocks

`check_level_rep(N)` is a threshold ladder over `global.char[N]`: `≥5→1, ≥10→2, ≥20→3, ≥35→4, ≥50→5`.

| Gate | Effect |
|---|---|
| rep 4 ≥ 2 | `speedlimit *= 0.8` — faster fills |
| rep 4 ≥ 4 | ownership cap restored from `company_limit_kil_perk` after a breach |
| rep 4 ≥ 5 | `kommisia = short_procent = 0.99` |
| rep 0 ≥ 5 | `bonus_vplyv = 1.25 + min(1, (char[0] - 40) * 0.01)` — range `[0.85, 2.25]` |
| `char[4] ≥ 5` | **unlocks short selling** (`short_av = 1`) |
| `insader_zaborona == 1` | market force-closed (`txt(1281)`) |

`bonus_vplyv` multiplies every hype/price adjustment in §3.5 in **both** directions — high
reputation means your trades move the market more, up *and* down.

---

## 5. Corporate actions

**Market-cap ceiling brake** (`Step_0.gml:1087`): when `quote[i] > irandom_range(5e6, 2.5e7)`,
`price` and `stockprice` both `× random_range(0.98, 0.993)` — a −0.7…−2% daily bleed.

**Pump & dump — the main catalyst for cheap stocks** (`Step_0.gml:1472-1485`), ~0.9% per
company per day, gated on `quote < 500`:

```gml
if (irandom(111) == 1) {
    if (stockprice[i] / number_a[i] < 500) {
        company_price[i]      *= random_range(2, 4);
        company_hype[i]        = random_range(1.2, 2.2);      // absolute set
        company_hype_effect[i]  = irandom_range(5, 60);
        company_stockprice[i]  *= random_range(3, 22);        // 3x-22x spike
        update_price(i);
        create_notification(txt(76), txt(irandom_range(1456, 1461)));
    }
}
```

This is the largest price discontinuity in the game — a **3×–22× spike**, always narrated as a
*rescue* ("a miraculous recovery from its previous slump", "Proving that it's not over until it's
over"). Never as speculation. It only fires on sub-500 stocks, i.e. exactly where a
low-capital player can reach it. **Penny-stock speculation is the intended early game.**

**Share issuance / rights offering** (`Step_0.gml:1098-1143`):

```gml
ssfdsf = random_range(1.1, 1.18);
company_number_a[i] = round(company_number_a[i] * ssfdsf);
prprs  = round(company_ac[i] * ssfdsf) - company_ac[i];
moneyneed = round(prprs * (stockprice[i] / number_a[i]) * 0.3);   // 30% of market
```
If your stake `>= company_control[i]` you are the controller and instead choose whether to place
the shares, at **25%** of market. Dilution is the primary force capping quoted prices.

**Splits** are triggered by per-share price crossing re-rolled bands (`< irandom_range(100,2500)`
→ reverse split; high `priceacc` with `days_without <= 0` → forward split, cooldown
`irandom_range(150,333)` days).

**Bankruptcy** → survivor's `company_price *= random_range(0.3, 0.45)`; the heir gains
`company_profit += 0.4`.

**Monthly close** runs on `myday == 20` (`Step_0.gml:3037`):

```gml
dohodmesyac[i][month]     = company_price[i] * company_profit[i] * (big_data[i][0] / 100);
dohodmesyac_all[i][month] = company_price[i] * company_profit[i];
```

`big_data[i]` is a 4-way capital allocation whose first line is
`global.diff_profit * 100 + irandom_range(-3,3)` percent, with the remaining three splitting
the balance in `[25,25,25]` proportions. **`diff_profit = 0` makes companies earn nothing at
all** — the single largest difficulty lever in the economy.

---

## 6. Companies

Departments, confirmed via each `o_comp_*_Create_0` object's `idd` field and `txt(2090-2096)`:

| `idd` | object | department |
|---|---|---|
| 0 | `o_comp_main` | Headquarters |
| 1 | `o_comp_oper` | Operations |
| 2 | `o_comp_sale` | Sales & Marketing |
| 3 | `o_comp_rnd` | Research & Development |
| 4 | `o_comp_hr` | Human Resources |
| 5 | `o_comp_finance` | Finance |
| 6 | `o_comp_it` | IT & Systems |

(`o_comp_building` has no `idd` — facility, not department.)

Each department has an effectiveness `mycomp_effective[i]`, recomputed on `o_control.Alarm[1]`
and decayed `× 0.67` under adverse conditions. `company_char[i][0..4]` are the five displayed
company stats; index 4 is hype-derived (`lerp(0.13, 3, hype) * 100`). Under-development is
detected by a 16-consecutive-day shortfall (`max_best_level > now_level_viddil_koef[i] + 0.1`),
after which the advisor **Amy** (`txt(218)`) issues a department warning at most once per
`irandom_range(40, 100)` days.

`generate_company(arg0)` initialisation (`generate_company.gml:8-107`):

```gml
company_price[i]    = random_range(1933237440, 6722356520);   // or nikkei_price * random_range(0.5,0.9)
company_hype[i]     = random_range(0.88, 1.1);
company_profit[i]   = random_range(-0.2, 0.38);  // unlucky -0.38..-0.01 ; lucky 0.4..0.7
company_number_a[i] = irandom_range(362200, 401800);
company_control[i]  = random_range(33, 50);
company_rezerv[i]   = round(company_price[i] * random_range(1, 3));
company_char[i][0..3] = irandom_range(30, 70);
company_since[i]    = irandom_range(1889, 1970);   // world bootstrap only, o_control_Create_0.gml:638
```
Companies founded during play get `date_get_year(mydatetime)` instead.

Market opinion (`random_porada.gml`): `irandom(3)` selects max-hype / max-profit / min-hype /
min-profit over firms with `price > 100 && !liquidated`, driving the commentary feed.

---

## 7. NPCs

`s_human_generate.gml`:
```gml
human_stamina[i]      = irandom_range(80, 100);
human_intelligence[i] = irandom_range(1, 100);
human_charisma[i]     = irandom_range(1, 100);
human_precision[i]    = irandom_range(1, 100);
human_name[i]         = irandom_range(1, 149)   // male
                     or irandom_range(151, 338)  // female
human_surname[i]      = irandom_range(1, 103);
human_telephone[i]    = random_range(111111, 999999);
```
Index ranges into `names.csv` (340 rows) and `surnames.csv` (106 rows) — Japanese given
names and surnames. Stats are **uniform 1–100**, so the population is deliberately flat with a
thin superstar tail (~1% roll, XP scaled by `0.3 · median…median`).

On-the-job training upgrades a stat when `irandom(100) < company_char[mycomp][0]` (company
size) and a 1-in-666 stat roll succeeds (`mycompany_step.gml:29-57`).

---

## 8. Economy, banking and taxes

**Loans have no term.** `dolg_get()`:
```gml
nachisleno = bankprocentvzyal / 12;                       // monthly
credituvelichen = round(dolg * (1 + nachisleno)) - dolg;   // interest
dooolg = round(dolg * (1 + nachisleno));                   // total
```
Fee is **8% of the repayment**, clamped into 8 balance brackets — written as *sequential* `if`s,
so **the last match wins**:

| if `dooolg >` | `dlg` |
|---|---|
| 30,000 | `clamp(×0.08, 30k, 50k)` |
| 888,888 | `clamp(×0.08, 50k, 80k)` |
| 1,888,888 | `clamp(×0.08, 50k, 125k)` |
| 2,888,888 | `clamp(×0.08, 100k, 185k)` |
| 3,888,888 | `clamp(×0.08, 100k, 255k)` |
| 5,888,888 | `clamp(×0.08, 100k, 300k)` |
| 8,888,888 | `clamp(×0.08, 100k, 400k)` |
| 18,888,888 | `clamp(×0.08, 100k, 800k)` |

Loans ≤ 30,000 are **fee-free**. Payment is deducted via raw `global.money -= dlg` — *not*
counted as `rashod`, not logged, and allowed to go negative. No missed-payment penalty, just
compounding. Rate is locked at origination: `bankprocentvzyal = bankprocent * fin_credit[char[1]]`.

**Tax-exempt paths** — all use raw `global.money +=`, bypassing the `money_add` ledger:
loan principal, deposit maturity, the residual of stock sales, and all commodity profits.
Income tax is `dohod × nalog` on the 1st; property tax is `paid_price / 1200` monthly;
margin interest is `0.13 / 360` daily.

**Bankruptcy cascade** — `money < -50,000` for more than 6 days, or more than 12 days
regardless (`Step_0.gml:2396`). Liquidation priority is **cars → stocks → houses** (assignment
order, last write wins). Negative cash decays only 1%/day.

**Starting state:** `start_money = 750000`.

---

## 9. News and catalysts

The `create_news()` / `global.news` / `news_archive` machinery is **entirely dead code** —
`create_news` has zero callers, and the one hook in `create_notification` is an empty
`if (news > 0) { }`. The real delivery primitive is:

```
create_notification() → add_message() → global.window_message → blocking popup
```

Every market event surfaces as a notification. Catalyst families:

- **Macro regime shocks** — the 8 branches in §3.3, ~1.5%/day
- **Pump & dump** — §5, ~0.9%/company/day, sub-500 stocks only
- **Wash-trade detection** — §3.5
- **In-company random events** — weighted bag of situations 0–23, ≈1 per 37 trading days, each
  with yes/no branches and consequences for hype, profit, price and morale
- **Yakuza-paid catalysts** — a menu of disturbances the player can purchase
- **Board meetings** — `sobranie_begin`; there is **no per-shareholder vote**. The outcome is a
  scalar roll with modifiers, and the hype signs are inverted relative to intent

**Forecast system** (`prognozio` / `prohnoz_company`): deterministic in `company_profit`, with a
**91-day horizon**, hype-shocked ±0.078…0.25 at issue and −0.70…+0.50 at settlement. The separate
`global.prediction` variable is a **fortune-cookie omen** (`txt(1034-1049)`) with no market effect.

**Crucially: the end-of-day loop overwrites `company_stockprice` outright.** A news item that
sets stockprice directly is erased by `Step_0.gml:1471` that evening. **`company_hype` and
`company_profit` are the only durable levers.** This is the single most important structural
fact for anyone reimplementing: make news mutate *state*, never the derived price.

---

## 10. Progression and difficulty

- **`levelproject` ladder** — cost `100 · L²`, per-level `koef_plus`, 222-frame payout sequence
- **96 achievements** stored as `global.achiev[i][j][k]`, with a three-stage
  queue → pop → commit flow. Threshold triples are literals like
  `achiev[p][6] = [100000000, 1000000000, 10000000000]`
- `diff_profit ∈ {0, 0.06, 0.12, 0.25, 0.15}` — revenue concentration (§5)
- `diff_limits ∈ {0,1,2,3}` — market throughput (§4.1)
- `diff_fsa ∈ {0,1}` — enables the wash-trade detector
- `min_all_limit` — two different tables (§4.2)
- `numberofcompany = 6 + level_diff[5]`

A dormant `diff_stress.gml` table disagrees with the live `stles` values — dead file.

---

## 11. Save format

**Container:** base64 → raw zlib → UTF-8 INI (CRLF). Not encrypted, not HMAC-protected,
freely editable. `savedb.9800` is a separate plain-INI index of slots
(`-2` auto, `-1` quick, `0..13` named). Autosave on `myday == 25`; F5/F9 hotkeys.

**Sections:** `[global] [company] [people] [arrays] [local] [chart] [chart2] [cars] [house] [logs] [compp]`
— 2,588 variables in the reference save.

**Large arrays** are GameMaker native `ds_list_write` output, decoded by the built-in
`ds_list_read()` — *not* hand-packed floats:

```
u32  303 (0x012F)   DS_LIST marker
u32  element count
u32  0             reserved
u32  nesting depth          (present when entries are arrays)
u32  inner element count
per element: u32 variant type (0 = float64, 1 = string, 2 = nested array)
             then payload: 8-byte LE float64, or u32 length + UTF-8 bytes
```

Verified against the real save:

- `chart_series_data_0` — 1,088 bytes = 8 + 90 × 12. Header says **90** elements. Final value
  `317500.7874` equals `company_stockprice_0 / company_number_a_0` **exactly**. Series capacity is
  hard-capped at 90 in three places (`update_price.gml:11`, `commodity_update.gml:41`,
  `loadgame.gml:158`).
- `logs` — 581,682 bytes, header count **9078**, nesting 2, inner length 5. Built by `add_log`
  (`money_delete.gml:25-40`):
  ```gml
  var arra = [global.mydata, arg0, arg1, arg2, arg3];   // date, amount, txt id, company idx, string
  if (arg0 != 0) ds_list_insert(global.logs, 0, arra);   // HEAD insert -> newest first
  ```
  Field 0 decodes to `38452.916672453706` — a GameMaker date (epoch 1899-12-30) landing on
  **2005-04-11**, matching `savedb.9800 time=2005/4/11`. Because field 4 is a string, records
  are variable length (~60 bytes typical).

**175 persisted `global.*` variables**, in the game's own authoritative serialisation order,
extracted to `D:\stonks-re\full\meta\global_state_order.txt`. That list is the backbone for
save compatibility.

**`txt(N)` resolution:** the string table is *not* the GMS string table (which holds variable
names). It ships as an external TSV beside the exe —
`stonks.csv`, 4,289 rows × 5 cols (`id \t English \t Українська \t 日本語 \t 한국어`).
A community-complete Portuguese variant `stonksptbrcompleto.csv` (4,306 rows) is also present.

---

## 12. Design lessons for `trading-game`

Things worth stealing, and things worth avoiding.

**Steal:**

1. **`price = fundamental × hype × macro × macro2`.** One line, and it makes every downstream
   system composable. Hype is the player's lever; macro is weather; fundamentals are slow.
2. **Re-randomised mean-reversion bounds** (`rynochek`). Oscillating around 1.0 with the band
   itself redrawn daily produces a market that never repeats and never trends forever — for
   about eight lines of code.
3. **Dilution as the balancing force.** Rather than clamping price, issue stock to the player at
   a discount. The clamp becomes a *narrative event* instead of a visible rule.
4. **Difficulty as a liquidity dial.** Mapping a difficulty setting to a per-day execution budget
   (`speedlimit`) rather than to multipliers on numbers is far more legible to players.
5. **Punish speed, not size.** The ±25%-of-position band with a 7–15 day cooldown is a
   de-risking mechanic that *feels* like regulation. Ours should do the same.
6. **Concentrate noise where capital is small.** The pump & dump only fires below 500. Early
   game volatility is aimed at exactly the players who can act on it.
7. **Narrate shocks as rescue, never as speculation.** Every one of the six spike variants is
   phrased as the company climbing out of a hole.
8. **Margin from illiquid net worth.** `cash + 0.6 · (netWorth − cash) + buffer − shortDebt`
   makes property and stakes financing instruments without a separate mechanic.

**Avoid:**

1. **Never let a derived value be authored directly.** The end-of-day loop recomputing
   `stockprice` from `price × hype × macro` silently deletes any news effect that wrote to the
   price. If news must move the market, it must move `hype` or a fundamental.
2. **Never use sequential `if`s for tiered brackets.** `dolg_get`'s last-match-wins shadowing
   means the top bracket's lower clamp is overridden by the lower bracket's ceiling — a fee
   table that silently disagrees with its own documentation.
3. **Re-rolling a clamp threshold on every call** (the `random_range(0.12,0.34)` impact floor)
   makes a safety mechanism behave like injected noise. If the floor is meant to be a floor,
   it should be a constant.
4. **Duplicated difficulty tables.** Two disagreeing `min_all_limit` tables mean "the 25% rule"
   is not a rule. One table, one source.
5. **Dead parallel systems.** `create_news`, `diff_stress.gml`, `buy_dom`/`buy_car`,
   `mycomp_hvylya[]` — all present, all unreachable. They cost reading time and mislead anyone
   auditing the build.
6. **Affects that are wired but not balanced** — `bonus_vplyv` amplifies downside as hard as
   upside, so a high-reputation player's single bad trade moves the market more than their good ones.

---

## 13. Known bugs and quirks (balance-relevant)

| # | Issue | Effect |
|---|---|---|
| 1 | `dolg_get` bracket shadowing (sequential `if`, last wins) | fee caps disagree across bracket boundaries |
| 2 | `procent_deposit` differs between Create and Alarm | deposit yield depends on which path ran |
| 3 | `invest_rez_calc` missing `else` | investment probability mangled for luck > 99 |
| 4 | `duration × 0.7` applied *after* profit is computed | duration discount silently ignored |
| 5 | `carprice_mesyac` goes stale with zero cars | car inflation continues off zero holdings |
| 6 | `global.short_dolg` never cleared | short liability can persist across sessions |
| 7 | `global.repa` can exceed 100 / go NaN | reputation ladder breaks at the top |
| 8 | `vernal_equinox_day(1970-1978)` returns 20 not 22 (missing `break`) | season boundary off by two days for a decade |
| 9 | board-meeting hype signs inverted | board decisions worsen the variable they should improve |
| 10 | constant `-0.008`/day hype penalty | unbounded downward drift on one path |
| 11 | `company_profit_effect` negative branch unreachable | one intended effect never fires |
| 12 | two `diff_stress` tables, one dead | difficulty string disagrees with live values |
| 13 | `buy_dom` / `buy_car` dead (`car_price` never assigned, `nowvybor` always −1) | no property/car market in this build |
| 14 | `create_news` / `news_archive` dead | the "news system" is actually notifications |

The reference save appears to come from a **different build** — `bankprocentvzyal = 0.046977`
matches no `fin_credit` value in this one, and three other hard inconsistencies are documented
in `04-time-progression-save.md` §7.1.

---

## 14. Constants quick reference

| Constant | Value | Where |
|---|---|---|
| Listed companies | 30 | `numberofcompany = 6 + level_diff[5]` |
| Commodities | 6 | `figa2.gml` |
| Sectors | 8 | `company_field[i] = irandom(7)` |
| Price haircut | `0.8` | `update_price.gml:10` |
| Daily fundamental coeff | `0.00225` (= `0.0015 × 1.5`) | `Step_0.gml:1469` |
| Event fundamental coeff | `0.001` | `update_price.gml:9` |
| Share count | `irandom_range(362200, 401800)` | `generate_company.gml:34` |
| Impact floor | `random_range(0.12, 0.34)` per call | `update_price.gml:29` |
| Index level | `round(1000 × rynochek × trend)` | `Step_0.gml:258` |
| `trend` clamp | `[0.7, 20]` | `Step_0.gml:903` |
| Shock chance | ~1.5%/day + 0.1% panic | `Step_0.gml:837` |
| Building price anchor | `trend × 603000` | `Step_0.gml:905` |
| Car price anchor | `trend × 3030000` | `Step_0.gml:906` |
| FX init | `random_range(180, 222)` JPY/USD | `o_control_Create_0.gml:87` |
| Pump chance / cap | `irandom(111)==1`, quote < 500, `×3–22` | `Step_0.gml:1472` |
| Issue ratio | `random_range(1.1, 1.18)` | `Step_0.gml:1107` |
| Rights price | 30% of market (25% as controller) | `Step_0.gml:1118,1135` |
| Wash-trade band | ±25% of position, cap ±1000 shares | `o_birza_Other_10.gml:172` |
| Wash-trade cooldown | `clamp(round(|Δ|/400), 7, 15)` days | `o_birza_Other_10.gml:199` |
| Ownership cap | `min(1, min_all_limit + random(0.17))`, −5 tolerance | `generate_company.gml:41` |
| Margin | `cash + 0.6·(netWorth − cash) + 100000 − shortDebt` | `o_birza_Create_0.gml:45` |
| Short collateral | `2 − short_procent` ≈ 1.01–1.03× | `update_price`/`o_birza_Other_10:66` |
| Loan fee | 8% of repayment, 8 brackets, ≤30k free | `dolg_get.gml:8-39` |
| Loan rate | `bankprocent × fin_credit[char[1]]`, `/12` monthly | `dolg_get.gml:4` |
| Bankrupt trigger | `< −50,000` for 6 days, or 12 days | `Step_0.gml:2396` |
| Monthly close | `myday == 20` | `Step_0.gml:3037` |
| Day length | 198 frames ≈ 3.30 s @ 60 fps | `Step_0.gml:56-71,112` |
| Chart capacity | 90 points | `loadgame.gml:158` |
| Start money | 750000 | save `[global]` |
| Start date | 1980-01-01 | `o_control_Create_0.gml:416` |
| Advisor shortfall window | 16 consecutive days | `mycompany_step.gml:69` |

---

## 15. Open questions

1. `txt(3880)` labels `kurs` as USD→JPY, but `global.kurs ≈ 90` in the reference save versus
   `random_range(180,222)` at init. The `pum == 20` revaluation at `Step_0.gml:4816-4821`
   (÷1.08–1.23 / ×1.08–1.24) can walk it down, but the path from 200 to 90 is untraced.
2. `global.char[0..7]` index meanings are not directly labelled; they are inferred from gating
   (`char[4] ≥ 5` unlocks shorts, `char[0]` drives `bonus_vplyv`, `char[1]`/`[3]`/`[6]` gate
   business/investment unlocks).
3. `global.mnozhitel`'s `2` setting in `oPlayer_Step_0.gml:233` appears unrelated to the
   50/25/10/5 UI cycle.
4. Whether `update_price2`'s re-randomised floor is intentional sell-side noise or an
   accidental crash guard — behaviour alone cannot distinguish them.
5. `limited` exact failure threshold when `numberofcompany` reaches 30 (arrays are hard-coded to
   30 in many loops, which is a latent out-of-bounds class).
6. Three of the four reference agents' documents list open items specific to their subsystem;
   see §16.

---

## 16. Artifact index

Working tree: `D:\stonks-re\`

| Path | Contents |
|---|---|
| `full/code/` | **3,063 decompiled GML files** (full game source) |
| `full/code/CodeEntries/` | same, from the first UTMT pass |
| `full/meta/code_inventory.tsv` | every code entry with instruction count and file |
| `full/meta/variables.tsv` | 10,345 variable names |
| `full/meta/global_state_order.txt` | **175 persisted `global.*` vars, canonical order** |
| `full/meta/strings_all.txt` | 15,091 GMS strings |
| `localization/stonks_english.txt` | 4,289 `txt()` strings, English |
| `saves/save_schema.txt` | decoded save state, every variable |
| `saves/saveslot_auto.inflated` | raw inflated save |
| `analysis/00-market-and-trading.md` | **market, macro, order flow, trading** (~33 KB) |
| `analysis/01-economy-banking.md` | **FX, bank, loans, taxes, bankruptcy, assets** (~80 KB) |
| `analysis/02-companies-npcs.md` | **company sim, departments, upgrades, M&A, NPCs, events** (~125 KB) |
| `analysis/03-news-catalysts.md` | **notification pipeline, generators, forecasts, logs** (~62 KB) |
| `analysis/04-time-progression-save.md` | **day budget, calendar, difficulty, progression, save** (~79 KB) |
| `analysis/05-save-binary-format.md` | **verified `ds_list_write` binary layout** |

Tools: `D:\re-tools\` — `utmt\` (UndertaleModTool CLI 0.9.2.0), `ilspy\` (unused), plus the
probe/decode scripts used above. `AssetRipper` is present but irrelevant (wrong engine).
