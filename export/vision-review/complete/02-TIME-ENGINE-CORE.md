# 02 — Time, Engine Core and Determinism

Owner module: **02**. Binding contracts it implements: 00 §5.1 (time), §5.2 (tick pipeline), §5.6 (event envelope, shared with 19), §3.1 (units and `toMoney`), §3.2 (deterministic IDs).
Depends on: 03 (ledger commit and invariants in P13), 19 (processes, storage, protocol), 20 (replay and regression harness), 21 (admin halts and patches).
Every other module depends on this file for: the clock, the calendar hooks, the phase it runs in, the RNG stream it draws from, the math library it uses and the rules that keep it deterministic.

---

## §1 Purpose

The world of TYCOON is one persistent, deterministic simulation that advances in discrete **ticks** of 5 real seconds. This module defines:

1. **The clock and calendar**: how a tick maps to a game date, time of day, trading phase, week, month, quarter, year and chapter, plus the holiday calendar of each bloc and what happens at every boundary.
2. **The tick pipeline**: the 15 phases P0 to P14 of 00 §5.2, how they run across invisible partitions, their time budgets, and what happens when a tick fails (rollback, safe mode).
3. **The pure `step()` contract**: the world advances only through a pure function of (state, sealed intents, entropy). No module may read the wall clock, a random source, the network or the disk inside `step()`.
4. **Determinism**: the coding rules, the deterministic math library, the fixed-point conversions (`toMoney` and friends), and the RNG streams (xoshiro128**, one stream per purpose and subject).
5. **Provable fairness**: commit-reveal entropy and fair intra-tick ordering, so the operator can prove it never rigged an outcome and no player can predict one.
6. **Persistence of time**: snapshots, event sourcing, replay, audit, versioning, catch-up when the server lags, clock drift, and maintenance in a world that never resets.

Design goals, in priority order: (a) the same inputs always give bit-identical outputs on any machine running the same engine version; (b) no player can gain anything from latency, device, timing or knowledge of the server; (c) a tick never commits partially; (d) the 5-second rhythm holds at 100k concurrent players and 750k AI agents (00 §5.7, 02-multiplayer §1).

---

## §2 Entities

All types are TypeScript-style. `Tick`, `Money`, `Qty`, `Price` per 00 §3.1. `Hash32` is a 32-byte SHA-256 digest as a lowercase hex string in the protocol and a `Uint8Array(32)` in memory.

### §2.1 Clock constants (immutable for the life of the world)

```ts
const TICK_REAL_SECONDS        = 5;
const TICKS_PER_GAME_HOUR      = 30;            // 1 tick = 2 game minutes
const TICKS_PER_GAME_DAY       = 720;           // = 1 real hour (L9)
const GAME_DAYS_PER_WEEK       = 7;             // Mon..Fri trading, Sat, Sun weekend
const GAME_DAYS_PER_QUARTER    = 91;            // 13 weeks, months 28/28/35 (4-4-5)
const GAME_DAYS_PER_GAME_YEAR  = 364;           // 52 weeks
const TICKS_PER_GAME_YEAR      = 262_080;
const GAME_DAYS_PER_CHAPTER    = 1_344;         // 8 real weeks = 56 real days = 192 game weeks
const TICKS_PER_CHAPTER        = 967_680;
const GAME_DAYS_PER_REAL_DAY   = 24;
const DT_YEARS                 = 1 / 262_080;   // `dt` in every formula (00 §3.4)
const DT_DAYS                  = 1 / 720;
```

These constants are part of the world genesis record and can never change in a live world (changing them would change the meaning of every stored tick).

### §2.2 Game date

```ts
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;       // 0 = Mon ... 4 = Fri, 5 = Sat, 6 = Sun
type Phase =
  | 'PRE_MARKET'        // t 0..59
  | 'OPEN_AUCTION'      // t 60
  | 'CONTINUOUS'        // t 61..539
  | 'CLOSE_AUCTION'     // t 540
  | 'AFTER_HOURS'       // t 541..719
  ;
interface GameDate {
  tick: Tick;              // absolute tick since genesis (tick 0 = Y1 Jan 1, Mon, t = 0)
  dayIndex: number;        // floor(tick / 720), 0-based since genesis
  t: number;               // tick of day, 0..719
  year: number;            // 1-based game year
  dayOfYear: number;       // 1..364
  quarter: 1 | 2 | 3 | 4;
  month: number;           // 1..12
  dayOfMonth: number;      // 1..28 or 1..35
  weekOfYear: number;      // 1..52
  weekday: Weekday;
  chapter: number;         // 1-based
  dayOfChapter: number;    // 1..1344
  minuteOfDay: number;     // 2 * t, 0..1438 (canonical game time, 00:00 at t = 0)
  phase: Phase;            // equity-exchange phase clock (same for all blocs, 00 §5.1)
  isWeekend: boolean;
}
```

### §2.3 Calendar and holidays

```ts
type BlocCode = 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL';
interface Holiday {
  id: string;                      // 'hol_FDL_CHARTER'
  nameKey: string;                 // localization key, e.g. 'holiday.fdl.charter'
  blocs: BlocCode[];               // blocs whose exchange closes
  dayOfYear: number;               // 1..364, always a weekday (validated at genesis)
  scope: 'EXCHANGE_CLOSED';        // only closure type in this spec
}
interface Calendar {
  holidays: Holiday[];             // §3.2 table; data in 22
  displayClockOffsetMin: number;   // PARAM.display_clock_offset_min, cosmetic only
  blocLabelOffsetMin: Record<BlocCode, number>; // cosmetic time-zone labels (22)
}
```

### §2.4 Intents as sealed

```ts
interface SealedIntent {
  intentId: string;            // from the envelope (00 §5.5), unique world-wide
  actorId: string;             // chr_... or operator id acting under a Mandate
  partitionId: string;         // home partition of the actor
  kind: string;                // namespaced, e.g. 'mkt.order.place'
  payload: unknown;            // canonical-encoded, validated in P1 by the owner module
  clientTick: Tick;            // advisory, see §3.12
  nonce: bigint;               // strictly increasing per actorId
  channel: 'UI' | 'API' | 'AI' | 'NPC' | 'ADMIN' | 'SYSTEM';
  receivedSeq: number;         // gateway receipt sequence, telemetry only, never used for ordering
  orderKey: Hash32;            // fair-order key, computed in P0 (§3.12)
}
```

### §2.5 Tick header and tick record

```ts
interface TickHeader {
  worldId: string;
  tick: Tick;
  engineVersion: string;        // content hash of the engine bundle, e.g. 'eng_7f3a...'
  paramsVersion: number;        // version of the parameter set in force (23)
  contentVersion: number;       // version of catalogs (22)
  sealUtcMs: bigint;            // wall-clock instant the coordinator sealed the tick (recorded input)
  scheduledUtcMs: bigint;       // anchor + tick * 5000 + reanchorOffset (§3.19)
  intentsRoot: Hash32;          // Merkle root of all SealedIntent of this tick, fair-ordered
  intentCount: number;
  entropyCommitAhead: Hash32;   // commitment C(tick + PARAM.entropy_commit_lead_ticks), §3.11
  entropyReveal?: { forTick: Tick; value: Hash32 }; // reveal of e(tick - PARAM.entropy_reveal_lag_ticks)
  epoch: number;                // RNG epoch (= chapter number), §3.11
  epochSeedCommit?: Hash32;     // present on the first tick of each epoch
  epochSeedReveal?: { epoch: number; value: Hash32 }; // reveal of a past public epoch root
  quarantine: QuarantineEntry[];// safe-mode exclusions decided for this tick (§3.15), usually []
  directives: AdminDirective[]; // halts, param cutovers, version cutovers (§3.18, §3.20)
  prevTickHash: Hash32;         // worldHash of tick - 1
}
interface TickRecord {
  header: TickHeader;
  partitionHashes: Record<string, Hash32>;  // stateHash per partition after P13
  worldHash: Hash32;                        // SHA-256 over header + sorted partitionHashes
  postingsRoot: Hash32;                     // Merkle root of all postings committed (03)
  eventsRoot: Hash32;                       // Merkle root of all EngineEvents emitted
  durationsMs: Record<PhaseId, number>;     // telemetry, NOT part of worldHash
  mode: 'NORMAL' | 'SAFE' | 'CATCHUP';      // telemetry, NOT part of worldHash
}
type PhaseId = 'P0'|'P1'|'P2'|'P3'|'P4'|'P5'|'P6'|'P7'|'P8'|'P9'|'P10'|'P11'|'P12'|'P13'|'P14';
```

### §2.6 Entropy

```ts
interface EntropyCommit { forTick: Tick; commit: Hash32; publishedAtTick: Tick; }
interface TickEntropy {
  tick: Tick;
  value: Hash32;      // SHA-256('TYC/tick-entropy' || worldId || tick || e(tick) || intentsRoot || prevTickHash)
  words: Uint32Array; // the 8 32-bit words of value, for cheap stream mixing
}
```

`e(tick)` is a 32-byte secret drawn from the coordinator's cryptographic random source (outside `step()`), generated `PARAM.entropy_commit_lead_ticks` ticks in advance and committed in a header before any intent of that tick can be submitted.

### §2.7 RNG stream

```ts
interface RngStream {
  key: string;                 // '<module>.<purpose>[:<subjectId>]', see §3.10.4
  keyHash: Uint32Array;        // 4 words, SHA-256(key) truncated, cached
  root: 'PUBLIC' | 'SECRET';   // which epoch root it derives from (§3.11.4)
  s: Uint32Array;              // xoshiro128** state, 4 x uint32, never all zero
  epoch: number;               // epoch in which s was last (re)seeded
  lastMixedTick: Tick;         // last tick whose entropy was mixed in (§3.10.3)
  draws: bigint;               // total draws, telemetry and replay check
}
```

Streams are created lazily on first use and stored in the partition state of the module that owns them. A stream belongs to exactly one partition.

### §2.8 Partition

```ts
type PartitionKind = 'COORD' | 'PLAYER' | 'MARKET' | 'CITY' | 'FIN' | 'WORLD';
interface PartitionDescriptor {
  partitionId: string;          // 'p_PLAYER_03', 'p_MARKET_EQ_FDL_1', 'p_CITY_cty_PORT_AVALON'
  kind: PartitionKind;
  owns: OwnershipRule;          // which entities/assets it is the single writer for (§3.14.1)
  host: string;                 // process placement, deployment data only, not hashed
}
interface Hold {
  holdId: string;               // deterministic id (§3.13)
  ownerEntityId: string;
  account: string;              // 03 account key, e.g. 'chr_01H..:1001:FDL'
  amount: Money;                // or qty for asset holds
  qty?: Qty; assetId?: string;
  ccy: string;
  purpose: string;              // intent kind or contract id that placed it
  placedTick: Tick;
  expiresTick: Tick;            // auto-release at P13 of this tick if not settled
  status: 'ACTIVE' | 'SETTLED' | 'RELEASED';
}
interface PartitionMessage {
  fromPartition: string;
  toPartition: string;
  tick: Tick;                   // tick in which it was produced
  round: 'B1' | 'B2' | 'B3' | 'NEXT';   // barrier it crosses (§3.5.3), NEXT = delivered at tick+1
  seq: number;                  // per (fromPartition, tick) sequence, deterministic
  kind: string;                 // 'route.order', 'fill', 'income', 'posting.leg', 'consequence', ...
  body: unknown;                // canonical-encoded
}
```

### §2.9 Snapshot manifest

```ts
interface SnapshotManifest {
  worldId: string;
  partitionId: string;
  tick: Tick;                    // state AFTER this tick committed
  engineVersion: string;
  paramsVersion: number;
  stateHash: Hash32;             // must equal TickRecord.partitionHashes[partitionId]
  chunks: { name: string; uri: string; bytes: number; sha256: Hash32 }[];
  kind: 'DAILY' | 'CHAPTER' | 'REBALANCE' | 'PRE_VERSION' | 'ADHOC';
  retainUntil: 'FOREVER' | Tick;
}
```

### §2.10 Safe mode and admin directives

```ts
interface QuarantineEntry {
  kind: 'INTENT' | 'ENTITY' | 'SUBSYSTEM';
  id: string;                  // intentId, entityId, or subsystem id e.g. '09.biz_ops'
  reason: string;              // invariant id that failed, e.g. 'I3' (03 §3.16)
  decidedAtAttempt: number;    // 1..PARAM.safe_mode_max_attempts
}
interface AdminDirective {
  directiveId: string;
  kind: 'HALT' | 'RESUME' | 'PARAM_CUTOVER' | 'VERSION_CUTOVER' | 'REANCHOR' | 'MAINTENANCE_BEGIN' | 'MAINTENANCE_END';
  payload: unknown;
  approvals: string[];         // two admin ids for any directive that changes rules (21)
}
```

### §2.11 World clock anchor

```ts
interface WorldClockAnchor {
  genesisUtcMs: bigint;         // real instant of tick 0, DEFAULT 18:00:00 UTC on launch day
  reanchorOffsetMs: bigint;     // cumulative shift from outages and maintenance (§3.19)
  history: { atTick: Tick; deltaMs: bigint; reason: string }[];
}
```

---

## §3 Rules and formulas

### §3.1 Clock and calendar

#### §3.1.1 Converting a tick to a game date

```
dayIndex     = floor(tick / 720)
t            = tick mod 720
year         = floor(dayIndex / 364) + 1
dayOfYear    = (dayIndex mod 364) + 1
weekday      = dayIndex mod 7                         // every game year starts on a Monday (364 = 52 x 7)
weekOfYear   = floor((dayOfYear - 1) / 7) + 1
quarter      = floor((dayOfYear - 1) / 91) + 1
dIQ          = (dayOfYear - 1) mod 91                 // day in quarter, 0..90
monthInQ     = dIQ < 28 ? 1 : (dIQ < 56 ? 2 : 3)
month        = (quarter - 1) * 3 + monthInQ
dayOfMonth   = dIQ - [0, 28, 56][monthInQ - 1] + 1
chapter      = floor(dayIndex / 1344) + 1
dayOfChapter = (dayIndex mod 1344) + 1
minuteOfDay  = 2 * t
phase        = t < 60 ? PRE_MARKET : t == 60 ? OPEN_AUCTION : t < 540 ? CONTINUOUS : t == 540 ? CLOSE_AUCTION : AFTER_HOURS
isWeekend    = weekday >= 5
```

Month lengths: Jan 28, Feb 28, Mar 35, Apr 28, May 28, Jun 35, Jul 28, Aug 28, Sep 35, Oct 28, Nov 28, Dec 35 (game days). Month names are plain English localized strings (`month.1` … `month.12`); they are generic words, not brands (L6 not affected).

Because 1,344 = 192 × 7, **every chapter starts on a Monday at t = 0**. A chapter is about 3.69 game years and does not align with game years; chapter and year boundaries are independent hooks.

The inverse `dateToTick(year, dayOfYear, t) = ((year - 1) * 364 + (dayOfYear - 1)) * 720 + t`.

#### §3.1.2 Game date format

| Use | Format | Example |
|---|---|---|
| Canonical (engine, logs, API, court citations) | `G{year:04}-{month:02}-{dayOfMonth:02}T{hh:mm}` + `#{tick}` | `G0003-05-14T16:00#541,440` |
| Tick citation (court, support) | `T{tick}` | `T541440` |
| Display, long | `{Weekday} {dayOfMonth} {Month} Y{year}, {hh:mm} ET` | `Tue 14 May Y3, 22:00 ET` |
| Display, short (lists) | `{dd} {Mon} Y{year}` | `14 May Y3` |
| Display, relative | `in 3 game days (3 h)` / `2 ticks` | always show real-time equivalent in brackets for durations ≥ 1 game hour |
| Chapter | `Chapter {n}, day {dayOfChapter}` | `Chapter 2, day 410` |

`hh:mm` in canonical form is **canonical game time** = `minuteOfDay` (00:00 at t = 0). `ET` ("Exchange Time") in display form = canonical game time + `PARAM.display_clock_offset_min` (DEFAULT 360 minutes, Mathis may override). With the default, the trading day reads: pre-market 06:00 to 07:58, opening auction 08:00 (matching the old 01 §1 "08:00 open"), continuous session 08:02 to 23:58, closing auction 00:00, after-hours 00:02 to 05:58, and the **business date rolls at 06:00 ET**, the way an FX value date rolls at a fixed hour. All rules in this specification, including 00 §5.1 ("FX closed Sat 00:00 to Sun 22:00 game time"), are written in **canonical game time**; the offset is cosmetic and never enters the engine. Per-bloc time-zone labels (`blocLabelOffsetMin`, 22) are also cosmetic (00 §5.1).

#### §3.1.3 Two clocks and how "real hours" are converted

- **World clock** = ticks. Every simulation duration (cooldowns, protection windows, Held, hidden-session accrual, scan cadences, contract deadlines, loan terms, offline caps) is stored as a tick count. Any rule in the original vision written in "real hours" converts at **1 real hour = 720 ticks**, "real day" = 17,280 ticks, "real week" = 120,960 ticks. Example: the 72-real-hour new-player protection (00 §5.9) = 51,840 ticks; Held 6 h = 4,320 ticks; a T1 auto-scan every 24 h = 17,280 ticks.
- **Wall clock** = UTC, used only for account-level rules that are about the human, not the world: login recency for inactive/dormant/estate status (14 days, 30 days, 90 days, 02-multiplayer §3.7), the rewarded-ad daily cap measured on the player's local day (L12, 21), account age for anti-fraud caps (15), session-time telemetry. The wall clock enters `step()` only as `TickHeader.sealUtcMs` (a recorded input), so replay is deterministic.
- Consequence: if the world is halted or re-anchored (§3.19, §3.20), world-clock durations pause with it (no one loses protection or Held time to an outage), while wall-clock rules keep running (a player who does not log in for 30 real days is still dormant).

### §3.2 Holiday calendar per bloc

Each bloc's equity exchange observes holidays. On a holiday of bloc B: every instrument whose `listingExchange` is B's exchange (equities, ETFs, listed bonds, listed options on them) has no auctions all day; pending orders on them stay queued for the next business day; FX pairs that include B's currency still trade but NPC liquidity depth on them is multiplied by `PARAM.holiday_fx_depth_mult` (DEFAULT 0.5); crypto, perps and 24h futures are unaffected; accruals still post (interest accrues every calendar day, §3.4); scheduled events of B (earnings, central-bank meetings, auctions of sovereign debt, rating reviews) are never scheduled on B's holidays (owners 04, 06, 09 must call `isBusinessDay`).

**Holiday table (DEFAULT, Mathis may override; names in 22).** Every game year has the same holidays because every year starts on a Monday. All dates are weekdays and none is a quarter's first or last day.

| Holiday id | Blocs | Day of year | Weekday | Month/day |
|---|---|---|---|---|
| `hol_GENESIS` (Genesis Day) | all five | 1 | Mon | Jan 1 |
| `hol_PYN_TIDE` (Tide Festival) | PYN | 39 | Thu | Feb 11 |
| `hol_SRL_CARNIVAL` (Carnival Monday) | SRL | 50 | Mon | Feb 22 |
| `hol_FDL_CHARTER` (Charter Day) | FDL | 60 | Thu | Mar 4 |
| `hol_NKR_ICEBREAK` (Ice Break) | NKR | 95 | Thu | Apr 4 |
| `hol_EUN_COMPACT` (Compact Day) | EUN | 129 | Wed | May 10 |
| `hol_NKR_ALLIANCE` (Alliance Day) | NKR | 156 | Tue | Jun 9 |
| `hol_EUN_MIDSUMMER` (Midsummer Fair) | EUN | 177 | Tue | Jun 30 |
| `hol_PYN_LEAGUE` (League Day) | PYN | 186 | Thu | Jul 4 |
| `hol_SRL_COALITION` (Coalition Day) | SRL | 213 | Wed | Aug 3 |
| `hol_FDL_HARVEST` (Harvest Day) | FDL | 236 | Fri | Aug 26 |
| `hol_PYN_MOON` (Moon Market) | PYN | 271 | Fri | Sep 33 |
| `hol_SRL_SUNFEAST` (Sun Feast) | SRL | 299 | Fri | Oct 26 |
| `hol_EUN_LANTERN` (Lantern Day) | EUN | 318 | Wed | Nov 17 |
| `hol_NKR_LONGNIGHT` (Long Night) | NKR | 344 | Mon | Dec 15 |
| `hol_FDL_FOUNDERS` (Founders' Eve) | FDL | 352 | Tue | Dec 23 |

So each bloc has 4 closed weekdays per game year (Genesis Day plus 3 of its own): 256 trading days per bloc per game year. Because the game week is 7 real hours and a real day is 24 game days, holidays fall at a different real hour every real day; every bloc's holiday is visible to every real-world time zone over a week.

Functions (pure, in `@tycoon/engine/calendar`):

```ts
isTradingDay(bloc, dayIndex): boolean   // weekday < 5 && !holiday(bloc, dayOfYear)
isBusinessDay = isTradingDay            // alias used by 04, 06, 07, 09
nextTradingDay(bloc, dayIndex): number  // smallest d > dayIndex with isTradingDay
adjustModifiedFollowing(bloc, dayIndex): number // next trading day unless that crosses a month end, then previous
tradingDaysBetween(bloc, d0, d1): number
```

Coupon, dividend and maturity dates that fall on a non-trading day for the paying instrument's bloc use **modified following** (`adjustModifiedFollowing`).

### §3.3 Sessions per product family

The phase clock is identical in all blocs (00 §5.1). Sessions per product family:

| Product family | Mon–Fri PRE_MARKET (t 0–59) | OPEN_AUCTION (60) | CONTINUOUS (61–539) | CLOSE_AUCTION (540) | AFTER_HOURS (541–719) | Weekend | Bloc holiday |
|---|---|---|---|---|---|---|---|
| Equities, ETFs, listed bonds, listed options, IPO books | orders queue, no matching | uniform-price auction | batch auction every tick | uniform-price auction, sets official close | closed (orders queue) | closed | closed |
| FX spot, forwards, swaps | trades every tick | trades | trades | trades | trades | closed from Sat t=0 to Sun t=660 (Sun 22:00 game time) | trades, depth × 0.5 |
| Futures and perps on 24h products (crypto, FX, compute, energy) | trades | trades | trades | trades | trades | perps and crypto futures trade 24/7; FX futures follow FX | trades |
| Futures on bloc-listed underlyings (equity index, bonds) | closed | trades from 60 | trades | trades, daily settlement price at 540 | closed | closed | closed |
| Commodities (spot and futures) | trades | trades | trades | trades | trades | closed Sat, Sun (except compute, energy: 24/7) | trades |
| Crypto spot and DeFi pools | 24/7 every tick | | | | | 24/7 | 24/7 |
| Real estate listings, business exchange, auction house | settle at any tick (listing mechanics in 09, 10, 06) | | | | | open | open |
| OTC/RFQ (06) | any tick where the underlying's family trades | | | | | | |

The opening and closing auctions are single ticks; the continuous session is a sequence of per-tick batch auctions (05 owns the auction). "Official close" for marks and index values = the closing-auction clearing price at t = 540 (05). For 24h products the "daily mark" is the uniform price at t = 719 (day close).

### §3.4 What happens at each boundary

Boundary hooks run in **P2 calendar** of the tick where the boundary occurs. Two kinds exist: **end-of-period hooks** run at the period's last tick (`t = 719` of its last day), after P0/P1 but before P3; **start-of-period hooks** run at `t = 0` of the period's first day. When several periods end at the same tick, end hooks run **innermost first** (hour, day, week, month, quarter, year, chapter); when several start, start hooks run **outermost first** (chapter, year, quarter, month, week, day, hour). Inside one hook, owners run in module-number order (03, 04, 05, …, 16), then entities in sorted id order.

Note on accruals: 00 §5.1 says accruals post at day close (t = 719). The day-close hook therefore runs in P2 of t = 719, but the accrual **postings** are queued to P13 like every posting (00 §5.2 rule). Macro (04) runs at day close inside P2 so its new state is visible to P3–P12 of t = 719 and to every later tick.

| Boundary | When (tick of day) | What happens (owner) |
|---|---|---|
| **Tick** | every tick | full pipeline P0–P14; per-tick price model, auctions, margin checks, hidden-session accrual, contract checks |
| **Game hour** (30 ticks) | `t mod 30 == 0` starts an hour | business operations run for the entities whose `stagger = fnv1a32(entityId) mod 30` equals `t mod 30` (09, 10, 11): every business, property and lab runs once per game hour, 1/30 of them each tick. Board read models refresh at `t mod 30 == 29` (15). Order-book candles at 1 game hour close (19) |
| **Phase change** | t = 0, 60, 61, 540, 541 | 05 switches session state for each product family per §3.3; `core.phase.changed` event; opening and closing auctions at 60 and 540; official close at 540 |
| **Day start** | t = 0 | holiday flags for the day; schedule of the day's events materialized (earnings at fixed ticks, CB statements) (04, 06, 16); daily DU budgets reset (11); daily caps reset that are world-clock based (P2P daily limits, 15) |
| **Day close** | t = 719 | (1) 03: accrual hook: interest, rent, wages, fees, depreciation accrue for the calendar day (all seven days of the week); (2) 03: daily mark-to-market REVALUE of liquid positions at the day's official marks; (3) 04: macro step for every bloc (regime, output gap, inflation, policy-rate path, FX fundamentals, fiscal flows); (4) 07: bank capital and liquidity ratios, deposit-confidence update; (5) 08: fund NAV strike, ETF creation/redemption settlement, insurance reserving; (6) 03: Stabilizer daily measurement and lever update (03 §3.7), MSI update; (7) 05: daily statistics (ADV, realized vol), surveillance score per player per game day (05, consumed by 13); (8) 15: daily filings deadlines checked; (9) 02: snapshot of every partition after commit (§3.16) |
| **Week start** | Monday t = 0 | league week roll (15), weekly AI tournament seed published (11), weekly rumor budget (16) |
| **Week end** | Sunday t = 719 | weekly statements for players (While-You-Were-Away weekly digest, 17), league results (15) |
| **Month end** | last day of month t = 719 | 03: monthly close of every entity's books (management statements), property tax and other monthly taxes become payable (03 §3.12), monthly rents settle (10), loan amortization schedule payments due (07) |
| **Quarter start** | first day t = 0 | earnings season calendar opens (06/09: listed companies report over the first 4 weeks of the quarter on fixed days per company) |
| **Quarter end** | last day t = 719 | 03: quarterly close, quarterly tax installments payable, published statements for listed companies queued (09); 15: top-200 NWI holdings reports cut (published 1 game week later, 02-multiplayer §8.3); 08: fund quarterly fees and performance fees crystallize; 04: quarterly GDP print scheduled for 2 game weeks later |
| **Year end** | Dec 35 t = 719 | 03: annual close (P&L to retained earnings), annual tax assessment computed (payable within 7 game days), loss carry-forwards rolled; 08: annual audits of funds; 09: annual reports; 06: rating agencies' annual reviews are scheduled in the following quarter; 16: world-history yearbook entry |
| **Chapter start** | first tick of chapter | 02: new RNG epoch (§3.11.4); 15: seasonal ladders start, NW_start captured; 10: concession re-auctions open; 21: rule patches with `VERSION_CUTOVER` at the boundary take effect |
| **Chapter end** | last tick of chapter | 15: ladders settled, Hall of Fame, titles; 10: concession auctions close; 02: CHAPTER snapshot kept forever; 03: chapter money-supply report published (the diegetic "Stabilizer and Exchange report") |

Business-day-only rules: a module that wants a business-day cadence (dividend payment, coupon payment, loan payment due date) must call `adjustModifiedFollowing` for the relevant bloc; accrual itself is always calendar-daily (Act/364 day count, 03 §3.3.7).

### §3.5 The tick pipeline in full

#### §3.5.1 Phases, owners and budgets

The work of one tick must finish inside the 5-second cadence with headroom. **Hard budgets** are per phase, measured as wall time of the slowest partition plus barrier overhead. Their sum is 2,500 ms, which is the p99 target from 02-multiplayer §3.2; the remaining 2,500 ms is **slack** for crash days, quarter ends and chapter boundaries.

| Phase | Name | Runs in | Budget (ms) | Owner | Work |
|---|---|---|---|---|---|
| P0 | ingest | COORD + gateways | 40 | 02/19 | seal intake for tick N, compute `orderKey`, Merkle `intentsRoot`, assemble `TickHeader`, derive `TickEntropy`, broadcast header to all partitions |
| P1 | validate | PLAYER (and FIN/CITY for their own institutional intents) | 150 | each module | per-intent validation in fair order: licenses (13), holds (this file §3.14.3), Held state (13), balances (03), rate limits (19). Valid intents place **holds**; invalid ones are rejected with a reason code (`acct.intent.rejected` event) |
| P2 | calendar | COORD (global hooks) + every partition (local hooks) | 40 (day close: up to 400, taken from slack) | 02, 04 at day close | boundary hooks per §3.4 |
| P3 | world | WORLD | 120 | 16 | living-world scheduler: event triggers, causal news generation, named-actor decisions (which then queue NPC intents for P4) |
| P4 | npc | MARKET (liquidity), WORLD (actors), FIN (NPC institutions) | 150 | 05, 16 | NPC liquidity quotes and orders; NPC actor orders; validated with the same P1 rules inline |
| P5 | ai | PLAYER (worker pool) | 600 | 11 | player AI strategy graphs inside DU budgets (RESOLVED-NUMBERS A1 + C3a: 2,000 DU/tick per player, 3.0M DU/tick per partition); AI intents validated inline with P1 rules and place holds |
| — | barrier B1 | bus | (inside P5/P6 budgets) | 02 | route orders to MARKET, business/property intents to CITY, institutional intents to FIN, conflict intents to the target's PLAYER partition |
| P6 | match | MARKET | 300 | 05, 06 | per-asset uniform-price batch auctions, OTC/RFQ fills |
| — | barrier B2 | bus | | 02 | route fills to the owners' partitions and to FIN (CCP) |
| P7 | clear | FIN (CCP) + PLAYER (per-account margin) | 200 | 07 | CCP novation, initial and variation margin, margin-call detection; liquidations **found** in tick N become liquidation orders in tick N+1 (§3.5.4) |
| P8 | finance | FIN + PLAYER | 200 | 07, 08 | banking (payments, intraday liquidity), repo, lending, fund NAV intraday estimate, insurance, structured products |
| P9 | real | CITY | 200 | 09, 10 | hourly-staggered business and property operations, supply chains, city growth |
| P10 | conflict | PLAYER (victim side) | 80 | 12 | op resolution, hidden-session accrual, scans, detection rolls, clue emission |
| P11 | law | COORD (dockets) + PLAYER | 40 | 13 | investigations, filings, court progress, sanctions application |
| P12 | social | PLAYER + COORD | 80 | 14, 15 | contracts engine checks, alliances, reputation, prestige, boards inputs |
| — | barrier B3 | bus | | 02/03 | exchange cross-partition posting legs and next-tick consequence messages |
| P13 | ledger | every partition, then COORD | 200 | 03 | commit all postings of the tick atomically, settle or release holds, assert invariants (03 §3.16), compute partition `stateHash`; COORD checks global invariants and writes the `TickRecord` (two-phase commit, §3.15) |
| P14 | emit | every partition + gateways | 100 | 02, 19 | events to the event store, deltas to clients, snapshot if due (written asynchronously after commit, off the critical path) |
| | **total** | | **2,500** | | slack 2,500 ms |

Ruling (24): the per-phase **wall budgets** in force for operations, overrun telemetry and the scheduler are 19 Rule 3.3.3's `PARAM.phase_budget_ms_P0 … P14` (P3 = 200 ms; sum 4,250 ms, slack 750 ms). The column above is the p99 **compute design target** per phase; its sum, 2,500 ms, is the p99 tick-work target that 20 tests (20 AT 30). Neither aborts a tick.

Budget enforcement:

1. Each partition measures every phase. Exceeding a phase budget never aborts the tick (results must be deterministic, and aborting on time would make them time-dependent). Instead it raises `core.budget.overrun` telemetry and the scheduler (§3.19) absorbs the delay.
2. **Deterministic load shedding** exists only where the owning module defines it from state, never from measured time: the AI phase scales DU budgets proportionally when the sum of requested DU exceeds the per-partition cap (11, RESOLVED-NUMBERS A1); business operations are already staggered; news generation has a per-tick template budget (16). These rules use counts, not milliseconds, so they are replayable.
3. If p99 tick work over the last 720 ticks exceeds 3,500 ms, ops is paged (19) and the partition planner adds partitions at the next daily snapshot boundary (§3.14.5).

#### §3.5.2 System rule (from 00 §5.2, restated with detail)

- A phase may read: (a) any state committed by earlier ticks; (b) outputs of earlier phases of the same tick that are visible to its partition (local outputs, or messages delivered at a barrier).
- A phase writes only: its own module's entities in its own partition, events, outgoing partition messages, and **posting requests** queued for P13.
- Money and asset balances seen during P1–P12 are **pre-tick balances minus holds plus intra-tick provisional changes the owning module tracks itself**. The ledger balance itself changes only in P13. A module that needs "cash available now" calls `ledger.available(account)` = committed balance − active holds (03).
- Postings never commit before P13. If P13 fails, nothing of the tick exists (§3.15).

#### §3.5.3 How phases run across partitions (rounds and barriers)

Partitions are single-writer and run their own slice of each phase. The coordinator drives the tick in **rounds** separated by **barriers**; inside a round, partitions run in parallel and never talk to each other.

```
Round R0 (COORD):           P0 seal -> broadcast TickHeader + TickEntropy
Round R1 (all partitions):  P1 validate+hold (PLAYER), P2 local hooks,
                            COORD P2 global hooks, WORLD P3, MARKET/WORLD/FIN P4, PLAYER P5
Barrier B1:                 deliver 'route.*' messages produced in R1
Round R2 (MARKET, CITY*):   P6 match ; (*CITY runs nothing yet)
Barrier B2:                 deliver 'fill', 'mark' messages
Round R3 (all):             FIN+PLAYER P7, FIN+PLAYER P8, CITY P9, PLAYER P10, COORD+PLAYER P11, PLAYER+COORD P12
Barrier B3:                 deliver 'posting.leg', 'hold.settle', and buffer 'NEXT' messages for tick N+1
Round R4 (all):             P13 prepare: apply postings, settle/release holds, local invariants, stateHash
Round R5 (COORD):           P13 decide: global invariants, write TickRecord, broadcast COMMIT or ABORT
Round R6 (all):             P13 commit (pointer swap) ; P14 emit
```

Rules:

1. Messages are delivered at a barrier **sorted by (fromPartition, seq)** using byte order of the partition id string; the receiving partition processes them in that order. Network timing can never change the order.
2. Messages produced in R3 with `round = 'NEXT'` are consequences: they are stored in the receiving partition's inbox and processed at the start of R1 of tick N+1, before any intent of N+1 (in sorted order). Examples: liquidation orders found in P7, a hidden session opened by a breach resolved in P10, a court-ordered freeze from P11, a contract payment due from P12.
3. A partition that has nothing to do in a round still reports `done` at the barrier.
4. In single-process deployments (launch), all partitions share one process and barriers are function returns; behaviour and hashes are identical to multi-machine deployments.

#### §3.5.4 "Consequences land next tick"

Everything that a later phase of tick N discovers and that would require new matching, new validation or new holds becomes an input of tick N+1. This is the single rule that keeps cascades ordered and replayable (02-multiplayer §3.2). Complete list of cross-tick consequence kinds (each owner defines payload):

| Consequence | Produced in | Executed in tick N+1 phase |
|---|---|---|
| Liquidation order (margin call not met) | P7 | P1 (bypasses rate limits; channel `SYSTEM`) |
| Default-waterfall step | P7 | P7 |
| Bank-run withdrawal wave (deposit flight computed from confidence) | P8 | P8 |
| Hidden session opened | P10 | P10 |
| Freeze / Held start (after 1 game-day grace, 13) | P11 | P1 (validation reads it) |
| Contract scheduled payment, option exercise, penalty | P12 | P1 (as SYSTEM intents) |
| Corporate action effective (split, dividend ex-date) | P2 | P2 |
| News publication to clients | P3 (generated) | delivered to clients at P14 of N, after N+1's intake is already open (02-multiplayer §3.2) |

### §3.6 The pure `step()` contract

#### §3.6.1 Signatures

```ts
// One partition's slice of one tick. Pure: no I/O, no clock, no randomness except via `entropy`.
function stepPartition(
  state: PartitionState,          // immutable input (persistent data structures, copy-on-write)
  header: TickHeader,             // sealed header of tick N
  entropy: TickEntropy,           // derived in P0 (§3.11.2)
  intents: SealedIntent[],        // this partition's intents of tick N, already fair-ordered
  inbox: PartitionMessage[],      // 'NEXT' messages from tick N-1, sorted
  deliver: (round: 'B1'|'B2'|'B3') => PartitionMessage[] // barrier callback, returns sorted messages
): PartitionStepResult;

interface PartitionStepResult {
  state: PartitionState;          // new state (not yet committed)
  postings: Posting[];            // committed in P13 if the tick commits (03)
  events: EngineEvent[];          // 00 §5.6
  outboxNext: PartitionMessage[]; // consequences for N+1
  deltas: ClientDelta[];          // 19 protocol
  metrics: PartitionMetrics;      // counts only (no timings), part of the hash
  invariantReport: InvariantResult[]; // 03 §3.16, local invariants
  stateHash: Hash32;
}

// The logical world step = coordinator orchestration of all partitions (§3.5.3).
function stepWorld(world: WorldState, sealed: SealedTickInput): WorldStepResult;
interface SealedTickInput { header: TickHeader; intents: SealedIntent[]; entropySecret: Hash32 }
```

`stepWorld` is what the harness (20), replay (§3.17) and the single-process server call. It must give exactly the same result as the distributed execution.

#### §3.6.2 Obligations of every module inside `step()`

1. No reading of `Date`, `performance`, `process.hrtime`, environment variables, files, network, timers, `Math.random`, `crypto.getRandomValues`, or any global mutable state.
2. Randomness only from the module's own RNG streams (§3.10).
3. Money only through ledger posting requests (00 §5.4); quantities of assets only through the ledger's asset postings (03).
4. IDs only through `newId(kind)` (§3.13).
5. Floats only through the rules of §3.7 and the `dmath` library (§3.8); conversions to money only through `toMoney` and the fixed-point helpers (§3.9).
6. Iteration only over sorted collections (§3.7.3).
7. No exceptions for control flow. A module that detects an impossible state returns an `InvariantResult { ok: false }` and does not throw; `step()` itself catches any thrown error, converts it to a failed invariant `I0 (uncaught)` naming the module and entity, and the tick goes to safe mode (§3.15).
8. Bounded work per tick: every loop over entities must be bounded by state size; no unbounded retries; rejection sampling is forbidden (§3.10.5).

#### §3.6.3 State structure

`PartitionState` is a tree of `SortedMap<string, Entity>` per entity kind and module, using a persistent (structurally shared) B-tree so a tick can produce a new state without copying everything, and the previous state stays intact until commit (this is what makes rollback free, §3.15.2). Each entity carries a cached `entityHash` recomputed when the entity is written; the partition `stateHash` is the root of a Merkle tree over `(kindTag, entityId, entityHash)` sorted by `kindTag` then `entityId` (byte order). Only dirty entities are rehashed each tick.

### §3.7 Determinism rules (coding standard for `@tycoon/engine`)

#### §3.7.1 Forbidden inside the engine package (enforced by lint rule `tycoon/deterministic` and a CI import scan)

| Forbidden | Use instead |
|---|---|
| `Date`, `Date.now()`, `new Date()`, `performance.now()` | `header.tick`, `header.sealUtcMs` |
| `Math.random()`, `crypto.*` random | RNG streams (§3.10) |
| `Math.exp/log/pow/sin/cos/tan/atan2/cbrt/hypot/expm1/log1p/sinh/...` | `dmath.*` (§3.8). Allowed native: `Math.sqrt`, `Math.abs`, `Math.floor`, `Math.ceil`, `Math.trunc`, `Math.min`, `Math.max`, `Math.sign`, `Math.fround`, `Math.imul`, `Math.clz32` (all IEEE-exact) |
| `Math.round` | `roundHalfEven` (§3.9.1) (`Math.round` rounds half up, which differs from the money rule) |
| Iterating `Object.keys/values/entries`, `for...in`, plain objects as maps | `SortedMap` / `SortedSet` |
| `Map`/`Set` iteration (insertion order) unless insertion order is itself deterministic and documented | `SortedMap` |
| `Array.prototype.sort` without an explicit total comparator | `sortBy(arr, keyFn)` with a total order and id tie-break |
| `localeCompare`, `toLocaleString`, `Intl.*` | byte-order comparison `cmpStr(a, b)` on UTF-16 code units |
| `JSON.stringify` for hashing or persistence | canonical encoder `canon.encode` (§3.16.2) |
| `Number` for money or quantities, any float -> bigint conversion other than `toMoney`/`toQty` | `Money`, `Qty`, `Price` bigints and §3.9 helpers |
| `async`, `await`, Promises, callbacks with timers inside `step()` | synchronous code |
| `WeakMap`, `WeakRef`, `FinalizationRegistry` | explicit maps |
| `Atomics`, `SharedArrayBuffer` inside a partition | message passing at barriers |
| Floating-point reductions across worker threads without a fixed tree | `orderedReduce(chunks, fn)` with chunk boundaries fixed by entity id ranges |
| Reading another partition's state | messages at barriers |

#### §3.7.2 Float rules

1. All model math uses IEEE-754 binary64 (`number`). No `Math.fround` except where a module documents float32 storage.
2. **NaN and Infinity are illegal states.** Every value written to persistent state passes `assertFinite(x, ctx)`; a violation is invariant `I0.nan` for that entity (safe mode, §3.15). Division helpers `safeDiv(a, b, fallback)` must be used where `b` can be 0.
3. `-0` is normalized to `+0` when written to state (`x === 0 ? 0 : x`), because canonical encoding distinguishes them.
4. Summation order is the iteration order of the sorted collection. Where a sum is large and precision matters (aggregates of thousands of floats), use `kahanSum` (a fixed algorithm, deterministic).
5. Floats persisted in state are stored as their exact 8-byte IEEE bit pattern (never as decimal text), so a snapshot round-trip is bit-exact.
6. Comparisons of floats used for branching must use the exact value (no epsilon tricks that vary by path); thresholds are parameters.
7. Integers larger than `2^53 - 1` are always `bigint`.
8. Floats never enter the ledger. Conversion at the ledger boundary only through §3.9.

#### §3.7.3 Iteration order and sorting

- Canonical order of entities: by `kindTag` (fixed list order in 03 §2.1: `sys, cbk, gov, reg, crt, exc, ccp, rat, bnk, ins, fnd, spv, cmp, biz, prop, ali, npc, hh, frm, row, chr`) then by id byte order.
- Intents within a tick: by `orderKey` (§3.12). Messages: by `(fromPartition, seq)`.
- Orders inside a batch auction: 05 defines the full priority (price, then `orderKey`), never arrival time.
- Ties anywhere are broken by entity id, then intent id.
- Stable sort only.

#### §3.7.4 Hashing

- SHA-256 everywhere (state hashes, Merkle roots, entropy, IDs, stream keys). Implementation pinned in the engine bundle (no platform crypto inside `step()`; a pure-JS or WASM SHA-256 with test vectors).
- `fnv1a32(str)` is used only for staggering (`hash(id) mod 30`, 00 §5.1) and for bucket assignment; never for security.

#### §3.7.5 Engine pinning

- The engine bundle (code + `dmath` + canonical encoder) is content-addressed (`engineVersion` = SHA-256 of the bundle). The Node.js major version is pinned per engine version (19). Because `dmath` uses only IEEE-exact operations, outputs are identical across CPUs and Node versions; pinning is defence in depth.

### §3.8 Deterministic math library (`dmath`)

`dmath` implements every transcendental function from `+ - * /` and `Math.sqrt` only, with fixed argument reduction and fixed polynomial or rational approximations, so results are bit-identical everywhere. Required functions and accuracy targets (max error in ULPs over the stated domain; test vectors in 20):

| Function | Domain | Method (fixed) | Max error |
|---|---|---|---|
| `exp(x)` | [-745, 709] | reduce `x = k ln2 + r`, `|r| <= ln2/2`, degree-13 Taylor/Horner on r, scale by `2^k` via exponent bit construction | 2 ULP |
| `ln(x)` | (0, +inf) | split mantissa/exponent from bits, `m` in [sqrt(1/2), sqrt(2)), `s = (m-1)/(m+1)`, odd series to s^21 | 2 ULP |
| `log2(x)`, `log10(x)` | (0, +inf) | `ln(x) * const` | 3 ULP |
| `pow(x, y)` | x > 0 | `exp(y * ln(x))` with extra-precision product (Dekker two-product) | 4 ULP |
| `sin, cos` | [-1e6, 1e6] | Cody-Waite reduction by pi/2 (3-part constant), minimax polynomials | 2 ULP |
| `atan2, atan` | all | reduction to [0, tan(pi/12)] + series | 3 ULP |
| `tanh, sigmoid` | all | from `exp`; `sigmoid(x) = 1/(1+exp(-x))`, symmetric form for x < 0 | 3 ULP |
| `erf, erfc` | all | W. J. Cody rational approximations | 4 ULP |
| `normCdf(x)` | all | `0.5 * erfc(-x / sqrt2)` | 4 ULP |
| `normInv(p)` | (0,1) | Wichura AS241 (PPND16) | 1e-15 relative |
| `lgamma(x)` | x > 0 | Lanczos g=7, n=9 | 1e-14 relative |
| `expm1, log1p` | all | dedicated series near 0 | 2 ULP |

Additional fixed algorithms in `dmath`: `kahanSum`, `clamp`, `lerp`, Black–Scholes price and greeks (06 uses them; implemented on `dmath.normCdf`), `solveBisection(f, a, b, iters)` with a **fixed iteration count** (never "until converged"), `newton(f, df, x0, iters)` with fixed iteration count, matrix ops for small dense matrices (Cholesky for correlation, fixed loop order). Any new math function must be added to `dmath` with test vectors before a module uses it.

### §3.9 Fixed-point and money conversion

#### §3.9.1 `roundHalfEven`

```ts
// x finite float. Returns the nearest integer as a float, ties to even. Exact for |x| < 2^53.
function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;                       // exact for |x| < 2^52
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return (f % 2 === 0) ? f : f + 1;      // tie
}
```

#### §3.9.2 `toMoney(x, ccy)`, the only float-to-money conversion (00 §3.1)

```ts
const MICRO = 1_000_000;
function toMoney(x: number, ccy: Ccy): Money {
  assertFinite(x, 'toMoney');
  const v = x * MICRO;                    // one IEEE multiply, deterministic
  if (Math.abs(v) < 9_007_199_254_740_992) {         // 2^53
    return BigInt(roundHalfEven(v));
  }
  return BigInt(v);                       // |v| >= 2^53 is already an integer-valued float
}
```

Notes for builders: (a) `x` is in whole currency units (dollars), the result in micro-units; (b) above $9.007 billion the float itself cannot represent single micro-units, so the precision of a float-sourced amount is the float's precision (about 1e-16 relative). This is accepted because model outputs are approximations; **exact** money arithmetic never goes through floats (§3.9.3). (c) `ccy` is carried for assertion and for the posting; there is no per-currency scale (all currencies are micro-units).

Companions: `toQty(x, asset)` converts a float quantity to the asset's lot integer using the same rounding, then rounds **toward zero** to a whole lot when the module asks for `lotFloor`. `toPrice(x)` converts to `Price` micro-units with half-even. `fromMoney(m): number` = `Number(m) / 1e6` is allowed only for model inputs (never written back without `toMoney`).

#### §3.9.3 Exact bigint helpers (all in `@tycoon/engine/fixed`)

| Helper | Formula | Use |
|---|---|---|
| `divRoundHalfEven(n, d)` | bigint division rounded half to even, d > 0 | base of all below |
| `mulRate(m, rateE6)` | `divRoundHalfEven(m * rateE6, 1_000_000n)` | fees, taxes, rates stored as integer bp×100 (1e-6), 00 §3.1 |
| `mulRateE12(m, rateE12)` | `divRoundHalfEven(m * rateE12, 10n**12n)` | per-tick or per-day factors where 1e-6 is too coarse |
| `accrue(m, annualRateE6, days)` | `divRoundHalfEven(m * annualRateE6 * BigInt(days), 1_000_000n * 364n)` | daily interest, Act/364 (03 §3.3.7) |
| `notional(qty, price, lotSize)` | `divRoundHalfEven(qty * price, lotScale(asset))` | value of a quantity at a price |
| `fxConvert(m, rateE6)` | `divRoundHalfEven(m * rateE6, 1_000_000n)` where rate = units of target per unit of source, micro | currency conversion |
| `allocate(total, weights[])` | largest-remainder: `base_i = floor(total * w_i / W)`; distribute the remainder `total - Σbase` one unit each to the largest fractional remainders, ties by entity id byte order | dividends, pro-rata payouts, waterfalls, fine splits (85/10/5): the parts **always** sum exactly to the total |
| `proRata(total, holdings: Map<id, Qty>)` | `allocate` with integer weights | any pro-rata distribution |

Rule: whenever money is split into parts, use `allocate`; never compute parts independently and hope they add up.

### §3.10 RNG streams

#### §3.10.1 Generator: xoshiro128** (kept from 01 §2.1)

State `s[0..3]` uint32, never all zero.

```ts
function next(s: Uint32Array): number {            // returns uint32
  const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
  s[2] ^= t;
  s[3] = rotl(s[3], 11);
  return result;
}
function rotl(x: number, k: number) { return ((x << k) | (x >>> (32 - k))) >>> 0; }
```

#### §3.10.2 Seeding

On creation, or at the start of a new epoch (§3.11.4), a stream is seeded:

```
seedBytes = SHA-256('TYC/rng' || epochRoot(root, epoch) || key)
s[i]      = uint32 little-endian of seedBytes[4i .. 4i+3], i = 0..3
if s is all zero: s[0] = 0x9E3779B9
then discard the first 8 outputs (warm-up)
```

Adding a new stream never changes any other stream (01 §2.1 requirement), because each stream's seed depends only on its own key.

#### §3.10.3 Lazy per-tick entropy mixing

The first time a stream is drawn from in tick N (when `lastMixedTick < N`):

```
k = entropy.words
s[0] ^= k[0] ^ keyHash[0]
s[1] ^= k[1] ^ keyHash[1]
s[2] ^= k[2] ^ keyHash[2]
s[3] ^= k[3] ^ keyHash[3]
if s is all zero: s[0] = 0x9E3779B9
discard 4 outputs; lastMixedTick = N
```

Cost: a few nanoseconds per stream per tick (no hashing per tick). Effect: even someone who learned a stream's state could not predict its draws in a future tick, because they depend on that tick's entropy, which no one knows in advance (§3.11).

#### §3.10.4 Stream registry (every stream in the game)

Key format `<module>.<purpose>[:<subjectId>]`. `root` column: P = PUBLIC epoch root (revealable after expiry, §3.11.4), S = SECRET root (never revealed: the stream produces information that must stay hidden for the life of the world). A module may not draw from another module's stream. A module that needs a new stream adds a row here (19 CI rejects unknown keys).

| Module | Stream key | Root | Used for |
|---|---|---|---|
| 02 | `core.genesis:<subsystem>` | S | genesis-time generation of anything not authored (fallback; most content uses 22's generators below) |
| 03 | `ledger.audit_sample:<bloc>` | S | selection of entities for tax audits by probability (03 §3.12.10) |
| 04 | `macro.global_regime` | P | global regime transitions |
| 04 | `macro.regime:<bloc>` | P | bloc regime Markov transitions |
| 04 | `macro.shock:<bloc>` | P | GDP, inflation, unemployment shocks |
| 04 | `macro.cb_decision:<cbk>` | P | meeting-decision noise around the rule |
| 04 | `macro.cb_personality:<cbk>` | S | hidden hawkishness trait drift (01 §5.4) |
| 04 | `macro.fiscal:<gov>` | P | fiscal surprises, auction cover noise |
| 04 | `macro.fx:<pair>` | P | FX fundamental noise |
| 04 | `macro.crisis` | P | crisis trigger draws (rates set by 04) |
| 04 | `macro.sovereign_event:<gov>` | P | downgrade, restructuring triggers |
| 05 | `mkt.factor:<factorId>` | P | factor returns (global, sector, region, rates, risk appetite, FX, crypto) |
| 05 | `mkt.idio:<assetId>` | P | idiosyncratic Student-t(4) noise |
| 05 | `mkt.jump:<assetId>` | P | Kou jumps (occurrence, sign, size) |
| 05 | `mkt.npc_flow:<assetId>` | P | NPC liquidity order-flow noise |
| 05 | `mkt.lp_quote:<assetId>` | P | NPC quote width and depth jitter |
| 05 | `mkt.earnings:<cmpId>` | S | earnings surprise drawn before release (secret until published) |
| 05 | `mkt.corp_action:<cmpId>` | P | NPC corporate-action decisions (buybacks, splits) |
| 05 | `mkt.surveillance_sample` | S | random sampling for surveillance reviews |
| 06 | `ast.crypto_hype:<tokenId>` | P | hype process |
| 06 | `ast.depeg:<stableId>` | P | depeg triggers |
| 06 | `ast.commodity:<cmdtyId>` | P | supply/demand shocks, weather |
| 06 | `ast.credit_event:<issuerId>` | P | default draws from hazard rates |
| 06 | `ast.recovery:<issuerId>` | P | recovery rate on default |
| 06 | `ast.collectible:<categoryId>` | P | collectible index noise, rare finds |
| 06 | `ast.oracle:<oracleId>` | P | oracle update jitter |
| 07 | `bank.deposit_flow:<bnkId>` | P | deposit flow noise |
| 07 | `bank.run:<bnkId>` | P | run cascade draws |
| 07 | `bank.loan_default:<portfolioId>` | P | NPC loan-book defaults |
| 07 | `bank.interbank` | P | interbank funding noise |
| 08 | `fund.npc_flow:<fndId>` | P | NPC investor subscriptions/redemptions |
| 08 | `ins.cat:<peril>:<regionId>` | P | catastrophe occurrence and severity |
| 08 | `ins.claims:<insId>` | P | attritional claims |
| 08 | `spv.pool_default:<spvId>` | P | pool default and prepayment draws |
| 08 | `rat.noise:<ratId>` | P | rating-committee noise |
| 09 | `biz.demand:<cityId>:<sector>` | P | demand shocks per city sector |
| 09 | `biz.event:<bizId>` | P | business events (01 §4.5) |
| 09 | `biz.staff:<bizId>` | P | staff turnover, hiring outcomes |
| 09 | `biz.supply:<chainId>` | P | supplier failures, delays |
| 09 | `biz.npc_entry:<cityId>:<sector>` | P | NPC entrant arrivals |
| 09 | `biz.startup:<cityId>` | P | startup pipeline (power-law outcomes) |
| 09 | `biz.contract:<cityId>` | P | NPC customer contract offers |
| 10 | `re.district:<districtId>` | P | district index shocks |
| 10 | `re.tenant:<propId>` | P | tenant arrival, default, departure |
| 10 | `re.appraisal:<propId>` | P | appraisal noise |
| 10 | `city.gen:<cityId>:<chunk>:<stage>` | S | procedural city generation (06-cities §8.2), fixed once generated |
| 10 | `city.growth:<cityId>` | P | development-point allocation tie-breaks |
| 11 | `lab.train:<runId>` | P | training outcome noise |
| 11 | `lab.eval:<modelId>` | P | evaluation noise on withheld worlds |
| 11 | `lab.incident:<labId>` | P | AI incident draws |
| 11 | `lab.data:<datasetId>` | P | data-quality realization |
| 11 | `lab.tournament:<weekNo>` | P | weekly tournament scenario seed |
| 12 | `ops.resolve:<opId>` | S | op success, detection, attribution rolls |
| 12 | `ops.session:<sessionId>` | S | hidden-session accrual noise and clue timing |
| 12 | `ops.decoy:<chrId>` | S | decoy anomalies (0.05/real hour) |
| 12 | `ops.scan:<chrId>` | S | defense auto-scan detection rolls |
| 12 | `ops.npc_crime:<cityId>` | S | NPC criminal-crew target choice and outcomes |
| 12 | `ops.label:<chrId>` | S | rotating public labels for connection entries (00 §3.2) |
| 13 | `law.evidence:<caseId>` | S | evidence discovery rolls |
| 13 | `law.verdict:<caseId>` | S | verdict uncertainty within bands |
| 13 | `law.investigation_pick:<regId>` | S | regulator queue tie-breaks |
| 14 | `life.event:<chrId>` | P | lifestyle incidents, staff events |
| 14 | `life.club:<clubId>` | P | club invitations, events |
| 15 | `soc.league_assign:<weekNo>` | P | league group assignment |
| 15 | `soc.challenge:<eventId>` | P | challenge-event scenario generation |
| 16 | `world.news:<templateId>` | P | template variant selection |
| 16 | `world.actor:<npcId>` | S | named-actor decision noise and hidden goals |
| 16 | `world.dynasty:<dynastyId>` | S | dynasty internal events, succession |
| 16 | `world.politics:<bloc>` | P | legislative outcomes |
| 16 | `world.secret:<secretId>` | S | secret discovery chances |
| 16 | `world.rumor` | S | rumor truth flags (secret until resolved) |
| 16 | `world.era` | P | technology/era progression timing |
| 21 | `liveops.event:<eventId>` | P | scripted live-event randomization |
| 20 | `sim.bot:<botId>` | (harness seed) | adversarial bots, never in the live world |

UI cosmetics (17) such as particle effects use client-side randomness outside the engine; they never affect state.

#### §3.10.5 Variate generation (fixed draw counts)

Every variate consumes a **fixed number of uint32 draws**, so the sequence of draws is a function of code path only.

| Variate | Algorithm | Draws |
|---|---|---|
| `u53()` uniform [0,1) | `a = next()>>>5; b = next()>>>6; (a*67108864 + b) / 2^53` | 2 |
| `uOpen()` uniform (0,1) | `(u53() * (2^53 - 1) + 0.5) / 2^53` | 2 |
| `int(n)` uniform 0..n-1, n ≤ 2^32 | `floor(u53() * n)` | 2 |
| `bernoulli(p)` | `u53() < p` | 2 |
| `normal()` | `dmath.normInv(uOpen())` | 2 |
| `studentT(nu)` (nu integer ≤ 8) | `z = normal(); chi2 = Σ_{k=1..nu} normal()^2; z / sqrt(chi2/nu)` | 2(nu+1) |
| `exponential(lambda)` | `-dmath.ln(uOpen()) / lambda` | 2 |
| `poisson(lambda)` (lambda ≤ 30) | inverse CDF, one uniform, capped at k = 60 | 2 |
| `kouJump(p_up, eta_up, eta_down)` | sign = `u53() < p_up`; size = `exponential(eta)` | 4 |
| `categorical(weights sorted by key)` | one `u53()` against cumulative weights | 2 |
| `shuffle(array)` | Fisher–Yates from the end, `int(i+1)` per step | 2(n-1) |
| `beta(a, b)`, `gamma` | via `normInv` approximations only where 20 has validated them; otherwise forbidden | fixed |

Rejection sampling, "draw until valid" loops and variable-length Ziggurat methods are forbidden (they make draw counts data-dependent and fragile under refactoring).

#### §3.10.6 Draw discipline

- A module documents, per stream, the order of draws inside a tick. Changing that order is an engine-version change (affects replay only of the new version, §3.18).
- A stream must not be drawn from inside a loop whose length depends on another module's state that can change independently, unless the module accepts the coupling; prefer one stream per subject.
- Per-tick draw counts are part of `PartitionMetrics` (hashed), so divergence is caught at the tick it happens.

### §3.11 Entropy: commit-reveal and epochs

#### §3.11.1 Commit-reveal per tick

- The coordinator keeps a buffer of secrets `e(N)` for future ticks, generated from its cryptographic random source (outside the engine; stored in the secret store, 19).
- **Commit:** `C(N) = SHA-256('TYC/commit' || worldId || N || e(N))` is published in the header of tick `N - PARAM.entropy_commit_lead_ticks` (DEFAULT 720 = 1 game day ahead). Because it is published before tick N's intake opens, the operator is bound to `e(N)` before seeing any intent of tick N.
- **Reveal:** `e(N)` is published in the header of tick `N + PARAM.entropy_reveal_lag_ticks` (DEFAULT 1,000, kept from 02-multiplayer §3.3). Anyone can then check `SHA-256(...e(N)) == C(N)`.
- If the coordinator ever fails to have a committed `e(N)` (bug, failover without the buffer), tick N uses `e(N) = SHA-256('TYC/fallback' || prevTickHash)`, the header flags `entropyFallback = true`, and a public integrity incident is logged (21). The standby coordinator replicates the entropy buffer synchronously, so this should never happen in normal failover.

- Implementation (ruling in 24): 19 §3.12 realises these per-tick secrets with one epoch secret `S_e` per game day, `e(N) = HMAC-SHA-256(S_e, "tick" ‖ N)`; the epoch commitment `C_e` (published at the end of epoch `e−2`, so at least 720 ticks before any tick of epoch `e`) replaces the per-tick `C(N)`, and `S_e` is revealed 1,000 ticks after epoch `e` ends, which is never earlier than `N + 1,000` for any tick `N` of the epoch. The guarantees of this section (bound before intake, reveal no earlier than `N + entropy_reveal_lag_ticks`) are unchanged.

#### §3.11.2 Tick entropy

```
TickEntropy(N).value = SHA-256('TYC/tick-entropy' || worldId || N || e(N) || intentsRoot(N) || worldHash(N-1))
```

Neither the operator (committed to `e(N)` in advance) nor any player (does not know `e(N)`) can steer it. Including `intentsRoot` means even a leaked `e(N)` does not let the operator pre-compute outcomes before intents arrive.

#### §3.11.3 What is public

Each `TickHeader` is public (served by the read API, 19) except that `entropyReveal` appears only after the lag. Players can download headers and verify (a) commit/reveal pairs, (b) that their own intent was included, using a Merkle inclusion proof from `intentsRoot` (the "Receipt" button, §7). They cannot recompute RNG draws because epoch roots (§3.11.4) are secret during the epoch.

#### §3.11.4 Epoch roots (seed rotation)

- **Epoch = chapter number.** Each epoch k has two roots:
  - `publicRoot(k)`: 32 random bytes, committed (`SHA-256`) in the first header of the epoch, **revealed one full chapter after the epoch ends** (in the first header of epoch k+2). After reveal, anyone holding a full replay of public inputs could verify public-root draws; in practice it is used by the integrity report and by independent auditors with replay access (21).
  - `secretRoot`: one per world, never revealed, used by all `S` streams; S streams are re-seeded at each epoch with `SHA-256('TYC/secret-epoch' || secretRoot || k)` as their epoch root.
- At the first tick of epoch k, every stream is re-seeded (§3.10.2) with its epoch root. Streams not yet created are seeded on first use with the current epoch root.
- Rationale: rotation bounds the damage of a leaked seed to one chapter; S streams keep persistent secrets (hidden personality traits, secret archives, hidden-session clue timing) hidden forever even after public roots are revealed.
- The **content seed** used by 22's generators at world genesis (cities, NPC actor rosters, company fundamentals) is part of `secretRoot` derivation and never revealed.

### §3.12 Intent sealing and fair ordering

1. The coordinator broadcasts `SEAL(N)` to all gateways at the scheduled instant (§3.19). Each gateway closes its batch for N when it processes `SEAL(N)`; intents it received earlier go to N, later ones to N+1. Gateways send the batch with a `closed` marker. The coordinator waits up to `PARAM.seal_grace_ms` (DEFAULT 150 ms) for all markers; a gateway that misses the grace has its batch for N **rolled into N+1** in full (never split), and a `core.gateway.late` telemetry event is raised.
2. Validation in P0 (cheap, stateless): signature, envelope schema, `nonce` strictly greater than the actor's last sealed nonce (else `REJECT_REPLAY`), `clientTick >= N - PARAM.intent_max_age_ticks` (DEFAULT 3; older is `REJECT_STALE`, protecting against delayed replays), size limits (19).
3. **Fair order key:** `orderKey = SHA-256('TYC/order' || TickEntropy(N).value || intentId)`. Intents are processed in ascending `orderKey`. Because `TickEntropy(N)` depends on `e(N)`, which nobody knows when submitting, no player can position an intent early or late in the tick by timing, device or connection. Within one actor, intents keep their nonce order: if an actor has several intents, they are placed at the position of the actor's smallest `orderKey` and processed consecutively in nonce order (so a player's own sequence "sell A then buy B" holds).
4. Where order inside the tick matters (contention for one unique asset, the last unit of a capped resource), the owning module resolves it by `orderKey` order unless it defines a fairer mechanism (auctions, pro-rata allocation). Batch auctions are order-independent by construction (05).
5. Rate limits (00 §5.5, 19 §3.8.6): at most 20 intents per tick per character across its own channels (UI, API), plus 20 per tick for each operator (delegated manager or deployed AI) acting for it under a Mandate, and at most 100 per tick for the character and all its operators combined (see 01 §4 for the API decision); excess intents are rejected with `REJECT_RATE_LIMIT` in P0, keeping the lowest nonces.

### §3.13 Deterministic IDs

`newId(kind)` inside `step()`:

```
seq    = per-(partition, tick, kind) counter, starting at 0
digest = SHA-256('TYC/id' || worldSeedPublicSalt || kind || tick || partitionId || seq)
id     = kind + '_' + base32Crockford(tick as 6 bytes big-endian || digest[0..9])   // 26 chars like a ULID
```

`worldSeedPublicSalt` is a public constant of the world (not secret: IDs need not be unpredictable, only unique and replayable). Replay produces identical IDs. IDs embed the tick and therefore creation order; where that must not leak (connection entries in 12), the public label is a separate rotating random label from `ops.label:<chrId>` (00 §3.2).

### §3.14 Partitions and cross-partition hold-to-settle

#### §3.14.1 Partition kinds and ownership

| Kind | Count at launch | Owns (single writer) |
|---|---|---|
| COORD | 1 (+ hot standby) | clock, headers, entropy, global calendar hooks, macro state (04 runs here at day close), dockets of courts and regulators (13), boards aggregation (15), the Stabilizer (03), cross-partition invariant checks |
| WORLD | 1 | named NPC actors (16), news generation, politics, dynasties, history |
| MARKET | 1 per asset group (launch: 4 — equities+ETFs, bonds+FX, commodities+crypto+DeFi, derivatives); split by asset group as load grows | order books, NPC liquidity providers and their inventories, auction state, per-asset price model state |
| FIN | 1 at launch, split by institution later | CCP, exchanges' own books, central banks, treasuries, NPC banks, NPC funds and insurers, SPVs, rating agencies, regulators' and courts' accounts, the `sys` entity |
| CITY | 1 per city (launch: 15 + Isla Serena grouped with its FDL neighbour) | `hh` sector of the city, businesses and properties located in the city (including player-owned ones: they are written by the city partition and reported to the owner's partition), districts, demand pools |
| PLAYER | `ceil(agents / 25,000)` (launch: 2) | characters, their companies (`cmp`), funds, banks, insurers and alliances whose root owner is in the partition, AI agents, hidden sessions on the partition's models, holds, positions, margin accounts |

Assignment rule: a player-owned entity's home partition is its root owner's PLAYER partition (`hash(rootChrId) mod nPlayerPartitions` until rebalanced), except businesses and properties (always CITY by location) and listed instruments' books (MARKET). A player-chartered institution (bank, CCP member account, fund) stays in its owner's PLAYER partition; its institutional interactions with FIN go through messages.

#### §3.14.2 Cross-partition postings

A posting whose two accounts live in different partitions is split into two **legs** through interpartition suspense accounts `sys:9900:<A>-><B>:<ccy>` (03 chart of accounts):

```
Partition A:  Dr A_account          Cr sys:9900:A->B   (or reverse)
Partition B:  Dr sys:9900:B->A      Cr B_account
```

Both legs carry the same `entryId` and `legId` and are exchanged at barrier B3. Invariant **I13** (03 §3.16): after P13 of every tick, for every currency and every pair (A, B), `balance(A->B) + balance(B->A) == 0`, checked by COORD from the partitions' reported suspense balances. A mismatch aborts the tick (§3.15).

#### §3.14.3 Holds

1. Any intent that commits money or assets that a different partition will consume places a **hold** on the actor's account in P1 (or inline in P4/P5 for NPC and AI intents). `available = committed balance - Σ active holds`. A hold is local to the owner's partition and therefore cannot be double-spent across partitions.
2. Holds carry `expiresTick`: for an order, the tick it would expire (good-for-tick orders expire at N; resting orders keep a hold equal to their maximum notional plus fees until cancel or fill); for a P2P atomic swap, N; for a contract escrow placement, N (escrow itself is a posting into the CCP escrow account at P13).
3. In P13 each hold is **settled** (converted into the postings of the fill or transfer, and released for the unused part) or **released**. A hold whose `expiresTick < N` is released automatically.
4. **Atomic multi-party settlement** (P2P swap of a business for money across partitions): both sides hold in P1, the swap's legs are prepared in R3, and P13's two-phase commit makes them commit together or not at all. If either side fails validation, neither leg is produced and both holds release.
5. Holds are never visible to other players (L11), only to the owner and to the court via discovery (13).

#### §3.14.4 Institution-aware routing (V3 Part 10)

A bank run, a CCP default or a fund gate is an event of an institution in one partition (FIN or the owner's PLAYER) that affects counterparties in many partitions. It is ordered by the same rules: the institution's partition decides the event in tick N (P7/P8), emits `NEXT` messages to every counterparty partition, and counterparties apply it in tick N+1 in sorted order. No partition ever applies another partition's decision in the same tick.

#### §3.14.5 Rebalancing

Moving entities between partitions happens only at a **daily snapshot boundary** (after the commit of t = 719, before t = 0 of the next day): the planner (19) writes a `REBALANCE` snapshot, the entities' state is moved, partition descriptors are updated in the header of the next tick (`directives` with kind `PARAM_CUTOVER` carrying the new assignment table), and holds and suspense balances must be zero for moved entities (the planner selects only entities with no active holds; others move next day). Rebalancing never changes any result, because partitioning does not enter any model formula.

### §3.15 Commit, rollback and safe mode

#### §3.15.1 Two-phase commit

1. R4 (prepare): each partition applies its postings to a new ledger state, settles/releases holds, runs local invariants (03 §3.16), computes `stateHash`, reports `{ok, stateHash, suspenseBalances, invariantFailures[]}` to COORD.
2. R5 (decide): COORD checks every report plus global invariants (I3 global trial balance per currency, I4 M0 identity, I13 suspense, I8 quantity conservation across partitions). If all pass: writes `TickRecord` to the event store (durable, replicated, 19) and broadcasts `COMMIT(N)`. Otherwise broadcasts `ABORT(N)`.
3. R6: on `COMMIT`, partitions swap their state pointer to the new state and run P14. On `ABORT`, partitions discard the new state (the old one is untouched, §3.6.3) and await the safe-mode retry.
4. A tick is final only when its `TickRecord` is durable. Clients never see any effect of tick N before `COMMIT(N)`.

#### §3.15.2 Rollback

Rollback of the current tick is free (discard the prepared state). **No committed tick is ever rolled back** in the live world. Errors found later are corrected by **compensating postings** (`ADM_CORRECTION_*` reason codes, 03 §3.4) through two-approval admin intents (21), with a targeted list of beneficiaries found by replay (02-multiplayer §10.1). This keeps the event log append-only and the world history honest.

#### §3.15.3 Safe mode (deterministic isolation)

When `ABORT(N)` happens because of invariant failures:

```
attempt = 1
loop while attempt <= PARAM.safe_mode_max_attempts (DEFAULT 3):
  1. Re-run tick N with the same header, intents and entropy, with posting-level validation ON:
     every posting request is checked against I1/I2/I10/I16 at the moment it is queued, and
     each module's work is attributed (module, entityId, intentId) in a trace.
  2. Identify the first failing item in canonical order:
       - a player/AI/NPC intent whose processing produced the failing posting -> quarantine INTENT
       - else an entity whose scheduled processing produced it              -> quarantine ENTITY
       - else a module-level computation (e.g. 04 macro step)               -> quarantine SUBSYSTEM
  3. Add the QuarantineEntry to header.quarantine (the header is re-issued for tick N; quarantine is
     part of the hashed header, so replay reproduces the exact same exclusion).
  4. Re-run tick N with quarantined items skipped:
       INTENT     -> rejected with REJECT_SAFE_MODE (holds released, player notified "Order not processed, no charge")
       ENTITY     -> the entity is frozen for this tick (no accrual, no ops; flagged 'ENGINE_REVIEW')
       SUBSYSTEM  -> the subsystem's phase for this tick is skipped; its state carries forward unchanged
  5. If all invariants pass -> COMMIT with mode = SAFE; emit core.safe_mode.recovered; page ops (19, 21).
  6. Else attempt += 1.
if still failing: HALT the world (§3.20), mode = HALTED; page ops at highest severity.
```

Rules: a quarantined ENTITY stays frozen in later ticks only if ops sets a persistent freeze (admin directive); by default it is retried at the next tick (if it fails again, safe mode repeats). A quarantined SUBSYSTEM is retried next tick, and after `PARAM.safe_mode_subsystem_repeat_halt` (DEFAULT 5) consecutive quarantines the world halts. Safe mode never changes the entropy, the RNG state of non-quarantined work, or the fair order.

#### §3.15.4 Coordinator failover

The hot-standby coordinator follows the primary's event store and entropy buffer synchronously. On primary loss: the standby waits until `PARAM.coord_failover_timeout_ms` (DEFAULT 3,000) without heartbeat, fences the primary (19), and resumes from the last durable `TickRecord`. Any tick that was prepared but not durable is recomputed from scratch with the same sealed inputs (the sealed intent batch is written durably at P0, before R1). Partitions that already prepared a different state for that tick discard it.

### §3.16 Snapshots

#### §3.16.1 Cadence and retention

| Kind | When | Retention |
|---|---|---|
| DAILY | after commit of t = 719 (every game day = every real hour), every partition, same tick | rolling `PARAM.snapshot_daily_retention_days` (DEFAULT 30 real days = 720 snapshots) then thinned to one per game week for one real year, then one per chapter |
| CHAPTER | after commit of the last tick of each chapter | forever (02-multiplayer §3.7) |
| REBALANCE | at each rebalancing (§3.14.5) | 7 real days |
| PRE_VERSION | at the tick before every `VERSION_CUTOVER` | forever |
| ADHOC | ops request, or before a HALT recovery | 30 real days |

Recovery target: a failed partition restores the latest DAILY snapshot and replays at most 719 ticks (measured target < 60 s at ~50 ms per replayed tick; 20 measures it).

#### §3.16.2 Format

- **Canonical encoding (`canon`)**: deterministic MessagePack variant: maps encoded with keys sorted by byte order; integers as smallest MessagePack int; `bigint` as extension type 1 (sign byte + big-endian magnitude); float64 always as 8-byte float (never narrowed); strings UTF-8; no undefined (absent fields omitted). The same encoder is used for hashing, intents, messages, snapshots and the event store.
- **Chunks:** one chunk per (module, entity kind), each ≤ 64 MB before compression, compressed with zstd level 6 (deterministic output is not required for compressed bytes; the hash is over uncompressed canonical bytes).
- **Manifest** (§2.9) lists chunk hashes; `stateHash` is recomputed on load and must equal the `TickRecord` value, otherwise the snapshot is rejected and the previous one is used.
- Storage path: `snapshots/{worldId}/{partitionId}/{tick}/{chunk}.msgpack.zst` in object storage (19).
- Snapshots are written asynchronously after commit (copy-on-write state makes the committed state immutable while it is serialized), so they never extend the critical path.

### §3.17 Event sourcing, replay and audit

#### §3.17.1 What is stored (logical records; tables in 19)

| Record | Content | Role |
|---|---|---|
| `TickRecord` | §2.5 | the chain of world hashes |
| `SealedIntentBatch` | all sealed intents of the tick, per partition, canonical-encoded | the **source of truth** together with headers and the secret `e(N)` |
| `EntropySecret` | `e(N)` (secret until reveal, then public), epoch roots | needed for replay |
| `EngineEvent` | 00 §5.6 events, per partition, with visibility | derived; read models, news, courts, boards |
| `Posting` | 03 postings, per partition | derived; financial statements, audits |
| `Snapshot` | §3.16 | acceleration of replay |

Inputs (`TickRecord.header`, `SealedIntentBatch`, `EntropySecret`) are sufficient to rebuild everything from genesis. Derived records are stored for speed and must match a replay bit for bit.

#### §3.17.2 Replay

`replay(worldId, fromSnapshot, toTick, engineVersions)`:
1. Load the snapshot; verify its `stateHash`.
2. For each tick T in order: load header, intents, entropy secret; run `stepWorld` with the engine version recorded in the header (all historical engine bundles are retained, content-addressed); compare `stateHash` per partition and `worldHash` with the stored `TickRecord`. Any mismatch stops the replay and opens a **determinism incident** (20) with the first divergent partition, module trace and RNG draw counts.
3. Replays run in a sandbox (19) and never write to the live event store.

Uses: court evidence (13 cites ticks and requests replays of a tick range through the replay subpoena), support investigations, the Truth Machine (20), "Why it moved" explanations (17/18 read stored events, not replays), spectator replays of famous days (15), version-upgrade checks (§3.18).

#### §3.17.3 Shadow verification

A configurable fraction `PARAM.shadow_verify_fraction` (DEFAULT 0.01) of ticks is recomputed by an independent verifier process on a different machine from the stored inputs, comparing hashes asynchronously. Divergence pages ops and freezes deploys.

#### §3.17.4 Audit trail requirements

Every posting carries `refs` to the intent, event or scheduled process that caused it (03). Every event carries `subjectIds`. From any posting, the audit tool can walk: posting → entry → cause (intent/event) → tick → header → intent batch. This is the "follow the ledger" craft (V3 Part 6) for investigators, and the evidence chain for courts.

### §3.18 Versioning, parameters and content changes

1. **Engine versions** change only at a tick boundary via an `AdminDirective VERSION_CUTOVER { atTick, engineVersion, migrationId? }`, announced at least `PARAM.version_notice_ticks` (DEFAULT 17,280 = 24 real hours) ahead, except security hotfixes (two approvals, 21). Rule changes that alter gameplay land at chapter boundaries (02-multiplayer §2.3); bug fixes may land any day at a daily snapshot boundary.
2. Before cutover, CI replays the last full game day on the old and new versions from the same snapshot (02-multiplayer §3.3) and reports every divergence; divergences must be exactly the intended changes (20 owns the release gate).
3. **State migrations** are pure functions `migrate(stateV1) -> stateV2` run at the cutover tick before P0; their `migrationId` is in the header; the PRE_VERSION snapshot is kept forever.
4. **Parameters** (23) are versioned as a whole set. A `PARAM_CUTOVER { atTick, paramsVersion, diff }` directive with two approvals changes them at a tick boundary; the header carries `paramsVersion`; replay loads the parameter set by version. Stabilizer lever values are **state** (03), not parameters, because they change every day by rule.
5. **Content** (22 catalogs: new city, new instrument, new lifestyle item) is versioned (`contentVersion`) and added by directive at a daily boundary; new content creates new streams and entities; it never edits existing entities except via migration.

### §3.19 Real-time scheduling, drift, lag and catch-up

#### §3.19.1 Schedule

```
scheduled(N) = genesisUtcMs + N * 5000 + reanchorOffsetMs
```

The coordinator seals tick N at `max(scheduled(N), sealed(N-1) + minInterval)` where `minInterval = 5000 ms` in NORMAL mode and `PARAM.catchup_min_interval_ms` (DEFAULT 2,500) in CATCHUP mode. Processing of tick N starts when N is sealed **and** N-1 is committed.

#### §3.19.2 Clock source and drift

- The coordinator's time source is the host clock disciplined by NTP/chrony against at least 3 sources, read as a monotonic clock offset by a periodically verified UTC estimate. Gateways' and clients' clocks are never used for sealing.
- Drift tolerance: if the coordinator's UTC estimate disagrees with its sources by more than `PARAM.clock_max_skew_ms` (DEFAULT 250 ms), it slews (adjusts the schedule gradually by at most 10 ms per tick) rather than jumping; skew > 2,000 ms pages ops.
- Clients receive with every tick `{tick, nextSealEtaMs}` and estimate their offset to the server with an NTP-style 4-timestamp exchange on the WebSocket (19). This is used only for the tick-pulse countdown ring (17); a client's clock can never change which tick an intent lands in.

#### §3.19.3 Lag and catch-up

`lag = now - scheduled(lastCommitted + 1)` (how far the world is behind its schedule).

| Lag | Mode | Behaviour |
|---|---|---|
| ≤ 0 | NORMAL | 5,000 ms cadence |
| 0 < lag ≤ `PARAM.catchup_max_lag_ms` (DEFAULT 300,000 = 5 real minutes = 60 ticks) | CATCHUP | seal as soon as the previous tick commits, but never sooner than 2,500 ms after the previous seal (players always get at least 2.5 s of intake per tick); the client pulse shows "catching up"; lag shrinks by up to 2.5 s per tick |
| lag > 5 real minutes | REANCHOR | the coordinator issues `REANCHOR { deltaMs = lag }` at the next tick: `reanchorOffsetMs += lag`, mode returns to NORMAL. The missed real time is **not simulated**: the world simply resumes; the game calendar falls behind wall-clock by `lag` forever (the 1 real hour = 1 game day rate of L9 is preserved; only the phase of the clock shifts). Clients see a one-time "Exchange clock adjusted" notice |

There is no "skipping" of ticks: every tick number runs, because skipping would break accrual and auction continuity. A world that is slower than real time for a sustained period (p99 work > 5 s) is a capacity incident; the planner adds partitions at the next daily boundary.

#### §3.19.4 Why world-clock durations are safe across reanchors

All durations are tick counts (§3.1.3), so a reanchor neither shortens nor lengthens anyone's protection, Held time, cooldown or loan term. Chapter boundaries are game-day based (every 1,344 game days), so a reanchor of `x` ms moves future chapter ends later in wall-clock time by `x`; the chapter's announced end time on the UI is recomputed and the ladder settles at the game-day boundary as defined (15).

### §3.20 Halts and maintenance in a persistent world

1. **Zero-downtime is the default.** Deploys roll partition by partition at tick boundaries using graceful handover (02-multiplayer §11): the new process loads the latest snapshot + log, catches up, and takes over at a boundary. Most deploys cause no halt.
2. **HALT** (admin directive with two approvals, or automatic after safe-mode failure): the coordinator stops sealing new ticks after the last committed tick. Clients show the diegetic banner "Trading halted by the Exchange" (17). No world time passes: no accrual, no hidden-session progress, no cooldown progress, no offline-cap consumption. Intents submitted during a halt are rejected with `REJECT_HALTED` (not queued, so nobody gets a privileged first position on resume).
3. **RESUME**: the coordinator issues `REANCHOR { deltaMs = halt duration }` then resumes NORMAL mode. The first tick after resume is sealed at least `PARAM.resume_notice_ms` (DEFAULT 60,000) after the resume announcement, so every client can reconnect before trading resumes.
4. **Planned maintenance window** (only for changes that cannot be rolled, e.g. storage migrations): at most `PARAM.liveops_maintenance_max_minutes` (DEFAULT 30, owned by 21 Rule 3.3.3) real minutes per event and at most one event per real week, announced at least 24 real hours ahead (UI banner, push to opted-in players, Wire item), scheduled in the lowest-activity (quietest) real hour computed by 21 Rule 3.3.3 (ruling in 24); all markets, including crypto, perps and 24h commodities, are halted. Implemented as HALT + RESUME.
5. **Partial halts** (one instrument, one exchange, one institution) are market rules owned by 05 (circuit breakers), 07 (CCP), 13 (regulators); they are game events, not engine halts, and time keeps flowing.
6. Long outages: any unplanned halt longer than `PARAM.outage_compensation_threshold_min` (DEFAULT 30) triggers 21's compensation policy review; because world time stops with the halt, compensation is never money for "lost income" (no income was lost), only cosmetic goodwill (L7).

### §3.21 Solo sandbox and challenge worlds

The same `stepWorld` runs (a) in the live world, (b) in the Truth Machine harness (20) with harness seeds, (c) in challenge events with ring-fenced portfolios (15) as separate world instances, and (d) in the non-competitive solo sandbox (19, 18). Only (a) uses commit-reveal and secret roots; (b)–(d) use a local seed and `e(N) = SHA-256(localSeed || N)`. Results from (d) never carry economic value into (a) (resolved roadmap Q4/Q5, see 01 §6). Speed multipliers (1×, 4×, 20×) exist only in (b)–(d) and change `TICK_REAL_SECONDS` of that instance, never the tick-based rules.

---

## §4 Player intents

This module owns no gameplay intents. It owns the envelope-level checks of §3.12 applied to every intent, the read-only queries below (served by the read API of 19, not by `step()`), and the admin directives (submitted through 21's console as `adm.*` intents with two approvals).

### §4.1 Read-only queries (no state change, no rate-limit cost beyond 19's API quota)

| Query | Payload | Returns | Visibility |
|---|---|---|---|
| `core.clock.get` | `{}` | current tick, GameDate, phase, `nextSealEtaMs`, mode (NORMAL/CATCHUP/HALTED), next boundaries (next open, next close, next day close, next chapter end with wall-clock estimate) | public |
| `core.calendar.get` | `{ year }` | holiday table, session table, boundary schedule, scheduled public events (from 04/06/09/16) | public |
| `core.header.get` | `{ fromTick, toTick }` (max 10,000) | TickHeaders (with reveals where due) | public |
| `core.receipt.get` | `{ intentId }` | the sealed intent, its tick, `orderKey`, Merkle inclusion proof against `intentsRoot`, outcome (accepted/rejected + reason) | the intent's actor only |
| `core.integrity.verify` | `{ tick }` | `C(tick)`, `e(tick)` if revealed, verification result | public |

### §4.2 Admin directives (`adm.*`, owner 21 for the console and approvals, effects defined here)

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `adm.halt` | `{ reason, publicMessageKey }` | 2 approvals (1 for automatic safe-mode halt) | §3.20.2 |
| `adm.resume` | `{ resumeAtUtcMs }` | 2 approvals; `resumeAtUtcMs >= now + resume_notice_ms` | §3.20.3, REANCHOR |
| `adm.param.cutover` | `{ atTick, paramsVersion }` | 2 approvals; `atTick >= now + version_notice_ticks` unless flagged hotfix | §3.18.4 |
| `adm.version.cutover` | `{ atTick, engineVersion, migrationId? }` | 2 approvals; CI replay report attached and green | §3.18.1 |
| `adm.maintenance.schedule` | `{ startTick, durationMin }` | ≤ weekly budget; start at Saturday t = 0; notice ≥ 24 real hours | §3.20.4 |
| `adm.quarantine.persist` | `{ entityId, untilTick }` | 2 approvals | entity stays frozen (`ENGINE_REVIEW`) until lifted |

---

## §5 Engine events

All use the 00 §5.6 envelope. Namespace `core.*`.

| Kind | Visibility | When | Payload |
|---|---|---|---|
| `core.tick.committed` | PUBLIC (header fields only) | every commit | `{ tick, worldHash, intentsRoot, mode }` |
| `core.phase.changed` | PUBLIC | t = 0, 60, 61, 540, 541 | `{ phase, productFamiliesOpen[] }` |
| `core.day.closed` | PUBLIC | t = 719 commit | `{ dayIndex, gameDate }` |
| `core.period.boundary` | PUBLIC | week/month/quarter/year/chapter start or end | `{ period, edge: 'START'|'END', index }` |
| `core.holiday` | PUBLIC | t = 0 of a holiday | `{ holidayId, blocs[] }` |
| `core.entropy.revealed` | PUBLIC | each reveal | `{ forTick, value }` |
| `core.epoch.rotated` | PUBLIC | first tick of a chapter | `{ epoch, publicRootCommit, revealedEpoch? }` |
| `core.intent.rejected` | PRIVATE (actor) | P0/P1 rejection | `{ intentId, code, module }` codes: `REJECT_REPLAY, REJECT_STALE, REJECT_RATE_LIMIT, REJECT_SCHEMA, REJECT_SIGNATURE, REJECT_HALTED, REJECT_SAFE_MODE` + module codes |
| `core.safe_mode.entered` | PUBLIC (generic text) + SEALED (details) | ABORT | `{ tick, attempt }` / sealed: failing invariant, trace |
| `core.safe_mode.recovered` | PUBLIC | safe commit | `{ tick, quarantinedCount }` |
| `core.halt` / `core.resume` | PUBLIC | §3.20 | `{ reason key, expectedResumeUtc? }` |
| `core.reanchor` | PUBLIC | §3.19.3 | `{ deltaMs, newChapterEndUtc }` |
| `core.version.cutover` | PUBLIC | cutover tick | `{ engineVersion, notesKey }` |
| `core.param.changed` | PUBLIC | cutover tick | `{ paramsVersion, changedKeys[] }` |
| `core.snapshot.written` | internal (ops) | after write | manifest summary |
| `core.budget.overrun` | internal (ops) | phase over budget | `{ partitionId, phase, ms }` (telemetry, not hashed) |
| `core.determinism.incident` | internal (ops) + SEALED | replay/shadow divergence | `{ tick, partitionId, module }` |

---

## §6 NPC behaviour

1. NPCs (liquidity providers, named actors, NPC institutions, aggregate sectors) act only inside the pipeline: they produce **NPC intents** in P3/P4 (and institutional actions in P7/P8) with `channel = 'NPC'`. NPC intents have no signature or nonce, receive `orderKey` like player intents (computed from the same tick entropy), and pass the same validation rules (licenses, balances, holds). This is the fairness rule of 00 §5.5 applied to NPCs: no NPC has a private API.
2. NPC decision cadences are tick-based and staggered by `fnv1a32(npcId) mod cadence` so they spread across ticks (16 defines cadences; default named-actor review every 30 ticks).
3. NPCs never see sealed intents of the current tick before they decide (P3/P4 read committed state and the header only). In particular NPC liquidity quotes in P4 do not see players' orders of tick N (05).
4. Aggregate sectors (`hh`, `frm`, `row`) are updated at day close by 04 (macro) and hourly by 09/10 (demand), never per tick.

---

## §7 Screens

(Layouts in 17.)

| Screen / component | Shows |
|---|---|
| **Tick pulse** (global header component) | the 5 s heartbeat ring counting down to the next seal, tick number, game date/time in ET, phase badge (Pre-market / Opening auction / Open / Closing auction / After-hours / Weekend / Holiday), mode badge when CATCHUP or HALTED; tap opens the Calendar |
| **Calendar** | month grid of the game year with holidays per bloc, weekends, scheduled public events (CB meetings, earnings, data prints, auctions, chapter end with wall-clock estimate), today's session table per product family |
| **Order receipt** (sheet from any filled/rejected order) | "Sealed in tick T…", fair-order position (percentile only), inclusion proof status ("Verified"), outcome |
| **Integrity page** (part of the diegetic Stabilizer and Exchange report, 03/21) | latest commits and reveals, a verifier ("paste a tick number"), epoch-root commits and reveals, uptime, halts and reanchors history, determinism incident count (public summary) |
| **Halt banner** | "Trading halted by the Exchange" with reason key and expected resume time; when resuming, a 60 s countdown |
| **Clock-adjusted notice** | after a reanchor: new chapter end time |

---

## §8 Edge cases

1. **Tick 0.** Genesis state is produced by `createWorld(genesisConfig)` (pure, from the content seed); tick 0 runs the full pipeline with start-of-period hooks for chapter 1, year 1, quarter 1, month 1, week 1, day 1. `prevTickHash` of tick 0 = SHA-256('TYC/genesis' || genesisStateHash).
2. **Day close at t = 719 coinciding with month, quarter, year and chapter end** (e.g. the last tick of a chapter that is also a year end): end hooks run innermost first (day, week, month, quarter, year, chapter). Day-close may use up to 400 ms from slack; a chapter-end tick may exceed 5 s and is the expected worst case; scheduling absorbs it via CATCHUP.
3. **Holiday on a coupon date**: modified following; accrual continues daily so the coupon amount is unchanged.
4. **Order submitted for a closed product** (weekend equity order): accepted and queued (it holds funds) if the order type allows queuing (05), otherwise rejected `REJECT_MARKET_CLOSED`.
5. **Intent arriving exactly at the seal**: belongs to whichever batch the gateway had open when it processed `SEAL(N)`; the gateway is single-threaded per connection, so there is no ambiguity.
6. **Gateway crash mid-batch**: intents in its open batch are lost unless acknowledged; clients only treat an intent as submitted after the gateway's `ack(intentId, tick)` (19). Lost intents are resubmitted by the client with the same `intentId` and nonce; duplicates in later ticks are rejected `REJECT_REPLAY` if the first one was sealed.
7. **Safe mode quarantines a player's intent that was part of an atomic swap**: the counterpart's leg is also not produced (atomicity), both holds release, both players see "not processed".
8. **A stream that is never drawn for a long time**: no mixing occurs while unused; when next drawn, it mixes that tick's entropy (state from the last use plus fresh entropy). At epoch change it is re-seeded regardless.
9. **New content mid-chapter** (a new city opens): its streams are seeded from the current epoch root on first use; existing streams are untouched.
10. **Partition count changes**: does not alter any result (IDs include `partitionId`, so new entities created after a rebalance get different IDs than they would have; that is acceptable because replay reproduces the actual history including the rebalance directive).
11. **Replay across an engine version boundary**: the replay engine switches bundle at the `VERSION_CUTOVER` tick and applies the recorded migration.
12. **NaN produced by a model** in one business: safe mode quarantines that entity for the tick; repeated failures surface in ops with the entity id.
13. **Clock skew on the coordinator host after failover**: the standby uses its own disciplined clock; any skew is absorbed by slewing; a large jump forward produces lag, handled by CATCHUP or REANCHOR.
14. **A real-world leap second or DST**: irrelevant; UTC monotonic schedule; DST does not exist in game time.
15. **Player in a time zone where the game week rotates**: game weekday at a given real hour shifts by 3 hours per real day (24 mod 7 = 3), so a player who always plays at 20:00 local sees a different game weekday each day. This is intended (every real-world region gets every phase, 02-multiplayer §2.2).
16. **Chapter end during a halt**: the chapter ends at its game-day boundary after resume; ladders settle then.
17. **Very large money amounts in floats** (> $9B): handled per §3.9.2; exact computations use bigint helpers.
18. **Overflow of tick counter**: `Tick` is a JS number up to 2^53 (about 1.4 billion years at 5 s); no overflow.

---

## §9 Exploits and counters

| Exploit | Counter |
|---|---|
| Predicting prices from a leaked or guessed seed | per-tick entropy mixing (§3.10.3) from committed, secret `e(N)`; epoch rotation per chapter; S streams never revealed |
| Operator rigging an outcome after seeing intents | commitment `C(N)` published 720 ticks before tick N; `intentsRoot` mixed into entropy; public verification |
| Sniping the end of a tick (late submission to see others' orders) | sealed batches; nobody sees anyone's intents of tick N before commit; uniform-price auctions; fair `orderKey` order unknowable in advance |
| Getting a privileged position in a contested intent (unique asset) | `orderKey` from unknown entropy; modules use auctions or pro-rata where fairness matters |
| Latency advantage from being near the server | none: the batch boundary is the seal; ordering does not depend on arrival time |
| Replaying a captured intent | per-actor strictly increasing nonce, intent id uniqueness, `intent_max_age_ticks` |
| Flooding a tick to slow the world | per-character 20 intents/tick (00 §5.5), gateway quotas (19), DU caps for AIs; deterministic load shedding in modules |
| Exploiting a halt (queue orders to be first on resume) | intents during a halt are rejected, not queued; resume notice 60 s; first tick fair-ordered |
| Exploiting reanchor (claim lost time) | world time stops with the halt; durations in ticks; no lost income exists to compensate |
| Datamining IDs to learn creation order of secret entities | rotating public labels for sensitive lists (12); IDs only expose creation tick for entities whose existence is public |
| Diffing client deltas to infer hidden state | 19 sends only owner-visible data; events carry visibility; timing of deltas is per tick for everyone |
| Bugs in a phase that print money | P13 invariants abort the tick; safe mode isolates; compensating postings afterwards; replay finds beneficiaries |
| Inconsistent results between machines (exploitable desync) | `dmath`, canonical encoding, shadow verification, CI replay before cutover |

---

## §10 Acceptance tests

1. `tickToDate(0)` returns Y1, Jan 1, Monday, t = 0, PRE_MARKET, chapter 1; `tickToDate(262,079)` returns Y1, Dec 35, Sunday, t = 719; `tickToDate(262,080)` returns Y2 Jan 1 Monday.
2. For every tick from 0 to 2 × 967,680, `dateToTick(tickToDate(x)) == x`.
3. Every chapter's first tick has weekday Monday and t = 0; chapter 2 starts at tick 967,680.
4. Each bloc has exactly 256 trading days in every game year; no holiday falls on a weekend or on a quarter's first or last day.
5. `adjustModifiedFollowing('FDL', dayIndex of Mar 4 Y1)` returns Mar 5 Y1 (Charter Day Thursday moves to Friday).
6. On an FDL holiday, an FDL equity receives no auction during any tick of that day, while EUN equities clear normally, and FX pairs with FDL clear with NPC depth multiplied by 0.5.
7. On Saturday t = 0 to Sunday t = 659 no FX trade clears; at Sunday t = 660 FX clears again.
8. Crypto and perps clear on every tick including weekends and holidays.
9. The accrual hook runs exactly once per game day at t = 719, including Saturdays and Sundays; interest on $1,000,000 at 3.64% for 1 day accrues exactly $100.000000 (`accrue(1e12 micro, 36400, 1) = 100,000,000 micro`).
10. Business operations: over any 30 consecutive ticks, each business runs exactly once, at `t mod 30 == fnv1a32(id) mod 30`.
11. Running `stepWorld` twice from the same snapshot with the same sealed inputs gives identical `worldHash` for 10,000 consecutive ticks, on two different machines (x86-64 and ARM64) and two Node versions.
12. Running the same 1,000 ticks in a single-process deployment and in a 6-partition multi-process deployment gives identical `worldHash` sequences.
13. Lint rejects any engine file that references `Date`, `Math.random`, `Math.exp` or iterates a plain object.
14. `dmath.exp`, `ln`, `pow`, `sin`, `cos`, `normInv`, `erf` match the 20 test-vector file (10,000 vectors each) within the stated ULP bounds and bit-exactly across platforms.
15. `roundHalfEven(0.5) == 0`, `roundHalfEven(1.5) == 2`, `roundHalfEven(2.5) == 2`, `roundHalfEven(-2.5) == -2`; `toMoney(1.25, 'FDL') == 1_250_000n`; `toMoney(1e12, 'FDL') == 1_000_000_000_000_000_000n`; `divRoundHalfEven(5n, 2n) == 2n` and `divRoundHalfEven(7n, 2n) == 4n`.
16. `toMoney(NaN)` and `toMoney(Infinity)` produce invariant failure `I0.nan`, never a value.
17. `allocate(100n, [1,1,1])` returns parts summing to 100n, with the extra unit to the lowest entity id; for 10,000 random cases parts always sum exactly to the total.
18. Creating a new RNG stream for a new asset does not change any draw of any existing stream (compare 1,000 ticks of an existing asset's price path with and without the new asset).
19. `studentT(4)` consumes exactly 10 uint32 draws per call; `poisson(λ)` consumes exactly 2 for any λ ≤ 30.
20. For a test world, every `C(N)` published at tick N − 720 matches `SHA-256(e(N))` revealed at N + 1,000 for all N in a 10,000-tick run.
21. Changing `e(N)` after its commit is published is impossible through the coordinator API (the API refuses; test asserts the error).
22. `orderKey` ordering: with 1,000 intents from distinct actors in one tick, the processing order equals ascending `orderKey`, and changing gateway receipt order does not change the outcome hash.
23. One actor submitting 3 intents in a tick has them processed consecutively in nonce order.
24. The 21st intent of a character in one tick is rejected `REJECT_RATE_LIMIT`; the first 20 (lowest nonces) are processed.
25. An intent with a nonce not greater than the actor's last sealed nonce is rejected `REJECT_REPLAY`; an intent with `clientTick < N − 3` is rejected `REJECT_STALE`.
26. A consequence produced in P7 of tick N (liquidation) is processed in tick N + 1 before any intent of N + 1.
27. A cross-partition posting produces exactly two legs and the suspense accounts net to zero after P13; deliberately corrupting one leg aborts the tick with I13.
28. A P2P swap where one side fails validation produces no postings for either side, and both holds are released in P13.
29. An injected invariant failure caused by one intent leads to safe mode quarantining exactly that intent; the tick commits with mode SAFE; replaying the tick from the recorded header (with its quarantine list) reproduces the same `worldHash`.
30. An injected failure in a subsystem that persists for 5 consecutive ticks halts the world.
31. After `ABORT`, no posting, event or client delta of that attempt is visible anywhere.
32. A partition restored from the last DAILY snapshot plus replay of 719 ticks reaches the stored `stateHash` in under 60 s on the reference machine.
33. A snapshot whose recomputed `stateHash` differs from the `TickRecord` is rejected and the previous snapshot is used.
34. With an artificial 3-minute stall, the world runs in CATCHUP with at least 2.5 s between seals until lag is 0; with an artificial 10-minute stall, a REANCHOR of the measured lag is issued and NORMAL mode resumes.
35. During a HALT of 15 minutes, no tick is sealed, a player's 72-hour protection remaining ticks are unchanged before and after, and intents submitted are rejected `REJECT_HALTED`.
36. A planned maintenance can only be scheduled at Saturday t = 0 with ≥ 24 real hours notice and within 20 minutes per real week.
37. A `VERSION_CUTOVER` without a green CI replay report is refused by the directive validator.
38. A `PARAM_CUTOVER` takes effect exactly at `atTick`; ticks before use the old `paramsVersion`, replay reproduces both.
39. Shadow verification at fraction 0.01 recomputes ~1% of ticks and raises a determinism incident when a deliberately non-deterministic test module is enabled.
40. The phase budgets in §3.5.1 sum to 2,500 ms; in the launch load test (5,000 CCU + 40,000 agents, 19/20) p99 tick work is below 2,500 ms and no tick exceeds 5,000 ms except chapter-end ticks.
41. The wall-clock rules (dormancy at 30 real days without login) progress during a HALT, while all world-clock durations do not.
42. Every stream key used by any module appears in the §3.10.4 registry (CI scan).
