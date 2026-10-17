# STONKS-9800 — Time & Calendar, Game-Loop Cadence, Difficulty/Progression Tuning, Save/Load

Subsystem notes for the decompiled GML in `D:\stonks-re\full\code\`.
All claims are tagged **[VERIFIED]** (read directly out of the decompiled source / decoded save) or
**[INFERRED]** (derived arithmetic or inference from cross-references).
No constant is stated that is not present in the source.

---

## 0. Red herrings (things named like time but not)

| Symbol | Reality | Cite |
|---|---|---|
| `scr_time()` | **Not** a clock. Per-object movement/friction: `speed = spddd; if (friction > 0) spddd -= friction;` with a `global.lowfps == 1` variant for 120/240 fps rooms. | `gml_GlobalScript_scr_time.gml:1-47` |
| `scr_time_enemy()` | Same, with `global.kkk` speed multiplier. `global.lowfps`/`global.kkk` are set only by the shmup minigame (`o_player`). | `gml_GlobalScript_scr_time_enemy.gml:1-47`, `gml_Object_o_player_Create_0.gml:20-29` |
| `time_to_minutes_seconds(arg0)` | Pure display formatter `floor(arg0/60)/60` → `"MM:SS"`. | `gml_GlobalScript_time_to_minutes_seconds.gml:1-17` |
| `twerp(type,start,end,pos,…)` | TweenSpline/easing library (31 interpolation types). Nothing to do with calendar. | `gml_GlobalScript_twerp.gml:1-…` |
| `new_features.gml` | Actually `function smooth_approach(arg0,arg1,arg2,arg3=0.0005)` — a framerate-independent easing helper. | `gml_GlobalScript_new_features.gml:1-9` |
| `scr_help()` | Draws a single legacy debug string about the demo/beta; also toggles `global.lowfpsmode` text. | `gml_GlobalScript_scr_help.gml:1-13` |
| `scr_help_text(text,col)` | Bottom-of-screen outlined text draw helper (tooltips). | `gml_GlobalScript_scr_help_text.gml:1-18` |
| `is_workday` | **Does not exist anywhere in the codebase.** Working-day gating is done with `holyday == 0 && myweekday > 0 && myweekday < 6`. | grep over `*.gml` → 0 hits |

---

## 1. The time model

### 1.1 There is no wall-clock tick. A day is a 0→100 "budget".

The single authoritative clock variable is the **instance** variable `o_control.timer`, a float in
`0 … >100`. When it crosses 100 the calendar is advanced by exactly one day.

```gml
// gml_Object_o_control_Step_0.gml:110
if (global.stop == 0)
{
    if ((timer > 100 || startgame2 == 1) && (room == RoomMain || room == r_company))   // :112
    {
        …
        mydatetime = date_inc_day(mydatetime, 1);                                        // :127
        mymonth    = date_get_month(mydatetime);                                         // :128
        timer      = 0;                                                                  // :129
        newday     = 1;                                                                   // :130
```

Everything else that happens "per day" hangs off the flag `newday`, which is a **one-frame latch**:

```gml
// gml_Object_o_control_Step_0.gml:82
if (timer >= 1) { newday = 0; }
…
if (newday == 1)          // :230   ← 5 300-line block, all per-day simulation
{
    …
    startgame2 = 0;       // :693
    timer += 1;           // :694   ← day budget restarts at 1, not 0
    …
    gameday   += 1;       // :707
    workdays  += 1;       // :708
    …
    newday = 0;           // :5546
}                          // :5547
```
**[VERIFIED]** — the 237 KB `o_control` Step event is one flat function; the only block open from
line 230 to 5547 is `if (newday == 1) { … }` (line 5546 sets `newday = 0`, line 5547 closes it).

Consequence **[VERIFIED]**: a day costs **99 timer units**, not 100.

### 1.2 Who fills the timer

`o_control` fills the timer itself only when the player is in the main room and nothing is blocking:

```gml
// gml_Object_o_control_Step_0.gml:52
if (global.stop == 0 && global.vybrano != 4 && global.vybrano != 5
    && global.totalbankrupt == 0 && global.stoptime == 0 && !instance_exists(o_kalkulator))
{
    if (global.windowopen == 0)
    {
        if (time_speed == 2) { timer += 0.5; }   // :58
        if (time_speed == 3) { timer += 1;   }   // :62
        if (time_speed == 4) { timer += 2;   }   // :66
        if (time_speed == 5) { timer += 30;  }   // :70
    }
}
else { exit; }
```

Elsewhere (minigames / dialogue) the *minigame object* pushes `o_control.timer` directly, and it also
sets `global.stop = 1`, which makes `o_control`'s Step `exit` at line 76:

| Source | Code | Δ per step | Cap |
|---|---|---|---|
| `o_hikari_Step_0.gml:1-3` | `if (global.windowopen == 0 && o_control.timer < 99) { o_control.timer += 0.4; }` | +0.40 | 99 |
| `o_meeting_Step_0.gml:1-3` | `… o_control.timer += 0.25;` | +0.25 | 99 |
| `o_park_Step_0.gml:11-15` | `o_control.timer += 0.15;` | +0.15 | — |
| `o_temple_Step_0.gml:11-15` | `o_control.timer += 0.15;` | +0.15 | — |
| `o_human_Step_2.gml:61,75` | `o_control.timer += random_range(4, 7);` (job-hunt call stalls at `reznabor == 5` / `== 200`) | +4…7 (instant) | `timer < 96` |
| `o_human_Draw_73.gml:162-166` | `if (o_control.timer < 96) { … o_control.timer += random_range(4, 7); … }` (the "……." phone dialogue) | +4…7 (instant) | 96 |
| Debug only, `o_control_Step_1.gml:5-25` (`global.debugmode == 1`) | hold **Ctrl** → `timer += 730`; **Shift** → `global.skipall = 1`; **Ctrl+Z** → `timer += 730` + skipall | 730 (≈7 days) | — |

All three of `o_hikari`, `o_meeting`, `o_park`, `o_temple` set `global.stop = 1` and
`global.event = 1` in their Step. **[VERIFIED]**

### 1.3 Day length in real seconds

`room_speed` is never assigned outside the shmup minigame (`o_player_Draw_0.gml:63-70`,
`o_player_Step_1.gml:5`), so the main room runs at the GMS2 default **60 steps/s**.

| `time_speed` | Δ/step | frames/day | seconds/day @60 fps | in-game year (365 d) |
|---|---|---|---|---|
| 1 (**paused** — toggled by **Space**) | 0 (minigames only) | ∞ (0 s if no minigame) | — | — |
| 2 (**default**) | +0.5 | 198 | **≈ 3.30 s** | ≈ 20 min |
| 3 (debug) | +1 | 99 | ≈ 1.65 s | ≈ 10 min |
| 4 (debug) | +2 | 49.5 | ≈ 0.83 s | ≈ 5 min |
| 5 (debug) | +30 | 3.3 | ≈ 0.055 s | ≈ 20 s |

`time_speed` / `time_speed_now` defaults **both = 2** (`o_control_Create_0.gml:386,427`).
Space toggles between paused (1) and `time_speed_now`:

```gml
// gml_Object_o_control_Step_0.gml:23
if (keyboard_check_pressed(vk_space) || gamepad_button_check_pressed(global.gamepadnow, gp_face3))
{ if (time_speed > 1) { time_speed = 1; } else { time_speed = time_speed_now; } }
```
**[VERIFIED]**

Minigame-driven day durations **[INFERRED]** from the Δ/step values and 60 fps:

| Minigame | frames | seconds |
|---|---|---|
| Hikari (lightbulb) | 99 / 0.4 = 248 | ≈ 4.1 s |
| Meeting | 99 / 0.25 = 396 | ≈ 6.6 s |
| Park / Temple | 99 / 0.15 = 660 | ≈ 11.0 s |
| Job phone call | instantaneous (1 step, +4…7) | — |

### 1.4 Day / tick timeline (single in-game day, default speed)

```
frame 0        o_control Step: newday == 0, timer = T          → nothing but timers/alarms
…              o_control_Alarm_7 every 155 frames (price sanitation, §1.6)
…              o_cursor_Alarm_5 every 10  frames (dedupe achiv_queue)
…              o_cursor_Alarm_6 every 12  frames (pop 1 queued achievement)
frame N        timer crosses 100 →
               Step_0:112  day-advance branch taken
               :127  mydatetime = date_inc_day(mydatetime, 1)
               :128  mymonth    = date_get_month(mydatetime)
               :129  timer = 0 ; :130 newday = 1
               :147  all_seasons()                     ← palette / global.season
               :197  myweekday = date_get_weekday(...)  :198 myday = date_get_day(...)
               :230  ┌─ if (newday == 1) ───────────────────────────────────────────
               :234-254  achivka_full() sweep (place_*, cars_king, real_estate_king, megamoney)
               :255  money_need = random_range(22,44) * 11102778
               :260  New-Year hook (date_get_day_of_year == 1)
               :602-612 invest_build_days-- ; invest_center unlock
               :624  if (myday == 25) savegame("saveslot_auto")   ← ★ AUTOSAVE
               :628-681 cars wear / rent collection
               :682-692 short positions, shortproc
               :693  startgame2 = 0 ; :694 timer = 1
               :695  global.invest_days--
               :703  randomize() ; :704 names()
               :706  global.bezotpuska += 1 ; :707 gameday += 1 ; :708 workdays += 1
               :711  holyday = 0
               :720  check_day_now()                  ← sets holyday / prichina, New Year
               :737-744 fixed-date notifications (12/25, 1989-01-07)
               :765-783 birthday
               :785  global.trend += random_range(-0.01, 0.01)
               :833-908 market regime (mode==1) / :930+ historical script (mode==0)
               :909-929 global.delaydays[gameday] deferred scripts
               :1072 commodity_update()               (6 commodities)
               :1300-1531 PER-COMPANY loop: hype drift, profit, price, chart push
               :1546-1551 mycompany_step()
               :2341-2352 date_get_week == company_tyzhden[i] && Thursday → shareholder meeting
               :2620 if (gameday > 1) money_delete(global.trata)
               :2692-2715 new_company() spawns
               :3037-3263 myday == 20 → monthly dividend bookkeeping (dohodmesyac)
               :3260-3268 myday == 20 → lastprice[i] / lastdate[i] = "M/YYYY"
               :3300-…  weather/room/house/car/yakuza/bankruptcy/bailiff
               :4828/4932 commodity_update() (news events)
               :5546 newday = 0 ─────────────────────────────────────────────────────
frame N+1      back to idle
```

### 1.5 Market update tick

* **Per-day, per-company** (inside the `newday` block):

```gml
// gml_Object_o_control_Step_0.gml:1469
var pepsa = global.company_price[i] * 0.0015 * global.company_profit[i];
global.company_price[i]      = global.company_price[i] + (pepsa * 1.5);
global.company_stockprice[i] = global.company_price[i] * 0.8 * global.company_hype[i]
                               * global.rynochek * global.trend;
```
Chart point is pushed **only on trading days**:
```gml
// gml_Object_o_control_Step_0.gml:1509
if (holyday == 0 || (global.parttimework_days > 0 && myweekday > 0 && myweekday <= 3))
{ chart_add_data(sMarketing[i], global.company_stockprice[i] / global.company_number_a[i]); … }
```
**[VERIFIED]**

* **Event-driven** `update_price(i)` (immediate, re-prices + pushes a chart point) is called from
  `change_hype`, `prognozio`, `scr_random_events_in_company`, `scr_management`, `sobranie_begin`,
  `delete_company`, `company_merge`, `split_company`, `s_create_company`, `delay_action`, …
  `update_price` itself:
```gml
// gml_GlobalScript_update_price.gml:9
global.company_price[i]      += global.company_price[i] * 0.001 * global.company_profit[i];
global.company_stockprice[i]  = global.company_price[i] * 0.8 * global.company_hype[i]
                                * global.rynochek * global.trend;
```
Chart series are capped at **90 points** (`o_control_Step_0.gml:5586-5589` and everywhere a point is
pushed) — that is why `chart_series_data_N` is always 90 doubles. **[VERIFIED]**

* **Sanitation alarm** every **155 frames** (≈2.6 s), `alarm[7] = 155;`:
  floors stock price to 5000, liquidates anything < 10000, zeroes NaN/∞ prices, relaxes the daily
  trading limit by 6 % (`o_control_Alarm_7.gml:1-34`). **[VERIFIED]**

* Commodities: `commodity_update()` (6 series, same 90-point cap) at `:1072`, `:4828`, `:4932`.
  `global.commodity_price[i] = round(global.commodity_start_price[i] * global.commodity_koef[i] * global.kurs)`.

### 1.6 Other per-frame / periodic work

| Where | Period | What |
|---|---|---|
| `o_control_Step_1.gml` | every frame | `market_timer -= 1`, `theme_season()`, re-derives `global.min_all_limit` from `global.diff_limit_stonks` (§3.3) |
| `o_control_Step_2.gml:1` | every frame | caches `global.last_date = "YYYY/MM/DD"` for the UI |
| `o_control_Alarm_0` | one-shot at frame 11 | **`mydatetime = date_inc_day(mydatetime, 1)` + `all_seasons()` + palette clamp** — an extra, un-gameday'd +1 day right after world creation |
| `o_control_Alarm_1` | re-armed by menu code | `check_day_now(0)`, re-computes `global.procent_buildings`, bank/deposit tiers, `global.fortune`, name de-duplication |
| `o_control_Alarm_3` | frame 4 | `temp_happy/cozy/stress` snapshot (smooth-bar anchors) |
| `o_control_Alarm_4` | frame 10 | `sdelka` achievement sweep, `check_names()` |
| `o_control_Alarm_5` | frame 10 | `check_new_director(1)`, `check_all_rada()` |
| `o_control_Alarm_6` | frame 200 | `live` achievement year checks |
| `o_control_Alarm_7` | 155 frames | market sanitation (§1.5) |
| `o_cursor_Alarm_5 / _6` | 10 / 12 frames | achievement queue dedupe / pop |
| `o_startgame_Step_0` | 25 frames after boot | `instance_create(0,0,o_control)` |

---

## 2. The calendar

### 2.1 Calendar source of truth

`mydatetime` is a GameMaker **datetime** (real, days since the GMS epoch **1899-12-30**, plus a
fractional time-of-day). Everything else is derived each frame:

```gml
// gml_Object_o_control_Step_0.gml:197
myweekday = date_get_weekday(mydatetime);   // 0 = Sunday … 6 = Saturday
myday     = date_get_day(mydatetime);
```
`mymonth` is only refreshed inside the day-advance branch (`o_control_Step_0.gml:128`).

**Epoch verification.** `mydatetime` in the reference save is the string
`"               38452.9166724537"` (`save_schema.txt:2523`), i.e. the real `38452.9166724537`.
`.9166724537 * 24 h = 22:00:00` exactly, so the game keeps a constant 22:00 time-of-day
(`date_inc_day` preserves the fraction and nothing else ever writes the time part). **[VERIFIED]**
Days-since-1899-12-30 = 38452 → **2005-04-10** 00:00 UTC + 22:00. (`savedb.9800` in the brief says
`time=2005/4/11` — see §7.1.)

**Game start.** `o_control` is created with
```gml
// gml_Object_o_control_Create_0.gml:416
mydatetime = date_create_datetime(1979, 12, 31, 0, 0, 0);
```
and `startgame2 = 1` (`:500`) forces the very first day advance, so **day 1 = 1980-01-01**.
`gameday = 0` (`:498`) and `workdays = 0` (`:477`) at create; both are incremented together
(`o_control_Step_0.gml:707-708`), so `workdays === gameday` forever (both `9224` in the reference
save — `save_schema.txt:2532-2533`). **[VERIFIED]**

> The `company_since_N = 1894` values in the reference save are **not** the game's start year —
> they are random founding years for AI companies: `global.company_since[i] = irandom_range(1889, 1970);`
> (`o_control_Create_0.gml:638`, mirrored in `gml_GlobalScript_generate_company.gml`). Player-founded
> companies use `global.company_since[i] = date_get_year(o_control.mydatetime);`
> (`gml_GlobalScript_s_create_company.gml:64`, also `buy_neosun.gml:68`, `s_narko.gml:42`). **[VERIFIED]**

### 2.2 Months, seasons, palettes

`get_last_day_mounth(m)` (`gml_GlobalScript_get_last_day_mounth.gml:1-32`) returns the classic
**non-leap** month lengths `31,28,31,30,31,30,31,31,30,31,30,31`, `-1` otherwise. It is only used
for the birthday UI (`o_control_Draw_0.gml:283`) — the real calendar is `date_days_in_month()`
(`draw_calendar.gml:7`), so **February has 29 days in leap years**.

`all_seasons()` — called on every day advance (`o_control_Step_0.gml:147`), on `Alarm_0`, on
`o_advisor` destroy and from the Draw event (`o_control_Draw_0.gml:727`):

```gml
// gml_GlobalScript_all_seasons.gml:1-23
if (mymonth == 1 || mymonth == 2 || mymonth == 12) { change_palette(2); global.season = 0; } // winter
if (mymonth == 3 || mymonth == 4 || mymonth == 5)  { change_palette(3); global.season = 1; } // spring
if (mymonth == 6 || mymonth == 7 || mymonth == 8)  { global.season = 2; change_palette(0); } // summer
if (mymonth == 9 || mymonth == 10 || mymonth == 11) { change_palette(1); global.season = 3; } // autumn
```

| `global.season` | months | palette index | city bg colour |
|---|---|---|---|
| 0 | 12, 1, 2 | 2 | `16777164` |
| 1 | 3, 4, 5 | 3 | `49066` |
| 2 | 6, 7, 8 | 0 | `40789` |
| 3 | 9, 10, 11 | 1 | `40959` |

(`o_city_control_Step_0.gml:5-21`.)

A near-duplicate, `theme_season(arg0 = 0)` (`gml_GlobalScript_get_theme.gml:1-23`), sets
`global.season_theme` and only calls `change_palette` when `arg0 == 1`; it is called **every frame**
with no argument from `o_control_Step_1.gml:47` and again inline at `o_control_Step_1.gml:50-65`.
**[VERIFIED]** — note the two functions are redundant; the Step_1 inline copy is what actually runs.

`change_palette(n)` (`gml_GlobalScript_change_palette.gml:1-13`) only acts when
`global.theme_main != n`; it sets `global.changepalette = 1` and calls `music_reset()`. If
`global.themechoose == 0` (season-following mode) it also forces `global.theme = n`.
`Alarm_0` clamps: `if (global.theme >= sprite_get_width(global.my_pal_sprite)) { global.theme = 0; global.themechoose = 0; change_palette(0); }`.

`global.season` also drives: bar small-talk (`b_talk.gml:102-117`), the city background
(`o_city_main_Step_0.gml:1 image_index = global.season;`), and fishing availability
(`oFishcontrol_Create_0.gml:11`).

**Equinox tables** (`gml_GlobalScript_vernal_equinox_day.gml`) — these exist **only** to pick the
holiday date for March / September:

```gml
function vernal_equinox_day(arg0) {          // :1
    var day = 21;
    switch (arg0) {
        case 1970: case 1973: case 1974: case 1977: case 1978:
            day = 22;                        // NOTE: no `break` — intentional fallthrough
        case 1980: case 1984: case 1988: case 1992: case 1993: case 1996: case 1997:
        case 2000: case 2001: case 2002: case 2004: case 2005: case 2008: case 2009:
        case 2012: case 2013: case 2016: case 2017: case 2020: case 2021: case 2024:
        case 2025: case 2027: case 2028: case 2029: case 2030:
            day = 20;
            break;
    }
    return day;
}
function autumnal_equinox_day(arg0) {        // :44
    var day = 23;
    switch (arg0) {
        case 1970: … case 1979: day = 24; break;     // 1970-1979 → 24
        case 2020: case 2016: case 2012: case 2028: day = 22; break;
    }
    return day;
}
```
**[VERIFIED]**
⚠ The vernal `case 1970…1978:` block sets `day = 22` **without `break`**, so those years fall into the
next group and return **20**, not 22. This is a real bug in the game (VERIFIED from the source).
The tables only cover 1970-2030; outside that range both functions return the defaults 21 / 23.

### 2.3 Holidays & market open/closed

`get_holiday(arg0)` (`gml_GlobalScript_get_holiday.gml:48-320`) returns
`{is_holiday, name, name2, grats, calname}` for a datetime. Three tables, checked in order:

**1) Fixed (all years)**

| month | day | name id | grats | calname id |
|---|---|---|---|---|
| 1 | 1 | 83 (New Year) | 1 | 3652 |
| 12 | 31 | 83 | 0 | 3652 |
| 2 | 11 | 313 | 1 | 3654 |
| 3 | `vernal_equinox_day(year)` | 318 | 1 | 3657 |
| 9 | `autumnal_equinox_day(year)` | 323 | 1 | 3658 |
| 5 | 3 | 319 | 1 | 3659 |
| 11 | 3 | 325 | 1 | 3664 |
| 11 | 23 | 326 | 1 | 3665 |

**2) Movable (nth weekday of month)**

| month | week | weekday | name id | grats | from |
|---|---|---|---|---|---|
| 1 | 2 | 1 (Mon) | 312 | 1 | always |
| 6 | 3 | 1 | 321 | 1 | year ≥ 2003 |
| 9 | 3 | 1 | 322 | 1 | year ≥ 2003 |
| 10 | 2 | 1 | 324 | 1 | year ≥ 2003 |

```gml
// gml_GlobalScript_get_holiday.gml:322
function get_nth_weekday(arg0, arg1, arg2, arg3) {          // year, month, week, weekday
    var first_day      = date_create_datetime(arg0, arg1, 1, 0, 0, 0);
    var first_weekday  = date_get_weekday(first_day);
    var offset         = ((arg3 - first_weekday) + 7) % 7;
    return date_inc_day(first_day, offset + ((arg2 - 1) * 7));
}
```

**3) Year-windowed (Japan / Russia themed)**

| years | month | day | name id | calname |
|---|---|---|---|---|
| 1950-1988 | 4 | 29 | 314 | 3655 |
| 1989-2018 | 12 | 23 | 314 | 3655 |
| 2019-2118 | 2 | 23 | 314 | 3655 |
| 1989-2006 | 4 | 29 | 316 | 3656 |
| 2007-2106 | 5 | 4 | 316 | 3656 |
| 1996-2002 | 7 | 20 | 321 | 3660 |
| 1900-2002 | 9 | 15 | 322 | 3661 |
| 2007-2555 | 4 | 29 | 317 | 3662 |
| 1900-1999 | 10 | 10 | 324 | 3663 |

**4) Weekend fallback** (`get_holiday.gml:301-311`):
```gml
if (weekday == 6 || weekday == 0)   // Saturday or Sunday (GMS: 0 = Sunday)
{ return { is_holiday: true, name: txt(5), name2: txt(6), grats: 0, calname: txt(141) }; }
```

**Consumer** `check_day_now(arg0 = 1)` (`gml_GlobalScript_get_holiday.gml:1-46`), called on every new
day (`o_control_Step_0.gml:720`) and from `Alarm_1` with `arg0 = 0`:

```gml
var result = get_holiday(mydatetime);
if (result.is_holiday == 1) { holyday = 1; prichina = result.name; prichina2 = result.name2;
                             grats = result.grats; global.message_now = prichina; … }
if (date_get_day_of_year(mydatetime) == 1) { sobranie = -1; global.chill_event = 0;
    global.lastyear_fortune = global.fortune;
    if (date_get_year(mydatetime) == global.achiev[10][6][0]) achivka("live", 1);  // 1985
    … [1] = 1990, [2] = 2000 }
if (global.parttimework_days > 0 && myweekday > 0 && myweekday <= 3)
{ prichina = txt(329); prichina2 = txt(329); holyday = 1; }
```

**What `holyday` gates** (all `[VERIFIED]`):

* `o_control_Step_0.gml:423, 499, 522, 1035, 1076, 1509, 2975` — most per-day economy.
* `mycompany_step()` entirely (`gml_GlobalScript_mycompany_step.gml:27`) → staff XP / worker stat gains.
* `o_human_Create_0.gml:44` — NPC office attendance: `if (holyday == 0 && myweekday > 0 && myweekday < 6)`.
* `o_control_Step_0.gml:1506` and `:1546` — the chart push **and** `mycompany_step()` are additionally
  gated by `myweekday > 0 && myweekday < 6` (Mon-Fri).
* The **stock exchange** snapshots it on open and forces the market shut for an FCA insider ban:
  ```gml
  // gml_Object_o_birza_Create_0.gml:46
  holyday = o_control.holyday;
  prichina = o_control.prichina;
  if (global.insader_zaborona == 1) { holyday = 1; prichina = txt(1281); }
  ```
* `o_control_Draw_0.gml:743` — "go to work" button disabled when `holyday == 0`.

**Weekend-only events**: `o_control_Step_0.gml:4215`
`if ((myweekday == 0 || myweekday == 6) && myday != 1 && …)` → poker invitations and job-hunt
phone calls (with `global.minishans2` as the probability accumulator, reset to −1 when it fires).

### 2.4 Other calendar-driven events

| Trigger | Code |
|---|---|
| **New Year** (`date_get_day_of_year == 1`) | `get_holiday.gml:19-36`, `o_control_Step_0.gml:260-263` |
| **Monthly dividend accrual** on the 20th | `o_control_Step_0.gml:3037` `if (myday == 20 \|\| dividentnow == 1)`; writes `dohodmesyac[i][date_get_month()] = company_price * company_profit * (big_data[i][0]/100)` (`:3057`) and `dohodmesyac_all[i][month] = company_price * company_profit` (`:3059`) |
| **Year-end payout** (only if `global.diff_divident == 1`) | `o_control_Step_0.gml:3030-3036` `if (myday == 31 && date_get_month(mydatetime) == 12) dividentnow = 1;` |
| **Shareholder meetings** | company *i* meets on Thursday of ISO week `global.company_tyzhden[i] = i + 10` (`o_control_Create_0.gml:569`); dispatch at `o_control_Step_0.gml:2341-2352` |
| **New-company spawn days** | `global.daynewcompany = irandom_range(100,200)`, `global.daynewcompany2 = irandom_range(222,333)` (`o_control_Create_0.gml:660-661`), tested against `date_get_day_of_year(mydatetime)` at `o_control_Step_0.gml:2692, 2699`. No new company in **1980** (`:2707-2710`) |
| **Fixed historical shocks** (`global.mode == 0`) | `o_control_Step_0.gml:930-1197` — a long `date_get_month/day/year(mydatetime)` switch: 1980-06-23, 1981-03-11, 1983-04-07, 1985-09-22, 1986-02-22, 1986-08-05, 1987-04-15/07-22/10-20/11-08, 1988-04-15, 1989-01-07/07-11/10-22, 1990-04-05… plus `global.trend` / `global.price_building` nudges. Also regime blocks at `:1198-…`, `:1416-…`, `:2800-2814` (`bankprocent` per era) |
| **Random-market regime** (`global.mode == 1`, `holyday == 0`) | `o_control_Step_0.gml:833-908` — `shans_random_events` counter, 8 `randomchange` outcomes multiplying `global.trend_target` by 0.2…2.8 and `global.price_building` by 0.5…1.3 |
| **Birthday** | `o_control_Step_0.gml:765-783` (`global.birthday_month` 2-12, `global.birthday_day` 1-28) |
| **Vacation** | `global.otpuskdays = irandom_range(12, 14)` (`go_vacation.gml:8`), decremented daily, forces `holyday = 1` (`o_control_Step_0.gml:2308-2333`) |
| **Hikari festival** | `o_control_Step_0.gml:2334-2340` — Feb 18 **and** Sep 18 when `global.hikari_go >= 6` |
| **Prision sentence** `srok` | 730 days (`:2610`), 90 days (`zvonok1_1.gml:86,153`) |

### 2.5 `company_since` / `lastdate` string production & parsing

* `company_since_N` — a **plain int** (year). Set at world-gen to `irandom_range(1889, 1970)`
  (`o_control_Create_0.gml:638`) and at player creation to `date_get_year(o_control.mydatetime)`
  (`s_create_company.gml:64`). Written/loaded as `file_ini_write_real` / `file_ini_read_real`
  (`savegame.gml:174`, `loadgame.gml:142`). Displayed verbatim:
  `o_company_Draw_73.gml:1 title = company_name + " (" + txt(511) + " " + company_since + ")"`.
* `lastdate_N` — a **string** `"<month>/<year>"`, **no leading zeros** (`string(date_get_month(...))`).
  * Initialised to `"12/" + string(date_get_year(mydatetime) - 1)` at world-gen
    (`o_control_Create_0.gml:637`, `generate_company.gml:102`, `s_create_company.gml:102`).
    At create time `mydatetime` is still 1979-12-31 → **`"12/1978"`**. That is exactly what the
    reference save contains for untouched companies (`lastdate_1 = 12/1978`, `save_schema.txt`).
  * Updated **only** for companies the player has served on, once a month, when
    `global.company_sovet[i] > 1`:
    ```gml
    // gml_Object_o_control_Step_0.gml:3265-3269
    if (global.company_sovet[i] > 1)
    {
        lastprice[i] = global.company_stockprice[i] / global.company_number_a[i];
        lastdate[i]  = string(date_get_month(mydatetime)) + "/" + string(date_get_year(mydatetime));
    }
    ```
  * **Never parsed back.** `loadgame.gml:146` loads it as a string and the only readers
    (`o_calendar_Alarm_1.gml:31`, `o_company_Alarm_1.gml:30`, `o_meeting_Alarm_0.gml:46`) just display
    it. **[VERIFIED]**
* `global.company_lastprice[N]` / `global.comm_lastprice[N]` are *separate*, richer strings:
  `$"{txt(1568)}:\n{string_thousands(round(price_stock(i)))}\n{YYYY/MM/DD}"` built with
  `string_data()` (`gml_GlobalScript_string_data.gml:1-9`, which just zero-pads single digits):
  `o_birza_Other_10.gml:50-51, 117-118, 262-263`.
* `savedb.9800` writes `"YYYY/M/D"` with **no** padding — `savegame.gml:219-223`:
  ```gml
  var timenow = string(ingame_year) + "/" + string(ingame_month) + "/" + string(ingame_day);
  ```
  which matches the brief's `time=2005/4/11`.

---

## 3. Difficulty & tuning

### 3.1 The 11 sliders (`level_diff`)

Declared in `gml_Object_o_pc_menu_Create_0.gml:99-126`:

```gml
level_diff[0] = 1;   level_diff_max[0]  = 3;    // txt(1086) — preset
level_diff[1] = 0;   level_diff_max[1]  = 1;    // txt(1092)
level_diff[2] = 1;   level_diff_max[2]  = 2;    // txt(1093)
level_diff[3] = 1;   level_diff_max[3]  = 3;    // txt(1094)
level_diff[4] = 2;   level_diff_max[4]  = 3;    // txt(1106) — start money
level_diff[5] = 2;   level_diff_max[5]  = 8;    // txt(1095) — company count − 6
level_diff[6] = 1;   level_diff_max[6]  = 3;    // txt(1096) — limits
level_diff[7] = 1;   level_diff_max[7]  = 1;    // FCA
level_diff[8] = 1;   level_diff_max[8]  = 3;    // stonks limits
level_diff[9] = 0;   level_diff_max[9]  = 1;    // mode
level_diff[10]= 0;   level_diff_max[10] = 2;    // txt(4155) — luck
level_diff[11]= 1;   level_diff_max[11] = 2;    // (unused in code)
start_money[0] =  250000;   start_money[1] = 500000;
start_money[2] =  750000;   start_money[3] = 1000000;
```

Committed to globals in `gml_Object_o_pc_menu_Step_2.gml:1-42` (**the authoritative mapping**):

| slider | menu label | max | → global | effect |
|---|---|---|---|---|
| `level_diff[0]` | txt(1086) | 3 (+ "custom" = 4) | *(preset driver)* | selecting a preset rewrites sliders 1,2,3,4,6,7,8,10 (`settings_menu.gml:531-576`); touching any of 1-4 sets `level_diff[0] = 4` ("custom", `:580`) |
| `level_diff[1]` | txt(1092) | 1 | `global.diff_divident` | 0 = monthly dividend only; 1 = also pays out the 12-month sum on Dec 31 (`Step_0:3030-3036, 3046-3049`) |
| `level_diff[2]` | txt(1093) | 2 | `global.diff_profit` | `0 → 0.06`, `1 → 0.12`, `2 → 0.25`, default `0.12` (`Step_2:10-24`). Feeds `big_data[i][0] = (diff_profit*100) ± irandom_range(-3,3)` (`Create:713`) and the dividend yield |
| `level_diff[3]` | txt(1094) | 3 | `global.diff_stress` | `0 → 2`, `1 → 1`, `2 → 0`, `3 → -1`, default `1` (`Step_2:25-42`) |
| `level_diff[4]` | txt(1106) | 3 | `global.money` **and** `global.start_money` | `start_money[i]`, i.e. ¥250 k / 500 k / 750 k / 1 000 k. `start_money` is the baseline for the `megamoney` achievement (`Step_0:243-254`) |
| `level_diff[5]` | txt(1095) | 8 | `global.numberofcompany = 6 + level_diff[5]` | 6 … 14 live companies out of the 30 company slots |
| `level_diff[6]` | txt(1096) | 3 | `global.diff_limits` | trading-window speed limit, see §3.2 |
| `level_diff[7]` | FCA (txt(1585)/txt(206)) | 1 | `global.diff_fsa` | see §3.4 |
| `level_diff[8]` | txt(4155-4157 / 2734-2737) | 3 | `global.diff_limit_stonks = level_diff[8] - 1` → **−1, 0, 1, 2** | see §3.3 |
| `level_diff[9]` | txt(3155)/txt(3156) | 1 | `global.mode` | `0` = historical (real 1980-1999 script), `1` = abstract random-market regime (§2.4) |
| `level_diff[10]` | txt(4155)-style | 2 | `global.noluck` | see §3.5 |

### 3.2 `global.diff_limits` — exchange scroll speed

```gml
// gml_Object_o_birza_Step_0.gml:18-48
if (global.diff_limits == 0) { speedlimit = 0.004; }
if (global.diff_limits == 1) { speedlimit = 0.004; }
if (global.diff_limits == 2) { speedlimit = 0.014; }
if (global.diff_limits == 3) { speedlimit = 0.02;  }
if (check_level_rep(4) >= 2) { speedlimit *= 0.8; }     // reputation perk
if (vkladka == 4)           { speedlimit *= 0.03; }    // commodities tab
if (global.diff_limits > 0)
{ if (o_control.timer > 98) { timeout += 1; } }         // only higher settings let you idle
```
So 0 and 1 are identical in speed; 1/2/3 additionally accumulate a `timeout` when the day is nearly
over (`o_control.timer > 98`), i.e. the harder settings force you to trade sooner. **[VERIFIED]**

### 3.3 `global.diff_limit_stonks` → `global.min_all_limit`

The daily share-count trading cap floor. Set **every frame** in `Step_1` and once at `Create`:

| `diff_limit_stonks` | `min_all_limit` (Create, `o_control_Create_0.gml:940-955`) | `min_all_limit` (Step_1, `o_control_Step_1.gml:27-42`) ← authoritative |
|---|---|---|
| −1 (slider 0) | 1 | **1** (no limit) |
| 0 (slider 1) | 0.75 | **0.56** |
| 1 (slider 2) | 0.45 | **0.31** |
| 2 (slider 3) | 0.22 | **0.11** |

Usage:
```gml
// o_control_Create_0.gml:572  and  o_control_Step_0.gml:3016-3021
global.company_limit[i] = min(1, global.min_all_limit + random(0.170001));
global.company_limit_kil[i] = round(global.company_limit[i] * global.company_number_a[i]);
if (global.min_all_limit < 1)
{ global.company_limit_kil[i] = lerp(global.company_limit_kil[i],
                                      round(global.company_number_a[i] * global.company_limit[i]), 0.03); }
```
Player-founded companies get a **waiver** (`s_create_company.gml:58-63`): `min(1, min_all_limit +
random(0.170001) + 15)` then `company_limit[i] -= 0.05 * global.azhiotazh`. The player's own
(under-investigation) company gets an effectively infinite cap
(`o_control_Step_0.gml:3022-3026`: `company_limit_kil[i] = 1e25`). `Alarm_7` relaxes the cap by 6 %
per 155-frame tick.

### 3.4 `global.diff_fsa` — Financial Conduct Authority

`1` = the regulator watches you. Two visible effects:

```gml
// gml_GlobalScript_porushennya.gml:3  (called from o_birza_Other_10.gml:168-185)
if (global.diff_fsa == 1)
{
    global.fca_points += irandom_range(12, 38);
    if (arg0 > irandom_range(70, 150))   { global.fca_points += 10; }   // +7 escalating tiers:
    … (155,277) (300,555) (666,1555) (1333,2555) (3000,5555) (7777,77777)
    if (global.perhseporushennya == 0) { create_notification(txt(218), txt(1584)+"\n"+txt(1587));
                                         global.perhseporushennya = 1; }
}
```
Triggered when the player's holding change exceeds **±25 %** of what they bought
(`o_birza_Other_10.gml:172-185`, with floors of ±1000). Downstream, per new day
(`o_control_Step_0.gml:2981-3006`):

```gml
if (irandom(40) < (global.fca_points - 2)) {
    if (global.fca_predupr == 0) { … global.insader_zaborona = 1;
                                   global.trade_zab_days = irandom_range(15,25);
                                   global.fca_points = 0; }
    else { global.insader_zaborona = 1;
           global.sud_diff = global.fca_points * 2.5;                     // ← §3.6
           … laywer_hi(); delay_action(irandom_range(5,15), "manipul_sud"); }
}
```
`global.insader_zaborona == 1` force-closes the exchange (`o_birza_Create_0.gml:48-52`) and expires
after `trade_zab_days` counts down (`o_control_Step_0.gml:1537-1545`). `diff_fsa == 1` also draws the
buy/sell arrow marker on the ticker (`o_birza_Draw_0.gml:803-826`).

### 3.5 `global.noluck` — luck

`0 = lucky`, `1 = normal`, `2 = unlucky`.

| Site | Code |
|---|---|
| Fortune-cookie prediction, `o_bar_Step_0.gml:83-86` | `if (global.noluck == 2) predska = choose(1049,1048,1048,1047,1047,1046,1046,1045,1045,1034,…);` — heavily biased to the pessimistic end |
| Birthday gift, `o_bar_Step_0.gml:146-162` | `noluck == 1` → `max(50000, round(random_range(alll*alll*0.05, alll*alll*0.15)*10)*10000)` instead of `max(100000, round(random_range(alll*alll*0.2, alll*alll*0.4)*10)*10000)`; the free car (`irandom(2) == 1`) only fires when `noluck == 0` |
| Fines/bail, `o_control_Step_0.gml:3962` | `if (global.noluck == 0 \|\| (global.noluck == 1 && irandom(1) == 0)) { …fines… }` |

### 3.6 `global.sud_diff` — court "difficulty" scalar

A float starting at **100** (`o_control_Create_0.gml:887`) and re-seeded to 100 at the start of the
first court case (`zvonok1_1.gml:35`). It is the *strength* of the prosecution:

```gml
// gml_Object_o_control_Step_0.gml:2998 (second FCA offence)
global.sud_diff = global.fca_points * 2.5;
```
Consumed by `gml_GlobalScript_zvonok1_1.gml`:
* `:58`  `forecast = sud_shans_text(global.sud_diff, leveladvokat);`
* `:143` `var sud_res = sud_calc(global.sud_diff);`
* `:272-273` `var vsego = sud_shans(global.sud_diff, global.laywer_hired) * 100; vsego = min(vsego, global.sud_diff - 2);`

Higher = harder prosecution; hiring `laywer_hired` helps. `[INFERRED]` for the semantics of
`sud_calc`/`sud_shans` — those functions are not in the decompiled set (they may be in the
`__struct__`/child stubs or in an unincluded extension).

### 3.7 `global.diff_stress` — stress scaling

Two mirrored tables produce the same multiplier `bobo`:

```gml
// gml_GlobalScript_diff_stress.gml:1-25
bobo = 1;
-2 → 0.5    -1 → 0.75    0 → 1    1 → 1.25    2 → 1.5
```
```gml
// o_control_Step_0.gml:86-109  and  o_control_Create_0.gml:270-287  (var `stles`)
-1 → 0.25    0 → 0.75    1 → 1    -2 → 1.5
if (global.traits[7] == 1) { stles = 2.2; }     // alcoholic trait overrides
if (global.traits[8] == 1) { stles *= 0.66; }   // then halved-ish
```
⚠ **The two tables disagree** (`diff_stress.gml` is apparently dead code; `stles` is the one
actually used, e.g. `o_control_Step_0.gml:119, 2316-2317, 3952`). `stles` scales every
`global.stress += …` / `global.happy -= …`. Also clamped to `[-50, …]` in `Alarm_1`
(`o_control_Alarm_1.gml:28-34`).

### 3.8 `global.new_sectors` — content remap on load

`1` = 11 sector types, `0` = legacy 8. The **only** use is a remap of already-saved company sectors
when loading an old save:

```gml
// gml_GlobalScript_loadgame.gml:332-353
if (global.new_sectors == 0) {
    for (var i = 0; i < 30; i++) {
        if (global.company_field[i] == 4)  { global.company_field[i] = 0; }
        if (global.company_field[i] == 8)  { global.company_field[i] = 4; }
        if (global.company_field[i] == 9)  { global.company_field[i] = 0; }
        if (global.company_field[i] == 10) { global.company_field[i] = 7; }
    }
}
```
Set to `1` unconditionally in `o_control_Create_0.gml:14`. `global.new_sectors` is in
`saveglobalvars`, so an old save carrying `0` keeps remapping on every load. **[VERIFIED]**

### 3.9 `global.startcompany_mode` — "found a company instead of joining one"

| value | effect |
|---|---|
| `0` | classic: you join an existing company (`find_people`, employee path); `achivka("comp_create_free", 1)` at `s_create_company.gml:22-25`, `achivka("president", 1)` at `:86-89` |
| `1` | "own-company" start: trait 17 auto-enables it (`gostart.gml:109-122`), no joining, no free-create/president achievements |

Set from the new-game screen (`o_pc_menu_Step_2.gml:52-55`, `global.gogoyes = 1` branch), forced at
`gostart.gml:113`, consumed in `o_create_company_Create_0.gml:61-65`, `o_company_infra_Alarm_0.gml:2`,
`scr_management.gml:34`, `mycompany_step.gml:167`.

### 3.10 `global.mode` — historical vs abstract

`0` (default) runs the real 1980-2000s Japanese macro script and the per-year `bankprocent`
regimes (`o_control_Step_0.gml:930-1197, 1416-1437, 2800-2814`).
`1` runs the abstract `trend_target` regime machine (`:833-908`). Persisted in `[global] mode`.

### 3.11 Other runtime tunables worth knowing

| Variable | Default | Gating |
|---|---|---|
| `global.nalog` (tax) | `random_range(0.04, 0.15)` (`Create:814`) | monthly (`Step_0:2815`) |
| `global.daily` (living cost) | 40 (`Create:481`) | `global.trata = daily*30*max(1, koef_house*0.5 - 4.7)*random_range(0.8,1.2) + tratadop` (`Step_0:2269`) |
| `global.bankprocent` | `random_range(0.05, 0.1)` (`Create:495`) | per-era in mode 0 |
| `global.trend`, `global.rynochek` | 1, `random_range(0.98,1.02)` | clamped ≥ 0.3 (`Step_0:1438-1449`); `trend_target` clamped `[0.7, 20]` (`:903`) |
| `global.kommisia` (exchange fee) | `random_range(0.96, 0.99)`, re-rolled daily (`Step_0:715`) | |
| `global.short_procent` | `random_range(0.97, 0.99)` | |
| `global.human_kol` | 800 (`Create:421`) | population size; save writes it |
| `global.nelegaldaymax` | `irandom_range(88, 155)` | |
| `global.parttimework_plata` | 0 | paid Mon/Wed/Fri only (`Step_0:114-126`) |

---

## 4. Progression

### 4.1 `global.levelproject` — the R&D / project ladder (player-company only)

* Init `1` (`o_control_Create_0.gml:809`); reset to `0` when you found a company
  (`s_create_company.gml:44`) or take over one (`ceo_yes()` in `check_new_director.gml:67`), and back
  to `1` after a completed project (`o_control_Draw_0.gml:2774`).
* The bar is driven by `comp_point`, a smoothed sum of the three develop-point pools:
  ```gml
  // o_control_Draw_0.gml:2625
  comp_point = lerp(comp_point, comp_dev_int + comp_dev_prec + comp_dev_char, 0.1);
  // :2626-2627
  var price_prof  = 200;
  var level_proj  = price_prof * global.levelproject * (global.levelproject * 0.5);   // = 100·L²
  // :2660-2664  cumulative cost of all previous levels
  var level_prev_proj = 0;
  for (var i = 0; i <= global.levelproject; i++)
      level_prev_proj += (price_prof * max(0, i - 1) * (max(0, i - 1) * 0.5));
  ```
* Payout multiplier `koef_plus` per level (`o_control_Draw_0.gml:2628-2659`):

  | `levelproject` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | ≥9 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | `koef_plus` | 0 | 1 | 1 | 1.2 | 1.5 | 2 | 2.5 | 3 | 4 | `3 + L*0.25` |

* Level-up fires the instant `(comp_point - level_prev_proj) > level_proj` (`:2690-2696`), sets
  `newlevelcount = 150` (celebration timer).
* Player presses **"finish project"** (`:2700-2706`) → `finisher = 1`, `achivka_full("projects_create", levelproject - 1)`.
  Over the next ~222 frames (`:2712-2783`):
  * `timerfinisher == 2`   → `company_develop_points_{int,prec,char} *= koef_plus` (the three stats)
  * `timerfinisher == 50`  → `company_points[player] += round(dev_points_int * koef_plus)`; pool zeroed
  * `timerfinisher == 100` → `rezerv_change(dev_points_prec * 10000 * koef_plus)`; pool zeroed
  * `timerfinisher == 150` → `ochki = round(dev_points_char / 33)` XP points
  * `timerfinisher == 200` → spend the XP: `ochki` random free workers get
    `charisma/intelligence/precision *= 1.02` and `human_xp += 1` (capped at 100); then `levelproject = 1`
  * `timerfinisher > 222` → unlock (`global.stop = 0`, `global.stoptime = 0`, `global.windowopen = 0`)
* `global.levelproject` is in `saveglobalvars`; `comp_point` is in `savelocalvars`.

### 4.2 The 96-entry achievement system

`gml_GlobalScript_achivka.gml`:

* **`global.listachiv`** (`gml_Object_o_cursor_Create_0.gml:137`) — the 96 achievement *ids* in index
  order: `pachinko, pachinko2, turma, dohod, car, sdelka, million, megamoney, dolgi, stonks, live,
  mecenat, meeting, skachki, toprech, gulyaem, friends, president, future_tech, rep_0 … rep_7,
  amy_level, best_friend, more_friends, gotobar, objection, comp_levels, comp_viddil, comp_100,
  comp_money, comp_create_free, comp_asset, comp_profit, comp_year_profit, comp_year_size, top_100,
  king_of_tokyo, arcade_hoshi, gacha_number, kind_heart, real_estate_king, cars_king, comp_v_it,
  comp_v_fin, comp_v_hr, comp_v_op, comp_v_marketing, comp_v_rnd, comp_v_head, comp_hire,
  comp_reject, clean_business, solid_portf, own_comp, real_estate_income, dividends, vacation,
  gacha_cats, gacha_dogs, gacha_saga, place_bar, place_park, place_temple, place_pachi,
  place_arcade, place_horses, place_golf, golf_record, golf_wins, projects_create, fishing, fishes,
  fishing_road, fish_collection, poker, poker_win, poker_allin, upa, saint, gifts, invest_center,
  invest_max, monopoly, commodi, company_enter, property_proc, property_10, property_invest,
  yoshiro_top, yakuza_friend`.
  VERIFIED: `achivos_generatos()` contains exactly **96** `p += 1;` steps (`achivka.gml:171…931`),
  one per list entry.

* **`global.achiev[i][j]` layout** — built by `achivos_generatos()` (`achivka.gml:161-938`), 8 lines per entry:

  | index | meaning | example (i = 0) |
  |---|---|---|
  | `[0]` | `txt()` id of the achievement title | `1211` |
  | `[1]` | `txt()` id of the description | `1212` |
  | `[2]` | number of levels (1 or 3) | `3` |
  | `[3]` | which character stat is fed: 0-6 = `global.char[]`, **7 = `global.emi` only**, −1 = none | `0` |
  | `[4]` | multiplier | `1` |
  | `[5]` | always `0` in every entry (unused) | `0` |
  | `[6]` | thresholds array — `[t1]` or `[t1,t2,t3]` | `[200, 500, 1000]` |

  Spot checks used by the game:
  * `achiev[5]` = `sdelka` → `[1, 5, 15]` deals (`achivka.gml:204-210`; swept in `o_control_Alarm_4.gml:1-12`)
  * `achiev[7]` = `megamoney` → `[50000000, 500000000, 5000000000]`, added to `global.start_money`
    (`o_control_Step_0.gml:243-254`)
  * `achiev[10]` = `live` → `[1985, 1990, 2000]` **calendar years** (`achivka.gml:244-250`;
    checked in `get_holiday.gml:24-35` and `o_control_Alarm_6.gml:3-13`)

* **Unlock flow** — three stages, all asynchronous:

  ```gml
  // gml_GlobalScript_achivka.gml:1-10   (stage 1: enqueue)
  function achivka(arg0, arg1 = 1) {
      var numm      = achiv_number(arg0);                        // index in global.listachiv
      var name_achiv= arg0 + "_" + string(arg1);                 // Steam/GOG achievement id
      var newlist   = json_stringify([arg0, arg1, name_achiv, numm], 0);
      if (ds_list_find_index(global.achiv_queue, newlist) == -1) { ds_list_add(global.achiv_queue, newlist); }
  }
  ```
  ```gml
  // gml_Object_o_cursor_Alarm_5.gml:1-2   (dedupe, every 10 frames)
  alarm[5] = 10;
  global.achiv_queue = ds_list_unique(global.achiv_queue);
  // gml_Object_o_cursor_Alarm_6.gml:1-8   (pop ONE per 12 frames)
  var achiv_now = json_parse(ds_list_find_value(global.achiv_queue, 0));
  achivka_do(achiv_now[0], achiv_now[1], achiv_now[2], achiv_now[3]);
  ds_list_delete(global.achiv_queue, 0);
  alarm[6] = 12;
  ```
  ```gml
  // gml_GlobalScript_achivka.gml:22-104   (stage 3: commit)
  function achivka_do(arg0, arg1, arg2, arg3) {
      if (global.achiev_savelevel[arg3] < arg1) {
          arg1 = min(global.achiev_savelevel[arg3] + 1, arg1);          // one level at a time
          if (global.gog_login == 1) { GOG_Stats_SetAchievement(arg2); GOG_Stats_StoreStatsAndAchievements(); }
          global.achiev_savelevel[arg3] = max(global.achiev_savelevel[arg3], arg1);
          var newachi = (global.achiev_globalsavelevel[arg3] < arg1) ? 1 : 0;
          global.achiev_globalsavelevel[arg3] = max(global.achiev_globalsavelevel[arg3], arg1);
          var colprr = (arg1 == 2) ? 2 : (arg1 == 3) ? 3 : (arg1 == 4) ? 4 : (arg1 == 5) ? 5 : 1;
          var nummmm = (global.achiev[arg3][2] == 1) ? 0 : arg1;
          notif_achiv(arg3, nummmm, newachi);
          if (global.achiev[arg3][3] >= 0 && global.achiev[arg3][3] < 7)
          { change_amy(colprr * global.achiev[arg3][4]); change_char(colprr * global.achiev[arg3][4], global.achiev[arg3][3]); }
          if (global.achiev[arg3][3] == 7) { change_amy(colprr * global.achiev[arg3][4]); }
          set_collection();
          … toy unlock if arg0 == global.name_achiv_col[colect] → add_arcade_points(10000) …
      }
      global.achiev_globalsavelevel[arg3] = max(global.achiev_globalsavelevel[arg3], arg1);
      achiv_global_save();
  }
  ```
  ⇒ **`global.achiv[i][j]` itself never changes at runtime.** What changes is
  `global.achiev_savelevel[i]` (per-save, 0…3, in `[arrays]`) and
  `global.achiev_globalsavelevel[i]` (cross-save, `stonks.9800`). `global.achiev_savelevel` is also
  pre-zeroed for 500 slots in `achivos_generatos()` (`:933-937`) and in `o_control_Create_0.gml:320-322`.
  **[VERIFIED]**

* **`achivka_full(name, value)`** (`gml_GlobalScript_achivka_full.gml:1-22`) — the threshold helper
  used by "count" style achievements:
  ```gml
  var find_id = ds_list_find_index(global.listachiv, arg0);
  if (arg1 >= global.achiev[find_id][6][0])                                     { achivka(arg0, 1); }
  if (global.achiev[find_id][2] > 1 && arg1 >= global.achiev[find_id][6][1])   { achivka(arg0, 2); }
  if (global.achiev[find_id][2] > 2 && arg1 >= global.achiev[find_id][6][2])   { achivka(arg0, 3); }
  ```
  Called from `o_control_Step_0.gml:234-242` (every new day: `place_bar/park/temple/pachi/arcade/
  horses/golf`, `cars_king`, `real_estate_king`) and `o_control_Alarm_1.gml:20` (`property_proc`),
  and `o_control_Draw_0.gml:2705` (`projects_create`).

* **Cross-save achievement file `stonks.9800`** (`achiv_global_save()`, `achivka.gml:152-159`):
  ```gml
  var _buff = buffer_create(1, buffer_grow, 1);
  buffer_write(_buff, buffer_string, json_stringify(global.achiev_globalsavelevel));
  buffer_save_safe(_buff, "stonks.9800", global.hmac_key);      // ← hmac_key, not hmac_key2
  ```
  Read back in `load_settings()` (`gml_GlobalScript_save_settings.gml:43-71`) via
  `buffer_load_safe(file, global.hmac_key, _buff)` + `json_parse`.
  ⚠ Note `achiv_global_save()` computes `_bufferstring` and then ignores it, passing the **raw
  buffer** to `buffer_save_safe` (`achivka.gml:156-157`) — a latent inconsistency vs. `savegame()`,
  which base64-encodes before HMAC-ing. **[VERIFIED as written; see §7.2]**

* `achiv_all()` (`achivka.gml:106-150`) reconciles against the platform achievement store
  (`extension_stubfunc_real`), clamping `global.achiev_globalsavelevel[i]` to 1/2/3.

### 4.3 Character reputation ladder

`check_level_rep(i)` (`gml_GlobalScript_check_level_rep.gml:1-25`) maps `global.char[i]` to 0…5 at
thresholds **5 / 10 / 20 / 35 / 50**. Used all over as the meta-progression gate:

| `char[]` idx | uses |
|---|---|
| 0 (work ethic) | exchange deposit bonus (`o_birza_Create_0.gml:54-57`: `bonus_vplyv = 1.25 + min(1, (char[0]-40)*0.01)` at level 5) |
| 1 | (intelligence / employee skill) |
| 2 | (charisma) — poker invitation unlock at `char[2] > 9` (`o_control_Step_0.gml:4217`) |
| 3 (connections) | contact gains, `prognoz_know` |
| 4 (reputation) | `speedlimit *= 0.8` at level ≥ 2 (`o_birza_Step_0.gml:34-37`); `kommisia = 0.99` at level 5 (`o_birza_Create_0.gml:66-70`) |
| 5 | — |
| 6 | `invest_max`, `futuretech` investment gating |
| 7 | `global.emygulyadays` (Eri) relationship days |
| aggregate | `global.char[7] = round(mean(char[0..6]))` recomputed daily (`o_control_Step_0.gml:623`) |

Bank tiers keyed off `check_level_rep(1)` (`o_control_Alarm_1.gml:21-27`, `Create:967-973`):

```gml
fin_money   = [1e6, 1e7, 3.5e7, 1e8, 3e8, 1e9];
fin_credit  = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
fin_deposit = [[4,7,10],[5,9,12],[6,10,13],[7,12,15],[8,14,18],[10,15,20]];
```

Relationship ("emi") ladder — `global.needemilevel[0..23]` (`o_control_Create_0.gml:335-358`):

```
10, 20, 30, 40, 50, 75, 100, 125, 150, 200, 250, 500,
750, 1000, 2000, 3000, 4000, 5000, 7500, 10000, 25000, 50000, 100000, 1000000
```
Consumed at `gml_GlobalScript_b_talk.gml:4` and `buttonss_dialogs.gml:219`
(`if (global.emi >= global.needemilevel[global.emilevel])`).

### 4.4 Deferred events — `global.delaydays`

A **100 000-slot** array of deferred callbacks keyed by absolute `gameday`
(`o_control_Create_0.gml:331 global.delaydays = array_create(100000, 0);`).

```gml
// gml_GlobalScript_delay_action.gml:70-93
function delay_action(arg0, arg1, arg2 = "", arg3..arg9 = 0) {
    var nomrmr = arg0 + o_control.gameday;
    for (var i = 0; i < 500; i++) {
        if (global.delaydays[nomrmr] == 0) {
            if (arg2 == "") { global.delaydays[nomrmr] = arg1; }
            else { global.delaydays[nomrmr] = [arg1, arg2, arg3, …, arg9]; }
            break;
        } else { nomrmr += 1; }            // collision → push to the next free day
    }
}
```
Fired on the matching `gameday` (`o_control_Step_0.gml:909-929`) via `script_execute(..., 7 args)`,
then the slot is zeroed. The calendar UI (`draw_calendar.gml:61-94`) maps a calendar date back to a
`gameday` with `date_day_span(gameday_start, current_days) + o_control.gameday` and marks
court (`"sud"`) and yakuza (`"yakuza"`) events. `global.delaydays` is in `savearrayvars` (JSON).

### 4.5 `days_to_general_time(arg0)` — humanised durations

`gml_GlobalScript_days_to_general_time.gml:1-75`. Buckets: `<7` days (ceil), `<30` → `round(d/7)`
weeks, `<365` → `round(d/30)` months, else `floor(d/365)` years (+1 if `d % 365 > 182`), with
Russian plural endings for `global.language == 1`. Text ids 3549-3556.

---

## 5. Save / load / settings

### 5.1 On-disk files

| File | Written by | Contents |
|---|---|---|
| `<slot>.save` (e.g. `saveslot_auto.save`, `saveslot_quick.save`, `saveslot_-2.save`) | `savegame()` | base64(zlib(plaintext INI)) + `#<hmac>#` |
| `savedb.9800` | `savegame()` / `script_deletesave()` | plain INI, one section per slot: `time`, `name`, `mode` |
| `settings.ini` | `save_settings()` | plain INI, one `[global]` section |
| `stonks.9800` | `achiv_global_save()` | base64(JSON array of global achievement levels) + HMAC |

HMAC keys (`gml_Object_o_cursor_Create_0.gml:121-130`) **[VERIFIED]**:

```gml
if (os_get_info() == "Demo") {
    global.hmac_key  = "ababahalamalfsdkl23sa2";
    global.hmac_key2 = "xfdTesd#$fchipichapa@";
} else {
    global.hmac_key  = "trnx2352S#25GSEbzpA]v'/.12trololololossa2";
    global.hmac_key2 = "e�"-%fgTernoxXFaston@";     // source file is CP1251-mangled; see §7.3
}
```
`hmac_key` → `stonks.9800` (achievements). `hmac_key2` → the `.save` slots.

### 5.2 `savegame(slot)` — `gml_GlobalScript_savegame.gml:99-239`

```gml
function savegame(arg0) {
    global.savedcomplete = 0;
    save_settings();                                                  // :102
    if (os_get_info() == "Demo") { } else {
        firstname = arg0;                                             // section name in savedb.9800
        arg0 += ".save";                                              // file name
        var dataa = string_data(date_get_year(o_control.mydatetime)) + "/" + …;   // unused, :113
        switch_save_data_mount(0);  buffer_async_group_begin("");     // :116-117  (console)
        …buffer_async_group_option("ps_create_backup", true);
        var q = file_ini_parse("");                                   // :125  in-memory INI builder
        file_ini_write_string(q, "global", "inventory", ds_map_write(global.player_inventory));  // :127
        … 175 × saveglobalvars                                        // :128-138
        … 114 × savearrayvars  (json_stringify)                       // :139-142
        … 75  × savelocalvars   (o_control instance vars)             // :143-153
        … 30 × company / 30 × chart / 6 × chart2 / N × people /
            house / cars / logs / compp                               // :154-209
        var _buff = buffer_create(1, buffer_grow, 1);
        buffer_write(_buff, buffer_string, file_ini_print(q));        // :211
        _buff = buffer_compress(_buff, 0, buffer_tell(_buff));        // :212  raw zlib
        global.saveda = 1;
        buffer_save_safe(_buff, arg0, global.hmac_key2);              // :214
        global.saveid = buffer_async_group_end();
        var inistring = file_ini_close(q);                            // :217
        q = file_ini_open("savedb.9800");                             // :218
        var timenow = string(year) + "/" + string(month) + "/" + string(day);
        file_ini_write_string(q, firstname, "time", timenow);         // :223
        file_ini_write_string(q, firstname, "name", global.myname);   // :224
        file_ini_write_string(q, firstname, "mode", global.mode);     // :225
        file_ini_close(q);
        global.savingnow = 1; global.savedcomplete = 1;
        instance_create(11, 220, o_savingtext);                       // :230 "Saving…" toast
        switch_save_data_commit();                                    // :231
    }
}
```

Key type distinctions:

* `myname`, `narcompanyname`, `invest_project`, `company_lastprice` are written with
  `file_ini_write_string`; every other `saveglobalvars` entry uses `file_ini_write_real`
  (`savegame.gml:130-137`). Strings therefore land **quoted** in the INI (see
  `repa = "        -nan(ind)"` in the reference save).
* `mydatetime` is special-cased: `file_ini_write_string(q, "local", "mydatetime", string_format(mydatetime, 20, 10))`
  — a 20-char right-aligned, 10-decimal rendering of the datetime real
  (`savegame.gml:145-148`). That is the `"               38452.9166724537"` in the reference save.

### 5.3 Compression / integrity helpers

`buffer_save_safe(buffer, filename, key)` — `gml_GlobalScript_buffer_save_safe.gml:1-21` **[VERIFIED]**:

```gml
var _buffer     = buffer_create(buffer_get_size(arg0), buffer_get_type(arg0), buffer_get_alignment(arg0));
buffer_copy(arg0, 0, buffer_get_size(arg0), _buffer, 0);
var _buffer_str = buffer_base64_encode(_buffer, 0, buffer_get_size(_buffer));
var _hash       = sha1_string_utf1_hmac(arg2, _buffer_str);
var _save_str   = string_copy(_buffer_str, 0, string_length(_buffer_str));
_save_str += $"#{_hash}#";
var _save_buffer = buffer_create(string_byte_length(_save_str) + 1, buffer_grow, 1);
buffer_write(_save_buffer, buffer_string, _save_str);
buffer_save_async(_save_buffer, arg1, 0, buffer_get_size(_save_buffer));
```

Layout of a `.save` file: `base64( zlib( INI ) ) + "#" + 40 hex chars of HMAC-SHA1 + "#"`.

`buffer_load_safe(str, key, outbuf)` — `gml_GlobalScript_savegame.gml:71-97` **[VERIFIED]**:

```gml
var _hash        = string_copy(arg0, string_length(arg0) - 40, 40);
var _buffer_str  = string_copy(arg0, 1, string_length(arg0) - 42);   // note the off-by-one `1`
var _new_hash    = sha1_string_utf1_hmac(arg1, _buffer_str);
if (_hash == _new_hash) { … buffer_base64_decode(_buffer_str) … buffer_copy(…) }
else { trace("The files integrity check failed…"); return 1; }
```

`sha1_string_utf1_hmac(key, message)` — `gml_GlobalScript_savegame.gml:27-69` — textbook HMAC-SHA1
with `_block_size = 64`, `_hash_size = 20`, ipad `0x36` (54), opad `0x5C` (92); keys longer than 64
bytes are pre-hashed (`sha1_string_utf8`).
`hex_string_byte(hexstr, byteIndex)` — `savegame.gml:1-25` — converts one byte of a hex digest
string to an int (accepts `0-9` and `a-f` only).

Load path (`gml_Object_o_cursor_Other_72.gml:16-44`) — the async group completes →

```gml
var buffstring = buffer_read(global.loadbuff, buffer_string);
var _buff = buffer_create(1, buffer_grow, 1);
var _file = buffer_load_safe(buffstring, global.hmac_key2, _buff);
var _buff2 = buffer_decompress(_buff);
if (_buff2 != -1) { _buff = _buff2; }
stringgg = buffer_read(_buff, buffer_string);
load_script(stringgg);
```

### 5.4 `load_script(ini_text)` — `gml_GlobalScript_loadgame.gml:61-402`

Mirror of `savegame()`, in the same order:

1. `[global] inventory` → `ds_map_read` (`:64-68`)
2. 175 × `saveglobalvars`; `myname`/`narcompanyname`/`company_lastprice`/`invest_project` via
   `file_ini_read_string`, everything else via `file_ini_read_real(…, 0)`, and the assignment is
   guarded by `if (chiki != "")` (`:69-83`)
3. 114 × `savearrayvars` via `json_parse`, with a `fix_json_string()` salvage path and a
   developer e-mail error toast on failure; `human_type == ""` sets `global.manbad = 1` (`:85-111`)
4. 75 × `savelocalvars` onto `o_control`; `mydatetime` is read as a string and coerced by
   **`realfix()`** (`gml_GlobalScript_realfix.gml:1-25`, which returns `real(arg0)` for anything with
   digits or a `.`, else `0`) (`:112-122`)
5. 30 × `[company]` + 30 × `[chart] chart_series_data_N` → `ds_list_read` then replay **exactly 90**
   `chart_add_data` calls per series (`:123-178`)
6. 6 × `[chart2]` (`:179-207`)
7. `[people] human_list_0 .. human_kol+human_kol2` (`:209-216`)
8. `[house] houses`, `[cars] cars`, `[logs] logs`, `[compp] companies_list`, `[cars] brand_list`
   (`:217-238`)
9. Post-load fixups: `check_houses()`, `check_cars()`, `check_all()`, `kurs` repair
   (`random_range(180,222)` if 0), `myname` bracket sanitisation, `company_ac_average` back-fill,
   `set_collection()`, gacha-sheet back-fill, `comp_dev_*` sync, and the `new_sectors` remap (`:239-401`)
10. `newday = 0` (`:399`) so the freshly loaded day does **not** re-run the whole per-day block

`loadgame(slot)` itself (`loadgame.gml:1-14`) is asynchronous:
`buffer_load_async(global.loadbuff, slot + ".save", 0, -1)` inside a `buffer_async_group`;
`loadstart()` (`:16-21`) spawns `o_startgame`, which creates `o_control` at frame 25
(`o_startgame_Step_0.gml:3-9`), and `o_control` Create calls `loadgame(global.load)` at
`o_control_Create_0.gml:937`. `timer = -1` is set first so the clock can't run mid-load.

### 5.5 Slot inventory, autosave, quicksave, delete

`o_saveslots_Draw_0.gml:8-116` renders a 4×4 grid. Slot names are generated as
`"saveslot_" + num` for `num = -2 … 13`, with two special cases:

```gml
// gml_Object_o_saveslots_Draw_0.gml:18-29
var namesv  = "saveslot_" + string(num);
var slotname = txt(3153) + " " + string(num);
if (num == -2) { namesv = "saveslot_auto";  slotname = txt(3151); }
if (num == -1) { namesv = "saveslot_quick"; slotname = txt(3152); }
```
⇒ **`saveslot_auto` = slot −2**, **`saveslot_quick` = slot −1**, manual slots **0 … 13** (14 of them).

* Presence/label comes from `file_ini_section_exists(q, namesv)` in `savedb.9800`; the label is
  `name + "\n" + time` (`:30-39`).
* Left click = save (if `o_control` exists) or load; right click / `gp_face4` = delete
  (`create_question(txt(1976), txt(1975), script_deletesave)`, `:53, 81-85`).
* Save path: `instance_activate_object(o_control); global.namesvs = namesv; with (o_control) { savegame(global.namesvs); }` (`:92-95`).
* Load path: `loadstart(namesv)` (`:103`) → the full `o_startgame → o_control → loadgame` restart.

**Autosave** — once a month, on the 25th, inside the new-day block:
```gml
// gml_Object_o_control_Step_0.gml:624-627
if (myday == 25) { savegame("saveslot_auto"); }
```
**[VERIFIED]**

**Quicksave / quickload** — F5 / F9, only in the main rooms:
```gml
// gml_Object_o_control_Step_0.gml:5567-5577
if (room == RoomMain || room == r_company) {
    if (keyboard_check_pressed(vk_f5)) { savegame("saveslot_quick"); }
    if (keyboard_check_pressed(vk_f9)) { loadgame("saveslot_quick"); }
}
```

**Delete** — `gml_GlobalScript_script_deletesave.gml:1-7`:
```gml
function script_deletesave() {
    file_delete(global.namesvs + ".save");
    var q2 = file_ini_open("savedb.9800");
    file_ini_section_delete(q2, global.namesvs);
    file_ini_close(q2);
}
```

### 5.6 Settings — `settings.ini`

```gml
// gml_GlobalScript_save_settings.gml:1-12
ini_open("settings.ini");
ini_write_real("global", "language",       global.language);
ini_write_real("global", "vol_music",      global.vol_music);
ini_write_real("global", "vol_sound",      global.vol_sound);
ini_write_real("global", "sizescreen",     global.sizescreen);
ini_write_real("global", "fullscreen",     global.fullscreen);
ini_write_real("global", "crt",            global.crt);
ini_write_real("global", "notfirstintro",  global.notfirstintro);
ini_close();
```
Loaded by `load_settings()` (`:14-72`):

| key | default | notes |
|---|---|---|
| `language` | from `os_get_language()`: `en→0, uk→1, ja→2, ko→3`, else `0` | extra languages discovered from `*.csv` in the save dir push `global.maxlang` above 3 (`o_cursor_Create_0.gml:94-117`) |
| `vol_music` | `0.8` | step 0.005 (keys) / 0.02 (wheel), `settings_menu.gml:270-293` |
| `vol_sound` | `0.8` | `settings_menu.gml:295-321` |
| `sizescreen` | `4` | 0-9 → 480×270 … 3360×1890 (`settings_menu.gml:48-91`) |
| `fullscreen` | `1` | 0 = windowed, 1 = fullscreen, 2 = borderless (`:36-47`, wraps at >2 → 0) |
| `crt` | `3` | 0 = off, 1-5 CRT strength (`settings_menu.gml:133-141, 322-354`) |
| `notfirstintro` | `0` | skip the intro |

`save_settings()` is also called at the end of `o_control` Create (`o_control_Create_0.gml:892`).
**Difficulty is NOT in `settings.ini`** — it lives in the save's `[global]` section.

### 5.7 INI implementation

The `file_ini_*` family (`gml_Script_file_ini_*.gml`, 37 scripts) is GameMaker's own
`file_ini_*` extension (used for `savedb.9800` and `settings.ini`). `savegame`/`loadgame`
instead use the **in-memory** variants: `file_ini_parse("")`, `file_ini_write_real/string`,
`file_ini_print(q)`, `file_ini_close(q)`.

### 5.8 The packed-array encoding (VERIFIED against `saveslot_auto.inflated`)

| Section key | Producer | Encoding |
|---|---|---|
| `[global] inventory` | `ds_map_write(global.player_inventory)` | `[u32 403][u32 count]` then `count × 24 B` (`5 × 24` = 128 B in the reference save) |
| `[people] human_list_N` | `ds_list_write(global.human_list[i])` | `[u32 303][u32 count]` then `count × ([u32 1][u32 len][bytes])` |
| `[house] houses` | `ds_list_write(global.houses)` | idem, strings (`_0_0_1_8_spraparto_3_8_8_4734792_0_0_0_0_0_0.5_`, 47 B in the sample) |
| `[cars] cars`, `[cars] brand_list` | `ds_list_write(...)` | idem |
| `[compp] companies_list` | `ds_list_write(companies_list)` | idem |
| `[chart] chart_series_data_N` (30) | `ds_list_write(chart series)` | `[u32 303][u32 90]` then `90 × ([u32 0][f64 LE])` — **float64**, not float32 |
| `[chart2] chart_series_data2_N` (6) | idem | idem |
| `[logs] logs` | `ds_list_write(global.logs)` | `[u32 303][u32 count]` then nested arrays: `[u32 2][u32 n][n × record]`, record = `[u32 0][f64]` for reals / `[u32 1][u32 len][bytes]` for strings |

Cross-checks that pin the format:

* `chart_series_data2_0` decoded with the above layout gives `87441, 88084, 88744, 89241, …`, matching
  `commodity_price = [92555, 2600, 5401, 11724, 379112, 482114]` (same series, current point).
* `chart_series_data_0` gives `138243, 135949, 133598, …`, consistent with `lastprice_0 = 312773.67`
  and `company_stockprice_0 / company_number_a_0 = 1.237e11 / 389686 = 317 500`.
* `logs` element 0 decodes to
  `[38452.9166724537, -803500000, 1544, -1, <string>]` — the first field is **byte-identical to the
  save's own `mydatetime`**, confirming both the f64 layout and the 1899-12-30 epoch reading.
* `houses` decodes to 1404 elements; `brand_list` to 8; `companies_list` to 7; `cars` to 4.

⚠ The brief's note that packed arrays are "little-endian **float32**" is **inaccurate for reals**:
the verified record is 12 bytes = 4-byte type tag + **8-byte IEEE-754 double**, little-endian.
Strings are 4-byte tag + 4-byte length + raw bytes.

### 5.9 Full save-file INI schema

Section counts observed in the reference save (`D:\stonks-re\saves\save_schema.txt`):

| # | Section | Keys | Source |
|---|---|---|---|
| 1 | `[global]` | **176** | 1 special (`inventory`) + 175 × `saveglobalvars` |
| 2 | `[arrays]` | **114** | 114 × `savearrayvars` (JSON) |
| 3 | `[local]` | **74** | 75 × `savelocalvars` (one key is duplicated in the list → 74 unique) |
| 4 | `[company]` | **1380** | 30 × (21 + 12×2 + 1) = 30 × 46 |
| 5 | `[chart]` | **30** | `chart_series_data_0 … _29` |
| 6 | `[chart2]` | **6** | `chart_series_data2_0 … _5` |
| 7 | `[people]` | **803** | `human_list_0 … human_list_{800+human_kol2}` |
| 8 | `[cars]` | **2** | `cars`, `brand_list` |
| 9 | `[house]` | **1** | `houses` |
| 10 | `[logs]` | **1** | `logs` |
| 11 | `[compp]` | **1** | `companies_list` |
| | **total** | **2611** | |

Order of emission in `savegame()`: `global` → `arrays` → `local` → `company` → `chart` → `chart2`
→ `people` → `house` → `cars` → `logs` → `compp`. ✔ matches the reference file.

#### `[global]` — 175 names, in `saveglobalvars` order
*(`myname`, `narcompanyname`, `invest_project`, `company_lastprice` are string-quoted)*

```
startmode, daynewcompany2, yoshiro, noluck, new_sectors, kurs, achiv_level_builds,
p_hires, p_rejects, hikari_rep, invest_build_days, invest_center, neosun_event, gifts,
hikari_go, donate_last_day, temple_money, upg_b_comp__0, upg_b_comp__1, upg_b_comp__2,
dom_orenda_stavka, days_without_investments, fish_timer, fish_bait, manbad, themechoose,
poker_times, fishes_count, poker_wins, poker_open, place_poker, yakuza_in_work,
company_choose, fishing_points, fishing_times, fish_score, daysfromuy, pricebuycomp,
company_offer, offer_send, bankrupt_dali, golf_wins, levelproject,
company_develop_points_char, company_develop_points_int, company_develop_points_prec,
arcade_points, n_place_horses, days_without_bad_things, n_place_golf, n_place_arcade,
n_place_pachi, n_place_temple, n_place_park, n_place_bar, trend_target, dayswithotcomp,
startcompany_mode, gacha_krutki, upgrades_halyava_days, nelegal_comp_in_past,
diff_limit_stonks, workfire, company_strike, mycomp_kepski_spravy, badreput_in_comp_days,
rada_predupr, chill_event, price_koef, start_money, gotobars, art_price, art, alcoholic,
trade_zab_days, fca_predupr, perhseporushennya, fca_points, diff_limits, diff_fsa,
futuretech, short_av, yakuza_vorog, narcompanyname, rnd_in_process, sud_diff,
birthday_month, birthday_day, emygulyadays, player_compnumber, laywer_hired,
insader_zaborona, prognoz_know, days_with_bad_carma, daysgone_amy_talk, invest_com,
invest_profit, invest_project, kilkist_ugod, mecenats, charity, yakuza_rep, price_cars,
price_building, fortune, nalog, dontblock, banditmest, turma, daynewcompany, narcompany,
theme, season, invest_luck, prediction, predictiondays, barchasto, bezotpuska, otpuskdays,
human_kol, allstockprice, prognoz_pozitiv, short_dolg, short_procent, mode, myname,
deposit, repa, emilevel, emi, karma, depositdays, depositprocent, pachinko_kurs, dolgdruga,
nelegaldaymax, parttimework_days, parttimework_plata, platapodrabotka, nedeli, totalbankrupt,
nelegalday, happy, cozy, stress, daily, stoptime, prodaja, pidozra, stop, dolg, prognoz,
summa, money, trata, bankprocent, v, bankprocentvzyal, illegal, strahovka,
numberofcompany, vykup, rynochek, trend, house, car, invest_days, rashod, dohod, activew,
hospital, kommisia, diff_divident, diff_profit, diff_stress
```

#### `[local]` — `o_control` instance vars, in `savelocalvars` order
(`oldemioldlevel` is listed **twice**, hence 74 unique keys)

```
otrava, myday, offer_days, todaybankrupt_company, comp_point, shans_random_events,
yakuza_days_3, yakuza_days_2, randyakuz, shans_mycomp, koef_happy_HR, viddil1_series,
viddil2_series, viddil3_series, viddil4_series, long_koef_HR, dumka, checks, vybrano4timer,
raznica, newemilevel, sizemi, oldemioldlevel2, oldemioldlevel, oldemioldlevel(dup),
emioldlevel, yakuza_days, beg, koef_car, koef_house, nalogestate, tmrv, startgame,
startgame2, minishans, shans, holyday, shtraff, bandittimer, podschet, etap_sud, vzytka,
housemoney, shansotpusk, shortproc, mydatetime, daydolg, myweekday, podrabotka,
procent_deposit_0, procent_deposit_1, procent_deposit_2, dlg, bankrupt, workdays, gameday,
shansloto, srok, minishans2, carsdoms, rynok_up, izymaem, neudach, udach, sobranie, tratadop,
epopo, nashol, colich, cena1, cena2, sobytive, globaletapdepra, etapdepra, daybomj
```

#### `[arrays]` — 114 names, JSON-serialised, in `savearrayvars` order

```
pachinko_balls, traits, company_limit_kil_perk, commodity_koef_target, commodity_price,
commodity_koef, commodity_player, comm_dohod, comm_rashod, comm_lastprice,
commodity_start_price, b_sector_now, investment_buyed, investment_size, investment_info,
invest_slots, invest, human_cultist, items_notnew, toys_today, company_prohnoz,
company_days_after_yakuza, amy_skins, fishingrod, fish_collection, human_desired_price,
company_days_without_buy, company_predupr_bankrupt, human_point_charisma,
human_point_intelligence, human_point_precision, company_create_player,
full_dohod_company_for_year, gacha_shtuki, company_days_without, human_yakuza,
building_mnozh, building_rare, company_go_in_rada, mycomp_level_bonus, humannew,
human_longbad, human_days_off, human_zp_echo, human_nastriy, human_price, human_bio,
human_xp, human_precision, level_viddil, human_type, mycomp_workers, mycomp_effective,
mycomp_hvylya, human_nose, human_hyst, company_oldnumber_a, company_oldstockprice,
company_name_rezerve, human_talking_today, human_talking, human_telephone, company_riznycya,
company_checkdays, company_kupleno, company_tyzhden, company_limit_kil, company_limit,
company_control, company_lastprice, company_dohod2, company_ac_bought_number, rezevr_names,
company_liq, human_new, company_points, company_char, company_rezerv, big_data, field_profit,
field_hype, company_field, delaydays, achiev_savelevel, human_body, human_rot, human_hair,
human_eye, human_face, human_friend, human_charisma, human_intelligence, human_stamina,
human_name, human_sex, human_surname, cars_price, cars_condition, cars_image, cars_komfort,
cars_sprite, cars_name_model, cars_name_brand, cars_type, char, cars_buyed, building_com,
building_image, building_komfort, building_price, building_rooms, building_size,
building_sprite, building_type
```
(`company_char` is an array-of-arrays; `big_data` is `30 × [int,int,int,int]`; `human_name`/`human_surname`
mix string indices and reals → JSON `["AAA", 62.0, 144.0, …]`.)

#### `[company]` — 46 keys per index `i` in 0…29 (`savegame.gml:154-187`)

| key pattern | type | notes |
|---|---|---|
| `company_name_N` | string | |
| `company_profit_effect_N` | real | |
| `company_sovet_N` | real | internal reputation |
| `company_control_N` | real | `random_range(33,50)` at world-gen |
| `company_vsovete_N` | real | 0 none / 1 board / 2 founder |
| `company_color_N` | real | palette index |
| `company_price_N` | real | company valuation |
| `company_hype_N` | real | |
| `company_profit_N` | real | margin |
| `company_hype_effect_N` | real | |
| `company_number_a_N` | real | shares outstanding |
| `company_ac_N` | real | player shares held |
| `company_stockprice_N` | real | market cap |
| `dohodnachalogoda_N` | real | YTD profit |
| `ac_vchera_N` | real | shares at yesterday's close |
| `company_rashod_N` | real | |
| `company_dohod_N` | real | |
| `company_short_N` | real | player's short position |
| `company_since_N` | real | founding year |
| `lastdohod_N` | real | last monthly dividend |
| `lastprice_N` | real | price at last board seat |
| `lastdate_N` | string | `"M/YYYY"` |
| `dohodmesyac_N_M` (M = 0…11) | real | 12 keys |
| `dohodmesyac_all_N_M` (M = 0…11) | real | 12 keys |
| `chart_series_data_N` → lives in `[chart]` | — | |

⇒ 22 + 24 = **46 keys/company × 30 = 1380** ✔ matches the reference file.

#### `savedb.9800`

```ini
[saveslot_auto]
time=2005/4/10
name=AAA AAA
mode=0

[saveslot_quick]
...
[saveslot_0] … [saveslot_13]
```

---

## 6. Settings-menu key map (console/menu reference)

`gml_GlobalScript_settings_menu.gml:1-359` (options) and `:361-587` (new-game sliders):

| Index | Option | Range / values |
|---|---|---|
| `menu_settings2[0]` | fullscreen mode | 0 windowed / 1 fullscreen / 2 borderless |
| `[1]` | resolution | `sizescreen` 0-9 (480×270 … 3360×1890); overridden to `display_get_width()xdisplay_get_height()` when fullscreen |
| `[2 - global.consoles]` | language | `0 … global.maxlang`, wraps |
| `[3 - …]` | music volume | 0-1, ±0.005 key, ±0.02 wheel |
| `[4 - …]` | sound volume | same |
| `[5 - …]` | CRT | 0-5 |
| `menu_settings3[0..10]` | the 11 difficulty sliders (§3.1) | |
| `menu_settings3[4]` | `string_thousands(start_money[level_diff[4]])` | display only |

---

## 7. Open questions / unverified

### 7.1 The reference save is from a **different build** than the decompiled code

Three hard inconsistencies, all pointing the same way:

1. **`gameday` vs calendar.** The save has `mydatetime = 38452.9166724537` (2005-04-10 22:00) and
   `gameday = 9224`. Starting from 1979-12-31 + 9224 increments would give 2005-04-11 — i.e. the
   date is *ahead* of what `gameday` implies by 8 days. In the decompiled build, the **only** place
   that advances the calendar without bumping `gameday` is `o_control_Alarm_0` (one-shot, +1 day).
   So either the save came from a build with a different start date / extra date bumps, or
   `gameday` had a different origin. **UNRESOLVED.**
2. **`daynewcompany = 55`.** The current code initialises it to `irandom_range(100, 200)`
   (`o_control_Create_0.gml:660`). 55 is outside that range. (`daynewcompany2 = 263` *is* inside its
   `irandom_range(222, 333)`.) **UNRESOLVED.**
3. **`myday = 11` in a save written by the `myday == 25` autosave.** **UNRESOLVED.**

Also: the reference `savedb.9800` (per the brief) records `time=2005/4/11`, but
`savegame.gml:219-223` writes `date_get_day(mydatetime)` which for `38452.9166724537` is the **10th**.
This is consistent with (1) — `savedb.9800` and `saveslot_auto.save` were almost certainly produced
by *different* versions, and the brief's `2005/4/11` is consistent with a start-date of
`1979-12-31 + gameday`, i.e. **1980-01-01 + 9224 days = 2005-04-11**. That is a strong hint the
game *did* start 1980-01-01 and the `mydatetime` value in the `.save` is the odd one out.

### 7.2 `hmac_key2` mangled by encoding

`gml_Object_o_cursor_Create_0.gml:129` reads
`global.hmac_key2 = "e�"-%fgTernoxXFaston@";` — the file is CP1251-decoded and the backslash /
high bytes are lost. The Demo key `"xfdTesd#$fchipichapa@"` is intact and is the same 22-character
shape, so the full key is **probably** `e\"-%fgTernoxXFaston@` with an escaped quote. **Not
byte-exact.**

### 7.3 `achiv_global_save()` inconsistency

```gml
// gml_GlobalScript_achivka.gml:152-159
var _buff = buffer_create(1, buffer_grow, 1);
buffer_write(_buff, buffer_string, json_stringify(global.achiev_globalsavelevel));
var _bufferstring = buffer_base64_encode(_buff, 0, buffer_tell(_buff));   // computed, unused
buffer_save_safe(_buff, "stonks.9800", global.hmac_key);                 // raw buffer!
```
`buffer_save_safe` base64-encodes internally (`buffer_save_safe.gml:10`), so this is actually
correct; `_bufferstring` is just dead. **VERIFIED harmless**, flagged for completeness.

### 7.4 `buffer_load_safe` off-by-one

```gml
// gml_GlobalScript_savegame.gml:79
var _buffer_str = string_copy(arg0, 1, string_length(arg0) - 42);
```
`string_copy(str, 1, len)` is 1-indexed, so this drops the **first character** of the base64 blob.
`buffer_base64_decode` tolerates a missing leading character in most cases (base64 alphabet), and
zlib only needs the header bits, so it evidently works — but the byte range is inconsistent with
`_hash = string_copy(arg0, string_length(arg0) - 40, 40)` which correctly grabs the trailing 40 hex
chars. **VERIFIED as written; effect benign (empirically, since saves load).**

### 7.5 `sud_calc` / `sud_shans` / `sud_shans_text` not found

Referenced by `gml_GlobalScript_zvonok1_1.gml:58,143,272` but absent from the decompiled set
(likely inline/child-stub or stripped). `global.sud_diff` semantics in §3.6 are therefore
**INFERRED**.

### 7.6 `global.diff_stress` duplicate tables

`gml_GlobalScript_diff_stress.gml` (returns `bobo`) and the inline `stles` block in
`o_control_Step_0.gml:86-109` / `o_control_Create_0.gml:270-287` disagree on two of five values.
`diff_stress()` itself has **no callers** in the decompiled tree. Which one shipped is
**UNRESOLVED**; `stles` is the one referenced by the stress/happiness code, so `stles` is almost
certainly authoritative.

### 7.7 `min_all_limit` initialisation table

`o_control_Create_0.gml:940-955` uses `1 / 0.75 / 0.45 / 0.22` while the per-frame `Step_1` table uses
`1 / 0.56 / 0.31 / 0.11`. Since `Step_1` runs every frame it overwrites the Create value within one
frame, so the Create table is effectively dead — but it is what you see during the very first frame.
**VERIFIED both; intent UNRESOLVED.**

### 7.8 Vernal-equinox fallthrough bug

`vernal_equinox_day(1970..1978)` returns **20**, not 22, because the `day = 22` case block has no
`break` (`gml_GlobalScript_vernal_equinox_day.gml:6-15`). Affects the March-holiday date in those
years only. **VERIFIED.**

### 7.9 Not investigated / out of scope

* The *economy* half of `update_price`, `mycompany_step`, `commodity_update` (owned by the other
  subsystem agent) — only their **call cadence** is documented here.
* `global.upgr` / `scr_comp_upgrade1` (company upgrades) — explicitly the other agent's.
* Console/platform save mounting (`switch_save_data_mount/commit`, `oAsyncWrapper*`,
  `os_get_info() == "Demo"` branch) — stubs in the decompile.
* `GOG_Stats_*` / Steam achievement plumbing — stubs (`extension_stubfunc_real`).

---

## 8. Quick-reference cheat sheet

```
DAY  = o_control.timer crossing 100      (starts at 1 after each newday)
CLOCK= o_control.mydatetime (GMS datetime, epoch 1899-12-30, time-of-day frozen at 22:00)
START= 1980-01-01  (mydatetime seeded 1979-12-31, first advance forced by startgame2 = 1)
FPS  = 60 (room_speed untouched outside the shmup)
DAY@2x = 198 steps ≈ 3.30 s      YEAR@2x ≈ 20 min      SAVE@2x ≈ 8.5 h
SPEED : SPACE toggles pause(1) ⇄ time_speed_now(2)
GATED : timer only advances when global.stop==0 && windowopen==0 &&
        vybrano∉{4,5} && totalbankrupt==0 && stoptime==0 && !o_kalkulator
MINIGAMES advance o_control.timer themselves (+0.4 hikari / +0.25 meeting / +0.15 park,temple)
SEASONS: 12,1,2→0(winter) 3,4,5→1 6,7,8→2 9,10,11→3   palette index = 2,3,0,1
HOLIDAYS: 8 fixed + 4 nth-weekday (3 only ≥2003) + 9 year-windowed + Sat/Sun
MARKET CLOSED when holyday==1 or global.insader_zaborona==1
SLOTS  : saveslot_auto(-2), saveslot_quick(-1), saveslot_0..13   →  .save + savedb.9800
AUTOSAVE: myday == 25         QUICK: F5 / F9
SAVE   : base64( zlib( INI ) ) + "#" + HMAC-SHA1(hmac_key2, base64) + "#"
INI    : [global][arrays][local][company][chart][chart2][people][house][cars][logs][compp]
PACKED : [u32 303][u32 count] then per element [u32 type]{ [u32 0][f64] | [u32 1][u32 len][bytes] | [u32 2][u32 n][…] }
ACHIEV : global.listachiv[96] ⇄ global.achiev[i][0..6]; state in achiev_savelevel (save) + achiev_globalsavelevel (stonks.9800)
DIFF   : level_diff[0..10] → diff_divident / diff_profit / diff_stress / start_money /
         numberofcompany / diff_limits / diff_fsa / diff_limit_stonks / mode / noluck
```
