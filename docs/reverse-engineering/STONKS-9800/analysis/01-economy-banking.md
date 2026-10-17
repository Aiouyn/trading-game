# STONKS-9800 — Player Economy, Banking, Debt, Currency & Taxes

**Scope:** player cash, FX rate, bank loans, deposits, taxes, income/expense ledger,
property (real estate + cars + art), angel investments, charity/temple donations, bankruptcy.

**Source:** `D:\stonks-re\full\code\*.gml` (decompiled GML), cross-checked against
`D:\stonks-re\saves\save_schema.txt`.

Everything marked **VERIFIED** was read directly from the decompiled source and the cited
`file:line` contains the quoted expression verbatim. Everything marked **INFERRED** is my
reasoning on top of verified facts. Where I could not determine something I say so rather
than guess.

---

## 0. Control-flow ground truth (needed to read everything else)

`gml_Object_o_control_Step_0.gml` is a ~5590-line Step event. Brace analysis shows:

| Line | Brace depth | Meaning |
|---|---|---|
| 1–109 | 0 | per-frame (timer accounting, holiday state, `stles`) |
| 110–196 | 1 | **day-rollover gate**: `if ((timer > 100 \|\| startgame2 == 1) && (room == RoomMain \|\| room == r_company))` — advances `mydatetime` by 1 day and sets `newday = 1` (line 130) |
| 197–229 | 0 | per-frame (`myweekday`, `myday`, weekday string) |
| **230–5547** | **1** | **`if (newday == 1) { … }` — the entire daily simulation** |
| 5548–end | 0 | per-frame tail |

`newday` is set to `0` at the very top of the next frame (`if (timer >= 1) { newday = 0; }`,
line 82–85) and again at line 5546, so the daily block executes **exactly once per in-game day**.

`timer` accumulates +1 per frame at speed 1× (line 694) plus speed multipliers at lines 56–71
(`time_speed` 2/3/4/5 → +0.5/+1/+2/+30), so **1 in-game day ≈ 101 frames at 1× speed**.
*(VERIFIED structurally; the object's Step *rate* is not in the decompiled data — see
Open Questions.)*

**Consequence:** everything from line 232 to 5545 is DAILY unless its own guard says otherwise.
`timer > 100` and `myday == 1` are the only two real "cadence" gates in the economy.

> ⚠️ Note: the decompiled indentation is misleading — the code is *lexically* indented one
> level deeper than the brace structure implies. Anything reading these files must recompute
> braces, not trust indentation.

---

## 1. Currency & the exchange rate `global.kurs`

### 1.1 What it is

`global.kurs` is **RUB per USD** (game's money unit is "yen", displayed via `global.symbol_yen`,
but economically it is rubles; `commodity_start_price[4]` = `irandom_range(1000,1500)` is
crude-oil-ish and is multiplied by `kurs`). Saved value in the reference save: `kurs = 90.797`.

**Initialization — VERIFIED**

`gml_Object_o_control_Create_0.gml:87`
```gml
global.kurs = random_range(180, 222);
```
`gml_GlobalScript_loadgame.gml:243-246` re-applies the same default for old saves:
```gml
if (global.kurs == 0)
{
    global.kurs = random_range(180, 222);
}
```

### 1.2 Daily drift — VERIFIED (`gml_Object_o_control_Step_0.gml:1035-1072`)

Gated on `holyday == 0` (i.e. **skipped on public holidays**, `get_holiday()`):

```gml
if (holyday == 0)
{
    global.kurs += random_range(-1, 1);
    if (global.kurs < irandom_range(28, 33))
    {
        global.kurs = irandom_range(28, 33);
    }
    if (global.kurs < irandom_range(33, 56))
    {
        global.kurs += 3;
    }
    if (global.kurs < irandom_range(66, 89))
    {
        global.kurs += 1;
    }
    if (global.kurs > irandom_range(277, 522))
    {
        global.kurs -= 1;
    }
    if (global.trend > 4)
    {
        if (global.kurs < irandom_range(200, 255))
        {
            global.kurs += random_range(0.1, 2);
        }
        else
        {
            global.kurs += random_range(-0.05, 0.25);
        }
    }
    if (global.trend < 0.9)
    {
        if (global.kurs > random_range(177, 300))
        {
            global.kurs -= random_range(0.1, 2);
        }
    }
    commodity_update();
}
```

Notes for reimplementation:
* The clamps use `irandom_range(lo,hi)` **inside the comparison**, so the threshold is re-rolled
  *every day* — these are not fixed bounds.
* These are **sequential `if`s, not `else if`**. Several can fire on the same day and the
  effects stack (e.g. a ruble crisis adds +3 while also being subject to the `> 277..522` −1 pull).
* There is a **soft floor** around 28–56 and a **soft ceiling** around 177–522, plus a
  "bull-market" assist when `global.trend > 4` and a "bear-market" drag when `global.trend < 0.9`.
* Net effect of the base term `random_range(-1, 1)` is exactly **0 mean** (symmetric).

### 1.3 Shock event — VERIFIED (`gml_Object_o_control_Step_0.gml:4811-4829`)

Inside the random-market-crisis switch (`pum == 20`, triggered with probability
`irandom(round(400 / global.numberofcompany)) < shans` at line 4800):

```gml
if (pum == 20)
{
    var dice = irandom(1);
    if (dice == 0)
    {
        global.kurs = round(global.kurs / random_range(1.08, 1.23));
        create_notification(txt(76), txt(choose(3984, 3985, 3986)));
    }
    else
    {
        global.kurs = round(global.kurs * random_range(1.08, 1.24));
        create_notification(txt(76), txt(choose(3987, 3988, 3989)));
    }
    if (global.kurs < random_range(77, 100))
    {
        global.kurs = irandom_range(88, 111);
    }
    commodity_update();
}
```

So: 50 % chance of a devaluation of 8–23 % (divide) or an 8–24 % revaluation (multiply),
plus a **hard floor** that snaps a collapsed rate back up to 88–111.

### 1.4 What `kurs` multiplies

Only **two** consumers (VERIFIED by exhaustive grep of `global.kurs`):

1. **Commodity prices** — `gml_GlobalScript_commodity_update.gml:35`
   ```gml
   global.commodity_price[i] = round(global.commodity_start_price[i] * global.commodity_koef[i] * global.kurs);
   ```
   for `i` in 0..5. Commodity "base" prices (`gml_Object_o_control_Create_0.gml:81-86`):
   ```
   [0] irandom_range(300, 500)     [1] irandom_range(7, 11)
   [2] irandom_range(20, 33)       [3] irandom_range(30, 40)
   [4] irandom_range(1000, 1500)   [5] irandom_range(1500, 1800)
   ```
   `commodity_update()` is called **daily** from the `kurs` block (line 1072) and again after
   each FX shock (line 4828), plus once at world creation (Create line 112).

2. **Commercial-property upgrade price** — `gml_Object_o_buildone_Draw_0.gml:203`
   ```gml
   price_upgrade = round_smart((realfix(myhouse[8]) * 405 * (levelnow * levelnow * 1.04) * global.kurs) + (realfix(myhouse[8]) * 628 * global.kurs));
   ```

It is **displayed** at `gml_Object_o_control_Draw_0.gml:1154` as
`txt(3880) + ":" + "\n" + string_thousands(global.kurs)`.

It does **NOT** affect residential real-estate prices, car prices, taxes, salaries, loans,
deposits, or stock prices. *(VERIFIED — no other reads exist.)*

### 1.5 Unrelated but similarly-named

`global.pachinko_kurs` (init `irandom_range(150,888)`, Create line 445) is a pachinko-machine
multiplier and has nothing to do with FX.

---

## 2. Bank

The bank UI is drawn inside `gml_Object_o_control_Draw_0.gml` (not a separate object) using a
`bankregim` state machine on `o_control`:

| `bankregim` | Screen | txt header |
|---|---|---|
| 0 | menu (repay / deposit / insurance / charity) | `txt(362)` |
| 1 | take loan (amount stepper) | `txt(359)` |
| 2 | choose deposit amount | `txt(360)` |
| 3 | choose deposit term | `txt(361)` |
| 4 | choose charity amount | `txt(1073)` |
| 5 | charity confirm | `txt(1074)` |

### 2.1 Finance skill tables — VERIFIED (`gml_Object_o_control_Create_0.gml:138-155`)

```gml
fin_money[0]   = 1000000;      fin_credit[0] = 1;
fin_money[1]   = 10000000;     fin_credit[1] = 0.9;
fin_money[2]   = 35000000;     fin_credit[2] = 0.8;
fin_money[3]   = 100000000;    fin_credit[3] = 0.7;
fin_money[4]   = 300000000;    fin_credit[4] = 0.6;
fin_money[5]   = 1000000000;   fin_credit[5] = 0.5;

fin_deposit[0] = [4, 7, 10];
fin_deposit[1] = [5, 9, 12];
fin_deposit[2] = [6, 10, 13];
fin_deposit[3] = [7, 12, 15];
fin_deposit[4] = [8, 14, 18];
fin_deposit[5] = [10, 15, 20];
```

Skill level — VERIFIED (`gml_GlobalScript_check_level_rep.gml:1-25`), thresholds on `global.char[i]`:

```gml
if (global.char[arg0] >= 5)  { level = 1; }
if (global.char[arg0] >= 10) { level = 2; }
if (global.char[arg0] >= 20) { level = 3; }
if (global.char[arg0] >= 35) { level = 4; }
if (global.char[arg0] >= 50) { level = 5; }
```
`char[1]` = finance.

Derived values — VERIFIED (`gml_Object_o_control_Alarm_1.gml:21-27`, runs daily):
```gml
maxsum = fin_money[check_level_rep(1)];          // max loan
minsum = maxsum / 10;                             // min loan
global.strah_bonus      = fin_credit[check_level_rep(1)];   // insurance discount
global.bonus_bak_credit = fin_credit[check_level_rep(1)];   // loan rate discount
procent_deposit_0 = (fin_deposit[check_level_rep(1)][0] * 0.01) + 1;
procent_deposit_1 = (fin_deposit[check_level_rep(1)][1] * 0.01) + 1;
procent_deposit_2 = (fin_deposit[check_level_rep(1)][2] * 0.01) + 1;
```

> **BUG (VERIFIED, worth replicating or fixing deliberately):** `gml_Object_o_control_Create_0.gml:971-973`
> computes the same three values as `(1 - (fin_deposit[..] * 0.01)) + 1` (i.e. `2 - x`), while
> the daily `Alarm_1` uses `x*0.01 + 1`. The Create version is the *first-day* value only and is
> overwritten on the first Alarm_1 tick. The reference save shows
> `procent_deposit_0/1/2 = 1.10 / 1.15 / 1.20`, i.e. the `Alarm_1` formula with `char[1] ≥ 50`
> (`fin_deposit[5] = [10,15,20]`).

### 2.2 Loans

#### Taking a loan — VERIFIED (`gml_GlobalScript_s_credit.gml:1-9`)

```gml
function s_credit()
{
    global.dolg = global.creditsumma;
    global.money += global.summa;
    add_log(global.summa, 1530);
    global.bankprocentvzyal = global.bankprocent * global.bonus_bak_credit;
    o_control.bankregim = 0;
    create_notification(txt(8), txt(158));
}
```

Key facts:
* **Principal = the amount you asked for**, credited to cash instantly, and the *whole existing
  balance is replaced* (`global.dolg = global.creditsumma`, an assignment, not `+=`).
* Interest rate is **locked at origination**: `bankprocentvzyal = bankprocent * bonus_bak_credit`.
  `bankprocent` is re-rolled every month (§2.3) but does **not** affect an existing loan.
* The cash credit bypasses `money_add()`, so it does **not** increment `global.dohod`
  → **borrowed money is not taxed**.
* `global.creditsumma` is **not** in `global.saveglobalvars` (`gml_Object_o_cursor_Create_0.gml:211`)
  → not serialized. It is only meaningful during the click handler.

Amount stepper — VERIFIED (`gml_Object_o_control_Draw_0.gml:1570-1596`):
```gml
var dfdfd = (minsum + maxsum) / 2;
if (i == 0) { defaultsum -= round(dfdfd * 0.1); defaultsum = round(defaultsum / 1000) * 1000; if (defaultsum < minsum) defaultsum = minsum; }
if (i == 1) { defaultsum += round(dfdfd * 0.1); defaultsum = round(defaultsum / 1000) * 1000; if (defaultsum > maxsum) defaultsum = maxsum; }
if (i == 2) { global.summa = defaultsum; global.creditsumma = global.summa;
              bankpro  = global.bankprocent * global.bonus_bak_credit * 100;
              bankpro2 = global.creditsumma * (1 + global.bankprocent);
              create_question(txt(8), txt(7), s_credit); }
```
`defaultsum` is seeded in `gml_Object_o_control_Step_2.gml:348-349` when the bank opens:
```gml
minsum = 300000;                              // <- hardcoded here, overwritten by Alarm_1 next day
defaultsum = round(maxsum + minsum) / 4;
```
Menu gating — VERIFIED (`Draw_0.gml:1368-1510`): if `global.dolg > 0` the first slot becomes
"repay" instead of "take loan", so you cannot stack loans from the menu.

#### Interest rate `global.bankprocent` — VERIFIED

Initial: `gml_Object_o_control_Create_0.gml:495` → `global.bankprocent = random_range(0.05, 0.1);`
Fallback: `gml_Object_o_control_Create_0.gml:502` → `global.bankprocentvzyal = 0.03;`

Re-rolled **monthly** on the 1st — `gml_Object_o_control_Step_0.gml:2785-2814`:
```gml
global.short_procent = random_range(0.97, 0.995);
dlg = 0;
global.bankprocent = random_range(0.04, 0.12);
...
if (global.mode == 0)
{
    if (date_get_year(mydatetime) >= 1986 && date_get_year(mydatetime) < 1993)
    {
        global.bankprocent = random_range(0.03, 0.06);
    }
    if (date_get_year(mydatetime) > 1992 && date_get_year(mydatetime) < 1998)
    {
        global.bankprocent = random_range(0.02, 0.1);
    }
    if (date_get_year(mydatetime) > 1998)
    {
        global.bankprocent = random_range(0.07, 0.13);
    }
}
```
`global.mode` comes from difficulty slot `level_diff[9]` (`gml_Object_o_pc_menu_Step_2.gml:8`);
in `mode == 1` (randomised-market mode) the year table is skipped and the base
`random_range(0.04, 0.12)` is used.

Effective *annual* rate is `bankprocent * bonus_bak_credit`, so **0.4 % – 13 %/yr** depending on
finance skill (÷10 at skill 5). Reference save: `bankprocent = 0.12079`,
`bankprocentvzyal = 0.046977` (= 0.12079 × 0.3889 — *not* a value in `fin_credit`, so the save
was produced by a build/version whose `fin_credit` table differed; see Open Questions).

#### Monthly debt service — VERIFIED (`gml_GlobalScript_dolg_get.gml:1-45`, verbatim)

```gml
function dolg_get()
{
    all_dolg = 0;
    global.nachisleno = global.bankprocentvzyal / 12;
    global.credituvelichen = round(global.dolg * (1 + global.nachisleno)) - global.dolg;
    dooolg = round(global.dolg * (1 + global.nachisleno));
    dlg = 0;
    if (dooolg > 30000)
    {
        dlg = clamp(dooolg * 0.08, 30000, 50000);
        if (dooolg > 888888)   { dlg = clamp(dooolg * 0.08, 50000, 80000); }
        if (dooolg > 1888888)  { dlg = clamp(dooolg * 0.08, 50000, 125000); }
        if (dooolg > 2888888)  { dlg = clamp(dooolg * 0.08, 100000, 185000); }
        if (dooolg > 3888888)  { dlg = clamp(dooolg * 0.08, 100000, 255000); }
        if (dooolg > 5888888)  { dlg = clamp(dooolg * 0.08, 100000, 300000); }
        if (dooolg > 8888888)  { dlg = clamp(dooolg * 0.08, 100000, 400000); }
        if (dooolg > 18888888) { dlg = clamp(dooolg * 0.08, 100000, 800000); }
    }
    else
    {
        dlg = dooolg;
        all_dolg = 1;
    }
}
```

So the schedule is: **8 % of principal+this-month-interest, clamped into a bracket that grows
with the balance.** Below 30 000 total the payment equals the whole remaining balance (loan
auto-clears, `all_dolg = 1` → "dolgi" achievement). There is **no fixed term** — the 8 %/mo
would amortise a normal loan in ~13 months, but the clamps make large loans pay ~1–2 %/mo, so
real terms are 3–15 years depending on size. *(INFERRED from the table; the game never states a term.)*

Bracket table (last matching `if` wins, all `if`s are sequential not `else if`):

| `dooolg` threshold | min payment | max payment |
|---|---|---|
| `> 30000` | 30 000 | 50 000 |
| `> 888888` | 50 000 | 80 000 |
| `> 1888888` | 50 000 | 125 000 |
| `> 2888888` | 100 000 | 185 000 |
| `> 3888888` | 100 000 | 255 000 |
| `> 5888888` | 100 000 | 300 000 |
| `> 8888888` | 100 000 | 400 000 |
| `> 18888888` | 100 000 | 800 000 |

#### Settlement — VERIFIED (`gml_Object_o_control_Step_0.gml:2815-2837`)

```gml
nalognow = global.dohod * global.nalog;
nalogestate = round(nalogestate);
if (nalognow > 0)    { money_delete(nalognow, 25); }
if (nalogestate > 0){ money_delete(nalogestate, 670); }
procpec = "";
if (global.dolg > 0)
{
    dolg_get();
    global.dolg = dooolg;
    if (all_dolg == 1)
    {
        achivka("dolgi", 1);
    }
    global.money -= dlg;
    global.dolg -= dlg;
    procpec = " " + txt(226);
}
```

* Debt **compounds first** (`global.dolg = dooolg`), then the payment is taken.
* `global.money -= dlg` and `global.dolg -= dlg` use **raw arithmetic**, so:
  - the payment is **not** added to `global.rashod`,
  - it is **not** written to `global.logs`,
  - it does **not** play the expense SFX,
  - `global.money` is allowed to go negative.
* **No missed-payment penalty / no credit rating drop.** Missing a payment simply means the
  balance compounds at `bankprocentvzyal/12` forever. The only escalation is the generic
  bankruptcy cascade in §8.
* Monthly report line (`Step_0:2859`): `var pribil = global.dohod - global.rashod - max(0, nalognow) - dlg;`
  — note `nalognow` is subtracted **twice** (it is already inside `rashod`). Display-only quirk.

#### Early full payoff — VERIFIED (`gml_GlobalScript_vyplata_dolga.gml:1-8`)

```gml
function vyplata_dolga()
{
    create_notification(txt(8), txt(288));
    o_control.bankregim = 0;
    money_delete(global.dolg, 1529);
    achivka("dolgi", 1);
    global.dolg = 0;
}
```
Reachable only when `global.money >= global.dolg` (`Draw_0.gml:1493-1500`).
**Note:** this refunds the *gross* `global.dolg` — it does **not** deduct the accrued
`credituvelichen`. Only the monthly bracket payment charges interest.

#### Starting debt from character traits — VERIFIED (`gml_GlobalScript_gostart.gml:16-21`)

```gml
if (global.dolg > 0)
{
    global.bankprocentvzyal = 0.03;
    global.bonus_bak_credit = 1;
}
global.dolg += money_dolg;
```
`money_dolg` comes from `get_traits()` (trait 6: `money_dolg += 7000000`, plus `money_plus += 5000000`).
Traits also do `global.money += money_plus` (line 15). A trait-granted loan gets a flat 3 %/yr.

#### Loan-ask events (`global.v`) — VERIFIED (`gml_GlobalScript_zvonok1.gml:1-19`)

```gml
if (global.money < 10000000)  { global.v = clamp(irandom_range(global.money * 0.15, global.money * 0.3), 45000, 1000000); }
if (global.money >= 10000000) { global.v = clamp(irandom_range(global.money * 0.05, global.money * 0.1), 2000000, 100000000); }
if (global.money < global.v)  { global.v = 35000; }
if (global.money < global.v)  { global.v = round(global.money * 0.7); }
```
These are paid with `money_delete(global.v, 1528)` in `zvonok1_1.gml:3` — a one-off bill,
not a loan.

### 2.3 Deposits (bank savings) — VERIFIED

Selection (`gml_Object_o_control_Draw_0.gml:1638-1671`):
```gml
if (i == 0) { global.deposit = round(summadeposit * procent_deposit_0); global.depositdays = 182; global.money -= summadeposit; ... }
if (i == 1) { global.deposit = round(summadeposit * procent_deposit_1); global.depositdays = 365; global.money -= summadeposit; ... }
if (i == 2) { global.deposit = round(summadeposit * procent_deposit_2); global.depositdays = 730; global.money -= summadeposit; ... }
```
* The **entire return amount** is fixed at deposit time: `global.deposit = principal * (1 + pct)`.
  The principal leaves your wallet immediately (`global.money -= summadeposit`, raw — no
  `rashod`, no log entry).
* Only **one** deposit at a time (`Draw_0.gml:1513`: if `global.deposit != 0` you get `txt(304)`).
* Min `minsum2 = 200000`, max `maxsum2 = floor(global.money)` (`gml_Object_o_control_Step_2.gml:350-352`).
  Rate picker requires `global.money >= minsum2`.
* Rate picker stepper uses `defaultsum2`, step `round((minsum2+maxsum2)/2 * 0.1)`, snapped to 1000.

Maturity — VERIFIED (`gml_Object_o_control_Step_0.gml:2201-2210`, daily):
```gml
if (global.deposit > 0)
{
    global.depositdays -= 1;
    if (global.depositdays <= 0)
    {
        create_notification(txt(8), txt(309));
        global.money += global.deposit;
        global.deposit = 0;
    }
}
```
**`global.money += global.deposit` is raw** — so **deposit interest is completely tax-free**
(never enters `global.dohod`). Reference save shows `deposit = 6.019e12`, `depositdays = 730`
(2-year tier still running).

### 2.4 Car insurance — VERIFIED

* Enrol: `gml_GlobalScript_s_car_strahovka.gml:4-8` — `carprice_start = 50000`
  (`Draw_0.gml:1537`), `money_delete(o_control.carprice_start, 290)`.
  Forfeited automatically if `global.car == 0` (`Step_0.gml:716-719`).
* Monthly premium: `gml_Object_o_control_Step_0.gml:2839-2843`
  ```gml
  if (global.strahovka == 1 && global.car > 0)
  {
      var strahprice = carprice_mesyac * global.strah_bonus;
      money_delete(strahprice, 290);
      strahtext = txt(298) + " " + string_thousands(strahprice) + "\n";
  }
  ```
* `carprice_mesyac = round(allmycarprice_full * 0.003)` where `allmycarprice_full` is the
  **sum of every owned car's stored purchase price** (`mycar[i][9]`), accumulated in
  `gml_Object_o_control_Alarm_1.gml:124-129`.
  ⚠️ **BUG (VERIFIED):** that accumulation happens *inside* the car loop, so with **zero** cars
  `carprice_mesyac` keeps its stale previous value.
* `global.strah_bonus = fin_credit[check_level_rep(1)]` → premium discount of the same
  magnitude as the loan discount (−50 % at max finance skill).

---

## 3. Taxes

There are **three** distinct taxes.

### 3.1 Income tax — VERIFIED

Rate `global.nalog` (a fraction, e.g. `0.0863419040874578` in the reference save).
* Initialised `gml_Object_o_control_Create_0.gml:814`: `global.nalog = random_range(0.04, 0.15);`
* Re-rolled by random event `pum == 0` — `gml_Object_o_control_Step_0.gml:3607-3612`:
  ```gml
  global.nalog = random_range(0.02, 0.15);
  nalogtext = round(global.nalog * 100);
  create_notification(txt(76), txt(98));
  ```
  There is **no** year-dependent progression — the range simply widens over the game
  (0.04–0.15 at start → 0.02–0.15 later).

Assessment — VERIFIED (`Step_0.gml:2815-2820`, monthly on the 1st, `myday == 1 && startgame == 0`):
```gml
nalognow = global.dohod * global.nalog;
nalogestate = round(nalogestate);
if (nalognow > 0)
{
    money_delete(nalognow, 25);
}
```
`global.dohod` is the **sum of every `money_add()` call during the month**; it is zeroed at the
end of the monthly block (`Step_0.gml:2963-2964`: `global.rashod = 0; global.dohod = 0;`).

Display (`Draw_0.gml:954`): `string(round(global.nalog * 100)) + "%" + $" (~ {string_thousands(global.dohod * global.nalog)})"`.

**Tax-exempt income paths (VERIFIED — these all mutate `global.money` directly, bypassing
`money_add`, so they never enter `global.dohod`):**

| Source | Code |
|---|---|
| Bank loan principal | `s_credit.gml:4` `global.money += global.summa;` |
| Deposit maturity | `Step_0.gml:2207` `global.money += global.deposit;` |
| Stock-sale residual | `o_birza_Other_10.gml:128` `global.money += (money_pribil - money_pribil2);` |
| Commodity-sale profit | `o_birza_Other_10.gml:274` `money_add(money_pribil, undefined, undefined, 0);` — `arg3 == 0` suppresses `global.dohod +=` |

The stock/commodity split is `gml_Object_o_birza_Other_10.gml:126-129` (see §7.4) — it is a
**tax-free-allowance mechanic keyed on average purchase price** (`global.company_ac_average`),
intended to model a capital-gains allowance.

### 3.2 Property (real-estate) tax — VERIFIED

`nalogestate` is a **local** of `o_control` (it *is* in `global.savelocalvars`,
`o_cursor_Create_0.gml:213`).

Accumulated **daily** in `gml_Object_o_control_Alarm_1.gml:96` + `:157-170`:
```gml
nalogestate = 0;
...
for (var i = 0; i < ds_list_size(global.houses); i++)
{
    myhouses[i] = checkbuild(i);
    ...
    nalogestate += (realfix(myhouses[i][9]) * 0.00083333333);
    ...
}
```
`myhouses[i][9]` is the **price actually paid** for that building.
`0.00083333333 ≈ 1/1200` → **0.0833 % of paid property value per month (1 %/yr)**.

Charged monthly: `Step_0.gml:2816` `nalogestate = round(nalogestate);` and `:2821-2824`
`if (nalogestate > 0) { money_delete(nalogestate, 670); }`.
Unlike income tax this **is** added to `global.rashod` (it goes through `money_delete`).
Reference save: `nalogestate = 1 296 068 666.83` → implies ~1.555e12 of paid property value.

### 3.3 Margin / short-selling interest — VERIFIED (`Step_0.gml:682-692, 2849-2858`)

Daily accrual:
```gml
shortall = 0;
for (var i = 0; i < 30; i++)
{
    var priceacc = global.company_stockprice[i] / max(1, global.company_number_a[i]);
    shortall += (priceacc * global.company_short[i]);
}
if (shortall > 0)
{
    global.short_dolg = shortall;
    shortproc += round((shortall * 0.13) / 360);
}
```
Monthly charge: `if (shortproc > 0) { money_delete(shortproc, 1541); } … shortproc = 0;`
→ **0.13 / 360 ≈ 0.0361 % per day ≈ 13.2 % APR** on the notional short value.
`shortproc` is a local; it is *not* reset on day rollover, only after the monthly charge.
Reference save: `short_dolg = 397 997.99`, `shortproc = 1389` (≈ 1389 / (397998·0.13/360) ≈ 9.7 days).

⚠️ **QUIRK (VERIFIED):** `global.short_dolg` is only assigned **inside** `if (shortall > 0)`.
If you close all short positions it keeps the last non-zero value forever, still depressing
`global.fortune` and `global.repa`.

### 3.4 Other recurring money events (not "taxes" but debit codes)

Log codes (`arg1` of `money_delete`) are opaque localization IDs; the string table was not
recovered (see Open Questions). Codes observed in the economy subsystem:

| code | site | meaning (INFERRED from context) |
|---|---|---|
| 25 | `Step_0:2819` | income tax |
| 290 | `Step_0:2842`, `s_car_strahovka.gml:7` | car insurance |
| 669 | `Step_0:3290` | real-estate rent income |
| 670 | `Step_0:2823` | property tax |
| 1394/1395 | `Step_0:3067/3076` | board seat dividends (comp `vsovete` 1 / 2) |
| 1529 | `vyplata_dolga.gml:5` | loan payoff |
| 1530 | `s_credit.gml:5`, `s_drug.gml:4` | loan taken / friend's loan |
| 1531 | `add_charity.gml:53`, `add_temple_donate.gml:31` | charity / temple donation |
| 1532 | `invest.gml:22`, `investments.gml:230` | investment purchase / upgrade |
| 1534 | `o_birza_Other_10.gml:116/123/2472` | stock buy / stock sell |
| 1535 | `cars_movein.gml:33`, `Step_0:2435` | car sale |
| 1537 | `Step_0:2608` | legal fine (prison) |
| 1541 | `Step_0:2852` | margin interest |
| 1542 | `Step_0:3648` | car accident fine |
| 1543 | `cars_movein.gml:94` | car repair |
| 1544 | `draw_real_estate.gml:261` | property purchase |
| 1548 | `Step_0:2622` | **daily living expenses (`global.trata`)** |
| 1554 | `o_bar_Step_0.gml:158` | birthday gift |
| 1556 | `Step_0:120` | part-time work salary |
| 1557 | `Step_0:1638/1652/1685` | investment payout |
| 1558 | `Script391.gml:17` | forced house sale |
| 1559 | `Step_0:2521` | friend repays loan with interest |
| 1562 | `house_movein.gml:54`, `Script391.gml:39` | house sale |
| 1934 | `sdelka1.gml:179/185` | art buy / art sell |
| 1275 | `yakuza_money_yes.gml:4` | yakuza loan (income) |
| 1526 | `yakuzayes.gml:9/22` | yakuza ransom |
| 3811 | `investments.gml:224` | project purchase |
| 3871+i | `o_birza_Other_10.gml:261/268` | commodity i buy / sell |
| 3947 | `house_movein.gml:6` | property upgrade |

---

## 4. Income / expense flow & the ledger

### 4.1 `money_add` — VERIFIED (`gml_GlobalScript_money_add.gml:1-45`)

```gml
function money_add(arg0, arg1 = 0, arg2 = -1, arg3 = 1)
{
    global.money += arg0;
    if (arg3 == 1)
    {
        global.dohod += arg0;
    }
    play_sfx(money_drop1);
    if (instance_exists(o_control))
    {
        with (o_control) { changed_filter = 1; }
    }
    if ((global.money - global.dolg) >= (global.achiev[6][6][0] + global.start_money)) { achivka("million", 1); }
    ... [1],[2] ...
    if (global.fortune >= (global.achiev[7][6][0] + global.start_money)) { achivka("megamoney", 1); }
    ... [1],[2] ...
    if (arg1 > 0) { add_log(arg0, arg1, arg2); }
    trace($"add_money {arg0}, {arg1}, {arg2}");
}
```
Signature: `money_add(amount, log_code = 0, company_index = -1, count_as_income = 1)`.

### 4.2 `money_delete` + `add_log` — VERIFIED (`gml_GlobalScript_money_delete.gml:1-40`)

```gml
function money_delete(arg0, arg1 = 0, arg2 = -1)
{
    if (arg1 != 1548) { play_sfx(clearing1, undefined, 1); }
    if (is_real(arg0))
    {
        global.money -= arg0;
        global.rashod += arg0;
        if (instance_exists(o_control)) { with (o_control) { changed_filter = 1; } }
        if (arg1 > 0) { add_log(-arg0, arg1, arg2); }
    }
}

function add_log(arg0, arg1 = 0, arg2 = -1, arg3 = "")
{
    var data = global.mydata;
    var arra = [data, arg0, arg1, arg2, arg3];
    if (arg0 != 0)
    {
        ds_list_insert(global.logs, 0, arra);
    }
}
```
`money_delete` is a **no-op if `arg0` is not real** (e.g. NaN) — this matters, see
`repa = " -nan(ind)"` in the reference save.

`global.logs` is a `ds_list` (serialized as `[logs]` in the save, `saveslot_auto.json`).
Each entry: `[timestamp, signed_amount, log_code, company_index, extra_string]`.
New entries are **inserted at index 0** (newest first).

### 4.3 Net worth / "fortune" — VERIFIED (`gml_Object_o_control_Alarm_1.gml:66-95`)

Recomputed **daily**:
```gml
global.fortune = 0;
global.fortune += (global.money - global.dolg - global.short_dolg);
for (var i = 0; i < 30; i++)
{
    ...
    global.fortune += (global.company_ac[i] * (global.company_stockprice[i] / max(1, global.company_number_a[i])));
    carsdoms += (global.company_ac[i] * (global.company_stockprice[i] / max(1, global.company_number_a[i])) * 1.5);
}
global.commdity_money_in_player = 0;
for (var i = 0; i < 6; i++) { global.commdity_money_in_player += (global.commodity_player[i] * global.commodity_price[i]); }
global.fortune += global.commdity_money_in_player;
```
plus, in the same alarm (`Alarm_1.gml:124-131, 157-170`):
```gml
global.fortune += mycarprice;          // = realfix(mycar[i][8]) * realfix(mycar[i][9]) = condition * paid_price
...
global.fortune += (realfix(myhouses[i][8]) * global.price_building * 0.94);
```
So **fortune = cash − loans − margin debt + market value of shares + commodities +
(condition × paid price) of cars + (base building price × price_building × 0.94) of houses.**

`carsdoms` (used for `global.repa` / `global.cozy`) accumulates 1.5× stock value, 1.12× car paid
price and 1.25× property market value.

`global.repa` — VERIFIED (`Step_0.gml:2220-2230`):
```gml
global.repa = clamp((((carsdoms + global.money + (global.allstockprice * 1.1)) - global.dolg) / 70000000) * 88, 0, 100) + global.karma;
if (global.repa < 5) { global.repa = 5; }
for (var i = 0; i < global.numberofcompany; i++) { var pepe = (global.company_ac[i] / global.company_number_a[i]) * 10; global.repa += pepe; }
global.repa = round(global.repa);
```
⚠️ It is `clamp(...,0,100) + karma + Σstake%*10` — the sum can exceed 100 (reference save
holds the literal string `"        -nan(ind)"`, i.e. the save loader choked on a NaN).

`global.fortune_level` — VERIFIED (`Step_0.gml:2879-2897`):
```gml
var base_requirement = 3000000;
var level_multiplier = 1.25;
var level = 0;
while (global.fortune >= base_requirement)
{
    level++;
    var oldbase = base_requirement;
    base_requirement *= level_multiplier;
    base_requirement = round(base_requirement * 0.00001) * 100000;
    level_multiplier = clamp(relerp(0, 30, level, 1.5, 1.25), 1.25, 1.5);
}
global.fortune_level = level;
```
Start 3 M, ×1.25 (multiplier lerps 1.5→1.25 over levels 0→30, applied one step late),
snapped to the nearest 100 000. Gates a `char[1]` (happiness) buff on the 1st of each month
(`Step_0.gml:2903-2906`).

### 4.4 Daily living expenses — VERIFIED (`Step_0.gml:2261-2282`, `2620-2623`)

```gml
if (global.house == 0 && global.money > 9999) { tratadop = 10000; } else { tratadop = 0; }
global.trata = (global.daily * 30 * max(1, (koef_house * 0.5) - 4.7) * random_range(0.8, 1.2)) + tratadop;
if (global.otpuskdays >= 0) { global.trata = max(5000, 600 * max(1, (koef_house * 0.5) - 4.7) * random_range(0.8, 0.9)); }
if (global.traits[10] == 1) { global.trata *= 0.8; }
if (global.traits[12] == 1) { global.trata *= 1.1; }
...
if (gameday > 1) { money_delete(global.trata, 1548); }
```
* `koef_house = min(400, realfix(myhouses[i][7]) + 60) * 0.1823` — comfort of the **inhabited**
  building (`Alarm_1.gml:183`); `koef_car = min(35, realfix(mycar[i][6]) * realfix(mycar[i][8]) * 0.125) * 0.77`
  (`Alarm_1.gml:145`) — car comfort × condition.
* `global.daily` is an energy stat (0–100 base, up to 233 while in hospital, `Step_0.gml:2231-2259`).
* Rent-free if homeless (`koef_house = 0` ⇒ `max(1, -4.7) = 1` ⇒ flat `daily * 30 * ~1.0`).
* Reference save: `trata = 82 839`, `koef_house = 72.92`, `daily = 100`
  → `100 * 30 * max(1, 36.46−4.7) * ~0.76` ≈ 72 k… close enough given the `random_range(0.8,1.2)` roll.

### 4.5 Incomes that are *not* stock dividends

**Part-time job — VERIFIED (`Step_0.gml:114-126` + `gml_GlobalScript_zvonokpodrabotka.gml`)**
```gml
if (global.parttimework_days > 0)
{
    if (myweekday > 0 && myweekday <= 3)
    {
        global.parttimework_days -= 1;
        global.stress += (random_range(0.1, 1) * stles);
        money_add(global.parttimework_plata, 1556);
        ...
    }
}
```
Offer: `global.nedeli = irandom_range(4,12)`, `global.platapodrabotka = irandom_range(50,150)*100`
(or, via a close friend > 10 friendship: `irandom_range(10,16)` days and `irandom_range(200,333)*100`).
Triggered when `global.money < 33000` and at most 3 times (`podrabotka < 3`).

**Board-seat dividends (monthly, the 20th)** — VERIFIED (`Step_0.gml:3055-3077`)
```gml
dohodmesyac[i][date_get_month(mydatetime)] = global.company_price[i] * global.company_profit[i] * (global.big_data[i][0] / 100);
...
if (global.company_vsovete[i] == 1)
{
    var summ = max(500000, round(global.company_price[i] / 50000000) * 10000);
    dohodall += summ;
    add_log(summ, 1394, i);
    money_add(summ, 1394);
}
if (global.company_vsovete[i] == 2)
{
    var summ = max(1000000, round(global.company_price[i] / 25000000) * 10000);
    dohodall += summ; add_log(summ, 1395, i);
}
```
and the actual per-share dividend at `Step_0.gml:3260-3263`:
```gml
if (global.diff_divident == 0)
{
    dohod[i] = round(max(0, (dohodmesyac[i][date_get_month(mydatetime)] / global.company_number_a[i]) * global.company_ac[i]));
}
```
Year-end total payout if the "annual dividends" difficulty (`global.diff_divident == 1`) is on —
`Step_0.gml:3030-3050`: `dohod[i] = global.company_ac[i] * (Σ_0..11 dohodmesyac[i][m] / global.company_number_a[i]);`
fired on `myday == 31 && month == 12`.

**Birthday gifts** — `o_bar_Step_0.gml:153-158`
```gml
global.podarunok = max(100000, round(random_range(alll * alll * 0.2, alll * alll * 0.4) * 10) * 10000);
if (global.noluck == 1) { global.podarunok = max(50000, round(random_range(alll*alll*0.05, alll*alll*0.15) * 10) * 10000); }
money_add(global.podarunok, 1554);
```
with `alll = druzhba_level() + 1`.

**Friend loan ("drug")** — `gml_GlobalScript_s_drug.gml:1-6` + `o_bar_Step_0.gml:409-413`
```gml
global.dolgprosit = round(global.money * random_range(0.03, 0.3));
...
global.dolgdruga = global.dolgprosit;
money_delete(global.dolgprosit, 1530);
```
Repayment after `daydolg > irandom_range(60, 500)` days (`Step_0.gml:2514-2525`), 1/3 chance of
refusal; if paid, 2/3 chance:
```gml
var pepep = random_range(1.15, 2.5);
money_add(round(global.dolgdruga * pepep), 1559);
```
→ **15 %–150 % interest**. Needs `global.money > 100000` to originate and no other friend loan.

---

## 5. Property / assets

### 5.1 Two separate property systems

1. **Personal real-estate portfolio** (`global.houses`, a `ds_list` of 15-field underscore-
   separated strings) — the "real estate" market, regenerated monthly, with rent, property
   tax, upgrade, rent-out.
2. **The `house_price` / `car_price` ladders + `buy_dom` / `buy_car`** — **DEAD CODE**.
   `buy_dom.gml` and `buy_car.gml` read `o_control.house_price[global.nowvybor]` /
   `o_control.car_price[global.nowvybor]`, but `car_price` is **never assigned** and
   `global.nowvybor` is only ever initialised to `-1` (`Create_0.gml:836`); nothing draws those
   buttons. `house_price[]` is filled (Create lines 839–849: 0, 2 990 000, 4 490 000, 6 490 000,
   9 990 000, 13 990 000, 18 900 000, 29 900 000, 49 900 000, 99 900 000, 199 000 000) but is
   unreachable. **Do not reimplement these.**

### 5.2 Building record layout — VERIFIED (`gml_GlobalScript_draw_real_estate.gml:286`, `checkbuild:361`)

Built as:
```gml
"_" + type + "_" + bukva + "_" + rooms + "_" + size + "_" + sprite + "_" + image + "_"
    + komfort + "_" + building_price + "_" + price + "_" + com + "_" + 0 + "_" + secretik
    + "_" + class + "_" + 0 + "_" + (com * 0.4 + 1) + "_"
```

| index | meaning | used by |
|---|---|---|
| 1 | `building_type` (0 apartment / 1 office / 2 house) | sprite, UI |
| 2 | `bukva` class A–D (0–3) | comfort coefficient |
| 3 | `rooms` | size, comfort |
| 4 | `size` (m²) | UI |
| 5 | sprite name | draw |
| 6 | sub-image | draw |
| 7 | `komfort` (unit comfort) | `koef_house`, stars, `house_upgrade` |
| 8 | `building_price` (unit price) | **market value, sale, rent, upgrade** |
| 9 | `price` actually paid | **property tax**, fortune? no — fortune uses [8] |
| 10 | `com` (0 residential / 1 commercial) | rent × `(com*0.4+1)` |
| 11 | inhabited flag (0/1) | `global.house` |
| 12 | `secretik` defect id 0–7 | sets [8] and [7] on purchase |
| 13 | sector (0–4) | `global.b_sector_now` |
| 14 | upgrade level (0–3) | upgrade price |
| 15 | rent multiplier / condition | rent |

`checkbuild` back-fills missing fields ([13] from `price8/komfort7 >= 1`, [14]=0, [15] from
`[12]`: 1→0.4, 2→0.5, 3→0.8).

### 5.3 Market generation — VERIFIED (`gml_GlobalScript_building_generate.gml:79-247`)

Runs **monthly on the 1st** (`Step_0.gml:2758-2764`) producing `global.housethismonth`
listings (15 base, +6/21/24/30/36/45 by `check_level_rep(7)` — `Alarm_1.gml:35-55`),
capacity-limited by sector slots `global.b_sector`.

Price chain:
```gml
global.building_komfort[i] = (global.building_size[i] * komf_koef_type * komf_koef_bukva) + ((global.building_rooms[i] - 1) * 0.08);
global.building_price[i]  = global.building_komfort[i] * building_bonus_price;
```
with
* `start_size` from `bukva`: 12 / 16 / 21 / 28 for A/B/C/D, `komf_koef_bukva` 0.7 / 1 / 1.2 / 1.5
* `start_size += ((rooms - 1) * random_range(9, 16))`
* `building_size = round(start_size * bonus_size * bonus_sizee)` where `bonus_size = random_range(0.9,1.5)`,
  `bonus_sizee` = 0.9 / 1 / 1.3 by `type`
* `komf_koef_type` = 0.9 / 1.2 / 1.7 by `type`, then `+= ((class * 0.16) - 0.12)`
* `building_bonus_price`: base `random_range(0.75,0.84)`; class 1 → `random_range(1.5,1.7)`;
  class 2 → `random_range(2.7,4)`; class 3 → `random_range(8,10)`; class 4 → `random_range(18,20)`;
  if commercial → `*= random_range(5,7)`.
* Rare buildings: `building_rare` = 1 with prob 1/70 (class 0), 1/144 (class 1).
  `building_mnozh = random_range(1.5, 3)` — a discount multiplier.

### 5.4 Buying a property — VERIFIED (`gml_GlobalScript_draw_real_estate.gml:251-333`)

```gml
var prprprp = global.building_price[global.buyedhouse] * global.price_building;
var price = round(prprprp / 100000) * 100000;
if (global.building_rare[global.buyedhouse] == 1) { price = price / global.building_mnozh[global.buyedhouse]; }
money_delete(price, 1544);
```
* Listed price = `building_price × global.price_building`, rounded to the nearest 100 000,
  divided by `building_mnozh` if rare (so rare = *cheaper*).
* Random **defect** (`secretik`) if `rare && !com` and `random(8) < building_mnozh * 2`:
  overwrites stored `[8]` (price basis) and `[7]` (comfort) with damage ranges:
  | secretik | `[8]` multiplier of `building_price` | `[7]` multiplier of `building_komfort` |
  |---|---|---|
  | 1 | 0.2–0.4 | 0.4–0.6 |
  | 2 | 0.2–0.5 | 0.4–0.6 |
  | 3 | 0.1–0.4 | 0.1–0.2 |
  | 4 | 0.2–0.5 | 0.8–0.9 |
  | 5 | 0.3–0.5 | 0.4–0.6 |
  | 6 | 0.3–0.5 | 0.8–0.9 |
  | 7 | 0.7–0.88 | 0.9–1.0 |
* Defect 7 is downgraded to `irandom(6)` if `global.yakuza_rep > 0` (game gives you a discount).

### 5.5 Valuation, sale, rent, upgrade

**Market value** (`o_buildone_Alarm_0.gml:2`, also used by the owners screen):
```gml
price_pem = round((realfix(myhouse[8]) * global.price_building * 0.94) / 100000) * 100000;
```
→ **value = unit price × `price_building` × 0.94**, rounded to 100 000.

**Voluntary sale** (`gml_GlobalScript_house_movein.gml:52-65`):
```gml
function house_sell()
{
    money_add(o_buildone.price, 1562);
    ...
}
```
100 % of market value (`o_buildone.price = price_pem`). No penalty, but you lose the rent.

**Forced sale during bankruptcy** (`gml_GlobalScript_Script391.gml:22-40`):
```gml
prpr = round(price_house * global.price_building) * random_range(0.5, 0.8);
change_char_procent_and_chislo(-0.06, -1, 1);
money_add(iz); add_log(iz, 1562);
```
**50–80 % of value**, plus −6 % `char[0]` (reputation) and −1 `char[2]`.
(The non-bankruptcy variant `selldomandstrahovka()` at line 1–20 uses `random_range(0.5, 0.85)`
and is used for yakuza "protection" offers.)

**Rent (daily, income)** — `Step_0.gml:655-666`:
```gml
var orenda = round(round_fixed(realfix(myhouses[i][8]) * global.dom_orenda_stavka * realfix(myhouses[i][15]), -3) / 30);
if (myhouses[i][10] == 1) { orenda = round(round_fixed(...same..., -3) / 30); }
if (myhouses[i][11] == 0) { housemoney += orenda; }
```
* `global.dom_orenda_stavka = 7777` (fixed; Create line 161, re-set to 7777 if 0 in
  `Alarm_1.gml:10-13` and `Create_0.gml:963-965`).
* `round_fixed(x, -3)` = round to nearest 1000; then `/30` ⇒ **daily rent ≈ value_basis / 30**.
* Only buildings **you do not live in** earn rent.
* Rent is pooled into the local `housemoney` and paid on the 20th
  (`Step_0.gml:3288-3295`):
  ```gml
  if (housemoney > 0) { add_log(housemoney, 669); dohodall += housemoney; achivka_full("real_estate_income", housemoney); housemoney = 0; }
  ```
  and then merged into `dohodall` → `money_add(dohodall)` (line 3299) → **taxed**.

**Upgrade (commercial buildings only, max 4 levels)** — `gml_Object_o_buildone_Draw_0.gml:203`
```gml
var levelnow = realfix(myhouse[14]) + 1;
price_upgrade = round_smart((realfix(myhouse[8]) * 405 * (levelnow * levelnow * 1.04) * global.kurs) + (realfix(myhouse[8]) * 628 * global.kurs));
```
`gml_GlobalScript_house_movein.gml:1-14` applies it:
```gml
edithouse(number, 8, realfix(myhouse[8]) * 1.2);
edithouse(number, 15, realfix(myhouse[15]) * 1.45);
edithouse(number, 14, realfix(myhouse[14]) + 1);
edithouse(number, 7, realfix(myhouse[7]) + 30);
```
⇒ **+20 % value, +45 % rent, +1 level, +30 comfort per upgrade.** Upgrade price scales
quadratically (`levelnow²`) and is the only consumer of `global.kurs` besides commodities.

**Real-estate index `global.price_building`**

* Initial: `irandom_range(466000, 633000)` (`Create_0.gml:874`).
* Daily drift: `Step_0.gml:1536` `global.price_building += (((global.rynochek * global.trend) - 1) * 10);`
* Year-based drift, `mode == 0` only (`Step_0.gml:1416-1437`):
  `< 1990` → `+= irandom_range(1,25)`; `== 1990` → `-= irandom_range(5,12)`;
  `1991..1998` → `-= irandom_range(0,3)`.
* Market-regime events (`mode == 1`, `Step_0.gml:833-907`) multiply it 1.2–1.3 / 1.1–1.2 /
  1.05–1.1 / 0.9–0.95 / 0.75–0.85 / 0.6–0.75 / ÷2, and then mean-revert it daily:
  ```gml
  global.price_building = lerp(global.price_building, global.trend * 603000, random_range(0.002, 0.01));
  global.price_cars      = lerp(global.price_cars,      global.trend * 3030000, random_range(0.005, 0.01));
  ```
* Historical scripted shocks (`mode == 0`, `Step_0.gml:930-1031`): 1990-01-11 `*1.05`;
  1990-12-25 `*0.6`; 1991-01-11 `*0.9`; 1990-04-05 / 1992-02-11 / 1992-06-11 multiply
  `trend` by 0.7–0.9 / 0.9 / 0.9.
* Reference save: `price_building = 559 323.65` (post-1998 regime).

### 5.6 Cars

**Generation** — `gml_GlobalScript_cars_generate.gml:1-133`, monthly (24 listings).
```gml
global.cars_komfort[i] = <type bonus price> * random_range(<0.4..1.2>);   // then *75
global.cars_condition[i] = choose(1, 1, choose(random_range(0.5, 1), random_range(0.28, 1)));
var koeff = random_range(61, 70);            // tiered by komfort, see below
global.cars_price[i] = global.cars_komfort[i] / koeff;
```
type bonus prices: 0 sedan `random_range(0.8,2.5)`; 1 hatchback `random_range(1,2)`;
2 van `random_range(1,2.1)`; 3 pickup `random_range(1,2.1)`; 4 limousine `random_range(8,12)`;
5 cabriolet `random_range(6,9)`. `koeff` tiers: komfort ≤88 → 61–70; ≥88 → 50–60; ≥100 → 45–50;
≥120 → 40–44; ≥150 → 34–50; ≥200 → 25–31; ≥300 → 20–24; ≥400 → 11–18.
Secret model "6000 SUS": komfort = 5000, `koeff = 10`, prob 1/500.

**Market price** — `gml_GlobalScript_draw_cars.gml:109-110`:
```gml
var prprpr = global.cars_price[arg0] * global.price_cars * global.cars_condition[arg0];
var price = round(prprpr / 10000) * 10000;
```
**Car index** `global.price_cars`: initial `irandom_range(2660000, 3330000)`, mean-reverts to
`trend * 3030000` daily.

**Car record layout** (`draw_cars.gml:239`, `checkcar:280`):
| idx | meaning |
|---|---|
| 1–6 | type / brand / model / sprite / image / komfort |
| 7 | `cars_price` (unit) |
| 8 | **condition** (0–1) |
| 9 | **price paid** |
| 10 | spare (`0`) |
| 11 | `is_current_car` flag |

**Depreciation** — VERIFIED (`Step_0.gml:628-654`, daily, only for `mycar[i][11] == 1`):
```gml
if (mycar[i][8] > 0.94)  { editcar(i, 8, mycar[i][8] - 0.0002); }
if (mycar[i][8] <= 0.94) { editcar(i, 8, mycar[i][8] - 0.00027); }
if (mycar[i][8] <= 0.8)  { editcar(i, 8, mycar[i][8] - 0.00015); }
if (mycar[i][8] <= 0.66) { editcar(i, 8, mycar[i][8] - 0.00015); }
if (mycar[i][8] <= 0.4)  { editcar(i, 8, mycar[i][8] - 0.00015); }
```
(sequential `if`s — a car at 0.3 loses 0.0006/day). At ≤ 0.2 the car is destroyed
(`Alarm_1.gml:132-139`, notification `txt(924)`).

**Forced sale during bankruptcy** — `Step_0.gml:2419-2436`:
```gml
var prpr = realfix(prodanocar[9]) * realfix(prodanocar[8]) * random_range(0.4, 0.7);
change_char_procent_and_chislo(-0.03, -1, 1);
money_add(iz, 1535);
```
= **paid price × current condition × 40–70 %**, −3 % `char[0]`, −1 `char[2]`.

**Voluntary sale** — `gml_GlobalScript_cars_movein.gml:31-45`: `money_add(o_carone.price, 1535)`
(100 % of market value).

**Repairs** — `cars_movein.gml:47-101`: `money_delete(global.repaircost, 1543)` restores
condition by `nestacha * random_range(...)` clamped to 0.01–0.98, with success probability
scaled by the current condition.

### 5.7 Art

- `global.art_price = 1000000` at creation (`Create_0.gml:577`).
- Acquisition (`gml_GlobalScript_sdelka1.gml:149-155`): only if `global.art == 0`
  ```gml
  global.art_price = min(10000000, global.money * random_range(0.2, 0.4));
  create_question(txt(1927), txt(1928), sd_art);
  ```
- Buy (`sdelka1.gml:175-181`): `global.art = 1; money_delete(global.art_price, 1934); change_char(irandom_range(3,4), 1);`
  — **art is a permanent +3/+4 happiness item**.
- Sell (`sdelka1.gml:183-188`): `money_add(global.art_price, 1934); global.art = 0;`
- Decline (`sdelka1.gml:190-194`): `global.art_price = global.art_price * random_range(0.8, 1.5);`
  — the asking price **ratchets** on each refusal.
- While owned, daily chance `irandom(10) == 1` of +1 `char[1]` if `char[1] < 30`
  (`Step_0.gml:2869-2878`).
- **Art contributes nothing to `global.fortune`.** *(VERIFIED — no `art_price` read in
  `Alarm_1.gml`.)*
- Reference save: `art = 1`, `art_price = 10 000 000` (the cap).

---

## 6. Charity, temple, yakuza, insider trading

### 6.1 Charity — VERIFIED (`gml_GlobalScript_add_charity.gml:1-75`)

UI: `minsum_charity = max(20000, floor(global.money / 1000000) * 10000)`,
`maxsum_charity = floor(global.money / 10000) * 10000` (`Step_1.gml:43-44`).
Requires `global.money > 20000` (`Draw_0.gml:1554`).

```gml
function add_charity(arg0)
{
    var old_level = charity_level();
    global.charity += arg0;
    ...
    var raznica = new_level - old_level;
    var raznica2 = round(raznica / 3);
    if (raznica > 0)
    {
        for (var i = 0; i < raznica; i++) { add_5 += max(1, round(new_level * 0.2)); }
        for (var i = 0; i < raznica2; i++)
        { if ((old_level + i + 1) > 2) { add_0 += max(1, round(new_level * 0.01)); } }
        if (add_0 > 0)
        {
            change_char_procent_and_chislo(0, add_0, 0);                       // reputation
            if (check_level_rep(5) >= 2) { global.stress -= (round(add_0 + raznica) * 4); }
        }
        change_char(raznica, 5);                                               // 'kind heart'
        if (check_level_rep(5) >= 1) { global.happy += (round(raznica) * 4); }
    }
    money_delete(arg0, 1531);
}

function charity_level()
{
    var base_requirement = 50000;
    var level_multiplier = 2;
    var level = 0;
    while (global.charity >= base_requirement)
    {
        level++;
        var oldbase = base_requirement;
        base_requirement *= level_multiplier;
        base_requirement = round(base_requirement * 0.0001) * 10000;
        level_multiplier = clamp(relerp(0, 20, level, 2, 1.2), 1.2, 2);
    }
    return level;
}
```
Starting threshold 50 000, ×2 with the multiplier lerping 2→1.2 over levels 0→20, snapped to
10 000. Every donation also buys a **cooldown**: `global.donate_last_day = irandom_range(5, 10)`
with immediate stress/happiness relief at `check_level_rep(5) ≥ 1/2` (lines 6–17).
Charity is **NOT** capped and is not refunded by the level system — the levels only give stats.

### 6.2 Temple donation — VERIFIED (`gml_GlobalScript_add_temple_donate.gml:1-89`)

Fixed denominations `donate500()` / `donate5000()`.
```gml
function temple_donate_level()
{
    var base_requirement = 2500;
    var level_multiplier = 2;
    var level = 0;
    while (global.temple_money >= base_requirement)
    {
        level++;
        base_requirement *= level_multiplier;
        base_requirement = round(base_requirement * 0.01) * 100;   // snapped to 100
        level_multiplier = clamp(relerp(0, 20, level, 2, 1.2), 1.2, 2);
    }
    return level;
}
```
Per level gained (only from `old_level + i > 1`): `+max(1, round(new_level * 0.04))` to
`char[2]`; per `round(raznica/3)` levels (only from `old_level + i + 1 > 2`):
`+max(1, round(new_level * 0.015))` to `char[0]` — but that `add_0` is **computed and never
applied** in this function (VERIFIED bug, unlike charity which does apply it).
Immediate relief: `char[2] ≥ 1` → `happy += 5/15`, `stress -= 5/15`.
Reference save: `temple_money = 66 000` ⇒ level ≈ 4–5.

### 6.3 Yakuza financing — VERIFIED

* Bankruptcy bailout: `yakuza_money_yes()` (`gml_GlobalScript_yakuza_money_yes.gml:1-7`)
  ```gml
  global.yakuza_rep += 1;
  money_add(irandom_range(8, 30) * 100000, 1275);
  change_char_procent_and_chislo(-0.03, -1, 2);
  ```
  0.8–3 M, taxed, −3 % `char[0]`, −1 `char[2]`. Only offered while `global.yakuza_rep > 0`
  and `yakuza_days < 0`, and only **once** (`Step_0.gml:2399-2404`).
* Extortion (`yakuzayes.gml:1-28`) with ransom `global.vykup`:
  if `global.money < vykup * 0.9` then 50 % `global.dolg += global.vykup` (added directly,
  *not* via `money_delete`, and *not* logged to `global.logs`) else 50 % `global.totalbankrupt = 1`.

### 6.4 Market manipulation (FSA) — VERIFIED (`gml_GlobalScript_porushennya.gml:1-40`)

Only when `global.diff_fsa == 1`. Called from `o_birza_Other_10.gml:174` on detected
front-running (`|Δshares| > 25 % of your position in that company`).
```gml
global.fca_points += irandom_range(12, 38);
if (arg0 > irandom_range(70, 150))     { global.fca_points += 10; }
if (arg0 > irandom_range(155, 277))    { global.fca_points += 10; }
if (arg0 > irandom_range(300, 555))    { global.fca_points += 10; }
if (arg0 > irandom_range(666, 1555))   { global.fca_points += 10; }
if (arg0 > irandom_range(1333, 2555))  { global.fca_points += 10; }
if (arg0 > irandom_range(3000, 5555))  { global.fca_points += 10; }
if (arg0 > irandom_range(7777, 77777)) { global.fca_points += 10; }
```
Penalties (`Step_0.gml:2977-3007`, daily, `holyday == 0`): `fca_points -= irandom_range(1, 0)`
(= always 1 — VERIFIED quirk); trigger at `irandom(40) < (fca_points - 2)` → first offence a
warning (`char[2] -= 1`, `char[0] -= 1`), later offences a trial
(`global.sud_diff = fca_points * 2.5`, trade ban 15–25 days).

---

## 7. Investments (angel / project investments)

### 7.1 Two generations of the same system

* **Old**: `invest()` (`gml_GlobalScript_invest.gml:1-38`) stores a 7-element array in slot 0
  only; `global.invest_days = irandom_range(60, 170)` (×0.7 at `check_level_rep(6) >= 5`).
  Unlocked at `gameday > 6444` (≈17.6 in-game years) with money > 10 M and stats thresholds
  (`Step_0.gml:2624-2643`). `loadgame.gml:355-364` reconstructs this layout from old saves.
* **New (live)**: `investments_generate()` / `investments.invest_project()` — 6 slots
  (`global.invest_slots[0..5]`, `invest_center = 1` unlocks 3 at `Step_0.gml:608-610`),
  monthly regeneration, plus "hired contacts" upgrades.

### 7.2 Project generation — VERIFIED (`gml_GlobalScript_investments.gml:1-80`)

Called monthly with `arg0 = max(3, round(global.char[6] / 5))` opportunities.

```gml
global.investment_size[i] = choose(0, 1, 2, 0, 1);
if (check_level_rep(6) >= 4) { global.investment_size[i] = choose(0, 1, 2, 3, 4); }
...
global.investment_info[i][2] = irandom_range(40, 70);            // success %  (== "luck")
if (check_level_rep(6) >= 2) { global.investment_info[i][2] += 10; }
global.investment_info[i][2] = round(global.investment_info[i][2] / max(0.9, (global.investment_size[i] + 1) * 0.4));
if (global.investment_info[i][0] == 342 || global.investment_info[i][0] == 339)
{ global.investment_info[i][2] = irandom_range(5, 20); }
global.investment_info[i][5] = irandom_range(65, 150);           // duration (days)
```

Amounts and payoff by size tier:

| size | `[3]` amount | raw multiplier | `[5]` duration | `[4]` profit = `amount × mult × ([5]−34)/70 × (1.1 + char[6]*0.01)` |
|---|---|---|---|---|
| 0 | `irandom_range(10M, 30M)` | `random_range(2, 3)` | 65–150 | |
| 1 | `irandom_range(40M, 70M)` | `random_range(3, 4)` | 90–150 | |
| 2 | `irandom_range(80M, 150M)` | `random_range(3.5, 4.6)` | 111–166 | |
| 3 | `irandom_range(180M, 260M)` | `random_range(4, 5)` | 133–177 | |
| 4 | `irandom_range(280M, 560M)` | `random_range(3.5, 5.8)` | 140–180 | |

Verbatim core (`investments.gml:68-78`):
```gml
profit = (profit * (global.investment_info[i][5] - 34)) / 70;
if (check_level_rep(6) >= 5) { global.investment_info[i][5] = round(global.investment_info[i][5] * 0.7); }
global.investment_info[i][3] = summaa;
if (check_level_rep(6) >= 1) { profit *= (1.1 + (global.char[6] * 0.01)); }
global.investment_info[i][4] = profit;
```
⚠️ **ORDERING BUG (VERIFIED):** the `[5] * 0.7` speed bonus is applied **after** `profit` has
already been computed from the un-reduced `[5]`, so at `check_level_rep(6) >= 5` the duration
shortens but the payout does not increase.

Project names/fields are drawn from `get_random_project(sector, size)` /
`get_invest_field(id)` — sector 0–7, size 0–4, mapped to ~200 localization IDs
(`gml_GlobalScript_get_invest_field.gml:180-370`).

### 7.3 Buying — VERIFIED (`gml_GlobalScript_investments.gml:216-226`)

```gml
function invest_project()
{
    with (o_control) { vybr = 13; }
    amy_yes();
    global.investment_buyed[global.invest_project_now] = 1;
    money_delete(global.investment_info[global.invest_project_now][3], 3811);
    global.invest[global.pressed_invest_slot] = [ projectID, companyName, profit, duration, luckPct,
        invest_rez_calc(luckPct), backingCompanyIdx, sector, generate_invest_friends(),
        random_range(0.05, 0.4), [0, 0] ];
}
```
`global.mecenats += 1` in the legacy path. Guard: `if (global.money >= price)` in the click
handler (`investments.gml:150`).

### 7.4 Outcome roll `invest_rez_calc` — VERIFIED (`gml_GlobalScript_invest.gml:40-77`)

```gml
function invest_rez_calc(arg0)
{
    var udd = irandom(99);
    var udacha = 0;
    if (udd < arg0)
    {
        udacha = choose(2, 2, 3, 3, 2);
        if (check_level_rep(6) >= 2) { udacha = choose(2, 2, 3, 3, 2, 3); }
        if (arg0 > 90)
        {
            udacha = choose(3, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 3);
            if (check_level_rep(6) >= 2) { udacha = choose(3, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 3, 3, 3); }
        }
    }
    if (udd >= arg0)
    {
        udacha = choose(0, 1, 1, 0, 1);
        if (check_level_rep(6) >= 2) { udacha = choose(0, 1, 1, 0, 1, 1); }
        if (arg0 < 10)
        {
            udacha = choose(0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0);
            if (check_level_rep(6) >= 2) { udacha = choose(1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1); }
        }
    }
    return udacha;
}
```
⚠️ **VERIFIED BUG:** the two `if`s are **not** `if/else`, and `udd` is in `[0,99]` while
`arg0` (luck %) is in `[~20, 105]`. For `arg0 > 99` *both* branches execute and the failure
branch overwrites the success roll. Result distribution is therefore not the intended
"P(success) = luck %". **Reproduce the bug or reimplement deliberately — this materially
changes investment EV.**

### 7.5 Payout — VERIFIED (`gml_Object_o_control_Step_0.gml:1573-1731`, daily)

Countdown: `global.invest[i][3] -= 1;` (`Step_0.gml:700`). Settlement when it hits 0:

| `udacha` | payout | side effects |
|---|---|---|
| 0 | **nothing** (`txt(355)`) | `field_hype -= 1.04*vplyv`; backing co: `hype -= 0.7*vplyv`, `hype_effect = -6 - round(6*vplyv)`, `profit -= 0.5*vplyv`, `profit_effect = -1 - round(3*vplyv)`; `change_char(-1, 6)` |
| 1 | `global.invest_profit * random_range(0.3, 0.8)` | `field_hype -= 0.7*vplyv`; co `hype -= 0.4*vplyv`, `profit -= 0.4*vplyv` |
| 2 | `global.invest_profit` | `field_hype += 0.7*vplyv`; co `hype += 0.5*vplyv`, `profit += 0.5*vplyv`; `change_char(1, 6)`; optional rep buff |
| 3 | `profit * random_range(7,12)` with p=1/10 else `profit * random_range(1.4, 6)` | `field_hype += 1.1*vplyv`; co `hype += 0.7/0.78*vplyv`, `profit += 0.7/0.78*vplyv`; `change_char(2, 6)` |

Payout uses `money_add(dengii, 1557)` ⇒ **taxed as income**.
`vplyv = global.invest[i][9] ∈ [0.05, 0.4]` scales all hype/profit spillover.

**Early wipeout**: if the backing company is liquidated while you hold the investment
(`global.company_liq[nomer_comp] == 1`, `Step_0.gml:1585-1599`) the slot is cleared with
`txt(354)/txt(355)` and **zero payout** — the entire principal is lost.

### 7.6 Hiring contacts (upgrades) — VERIFIED

Price (`gml_Object_o_control_Draw_0.gml:3459`):
```gml
_price = abs((global.invest[global.pressed_invest_slot][2] * ((rare + 0.5) / 2) * 0.33 * (50 + global.invest[global.pressed_invest_slot][4])) / 95);
```
where `rare = round(contact[9]) ∈ [0,3]` — so price scales with the deal size, contact
rarity and the luck %.

Effect (`gml_GlobalScript_investments.gml:228-269`):
```gml
money_delete(global.invest__price, 1532);
if (humans[1] != 0) { global.invest[..][4] += (humans[1] * irandom_range(7, 9)); }             // luck % ±7..9
if (humans[2] != 0) { // duration: multiply if +, divide by |.| if -
    global.invest[..][3] *= (humans[2] * (1 + random_range(0.14, 0.17)));   // humans[2] > 0
    global.invest[..][3] /= abs(humans[2] * (1 + random_range(0.14, 0.17))); // humans[2] < 0
    global.invest[..][3] = round(global.invest[..][3]); }
if (humans[3] != 0) { // profit: same pattern
    global.invest[..][2] *= (humans[3] * (1 + random_range(0.14, 0.17)));
    global.invest[..][2] /= abs(humans[3] / (1 - random_range(0.14, 0.17)));
    global.invest[..][2] = round(global.invest[..][2]); }
if (humans[4] != 0) { global.invest[..][9] += (humans[4] * random_range(0.26, 0.38)); }          // hype spillover
if (humans[6] != 0) { global.invest[..][10] = [humans[5], humans[6]]; }                          // rep buff
global.invest[..][8] = [];
```
Bonuses by NPC `human_type` 0–7 — `gml_GlobalScript_generate_invest_friends.gml:20-98`
(e.g. type 0 can roll `sabotage = 1, bonus_shans = -3, bonus_hype = 3, bonus_days = -1`;
type 3 gives `bonus_hype = 1+rare, bonus_profit = 1+rare, bonus_days = 1 + round(rare/2.05)`).
⚠️ **VERIFIED BUG** at `generate_invest_friends.gml:28`: `clamp(round((global.human_friend[i] / 33) + irandom_range(-1, 1)), 0, 3)`
indexes by loop counter `i`, not by `friends[i]`.

### 7.7 Legacy special project "Future Tech" — VERIFIED (`Step_0.gml:2624-2643`)

Unlocks at `gameday > 6444`, money > 10 M, `char[1] > 13`, `char[6] > 12`, `char[3] > 20`:
```gml
summaa = round(min(global.money * random_range(0.5, 0.7), 500000000));
profit = summaa * random_range(7, 11);
if (check_level_rep(6) >= 1) { profit *= (1.1 + (global.char[6] * 0.01)); }
shans_invest = 100;
```
→ **guaranteed 100 % success** (`invest_rez_calc(100)` → `udd < 100` is always true, and since
`udd ∈ [0,99]` the failure branch `udd >= 100` never fires). 7–11× return, capped at 500 M.

---

## 8. Bankruptcy & negative money

### 8.1 Negative balance decay — VERIFIED (`Step_0.gml:2747-2757`, daily)

```gml
if (global.money < 0)
{
    if (global.turma == 0)
    {
        global.money = global.money * 1.01;
    }
    else
    {
        global.money = global.money * 1.0001;
    }
}
```
**−1 % of the deficit per day** (0.01 %/day while imprisoned). This runs *before* the monthly
billing in the same daily block, so the bill is applied to the already-shrunk balance.

This is a *soft* spiral: −1 000 000 → −990 000 → −980 100 … → needs ~460 days to reach −10 000.

### 8.2 Day counter — VERIFIED (`Step_0.gml:2360-2371`)

```gml
if (global.money < 0 && global.turma == 0 && global.hospital == 0 && global.otpuskdays <= 0)
{
    daybomj += 1;
}
else
{
    daybomj = 0;
}
```

### 8.3 Asset-liquidation cascade — VERIFIED (`Step_0.gml:2396-2486`)

Trigger:
```gml
if ((global.money < -50000 && global.totalbankrupt == 0 && daybomj > 6) || daybomj > 12)
```
i.e. **6 days below −50 000, or 12 days below zero at all** (the second condition ignores the
−50 000 threshold).

Each triggered day, if the player owns anything:

```gml
sobytive = 0;
if (global.yakuza_rep > 0 && yakuza_days < 0) { yakuza_days = irandom_range(30,60);
    create_question2(txt(74), txt(1077), yakuza_money_yes, yakuza_money_no); exit; }
if (owns anything)
{
    if (ds_list_size(global.houses) > 0) { sobytive = 2; }
    if (any company_ac[i] > 0)           { sobytive = 3; }   // overrides
    if (ds_list_size(global.cars) > 0)   { sobytive = 1; }   // overrides
```
⇒ **effective priority: cars → stocks → houses** (last assignment wins; cars beat everything
because their check is last).

* **Cars** (`:2419-2436`): random car; `paid × condition × random_range(0.4, 0.7)`;
  `change_char_procent_and_chislo(-0.03, -1, 1)`.
* **Stocks** (`:2442-2477`): first company with `company_ac > 0`;
  ```gml
  var price_actt = (global.company_stockprice[izymaem] / global.company_number_a[izymaem]) * random_range(0.65, 0.9);
  var dolgii = abs(global.money);
  skokanada = dolgii / price_actt;
  skokanada = round(skokanada * 1.5);
  if (round(global.company_ac[izymaem]) < skokanada) { skokanada = round(global.company_ac[izymaem]);
      create_notification(txt(64), txt(67)); }
  else { create_notification(txt(64), txt(1472)); }
  global.company_dohod[izymaem] += iz;
  change_char_procent_and_chislo(-0.05, -1, 1);
  money_add(iz);
  add_log(iz, 1534, i, string_thousands(price_actt));
  ```
  ⇒ **sell 1.5× the deficit's worth of shares at a 10–35 % fire-sale discount**, then
  `global.company_ac[izymaem] -= skokanada`.
* **Houses** (`:2437-2440` → `Script391.gml:22-40`): random house,
  `round(price * global.price_building) * random_range(0.5, 0.8)`, `change_char_procent_and_chislo(-0.06, -1, 1)`.

If the player owns **nothing**:
```gml
music_start(MusMus_BGM_CP02);
create_notification(txt(64), txt(68));
change_char_procent_and_chislo(-0.4, -1, 1);
global.totalbankrupt = 1;
```
`global.totalbankrupt = 1` is the **game-over flag**: it halts the whole Step event
(`Step_0.gml:52`), blocks the bank (`Step_2.gml:37, 376`), and shows a different screen
(`Draw_73.gml:228-235`). The save's `totalbankrupt` stays `0` in the reference dump.

### 8.4 Bankruptcy warning — VERIFIED (`Step_0.gml:5554-5566`, per-frame)

```gml
if (global.money < 0)
{
    if (bankrupt == 0)
    {
        create_notification(txt(64), txt(150));
        change_char_procent_and_chislo(-0.01, -1, 1);
        bankrupt = 1;
    }
}
else { bankrupt = 0; }
```
A one-shot −1 % reputation hit the first frame you go negative.

### 8.5 Player-company bankruptcy — VERIFIED (`gml_GlobalScript_make_playercompany_bankrupt.gml`)

Not personal bankruptcy; triggered by >6 accounting scandals:
```gml
human_work_add(0, 133, 0);
global.company_vsovete[global.player_compnumber] = 1;
global.player_compnumber = -1;
global.rnd_in_process = 0;
change_char_procent_and_chislo(-0.1, -2, 1);
change_char_procent_and_chislo(-0.02, -1, 0);
change_char_procent_and_chislo(-0.04, -1, 3);
```

### 8.6 Bankruptcy of NPCs — VERIFIED (`Step_0.gml:1156-1190`)

`global.company_predupr_bankrupt[i]` climbs daily and resets to `0` on rescue:
```gml
global.company_predupr_bankrupt[i] += 1;
...
if (irandom(32) < (global.company_predupr_bankrupt[i] - 7)) { ... delete_company(global.bankrupt_dali); ... }
if (global.company_predupr_bankrupt[i] > 0) { global.company_predupr_bankrupt[i] -= 2; }
if (global.company_predupr_bankrupt[i] < 0) { global.company_predupr_bankrupt[i] = 0; }
```
Rescues are offered for 25 % / 30 % of new shares (`:1132-1135`, `:1118`).

---

## 9. Stock-sale tax split (for completeness — touches the money ledger)

`gml_GlobalScript_figa.gml:1-46` computes a pending order, `o_birza_Other_10.gml:100-149`
settles it. This is mostly the market subsystem, but the *money split* is economy:

```gml
// vkladka == 0 (cash)
if (comp_ac_buy[i] < 0) {
    comp_pribil[i] = -(round(global.company_stockprice[i] / max(1, global.company_number_a[i])) * comp_ac_buy[i]) * global.kommisia;
    money_pribil += comp_pribil[i];
    money_pribil2 += (-((round(global.company_stockprice[i]) / max(1, global.company_number_a[i])) - global.company_ac_average[i]) * comp_ac_buy[i]);
}
if (comp_ac_buy[i] > 0) {
    comp_trata[i] = round(global.company_stockprice[i] / max(1, global.company_number_a[i])) * comp_ac_buy[i];
    money_trata += comp_trata[i];
}
// vkladka == 1 (margin)
balance = money_pribil - money_trata;                              // cash
balance = money_pribil - (money_trata * (2 - global.short_procent)); // margin
```
Settlement (`o_birza_Other_10.gml:126-135`):
```gml
money_add(max(0, money_pribil2));        // taxable portion → enters global.dohod
global.money += (money_pribil - money_pribil2);   // rest → raw, untaxed
money_delete(money_trata);
// margin branch:
money_delete(money_pribil);
money_add(money_trata * 0.05);
global.money += (money_trata - (money_trata * 0.05));
global.short_dolg = max(0, shortall);
```
So **only `max(0, money_pribil2)` is taxable**, where `money_pribil2` is the (price − average
purchase price) × quantity term. Commission is `global.kommisia = random_range(0.96, 0.99)`,
re-rolled **daily** (`Step_0.gml:715`), and forced to `0.99` at `check_level_rep(4) >= 5`
(`o_birza_Create_0.gml:66-70`, which also pins `short_procent = 0.99`).
`global.company_ac_average[i]` = `company_rashod[i] / company_ac_bought_number[i]`
(`average_ac_price.gml`), i.e. true average cost.

---

## 10. Starting state & difficulty

**Starting cash** — VERIFIED (`gml_Object_o_pc_menu_Create_0.gml:123-126`, `gml_Object_o_pc_menu_Step_2.gml:4-5`):
```gml
start_money[0] = 250000;
start_money[1] = 500000;
start_money[2] = 750000;
start_money[3] = 1000000;
global.money = start_money[level_diff[4]];
global.start_money = start_money[level_diff[4]];
```
Reference save: `start_money = 750000` (tier 2).

**Difficulty mapping** (`gml_Object_o_pc_menu_Step_2.gml:1-42`):
```gml
global.diff_fsa          = level_diff[7];
global.diff_limits       = level_diff[6];
global.diff_divident     = level_diff[1];
global.diff_limit_stonks = level_diff[8] - 1;
global.mode              = level_diff[9];
global.noluck            = level_diff[10];
// level_diff[2] → global.diff_profit ∈ {0.06, 0.12, 0.25}
// level_diff[3] → global.diff_stress  ∈ {2, 1, 0, -1}
```
`global.diff_profit` is the *initial* `company_profit` percent for new companies
(`generate_company.gml:63`, `Create_0.gml:713`). Reference save: `diff_profit = 0.12`.

**Other initial values** (all `gml_Object_o_control_Create_0.gml` unless noted):

| var | value | line |
|---|---|---|
| `global.dolg` | 0 | 487 |
| `global.bankprocent` | `random_range(0.05, 0.1)` | 495 |
| `global.bankprocentvzyal` | 0.03 | 502 |
| `global.bonus_bak_credit` | 1 | 67 |
| `global.nalog` | `random_range(0.04, 0.15)` | 814 |
| `global.kommisia` | `random_range(0.96, 0.99)` | 516 |
| `global.deposit` / `depositdays` / `depositprocent` | 0 / 0 / 0.2 | 440–444 |
| `global.dolgdruga` | 0 | 446 |
| `global.short_procent` | (set monthly) | — |
| `global.price_building` | `irandom_range(466000, 633000)` | 874 |
| `global.price_cars` | `irandom_range(2660000, 3330000)` | 875 |
| `global.art_price` / `global.art` | 1 000 000 / 0 | 577–578 |
| `global.dom_orenda_stavka` | 7777 | 161 |
| `global.trata` / `rashod` / `dohod` | 0 | 493, 812–813 |
| `global.happy` / `cozy` / `stress` / `daily` | 50 / 30 / 0 / 40 | 478–481 |
| `global.invest_slots` | `[1,0,0,0,0,0,0,0]` | 61 |
| `global.invest_days` | −1 | 805 |
| `global.invest_profit` / `invest_days` (legacy, `o_cursor`) | 500000 / 22 | 174–175 |
| `myday` | 1 | 162 |
| `procent_deposit_0/1/2` | 1.1 / 1.2 / 1.3 | 461–463 |
| `nalogestate`, `daybomj`, `housemoney`, `dlg`, `daydolg` | 0 | 857, 850, 884, 471, 456 |
| `global.housethismonth` | 15 (→21/24/30/36/45 by `check_level_rep(7)`) | `Alarm_1.gml:35-55` |

Starter house (`Create_0.gml:879-880`): type 0, class 0, 1 room, size 8–9, sprite `spraparto`,
comfort 8–9, `building_price = irandom_range(8,9) * price_building`, paid price 0,
`com = 1`, sector 0, `koef = 0.5`.

---

## 11. Constants table

### 11.1 Global constants

| Constant | Value | Source |
|---|---|---|
| starting cash tiers | 250 000 / 500 000 / 750 000 / 1 000 000 | `o_pc_menu_Create_0.gml:123-126` |
| `kurs` init | `random_range(180, 222)` | `Create_0.gml:87` |
| `kurs` daily drift | `random_range(-1, 1)` | `Step_0.gml:1037` |
| `kurs` FX shock | `÷ random_range(1.08,1.23)` or `× random_range(1.08,1.24)`, 50/50 | `Step_0.gml:4816,4821` |
| `kurs` crash floor | `irandom_range(88, 111)` | `Step_0.gml:4826` |
| `bankprocent` base | `random_range(0.04, 0.12)` monthly | `Step_0.gml:2787` |
| `bankprocent` 1986–92 | `random_range(0.03, 0.06)` | `Step_0.gml:2804` |
| `bankprocent` 1993–97 | `random_range(0.02, 0.1)` | `Step_0.gml:2808` |
| `bankprocent` ≥1999 | `random_range(0.07, 0.13)` | `Step_0.gml:2812` |
| `bankprocent` init | `random_range(0.05, 0.1)` | `Create_0.gml:495` |
| `bankprocentvzyal` init / trait debt | 0.03 | `Create_0.gml:502`, `gostart.gml:18` |
| loan payment rate | `8 %` of balance+interest, clamped | `dolg_get.gml:10-38` |
| loan payment thresholds | 30 000 / 888 888 / 1 888 888 / 2 888 888 / 3 888 888 / 5 888 888 / 8 888 888 / 18 888 888 | `dolg_get.gml` |
| loan payment brackets | (30k,50k) (50k,80k) (50k,125k) (100k,185k) (100k,255k) (100k,300k) (100k,400k) (100k,800k) | `dolg_get.gml` |
| `nalog` init | `random_range(0.04, 0.15)` | `Create_0.gml:814` |
| `nalog` event | `random_range(0.02, 0.15)` | `Step_0.gml:3609` |
| property tax | `paid_price × 0.00083333333` per building, per month | `Alarm_1.gml:170` |
| margin interest | `0.13 / 360` per day | `Step_0.gml:691` |
| `short_procent` | `random_range(0.97, 0.995)` monthly | `Step_0.gml:2785` |
| margin multiplier | `2 − short_procent` ⇒ 1.005–1.03 | `figa.gml:44` |
| `kommisia` | `random_range(0.96, 0.99)` daily (0.99 at `check_level_rep(4) ≥ 5`) | `Step_0.gml:715`, `o_birza_Create_0.gml:68` |
| `dom_orenda_stavka` | 7777 | `Create_0.gml:161` |
| rent divisor | `÷ 30` (after rounding the basis to the nearest 1000) | `Step_0.gml:658` |
| house value factor | `× price_building × 0.94` | `o_buildone_Alarm_0.gml:2` |
| forced house sale | `× random_range(0.5, 0.8)` | `Script391.gml:33` |
| forced car sale | `paid × cond × random_range(0.4, 0.7)` | `Step_0.gml:2426` |
| forced stock sale | `× random_range(0.65, 0.9)`, 1.5× deficit, capped | `Step_0.gml:2453-2456` |
| car insurance entry | 50 000 | `Draw_0.gml:1537` |
| car insurance monthly | `round(Σ paid car prices × 0.003) × strah_bonus` | `Alarm_1.gml:129`, `Step_0.gml:2841` |
| deposit min | 200 000 | `Step_2.gml:350` |
| deposit terms | 182 / 365 / 730 days | `Draw_0.gml:1646,1654,1662` |
| deposit stepper | 5 % / 9 % / 15 % at finance level 0 | `Create_0.gml:150` |
| charity min / max | `max(20000, floor(money/1e6)*10000)` / `floor(money/10000)*10000` | `Step_1.gml:43-44` |
| charity level base / mult | 50 000 / ×2 (2→1.2 over 20 lvls), snapped to 10 000 | `add_charity.gml:58-68` |
| temple level base / mult | 2 500 / ×2 (2→1.2 over 20 lvls), snapped to 100 | `add_temple_donate.gml:36-47` |
| temple denominations | 500 / 5 000 | `add_temple_donate.gml:59,77` |
| negative-money decay | `× 1.01` /day (×`1.0001` in prison) | `Step_0.gml:2751,2755` |
| bankruptcy grace | 6 days < −50 000, or 12 days < 0 | `Step_0.gml:2396` |
| part-time pay | `irandom_range(50,150)*100` (or `200..333)*100` via friend) for 4–12 (or 10–16) Mon–Wed | `zvonokpodrabotka.gml` |
| daily living cost | `daily × 30 × max(1, koef_house*0.5 − 4.7) × random_range(0.8,1.2)` (+10 000 if homeless) | `Step_0.gml:2269` |
| `housethismonth` listings | 15 / 21 / 24 / 30 / 36 / 45 | `Alarm_1.gml:35-55` |
| friend loan size | `round(money × random_range(0.03, 0.3))`, repaid at `× random_range(1.15, 2.5)` | `o_bar_Step_0.gml:411`, `Step_0.gml:2519` |
| yakuza bailout | `irandom_range(8,30) × 100 000` | `yakuza_money_yes.gml:4` |
| board dividend (seat 1) | `max(500000, round(company_price/50000000)*10000)` | `Step_0.gml:3063` |
| board dividend (seat 2) | `max(1000000, round(company_price/25000000)*10000)` | `Step_0.gml:3072` |

### 11.2 Finance-skill tables

| level (`char[1]`) | max loan (`fin_money`) | rate/insurance multiplier (`fin_credit`) | deposit % (182/365/730 d) |
|---|---|---|---|
| 0 (char < 5) | 1 000 000 | 1.0 | 4 / 7 / 10 |
| 1 (≥5) | 10 000 000 | 0.9 | 5 / 9 / 12 |
| 2 (≥10) | 35 000 000 | 0.8 | 6 / 10 / 13 |
| 3 (≥20) | 100 000 000 | 0.7 | 7 / 12 / 15 |
| 4 (≥35) | 300 000 000 | 0.6 | 8 / 14 / 18 |
| 5 (≥50) | 1 000 000 000 | 0.5 | 10 / 15 / 20 |

### 11.3 Investment tiers

| size | amount | raw mult | duration days | success % base |
|---|---|---|---|---|
| 0 | 10–30 M | 2–3 | 65–150 | `round((40..70[+10]) / max(0.9, 0.4))` |
| 1 | 40–70 M | 3–4 | 90–150 | `… / 0.8` |
| 2 | 80–150 M | 3.5–4.6 | 111–166 | `… / 1.2` |
| 3 | 180–260 M | 4–5 | 133–177 | `… / 1.6` |
| 4 | 280–560 M | 3.5–5.8 | 140–180 | `… / 2.0` |

`profit = amount × mult × (duration − 34)/70 × (1.1 + char[6]×0.01)`;
`duration × 0.7` and no profit bonus at `check_level_rep(6) ≥ 5` (ordering bug, §7.2).

### 11.4 Achievement thresholds referenced by the economy

`gml_GlobalScript_achivka.gml:194, 218, 226, 242` (indices into `global.listachiv`,
`gml_Object_o_cursor_Create_0.gml:137`):

| ach id | index | name | thresholds | reward char |
|---|---|---|---|---|
| 3 | 3 | `dohod` | `[1000000, 10000000, 100000000]` (monthly `dohod − rashod`) | char[4] |
| 6 | 6 | `million` | `[5000000, 50000000, 500000000]` on `money − dolg` (+`start_money`) | char[1] |
| 7 | 7 | `megamoney` | `[50000000, 500000000, 5000000000]` on `fortune` (+`start_money`) | char[1] |
| 8 | 8 | `dolgi` | `[1]` — full loan payoff or `all_dolg == 1` | char[1] |
| 9 | 9 | `stonks` | `[1000000, 10000000, 100000000]` (one-off dividend payout) | char[0] |
| 5 | 5 | `sdelka` | `[1, 5, 15]` deals | char[3] |
| 58 | 58 | `real_estate_income` | monthly rent | — |
| 46 | 46 | `kind_heart` | lifetime `global.charity` | — |

---

## 12. Open questions / unverified

1. ~~**Localization strings.** `txt(<id>)` IDs could not be resolved.~~ **RESOLVED — the string
   table IS recoverable, from a different source.** It is not in the GMS string table
   (`strings_all.txt` holds *variable names*); it lives in an external tab-separated CSV shipped
   beside the executable:

   ```
   D:\Games\STONKS-9800 Stock Market Simulator\stonks.csv
   ```

   4,289 rows × 5 columns: `id \t English \t Українська \t 日本語 \t 한국어`. `txt(N)` indexes
   column 2 by column 0's integer id (row 0 is the header marker `w`). A full English dump is at
   `D:\stonks-re\localization\stonks_english.txt`. A second, more complete community table —
   `stonksptbrcompleto.csv`, 4,306 rows × 8 cols, Portuguese — is also present.

   Resolved log codes for this subsystem:

   | code | meaning | code | meaning |
   |---|---|---|---|
   | 25 | Income tax | 1528 | Purchase of data |
   | 290 | Insurance | 1529 | Paying off a debt |
   | 669 | Rental income | 1530 | Money on loan |
   | 670 | Real estate tax | 1531 | Charity |
   | 1394 | Salary of member of the Board of Directors | 1532 | Investment |
   | 1395 | Salary of CEO | 1541 | Borrowed assets |
   | 1534 | Shares of \<arg0\> each | 1543 | Car maintenance |
   | 1535 | Selling a car | 1544 | Purchase of real estate |
   | 1554 | Gift | 1548 | Daily expenses |
   | 1556 | Part-time job | 1562 | Sale of real estate |
   | 1557 | Profit from investment | 1563 | Shares of \<arg0\> each (short) |
   | 1559 | Debt repayment | 3811 | Investment |
   | 1934 | Artifact | 3880 | USD to JPY exchange rate |

   Note `txt(3880)` confirms `global.kurs` is quoted as **JPY per USD**. Also note code 1532
   ("Investment") and 3811 ("Investment") are duplicates used on different paths, and 1562 is
   reused for real-estate sales on both the income and log side.

   **Two structural claims in this document were independently re-verified against source:**
   - `newday` really is a one-frame gate: `o_control_Step_0.gml:84` clears it, `:130` sets it,
     `:230` opens `if (newday == 1)`, `:5546` closes with `newday = 0`. Lines 232–5545 therefore
     execute exactly once per in-game day, not per frame.
   - `global.kurs` really has only two non-display consumers: `commodity_price`
     (`commodity_update.gml:35`) and the commercial-property upgrade price
     (`o_buildone_Draw_0.gml:203`). Init `random_range(180, 222)`; daily drift `±1` at
     `Step_0:1037`. It does **not** touch stock prices, real-estate, cars, loans or taxes.
2. **`o_control`'s Step rate.** `full/meta/assets.tsv` and `game_settings.txt` do not carry
   per-object step rates. My structural read of `Step_0` (`newday` reset at line 84 ⇒ daily
   block runs once per day) does **not** depend on this, but `timer > 100` ⇒ 101 frames/day
   assumes the Step runs at the default room rate. `time_speed` 2–5× (`Step_0.gml:56-71`)
   accelerates the clock, which would make everything "per day" faster in wall-clock terms but
   never changes the per-day counts.
3. **`bankprocentvzyal = 0.046977` in the reference save** is not any `bankprocent × fin_credit`
   pair producible by the table in `Create_0.gml:144-149` (the nearest is `0.12 × 0.4`). Either
   the save predates a `fin_credit` revision, or `bonus_bak_credit` was changed by a source
   value not present in this build. **Do not assume `fin_credit` is final.**
4. **`gostart` starting debt + `money_plus`.** `get_traits()` reads `money_plus`/`money_dolg`
   from instance locals that are recomputed per hovered trait
   (`Draw_0.gml:188-194`, `213-218`) and only applied once in `gostart`. I verified the
   assignment sites (`get_traits.gml:44, 93, 100-101, 114, 142, 150, 160`) but did not
   enumerate all 30 traits, so the full starting-money spread is incomplete.
5. **`global.creditsumma` is not serialized** (`o_cursor_Create_0.gml:211`), so a loan in flight
   across a save/load cannot occur; but I could not confirm there is no other path that sets it.
6. **`global.short_dolg` staleness** — confirmed bug, but the intended semantics (clear on
   `shortall == 0`?) are not recoverable from the code.
7. **`all_dolg` / `dooolg` / `nalogestate` ordering.** `nalogestate` is recomputed every day in
   `Alarm_1` and charged on the 1st; `Alarm_1` fires on its own `alarm[1]` cycle
   (`alarm[1] = 4` at `Create_0.gml:870`, re-armed at `s_credit.gml:13`-style calls and
   `alarm[1] = 5` in `buy_car`/`buyhouse`). If the Alarm and the monthly Step ever desynchronise
   by a day, the property tax charged can be one day's accumulation out of date. I did not find
   a hard guarantee of ordering.
8. **Deposit interest is untaxed**, loan principal is untaxed, commodity profits are untaxed.
   These look like oversights rather than design (the notification text for the tax bill,
   `txt(90)`, mentions only income). **INFERRED intent, not verified.**
9. **`invest_rez_calc` double-branch** (§7.4) makes the success probability wrong. Whether to
   reproduce the bug is a design decision for the reimplementation.
10. **`o_market` object** — I found `o_birza`, `o_inventory`, `o_owners`, `o_owners_cars`,
    `o_shop`, `o_buildone`, `o_carone`, but **no `o_market`**. The real-estate/car/investment
    markets are drawn by functions in `gml_GlobalScript_draw_real_estate.gml` /
    `gml_GlobalScript_draw_cars.gml` called from `o_control_Draw`. If the reimplementation spec
    expects an `o_market`, it does not exist in this build.
11. **`generate_house_zakaz.gml`** (direct property purchase requests from sellers, incl. a
    second `building_price × price_building` at line 111) and **`o_birza_Other_10.gml:168-179`**
    (FSA detection) were read only in passing; the full FTO/insider-trading penalty economics
    are out of scope here.
12. **`global.price_koef = round(1000 * global.rynochek * global.trend)`** (daily, `Step_0.gml:258`)
    is a derived index saved as `price_koef = 788`; I could not find a consumer of it in the
    economy subsystem — its use is presumably in the stock-price model.