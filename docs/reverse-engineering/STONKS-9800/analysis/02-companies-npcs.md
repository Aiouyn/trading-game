# STONKS-9800 — Subsystem 02: Company Simulation, Company Generation, NPC/Human Generation

**Source:** `D:\stonks-re\full\code\` (decompiled GML), localization `D:\Games\STONKS-9800 Stock Market Simulator\stonks.csv` (UTF-8, tab-separated: `id \t English \t JP \t ...`).
**Notation:** every formula is quoted verbatim from the decompiled GML with `file.gml:LINE`. `local_xxx` (unqualified) variables are instance-local (fields of `o_control`, `o_meeting`, `o_human`, …). `global.*` are globals.

**Legend**
- ✅ **VERIFIED** — read directly from code.
- 🟡 **INFERRED** — semantics deduced from usage/UI strings, not explicitly named in code.
- ❓ **UNRESOLVED** — could not determine; see "Open questions".

---

## 0. TL;DR of the subsystem

| Concern | Where |
|---|---|
| Number of companies | `6 + level_diff[5]` → 6..8 at start (`gml_Object_o_pc_menu_Step_2.gml:6`), hard cap **30** slots (`for (var i = 0; i < 30; i++)`) |
| One company tick | `o_control.Step` (event `Step`), day-boundary block starting at `gml_Object_o_control_Step_0.gml:112` (`timer > 100`), company loop at `:1074` |
| Monthly close | `myday == 20` (`gml_Object_o_control_Step_0.gml:3037`), extra profit drift on `myday == 21` (`:3321`), monthly maintenance in `o_control.Alarm[1]` |
| Player-company tick | `mycompany_step()` (`gml_GlobalScript_mycompany_step.gml`), called at `gml_Object_o_control_Step_0.gml:1551` |
| Department effectiveness | `o_control.Alarm[1]` `gml_Object_o_control_Alarm_1.gml:442-582` |
| Humans | `s_human_generate()` (`gml_GlobalScript_s_human_generate.gml:1`), daily per-human loop `gml_Object_o_control_Step_0.gml:~330-601` |

---

## 1. Calendar / tick structure

- Game clock: `mydatetime = date_create_datetime(1979, 12, 31, 0, 0, 0)` — `gml_Object_o_control_Create_0.gml:416`.
- One in-game day advances when `timer > 100 || startgame2 == 1` → `mydatetime = date_inc_day(mydatetime, 1); timer = 0;` (`gml_Object_o_control_Step_0.gml:112,127-130`).
- `holyday` is set by `check_day_now()` → `get_holiday()` (`gml_GlobalScript_get_holiday.gml:1,48`). Japanese public holidays + weekends (`weekday == 6 || weekday == 0`, `:301`).
- Company ticks are gated on:
  - `if (holyday == 0)` — company daily block `gml_Object_o_control_Step_0.gml:1076`
  - `if (holyday == 0 || (global.parttimework_days > 0 && myweekday > 0 && myweekday <= 3))` — hype/profit drift `:1222`
  - `if (myweekday > 0 && myweekday < 6)` — Mon..Fri (non-weekend) `:1224`
  - `mycompany_step()` is only called on working days: `if (holyday == 0 && myweekday > 0 && myweekday < 6)` `:1546-1552`
- Market indices: `global.rynochek` (日经 / Nikkei-like index, per-day mean-reverting random walk) and `global.trend` (macro bull/bear multiplier).
  - `global.rynochek = random_range(0.98, 1.02)` (`:745`), daily `global.rynochek += random_range(0.003,0.01)` if `rynok_up==1` else `-= random_range(0.003,0.01)` (`:131-138`); mean-reversion flags at `:139-146`; floor `global.rynochek = 0.3` (`:1442-1445`).
  - `global.trend = 1` (`:424`); daily `global.trend += random_range(-0.01, 0.01)` (`:785`); floor `0.3` (`:1438-1441`); recovery `if (global.trend < 0.7) global.trend = lerp(global.trend, 1, 0.005)` (`:1446-1449`); era modifiers by year (`:1200-1221`, `:833-907`).
  - Per-frame helper: `koef_trend = relerp(0.7, 10, global.trend, 1, 2)` (`gml_Object_o_control_Step_1.gml:45`).
  - `relerp(a,b,x,y,z) = (((x - a) / (b - a)) * (z - y)) + y` (`gml_GlobalScript_relerp.gml:1-4`); `relerp_limit` adds a clamp (`:6-8`).

---

## 2. State-schema mapping

### 2.1 `[company]` section of the save (1380 vars, `gml_GlobalScript_savegame.gml:154-187`)

Persisted per-company scalars (30 slots each):

| Save key | Global | Meaning |
|---|---|---|
| `company_name_N` | `global.company_name[N]` | Company name (string) |
| `company_price_N` | `global.company_price[N]` | **Enterprise/valuation price** (total, in ¥) |
| `company_stockprice_N` | `global.company_stockprice[N]` | **Market cap of all shares** (total, in ¥) |
| `company_number_a_N` | `global.company_number_a[N]` | **Total shares outstanding** |
| `company_ac_N` | `global.company_ac[N]` | **Player's shares** |
| `company_hype_N` | `global.company_hype[N]` | Public hype / popularity multiplier (≈0.1 … 3) |
| `company_hype_effect_N` | `global.company_hype_effect[N]` | **Hype momentum** — decays 1/day toward 0, each step nudging hype |
| `company_profit_N` | `global.company_profit[N]` | **Profit ratio** (fraction of valuation per month; can be negative) |
| `company_profit_effect_N` | `global.company_profit_effect[N]` | **Profit momentum** — same decay semantics as hype_effect |
| `company_sovet_N` | `global.company_sovet[N]` | **Reputation / approval rating**, labelled `txt(512)="Your reputation"`, `txt(1397)="Approval Rating"`. Clamped `[1.6, 100]` for the player. |
| `company_control_N` | `global.company_control[N]` | **% of shares needed for control**, initialised `random_range(33, 50)` |
| `company_vsovete_N` | `global.company_vsovete[N]` | 0 = NPC-run, 1 = ex-player CEO company, 2 = player is CEO |
| `company_color_N` | `global.company_color[N]` | Chart colour |
| `company_rashod_N` | `global.company_rashod[N]` | **Player's realized trading EXPENSES** (money spent buying shares) |
| `company_dohod_N` | `global.company_dohod[N]` | **Player's realized trading INCOME** (money from selling shares) |
| `company_short_N` | `global.company_short[N]` | **Player's short position** (negative shares) |
| `company_since_N` | `global.company_since[N]` | Founding **year** |
| `ac_vchera_N` | `ac_vchera[N]` | Player's shares yesterday (for wash-trade detection) |
| `dohodnachalogoda_N` | `dohodnachalogoda[N]` | Prior-year net profit |
| `lastdohod_N`, `lastprice_N`, `lastdate_N` | `lastdohod[N]`, `lastprice[N]`, `lastdate[N]` | Last monthly dividend-per-share, last share price, label |
| `dohodmesyac_N_M` | `dohodmesyac[N][M]` | Monthly **dividend per share** history (M = month 0..11) |
| `dohodmesyac_all_N_M` | `dohodmesyac_all[N][M]` | Monthly **net profit** (company-wide) history |

> ✅ `dohodmesyac_N_M` / `dohodmesyac_all_N_M` key layout VERIFIED at `gml_GlobalScript_savegame.gml:180-181`. The `M` index is the **month** (`date_get_month(mydatetime)`), not a company sub-index — the save file contains 30 of each (0..29).

### 2.2 NOT in `[company]` but part of company state (saved in `[global]` / `[arrays]`)

Saved via `global.saveglobalvars` / `global.savearrayvars` (`gml_Object_o_cursor_Create_0.gml:211,215`):

| Global | Meaning |
|---|---|
| `global.numberofcompany` | Number of live company slots in use (6..30) |
| `global.company_liq[N]` | 1 = slot liquidated (can be reused) |
| `global.company_field[N]` | Sector index (see §3.1) |
| `global.company_char[N][0..4]` | 5 company stats (see §3.2) |
| `global.big_data[N][0..3]` | 4 budget split percentages (see §3.3) |
| `global.company_rezerv[N]` | Company cash reserves |
| `global.company_points[N]` | R&D / "research points" currency |
| `global.company_limit[N]`, `global.company_limit_kil[N]` | Free-float ratio and free-float share cap |
| `global.company_control[N]`, `global.company_name_rezerve[N]`, `global.company_kupleno[N]`, `global.company_riznycya[N]`, `global.company_checkdays[N]`, `global.company_days_without[N]`, `global.company_days_without_buy[N]`, `global.company_predupr_bankrupt[N]`, `global.company_go_in_rada[N]`, `global.company_create_player[N]`, `global.company_tyzhden[N]`, `global.company_dohod2[N]`, `global.company_ac_bought_number[N]`, `global.company_ac_average[N]`, `global.company_prohnoz[N]`, `global.company_days_after_yakuza[N]`, `global.company_limit_kil_perk[N]`, `global.company_oldstockprice[N]`, `global.company_oldnumber_a[N]`, `global.full_dohod_company_for_year[N]` | M&A / FSA / chart bookkeeping (see §8) |

### 2.3 `[people]` section (803 vars)

Only **one** key family is stored: `human_list_N` — a hex dump of `global.human_list[N]` (`gml_GlobalScript_savegame.gml:195-199`). Everything else about a human lives in `[arrays]`:

`human_intelligence`, `human_charisma`, `human_precision` (core stats 0..100), `human_stamina`, `human_nastriy` (morale), `human_xp` (experience 0..100), `human_price` (salary), `human_desired_price`, `human_zp_echo`, `human_days_off`, `human_longbad`, `human_friend`, `human_bio`, `human_type`, `human_hyst`, `human_yakuza`, `human_cultist`, `human_point_intelligence/_precision/_charisma`, `human_new`, `human_sex`, `human_name`, `human_surname`, `human_telephone`, `human_talking`, `human_talking_today`, `human_face/_eye/_hair/_rot/_body/_nose`, `global.humannew` (candidate pool), `global.human_kol` (population, 800), `global.human_kol2` (=2, unique NPCs).

**Job representation.** `human_work_add(human, prof, company)`:
```gml
// gml_GlobalScript_human_work_add.gml:1-5
function human_work_add(arg0, arg1, arg2)
{
    ds_list_insert(global.human_list[arg0], 0, string(arg1) + "_" + string(arg2));
}
```
→ `human_list[h]` is a list of `"<prof>_<companyIndex>"` strings, **newest first** (index 0). `get_work_human(h,0)` parses the profession; `get_workplace_human(h,0)` parses the company index (returns `-1` when `prof >= 100`, i.e. non-company jobs) — `gml_GlobalScript_get_work_human.gml:1`, `gml_GlobalScript_get_workplace_human.gml:1`.

### 2.4 Profession (`prof`) code table — ✅ VERIFIED

From `get_potential_viddil()` (`gml_GlobalScript_get_potential_viddil.gml:77-168`) and `get_numb_work_for_viddil()` (`:1-75`):

| prof | Meaning | Department (viddil) index |
|---|---|---|
| 1 | CEO / Director (`txt(539)` "CEO") | 0 (Headquarters) |
| 2 | Board member (`txt(507)`) | 0 |
| 3 | Board member (alias — `find_people` maps `deistv == 3` → 2) | 0 |
| 10, 20, 21, 22, 23, 24 | (sub-roles, same dept) | 1 (Operations) |
| 12, 17, 18, 19 | (sub-roles) | 2 (Sales & Marketing) |
| 13, 25, 26, 27 | (sub-roles) | 3 (R&D) |
| 28, 29, 30 | (sub-roles) | 4 (HR) |
| 11, 16, 31, 32 | (sub-roles) | 5 (Finance) |
| 14, 15, 33, 34 | (sub-roles) | 6 (IT & Systems) |
| 35 | hired by player (`scr_hire` → `human_work_add(hireid, 35, player_compnumber)`) | ❓ not mapped by `get_potential_viddil`; reassigned by `scr_rozkydaty_po_viddilam` |
| 133 | player unemployed (`human_work_add(0, 133, 0)`) | n/a |
| 134 | fired / "bomzh" (`human_work_add(x, 134, 0)`) | n/a |
| 200, 201 | unique NPCs (Amy, Koba) | n/a |
| 101…137 | generic "other company" jobs (`global.work_num_max = 137`, `global.work_num_ma2x = 34`, `gml_GlobalScript_s_human_generate.gml:52-53`) | n/a |

> 🟡 The exact job *titles* of profs 10-34 are not named in code. `get_info_human()` maps them to strings; I did not fully enumerate that mapping.

`get_numb_work_for_viddil(i)` returns a **random** valid prof for department `i` from the sets above (`:73-74`).

---

## 3. Index-meaning tables

### 3.1 `global.company_field[N]` — sectors (0..7) ✅

`global.company_field[arg0] = irandom(7)` — `gml_GlobalScript_generate_company.gml:46`. Names from `get_field(arg0) = txt(1183 + arg0)` (`gml_GlobalScript_get_field.gml:1`):

| idx | Name (EN, from `stonks.csv`) | Description (txt 4171+) |
|---|---|---|
| 0 | Industrial | Factories, machines, vehicles, big infrastructure |
| 1 | Technology | Electronics, computers, gadgets |
| 2 | Pharmaceuticals | Medicine, health supplies, chemical labs |
| 3 | Financial | Banks, investments, offices, business services |
| 4 | Food | Farming, fishing, food processing, everyday goods |
| 5 | Entertainment | Arcades, pachinko, manga, TV, clubs |
| 6 | Energy | Coal, oil, power plants |
| 7 | Telecommunications | Phones, TV, signal networks |

Sector aggregates `global.field_hype[0..10]`, `global.field_profit[0..10]` (11 slots; only 0..7 are used by companies) decay toward 0 by 1/day (`gml_Object_o_control_Step_0.gml:1553-1571`) and shift every company's hype/profit (`:1312-1328`).

`check_names()` overrides a few themed companies' sector (`gml_Object_o_control_Create_0.gml:599-631`):
`"Ninento"→5, "Tenso"→4, "Naikin"→1, "Tomota"→4, "Suberu"→4, "Mirubisi"→4, "Lissan"→4, "Homda"→4, "MHK"→7, "Hardbank"→3`.

### 3.2 `global.company_char[N][0..4]` — 5 company stats ✅ / 🟡 semantics

Set in `generate_company()` (`gml_GlobalScript_generate_company.gml:87-91`), consumed mainly in `mycompany_step()`.

| idx | Initial NPC value | Player init | Source of truth | 🟡 Meaning |
|---|---|---|---|---|
| 0 | `irandom_range(30, 70)` | 30 (`s_create_company.gml:67`) | `emp_nastriy_median` of employees (`mycompany_step:375-380`) | **Employee morale / workforce satisfaction** |
| 1 | `irandom_range(30, 70)` | 30 (`:68`) | `lerp(char[1], mycomp_effective[1]/max_best, 0.02)` (`:14`) | **Production / Operations output** (Operations dept effectiveness) |
| 2 | `irandom_range(30, 70)` | 0 (`:69`) | `lerp(char[2], mycomp_effective[3]/max_best, 0.02)` (`:397`) | **R&D / innovation** (R&D dept effectiveness) |
| 3 | `irandom_range(30, 70)` | 0, then forced to **50** (`:115`) | `lerp(char[3], mycomp_effective[2]/max_best, 0.03)` (`:166`) | **Marketing / brand reach** (Sales & Marketing dept effectiveness) |
| 4 | `lerp(0.13, 3, hype) * 100` → 13…300 | same (`:71`) | `lerp(char[4], clamp(relerp(0.08,1.4,hype,0,100),0,100), 0.03)` (`:251-253`) | **Brand reputation / popularity** (drives `company_investors_koef` and firing risk) |

🟡 `char[2]` is described in `situation_*` and by `txt(2537)` "expand our research department", and `char[3]` is fed by marketing — but the code names them only by index. The mapping to names above is derived from the `mycomp_effective[]` indices and UI hints, not from an explicit label.

### 3.3 `global.big_data[N][0..3]` — budget split ✅ / 🟡

Built once at creation (`gml_GlobalScript_generate_company.gml:62-85`, duplicated at `gml_Object_o_control_Create_0.gml:712-735`):

```gml
var values = [25, 25, 25, 25];
var new_value = (global.diff_profit * 100) + irandom_range(-3, 3);
var total = 100 - new_value;
values[0] = new_value;
...
values[ich] = floor(total * (values[ich] / rest_values_total));   // redistribute remainder over 1..3
...
global.big_data[arg0] = values;
```

| idx | 🟡 Meaning (from usage) | Verbatim consumer |
|---|---|---|
| 0 | **Dividend payout ratio %** (drives `dohodmesyac`) — initialised from the `diff_profit` difficulty setting | `dohodmesyac[i][month] = global.company_price[i] * global.company_profit[i] * (global.big_data[i][0] / 100)` (`Step_0:3057`) |
| 1 | **R&D allocation %** | `pointt = round(max(0, round(dohodmesyac_all[i][m] * (((big_data[i][1]/100) * company_char[i][2]) / 100) * 0.000001)) * …)` (`Step_0:3114/3118`) |
| 2 | **Marketing / market-expansion allocation %** | `all_market_money = dohodmesyac_all[i][m] * (big_data[i][2]/100)` (`Step_0:3079`) |
| 3 | **Reserve allocation %** | `var rezeerv = dohodmesyac_all[i][m] * (global.big_data[i][3] / 100);` (`Step_0:3095`) |

> ❌ The player company hardcodes `[25,25,25,25]` (`gml_GlobalScript_s_create_company.gml:65`); the NPC version uses `diff_profit*100 ± 3`. NeoSun/narko also use `[25,25,25,25]`.

### 3.4 `global.level_viddil[0..7]` — departments ✅

Initialised `0` for 8 slots, then `global.level_viddil[0] = 1` (`gml_Object_o_control_Create_0.gml:536-544`). Player company: `level_viddil[1..6] = 0`; if start mode 1 → `[0]=2, [1]=1, [2]=1` (`gml_GlobalScript_s_create_company.gml:103-112`). When the player takes over an existing NPC company: `[0..4] = irandom_range(1,3)`, `[6]=[7]=irandom_range(0,2)`, `[8]=0` (`gml_GlobalScript_check_new_director.gml:88-94`).

| idx | Object | Name (txt) | Achievement key | Upgrade hint text ids |
|---|---|---|---|---|
| **0** | `o_comp_main` | `txt(2090)` **Headquarters** | `comp_v_head` | 2591-2594 |
| **1** | `o_comp_oper` | `txt(2091)` **Operations** | `comp_v_op` | 2595-2598 |
| **2** | `o_comp_sale` | `txt(2092)` **Sales & Marketing** | `comp_v_marketing` | 2599-2602 |
| **3** | `o_comp_rnd` | `txt(2093)` **Research & Development** | `comp_v_rnd` | 2603-2606 |
| **4** | `o_comp_hr` | `txt(2094)` **Human Resources** | `comp_v_hr` | 2607-2610 |
| **5** | `o_comp_finance` | `txt(2095)` **Finance** | `comp_v_fin` | 2611-2614 |
| **6** | `o_comp_it` | `txt(2096)` **IT & Systems** | `comp_v_it` | 2615-2618 |
| 7 | — | unused slot (still allocated) | — | — |

Sources: `gml_Object_o_comp_main_Create_0.gml`, `…_oper_…`, `…_sale_…`, `…_rnd_…`, `…_hr_…`, `…_finance_…`, `…_it_…`; achievement-key mapping at `gml_Object_o_control_Alarm_1.gml:531-558`.

**Slot capacity:** `mycomp_workers[i]` may hold at most `global.level_viddil[i]` employees — enforced by `scr_rozkydaty_po_viddilam` (`gml_GlobalScript_scr_hire.gml:117-129`):
```gml
var lvl_viddil = global.level_viddil[number_h];
if (number_h == 0) { lvl_viddil = 3; }             // HQ always allows 3
if (array_length(global.mycomp_workers[number_h]) < lvl_viddil)
{ array_insert(global.mycomp_workers[number_h], 0, sovets0[i]); }
```
✅ Head Office capacity is hard-wired to **3** (also `gml_Object_o_comp_building_Draw_73.gml:82-85`: `leveltreba = 3 + min(3, round(all_levels_comp / 5))` for the *displayed* HQ slots).

> ⚠️ `get_potential_viddil()` maps prof **27 → dept 3**, but `scr_rozkydaty_po_viddilam()` maps **27 → dept 4** (`gml_GlobalScript_scr_hire.gml:89-91`). This is a genuine inconsistency in the original; both are quoted above.

**Upgrade cost** (`gml_Object_o_comp_building_Draw_73.gml:121-164`), paid from `company_rezerv`:
```gml
if (idd == 6) {          // IT
    level 0 → 1_000_000_000 ; 1 → 5_000_000_000 ; 2 → 10_000_000_000 ; 3 → 20_000_000_000
} else {
    level 0 → 100_000_000 ; 1 → 500_000_000 ; 2 → 3_000_000_000 ; 3 → 10_000_000_000
}
if (global.upgrades_halyava_days > 0) { priceviddil *= 0.6; }
```

### 3.5 `global.mycomp_effective[0..6]` — department effectiveness ✅

Computed monthly in `o_control.Alarm[1]` for the player's company, per department:

```gml
// gml_Object_o_control_Alarm_1.gml:429-530
var morale = global.company_char[global.player_compnumber][0];
var morale_koef = min(1.1, relerp(0, 100, morale, 0.8, 1.5));
...
for (var i = 0; i < 7; i++)
{
    var eff = 0;
    global.mycomp_workers[i] = array_unique(global.mycomp_workers[i]);
    for (var o = 0; o < array_length(global.mycomp_workers[i]); o++)
    {
        var worker = global.mycomp_workers[i][o];
        var where  = get_work_human(worker, 0);
        if (get_workplace_human(worker, 0) != global.player_compnumber) { array_delete(...); exit; }
        if (get_potential_viddil(where) != i) { human_work_add(worker, get_numb_work_for_viddil(i), global.player_compnumber); }
        array_insert(myworker_nachalnyky, -1, worker);
        if (global.human_friend[worker] < 5) { change_friend(irandom_range(4, 7), worker); }
        var hum_int   = global.human_intelligence[worker] * koef_hum_int[i];
        var hum_prec  = global.human_precision[worker]    * koef_hum_prec[i];
        var hum_char  = global.human_charisma[worker]     * koef_hum_char[i];
        var hum_sta   = clamp(relerp(0, 200, global.human_stamina[worker] + global.human_nastriy[worker], 0.25, 1.3), 0, 1.1);
        var hum_dosvid      = min(1, relerp(0, 100, global.human_xp[worker], 0.75, 1.25));
        var hum_dosvid_mini = min(1, relerp(0, 100, global.human_xp[worker], 0.85, 1.2));
        var full_power = round((hum_int + hum_prec + hum_char) * hum_sta * hum_dosvid_mini) * 0.9;
        if (global.mycomp_level_bonus[4] > 1) {
            if (global.mycomp_level_bonus[6] > 1) { if (global.human_days_off[worker] > 0) { full_power = full_power * 1; } }
            else if (global.human_days_off[worker] > 0) { full_power = full_power * 0.5; }
        } else if (global.human_days_off[worker] > 0) { full_power = full_power * 0.1; }
        if (global.company_strike == 1) { full_power = 0.06; }
        var hyst_nom = -1;
        switch (i) { case 0: hyst_nom = 1; break; case 1: hyst_nom = 3; break; case 2: hyst_nom = 2; break;
                     case 3: hyst_nom = 4; break; case 4: hyst_nom = 5; break; case 5: hyst_nom = 6; break; case 7: hyst_nom = 7; break; }
        if (global.human_hyst[worker] == hyst_nom) { full_power += round(25 * hum_dosvid); }
        eff += round(full_power * morale_koef * 0.3);
    }
    global.mycomp_effective[i] = eff;
    if (i == 0) { global.mycomp_effective[i] = round(global.mycomp_effective[i] * 0.67); }
    global.mycomp_effective[i] = clamp(global.mycomp_effective[i], 0.1, 100);
    ...
}
all_levels_comp = global.level_viddil[0] + … + global.level_viddil[6];
max_workers = min(78, (all_levels_comp * 3) + 2);
```

**Per-department stat weights `koef_hum_*[i]`** — ✅ `gml_Object_o_control_Create_0.gml:902-922`:

| i | Department | `koef_hum_int` | `koef_hum_prec` | `koef_hum_char` |
|---|---|---|---|---|
| 0 | Headquarters | 0.35 | 0.30 | 0.35 |
| 1 | Operations | 0.15 | **0.70** | 0.15 |
| 2 | Sales & Marketing | 0.20 | 0.05 | **0.75** |
| 3 | R&D | **0.60** | 0.20 | 0.20 |
| 4 | Human Resources | 0.15 | 0.30 | 0.55 |
| 5 | Finance | 0.50 | 0.40 | 0.10 |
| 6 | IT & Systems | 0.40 | 0.35 | 0.25 |

**Hysteresis bonus** (`human_hyst[i]`): if the worker's assigned "hype type" matches the department's nominal type, `full_power += round(25 * hum_dosvid)`. Mapping dept → nominal hyst: `0→1, 1→3, 2→2, 3→4, 4→5, 5→6, 7→7` (note: **dept 6 has no mapping**).

**`global.mycomp_level_bonus[i]`** — derived bucket from effectiveness, ✅ `gml_Object_o_control_Alarm_1.gml:559-579`:
```gml
if (global.mycomp_effective[i] <  10) global.mycomp_level_bonus[i] = 0;
if (global.mycomp_effective[i] >= 10) global.mycomp_level_bonus[i] = 1;
if (global.mycomp_effective[i] >= 40) global.mycomp_level_bonus[i] = 2;
if (global.mycomp_effective[i] >= 70) global.mycomp_level_bonus[i] = 3;
if (global.mycomp_effective[i] >=100) global.mycomp_level_bonus[i] = 4;
```
Used as a perk tier everywhere (`mycomp_level_bonus[0]`=HQ, `[1]`=Ops, `[2]`=S&M, `[3]`=R&D, `[4]`=HR, `[5]`=Finance, `[6]`=IT).

**`all_levels_comp`** — ✅ `gml_Object_o_control_Alarm_1.gml:581`: `sum(level_viddil[0..6])` (slot 7 excluded). Initialised to 1 at `gml_Object_o_control_Create_0.gml:377`.

**`koef_happy_HR`** — ✅ `gml_GlobalScript_mycompany_step.gml:141-147`:
```gml
var max_best_level2 = max(1, all_levels_comp / 6);
var level_HR = global.level_viddil[4];
koef_happy_HR = max_best_level2 / global.level_viddil[4];
if (global.level_viddil[4] == 0) { koef_happy_HR = 1; }
```
i.e. 🟡 "how under-staffed is HR relative to the rest of the company". Used at `gml_Object_o_control_Step_0.gml:407-411`: when `koef_happy_HR > 1` (HR is the bottleneck) every employee loses `koef_happy_HR * 0.02` morale and `koef_happy_HR * 0.005` stamina **per day**.

### 3.6 `global.company_vsovete[N]` ✅

| value | meaning |
|---|---|
| 0 | NPC-run company |
| 1 | Formerly player-led; player resigned/fired (`b_comp_resign_yes` sets 1, `gml_GlobalScript_scr_management.gml:217`) |
| 2 | Player is the current CEO (`s_create_company.gml:80`, `check_player_is_ceo`, `gml_GlobalScript_check_new_director.gml:123`) |

Used for: monthly CEO salary income (1 → `max(500000, round(price/50000000)*10000)`, 2 → `max(1000000, round(price/25000000)*10000)`; `gml_Object_o_control_Step_0.gml:3061-3077`), and `company_sovet` decay (vsovete 2 → `company_sovet -= random_range(0.01,0.1)` per day, `:1381-1384`).

### 3.7 `global.human_type[i]` ✅ — `gml_GlobalScript_s_human_generate.gml:55-92`

Determined from sex + intelligence/charisma thresholds of 50:

| type | sex | INT | CHAR | Bio text range |
|---|---|---|---|---|
| 0 | 0 (M) | <50 | <50 | 2140-2159 |
| 1 | 0 | ≥50 | <50 | 2161-2180 |
| 2 | 0 | <50 | ≥50 | 2182-2201 |
| 3 | 0 | ≥50 | ≥50 | 2203-2222 |
| 4 | 1 (F) | <50 | <50 | 2224-2243 |
| 5 | 1 | ≥50 | <50 | 2245-2264 |
| 6 | 1 | <50 | ≥50 | 2266-2285 |
| 7 | 1 | ≥50 | ≥50 | 2287-2306 |

Recomputed monthly in `o_control.Alarm[1]` (`gml_Object_o_control_Alarm_1.gml:~215-245`), so the type follows the (growing) stats.

### 3.8 `global.human_hyst[i]` ✅ — `gml_Object_o_control_Alarm_1.gml:262-368`

Monthly roll if `human_hyst <= 0`. Deterministic-by-prof choice tables, e.g. `case 10: hyst = choose(3, 8)`, `case 11: choose(6, 8)`, `case 12: choose(2, 8)`, `case 13: choose(4, 8)`, `case 14/15: choose(7,8)`, `case 16: choose(6,8)`, `case 17-19: choose(2,8)`, `case 20-24: choose(3,8)`, `case 25-27: choose(4,8)`, `case 28-30: choose(5,8)`, `case 31-32: choose(6,8)`, `case 33-34: choose(7,8)`; prof 1 → `choose(1,1,8,irandom_range(2,7))`; prof 2/3 → `choose(1,8,irandom_range(2,7))`; default → `choose(8, irandom_range(1,9), irandom_range(1,9), 9, 8, 8, irandom_range(1,9))`.

🟡 `human_hyst` values 1..7 are the employee's "passion type"; matching it against the department gives the +25 XP-weighted power bonus (see §3.5). Value 8 = "indifferent", 9 = yakuza-related.

---

## 4. Company generation

### 4.1 World bootstrap — ✅ `gml_Object_o_control_Create_0.gml`

```gml
global.human_kol = 800;
s_human_generate(global.human_kol);                      // :421-422
...
global.rynochek = random_range(0.98, 1.02);              // :745
for (var i = 0; i < 30; i++) { global.company_price[i] = random_range(366618720, 3666739920); }   // :746-749
for (var i = 0; i < global.numberofcompany; i++) { generate_company(i); }                         // :750-753
```
- `neudach = irandom(global.numberofcompany - 1); udach = neudach + 1;` (`:739-744`) — one company is forced to lose money, one to be very profitable (used by `generate_company`).
- Base company names (`companies_list`, shuffled at `:517`):
  `"Suberu", "GemuStop", "Ninento", "Sani", "Panasenic", "Tomota", "Ikuzu", "NT", "Banbai", "Capcon", "Kadome", "Komami", "Mega", "MHK", "Mirubisi", "Meibu", "Abazu", "Keiwa", "Circle", "Epix", "Takesaka", "Hardbank", "Yamana", "Hisachi", "Ponika", "Lissan", "SMK", "Toshima", "Kanon", "Shark", "Asai", "Calio", "Ternox", "Fushitsu", "ASCII.", "Malda", "Homda"` — 37 names (`:507`).
- Reserve name pool `global.rezevr_names` (25 names, `:528`, shuffled at `:534`): `"Naikin","Tenso","EchoMecha","Seven","SunElect ","KoiTea","DragonSoft","Hexon","Midec","CultureB","Mabarake","Don","Alice","Data West","Dainax","VisArts","Nova","Slava","J.C.","Quest","Ark","Strike","Orc","Chusoft","Royale","Rock"`. Refilled by 77 `generate_name_company()` calls + `array_unique` when `< 2` left (`gml_Object_o_control_Alarm_1.gml:56-65`).
- Special NPC names: narko company from `["Yakubutsu","Iho","Drugs Inc","Shinpi","Mystic","YareYare","Mimoyo"]` (`gml_GlobalScript_s_narko.gml:13`); NeoSun is always `"NeoSun El."` (`gml_GlobalScript_buy_neosun.gml:43`).
- **Founding year** for initial NPCs: `global.company_since[i] = irandom_range(1889, 1970)` — `gml_Object_o_control_Create_0.gml:638`.
- Each NPC gets a CEO + 3-5 board members: `human_work_add(<h>, 1, i)` for a randomly chosen human, then `repeat (irandom_range(3, 6)) human_work_add(<h>, 2, i)` (`:639-649`). CEO stats are boosted: stamina `irandom_range(40,99)`, INT `irandom_range(40,88)`, CHAR `irandom_range(40,100)` (`:641-643`).
- `global.company_tyzhden[i] = i + 10` — the week-of-year on which company `i` holds its board meeting (`:569`); meetings fire on Thursday of that week (`gml_Object_o_control_Step_0.gml:2341-2353`).

### 4.2 `generate_company(arg0)` — ✅ `gml_GlobalScript_generate_company.gml:8-107`

```gml
global.company_liq[arg0]   = 0;
global.company_short[arg0] = 0;
global.company_riznycya[arg0] = 0;
if (global.nikkei_price == 0) { global.company_price[arg0] = random_range(1933237440, 6722356520); }
else                        { global.company_price[arg0] = global.nikkei_price * random_range(0.5, 0.9); }
global.company_hype[arg0]   = random_range(0.88, 1.1);
global.company_profit[arg0] = random_range(-0.2, 0.38);
if (neudach == arg0) { global.company_profit[arg0] = random_range(-0.38, -0.01); }
if (udach   == arg0) { global.company_profit[arg0] = random_range(0.4, 0.7); }
global.company_hype_effect[arg0] = irandom_range(-5, 5);
global.company_price[arg0] = global.company_price[arg0] + (global.company_price[arg0] * 0.01 * global.company_profit[arg0]);
global.company_stockprice[arg0] = global.company_price[arg0] * 0.8 * global.company_hype[arg0] * global.rynochek * global.trend;
global.company_number_a[arg0] = irandom_range(362200, 401800);
global.company_ac[arg0] = 0;
global.company_ac_average[arg0] = 0;
global.company_limit[arg0] = min(1, global.min_all_limit + random(0.170001));
global.company_limit_kil[arg0] = round(global.company_limit[arg0] * global.company_number_a[arg0]);
global.company_limit_kil_perk[arg0] = global.company_limit_kil[arg0] * random_range(1.05, 1.08);
global.company_field[arg0] = irandom(7);
global.company_create_player[arg0] = 0;
global.company_go_in_rada[arg0] = 1;
global.company_days_after_yakuza[arg0] = -1;
global.company_days_without_buy[arg0] = 0;
global.company_predupr_bankrupt[arg0] = 0;
global.company_days_without[arg0] = 0;
global.company_sovet[arg0] = 0;
global.company_profit_effect[arg0] = 0;
global.company_control[arg0] = random_range(33, 50);
global.company_kupleno[arg0] = 0;
global.company_rashod[arg0] = 0;
global.company_dohod[arg0]  = 0;
global.company_checkdays[arg0] = 0;
global.company_vsovete[arg0] = 0;
global.company_dohod2[arg0] = 0;
… big_data … (see §3.3)
global.company_rezerv[arg0] = round(global.company_price[arg0] * random_range(1, 3));
global.company_char[arg0][0..3] = irandom_range(30, 70);
global.company_char[arg0][4] = lerp(0.13, 3, global.company_hype[arg0]) * 100;
global.company_points[arg0] = 100;
for (var p = 0; p < 12; p++) { dohodmesyac[arg0][p] = global.company_price[arg0] * global.company_profit[arg0] * (global.big_data[arg0][0] / 100); }
dohodnachalogoda[arg0] = global.company_price[arg0] * global.company_profit[arg0] * (global.big_data[arg0][0] / 100) * 12;
lastdohod[arg0] = dohodmesyac[arg0][11];
lastprice[arg0] = global.company_stockprice[arg0] / global.company_number_a[arg0];
dohodmesyac_all[arg0][date_get_month(mydatetime)] = global.company_price[arg0] * global.company_profit[arg0];
lastdohod_all[arg0] = dohodmesyac_all[arg0][date_get_month(mydatetime)];
lastdate[arg0] = "12/" + string(date_get_year(mydatetime) - 1);
global.company_name[arg0] = global.company_name_rezerve[arg0];
check_names(arg0);
check_new_director(0);
check_all_rada();
```

### 4.3 New-company spawn during play — ✅ `gml_Object_o_control_Step_0.gml:2690-2715`

```gml
var total_comp = get_number_work_companies();
if (date_get_day_of_year(mydatetime) == global.daynewcompany && total_comp < irandom_range(17, 22)) { today_new_comp = 1; }
if (get_number_work_companies() < irandom_range(4, 8) && irandom(33) == 1) {
    today_new_comp = 1;
    if (date_get_day_of_year(mydatetime) == global.daynewcompany2 && (total_comp < irandom_range(11,16) || irandom(1) == 1)) { today_new_comp = 1; }
    if (total_comp > 20) { today_new_comp = 0; }
    if (date_get_year(mydatetime) == 1980) { today_new_comp = 0; }
}
if (today_new_comp == 1) { new_company(); }
```
`global.daynewcompany = irandom_range(100, 200)`, `global.daynewcompany2 = irandom_range(222, 333)` (`:660-661`; `daynewcompany` re-rolled to `irandom_range(33,158)` at `:2025`).
`new_company()` (✅ `gml_GlobalScript_new_company.gml`) reuses a `company_liq == 1` slot (scan 0..29) else increments `numberofcompany`, calls `generate_company`, then offers an **IPO**:
```gml
if (global.money < 4000000) { global.ipo_minimum = round(global.company_price[global.newcompany] / 430000000) * 100000; }
else                        { global.ipo_minimum = round(global.company_price[global.newcompany] / 330000000) * 100000; }
```
`ipo_yes()` (✅ `gml_GlobalScript_ipo_yes.gml:1-23`):
```gml
var repa = max(-15, round(min(30, global.char[4] * 0.7) + min(25, global.char[3] * 0.7) + min(20, global.char[1])));
var maxpep = min(global.money - 100000, global.ipo_minimum * irandom_range(17 + repa, 30 + repa));
if (check_level_rep(4) >= 3) { maxpep *= random_range(1.6, 3); }
…
function ipo_done() {
    var priceone = round((global.company_stockprice[global.newcompany] / global.company_number_a[global.newcompany]) * random_range(0.84, 0.94));
    var prrr = ceil(deneg / priceone);
    money_delete(deneg, 0);
    global.company_ac[global.newcompany] += prrr;
    global.company_checkdays[global.newcompany] = irandom_range(30, 60);
    global.company_kupleno[global.newcompany] = prrr;
}
```
🟡 IPO share price = market price × 0.84…0.94 (5-16% discount). `global.company_checkdays` starts an FSA monitoring window (see §8.5).

### 4.4 Player-founded company — ✅ `gml_GlobalScript_s_create_company.gml:16-150` (`startcomp`)

Setup price from the creation dialog (`gml_Object_o_create_company_Draw_73.gml:49-50`):
```gml
pricecomp = max(200000000, 200000000 * radio_group1.idd * 10) * (slider1.value / 100);
global.azhiotazh = clamp((1 - (slider1.value / 100)) * myrepanow * (1 + (radio_group1.idd * 0.75)), 0, 4);
```
with `myrepanow = clamp(round((global.char[0]+global.char[1]+global.char[4]+global.char[7]) / 9), 0, 7)` (`gml_Object_o_create_company_Create_0.gml:42-43`).

Then:
```gml
global.company_hype[i] = relerp(0, 4, global.azhiotazh, 0.85, 1.2);
global.company_hype_effect[i] = relerp(0, 4, global.azhiotazh, -5, irandom_range(5, 11));
global.company_price[i] = max(200000000, 200000000 * radio_group1.idd * 10);
global.company_stockprice[i] = global.company_price[i] * 1 * global.company_hype[i] * global.rynochek * global.trend;
global.company_number_a[i] = irandom_range(75660, 84540);
global.company_ac[i] = round(global.company_number_a[i] * (slider1.value / 100));
global.company_create_player[i] = 1;
global.company_limit[i] = min(1, global.min_all_limit + random(0.170001) + 15);
global.company_limit_kil[i] = round(global.company_limit[i] * global.company_number_a[i]);
if (global.min_all_limit < 1) { global.company_limit[i] -= 0.05 * global.azhiotazh; }
global.company_since[i] = date_get_year(o_control.mydatetime);
global.big_data[i] = [25, 25, 25, 25];
global.company_rezerv[i] = pricecomp + (global.company_price[i] * (1 - (slider1.value / 100)) * random_range(0.6, 0.8));
global.company_char[i][0] = 30;  [1] = 30;  [2] = 0;  [3] = 0;
global.company_char[i][4] = lerp(0.13, 3, global.company_hype[i]) * 100;
global.company_points[i] = 100;                       // 1000 if radio_group1.idd == 1
global.company_vsovete[i] = 2;
global.company_char[global.newcompany][3] = 50;
global.company_sovet[global.newcompany] = 50;
global.company_checkdays[global.newcompany] = irandom_range(30, 60);
global.company_kupleno[global.newcompany] = global.company_ac[i];
… level_viddil … dohodmesyac[i][p] = 0 for p<12 …
```
Starting staff: up to **3** hires picked at random from `humannew`-eligible pool (`get_work_human(i,0) > 100`) filtered by
`(((INT > 40 && CHAR > 40 && PREC > 40) || (INT > 70 || CHAR > 70 || PREC > 70)) && global.human_xp[i] > 30)` (`:121-142`).

> ⚠️ **Note the apparent bug** at `gml_GlobalScript_s_create_company.gml:58`: `random(0.170001) + 15` — the `+ 15` makes `min(1, …)` always 1 for the player company on Easy (`min_all_limit == 1`). Quoted verbatim.

### 4.5 `init_company(...)` — ✅ `gml_GlobalScript_init_company.gml`

A legacy/unused path (uses `ds_map` fields + `global.comp_names` / `global.comp_colors`, `chartCompany`, `global.newcompany`); it builds a map with `company_name`, `company_color`, `company_price`, `company_hype`, `company_profit`, `company_hype_effect`, `company_stockprice`, `company_number_a = irandom_range(11222, 41188)`, `company_ac`, `dohodnachalogoda`, `dohodmesyac1..12`. **I found no caller of `init_company` in the decompiled tree.** ❓

### 4.6 Special companies

- **NeoSun** (`gml_GlobalScript_buy_neosun.gml:11-72`): `povezlo = choose(0,0,1)`; price = `money_need/50` (unlucky) or `money_need*3` (lucky); `stockprice = money_need/6`; `number_a = irandom_range(5000, 5544)`; sector 1; `field = 1`. Unlucky: `profit = 0.56, hype = 1, hype_effect = -irandom_range(44,77)`. Lucky: `profit = 1.4, hype = 1.2, hype_effect = irandom_range(30,45)`. `check_neosun()` 27-28 days later: `hype > 1` → `hype += 1; profit += 0.4` else `hype -= 1; profit -= 0.4; delete_company(...)`.
- **Narko (criminal) company** (`gml_GlobalScript_s_narko.gml`): `price = random_range(111123320,161123320)`, `stockprice = random_range(31123320,46112332)`, `number_a = irandom_range(2188,2555)`, `company_ac = round(number_a * 0.307)` (player already owns 30.7%!), sector 2 (Pharmaceuticals), `profit = 0.56`, `hype = 0.3`, `rezerv = 1_000_000_000`, `limit = irandom_range(0.6,1)`. Its `company_limit_kil` is forced to 1e25 monthly (`gml_Object_o_control_Step_0.gml:3022-3026`) and its `profit` is pinned to `random_range(0.2, 0.4)` daily (`:1459-1462`).

### 4.7 Name generation — ✅ `gml_GlobalScript_generate_name_company.gml`

```gml
var syllables = ["ka","ki","ku","ke","ko","sa","shi","su","se","so","ta","chi","tsu","te","to","na","ni","nu","ne","no","ha","hi","fu","he","ho","ma","mi","mu","me","mo","ya","yu","yo","ra","ri","ru","re","ro","wa","wo"];
var num_syllables = irandom_range(2, 5);
var company_name = "";
for (var i = 0; i < num_syllables; i++) { var random_index = irandom(array_length(syllables) - 1); company_name += syllables[random_index]; }
company_name = string_upper(string_char_at(company_name, 1)) + string_delete(company_name, 1, 1);
return company_name;
```
39 hand-picked romaji syllables, 2–5 of them, no dedup at generation (only `array_unique` when refilling the pool). ❌ **No uniqueness guarantee** at generation time.

`check_names(arg0)` (`gml_Object_o_control_Create_0.gml:582-632`) resolves duplicates: if a name occurs more than once across `company_name[0..numberofcompany]`, replace with `global.rezevr_names[0]` and pop it.

> 🟡 `gml_GlobalScript_names.gml` (`names()`) only builds **personal first-name** pools for `global.random_name` / `name_car` / `house_name` (localised per `global.language` 0/1/2). The actual person-name data comes from `names/names.csv`, `names/surnames.csv` (and `_chs`/`_cht`) loaded through `txtname()` / `txtsurname()`. Human names/surnames are stored as **indices**: `human_surname[i] = irandom_range(1,103)`, `human_name[i] = irandom_range(1,149)` (male) / `irandom_range(151,338)` (female) (`gml_GlobalScript_s_human_generate.gml:14-26`).

---

## 5. Company financial simulation (daily)

### 5.1 Daily tick — the master company loop

`gml_Object_o_control_Step_0.gml:1074-1531`, runs `for (var i = 0; i < global.numberofcompany; i++)`, **applies to all companies including the player's**.

**Step A — snapshot, split/emit shares (`:1076-1097`)**
```gml
if (holyday == 0) {
    global.company_oldstockprice[i] = global.company_stockprice[i];
    global.company_oldnumber_a[i] = global.company_number_a[i];
    if (price_stock(i) < irandom_range(100, 2500) && irandom(4) == 1 && global.company_liq[i] == 0 && price_stock(i) > 0) {
        split_company(i, 1, choose(2, 3, 5));                    // reverse split
    }
    global.company_days_without[i] -= 1;
    var priceacc = global.company_stockprice[i] / global.company_number_a[i];
    if (priceacc > irandom_range(5000000, 25000000)) {
        global.company_price[i]     = global.company_price[i]     * random_range(0.98, 0.993);
        global.company_stockprice[i]= global.company_stockprice[i]* random_range(0.98, 0.993);
    }
    if (i != global.player_compnumber && global.company_days_without[i] <= 0 && priceacc > irandom_range(1000000, 11000000) && …) {
        split_company(i, 0, choose(2, 3, 4));                     // forward split
        global.company_days_without[i] = irandom_range(150, 333);
    }
    …
}
```

**Step B — "company_days_without" emission / share issue (`:1098-1143`)** — see §8.4.

**Step C — bankruptcy watch (`:1144-1196`)** — see §8.6.

**Step D — macro era modifiers on `global.trend` (`:1198-1221`)** — 1984-1990 boom, 1990-1994 bust, 1994-1999 slow growth, each with 1/11 chance/day.

**Step E — hype / profit momentum (`:1222-1365`)** — the core economy. Verbatim:
```gml
if (holyday == 0 || (global.parttimework_days > 0 && myweekday > 0 && myweekday <= 3)) {
  if (myweekday > 0 && myweekday < 6) {
    if (global.company_price[i] > 0) {
        if (round(global.company_hype_effect[i]) > 0) {
            global.company_hype_effect[i] -= 1;
            global.company_hype[i] += random_range(0.0015, 0.021);
        }
        if (round(global.company_hype_effect[i]) < 0) {
            global.company_hype_effect[i] += 1;
            global.company_hype[i] -= random_range(0.001, 0.02);
        }
        if (round(global.company_profit_effect[i] > 0)) {          // ⚠ note the misplaced paren
            global.company_profit_effect[i] -= 1;
            global.company_profit[i] += random_range(0.005, 0.021) * koef_trend;
        }
        if (round(global.company_profit_effect[i] < 0)) {          // ⚠ `round(bool)` — always 0/-1
            global.company_profit_effect[i] += 1;
            global.company_profit[i] -= random_range(0.003, 0.02);
        }
        global.company_profit_effect[i] = round(global.company_profit_effect[i]);
        global.company_hype_effect[i]   = round(global.company_hype_effect[i]);
        if (global.company_hype_effect[i] == 0) {
            if (irandom(10) == 1) { global.company_hype_effect[i] = irandom_range(-8, 8); }
            if (irandom(11) == 1) { global.company_hype[i] += random_range(-0.031, 0.03); }
        }
        global.company_profit[i] += random_range(-0.01, 0.01);
        if (irandom(5) == 1) { global.company_profit[i] += random_range(-0.038, 0.04); }
        if (global.company_profit[i] < 0)      { if (global.company_hype[i] > 1)   { global.company_hype[i] -= 0.01; } }
        if (global.company_profit[i] < -0.15)  { if (global.company_hype[i] > 1)   { global.company_hype[i] -= 0.01; } }
        if (global.company_profit[i] < 0.12)   { if (global.company_hype[i] > 1.2) { global.company_hype[i] -= 0.004; } }
        if (global.company_profit[i] > 0.05)   { if (global.company_hype[i] < 1.4) { global.company_hype[i] += 0.01; } }
        if (global.company_profit[i] < -0.15)  { global.company_profit[i] += random_range(0.001, 0.02); }   // mean reversion
        if (irandom(2) == 1) { if (global.company_profit[i] > 0.39) {
                global.company_profit[i] -= random_range(0, 0.03);
                global.company_profit[i] = lerp(global.company_profit[i], 0.39, random_range(0.001, 0.003)); } }
        if (global.company_profit[i] > 1.39) {
            global.company_profit[i] -= random_range(0, 0.03);
            global.company_profit[i] = lerp(global.company_profit[i], 1.29, random_range(0.001, 0.03));
        }
        var field = global.company_field[i];
        if (global.field_hype[field]    > 0) { global.company_hype[i]   += random_range(0.006, 0.012); }
        if (global.field_hype[field]    < 0) { global.company_hype[i]   -= random_range(0.005, 0.01); }
        if (global.field_profit[field]  > 0) { global.company_profit[i] += random_range(0.004, 0.008) * koef_trend; }
        if (global.field_profit[field]  < 0) { global.company_profit[i] -= random_range(0.003, 0.007); }
        if (irandom(5) == 1) { global.company_hype[i] += irandom_range(-0.04, 0.04); }
        if (global.company_hype[i] < 0.1)  { global.company_hype[i] = 0.1; global.company_hype[i] += random_range(0.01, 0.03); }
        if (global.company_hype[i] < 0.5)  { global.company_hype[i] += random_range(0, 0.01); }
        if (global.company_hype[i] > random_range(2, 4)) {
            global.company_hype[i] = lerp(global.company_hype[i], 1.3, random_range(0.025, 0.05));
            global.company_hype[i] -= random_range(0, 0.03);
            if (global.company_hype[i] > 10) { global.company_hype[i] = lerp(global.company_hype[i], 1, random_range(0.04, 0.05));  global.company_hype[i] -= random_range(0.01, 0.035); }
            if (global.company_hype[i] > 60) { global.company_hype[i] = global.company_hype[i] * random_range(0.4, 0.6);           global.company_hype[i] -= random_range(0, 0.03); }
            if (global.company_hype[i] > 30) { global.company_hype[i] = global.company_hype[i] * random_range(0.8, 0.9);           global.company_hype[i] = lerp(global.company_hype[i], 1, random_range(0.04, 0.2)); global.company_hype[i] -= random_range(0, 0.03); }
        }
        …
```
> ⚠️ **Two real bugs**: `if (round(global.company_profit_effect[i] > 0))` and `if (round(global.company_profit_effect[i] < 0))` — the parentheses are around the *comparison*, so `round(1)`/`round(0)` → the positive branch **always** runs (`-=1`, `profit += random_range(0.005,0.021)*koef_trend`) and the negative branch **never** runs (`round(0)=0` is falsy in GML). Net effect: every company drifts profit **upward** while `profit_effect > 0`, regardless of sign. Quoted verbatim.

**Step F — dividend-yield pressure (`:1386-1415`)**
```gml
var hypotecal_dohod_right_now       = global.company_price[i] * global.company_profit[i];
var hypotecal_dohod_right_now_for_ac= hypotecal_dohod_right_now * (global.big_data[i][0] / 100);
comp_dohodnost    = max(0, hypotecal_dohod_right_now)        / global.company_number_a[i];
comp_dohodnost_ac = max(0, hypotecal_dohod_right_now_for_ac) / global.company_number_a[i];
comp_dividendyield = comp_dohodnost_ac / price_stock(i);
comp_money_for_one_ac = comp_dohodnost / price_stock(i);
if (comp_dividendyield > 2)  { global.company_stockprice[i] *= random_range(1.0001, 1.0006); if (global.company_hype[i] > 0.1) { global.company_hype[i] *= random_range(0.99, 0.9999); } }
if (comp_dividendyield > 10) { global.company_stockprice[i] *= random_range(1.0001, 1.006);   global.company_price[i] *= random_range(0.99, 0.9999); }
```

**Step G — board-approval accrual from share ownership (`:1370-1384`)**
```gml
var proccc = global.company_ac[i] / global.company_number_a[i];
if (proccc > 0.01) {
    if (global.company_sovet[i] < 30 && global.company_vsovete[i] == 0) { global.company_sovet[i] += proccc; }
    if (global.company_sovet[i] < 25 && global.company_vsovete[i] == 1) { global.company_sovet[i] += proccc * 0.3; }
    if (global.company_vsovete[i] == 2) { global.company_sovet[i] -= random_range(0.01, 0.1); }
}
```
🟡 So for NPC companies, `company_sovet` **is** the player's equity stake as a fraction (max 0.3 for ex-player companies, and player-CEO companies bleed approval). It also gets nudged by trading in `o_birza.Other[10]` (`:222-241`): `company_sovet[i] -= round(check * 75)` when net selling, `+= round(check * 50)` when net buying (where `check = Δshares / number_a`).

**Step H — the price/hype re-derivation (`:1464-1485`)**
```gml
if (global.company_hype[i] < 0.5) {
    var hypeminus = (1 - global.company_hype[i]) * 0.005;
    global.company_profit[i] = global.company_profit[i] - (global.company_profit[i] * hypeminus);
}
var pepsa = global.company_price[i] * 0.0015 * global.company_profit[i];
global.company_price[i] = global.company_price[i] + (pepsa * 1.5);
global.company_stockprice[i] = global.company_price[i] * 0.8 * global.company_hype[i] * global.rynochek * global.trend;
if (irandom(111) == 1) {                       // pump & dump
    var price_1 = global.company_stockprice[i] / global.company_number_a[i];
    if (price_1 < 500) {
        global.company_price[i]      = global.company_price[i] * random_range(2, 4);
        global.company_hype[i]       = random_range(1.2, 2.2);
        global.company_hype_effect[i]= irandom_range(5, 60);
        global.company_stockprice[i] = global.company_stockprice[i] * random_range(3, 22);
        update_price(i);
    }
}
```

**✅ Canonical formulas (all companies, per day):**
```
price        *= (1 + 0.00225 * company_profit)            // net of the ×1.5 on 0.0015
stockprice    =  price * 0.8 * company_hype * rynochek * trend
share_price   =  stockprice / number_a
```

**`update_price(arg0)`** — ✅ `gml_GlobalScript_update_price.gml:1-25` (used for instantaneous events, *not* the daily tick):
```gml
if (global.company_hype[arg0] < 0.1) { global.company_hype[arg0] = 0.14; }
global.company_price[arg0]      = global.company_price[arg0] + (global.company_price[arg0] * 0.001 * global.company_profit[arg0]);
global.company_stockprice[arg0] = global.company_price[arg0] * 0.8 * global.company_hype[arg0] * global.rynochek * global.trend;
```
(10× smaller drift than the daily tick.)

**`update_price2(arg0, arg1)`** — ✅ `:27-69`; used for order-book flow:
```gml
var minimumrandom = random_range(0.12, 0.34);
if (arg1 < minimumrandom) { arg1 = minimumrandom; }
if (arg1 < 0.99) { if (global.company_hype_effect[arg0] > 0) { global.company_hype_effect[arg0] = -2; } }
if (arg1 > 1.01) { if (global.company_hype_effect[arg0] < 0) { global.company_hype_effect[arg0] = 1; } }
global.company_stockprice[arg0] *= arg1;
global.company_hype[arg0]      *= arg1;
```
Called with `zmina = 1 + qtyDelta / number_a` (+ hype delta) from `o_birza.Other[10]`.

### 5.2 Monthly close (`myday == 20`) — ✅ `gml_Object_o_control_Step_0.gml:3037-3320`

```gml
dohodmesyac[i][date_get_month(mydatetime)]     = global.company_price[i] * global.company_profit[i] * (global.big_data[i][0] / 100);
dohodmesyac_all[i][date_get_month(mydatetime)] = global.company_price[i] * global.company_profit[i];
lastdohod_all[i] = dohodmesyac_all[i][date_get_month(mydatetime)];
// CEO / ex-CEO salary income
if (global.company_vsovete[i] == 1) { var summ = max(500000,  round(global.company_price[i] / 50000000) * 10000);  dohodall += summ; money_add(summ, 1394); }
if (global.company_vsovete[i] == 2) { var summ = max(1000000, round(global.company_price[i] / 25000000) * 10000);  /* logged only */ }
var money_all        = dohodmesyac_all[i][date_get_month(mydatetime)];
var all_market_money = dohodmesyac_all[i][date_get_month(mydatetime)] * (global.big_data[i][2] / 100);
var market_koef      = all_market_money / (global.company_price[i] * 0.3);
global.company_char[i][3] += max(0, market_koef * 100);
if (money_all > 0) { global.company_char[i][3] += round(global.big_data[i][2] * random_range(0.3, 0.5) * relerp(0, 100, global.mycomp_effective[2], 0.1, 3)); }
var koef_invest = 1;
var koef_profit = relerp_limit(0.1, 0.7, global.company_profit[i], 0.37, 1.5, -3, 3);
if (koef_profit > 0) { koef_invest = relerp(0, 25, global.big_data[i][0], 0, 1); }
global.company_hype[i] = lerp(global.company_hype[i], global.company_hype[i] * (koef_invest * koef_profit), 0.01);
global.company_hype_effect[i] += koef_profit * 2 * koef_invest;
var rezeerv = dohodmesyac_all[i][date_get_month(mydatetime)] * (global.big_data[i][3] / 100);
if (rezeerv > 0) { if (global.mycomp_level_bonus[5] > 3) { rezeerv = round(rezeerv * 1.3); } }
if (global.player_compnumber == i) { rezerv_change(rezeerv); } else { global.company_rezerv[i] += rezeerv * random_range(-0.1, 0.2); }
var pointt = 0;
if (global.mycomp_level_bonus[3] > 0) {
    pointt = round(max(0, round(dohodmesyac_all[i][m] * (((big_data[i][1]/100) * company_char[i][2]) / 100) * 0.000001)) * relerp(1, 4, global.mycomp_level_bonus[3], 1, 3));
} else {
    pointt = round(max(0, round(dohodmesyac_all[i][m] * (((big_data[i][1]/100) * company_char[i][2]) / 100) * 0.000001)) * 0.75);
}
if (money_all > 0) { pointt += round(global.big_data[i][1] * random_range(0.3, 0.5) * relerp(0, 100, global.mycomp_effective[3], 0.1, 2.5)); }
global.company_points[i] += pointt;
```
Player-only branch (`:3103-3258`): subtracts the wage bill `sum(global.human_price[...])` from `dohodmesyac_all`, then:
- profit ≥ 0 → nice report (txt 1465/1466/1467)
- profit < 0 → `company_hype -= 0.04; change_my_sovet(-irandom_range(4,10));` plus extra `company_sovet -= 1` per loss threshold (−1e6 / −1e7 / −1e9, `:3172-3183`).
- If `|loss| < company_rezerv` → reserves absorb it (`rezerv_change(prybutok)`), `company_sovet` is *not* penalised.
- Else: `company_sovet -= random_range(5,10); company_hype -= random_range(0.1,0.3); company_hype_effect = irandom_range(-10,-20);` and a "cut costs" counter `global.mycomp_kepski_spravy += 1`; at ≥ 7 → `make_playercompany_bankrupt()` (`:3243-3247`).

Then dividends paid to the player (`:3260-3285`):
```gml
if (global.diff_divident == 0) { dohod[i] = round(max(0, (dohodmesyac[i][m] / global.company_number_a[i]) * global.company_ac[i])); }
global.company_dohod2[i] += dohod[i];
…
if (global.diff_divident == 1 && dividentnow == 1) {  // annual mode, paid on Dec 31
    var dohodgod = dohodmesyac[i][0] + … + dohodmesyac[i][11];
    dohod[i] = global.company_ac[i] * (dohodgod / global.company_number_a[i]);
}
```

`myday == 21` (`:3321-3327`): `for (i…) global.company_profit[i] += random_range(-0.03, 0.03);`

Free-float limit refresh (daily, `:3009-3027`):
```gml
var prpr1 = global.company_limit_kil[i] / global.company_number_a[i];
global.company_limit[i]      = min(1, global.min_all_limit + random(0.170001));
global.company_limit_kil[i]  = round(global.company_limit[i] * global.company_number_a[i]);
if (global.min_all_limit < 1) { global.company_limit_kil[i] = lerp(global.company_limit_kil[i], round(global.company_number_a[i] * global.company_limit[i]), 0.03); }
if (global.narcompany == i) { global.company_limit[i] = lerp(global.company_limit[i], 0.4, 0.025); global.company_limit_kil[i] = 10000000000000000000000000; }
if (global.company_checkdays[i] > 0) { global.company_checkdays[i] -= 1; }
```
`min_all_limit` by difficulty (`gml_Object_o_control_Step_1.gml:27-42`): `-1 → 1.0`, `0 → 0.56`, `1 → 0.31`, `2 → 0.11`. So 🟡 free float ≈ 56-117% of shares outstanding on easy, 11-28% on hard — with `company_limit_kil` also gated in the exchange UI (`gml_Object_o_birza_Draw_0.gml:856,900,953`).

### 5.3 Monthly maintenance (`o_control.Alarm[1]`) — ✅

`gml_Object_o_control_Alarm_1.gml`:
- `:247-251` clamps per human: `human_intelligence`, `human_precision`, `human_nastriy`, `human_stamina`, `human_friend` all to `[0,100]`. (`human_charisma` is **not** clamped here — a known leak; see `save_schema` where `human_charisma = [..., 133.0, ...]`.)
- `:252-256` initialises `human_price` if 0.
- `:258-261` demotes prof 3 → prof 2.
- `:78-85` anti-troll repair: `if (company_number_a[i] < 1 && company_price[i] != 0 && company_liq[i] == 0) company_number_a[i] = round(company_price[i] / 1000000);`
- `:73-77` resets `company_rashod[i]` and `company_ac_bought_number[i]` to 0 when the player holds no shares.
- `:56-65` refills `rezevr_names`.

### 5.4 `company_rashod` / `company_dohod` (player P&L) ✅

These are **the player's trading cash-flows**, not the company's operating expenses:
- `gml_Object_o_birza_Other_10.gml:102` `global.company_rashod[i] += comp_trata[i];`
- `:120` `global.company_dohod[i] += comp_pribil[i];`
- `:2469` (bankruptcy) `global.company_dohod[izymaem] += iz;`
- `gml_GlobalScript_sdelka1.gml:28,58,77,101,120,141` — secondary market deals also accumulate `rashod`.
- Reset monthly if `company_ac < 1` (`gml_Object_o_control_Alarm_1.gml:73-77`).
- `gml_GlobalScript_average_ac_price.gml:3`: `accc = global.company_rashod[arg0] / global.company_ac_bought_number[arg0];` → average purchase price.
- Displayed as "income / expenses / profit" in `o_company` (`txt(496)/txt(497)/txt(498)`).

🟡 `company_dohod2[N]` is the running dividend total (`+= dohod[i]` monthly, `Step_0:3270`).

---

## 6. Hype, board approval, control

### 6.1 `company_hype` drivers (summary)

| Effect | Magnitude | Where |
|---|---|---|
| `hype_effect` momentum decay | `±random_range(0.001, 0.021)/day` | `Step_0:1228-1237` |
| Random re-roll when `hype_effect == 0` | `irandom_range(-8,8)` at 1/10 | `:1252-1254` |
| Noise | `random_range(-0.031, 0.03)` at 1/11; `irandom_range(-0.04,0.04)` at 1/5 | `:1256-1259`, `:1329-1332` |
| Profit coupling | `−0.01` if `profit<0` and `hype>1`; `−0.004` if `profit<0.12` and `hype>1.2`; `+0.01` if `profit>0.05` and `hype<1.4` | `:1266-1293` |
| Sector | `±random_range(0.005, 0.012)` | `:1313-1320` |
| Mean reversion | `<0.1 → 0.1 + random(0.01,0.03)`; `<0.5 → +random(0,0.01)`; `>random(2,4) → lerp→1.3`; `>10 → lerp→1`; `>30 → ×0.8-0.9 then lerp→1`; `>60 → ×0.4-0.6` | `:1333-1365` |
| Monthly | `lerp(hype, hype * koef_invest * koef_profit, 0.01)` | `Step_0:3093` |
| Trading flow | `zmina` from `Δshares/number_a`, and `company_hype *= random_range(0.96,0.99)` on net sell / `*= random_range(1.001,1.019)` on net buy | `o_birza.Other[10]:207-241` |
| Meeting | `meet_rez` buckets (see §7) | `sobranie_begin.gml:57-103` |
| `change_hype(company, arg1)` | `hype += random_range(arg1*0.08, arg1*0.12); hype_effect = irandom_range(arg1*1.3, arg1*2.5);` (`arg1 == 0 → random_range(-5,5)`) | `gml_GlobalScript_change_hype.gml:29-30` |

`change_hype` is called from NPC job-switch events (`Step_0:4441,4456,4496,…`).

### 6.2 `company_profit_effect` / `company_hype_effect` semantics ✅

Integer "momentum counters" that each tick toward 0 by 1/day while applying a per-day nudge to their respective variable. They are *set* (not incremented) by:
- events: `change_hype`, board meetings, scandals, forecasts, the pump event, narko, `situation_*`, split/merge, investments (analyst projects).

### 6.3 `company_sovet` — reputation / approval rating ✅

For the player it starts at 50 and is clamped `[1.6, 100]` (`mycompany_step:518`, `change_my_sovet` in `gml_GlobalScript_change_sovet.gml:1-5`).

Daily decay in `mycompany_step` (`:182-231`), verbatim:
```gml
var dsfsd = min(global.company_char[mycomp][0], 50);
global.company_char[mycomp][1] -= ((30 - dsfsd) / 622);
global.company_sovet[mycomp]  -= (30 - dsfsd) / 2500;
var dsfsd2 = min(global.company_char[mycomp][1], 50);
global.company_sovet[mycomp] -= (30 - dsfsd2) / 2000;
var dsfsd3 = min(global.company_char[mycomp][3], 50);
global.company_sovet[mycomp] -= (30 - dsfsd3) / 2000;
var dsfsd4 = min(global.company_char[mycomp][4], 50);
global.company_sovet[mycomp] -= (30 - dsfsd4) / 2000;
var checks  = median(global.company_char[mycomp][1] + global.company_char[mycomp][0] + global.company_char[mycomp][2] + global.company_char[mycomp][3] + global.company_char[mycomp][4]);
var checks2 = median(global.company_char[mycomp][1] + global.company_char[mycomp][2] + global.company_char[mycomp][3]);
if (checks2 < 30) { global.company_hype[mycomp] -= random_range(0.001, 0.014);
                   global.company_char[mycomp][4] -= random_range(0.2, 1);
                   global.company_profit[mycomp] -= random_range(0.001, 0.014); }
if (checks2 < 20) { if (global.company_hype_effect[mycomp] > 0)  { global.company_hype_effect[mycomp]  = -4; }
                    global.company_sovet[mycomp]  -= random_range(0.1, 1);
                    global.company_profit[mycomp] -= random_range(0.008, 0.017);
                    if (global.company_profit_effect[mycomp] > 0) { global.company_profit_effect[mycomp] = -6; } }
if (checks2 < 8)  { global.company_hype_effect[mycomp] = -4;
                    global.company_profit[mycomp] -= random_range(0.01, 0.014); }
if (checks  < 30) { global.company_sovet[mycomp] -= 1 * relerp(0, 60, checks, 3, 0.1); }
if (global.company_sovet[mycomp] < 1.5) { global.company_sovet[mycomp] = 1.6; }
if (global.company_rezerv[mycomp] < 0)   { global.company_hype[mycomp] -= random_range(0.005, 0.014);
                    global.company_sovet[mycomp] -= random_range(0.3, 2);
                    global.company_char[mycomp][4] -= random_range(0.4, 1);
                    global.company_profit[mycomp] -= random_range(0.004, 0.007); }
for (var i = 0; i < 4; i++) { if (global.company_char[mycomp][i] > 100) { … = 100; } if (… < 0) { … = 0; } }
```
> ⚠️ `median(x)` with a single argument returns `x` in GML, so `checks` = **sum** of 5 stats and `checks2` = **sum** of stats 1,2,3. With player stats clamped to `[0.5,100]` each, the thresholds 30 / 20 / 8 correspond to averages of 10 / 6.7 / 2.7 — i.e. nearly-collapsed departments.

> ⚠️ **Another likely bug**: `:314-326`
> ```gml
> global.company_char[mycomp][4] -= ((30 - global.big_data[mycomp][2]) / 100);
> if (global.big_data[mycomp][3] < 1000000) { global.company_hype[mycomp] -= 0.001; }
> if (global.big_data[mycomp][3] < 100000)  { global.company_hype[mycomp] -= 0.002; }
> if (global.big_data[mycomp][3] < 10000)   { global.company_hype[mycomp] -= 0.005; }
> ```
> `big_data[2]`/`big_data[3]` are percentages (0..100), so all three hype penalties **always** apply: a flat **−0.008 hype/day** for the player's company. Quoted verbatim; flagged as an original bug (looks like leftover absolute thresholds).

### 6.4 `company_control` and control acquisition ✅

`company_control[i] = random_range(33, 50)` (percent). Control is held when
`var proc_prov = (global.company_ac[i] / global.company_number_a[i]) * 100; if (proc_prov >= global.company_control[i]) …`
(`mycompany_step:420-424`, `try_buy_company.gml:12-16`, `o_meeting_Step_0.gml:18-29`, `Step_0:1103/1124/1526`).
Consequences: monopoly achievement, auto-accept acquisition offers, CEO-offer prompts.

### 6.5 `global.company_investors_koef` ✅

```gml
// mycompany_step.gml:519 (and identical at o_control_Alarm_1.gml:433)
global.company_investors_koef = clamp(round((company_char[..][0]*0.1) + ([1]*0.1) + ([2]*0.1) + ([3]*0.1) + ([4]*0.6)), 10, 90);
```
Used by the "attract investors" action (`b_comp__invest_yes`, `gml_GlobalScript_scr_comp_upgrade1.gml:183-217`):
```gml
if (irandom(100) <= global.company_investors_koef) { good_exit = 1; }
if (good_exit == 0) { var chans2 = irandom(100) + global.company_investors_koef; if (chans2 >= 50) { rezul = 1; } }
if (good_exit == 1) { rezul = 2;
    var chans2 = irandom(100) + (global.company_investors_koef * 0.5);
    if (chans2 >= 65)  { rezul = 3; }
    if (chans2 >= 100) { rezul = 4; } }
global.days_without_investments = 300;
```
`rezul` 0..4 then drives `compinvestm(arg0)` (`:219-317`): share count ×1.02-1.04, `newlimit = ssfdsf * [1, 0.8, 0.6, 0.4, 0.15][arg0]`, `koef_change_price = random_range([0.7-0.84, 0.85-0.95, 1, 1.03-1.08, ssfdsf*(1.03-1.1)])`, `new_money = round(number_or_new_ac * newpriceone * (0.2 + arg0*0.2)) * 4`, and `company_hype/char[3]/char[4]/company_sovet *= koef_zmin` where `koef_zmin = random_range([0.4-0.7, 0.7-0.84, 0.85-0.94, 0.95-1, 1.02-1.07])`.

---

## 7. Board meeting (`sobranie_begin`) ✅

### 7.1 Trigger
`gml_Object_o_control_Step_0.gml:2341-2353`:
```gml
for (var i = 0; i < global.numberofcompany; i++) {
    if (date_get_week(mydatetime) == global.company_tyzhden[i]) {
        if (myweekday == 4) {                       // Thursday
            if (global.company_price[i] > 1000 && global.narcompany != i) { sobranie_begin(i); }
        }
    }
}
```
`company_tyzhden[i] = i + 10` → meetings spread across weeks 10..39.

### 7.2 Roll — ✅ `gml_GlobalScript_sobranie_begin.gml:1-55`
```gml
global.meet_rez = irandom(5);
if (global.meet_rez == 0) { global.meet_rez = irandom(2); }
if (global.meet_rez == 5) { global.meet_rez = irandom(2) + 3; }
```
→ bucket ∈ {0,1,2,3,4,5}. Skipping the meeting (`sobraniedontgo`) costs 2-4 points: `global.meet_rez -= irandom_range(-2, -4)` (`:105-110`). If `company_vsovete > 1` (player-CEO) skipping is not offered.

### 7.3 Resolution — ✅ `end_meet()` (`:57-103`) — **there is no per-shareholder vote**; the outcome is a scalar bucket

| `meet_rez` | `hype_effect` | `hype` | `stockprice` |
|---|---|---|---|
| ≤ 0 | `irandom_range(-15,-30)` | `− random_range(-0.3,-0.6)` (i.e. **+0.3…+0.6**) | `× random_range(0.8, 0.94)` |
| 1 | `irandom_range(-5,-14)` | `− random_range(-0.1,-0.3)` (**+0.1…+0.3**) | `× random_range(0.93, 0.96)` |
| 2 | `irandom_range(3,-3)` | `− random_range(-0.1, 0.1)` | — |
| 3 | `irandom_range(5,10)` | `+ random_range(0.1, 0.25)` | `× random_range(1, 1.03)` |
| 4 | `irandom_range(8,14)` | `+ random_range(0.25, 0.4)` | `× random_range(1.03, 1.05)` |
| ≥ 5 | `irandom_range(15,30)` | `+ random_range(0.32, 0.6)` | `× random_range(1.07, 1.15)` |
Then `update_price(global.meetingnow)`.

> ⚠️ **Sign bug**: rows 0 and 1 use `global.company_hype[...] -= random_range(-0.3, -0.6)` — subtracting a negative, so hype **increases** for the two worst outcomes. Quoted verbatim.

### 7.4 Modifiers applied during the meeting — ✅ `gml_Object_o_meeting_Step_0.gml`

| `timer` | Effect |
|---|---|
| 15 | notification |
| 62 | `player_is_ceo = 1` if the meeting is at the player's company |
| 66 | `choo = irandom(4)`; case 0 with `mycompany >= 2`: `happy += random_range(3,7)`, `stress += random_range(1,2)`, `company_sovet += 1.5 * bonusrepa`, `change_friend(irandom_range(2,4), company_director)`; other cases move happy/stress only |
| 94 | a random employee of the company gains friendship (director 5-15, board member 1-9 or 12-16) |
| 111 | notification |
| 122 | if player owns `> company_control` % → offer to become executive director (`ceo_yes`) |
| **150** | **the "resolutions"**: `procsoot = comp_price / dohodnachalogoda`; `+1` if `procsoot > 10`; `+1` if `> 25`; `+1` if `dividendyield > 4`; `+1` if `> 9`; `−1` if `dohodnachalogoda < 0`; `−1` if `procsoot < 0`; `−1` if `procsoot < -9`; `−1` if `dohodnost <= 0` |
| 200 | CEO-appearance roll `irandom(4)`: `−2`, `−1`, `0`, `+1`, `+2` |
| 250 | typing minigame start |
| 300 | destroy |

`o_meeting.Alarm[0]` computes the inputs (`:30-47`):
```gml
dohodnachalogoda = dohodmesyac[0] + … + dohodmesyac[11];
dohodnost  = max(0, o_control.lastdohod[human]) / global.company_number_a[human];
comp_price = global.company_price[human];
dividendyield = (dohodnost / o_control.lastprice[human]) * 100;
reputacia = global.company_sovet[human];
```
`o_meeting.Create` (`:43`): `global.company_sovet[global.meetingnow] += 1 * bonusrepa;` with `bonusrepa = 1.15` if `check_level_rep(0) > 0`.

### 7.5 "Calming meeting" (`b_comp__chill`) — ✅ `gml_GlobalScript_scr_comp_upgrade1.gml:352-381` + `gml_GlobalScript_upgr.gml:1-55`
Requires `mycomp_level_bonus[0] > 1` (HQ) and `global.chill_event == 0` (once per year, reset in `check_day_now` on Jan 1, `gml_GlobalScript_get_holiday.gml:22`).
```gml
var reps = global.company_sovet[global.player_compnumber];
var pepp = irandom(2);                            // 0,1,2
if (irandom(100) < reps) { pepp = 2; }            // better outcome if reputation is high
if (global.mycomp_level_bonus[0] > 2) { if (reps == 0) { reps = irandom(1); } }
delay_action(1, "chill_zbory_" + string(pepp));
```
| outcome | effects |
|---|---|
| `chill_zbory_0` | `company_sovet += irandom_range(-3,-5)`; `hype -= random_range(0.2,0.3)`; `hype_effect = -irandom_range(6,33)`; `char[4] -= 5` |
| `chill_zbory_1` | `sovet += 2..4` (+3..5 if HQ lvl>2); `hype += 0.2..0.3` (+0.33..0.4); `hype_effect = 6..11` (9..13); `char[4] += 5..20` (15..25) |
| `chill_zbory_2` | `sovet += 5..7` (6..8); `hype += 0.21..0.36` (0.41..0.58); `hype_effect = 22..38` (26..44); `char[4] += 15..33` (20..40) |

---

## 8. M&A, splits, bankruptcy

### 8.1 `company_merge(arg0 /*acquirer*/, arg1 /*target*/)` ✅ `gml_GlobalScript_company_merge.gml`
```gml
var nova = global.company_price[arg0] / global.company_price[arg1];
global.company_price[arg0] += global.company_price[arg1];
global.company_number_a[arg0] += round(global.company_number_a[arg1] * nova);
player_new_stocks = round(global.company_ac[arg1] * nova);
if (player_new_stocks > 1) { global.company_ac[arg0] += round(global.company_ac[arg1] * nova); }
global.company_stockprice[arg0] *= random_range(1.01, 1.05);
global.company_hype[arg0] += 0.5;
global.company_hype_effect[arg0] = irandom_range(5, 44);
global.company_profit[arg0] += random_range(0, 0.2);
update_price(arg0);
// staff transfer
for each h of find_contacts_comp(arg1, 0):
    nework = get_work_human(h, 0);
    if (nework == 1) { nework = 2; }
    if ((nework == 2 || nework == 3) && array_length(find_people(2, arg0)) > 6) { nework = irandom_range(25, 35); }
    human_work_add(h, nework, arg0);
delete_company(arg1);
```
🟡 Exchange ratio = acquirer price / target price; the player's target shares convert 1:1 at that ratio.

### 8.2 `split_company(arg0, arg1, arg2)` ✅ `gml_GlobalScript_split_company.gml`
```gml
if (arg1 == 0) {                       // FORWARD split, factor arg2 (2..5)
    global.company_ac[arg0]        *= arg2;
    global.company_number_a[arg0] *= arg2;
    global.company_price[arg0] = round(global.company_price[arg0] * random_range(1.01, 1.02));
    global.company_hype[arg0] += random_range(0.2, 0.5);
    global.company_hype_effect[arg0] += random_range(2, 10);
}
if (arg1 == 1) {                       // REVERSE split, divisor arg2 (2..10)
    global.company_ac[arg0] /= arg2;   global.company_ac[arg0]        = ceil(global.company_ac[arg0]);
    global.company_number_a[arg0] /= arg2; global.company_number_a[arg0] = ceil(global.company_number_a[arg0]);
    global.company_hype[arg0] -= random_range(0.1, 0.3);
    global.company_hype_effect[arg0]   = random_range(2, 10);
    global.company_profit_effect[arg0] = random_range(2, 10);
    global.company_profit[arg0] += random_range(0.1, 0.3);
}
update_price(arg0);
```
Callers: `Step_0:1082` reverse split when `share price < irandom_range(100,2500)` at 1/4; `Step_0:1094` forward split when `company_days_without <= 0` and `priceacc > irandom_range(1e6, 1.1e7)`; `delete_company.gml:36` reverse split by 3/5/10 in the bankruptcy reprieve.

### 8.3 Acquisition of another company by the player — ✅ `gml_GlobalScript_try_buy_company.gml`
```gml
var minprice = global.company_stockprice[arg0] * 1;                       // total market cap
var maxprice = min(reserve, global.company_stockprice[arg0] * 3.5);
global.pricebuycomp = global.company_stockprice[arg0] * random_range(0.7, 1.4);
…
function buy_company_rez() {
    var shans = relerp(minprice, maxprice, global.pricebuycomp, -5, 27);
    shans += (control_compa * 0.5);
    shans += relerp_limit(0.1, 2, global.company_hype[global.comp_temp], 30, -20, -20, 26);
    shans += relerp_limit(-0.3, 2, global.company_profit[global.comp_temp], 30, -20, -20, 26);
    shans += relerp_limit(0, 50, global.char[7], 30, -10, -20, 27);
    if (global.bankrupt_dali == global.comp_temp) { shans += 50; }
    if (irandom(99) <= shans) { uspuh = 1; }
    if (control_compa == 1) { uspuh = 1; }                                 // forced if you already hold control
    if (uspuh == 1) { delay_action(irandom_range(2,8), "offer_yes"); }
    else if (shans < 20) { delay_action(irandom_range(2,4), "offer_no_rude"); }
    else { delay_action(irandom_range(2,8), "offer_no"); }
}
function offer_yes() { … rezerv_change(-global.pricebuycomp); company_merge(global.player_compnumber, global.company_offer); }
```
🟡 So the "price" for buying a whole company is a *fraction of its market cap* (`pricebuycomp`), spent from `company_rezerv`, and `company_merge` is called with `(player, target)` — i.e. the **player's** valuation acts as the exchange ratio.

### 8.4 Share issuance (`company_days_without`) — ✅ `Step_0:1098-1143`
```gml
if (spok == 0 && global.company_days_without[i] <= 0) {
  if (priceacc > irandom_range(4700000, 31000000) && irandom(4) == 1) {
    spok = 1;
    if (proc_prov < global.company_control[i]) {           // player has no control → new shares sold to player
        global.company_days_without[i] = irandom_range(150, 500);
        var ssfdsf = random_range(1.1, 1.18);
        global.company_number_a[i] = round(global.company_number_a[i] * ssfdsf);
        var prprs = round(global.company_ac[i] * ssfdsf) - global.company_ac[i];
        global.company_limit_kil[i] = round(global.company_limit_kil[i] * ssfdsf);
        var newpriceone = global.company_stockprice[i] / global.company_number_a[i];
        if (proc_prov > 1) { global.numshares = prprs; global.compbuy = i;
            global.moneyneed = round(prprs * newpriceone * 0.3); create_question(txt(539), txt(2843), buynew); }
    }
    else if (proc_prov >= global.company_control[i]) {       // player has control → dilution offer
        global.company_days_without[i] = irandom_range(155, 455);
        var ssfdsf = random_range(1.1, 1.18);
        new_stocks = round((global.company_number_a[i] * ssfdsf) - global.company_number_a[i]);
        var prprs = round(global.company_ac[i] * ssfdsf) - global.company_ac[i];
        var newpriceone = global.company_stockprice[i] / global.company_number_a[i];
        global.moneyneed = round(prprs * newpriceone * 0.25);
        global.numshares = prprs;
        if (new_stocks > 0) { create_question2(txt(539), txt(2844), buynew_q, buynew_no); }
    }
  }
}
```
🟡 Player pays **30%** of market value for new shares when not in control; **25%** of the *existing* holding when forced to participate in dilution.

### 8.5 FSA wash-trade / market-manipulation watchdog — ✅ `o_birza.Other[10]:151-252`
Active only when `global.diff_fsa == 1`. Tracks `company_kupleno`, `company_riznycya`, `company_checkdays`:
```gml
if (global.company_kupleno[i] > 0 && (riznycya + global.company_riznycya[i]) < max(-1000, -global.company_kupleno[i] * 0.25)) { porushennya(abs(global.company_kupleno[i])); … }
if (global.company_kupleno[i] < 0 && (riznycya + global.company_riznycya[i]) > abs(min(1000, global.company_kupleno[i]) * 0.25)) { porushennya(abs(global.company_kupleno[i])); … }
if (global.company_checkdays[i] == 0) { global.company_kupleno[i] = riznycya; global.company_checkdays[i] = min(7, round(riznycya / 400)); }
if (global.company_kupleno[i] == 0 && abs(riznycya) > 100) { global.company_kupleno[i] = riznycya; global.company_checkdays[i] = clamp(round(abs(riznycya)/400), 7, 15); }
```
🟡 Rule of thumb: reversing ≥ 25% of a flagged block within the window = manipulation penalty.

### 8.6 Bankruptcy — ✅ `Step_0:1144-1196` + `gml_GlobalScript_delete_company.gml:30-95`

Watch-list criteria (any one, each day):
```gml
(global.company_price[i]   < irandom_range(400000000, 1000000000))
|| (global.company_stockprice[i] < irandom_range(100000000, 1000000000))
|| (global.company_price[i]   < irandom_range(nikkei_price * 0.05, nikkei_price * 0.28))
|| (global.company_stockprice[i] < irandom_range(nikkei_price * 0.08, nikkei_price * 0.28))
|| (global.company_profit[i] < -0.09)
```
→ `company_predupr_bankrupt[i] += 1` (decays `-2`/day when criteria are not met, `Step_0:1184-1191`).
Global cooldown: `todaybankrupt_company` (init 105, reset to `irandom_range(125,355)` on trigger; ×0.66 on a reprieve). Also requires `get_number_work_companies() > 5`, `i != player`, `i != narcompany`, no pending offer, and either `company_price < nikkei*0.5` or `stockprice < nikkei*0.5`, then `irandom(32) < (company_predupr_bankrupt[i] - 7)` and `company_hype < 1.03 && company_profit < 0.24`:
```gml
global.company_hype_effect[i] = irandom_range(-20, 15);
global.company_hype[i] -= 0.3;
todaybankrupt_company = irandom_range(125, 355);
global.company_predupr_bankrupt[...] = 0;
delay_action(irandom_range(15, 33), "company_banrupt_or_not");
```
`company_banrupt_or_not()` 50/50 (`gml_GlobalScript_delete_company.gml:30-44`):
- **reprieve** → `split_company(bankrupt_dali, 1, choose(3,5,10))`
- **liquidation** → `company_banrupt()` (`:46-95`):
  - If `hype < 1 && profit < 0.4 && irandom(8) < 7`: try up to 9 random buyers with `price > 1.3×` and `profit > 0.2` → `company_merge(buyer, victim)`. Otherwise the victim's valuation is cut to `× random_range(0.3,0.45)` and holders are paid out `price / company_ac` each, then `delete_company`.
  - Else (hype/profit recovered): `hype_effect = irandom_range(6,30); hype += 0.4; profit += 0.4; todaybankrupt_company *= 0.66;`

`delete_company(arg0)` ✅ (`:1-28`): zeroes `stockprice/price/profit/hype/ac/number_a/vsovete/sovet`, sets `company_liq = 1`, pulls a new reserve name from `rezevr_names` (or `generate_name_company()` when empty), then `check_new_director(1)` + `check_all_rada()`.

Player bankruptcy — ✅ `gml_GlobalScript_make_playercompany_bankrupt.gml`:
```gml
human_work_add(0, 133, 0);
global.company_vsovete[global.player_compnumber] = 1;
global.player_compnumber = -1;
global.rnd_in_process = 0;
change_char_procent_and_chislo(-0.1, -2, 1);
change_char_procent_and_chislo(-0.02, -1, 0);
change_char_procent_and_chislo(-0.04, -1, 3);
```

### 8.7 Board size maintenance — ✅ `gml_GlobalScript_check_all_rada.gml:29-101`
- < 3 board members → grab the first human with `get_work_human(i2,0) > 2` and make them a member.
- \> 7 board members → demote random members to `irandom_range(100,134)` (unemployment).
`check_new_director(0|1)` (✅ `gml_GlobalScript_check_new_director.gml:1-63`) promotes a random board member to CEO (prof 1) when a live company has none, calling `change_hype(i, 0)`.

---

## 9. Player company simulation — `mycompany_step()` ✅

Full verbatim walkthrough of `gml_GlobalScript_mycompany_step.gml` (called daily, working days only).

### 9.1 Department "best level" reference — `:7-13`
```gml
var max_best_level = min(1, max(0.04, all_levels_comp * 0.044));
for (var i = 0; i < 7; i++) { now_level_viddil_koef[i] = min(1.05, max(0.1, global.level_viddil[i] * 0.3)); }
var max_best = max(max_best_level, min(1.05, max(0.04, global.level_viddil[1] * 0.3)));
```
🟡 `max_best` is a **difficulty ceiling**: department effectiveness must reach this fraction of 100 to be considered "maxed", so char stats converge toward `effective / max_best` ∈ 0..1.05.

### 9.2 Stat targets
```gml
global.company_char[mycomp][1] = lerp(global.company_char[mycomp][1], global.mycomp_effective[1] / max_best, 0.02);           // :14  (max_best from level_viddil[1])
global.company_char[mycomp][3] = lerp(global.company_char[mycomp][3], global.mycomp_effective[2] / max_best, 0.03);           // :166 (max_best still from [1] here)
...
max_best = max(max_best_level, min(1.05, max(0.04, global.level_viddil[3] * 0.3)));                                      // :396
global.company_char[mycomp][2] = lerp(global.company_char[mycomp][2], global.mycomp_effective[3] / max_best, 0.02);           // :397
if (global.level_viddil[3] == 0) { global.company_char[mycomp][2] = 5; }                                                  // :398-401
```
🟡 `effective[1]` (Operations) → char[1]; `effective[2]` (S&M) → char[3]; `effective[3]` (R&D) → char[2]; `effective[5]` (Finance) drives hype.

**Marketing perk (`:15-21`)**:
```gml
if (global.mycomp_level_bonus[2] > 3) {                 // S&M effectiveness ≥ 70
    if (global.company_char[mycomp][3] > 80) { global.company_hype[mycomp] += random_range(0.001, 0.006); }
}
```

**Finance-driven hype (`:247-253`)**:
```gml
max_best = max(max_best_level, min(1.04, max(0.04, global.level_viddil[5] * 0.3)));
sas = relerp(0, 100, global.mycomp_effective[5] / max_best, 0.1, 1.5);
global.company_hype[mycomp] = lerp(global.company_hype[mycomp], global.company_hype[mycomp] * sas, 0.01);
var pip = relerp(0.08, 1.4, global.company_hype[mycomp], 0, 100);
global.company_char[mycomp][4] = lerp(global.company_char[mycomp][4], clamp(pip, 0, 100), 0.03);
```
🟡 So **char[4] (reputation) is a pure function of hype**: `relerp(0.08, 1.4, hype, 0, 100)` → hype 0.08 ⇒ 0, hype 1.4 ⇒ 100.

**Dividend-policy hype drift (`:243-246`)**:
```gml
var koef_invest = relerp(0, 16, global.big_data[mycomp][0], 0, 1);
global.company_hype[mycomp] = lerp(global.company_hype[mycomp], global.company_hype[mycomp] * koef_invest, 0.001);
```
🟡 A payout ratio above 16% erodes hype (weakly, 0.1%/day).

### 9.3 Profit targeting (`:254-268`)
```gml
if (global.mycomp_level_bonus[6] > 0) {                     // IT department → daily R&D points
    var pointt = round(max(1, round(global.company_price[mycomp] * (((global.big_data[mycomp][1] / 100) * global.company_char[mycomp][2]) / 100) * 0.000001)) / 1000);
    global.company_points[mycomp] += pointt;
}
vplyvnadohod += max(1, (global.company_char[mycomp][1] + global.company_char[mycomp][3]) / 2);
vplyvnadohod = relerp(0, 100, vplyvnadohod, -0.1, 0.6);
var lerrr = lerp(global.company_profit[mycomp], vplyvnadohod, 0.02);
global.company_profit[mycomp] = lerrr;
if (global.company_profit[mycomp] < random_range(0, 0.1)) { global.company_hype[mycomp] -= 0.004; }
```
🟡 **Profit target = average of production (char[1]) and marketing (char[3])**, remapped through `relerp(0,100,·,-0.1,0.6)` and lerped in at 2%/day.

### 9.4 Valuation "fair price" nudge (`:274-313`)
```gml
var check3s2 = median(global.company_char[mycomp][1], global.company_char[mycomp][2], global.company_char[mycomp][3], global.company_profit[mycomp] * 100);
var randdd = irandom(120);
if (randdd < check3s2) {
    var base_nadoprice = 150000000;
    var nadoprice = base_nadoprice * all_levels_comp;
    for (var i = 0; i < 7; i++) {
        if (global.level_viddil[i] == 2) { nadoprice += 200000000; }
        if (global.level_viddil[i] == 3) { nadoprice += 500000000; }
        if (global.level_viddil[i] == 4) { nadoprice += 2000000000; }
    }
    if (global.mycomp_level_bonus[1] > 3) { nadoprice = nadoprice * 1.2; }
    nadoprice = nadoprice * global.trend;
    if (nadoprice > global.company_price[mycomp]) {
        global.company_price[mycomp] = lerp(global.company_price[mycomp], nadoprice, random_range(0.0001, 0.003));
        if (global.mycomp_level_bonus[1] > 3) { global.company_price[mycomp] = lerp(global.company_price[mycomp], nadoprice, random_range(0.0001, 0.003)); }
    }
}
```
✅ Only ever ratchets the valuation **up** (to a "fair" value derived from total department levels and macro trend).

### 9.5 Morale from employees (`:339-380`)
```gml
var allworks = 0;
for (var i = 0; i < 7; i++) { allworks += array_length(global.mycomp_workers[i]); }
…
var num_emp = 0;  var emp_nastriy = 0;
for (var i = 1; i <= global.human_kol; i++) {
    if (get_workplace_human(i, 0) == global.player_compnumber) {
        num_emp += 1;
        if (global.company_strike == 1) { global.human_nastriy[i] = global.human_nastriy[i] * 0.95; global.human_nastriy[i] -= 0.2; }
        emp_nastriy += (global.human_nastriy[i] * 0.95);
        if (global.mycomp_level_bonus[6] > 2) {
            if (global.human_intelligence[i] > 70) {
                var pointt2 = round(max(1, round(global.company_price[mycomp] * 0.3 * (((big_data[1]/100) * company_char[2]) / 100) * 0.000001)) / 600);
                global.company_points[mycomp] += pointt2;
            }
        }
        var riznycz = (all_levels_comp + 2) - allworks;
        if (riznycz > 0) { emp_nastriy -= (global.human_nastriy[i] * relerp(0, 15, riznycz, 0.01, 1)); }
    }
}
var emp_nastriy_median = max(0.01, round(emp_nastriy / num_emp));
if (num_emp == 0) { emp_nastriy_median = 30; }
global.company_char[mycomp][0] = lerp(global.company_char[mycomp][0], emp_nastriy_median, 0.1);
```
🟡 Understaffing (`allworks < all_levels_comp + 2`) drains morale in proportion to the shortfall.

### 9.6 Department shortfall warnings (`:59-165`)
Four counters (`viddil1_series`, `viddil2_series`, `viddil3_series`, `viddil4_series`) increment each day while `max_best_level > now_level_viddil_koef[k] + 0.1`, warn at 16 consecutive days, and self-reset above `irandom_range(40,100)`:

| counter | dept checked | warns if… |
|---|---|---|
| `viddil1_series` | `[1]` Operations | production under-level |
| `viddil2_series` | `[3]` R&D | research under-level |
| `viddil3_series` | `[2]` S&M | marketing under-level |
| `viddil4_series` | `[5]` Finance | finance under-level |
| `long_koef_HR` | `[4]` HR | `koef_happy_HR > 1.1` (HR under-level relative to company) |

### 9.7 Under-development penalty (`:406-418`)
```gml
if (global.mycomp_level_bonus[0] < 1) {                 // HQ effectiveness < 10
    global.company_char[mycomp][0] = lerp(global.company_char[mycomp][0], 0.01, 0.04);
    global.company_char[mycomp][1] = lerp(global.company_char[mycomp][1], 0.01, 0.04);
    global.company_char[mycomp][2] = lerp(global.company_char[mycomp][2], 0.01, 0.04);
    global.company_char[mycomp][3] = lerp(global.company_char[mycomp][3], 0.01, 0.04);
    global.company_char[mycomp][4] = lerp(global.company_char[mycomp][4], 0.01, 0.04);
}
global.company_char[mycomp][0] = clamp(global.company_char[mycomp][0], 0.5, 100);
… (all five clamped to [0.5, 100])
```

### 9.8 Board/HR failure → getting fired (`:425-508`)
```gml
if (global.company_sovet[mycomp] > 42) { global.rada_predupr = 0; }
if (global.company_sovet[mycomp] < 20) { global.badreput_in_comp_days += 1; }
else                                    { global.badreput_in_comp_days = -6; }
if (global.mycomp_level_bonus[0] > 3)  { global.badreput_in_comp_days = -6; }    // HQ perk 4 = immunity
if (global.badreput_in_comp_days > 2 && global.company_char[mycomp][4] < 33) {
    shans_uvol += (global.badreput_in_comp_days * 1);
    if (global.company_sovet[mycomp] < 10) { shans_uvol += 4; }
    if (global.company_sovet[mycomp] <  5) { shans_uvol += 8; }
    if (global.company_sovet[mycomp] <  3) { shans_uvol += 8; }
    if (global.company_char[mycomp][4] < 10) { shans_uvol += 8; }
    if (irandom(111) < shans_uvol) {
        global.rada_predupr += 1;
        if (global.rada_predupr == 1) {
            global.badreput_in_comp_days = -irandom_range(20, 33);
            if (control_paket == 0) { create_notification(txt(218), txt(2629)); }
            else { create_notification(txt(218), txt(2630));
                   global.company_hype[mycomp] -= random_range(0.1, 0.25);
                   global.company_char[mycomp][4] -= random_range(5, 7); }
        }
        if (global.rada_predupr == 2) {
            if (control_paket == 0) { create_notification(txt(539), txt(2631), …, 1); b_comp_resign_yes(); exit; }
            else                     { create_question2(txt(539), txt(2629), scr_resign, scr_resign_no); }
        }
        if (global.rada_predupr >= irandom_range(4, 20)) { …hype −0.2…−0.3; char[4] −10…−25… }
        else if (global.rada_predupr >= 3) { …hype −0.2…−0.3; char[4] −10…−25; badreput_in_comp_days = −5; }
    }
}
```
✅ HQ effectiveness ≥ 70 (`mycomp_level_bonus[0] > 3`) grants permanent immunity (matches `txt(2594)` "Immunity from being fired as the company's head").

### 9.9 Strike handling (`:509-517`)
```gml
global.dayswithotcomp = 365;                                  // daily reset of the "no company for N days" counter
if (global.company_strike == 1) {
    if (global.company_char[mycomp][0] > random_range(30, 50)) { create_notification(txt(218), txt(2707)); global.company_strike = 0; }
}
```
Strike is set by in-company event #10 (`Step_0:4711-4714`) and zeroes all department power (`full_power = 0.06`, `Alarm_1:490-493`).

---

## 10. Company upgrades

### 10.1 Department construction (`level_viddil`++) — see §3.4 costs
`upgr_viddil` / `upgr_viddil2` (`gml_GlobalScript_upgr.gml:377-406`):
```gml
function upgr_viddil() {
    if (global.company_rezerv[global.player_compnumber] > global.priceviddil) {
        global.level_viddil[global.viddil_nomer] += 1;
        plus_char_after_upgrade();
        rezerv_change(-global.priceviddil);
    } else { create_notification(txt(218), txt(1361)); }
}
function upgr_viddil2() { … same but with achivka("comp_viddil", 1) … }
```
`plus_char_after_upgrade()` (`gml_GlobalScript_upgr.gml:408-466`) grants +10 to all five `company_char`, +6 `company_sovet`, plus a **+25** bonus to the matching stat, and for dept 5 (Finance) also `hype_effect = 7` and `hype += 0.3`:
```gml
if (global.viddil_nomer == 0) { char[0]+=10; char[1]+=15; char[2]+=10; char[3]+=10; char[4]+=20; sovet+=6; }
if (global.viddil_nomer == 1) { char[0]+=10; char[1]+=35; char[2]+=10; char[3]+=10; char[4]+=10; sovet+=6; }
if (global.viddil_nomer == 2) { char[0]+=10; char[1]+=10; char[2]+=10; char[3]+=35; char[4]+=10; sovet+=6; }
if (global.viddil_nomer == 3) { char[0]+=10; char[1]+=10; char[2]+=35; char[3]+=10; char[4]+=10; sovet+=6; }
if (global.viddil_nomer == 4) { char[0]+=10; char[1]+=10; char[2]+=35; char[3]+=10; char[4]+=10; sovet+=6; }
if (global.viddil_nomer == 5) { char[0]+=10; char[1]+=10; char[2]+=10; char[3]+=10; char[4]+=35; hype_effect=7; sovet+=6; hype+=0.3; }
```

### 10.2 Reserve-funded upgrades (`b_comp`) — ✅ `gml_GlobalScript_scr_comp_upgrade1.gml`

Menu `b_comp()` (`:19-171`), 7 slots:

| # | Action | Unlock | Cost |
|---|---|---|---|
| 0 | `b_comp__0` → `upgr_marketing_0..2` — **Advanced marketing campaign** | `mycomp_level_bonus[2] > 0` | `round(price/1e6) * 100000`, ×0.7 if `mycomp_level_bonus[2] > 1` |
| 1 | `b_comp__1` → `upgr_fac_0..2` — **Expanding Production Facilities** | `mycomp_level_bonus[1] > 0` | same, ×0.7 if `mycomp_level_bonus[1] > 1` |
| 2 | `b_comp__2` → `upgr_bonus_0..2` — **Immediate bonuses for all employees** | `mycomp_level_bonus[4] > 0` | `global.bonus_sizes` = Σ over employees of `round(max(calc_price_human(h), human_price[h]) * 3 / 1000) * 1000` |
| 3 | `b_comp___zp` — raise salaries to `calc_price_human(i)*1.2` | `mycomp_level_bonus[4] > 0` and `now_zp < budet_zp` | from reserves |
| 4 | `b_comp__chill` — calming meeting | `mycomp_level_bonus[0] > 1` | free (once/year) |
| 5 | `b_comp__invest` — attract investors | `mycomp_level_bonus[5] > 0` and `days_without_investments <= 0` | free |
| 6 | `b_exit` | | |

Each of 0/1/2 sets a "pending upgrade" flag (`global.upg_b_comp__N = 1`, blocking re-purchase until the result lands) and schedules the effect:
- `b_comp__0_yes` (`:398-422`): `pepp = irandom(2)`; if `mycomp_level_bonus[2] > 2` → `pepp = choose(1,2)` (i.e. no failure); `delay_action(irandom_range(10,18), "upgr_marketing_" + pepp)`.
- `b_comp__1_yes` (`:439-463`): `pepp = irandom(2)`; if `mycomp_level_bonus[1] > 2` → `pepp = irandom_range(1,2)`; `delay_action(irandom_range(10,18), "upgr_fac_" + pepp)`.
- `b_comp__2_yes` (`:476-492`): `delay_action(irandom_range(2,5), "upgr_bonus_" + irandom(2))`.

**Outcomes** — ✅ `gml_GlobalScript_upgr.gml:57-210`:

| function | `char` gain | `sovet` | `hype` | `hype_effect` | `mycomp_hvylya` | `company_price` |
|---|---|---|---|---|---|---|
| `upgr_marketing_0` | `[2] += 5` | +3 | | | `[4] += 0.25` | |
| `upgr_marketing_1` | `[2] += 15..20` | +6 | | | `[4] += 0.5` | |
| `upgr_marketing_2` | `[2] += 32..39` | +10 | | | `[4] += 0.75` | |
| `upgr_fac_0` | `[1] += 5` | +2 | | | `[1] += 0.25` | |
| `upgr_fac_1` | `[1] += 15..20` | +5 | | | `[1] += 0.5` | `× 1.02` |
| `upgr_fac_2` | `[1] += 32..39` | +8 | | | `[1] += 0.75` | `× 1.05` |
| `upgr_bonus_0` | `[0] += 5` | +2 | | | | every employee `nastriy += 4..7` (`6..8` if HR lvl>2) |
| `upgr_bonus_1` | | +4 (+2) | | | | `nastriy += 15..20` (`25..35`) |
| `upgr_bonus_2` | | +8 (+4) | | | | `nastriy += 32..36` (`37..44`) |

### 10.3 R&D projects (`b_comp2`, paid in `company_points`) — ✅ `gml_GlobalScript_scr_comp_upgrade1.gml:494-704`

Cost everywhere: `var pricee = max(50, round(global.company_price[global.player_compnumber] / 100000000) * 30);`
Delay: `var times = irandom_range(25, 40); if (global.mycomp_level_bonus[6] > 3) { times = round(times * 0.55); }` (IT perk 4 = "All R&D research processes are expedited", `txt(2618)`).

| # | function | R&D function | Unlock | 30% cheaper when | Outcome (`gml_GlobalScript_upgr.gml:212-375`) |
|---|---|---|---|---|---|
| 0 | `b_comp2__0` | `rnd_nextgen_*` (**Next-gen products**) | `mycomp_level_bonus[3] > 2` (full) | — | `[1] += 8 / 20..28 / 35..45`; `hype += 0.1 / 0.26..0.36 / 0.42..0.57`; `hype_effect = 1-2 / 2-3 / 4-6`; `sovet += 2/5/8` |
| 0alt | `b_comp2__0_smol` | `rnd_pastgen_*` (**basic R&D**) | `mycomp_level_bonus[3] > 0` | — | `[1] += 6 / 15..23 / 30..40`; `hype += 0.05 / 0.15..0.26 / 0.3..0.43`; `hype_effect = —/ 1-2 / 2-5`; `sovet += 1/3/6` |
| 1 | `b_comp2__1` | `rnd_eff_*` (**Efficiency Improvement**) | `mycomp_level_bonus[1] > 0` (Ops) | `mycomp_level_bonus[5] > 2` (Finance) | `[1] += 3/6/10`; `profit += 0.2/0.4/0.75`; `sovet += 2/5/8`; `price × 1.01 / 1.02 / 1.03` |
| 2 | `b_comp2__2` | `rnd_portfolio_*` (**Patent Portfolio Expansion**) | `mycomp_level_bonus[5] > 0` (Finance) | `mycomp_level_bonus[5] > 1` | `[3] += 8 / 20..28 / 35..45`; `hype += 0.08 / 0.3..0.48 / 0.45..0.65`; `hype_effect = —/ 3-6 / 5-15`; `sovet += 3/6/11` |

🟡 The `mycomp_level_bonus` gates map 1:1 onto `txt(2595-2618)`:
- Ops ≥ 1 → "Expanding Production Facilities"; ≥ 2 → 30% cheaper; ≥ 3 → can't fail
- S&M ≥ 1 → "Advanced marketing campaign"; ≥ 2 → cheaper; ≥ 3 → can't fail
- R&D ≥ 1 → "R&D points"; ≥ 2 → 30% more; ≥ 3 → "Ability to create next-gen products"; ≥ 4 → points accumulate at a loss
- HR ≥ 1 → "Immediate bonuses"; ≥ 2 → leave covered 50%; ≥ 3 → more candidates; ≥ 4 → auto-training
- Finance ≥ 1 → "Patent Portfolio Expansion"; ≥ 2 → cheaper; ≥ 3 → "Efficiency Improvement 30% cheaper"; ≥ 4 → reserves +30%
- IT ≥ 1 → "Accumulate R&D points daily"; ≥ 2 → "Remote work +50%"; ≥ 3 → extra daily points for INT>70; ≥ 4 → all R&D expedited

### 10.4 Development-project conversion (`company_develop_points_*`) — ✅ `gml_Object_o_control_Draw_0.gml:2597-2783`
- `o_flying_circle.Destroy` adds +1 to `company_develop_points_int/prec/char` depending on `image_index` (0/1/2) — i.e. the player spends `human_point_*` currency in the staffing screen (`Draw_0:2497-2524`, `irandom(20) == 1` per free-worker tile drawn, purely as a clickable easter-egg) — 🟡 this is the only way these accumulate for a normal player.
- `ceo_yes` seeds them for a takeover: `irandom_range(5,50) / irandom_range(4,55) / irandom_range(4,55)` (`gml_GlobalScript_check_new_director.gml:75-77`).
- "Project complete" (`finisher` timeline) multiplies by `koef_plus` (a function of `global.levelproject`, 0 → 3), then:
  - `t=50`: `company_points[player] += round(company_develop_points_int * koef_plus)`; reset
  - `t=100`: `rezerv_change(company_develop_points_prec * 10000 * koef_plus)`; reset
  - `t=150`: `ochki = round(company_develop_points_char / 33)`; at `t=200` apply `ochki` random **+1 XP and ×1.02 all-stats** to `ochki` random free workers.

---

## 11. NPC humans

### 11.1 Generation — ✅ `s_human_generate(arg0, arg1 = 0)` `gml_GlobalScript_s_human_generate.gml:1-217`
Called once at boot with `arg0 = global.human_kol = 800`. Loop bound is `for (var i = arg1; i < (arg1 + arg0 + 10); i++)` → creates **810** humans (indices 0..809; index 0 is the player).

Per human:
```gml
global.human_surname[i] = irandom_range(1, 103);
global.human_sex[i]     = choose(0, 0, 1);                       // 2:1 male:female
global.human_name[i]    = (sex==1) ? irandom_range(151,338) : irandom_range(1,149);
global.human_stamina[i]      = irandom_range(80, 100);
global.human_intelligence[i] = irandom_range(1, 100);
global.human_charisma[i]     = irandom_range(1, 100);
global.human_precision[i]    = irandom_range(1, 100);
global.human_point_precision[i]    = irandom(2);                 // 0 or 1
global.human_point_intelligence[i] = irandom(2);
global.human_point_charisma[i]     = irandom(2);
global.human_cultist[i]  = choose(0 ×15, 1);                     // ~6% cultists
global.human_telephone[i]= random_range(111111, 999999);
global.human_yakuza[i]   = irandom(3);                           // 0..2
global.human_nastriy[i]  = irandom_range(70, 100);
global.human_zp_echo[i]  = 1;
global.human_gifted[i]   = -1;  global.human_unique[i] = 0;  global.human_hyst[i] = -1;
global.human_price[i] = 0;  global.human_desired_price[i] = 0;
global.human_days_off[i] = 0;  global.human_longbad[i] = 0;  global.human_friend[i] = 0;
```
Player (i == 0): all stats set to 10, surname `" "`, name `global.myname` (`:42-50`).

**XP from talent** (`:167-176`):
```gml
var medi = round(median(global.human_intelligence[i], global.human_charisma[i], global.human_precision[i]));
global.human_xp[i] = 0;
if (medi < 33)               { global.human_xp[i] = choose(0, irandom(15)); }
if (medi >= 33)              { global.human_xp[i] = irandom_range(round(medi * 0.3), medi); }
```
🟡 So XP ≈ 0.3·median…median, capped at 100 naturally (median ≤ 100).

**Initial jobs** (`:129-154`) — 🟡 rarity of the "good" rolls:
```gml
repeat (irandom_range(1, 4)) { human_work_add(i, choose(irandom_range(101,137), irandom_range(10,34)), irandom(work_number_max)); }
if (irandom(11) == 3) { human_work_add(i, 2, irandom(work_number_max));
                        global.human_precision[i] = irandom_range(60, 89); global.human_charisma[i] += irandom_range(30, 45); }   // ~9.1%
if (irandom(55) == 3) { human_work_add(i, 1, irandom(work_number_max));
                        global.human_precision[i] = irandom_range(60, 99); global.human_charisma[i] += irandom_range(30, 45); }   // ~1.8%
if (irandom(100) == 3){ human_work_add(i, 1, irandom(work_number_max));
                        global.human_precision[i] = irandom_range(60, 99);
                        global.human_intelligence[i] = irandom_range(60, 99); global.human_charisma[i] += irandom_range(30, 45); }   // ~1%
```
🟡 Interpretation: ~1% get a CEO job with all three stats ≥ 60 ("rare superstar"), ~1.8% board member with precision 60-99, ~9% board member with precision 60-89. Note the charisma bonuses can push values above 100; the post-fixes at `:155-166` are buggy (`if (human_charisma > 100) { human_precision = irandom_range(80,100); }`).

**Friendship seeding** (`:199-213`): 7 random humans get friendship 1-35; all humans in `0..arg0` with `human_friend > 0` are marked `human_new = 0` (i.e. not "new arrivals" → not in the hiring pool). Finally `s_human_unique_generate()` and `global.human_friend[find_people(2, worknumcomp)[0]] = irandom_range(15, 33)` make one board member a friend.

### 11.2 Unique NPCs — ✅ `s_human_unique_generate()` `gml_GlobalScript_s_human_unique_generate.gml:5-67`
`global.human_kol2 = 2` → indices `human_kol+1` (Amy, female, INT 100 / CHAR 90 / PREC 85 / STA 90 / XP 100, type 7) and `human_kol+2` (Koba, male, INT 25 / CHAR 74 / PREC 55 / STA 55 / XP 25, type 2). Both get `human_work_add(i, 201, 0)` and Amy also `human_work_add(i, 200, 0)`.

### 11.3 Candidate pool (`global.humannew`) — ✅ `newhuman()` `gml_Object_o_control_Create_0.gml:237-264`
```gml
var maxpeople = clamp(irandom(25), irandom_range(1, 3) + 1, 2 + (all_levels_comp * relerp(0, 100, global.company_char[global.player_compnumber][0], 0.3, 1.5)));
if (global.mycomp_level_bonus[4] > 2) { maxpeople = round(maxpeople * 1.7); if (maxpeople > 35) { maxpeople = 35; } }
for (var i = 1; i <= global.human_kol; i++) { if (get_work_human(i, 0) > 100) { array_insert(global.humannew, 0, i); } }
global.humannew = array_shuffle(global.humannew);
if (array_length(global.humannew) >= maxpeople) { array_resize(global.humannew, maxpeople); }
```
🟡 Eligible = anyone without a company job (`prof > 100`). Pool size scales with `all_levels_comp` and morale; HR perk 3 ⇒ ×1.7 (cap 35).

### 11.4 Hiring — ✅
Trigger: `gml_Object_o_control_Step_0.gml:4324-4426`, once per day for days 4..18:
```gml
if (myday > 3 && myday < 19) {
    komp = random_all_company();
    if (komp != 0) {
        if (random(155) < shans_ludi) {
            humanrandom = irandom_range(1, global.human_kol - 1);
            …
            otkuda = get_workplace_human(humanrandom, 0);
            kuda   = random_all_company();
            …
            if (kuda == global.player_compnumber) {
                var type = global.human_type[humanrandom];
                var nummessage = 2105 + (irandom(3) * 8) + type;
                global.hireid = humanrandom;
                create_question2(txt(3675), txt(nummessage), scr_hire, scr_reject, humanrandom);
            }
            else { … NPC job-switch logic with change_hype() on both companies … }
```
✅ **There is no hire/reject probability** — the player is simply asked; `scr_hire` / `scr_reject` (`gml_GlobalScript_scr_hire.gml:1-18`) just count achievements:
```gml
function scr_hire() {
    human_work_add(global.hireid, 35, global.player_compnumber);
    global.human_nastriy[global.hireid] = irandom_range(70, 90);
    global.human_stamina[global.hireid] = irandom_range(85, 95);
    …
    global.p_hires += 1;  achivka_full("comp_hire", global.p_hires);
}
function scr_reject() { global.p_rejects += 1;  achivka_full("comp_reject", global.p_rejects); }
```
🟡 Note hiring **resets** the worker's morale and stamina to fresh-hire values.

**Staff cap:** `max_workers = min(78, (all_levels_comp * 3) + 2)` (`gml_Object_o_control_Alarm_1.gml:582`); the "hire" panel is only shown when `array_length(myworker_all) < max_workers` (`gml_Object_o_control_Draw_0.gml:2537`).

### 11.5 Daily human stat model — ✅ `gml_Object_o_control_Step_0.gml:~330-601`

```gml
if (global.mycomp_level_bonus[4] > 1) {                       // HR lvl ≥ 2 → auto-vacation
    if (global.human_stamina[i] < irandom_range(45, 51)) { global.human_days_off[i] = irandom_range(7, 9); }
}
if (global.human_days_off[i] > 0) { global.human_stamina[i] += irandom_range(6, 11); global.human_nastriy[i] += irandom_range(2, 3); }
global.human_days_off[i] -= 1;
if (global.human_days_off[i] < 0) { global.human_days_off[i] = 0; }
if (get_workplace_human(i, 0) != global.player_compnumber) {
    if (irandom(15) == 1) { global.human_price[i] = lerp(global.human_price[i], round((calc_price_human(i) * random_range(0.9,1.1)) / 1000) * 1000, 0.1); }
}
…
if (get_workplace_human(i, 0) == global.player_compnumber) {
    if (koef_happy_HR > 1) { global.human_nastriy[i] -= koef_happy_HR * 0.02; global.human_stamina[i] -= koef_happy_HR * 0.005; }
    global.human_zp_echo[i] = lerp(global.human_zp_echo[i], 1, 0.05);
    var checks = median(global.company_char[mycomp][1] + global.company_char[mycomp][2] + global.company_char[mycomp][3]);
    if (checks > 40) { checks = 60; }
    var koef_nastr = relerp(0, 100, global.human_nastriy[i], 1.6, 0.75) * relerp(0, 60, checks, 3, 1);
    if (holyday == 0) {
        global.human_stamina[i] -= random_range(0.1, 0.3) * koef_nastr;
        global.human_nastriy[i] -= 0.5 * relerp(0, 60, checks, 3, 0);
        if (checks < 25) { global.human_nastriy[i] -= 0.5; }
        if (global.human_nastriy[i] > 30) { if (checks < 15) { global.human_nastriy[i] -= 0.5; } }
        if (global.human_nastriy[i] > 30) { if (checks <  6) { global.human_nastriy[i] -= 0.5; } }
        if (global.human_nastriy[i] > 50) { if (checks < 33) { global.human_nastriy[i] -= 0.4; } }
        if (global.mycomp_level_bonus[4] > 3) {                  // HR lvl 4 = auto-training
            if (global.human_stamina[i] > 70) {
                if (global.human_xp[i] < 100) {
                    var size_upgr = 1.0005;  var rizn = 1 - (size_upgr / 1.04);
                    global.human_charisma[i]     = global.human_charisma[i]     * size_upgr;
                    global.human_intelligence[i] = global.human_intelligence[i] * size_upgr;
                    global.human_precision[i]    = global.human_precision[i]    * size_upgr;
                    global.human_xp[i] += random_range(4, 6) * rizn;
                    if (global.human_xp[i] >= 100) { global.human_xp[i] = 100; }
                }
                global.human_charisma[i]     = clamp(global.human_charisma[i], 0, 100);
                global.human_intelligence[i] = clamp(global.human_intelligence[i], 0, 100);
                global.human_precision[i]    = clamp(global.human_precision[i], 0, 100);
            }
        }
        if (global.human_stamina[i] < 60) { global.human_nastriy[i] -= relerp(0, 60, global.human_stamina[i], 2, 0.05); }
    }
    else { global.human_stamina[i] += random_range(0.05, 0.1); }
    if (irandom(3) == 1) { if (global.human_nastriy[i] > global.human_stamina[i]) { global.human_nastriy[i] = lerp(global.human_nastriy[i], global.human_stamina[i], 0.001); } }
    var calc_price = calc_price_human(i);
    if (global.human_desired_price[i] == 0) { global.human_desired_price[i] = global.human_price[i]; }
    global.human_desired_price[i] = lerp(global.human_price[i], calc_price, random_range(0.01, 0.05));
    var happy_zp = global.human_price[i] / global.human_desired_price[i];
    if (holyday == 0) {
        if (happy_zp < 0.94) { global.human_nastriy[i] = lerp(global.human_nastriy[i], global.human_nastriy[i] - ((1 - happy_zp) * 20), 0.015); }
        if (happy_zp > 1.09) { global.human_nastriy[i] = lerp(global.human_nastriy[i], relerp(0.7, 1.5, happy_zp, 10, 90), 0.005); }
        if (global.human_nastriy[i] < 35) { global.human_longbad[i] += 35 - global.human_nastriy[i]; }
        else { global.human_longbad[i] -= global.human_nastriy[i]; if (global.human_longbad[i] < 0) { global.human_longbad[i] = 0; } }
    }
    if (holyday == 0 && event_human_work == 0 && global.human_days_off[i] <= 0) {
        if (global.company_rezerv[global.player_compnumber] < 0) { global.human_stamina[i] -= random_range(1,3); global.human_nastriy[i] -= random_range(1.5,4); }
        if (global.human_longbad[i] > 125 && global.human_nastriy[i] < 40) { if (irandom(1000) < global.human_longbad[i]) { event_human_work = 3; } }  // resignation
        if (global.human_stamina[i] < 30)                     { if (irandom(150) < global.human_stamina[i]) { event_human_work = 1; } }   // wants vacation
        if (happy_zp < 0.82) { if (irandom(40) == 1) { event_human_work = 2; } }                                                     // wants a raise
        if (happy_zp < 0.61) { if (irandom(20) == 1) { event_human_work = 2; } }
        …
    }
}
```
🟡 The four "unhappy employee" prompts: `1` = vacation (`human_vidpustka_yes/no`), `2` = raise (`human_salaryup_yes/no`), `3` = resignation (`human_uvolit`).

**Unreserved workers train themselves** (`mycompany_step.gml:27-58`): each day, not on a holiday, for every worker in `myworker_free`:
```gml
if (global.company_char[mycomp][0] > 9) {
    if (irandom(100) < global.company_char[mycomp][0]) {           // morale gates practice
        if (irandom(666) < global.human_precision[num])    { global.human_point_intelligence[num] += 1; }
        if (irandom(666) < global.human_intelligence[num]) { global.human_point_precision[num]    += 1; }
        if (irandom(666) < global.human_charisma[num])     { global.human_point_charisma[num]     += 1; }
    }
}
```
> ⚠️ Note the **crossed** conditions (precision test increments the intelligence point, etc.) — verbatim from `gml_GlobalScript_mycompany_step.gml:41-52`.

### 11.6 Salary — ✅ `calc_price_human(human, arg1 = 0)` `gml_GlobalScript_calc_price_human.gml:1-36`
```gml
var hyst_bonus = 0;
if (global.human_hyst[arg0] > 0 && global.human_hyst[arg0] != 8) { hyst_bonus = 50; }
summa = hyst_bonus + global.human_intelligence[arg0] + global.human_charisma[arg0] + global.human_xp[arg0] + global.human_precision[arg0];
var base_requirement = 50000;  var level_multiplier = 2;  var level = 5;
if (global.player_compnumber > -1) {
    level = get_level(round_fixed(global.company_price[global.player_compnumber] * 0.0001, -4), base_requirement, 1.25);
    if (rab >= 0 || arg1 == 1) { koef_zp = round_fixed(global.company_price[global.player_compnumber] * 0.0001, -4); }
    if (koef_zp < 6666) { koef_zp = 0; }
}
var rezza = summa * global.price_koef * level;
if (check_level_rep(2) >= 3) { rezza *= 0.8; rezza = round(rezza); }
return rezza;
```
with `get_level(x, base, mult, arg3=1, arg4=50) = clamp(floor(ln(x/base)/ln(mult) + 1), arg3, arg4)` (`gml_GlobalScript_get_level.gml:8-10`).
`global.price_koef = round(1000 * global.rynochek * global.trend)` (`gml_Object_o_control_Create_0.gml:891`).
`koef_zp` is computed but **never multiplied in** — dead variable. ❓

### 11.7 Boss actions (`s_boss_*`) — ✅ `gml_GlobalScript_s_boss_bonus.gml`

| function | cost | effect |
|---|---|---|
| `s_boss_bonus` | `bonus_size = round(max(calc_price, human_price) * 2 / 1000) * 1000` (`o_human_Draw_73.gml:184,204`) | `stamina += round(irandom_range(3,5) * zp_echo)`; `nastriy += round(irandom_range(7,12) * zp_echo)`; `zp_echo *= random_range(0.5, 0.66)`; friendship +`round(irandom_range(1,4) * zp_echo)` (only if `friend < 30`) or +1 if 30..50 |
| `s_boss_vacation` | free | `change_friend(1)`; `nastriy += irandom_range(3,5)`; `days_off = irandom_range(10,14)` |
| `s_boss_training` | `training_size = relerp(0, 200, hum_xp + (hum_char + hum_int + (hum_prec/3)), 10, 500) * 5000` (`o_human_Draw_73.gml:205`) | requires `xp < 100` and `stamina ≥ 20`; all three stats `= ceil(stat * 1.04)`; `xp += irandom_range(4,6)` (cap 100); `stamina -= irandom_range(5,15)`; `nastriy += irandom_range(5,8)` |
| `s_boss_dohana` ("загоняет") | free | `shans = human_nastriy[h]`; if `irandom(100) > shans` → friendship −`clamp(irandom_range(7,11), friend−2, 11)`, `nastriy -= irandom_range(16,25)`, `stamina += irandom_range(5,6)`; else friendship −`irandom_range(1,3)`, `nastriy -= irandom_range(5,10)`, `stamina += irandom_range(13,20)` |
| `s_boss_reassign` | free | removes from all 7 `mycomp_workers` and `human_work_add(h, 35, player)` (back to the generic hire role) |
| `s_boss_terminate` / `_term_yes` | free | `human_uvolit(h)`; if `o_human.nedovolen == 1` → friendship `irandom_range(-10,-30)`; if 0 → 50% chance `irandom_range(-1,-3)` |

`human_uvolit(h)` (`gml_GlobalScript_human_uvolit.gml`) removes the human from all departments and pushes `human_work_add(h, 134, 0)` (unemployed).

Other worker interactions:
- `human_vidpustka_yes` (`gml_GlobalScript_human_vidpustka_yes.gml:1-8`): `change_friend(1)`, `nastriy += 2..3`, `days_off = irandom_range(12,16)`.
- `human_vidpustka_no` (`:10-17`): `stamina += 3..8`, `nastriy -= 7..15`, `change_friend(-3)`.
- `human_salaryup_yes` (`:19-25`): `nastriy += 12..16`, `human_price = round_fixed(calc_price_human(h) * 1.25, -4)`.
- `human_salaryup_no` (`:27-32`): `nastriy -= 15..18`.
- Bulk raise: `b_comp__zp_yes` (`gml_GlobalScript_scr_comp_upgrade1.gml:329-350`) sets `human_price = round_fixed(calc_price_human(i)*1.2, -4)` and grants `nastriy += (1 − old/need) * 60` (cap 100).

### 11.8 NPC job mobility — ✅ `gml_Object_o_control_Step_0.gml:4403-4573`
Role-based 1-in-5 / 1-in-6 rolls move employees between random companies: directors can be demoted to board members (and the reverse), employees can be reassigned to a random sub-role `irandom_range(10,34)`, or moved to a generic job `irandom_range(101,137)`. Each move calls `change_hype(company, arg1)` with `arg1 = 0` (→ `random_range(-5,5)`) or `random_range(-2,2)` on both the gaining and losing company.

---

## 12. Random in-company events (`situation_*`) ✅

### 12.1 Trigger and selection
`gml_Object_o_control_Step_0.gml:4577-4799`:
```gml
if (global.player_compnumber >= 0) { shans_mycomp += random_range(0.3, 1); } else { shans_mycomp = 0; }
if (global.hospital == 0 && global.turma == 0 && global.otpuskdays <= 0) {
  if (shans_mycomp > irandom_range(20, 100) && global.player_compnumber >= 0 && global.company_strike == 0) {
      shans_mycomp = 0;
      var random_worker = get_random_worker_player();
      var checks_now = ds_list_create();
      if (random_worker == -1) { exit; }
      ds_list_add(checks_now, 0, 5, 6, 7, 8, 11, 15, 16, 17, 18, 20, 21, 22);       // 13 always-allowed ids
      if (company_char[pc][0] < 30) { ds_list_add(checks_now, 9); }
      if (company_char[pc][0] < 23) { ds_list_add(checks_now, 10, 10, 10); }
      if (company_char[pc][0] < 20) { ds_list_add(checks_now, 10); }
      if (company_char[pc][0] < 18) { ds_list_add(checks_now, 10); }
      if (company_char[pc][0] < 16) { ds_list_add(checks_now, 10); }
      if (random_worker != -1) { ds_list_add(checks_now, 1); if (irandom(4) == 1) { ds_list_add(checks_now, 13); } }
      if (global.season == 0) { ds_list_add(checks_now, 14); }
      if (char[0] > 40 && char[1] > 55 && char[2] > 50 && char[3] > 55) { ds_list_add(checks_now, 19); }
      if (company_hype[pc] > 0.7)  { ds_list_add(checks_now, 23); }
      if (company_hype[pc] > 0.9)  { ds_list_add(checks_now, 23); }
      if (company_hype[pc] > 1.03) { ds_list_add(checks_now, 23); }
      if (global.level_viddil[6] > 0) { ds_list_add(checks_now, 2); }
      if (global.level_viddil[4] > 0) { ds_list_add(checks_now, 3); }
      if (global.level_viddil[3] > 0) { ds_list_add(checks_now, 4); }
      if (global.level_viddil[1] > 0) { if (irandom(4) == 1) { ds_list_add(checks_now, 12); } }
      ds_list_shuffle(checks_now);
      situation = ds_list_find_value(checks_now, 0);
      switch (situation) { … }
```
✅ **Trigger probability**: an accumulator `shans_mycomp += random_range(0.3, 1)` per day (≈0.65 mean) against `irandom_range(20, 100)` → expected one event every **≈37 trading days**. After firing, `shans_mycomp = 0`.

**Selection is a weighted bag**: each eligible id is *duplicated N times* into `checks_now` and the list is shuffled, then index 0 is taken. So P(id) = (number of copies)/(total copies). Baseline bag = 13 entries → each of the 13 always-allowed ids is ≈7.7% before conditionals.

### 12.2 Full event table

| id | Text (EN, `stonks.csv`) | Cost | YES outcome | NO outcome |
|---|---|---|---|---|
| **0** | Product defect — do we recall? (`txt(2662)`) | `event_price = round_fixed(price * random_range(0.03, 0.1), 4)` | after 3-5 days: `hype −0.1`, `change_char(1,2)` (`situation_0_yes_rezult`, `:8-16`) | 50%: after 5-20 days `change_my_sovet(-4)`, `hype −0.4`, `hype_effect = −10`, `stockprice × random_range(0.7,0.93)`, `profit −0.2` (`:28-40`) |
| **1** | Executive scandal — fire them? (`txt(2667)`) | free | `human_uvolit(random_worker)`; after 1 day `hype += 0.2`, `stockprice × random_range(1.01,1.03)` (`:49-59`) | 50%: after 5 days `change_my_sovet(-2)`, `hype −0.3`, `stockprice × random_range(0.9,0.95)`, `hype_effect = −10` (`:69-81`) |
| **2** | Outdated servers — upgrade? (`txt(2677)`) | `price * random_range(0.05, 0.15)` | after 5 days: `price += price * random_range(1.01,1.05)`, `profit += 0.2`, `hype += 0.2`, `stockprice × random_range(1.01,1.03)` (`:90-101`) | `situation_2_no()` is **empty** (`:103-105`) |
| **3** | HR training program (`txt(2679)`) | `price * random_range(0.07, 0.1)` | after 5 days: `profit += 0.01`, `hype += 0.01`; every employee with `xp < 100`: all 3 stats `×1.05` (clamped 0-100), `xp += random_range(5,7)`, `stamina += irandom_range(5,15)`, `nastriy += irandom_range(14,22)` (`:114-148`) | same as #2 (uses `situation_2_no`) |
| **4** | Patent infringement — sue? (`txt(2681)`) | `price * random_range(0.03, 0.09)` | after 11 days: `price += price*random_range(1.01,1.05)`, `profit += 0.2`, `hype += 0.2`, `stockprice × random_range(1.01,1.03)`, `char[4] += random_range(3,10)`, `char[3] −= random_range(15,25)` (`:192-204`) | 50% at +17d: notification only. 50% at +19d: `rezerv_change(price * random_range(0.1,0.7))`, `profit −0.5`, `hype −0.3`, `hype_effect = irandom_range(-1,-20)`, `stockprice × random_range(0.84,0.94)`, `char[4] −= random_range(3,10)`, `change_my_sovet(-4)` (`:157-190`) |
| **5** | Event sponsorship (`txt(2685)`) | `price * random_range(0.05, 0.11)` | 90%: after 7d `char[3] += random_range(30,44)`, `profit += 0.33`, `hype += 0.2`. 10%: after 7d `profit −= 0.33` (`:206-238`) | n/a (`Pusto`) |
| **6** | Government social initiatives / tax incentives (`txt(2688)`) | `price * random_range(0.05, 0.14)` | 75%: after 7d `char[3] += random_range(11,12)`, `profit += 0.33`, `hype += 0.2`. 25%: `profit −= 0.22` (`:240-272`) | n/a |
| **7** | Pop-culture marketing campaign (`txt(2691)`) | `price * random_range(0.05, 0.1)` | 75%: after 7d `change_my_sovet(3)`, `char[3] += random_range(11,12)`, `profit += 0.33`, `hype += 0.2`, `hype_effect = irandom_range(6,30)`, `stockprice × random_range(1.05,1.15)`. 25%: `profit −= 0.22` (`:274-310`) | n/a |
| **8** | Cheap imports — **Quality** or **Fast production**? (`txt(2694)`, choices `txt(2695)/txt(2696)`) | free (3-way choice) | **Quality**: 75% `change_my_sovet(5)`, `profit += 0.15`, `hype += 0.15`, `hype_effect = irandom_range(1,5)`, `stockprice × random_range(1.05,1.15)`, `char[3] += random_range(11,15)`; 25% `profit −= 0.3`, `hype −= 0.15`, `hype_effect = −irandom_range(4,22)`, `char[3] += random_range(5,11)`. **Fast production** (⚠ inverted 25% good): 25% `change_my_sovet(5)`, `profit += 0.66`, `hype += 0.3`, `hype_effect = irandom_range(11,22)`, `stockprice × random_range(1.15,1.25)`, `char[3] −= random_range(22,33)`; 75% `change_my_sovet(-3)`, `profit += 0.35`, `hype −= 0.23`, `char[3] −= random_range(15,22)` (`:312-393`) | n/a |
| **9** | Wage complaints / strike threat (`txt(2702)`) | wage budget | `char[0] += random_range(15,25)`; every employee `nastriy += irandom_range(20,60)` and salary raised to `calc_price_human(i, 1)`; after 2d `change_my_sovet(3)` and `char[0] += random_range(5,20)` (`:411-443`) | `char[0] −= random_range(15,25)`; every employee `nastriy −= irandom_range(5,33)` (`:395-409`) |
| **10** | **STRIKE!** (`txt(2705)`) | — | — | `global.company_strike = 1` (`:4711-4714`). All department power → 0.06; morale ×0.95 −0.2; ends when `char[0] > random_range(30,50)` |
| **11** | TV show product placement (`txt(2708)`) | free | after 5d `change_my_sovet(-3)`, `profit += 0.35`, `hype −= 0.23`, `char[3] −= random_range(10,16)` (`:445-461`) | n/a |
| **12** | *(text 2710/2712/2715/2718/2719 family)* | — | inline: `stockprice × random_range(0.98,0.99)`, `price × random_range(0.95,0.99)`, `profit −0.4` / `−0.22` / `−0.1` / `−0.15` (`:4718-4780`) | |
| **13** | Employee resignation (`txt(2711)`) | — | inline (1/4 chance of being added when the event fires): `human_uvolit(random_worker)`, `char[0] −= random_range(15,25)`, `profit −= 0.1` (`:4724-4729`) | |
| **14** | Snowstorm (`txt(2712)`), only when `global.season == 0` | — | inline: `stockprice × 0.98-0.99`, `price × 0.95-0.99`, `profit −= 0.22` (`:4730-4735`) | |
| **15** | Competitor PR crisis (`txt(2713)`) | — | inline: `stockprice × random_range(1.05,1.14)`, `price × random_range(1.01,1.06)`, `profit += 0.4` (`:4736-4741`) | |
| **16** | Pop star spotted using product (`txt(2714)`) | — | inline: `stockprice × random_range(1.01,1.08)`, `price × random_range(1.01,1.02)`, `char[0] += random_range(15,25)`, `profit += 0.25` (`:4742-4748`) | |
| **17** | Power grid outage (`txt(2715)`) | — | inline: `stockprice × 0.98-0.99`, `price × 0.98-0.99`, `profit −= 0.1` (`:4749-4754`) | |
| **18** | Fashion trend (`txt(2716)`) | — | inline: `stockprice × random_range(1.01,1.05)`, `price × random_range(1.01,1.03)`, `char[0] += random_range(10,15)`, `profit += 0.15` (`:4755-4761`) | |
| **19** | Government award (`txt(2717)`), requires `char[0]>40, char[1]>55, char[2]>50, char[3]>55` | — | inline: `stockprice × random_range(1.01,1.15)`, `price × random_range(1.01,1.13)`, `char[0] += random_range(10,15)`, `profit += 0.3` (`:4762-4768`) | |
| **20** | Transit strike (`txt(2718)`) | — | inline: `stockprice × 0.98-0.99`, `price × 0.98-0.99`, `profit −= 0.15` (`:4769-4774`) | |
| **21** | Crime wave (`txt(2719)`) | — | inline: identical to #20 (duplicate code + duplicate text id) (`:4775-4780`) | |
| **22** | *(same text 2719)* | — | inline: `stockprice × 0.98-0.99`, `price × 0.98-0.99`, `char[3] −= random_range(5,15)`, `hype −= 0.3`, `hype_effect = −11`, `profit −= 0.15` (`:4781-4789`) | |
| **23** | Investor interest (0.7/0.9/1.03 hype thresholds → up to 3 copies) | free | inline: `stockprice × random_range(1.01,1.03)`, `price × random_range(1.01,1.03)`, `profit += 0.15`, `rezerv_change(price * random_range(0.4, 2))` (`:4790-4797`) | |

> ⚠️ Note the `situation_8_speed_*` roll is inverted relative to `situation_8_quality_*`: `if (irandom(4) == 1) delay_action(7, "situation_8_speed_good")` (`:358-365`), i.e. the *good* branch has 25% probability while quality's good branch has 75%. Quoted verbatim.

---

## 13. Notifications (`notif` / `change_char`) ✅

`gml_GlobalScript_notif.gml`:
```gml
function change_char(arg0, arg1) {
    if (check_level_rep(2) >= 5) { if (arg0 < 0) { arg0 += 1; if (arg0 == 0) { exit; } } }   // karma perk softens penalties
    global.char[arg1] += arg0;
    if (arg1 == 2 && arg0 < 0) { global.days_with_bad_carma += (abs(arg0) * 31); global.days_without_bad_things = 0; global.stress += (abs(arg0) * 10); }
    if (global.traits[6] == 1)   { if (arg1 == 0 && arg0 < 0) { global.stress += (abs(arg0) * 15); global.happy -= (abs(arg0) * 4); } }
    notif(arg0, arg1);
}
function change_char_procent(arg0, arg1) { /* clamped to ±5, relative change */ }
function change_amy(arg0) { global.emi += arg0; notif(arg0, 8); }
```
🟡 `global.char[0..8]` are the player's nine character stats (reputation `char[4]`, karma `char[2]`); `char[7]` = their daily mean (`Step_0:623`) and feeds the acquisition success check.

`create_notification(title, text, human, …)` / `clear_notif()` / `notif()` push into `global.notific` / `global.notific2` and are drawn by `o_notif*` objects. Purely presentational.

---

## 14. Notable original bugs / dead code (all VERIFIED)

| # | Where | Issue |
|---|---|---|
| 1 | `Step_0:1238,1243` | `round(global.company_profit_effect[i] > 0)` / `round(global.company_profit_effect[i] < 0)` — comparison inside `round()`; the negative branch is unreachable and the positive branch always fires, so profit drifts **up** regardless of `profit_effect` sign |
| 2 | `sobranie_begin.gml:65,72` | `company_hype -= random_range(-0.3,-0.6)` and `-= random_range(-0.1,-0.3)` → hype **increases** on the two worst meeting outcomes |
| 3 | `mycompany_step.gml:315-326` | `big_data[3] < 1_000_000 / 100_000 / 10_000` — these are percentages; the player's hype loses a flat **−0.008/day** |
| 4 | `mycompany_step.gml:41-52` | Crossed conditions: `irandom(666) < human_precision` → `human_point_intelligence += 1`, etc. |
| 5 | `s_create_company.gml:58` | `min(1, global.min_all_limit + random(0.170001) + 15)` — the `+ 15` makes player free float always 100% on Easy |
| 6 | `s_human_generate.gml:159-162` | `if (global.human_charisma[i] > 100) { global.human_precision[i] = irandom_range(80, 100); }` — wrong variable |
| 7 | `scr_random_events_in_company.gml:355-393` | `situation_8_speed_good` branch is selected with p=1/4 while `situation_8_quality_good` has p=3/4 |
| 8 | `get_potential_viddil.gml:139-141` vs `scr_hire.gml:89-91` | prof 27 maps to dept 3 in one function and dept 4 in the other |
| 9 | `calc_price_human.gml:22` | `koef_zp` computed but never used in `rezza` |
| 10 | whole subsystem | **`global.mycomp_hvylya[0..7]` is written (initialised to 1, bumped by every R&D/upgrade, decayed in `mycompany_step`) but never read for any effect.** Dead state. |
| 11 | `update_price2.gml:68` | uses `argument0` (undefined) in the `chart_add_data` call |
| 12 | `o_control_Alarm_1.gml:247-251` | clamps INT/PREC/nastriy/stamina/friend but **not charisma**; charisma >100 is visible in real saves |
| 13 | `o_control_Alarm_1.gml:453` | `if (o_control.all_levels_comp >= …)` inside `with` already at top level — harmless |
| 14 | `random_company.gml:48,102,147` | `if (llist == [])` compares an array to an array literal — always false; `arg1 == 1` return path is effectively broken |

---

## 15. Open questions / unverified

1. **`init_company()` has no caller.** ❓ It is the only place that uses `ds_map`-based company records, `global.comp_names`, `global.comp_colors`, `c_get`, `sMarketing[...]` maps and the 1-12 `dohodmesyacN` naming. Almost certainly pre-refactor dead code.
2. **`global.company_char[N][2]` vs `[3]`.** 🟡 I assigned `[1]=Operations/production`, `[2]=R&D`, `[3]=Marketing`. The evidence is the `mycomp_effective[]` index mapping (1→Ops, 2→S&M, 3→R&D, 5→Finance) and the `txt(2536-2539)` warnings. But there is **no explicit label** in the code tying `company_char[2]` to "R&D" vs "marketing". Double-check against the in-game UI tooltips before relying on it.
3. **`global.big_data[0..3]` semantics.** 🟡 Derived from usage; the game never names them. `big_data[0]` doubles as *both* the dividend payout ratio and the `koef_invest` hype driver — that duality is unusual and might be intentional ("high dividends please the market") or a leftover.
4. **`global.koef_happy_HR` intent.** 🟡 `max(1, all_levels_comp/6) / level_viddil[4]` — the HR-vs-company balance metric. Used only to drain morale/stamina and to drive the `long_koef_HR` HR warning. Never clamped.
5. **`level_viddil[7]`.** Allocated and saved, set to `irandom_range(0,2)` on CEO takeover, but never read. Dead.
6. **Exact job titles for prof 10-34.** ❓ They exist in `get_info_human()` but I did not enumerate the full mapping (out of the assigned scope).
7. **`global.nikkei_price` / `global.nikkei_number`.** ❓ Used in `generate_company` and in the bankruptcy tests; I did not trace where they are computed/updated (likely the `commodity_update()`/`pum` market-event block around `Step_0:4800-5060`).
8. **`global.trend_target`, `global.price_building`, `global.price_cars`.** Their update loop (`Step_0:833-907`) is gated on `global.mode == 1 && holyday == 0` and driven by a `randomchange = irandom(?)` switch; I did not enumerate all branches.
9. **`company_rashod` / `company_dohod` for NPC companies.** Always 0 — NPC P&L is tracked only via `dohodmesyac_all` / `company_rezerv`. Verified no other writer.
10. **`company_rezerv` for the player** is written via `rezerv_change()` only; NPC reserves are updated in the monthly block with a `random_range(-0.1, 0.2)` multiplier (so they can *shrink* by up to 10%). Whether that's intentional (sloppy budgeting) or a bug is unclear.
11. **`human_charisma` clamp gap** — the original clearly intends 0-100 for all three core stats but only clamps two.
12. **`shans_ludi`** (the driver for the daily random-human/company pairing) — set to `irandom_range(-10, 50)` at boot (`gml_Object_o_control_Create_0.gml:415`) and reset to 0 after each event; I did not trace every mutation, so the exact daily probability of a candidate approach is approximate (`random(155) < shans_ludi` on days 4-18).
13. **`global.company_checkdays`** — set to `irandom_range(30,60)` on IPO/hire, decremented daily, and used by the FSA rule only when `diff_fsa == 1`. Whether it means anything outside FSA difficulty is unclear.

---

## 16. Quick reimplementation checklist

1. Company slots 0..29; live count `numberofcompany` starting at `6 + difficulty`.
2. Daily: advance date → `check_day_now` → per-company loop (A)→(H) → `mycompany_step()` for the player's company → sector decay → player events.
3. Monthly (`day 20`): close dividends, accumulate research points, refill reserves, pay out; `day 21`: ±0.03 profit drift; `Alarm[1]`: clamp humans, re-roll hyst/type, compute `mycomp_effective`, refresh free float.
4. Weekly (Thursday of `company_tyzhden[i]`): board meeting → `meet_rez` bucket → hype/stockprice effects.
5. NPC humans: 810 generated with INT/CHA/PREC uniform 1-100, XP from median, ~1% superstar rolls; daily stamina/morale/wage drift driven by company `char[1]+[2]+[3]` and `koef_happy_HR`.
6. Player company: 7 departments, each `level_viddil[i]` slots; effectiveness from stat-weighted employee power × stamina/morale × XP × morale coefficient, clamped `[0.1, 100]`, bucketed into `mycomp_level_bonus[0..4]` which gate perks and unlocks.