# 03 — News, Events, Catalysts, Forecasts & Price Impact

**Target:** STONKS-9800 Stock Market Simulator (GameMaker Studio 2, YYG / UndertaleModTool dump)
**Source root:** `D:\stonks-re\full\code\` (3063 `.gml` files)
**Method:** static read of decompiled GML + `stonks.csv` localization table + binary decode of `saveslot_auto.json`

Everything below is tagged **[V] = VERIFIED** (quoted verbatim from decompiled source or decoded from the save
blob) or **[I] = INFERRED** (derived by reasoning over the code; not directly asserted by it).

---

## 0. Headline corrections to the starting hypotheses

| Hypothesis in the brief | Verdict |
|---|---|
| `create_news` is the real news generator | **WRONG.** `create_news(arg0)` = `ds_list_add(global.news, arg0);` and **is never called anywhere in the project.** `global.news` is only created (`o_control_Create_0.gml:453`) and destroyed (`o_control_CleanUp_0.gml:7`). **[V]** |
| `global.news_archive` collects news | **DEAD CODE.** `create_news_entry()` exists but is never called; the only call site inside `create_notification()` has an **empty body**: `if (news > 0) { }`. It is also type-broken (`global.news_archive = []` is an array but `create_news_entry` calls `ds_list_set` on it). **[V]** |
| `[logs]` in the save is "the in-game event/news log" | **WRONG.** It is a **money/transaction ledger.** Record = `[datetime, amount, log_text_id, company_index, extra_string]`. See §7. **[V]** |
| `global.prediction` is the market forecast | **WRONG.** It is a *fortune-cookie omen* (`txt(1034..1049)`) that resolves ~20–30 days later into personal-life events (cash prize / car wreck / house fire / golf / Future-Tech investment). **No market effect.** The real market forecast is `prognozio()` / `prohnoz_company()`. **[V]** |
| `chart_series_data_*` holds 272 floats | **ARITHMETIC ARTIFACT.** Actual: **90 float64 price points** per company (1088-byte blob = 8-byte DS header + 90 × 12-byte `{u32 type=0, double}`). 1088/4 = 272, which is where "272" came from. **[V]** |
| `update_price2(comp, zmina)` is the news→price path | **WRONG for news.** `update_price2` is only ever called from **`o_birza_Other_10.gml`** (3 sites) — the daily *settlement* of player buy/sell/short order flow and share-count change. News never calls it. News mutates `company_hype` / `company_profit` / `company_price` directly and then calls `update_price()` (no multiplier). **[V]** |

The real "news" object in this game is **`create_notification(title_id, body, speaker, ...)`.** There is no
news list, no ticker, and no archive — notifications are pushed onto a queue and consumed by popups.

---

## 1. The delivery pipeline (step-by-step)

```
generator code
   │  create_notification(title_txt_id, body, arg2=human, arg3=msg_type, arg4=callback, arg5=nocross)
   ▼
create_notification()                      gml_GlobalScript_create_notification.gml:6-22
   │  convert_text = scr_text(arg1, 1)     // expands <>/{}/txt(); arg1=1 → suppress colour tags
   │  if (global.otpuskdays <= 0 || arg0 != txt(76))   // vacation silences "News" (id 76) only
   ▼
   │  add_message(arg3,                                // → popup type
   │              scr_text(arg0),                       // → title (also <>-expanded!)
   │              convert_text,                         // → body
   │              arg4, 0, 0, 0, arg2,                  // → action, action2, cancel, buttons, human
   │              undefined, undefined, undefined, arg5);// → input, array_list, nocross, ???
   ▼
add_message()                              gml_GlobalScript_create_question.gml:1-21
   │  ds_list_add(global.window_message, [type, title, text, action, action2, cancel, buttons,
   │                                     human, input_name, array_list, nocross])
   ▼
global.window_message  (ds_list)           o_cursor_Create_0.gml:165
   │  consumed FIFO by o_cursor_Step_2.gml:30-113 → `win.typenow/title/text/...`
   │  type: 0 = plain popup, 1 = question, 2 = question2, 3 = question3, 4 = input, 5 = number
   ▼
popup window (blocks gameplay, `global.stop = 1` while open)
```

There is **exactly one** window on screen at a time (`o_cursor_Step_2.gml:25`: `else if (ds_list_empty(global.window_message))`).
`create_notification` passes `arg11 = 0`, so `add_message` **appends** (never prepends).
**Note [V]:** `create_notification` explicitly passes `undefined` for `add_message`'s `arg10` (`nocross`),
overriding its declared default of `1`. Callers wanting a non-blocking notification pass `arg5 = 1`
(e.g. `gml_GlobalScript_mycompany_step.gml:482`, `gml_GlobalScript_scr_resignscr_resign.gml:3` and `:10`).

**Placeholder expansion — `scr_text()` (`gml_GlobalScript_scr_text.gml:1`)** runs on the body string and does
three substitutions:

1. `<name>` → `variable_instance_get(self, name)`; if the name contains `global` → `variable_global_get(name minus "global.")`.
   Remaining `<`/`>` become `[d#<color4>]` / `[/colour]` unless `arg1 == 1`.
2. `{name}` → same lookup, then `string_thousands(realfix(value))` (number formatting); undefined → `"1"`.
3. `txt(NNN)` → nested localization lookup (recursive).

So the news templates in `stonks.csv` use plain `<varname>` / `{varname}` placeholders, **not** `#{...}`.
E.g. id 227: `"<companynm> fails in its latest project, resulting in large losses."`

**Critical mechanic:** the lookup is `variable_instance_get(self, kusok)` — i.e. the placeholder names are
resolved as **instance variables on the object that is currently running the code** (almost always `o_control`,
because that is where every news generator lives). This is why news code always does
`companynm = global.company_name[komp];` or `scandal = ...` or `companname = ...` or `comomo = ...` or
`sector_name = ...` **immediately before** `create_notification(...)`. The set of legal placeholder names is
therefore: every instance variable of `o_control` (unprefixed) plus every global (prefixed `global.`).
Known news placeholders observed: `companynm`, `companname`, `comomo`, `scandal`, `comp_rumor`, `sector_name`,
`nameofcompany`, `name_of_company`, `procentchange`, `rand_human_name`, `global.*`, plus `{money_for_all}`-style
numeric `{...}` ones (`price_for_all`, `money_receive`, `yenprice`, `global.moneyneed`, `global.numshares`,
`new_stocks`, `size`).

Localization: `txt(id)` → `global.trans[id][global.language+1]`, falls back to `[1]` (English) when empty
(`gml_GlobalScript_txt.gml:1`). Column 1 of `stonks.csv` is English.

---

## 2. The daily tick and how RNG/cooldowns work

Everything market-related runs in **`o_control_Step_0.gml`** (5592 lines). A new day starts when
`timer > 100` (or `startgame2 == 1`) and the room is `RoomMain`/`r_company` (`:112`), and the date is bumped
at `:127`. `time_speed` (1×…5×) scales `timer` (`:56-71`).

**The "shans" accumulator pattern** (the game's universal cooldown mechanism) — a float that grows each day
and is tested against a rolling `irandom()` threshold; on a successful event it is reset to `-1`:

| var | growth | test | reset | file:line |
|---|---|---|---|---|
| `shans` (company news) | `+= random_range(0.3, 1)` | `irandom(round(400/global.numberofcompany)) < shans` | `-1` on each fired news | `:709`, `:4800`, `:4940` … |
| `shans_random_events` (macro) | `+= 1` (mode 1 only) | `(irandom(100) + 150) < shans_random_events \|\| irandom(1000) == 5` | `= 0` | `:835`, `:837` |
| `shans_mycomp` (your company) | `+= random_range(0.3, 1)` if you own a company | `shans_mycomp > irandom_range(20, 100)` | `= 0` | `:4579`, `:4587` |
| `shans_ludi` (staff moves) | `+= random_range(0.3, 2)` | `random(155) < shans_ludi` | `= 0` | `:710`, `:4329`, `:4573` |
| `minishans` (minor life events) | `+= 1` | `irandom(80) < minishans` | `= -1` | `:712`, `:3373`, `:3375` |
| `minishans2` (lottery etc.) | `+= random_range(1.1, 2.7)` | — | — | `:714` |
| `das` (insider tip countdown) | `+= 1` while `global.prognoz >= 0` | `das > irandom_range(7, 18)` | `= 0`, `prognoz = -1` | `:2719`, `:2720`, `:2743` |
| `todaybankrupt_company` | — | gates bankruptcy warnings | `= irandom_range(125, 355)` | `:1173` |
| `company_days_without[i]` | `= irandom_range(150,333)/(150,500)/(155,455)` | `company_days_without[i] <= 0` | — | `:1095`, `:1106`, `:1128` |
| `company_predupr_bankrupt[i]` | `+1` per distressed day, `-2` per healthy day | `irandom(32) < (predupr - 7)` | `= 0` | `:1156`, `:1186`, `:1164` |

`global.mode` splits two universes **[V]**:
* `mode == 0` — **historical Japan replay**: fixed calendar events (Black Monday 1987-10-20, bubble burst,
  the 1995 Hanshin quake, Y2K on 2000-01-01 …) and era-dependent trend drift.
* `mode == 1` — **free-play / random macro events**: `trend_target` multiplier events.

---

## 3. News generators, one by one

### 3.1 Company/market news — the main generator **[V]**

`o_control_Step_0.gml:4324` wraps this whole block in **`if (myday > 3 && myday < 19)`** — i.e. it can only
fire on the **4th…18th of each calendar month** (15 of ~30 days). **[V]** `myday` is day-of-month
(`:198 myday = date_get_day(mydatetime);`).

Structure (`o_control_Step_0.gml:4585-5228`):

```gml
if (global.hospital == 0 && global.turma == 0 && global.otpuskdays <= 0)
{
    if (shans_mycomp > irandom_range(20, 100) && global.player_compnumber >= 0 && global.company_strike == 0)
    { /* 3.4 player-company "situation" — 24 variants */ }
    else if (irandom(round(400 / global.numberofcompany)) < shans)      // :4800
    { /* 3.1 market news */ }
    else if (price_stock(komp) > 444444 && global.company_profit[komp] < 0 && global.company_price[komp] > 1000)
    { /* :5216 forced collapse */ }
}
```

**Gate math.** With `global.numberofcompany ≈ 20`, `round(400/20) = 20`, so
`P(news today) = min(1, shans/20)`. `shans` starts at `irandom_range(-10, 11)` (`o_control_Create_0.gml:522`),
grows `+0.3…+1.0`/day (mean 0.65), and is only *tested* on 15 days/month.
⇒ **[I]** average ≈ 1 company-news item every **20–35 calendar days**, then a full rebuild of `shans`.

`komp` is the target company: assigned at `:4326 komp = random_all_company();` — a uniform pick among the
30 company slots with `company_liq == 0 && company_price > 0` (`gml_GlobalScript_random_company.gml:170`).
Because `komp` is an `o_control` instance variable it **persists across days** until the next refresh. **[V]**

**Category table** — `pum = irandom(24)` at `:4802`, i.e. uniform 0…23. Many branches are conditional and
silently do nothing (and do *not* reset `shans`), so the effective distribution is skewed. All effects are
applied to the **target company `komp`**; `update_price(komp)` runs unconditionally at `:5083`.

| `pum` | gate | effect | news id |
|---|---|---|---|
| 0 | — | *(nothing)* | — |
| 1 | — | `profit += random_range(0.3,0.63)`; `hype += random_range(0.05,0.3)`; `hype_effect = irandom_range(5,25)`; `shans=-1` | `txt(142)/txt(143)` "Miracle — successful product" |
| 2 | `irandom(4)==1` else `pum = irandom_range(3,14)` | `number_a += irandom_range(55,333)`; if player owns <90% → notif | `txt(87)/txt(144)` "Scandal — dilutive share issue" |
| 3 | `ac < 0.83*number_a` | `hype *= random_range(0.66,0.8)`; `hype_effect = -irandom_range(1,4)`; `limit_kil += irandom_range(1100,3000)` | `txt(145)/txt(146)` "Breaking news! — major shareholder dumps" |
| 4 | `ac < 0.78*number_a && profit > 0` | `hype -= random_range(0.1,0.3)`; `profit = -random_range(0.2,0.7)` | `txt(76)/txt(227)` "fails in its latest project" |
| 5 | `profit > 0` | `hype += random_range(0.3,0.6)`; `hype_effect = irandom_range(5,17)` | `txt(76)/txt(228)` "Nippon Keizai sees a bright future" |
| 6 | `ac < 0.78*number_a` | `hype -= random_range(0.3,0.6)`; `hype_effect = -irandom_range(13,44)` | `txt(76)/txt(229)` "Maminoshinjitsu publishes unpleasant info" |
| 7 | `ac < 0.78*number_a` | `hype -= random_range(0.3,0.6)`; `hype_effect = -irandom_range(5,33)` | `txt(76)/txt(229)` (duplicate) |
| 8 | `profit < -0.1` | `profit = random_range(0.15,0.5)`; `hype += random_range(0.1,0.3)` | `txt(76)/txt(230)` "has finally recovered" |
| 9 | `hype < -0.22 && profit > 0.2` | `hype = random_range(0.1,0.3)` | `txt(76)/txt(231)` "investor interest is growing" |
| 10 | `hype > 3 && profit < 0.1` | `hype -= random_range(0.9,2.1)`; `hype_effect = -irandom_range(33,55)` | `txt(76)/txt(232)` "**The Bubble Has Burst!**" |
| 11 | — | `hype += random_range(0.1,0.5)`; `hype_effect = irandom_range(2,11)` | `txt(76)/txt(233)` "CFO interviewed on television" |
| 12 | — | `profit += random_range(0.2,0.5)` | `txt(76)/txt(234)` "successful deal increased revenue" |
| 13 | — | `profit -= random_range(0.3,0.55)`; `price *= random_range(0.96,1)`; `stockprice *= random_range(0.9,0.99)` | `txt(76)/txt(235)` "product recall, expenses skyrocket" |
| 14 | — | `hype -= random_range(0.32,0.66)`; `hype_effect = -irandom_range(2,44)` | `txt(76)/txt(236)` "TV report about working conditions" |
| 15 | — | *(nothing)* | — |
| 16,17,18 | — | **sector event**, see 3.3 | `txt(1310..1332)` |
| 19 | — | **commodity event** (10 commodities), `:4830-4933` | `txt(3888..3897)` |
| 20 | — | **yen crash/boom**: `kurs /= random_range(1.08,1.23)` or `*= random_range(1.08,1.24)` | `txt(3984..3989)` |
| 21,22,23 | — | `prognozio(komp)`; if it returns `0` (no forecast possible) → `pum = irandom(18)` | see §5 |

**Forced collapse** (`:5216`, no cooldown consumed — it is the `else` of the news gate):

```gml
else if (price_stock(komp) > 444444 && global.company_profit[komp] < 0 && global.company_price[komp] > 1000)
{
    global.company_profit[komp] -= 0.05;
    global.company_hype[komp] -= random_range(0.1, 0.3);
    global.company_hype_effect[komp] -= irandom_range(6, 22);
    global.company_price[komp] *= random_range(0.6, 0.7);
    global.company_stockprice[komp] = global.company_price[komp] * random_range(0.76, 0.88);
    update_price(komp);
    create_notification(txt(76), txt(3983));   // "…announced large-scale layoffs…"
}
```
(`update_price` at `:5083`-equivalent then **overwrites** `company_stockprice` from the formula in §4, so the
`random_range(0.76,0.88)` factor is discarded; only the `price *= 0.6..0.7` and the hype cut survive.) **[I]**

### 3.2 Macro / economy news

**(a) Free-play mode (`global.mode == 1`), `o_control_Step_0.gml:833-908`** — the "trend shock" news:

```gml
shans_random_events += 1;
global.trend_target += random_range(0.01, -0.01);
if ((irandom(100) + 150) < shans_random_events || irandom(1000) == 5)   // :837
{
    shans_random_events = 0;
    var randomchange = irandom(6);            // 0..6
    if (global.trend_target < 0.82) randomchange = irandom(1);          // :843  (always bullish in a bear)
    if (global.trend_target > random_range(4, 11)) randomchange = choose(5, 7);  // :847
    ...
}
```
`randomchange == 7` is reachable only via that last `choose(5, 7)` (≈50 %), i.e. the **"Bubble has burst"**
catastrophe. **[V]**

| `randomchange` | `trend_target` multiplier | `price_building` | `trend` | news id |
|---|---|---|---|---|
| 0 | `* random_range(2, 2.8)` | `*= random_range(1.2,1.3)` | `+= 0.2` | `choose(3157, 1398)` |
| 1 | `* random_range(1.6, 1.8)` | `*= random_range(1.1,1.2)` | `+= 0.15` | `choose(3158, 1400)` |
| 2 | `* random_range(1.2, 1.5)` | `*= random_range(1.05,1.1)` | `+= 0.1` | `choose(3159, 1403)` |
| 3 | `* random_range(0.8, 0.9)` | `*= random_range(0.9,0.95)` | `-= 0.05` | `choose(3160, 3161)` |
| 4 | `* random_range(0.6, 0.7)` | `*= random_range(0.75,0.85)` | `-= 0.1` | `choose(3162, 1411)` |
| 5 | `* random_range(0.3, 0.4)` | `*= random_range(0.6,0.75)` | `-= 0.2` | `choose(3163, 3164)` |
| 6 | `+= random_range(0.1, -0.1)` | — | — | *(silent)* |
| 7 | `* random_range(0.2, 0.4)` | `/= 2` | `*= random_range(0.7,0.8)` | `txt(1413)` "The 'Bubble' has burst!" |

Afterwards **[V]** `:903-907`:
```gml
global.trend_target = clamp(global.trend_target, 0.7, 20);
global.trend        = lerp(global.trend, global.trend_target, random_range(0.001, 0.01));
global.price_building = lerp(global.price_building, global.trend * 603000, random_range(0.002, 0.01));
global.price_cars     = lerp(global.price_cars,     global.trend * 3030000, random_range(0.005, 0.01));
global.trend += random_range(-0.02, 0.023);
```
and unconditionally `global.trend += random_range(-0.01, 0.01);` at `:785`.

**(b) Historical mode (`global.mode == 0`), `:930-1031`** — 18 hard-coded real-world events keyed on exact
dates, e.g. `1980-06-23` Black Monday (`txt(1398)`), `1987-10-20` (`txt(1415)`, `trend += random_range(0.03,0.3)`),
`1989-07-11` (`txt(1407)`), `1989-10-22` (`txt(1410)`, `trend += random_range(0.03,0.3)`),
`1990-04-05` (`txt(1412)`, `trend *= random_range(0.7,0.8)`), `1990-12-25` (`txt(1413)`, `price_building *= 0.6`,
`trend *= 0.9`), `1992-02-11`, `1992-06-11`, `1998-11-08`, `2000-01-01` (`txt(1416)` + `txt(1417)` game-over check).
Era drift per company (`:1198-1221`): 1984–89 `irandom(11)==1 → trend += random_range(0.001,0.006)`;
1990–93 `trend *= random_range(0.999,0.997)` (note: inverted range, always ≤1); 1994–98 `trend *= random_range(0.999,1)`.

### 3.3 Sector news (`pum ∈ {16,17,18}`), `o_control_Step_0.gml:5084-5214` **[V]**

```gml
var checknew = irandom(10);           // 0..9
sector = irandom(10);                 // 0..9, but only 8 sectors exist (field 0..7)
sector_name = string_lower(get_field(sector));
switch (checknew) { case 0: ... case 25: ... }
```
**Bug worth noting:** `checknew = irandom(10)` yields 0…9, but the `switch` has cases 0,1,3,…,25 — so
**`case 2` is the only null result (1/10 chance of a silent no-op), and cases 10–25 are unreachable.** **[V]**

Effects are written to `global.field_hype[sector]` and `global.field_profit[sector]` (the sector-wide
modifier arrays, 8 entries each, created at `o_control_Create_0.gml:328-329`). Magnitudes are large and
integer-valued, e.g. `field_hype = irandom_range(30, 60)`, `field_profit = irandom_range(30, 40)`.
They **decay by ±1 per trading day** (`:1553-1571`).

Sector news texts (`stonks.csv`) are ids 1310–1332: strike, innovation boom, discovery, new regulation,
record earnings, revolutionary tech, crisis, controversial policies, corporate misconduct, quarterly growth,
financial scandal, missed earnings, government contracts, "5th-generation computers", foreign investment,
urbanization, export boom, energy crisis, falling foreign demand, tech shifts, international competition,
environmental regulation, US recession.

Player-facing *sector* events (the yakuza-manipulated variants) are `sector_bad_events` / `_max` /
`sector_good_events` / `_max` in `gml_GlobalScript_comp_bad_luck.gml:1-47` — see §3.5.

### 3.4 Player-company "situations" (`shans_mycomp` branch), `:4587-4799` **[V]**

24 numbered situations in a `switch`. Base pool `:4597`:
`ds_list_add(checks_now, 0, 5, 6, 7, 8, 11, 15, 16, 17, 18, 20, 21, 22);` then conditional additions:
`9` if `company_char[0] < 30`; `10` ×2 if `< 23`, ×1 more if `< 20`, `< 18`, `< 16`;
`1` (and `13` with p=1/4) if a random worker exists; `14` if `season == 0`;
`19` if all four `company_char > {40,55,50,55}`; `23` up to 3× if `hype > 0.7 / 0.9 / 1.03`;
`2`/`3`/`4` from `level_viddil[6]/[4]/[3]`; `12` (p=1/4) from `level_viddil[1]`.
Then `ds_list_shuffle(checks_now)` and `situation = checks_now[0]`.

Most situations are **paid choices** (`global.event_price = company_price * random_range(a,b)`), implemented as
`situation_N_yes()` / `situation_N_no()` in `gml_GlobalScript_scr_random_events_in_company.gml`.
Representative price impacts **[V]**:

| situation | id | stockprice multiplier | hype | profit |
|---|---|---|---|---|
| 0_no ("dangerous product") | 2666 | `* random_range(0.7, 0.93)` | `-= 0.4`, `hype_effect = -10` | `-= 0.2` |
| 1_yes ("fired the accuser") | 2668 | `* random_range(1.01, 1.03)` | `+= 0.2` | — |
| 1_no ("ignored allegations") | 2676 | `* random_range(0.9, 0.95)` | `-= 0.3`, `hype_effect = -10` | — |
| 2_yes / 4_yes | 2678/2682 | `* random_range(1.01,1.03)` | `+= 0.2` | `+= 0.2` |
| 4_no_rezult_2 | 2684 | `* random_range(0.84, 0.94)` | `-= 0.3`, `hype_effect = irandom_range(-1,-20)` | `-= 0.5` |
| 7_yes_rezult_good | 2692 | **`* random_range(1.05, 1.15)`** | `+= 0.2`, `hype_effect = irandom_range(6,30)` | `+= 0.33` |
| 8_quality_good | 2697 | **`* random_range(1.05, 1.15)`** | `+= 0.15` | `+= 0.15` |
| 8_speed_good | 2701 | **`* random_range(1.15, 1.25)`** | `+= 0.3`, `hype_effect = irandom_range(11,22)` | `+= 0.66` |
| 11_yes_later | 2709 | — | `-= 0.23` | `+= 0.35` |
| 12 / 14 | 2710/2712 | `* random_range(0.98,0.99)` | — | `-= 0.4 / -0.22` |
| 15 | 2713 | `* random_range(1.05,1.14)` | — | `+= 0.4` |
| 16 / 18 / 19 | 2714/2716/2717 | `*1.01-1.08 / 1.01-1.05 / 1.01-1.15` | — | `+=0.25/0.15/0.3` |
| 17 / 20 / 21 / 22 | 2715/2718/2719 | `* random_range(0.98,0.99)` | `-= 0.3` (22) | `-= 0.1/-0.15/-0.15/-0.15` |
| 23 | 2747 | `* random_range(1.01,1.03)` | — | `+= 0.15` + cash into reserve |

**Important:** most of these set `company_stockprice` directly *and then* call `update_price()`, which
**recomputes** `stockprice = price * 0.8 * hype * rynochek * trend`. So the explicit multiplier is largely
wiped out unless `company_price` was also moved. **[I]** (e.g. `situation_7_yes_rezult_good` changes neither
`company_price` nor `company_hype_effect`→price, so the `×1.05…1.15` is discarded.)

### 3.5 Scheduled (`delay_action`) catalysts

**The scheduler — `gml_GlobalScript_delay_action.gml:70-94` [V]:**

```gml
function delay_action(arg0, arg1, arg2 = "", arg3 = 0, arg4 = 0, arg5 = 0, arg6 = 0, arg7 = 0, arg8 = 0, arg9 = 0)
{
    var nomrmr = arg0 + o_control.gameday;
    for (var i = 0; i < 500; i++)
    {
        if (global.delaydays[nomrmr] == 0) { global.delaydays[nomrmr] = (arg2 == "") ? arg1 : [arg1,arg2,…,arg9]; break; }
        else { nomrmr += 1; }
    }
}
```
`global.delaydays` is a **100 000-element array indexed by absolute game day** (`o_control_Create_0.gml:331`,
`gml_GlobalScript_clear_notif.gml:3`). Each day `o_control_Step_0.gml:909-929` pops index `gameday`, executes
`script_execute(asset_get_index(name), a1..a7)`, then zeroes the slot. Collisions push later by up to 500 days.
**It is a sparse calendar, not a ring buffer.**

**Yakuza-manipulated company catalysts** (`gml_GlobalScript_comp_bad_luck.gml`, armed from
`gml_GlobalScript_buttonss_dialogs.gml:370-539`) **[V]** — the player *pays* to schedule these:

| action | cost | delay | outcome choose (3:1 odds) |
|---|---|---|---|
| `b_yakuza_sector_priz_up` | `nikkei_price * 0.01` | `irandom_range(20,30)` | `sector_good_events` ×3 / `sector_good_events_max` ×1 |
| `b_yakuza_sector_priz_down` | `nikkei_price * 0.01` | `irandom_range(20,30)` | `sector_bad_events` ×3 / `_max` ×1 |
| `b_yakuza_sabotage_company_reduce` | `company_price * 0.0029` | `irandom_range(20,30)` | `comp_bad_events` ×3 / `comp_bad_events_max` ×1 |
| `b_yakuza_market_company_raise` | `company_stockprice * 0.0027` | `irandom_range(20,30)` | `comp_good_luck` ×3 / `comp_good_luck_max` ×1 |
| `b_yakuza_market_company_reduce` | `company_stockprice * 0.0027` | `irandom_range(20,30)` | `comp_bad_luck` ×3 / `comp_bad_luck_max` ×1 |

All set `global.yakuza_in_work = irandom_range(222, 299)` (≈7.5 months of reduced payout) and `change_char(-2, 2)` (conscience).

Company-level effects **[V]**:

| fn | `hype` | `hype_effect` | `profit` | news id |
|---|---|---|---|---|
| `comp_good_luck` `:49` | `+= random_range(0.5,0.8)` | `= irandom(11)` | — | 3395 |
| `comp_good_luck_max` `:62` | `+= random_range(0.9,1.3)` | `= irandom(25)` | — | 3396 |
| `comp_bad_luck` `:75` | `-= random_range(0.5,0.8)` | `= -irandom(11)` | — | 3397 |
| `comp_bad_luck_max` `:88` | `-= random_range(0.9,1.3)` | `= -irandom(25)` | — | 3398 |
| `comp_bad_events` `:101` | `-= random_range(0.03,0.1)` | `= -irandom(5)` | `-= random_range(0.3,0.5)` | 3393 |
| `comp_bad_events_max` `:115` | `-= random_range(0.05,0.15)` | `= -irandom(22)` | `-= random_range(0.55,0.8)` | 3394 |
| `sector_bad_events` `:1` | `field_hype -= random_range(0.3,0.6)` | — | `field_profit -= random_range(0.25,0.42)` | 3401 |
| `sector_bad_events_max` `:13` | `field_hype -= random_range(0.6,0.8)` | — | `field_profit -= random_range(0.42,0.66)` | 3402 |
| `sector_good_events` `:25` | `field_hype += random_range(0.3,0.6)` | — | `field_profit += random_range(0.25,0.42)` | 3403 |
| `sector_good_events_max` `:37` | `field_hype += random_range(0.6,0.8)` | — | `field_profit += random_range(0.42,0.66)` | 3404 |

**Generic scheduled win/lose** — `gml_GlobalScript_delay_action.gml:25-49` (`sc_company_loose` / `sc_company_win`):

```gml
var syla = (arg0 + 1) * 0.3;
global.company_hype[comp_nomer]         -= random_range(0.4, 0.6) * syla;
global.company_hype_effect[comp_nomer]  = -round(irandom_range(10, 16) * syla);
global.company_price[comp_nomer]        *= 1 - (0.1 * syla);
```
(news `choose(3504,3506)` = "reported significant losses"; the win variant uses `choose(3505,3507)`.)

**Shareholder meeting** — `gml_GlobalScript_sobranie_begin.gml:57-103` (`end_meet`), a clean 6-way outcome
drum built from `global.meet_rez`:

| `meet_rez` | `hype` | `hype_effect` | `stockprice` | news |
|---|---|---|---|---|
| ≤0 | `-= random_range(-0.3,-0.6)` | `irandom_range(-15,-30)` | `* random_range(0.8,0.94)` | 1978 |
| 1 | `-= random_range(-0.1,-0.3)` | `irandom_range(-5,-14)` | `* random_range(0.93,0.96)` | 1979 |
| 2 | `-= random_range(-0.1,0.1)` | `irandom_range(3,-3)` | — | 1980 |
| 3 | `+= random_range(0.1,0.25)` | `irandom_range(5,10)` | `* random_range(1,1.03)` | 1981 |
| 4 | `+= random_range(0.25,0.4)` | `irandom_range(8,14)` | `* random_range(1.03,1.05)` | 1982 |
| ≥5 | `+= random_range(0.32,0.6)` | `irandom_range(15,30)` | `* random_range(1.07,1.15)` | 1982 |

`end_meet()` then calls `update_price()` — again overwriting `stockprice`. **[I]**

### 3.6 Share issuance / splits / bankruptcies

* **New-share issue** (`o_control_Step_0.gml:1098-1143`, news 2842): `ssfdsf = random_range(1.1,1.18)`,
  `company_number_a *= ssfdsf`, and the player is offered a **pre-emptive rights** buyout
  (`moneyneed = round(prprs * newpriceone * 0.3)` for a minority holder, `* 0.25` for the controller).
  `company_days_without[i] = irandom_range(150,500)` / `(155,455)`.
* **Automatic stock split** (`:1080-1083`): `price_stock(i) < irandom_range(100,2500) && irandom(4)==1 && liq==0`
  → `split_company(i, 1, choose(2,3,5))` (reverse split).
* **Scheduled split** (`:1092`): `company_days_without[i] <= 0 && priceacc > irandom_range(1e6,1.1e7)` →
  `split_company(i, 0, choose(2,3,4))` (forward split), reset `irandom_range(150,333)`.
* `split_company` (`gml_GlobalScript_split_company.gml:1`): forward split
  `price *= random_range(1.01,1.02)`, `hype += random_range(0.2,0.5)`, `hype_effect += random_range(2,10)`;
  reverse split `hype -= random_range(0.1,0.3)`, `hype_effect = random_range(2,10)`, `profit += random_range(0.1,0.3)`.
* **Bankruptcy** (`:1150-1177`, `gml_GlobalScript_delete_company.gml:30-95`): a distressed company
  (`price < 4e8..1e9` or `stockprice < 1e8..1e9` or below `0.05–0.28 × nikkei_price`, or `profit < -0.09`)
  accumulates `company_predupr_bankrupt`; when `irandom(32) < (predupr_bankrupt - 7)` and `hype < 1.03 && profit < 0.24`
  → news `choose(3312,3313)` ("faces financial woes…"), `hype -= 0.3`, `hype_effect = irandom_range(-20,15)`,
  `todaybankrupt_company = irandom_range(125,355)`, then `delay_action(irandom_range(15,33), "company_banrupt_or_not")`.
  Resolution: `irandom(2)==2` (never true in GM — bug) → reverse split, else `company_banrupt()`;
  inside, `irandom(8) < 7 && hype < 1 && profit < 0.4` → bankruptcy news `choose(3309,3310,3311)`,
  liquidation `price *= random_range(0.3,0.45)` and the player gets a pro-rata payout
  (`money_receive = round(price_for_all / company_ac)`), else "**emerged from its crisis**" (3314):
  `hype += 0.4`, `profit += 0.4`, `hype_effect = irandom_range(6,30)`, and the global bankruptcy
  cooldown is shortened: `todaybankrupt_company = round(todaybankrupt_company * 0.66)`.
* **Rescue miracle** (`:1472-1485`, `irandom(111)==1` and `price_stock < 500`):
  `price *= random_range(2,4)`, `hype = random_range(1.2,2.2)`, `hype_effect = irandom_range(5,60)`,
  `stockprice *= random_range(3,22)` — then `update_price(i)` overwrites `stockprice`.
  News `irandom_range(1456,1461)` = six "stunning recovery" variants.

### 3.7 Rumors and "free" predictions (non-purchased)

* **Bar contacts** (`gml_Object_o_bar_Step_0.gml:246-258`, once per bar visit): `porada = random_porada()`;
  if the contact's `human_friend > 25` and (`pupa == 1 || irandom(10)==1 || irandom(human_friend) > 50`),
  emits a rumor about a company with **no market effect at all** — text 3669–3672 keyed by `porada[0]`
  (0 = hottest by hype, 1 = best profit, 2 = coldest by hype, 3 = worst profit; `gml_GlobalScript_random_porada.gml:1`).
  Pure information/flavour.
* **Fortune-teller (Hikari)** (`gml_Object_o_hikari_Step_0.gml:86-111`) — **this one DOES move prices**:
  ```gml
  var predict = random_porada();
  if (predict[0] == 0 || predict[0] == 2) {           // hype-based pick
      global.company_hype_effect[companomer] = irandom_range(20, 40);
      global.company_profit[companomer] += 0.8;
      global.company_hype[companomer] += 0.4;
      create_notification(txt(3686), txt(3804));
  }
  if (predict[0] == 1 || predict[0] == 3) {           // profit-based pick
      global.company_hype_effect[companomer] = -irandom_range(20, 40);
      global.company_profit[companomer] -= 0.3;
      global.company_hype[companomer] -= 0.15;
      create_notification(txt(3686), txt(3805));
  }
  ```
  Because `porada` mode 0/2 selects the **highest / lowest hype** company, the fortune teller is a
  **contrarian amplifier**: telling you about the hottest company actually gives it `profit +0.8` and
  `hype +0.4`; telling you about the coldest gives `profit -0.3`. **[I]**
* **Bar fortune cookie / trait "hints"** — `global.prediction` (see §0, no market effect). Set at
  `o_bar_Step_0.gml:70-108` (cookie text 1032) or `o_control_Step_0.gml:804-832` (trait 14, `irandom(12)==1`).
  `predictiondays = random_range(20, 30)`, decremented daily at `:1875`, resolved at `:1772-1872`.
  `global.noluck == 2` biases the omen draw toward the pessimistic end (`o_bar_Step_0.gml:85`).
* **Employee-driven hype** (`change_hype`) — `o_control_Step_0.gml:4441, 4456, 4496`; see §4.

---

## 4. The price model

### 4.1 The two primitives — quoted verbatim **[V]**

`gml_GlobalScript_update_price.gml:1-25`:
```gml
function update_price(arg0)
{
    if (arg0 >= 0)
    {
        if (global.company_hype[arg0] < 0.1)
        {
            global.company_hype[arg0] = 0.14;
        }
        global.company_price[arg0] = global.company_price[arg0] + (global.company_price[arg0] * 0.001 * global.company_profit[arg0]);
        global.company_stockprice[arg0] = global.company_price[arg0] * 0.8 * global.company_hype[arg0] * global.rynochek * global.trend;
        ...
        chart_add_data(o_control.sMarketing[arg0], global.company_stockprice[arg0] / global.company_number_a[arg0]);
    }
}
```

`gml_GlobalScript_update_price.gml:27-70`:
```gml
function update_price2(arg0, arg1)
{
    var minimumrandom = random_range(0.12, 0.34);
    if (arg1 < minimumrandom)
    {
        arg1 = minimumrandom;                                   // ← the ONLY clamp: a floor, not a cap
    }
    if (arg0 >= 0)
    {
        if (global.company_hype[arg0] < 0.1)
        {
            global.company_hype[arg0] = 0.14;
        }
        if (arg1 < 0.99)
        {
            if (global.company_hype_effect[arg0] > 0)
            {
                global.company_hype_effect[arg0] = -2;           // momentum flips sign, clipped to ±2
            }
        }
        if (arg1 > 1.01)
        {
            if (global.company_hype_effect[arg0] < 0)
            {
                global.company_hype_effect[arg0] = 1;
            }
        }
        global.company_stockprice[arg0] *= arg1;
        global.company_hype[arg0] *= arg1;
        ...
        chart_add_data(o_control.sMarketing[argument0], global.company_stockprice[argument0] / global.company_number_a[argument0]);
    }
}
```

**Answer to "how does a news item map to a multiplier `zmina`": it does not.** `zmina` is exclusively the
*order-flow* multiplier, assembled in `gml_Object_o_birza_Other_10.gml`:

```gml
zmina = 1;
if (vkladka == 0) {                                    // :12  buy-side settlement
    global.company_ac[i] += qtyDelta;
    if (qtyDelta != 0)
    {
        zmina += (qtyDelta / max(1, global.company_number_a[i]));          // :17
        with (o_birza) { update_price2(i, zmina); }
    }
}
if (vkladka == 1) {                                    // :36  sell/short-side settlement
    ...
    zmina -= (qtyDelta / max(1, global.company_number_a[i]));              // :54
    with (o_birza) { update_price2(i, zmina); }
}
```
and the **share-count change** branch (`:151-252`, the block that also emits the 2742–2745 insider-trading
news) re-uses the same `zmina` variable, which by then carries the previous iteration's value:

```gml
var change_vv = (global.company_ac[i] - ac_vchera[i]) * 0.00001 * bonus_vplyv;   // :207
global.company_hype[i] += change_vv;
zmina += change_vv;                                                               // :209
...
if (check < -0.01)   { create_notification(txt(76), txt(badpr));
                       global.company_hype[i] *= random_range(0.96, 0.99) * bonus_vplyv;
                       zmina -= (random_range(0.01, 0.03) * bonus_vplyv);
                       global.company_hype_effect[i] = -irandom_range(5, 20);
                       global.company_sovet[i] -= round(check * 75); }
if (check >= 0.01)   { create_notification(txt(76), txt(goodpr));
                       global.company_hype[i] *= random_range(1.001, 1.019) * bonus_vplyv;
                       global.company_hype_effect[i] = irandom_range(5, 20);
                       global.company_sovet[i] += round(check * 50); }
if (check != 0)      { with (o_birza) { update_price2(i, zmina); } }               // :244-247
```

`check = (ac/number_a) - (ac_vchera/number_a)` — i.e. the change in **fraction of shares outstanding held by
the player**, which the game treats as a proxy for insider accumulation/distribution. Thresholds:
`check < -0.01` ⇒ "insider sold" news (2742/2744); `check >= 0.01` ⇒ "insider bought" news (2743/2745),
selected by `global.company_vsovete[i]` (0 = board member, 1 = ?, 2 = CEO).

`bonus_vplyv` (`gml_Object_o_birza_Create_0.gml:53-56`): `1.0`, or `1.25 + min(1, (global.char[0] - 40) * 0.01)`
when the player's Charisma stat exceeds 40. **[V]**

**Distribution of `zmina` [I]:** `zmina ∈ [0.12, ~1 + Σ|qty|/number_a]`, i.e. it is a *floor of 12–34 % of
market cap* on any sell day, and a symmetric `1 + Δ(fraction owned)` on buy days. There is **no upper clamp**.
The floor `minimumrandom = random_range(0.12, 0.34)` is re-rolled on **every single call**, so its expected
value is 0.23. Sign convention: `>1` = bullish (hype rises proportionally), `<1` = bearish.

### 4.2 Hype model

Hype is the primary sentiment variable; `company_stockprice` is a **linear** function of it.

**Per-trading-day momentum decay** (`o_control_Step_0.gml:1228-1249`) **[V]**:
```gml
if (round(global.company_hype_effect[i]) > 0) { global.company_hype_effect[i] -= 1;
                                               global.company_hype[i] += random_range(0.0015, 0.021); }
if (round(global.company_hype_effect[i]) < 0) { global.company_hype_effect[i] += 1;
                                               global.company_hype[i] -= random_range(0.001,  0.02); }
...
global.company_hype_effect[i] = round(global.company_hype_effect[i]);
if (global.company_hype_effect[i] == 0)
{
    if (irandom(10) == 1) { global.company_hype_effect[i] = irandom_range(-8, 8); }
    if (irandom(11) == 1) { global.company_hype[i] += random_range(-0.031, 0.03); }
}
```
⇒ `company_hype_effect` is an **integer countdown in days**. A news item sets it to ±N and hype then drifts
in that direction for N trading days: `hype += U(0.0015, 0.021)/day` (positive) or `hype -= U(0.001,0.02)/day`
(negative), i.e. roughly **+1.1 %/day** or **−1.05 %/day**, then it is rounded and a new random ±8 seed is
drawn with p = 1/10. **[I]**

**Mean reversion / clamps** (same block) **[V]**:
* `profit < 0` → `hype -= 0.01` (if `hype > 1`)
* `profit < -0.15` → `hype -= 0.01` (if `hype > 1`)
* `profit < 0.12` → `hype -= 0.004` (if `hype > 1.2`)
* `profit > 0.05` → `hype += 0.01` (if `hype < 1.4`)
* `irandom(5) == 1` → `hype += irandom_range(-0.04, 0.04)`
* `hype < 0.1` → `hype = 0.1`, then `hype += random_range(0.01, 0.03)`
* `hype < 0.5` → `hype += random_range(0, 0.01)`
* **bubble regime** (`:1342-1365`) — if `hype > random_range(2, 4)`:
  `hype = lerp(hype, 1.3, random_range(0.025, 0.05)) - random_range(0, 0.03)`;
  if additionally `> 10` → `lerp(hype, 1, U(0.04,0.05)) - U(0.01,0.035)`;
  if `> 30` → `hype *= U(0.8,0.9)`, `lerp(hype, 1, U(0.04,0.2)) - U(0,0.03)`;
  if `> 60` → `hype *= U(0.4,0.6)`, `- U(0,0.03)` (**crash**).
* `hype < 0.5` also bleeds profit (`:1464-1468`):
  `profit -= profit * (1 - hype) * 0.005` — i.e. low hype directly shrinks profitability.

**Sector coupling** (`:1311-1328`) **[V]**, per company per day:
```gml
if (global.field_hype[field] > 0)  global.company_hype[i]    += random_range(0.006, 0.012);
if (global.field_hype[field] < 0)  global.company_hype[i]    -= random_range(0.005, 0.01);
if (global.field_profit[field] > 0) global.company_profit[i] += random_range(0.004, 0.008) * koef_trend;
if (global.field_profit[field] < 0) global.company_profit[i] -= random_range(0.003, 0.007);
```
with `koef_trend = relerp(0.7, 10, global.trend, 1, 2)` (`o_control_Step_1.gml:45`) — a bull market
**amplifies** sector profit bonuses.

**`change_hype(comp, delta)`** — `gml_GlobalScript_change_hype.gml:1` **[V]**:
```gml
function change_hype(arg0, arg1)
{
    companname = global.company_name[arg0];
    if (arg1 == 0) { arg1 = random_range(-5, 5); }
    var mess = "";
    if (arg1 > 3.5)    mess = txt(599);   // "<companname> stock price went up a lot!"
    if (arg1 > 1 && arg1 <= 3.5) mess = txt(600);
    if (arg1 < -3.5)   mess = txt(603);   // "…stocks fell heavily!"
    if (arg1 < -1 && arg1 >= -3.5) mess = txt(602);
    if (arg1 >= -1 && arg1 <= 1)  mess = txt(601);
    global.company_hype[arg0]         += random_range(arg1 * 0.08, arg1 * 0.12);
    global.company_hype_effect[arg0]   = irandom_range(arg1 * 1.3, arg1 * 2.5);
    with (o_control) { if (gameday > 1) { update_price(arg0); } }
    return mess;
}
```
Only caller: **job-hopping news** — a random employee moves between companies (`o_control_Step_0.gml:4441`
moves a director into `kuda` → `change_hype(kuda, 0)` i.e. `U(-5,5)`; `:4456` moves a worker *out of* `otkuda`
→ `change_hype(otkuda, random_range(-2,2))`; `:4496` is the same for mid-tier employees). **Senior people
joining a company is good for its hype; senior people leaving is bad.** **[I]**
Magnitudes: `arg1 = 5` → `hype += U(0.4, 0.6)`, `hype_effect = irandom_range(6.5, 12.5)` ≈ a week of drift.
`arg1 = -5` → `hype -= U(0.4, 0.6)`.

### 4.3 The per-company daily price loop — `o_control_Step_0.gml:1074-1531` **[V]**

Runs for every `i < global.numberofcompany`, gated by `holyday == 0` and `myweekday` (1…5 = Mon–Fri) plus
`parttimework_days` (`:1222`). In order:

1. Snapshot `company_oldstockprice`, `company_oldnumber_a`; `company_days_without[i] -= 1`.
2. Overvaluation brake (`:1087`): if `priceacc > irandom_range(5e6, 2.5e7)` → `price *= U(0.98,0.993)` and
   `stockprice *= U(0.98,0.993)`.
3. Split / share-issue (§3.6).
4. Bankruptcy warnings (§3.6).
5. **The hype/profit stochastic core** (`:1228-1364`, quoted above).
6. `sovet` (board advice) accumulation (`:1370-1385`): `sovet += proccc` (capped 30), `+= proccc*0.3` capped 25
   when `vsovete == 1`, `sovet -= U(0.01,0.1)` when `vsovete == 2` (you are on the board).
7. **Dividend-yield mean reversion** (`:1386-1415`):
   ```gml
   var hypotecal_dohod_right_now = global.company_price[i] * global.company_profit[i];
   comp_dohodnost_ac = max(0, hypotecal_dohod_right_now * (global.big_data[i][0] / 100)) / global.company_number_a[i];
   comp_dividendyield = comp_dohodnost_ac / price_stock(i);
   if (comp_dividendyield > 2)  { global.company_stockprice[i] *= random_range(1.0001, 1.0006);
                                 if (hype > 0.1) global.company_hype[i] *= random_range(0.99, 0.9999); }
   if (comp_dividendyield > 10) { global.company_stockprice[i] *= random_range(1.0001, 1.006);
                                  global.company_price[i]     *= random_range(0.99, 0.9999); }
   ```
   ⇒ Over-yielding stocks get bid up slightly while hype is bled (a classic mean-reversion valve).
8. **The authoritative recompute** (`:1469-1471`) — this is what actually ends up on the chart:
   ```gml
   var pepsa = global.company_price[i] * 0.0015 * global.company_profit[i];
   global.company_price[i]      = global.company_price[i] + (pepsa * 1.5);
   global.company_stockprice[i] = global.company_price[i] * 0.8 * global.company_hype[i] * global.rynochek * global.trend;
   ```
9. Chart push (`:1511-1520`): `chart_add_data(sMarketing[i], stockprice/number_a)`, trimming the front when
   `ds_list_size(...) > 90`.

Because step 8 runs *after* the per-company loop, **any `company_stockprice` that news code wrote directly
is overwritten the same day** — unless the code also changed `company_price` or `company_hype`. This is the
single most important structural fact about the game's price model. **[I]**

`global.rynochek` (the "exchange index") is a slow mean-reverting random walk (`o_control_Step_0.gml:131-146`):
`rynok_up == 1 → += U(0.003, 0.01)` else `-= U(0.003,0.01)`; flips to down when `rynochek > random_range(1.1,1.3)`
and back up when `< random_range(0.7,0.9)`. Clamped to ≥ 0.3 (`:1442`).
`global.trend` floor 0.3, and pulled back toward 1 by `lerp(trend, 1, 0.005)` when `< 0.7` (`:1438-1449`).

`global.price_koef = round(1000 * global.rynochek * global.trend)` (`:258`) is the HUD display of the index.

---

## 5. The forecast system (`prognozio` / `prohnoz_company`)

`gml_GlobalScript_prognozio.gml` — both functions live in this file (the `__child*` stubs are decompiler
artifacts).

### 5.1 Issuing a forecast — `prognozio(comp)` (`:1-55`) **[V]**

Called only from `o_control_Step_0.gml:4805`, inside the market-news generator, with
**p ≈ 3/24 ≈ 12.5 % of news slots** (`pum >= 21`).

```gml
function prognozio(arg0 = 2)
{
    var prohnozzo = 0;
    if (global.company_prohnoz[arg0] == 0)          // ← one outstanding forecast per company
    {
        if (global.company_profit[arg0] >  0.2 && global.company_profit[arg0] <  0.5) prohnozzo =  1;
        if (global.company_profit[arg0] >= 0.5)                                 prohnozzo =  2;
        if (global.company_profit[arg0] < -0.2 && global.company_profit[arg0] < -0.5) prohnozzo = -1;
        if (global.company_profit[arg0] <= -0.5)                                prohnozzo = -2;
        ...
        switch (prohnozzo)
        {
            case -2: create_notification(txt(76), txt_phrase + txt(3560) + "\n" + txt(602));
                     global.company_hype[arg0] -= 0.15;  break;
            case -1: create_notification(txt(76), txt_phrase + txt(3561) + "\n" + txt(602));
                     global.company_hype[arg0] -= 0.078; break;
            case  1: create_notification(txt(76), txt_phrase + txt(3562) + "\n" + txt(600));
                     global.company_hype[arg0] += 0.11;  break;
            case  2: create_notification(txt(76), txt_phrase + txt(3563) + "\n" + txt(600));
                     global.company_hype[arg0] += 0.25;  break;
            default:  pum = irandom(18);  break;   // writes o_control.pum (no `var` ⇒ instance var);
                                                  // immediately overwritten by the caller at :4808
        }
        if (prohnozzo != 0)
        {
            global.company_prohnoz[arg0] = prohnozzo;
            delay_action(dayproh, "prohnoz_company", arg0, prohnozzo,
                         global.company_profit[arg0],
                         global.company_price[arg0] * global.company_profit[arg0],
                         companname);                 // dayproh = 91
        }
    }
    update_price(arg0);
    return prohnozzo;
}
```

Observations **[V]**:
* The forecast is a **pure function of current `company_profit`** — no randomness in the direction.
* Condition `-0.2 > profit > -0.5` is **unreachable** (`profit < -0.2 && profit < -0.5` ⇔ `profit < -0.5`),
  so `prohnozzo == -1` is **dead**; only `-2`, `1`, `2` and `0` are reachable. **[I]**
* **Issuing the forecast is itself a catalyst** — it moves hype immediately:
  `-2: −0.150`, `1: +0.110`, `2: +0.250`. So the news headline and its hype effect are locked together.
* Horizon is **91 game days**, and the *snapshot* is `arg3 = profit`, `arg4 = price * profit` (= the company's
  absolute earnings), `arg5 = company_name` (used to invalidate the forecast if the company is renamed).
* `global.company_prohnoz[i]` is a per-company lock: only one forecast in flight at a time.
* `txt_phrase = $"[b]{txt(3559)}[/b]\n\n"` → *"`<companname>` Presents Three-Month Revenue Forecasts to
  Investors."* followed by 3560/3561/3562/3563 and the generic hype reaction 602/600. **[V]** (note: the text
  says "three months" but the horizon is 91 days).

### 5.2 Settling a forecast — `prohnoz_company()` (`:57-202`) **[V]**

```gml
function prohnoz_company(arg0, arg1, arg2, arg3, arg4)   // arg1 = prediction, arg3 = snapshot profit, arg4 = snapshot earnings
{
    if (companname == arg4 && global.company_price[arg0] > 0 && global.company_liq[arg0] == 0)
    {
        var dohodo = global.company_price[arg0] * global.company_profit[arg0];
        var riznyca = dohodo / arg3;                         // realised earnings / forecast earnings
        ...
        var rezo = 0;
        if (arg1 == -1 || arg1 == -2) { if (riznyca > 1.05) rezo = 1;  if (riznyca <= 1.05) rezo = -1;  hype -= 0.25; }
        if (arg1 ==  1) { if (riznyca > 1.1)  rezo = 1;  if (riznyca <= 1.01) rezo = -1;
                           if (riznyca <= 0.9)  rezo = -2; }
        if (arg1 ==  2) { if (riznyca >= 1.2) rezo = 1;  if (riznyca < 1.12) rezo = -1;  if (riznyca < 1.09) rezo = -2; }
        if (arg1 == -1) { if (riznyca > 0.99) rezo = 1;  if (riznyca <= 0.8) rezo = -1;  if (riznyca <= 0.6) rezo = -2; }  // unreachable
        if (arg1 == -1) { … 0.99 / 0.68 / 0.5 … }                                                                            // unreachable
        if (rezo == -2) { global.company_hype[arg0] -= 0.7;  global.company_hype_effect[arg0] = -irandom_range(10, 25); }
        if (rezo == -1) { global.company_hype[arg0] -= 0.35; }
        if (rezo ==  0) { global.company_hype[arg0] += 0.25; }
        if (rezo ==  1) { global.company_hype[arg0] += 0.5;   global.company_hype_effect[arg0] =  irandom_range(10, 25); }
        ...
        update_price(arg0);
        create_notification(txt(76), part1 + "\n" + part2 + "\n" + part3 + "\n" + part4);
    }
    global.company_prohnoz[arg0] = 0;
}
```

**Accuracy table (only reachable branches) [V]:**

| prediction | `rezo = +1` (beat) | `rezo = 0` (on target) | `rezo = −1` (miss) | `rezo = −2` (bad miss) |
|---|---|---|---|---|
| `+2` (strong growth, `profit ≥ 0.5`) | `riznyca ≥ 1.20` | `1.09 ≤ riznyca < 1.20` | `1.12 ≤ riznyca < 1.20` (overwritten by −1 test) | `riznyca < 1.09` |
| `+1` (modest growth, `0.2 < profit < 0.5`) | `riznyca > 1.10` | `1.01 < riznyca ≤ 1.10` | `0.90 < riznyca ≤ 1.01` | `riznyca ≤ 0.90` |
| `−2` (strong decline, `profit ≤ −0.5`) | `riznyca > 1.05` | — (impossible: `>1.05`→+1 else `≤1.05`→−1) | `riznyca ≤ 1.05` | — |

The order of the `if`s matters: for `arg1 == 2`, the `riznyca < 1.12` test **overwrites** the `≥1.20 → +1`
result for `1.12 ≤ riznyca < 1.20`, so `rezo == 0` is only reachable in `[1.09, 1.12)`. **[I]**
For `arg1 == -1/-2`, `rezo` is **never 0**.

Hype payoffs **[V]**: `−2 → −0.70` (+ 10–25 days of negative drift), `−1 → −0.35`,
`0 → +0.25`, `+1 → +0.50` (+ 10–25 days of positive drift).

News body assembly (`:64-199`) **[V]**: `part2` = `txt(3564)` ("Three months ago, `<companname>` predicted a
increase in their revenue.") or `txt(3565)` for a negative forecast; `part3` = `txt(3566)`/"`+<procentchange>%`"
if `riznyca > 1` else `txt(3567)`/`"−<procentchange>%`" with `procentchange = |1 − riznyca| * 100`;
`part1` = `[b]`+`txt(3568)` ("Forecast Realized!") if `rezo ≥ 0` else `[b]`+`txt(3569)` ("Forecast Not Realized!");
`part4` = `txt(3572)` + `txt(603/602/600/599)` ("This outcome is worse than expected." + generic hype line).

**Can the player act on it?** Yes, in a real way: the settlement happens 91 days after issue, and
`global.company_prohnoz` is a per-company flag. But the game gives **no UI hook** for "forecast outstanding"
beyond the notification; the player must remember. The forecast direction is a deterministic read of the
*current* `company_profit`, so a player watching `profit` can predict the forecast class themselves. **[I]**

### 5.3 Insider trading (a separate "prediction" channel)

**`global.prognoz` + `global.prognoz_pozitiv` + `global.prognoz_know`** — a *company tip* with a correct sign.

**Where the tip comes from** **[V]** — three producers, all the same shape:
* `o_control_Step_0.gml:3601-3603` (bar contact, `chokobo == 0`, ~1/6 of contacts, requires
  `global.money > yenprice` where `yenprice = max(300000, round(fortune * U(0.01,0.02)/100000)*100000)`):
  ```gml
  yenprice = max(300000, round((global.fortune * random_range(0.01, 0.02)) / 100000) * 100000);
  if (global.money > yenprice)
  {
      global.prognoz_pozitiv = choose(1, 1, 0);        // 2/3 bullish
      global.prognoz = random_company();
      create_question(txt(218), txt(1436), yes_inside);
  }
  ```
* `o_control_Step_0.gml:5290-5311` (yakuza favour, every `irandom_range(45,100)` days once `yakuza_rep > 0`):
  `prognoz_pozitiv = 1` or `0`, `prognoz = random_company()`, news `txt(2836/2837/2838/2839)`.
* `gml_GlobalScript_amy_pidkazka.gml:1` and `gml_Object_o_human_Alarm_1.gml:28-50` (Amy / NPC gossip): a
  5-way shuffled draw over `{Company, Company_pohano, Sectornow, Sectornow_hype, Sectornow_bad}`, where the
  two company options are **only added when `global.prognoz_know == 0`** (i.e. you already have the tip).

**Buying the tip** — `yes_inside()` (`gml_GlobalScript_yes_inside.gml:1`) **[V]**:
```gml
money_delete(o_control.yenprice, 1528);
global.prognoz_know = 0;
change_char(-1, 2);                       // conscience −1
comomo = global.company_name[global.prognoz];
global.prognoz_know = 1;
create_notification(txt(218), txt(1437 or 1438));   // "The share price of <comomo> is expected to rise soon."
```
`zvonok1_1()` (the paid phone version, `gml_GlobalScript_zvonok1_1.gml:1`) is cheaper in conscience
(no `change_char`) but **only sets `prognoz_know = 1` if `prognoz_pozitiv == 1`** — i.e. the phone only
confirms good news, and never arms the SEC-detection trigger. **[I]**

**Timing the trade** — `gml_Object_o_birza_Other_10.gml:26-34` **[V]**:
```gml
if (qtyDelta > 0)
{
    global.company_ac_bought_number[i] += qtyDelta;
    if (i == global.prognoz && global.prognoz_know == 1 && irandom(6) == 1)
    {
        global.prognoz_know = 0;
        delay_action(irandom_range(15, 33), "insider");        // ← SEC sting, p = 1/6 per buy day
    }
}
```
⇒ **You have ~15–33 days after your first buy to be clear.** The sting chain
(`gml_GlobalScript_zvonok1_1.gml:15-39`): `insider` (−2 conscience, −5 % Charisma, stress +5…20) →
+1 d → `insider_2` (`insader_zaborona = 1`) → +6…15 d → `insider_3` (stress +5…20, lawyer offer,
`insader_zaborona = 1`) → +15…25 d → `insider_sud` with `sud_calc(100)`:
`resultat = 2` (acquitted/penalty) if `irandom(100) < sud_shans*100*1.25*0.9`; `resultat = 1` if
`< vsego*1.25`; else `resultat = 0` (**jail 90 days + fine 15 % of fortune + trading ban**, `trade_zab_days = 0`).
`sud_shans = (char[7] + 2*char[2] + leveladvokat + 20 + 8 + bonus) / diff` with
`bonus = 5 + min(char[5]*0.13, 30)` if `check_level_rep(5) >= 4` (`zvonok1_1.gml:209-223`).

**Tip resolution** — `o_control_Step_0.gml:2717-2746` **[V]**:
```gml
rand = irandom(10);
if (global.prognoz >= 0)
{
    das += 1;
    if (das > irandom_range(7, 18) && myday != 1 && global.turma == 0 && global.otpuskdays <= 0 && holyday == 0)
    {
        if (global.prognoz_pozitiv == 1)
        {
            global.company_hype[global.prognoz] += random_range(0.33, 1.5);
            if (global.company_hype[global.prognoz] < 0.2) global.company_hype[global.prognoz] = 0.3;
            global.company_hype_effect[global.prognoz] = irandom(15);
            scandal = global.company_name[global.prognoz];
            update_price(global.prognoz);
            global.prognoz_know = 0;
            create_notification(txt(87), txt(88));          // Scandal
        }
        if (global.prognoz_pozitiv == 0)
        {
            global.company_hype[global.prognoz] -= random_range(0.3, 1.2);
            global.company_hype_effect[global.prognoz] = -irandom(15);
            scandal = global.company_name[global.prognoz];
            update_price(global.prognoz);
            create_notification(txt(87), txt(88));
        }
        das = 0;
        global.prognoz = -1;
    }
}
```
⇒ The tip always pays out after **7–18 days** in the advertised direction, with a **±0.3…1.5 hype shock**
(`hype_effect` ±`U(0,15)` days of drift). **This is the only "actionable" prediction in the game with a
guaranteed sign.** `global.prognoz` is also used by `random_company()`? No — `random_company()` is used to
*pick* `prognoz`; note `o_control_Step_0.gml:2729` re-applies `update_price` after the `hype < 0.2` floor.

---

## 6. Summary of the news→price mapping (the formula)

```
                        news item
                             │
        ┌────────────────────┼────────────────────────────┐
        ▼                    ▼                            ▼
 company_hype +=Δh     company_profit +=Δp        company_price *= m
 (or *= m)             (+ company_profit_effect)   (rare, e.g. 2842, 5087)
        │                    │                            │
        └────────► update_price(comp) ◄───────────────────┘
                            │
   company_price  += company_price * 0.001 * company_profit        (update_price)
   company_price  += company_price * 0.0015 * company_profit * 1.5 (end-of-day loop)
                            │
   company_stockprice = company_price * 0.8 * company_hype * global.rynochek * global.trend
                            │
   price_stock(i) = company_stockprice[i] / company_number_a[i]   ← the number on screen & the chart
```

**Sign conventions:** `hype` is multiplicative in the final formula ⇒ **hype is the only lever that moves the
share price without touching `company_price`**. `company_price` is "fundamental" and grows with `profit`.

**Clamping summary [V]:**
| quantity | clamp |
|---|---|
| `company_hype` | floor `0.1` (set to `0.14` inside `update_price`/`update_price2`), mean-revert to `1.3` above `U(2,4)`, crash `×U(0.4,0.6)` above `60` |
| `company_profit` | pulled toward `0.39` above `0.39` (`lerp` 0.001–0.003) and toward `1.29` above `1.39` (`lerp` 0.001–0.03), `:1298-1310` |
| `company_price` | floor `4214` if below `1000` (`:1366-1369`) |
| `zmina` (update_price2) | **floor only**: `max(zmina, random_range(0.12, 0.34))` — no upper bound |
| `company_hype_effect` | forced to `−2` / `+1` on momentum flip inside `update_price2`; rounded to integer each day |
| `global.trend` | floor `0.3`, `clamp(trend_target, 0.7, 20)` |
| `global.rynochek` | floor `0.3` |
| `company_hype_effect` countdown | new `U(-8,8)` seed at p = 1/10 when it hits 0 |

---

## 7. The `logs` structure — VERIFIED by binary decode

**`logs` is the money ledger, not a news log.** **[V]**

`gml_GlobalScript_money_delete.gml:25-39`:
```gml
function add_log(arg0, arg1 = 0, arg2 = -1, arg3 = "")
{
    var data = global.mydata;
    var arra = [data, arg0, arg1, arg2, arg3];
    if (arg0 != 0)
    {
        ds_list_insert(global.logs, 0, arra);     // ← INSERT AT HEAD (newest first), skip zero amounts
    }
}
```
* `global.logs = ds_list_create();` — `gml_Object_o_control_Create_0.gml:293`; destroyed in `CleanUp:2`.
* `global.mydata = mydatetime;` is refreshed at the very top of every step — `o_control_Step_0.gml:3`.
* Saved with `ds_list_write`/`ds_list_read` (`gml_GlobalScript_savegame.gml:204`, `loadgame.gml:230`).

**Binary decode of `saveslot_auto.json` `[logs]` [V]:**

```
blob = 581 682 bytes  (= 145 420 float32-equivalents — this is where the "145 420" figure comes from)
header: 2F 01 00 00  (0x012F = DS_LIST marker) | 76 23 00 00 (count = 9078)
then 9078 × 60-byte records:
  u32 type = 2  (array)
  u32 count = 5
  ×5 × ( u32 type ; value )      type 0 = float64, type 1 = string (u32 len + UTF-8 bytes)
    [0] float64  = GameMaker date value      → 38452.916672453706  (≈ 2005-xx-xx)
    [1] float64  = amount (signed, RUB)      → e.g. -803500000.0
    [2] float64  = txt() id of the reason    → e.g. 1544.0
    [3] float64  = company index, -1 = none   → e.g. 11.0
    [4] string   = extra string (price etc.)
```

Histogram of field `[2]` in this save (37 distinct): `1548` "Daily expenses" ×3744, `1092` "Dividends" ×1948,
`1544` "Purchase of real estate" ×1391, `1394`/`1395` board/CEO salary ×734/106, `3811` "Investment" ×178,
`1557` "Profit from investment" ×139, `1541` "Borrowed assets" ×124, `670` "Real estate tax" ×124,
`25` "Income tax" ×124, `669` "Rental income" ×121, `1534` "Shares of `<arg0>` each" ×75,
`1539` "Unexpected expenses" ×70, …, `1275` "Unknown" ×4. Field `[3]` is `-1` for 6573 of 9078 entries.
⇒ **Zero news-shaped entries. Definitively a transaction log.** **[V]**

**Rendering [V]** — two views:
1. **"Kniga" (ledger) panel**, `gml_Object_o_control_Draw_0.gml:478-615`: trims to **1000 entries max**
   (`:479-486`: `while (ds_list_size(global.logs) > 1000) ds_list_delete(global.logs, 1000);`), filters by
   company (`filter >= 0` → only `arrrr[3] == filter`), by sign (`filterplus` 1 = expenses only, 2 = income only)
   and by reason (`filter_prychyna == 1` hides `1548` daily expenses). Draws 16 rows of
   `YYYY/M/D | string_thousands(amount) | txt(log_id) | company_name[company]`, `c_lime` when `amount > 0`.
2. **Hover tooltip** on the money HUD, `gml_Object_o_control_Draw_73.gml:366-384`: last **16** entries,
   truncated to 38 chars, ids `1534`/`1563` collapsed to `txt(1564)` "Shares".

**Chart ring buffer [V]:** `[chart] chart_series_data_0..29` — each blob is 1088 bytes =
8-byte DS header + **90 × (u32 type=0 + float64)**. Trim at `o_control_Step_0.gml:1516-1519`:
`if (ds_list_size(chart_series_data) > 90) ds_list_delete(chart_series_data, 0);` (and identically at
`update_price.gml:18-20`). Value stored = `company_stockprice[i] / company_number_a[i]` = `price_stock(i)`.
`[chart2] chart_series_data2_0..5` = the six commodities (`commodity_update.gml:36`).

---

## 8. Open questions / unverified

1. **`create_news_entry` / `news_archive`** — the body of `if (news > 0) { }` is empty in the decompile.
   It is possible the GML compiler eliminated a call that was itself dead, but the more likely reading is
   the archive feature was gutted. **Not recoverable** from this dump without the original VM bytecode.
   Same for the four `__struct___28/29@create_news_entry@create_notification` child stubs, which all failed to decompile.
2. **`chart_add_data`** has no definition anywhere in `D:\stonks-re\full\code\` — it comes from a bundled
   chart library (asset library, not a GML asset). Its exact trimming behaviour is inferred from call sites only.
3. **`relerp`, `round_fixed`, `realfix`, `median`, `string_data`, `choose`, `scr_knyha`** are engine/library helpers.
   `choose()` is documented by GM as returning a uniformly random *one* argument; the code at
   `gml_GlobalScript_comp_bad_luck.gml`-call sites (`buttonss_dialogs.gml:379`) uses `choose(a,a,a,b)` to get
   **3:1 odds**, which is consistent.
4. **`global.mode`** — never initialised in `o_control_Create_0.gml`; it is only in the save list
   (`o_cursor_Create_0.gml:211`). The mode that a fresh game starts in was not determined from this dump.
5. **`company_vsovete` semantics** — values 0/1/2 map to different insider-news wordings (board member /
   director / CEO, per text 2742–2745) but the exact mapping of `1` is not stated anywhere in code.
6. **`prohnoz_company` `-1` prediction class is unreachable** — verified dead code, but the *intended*
   thresholds (the duplicated `arg1 == -1` blocks at `:125` and `:140` with cut-offs 0.99/0.8/0.6 and
   0.99/0.68/0.5) show the designer's two revisions of a bearish forecast. The intent is unrecoverable.
7. **Effective frequency of §3.1 news** — the `myday in 4..18` window and the interaction between the three
   branches of the `else if` chain mean my "20–35 days" estimate is a Monte-Carlo-free derivation, not a measurement.
   A headless run would settle it.
8. **Dead branches found (verified, not inferred):**
   * `irandom(2) == 2` — `gml_GlobalScript_delete_company.gml:32`. `irandom(n)` returns `0…n-1`, so
     `company_banrupt_or_not()` **always** calls `company_banrupt()`. The apparent "50 % rescue via reverse
     split" never happens. Design intent unrecoverable.
   * `prohnozio`'s `prohnozzo == -1` class — `gml_GlobalScript_prognozio.gml:14`. Condition
     `profit < -0.2 && profit < -0.5` ⇔ `profit < -0.5`, already claimed by case `-2`.
   * `prohnoz_company`'s two `if (arg1 == -1)` blocks (`:125`, `:140`) — unreachable for the same reason.
   * By contrast, `irandom(4) == 1` at `o_control_Step_0.gml:1100` is **live** (1/4 chance) — checked to avoid
     a false positive.
9. **`checknew` case 2** in the sector switch produces a silent no-op 1/10 of the time (`checknew = irandom(10)`
   but the switch starts at `case 3` after `case 1`). Whether that was intentional (a "nothing happens" outcome)
   or a padding bug is unknown.
10. **Localisation coverage** — `stonks.csv` column 1 is English; the `<...>` placeholders were resolved from
    the English column. The other language columns may use different placeholder names, which would make
    `scr_text` fail in non-English modes. **Not verified** (those columns decode as `?` in this shell).
