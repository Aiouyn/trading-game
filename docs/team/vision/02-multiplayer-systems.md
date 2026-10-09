# 02 — Multiplayer Systems

Owner: Forge (app + platform). Status: draft v2, 2026-10-07. Reworked for Mathis's decisions: one persistent world (no sharded season worlds), and hacks as hidden sessions. v1.2 (sharded seasons) is archived at `vision/.forge/02-v1.2-sharded.md`.
Scope: how the one world is hosted, partitioned and ticked, seasons inside it, hidden sessions on the server, accounts, leaderboards and leagues, alliances, player-to-player trading and contracts, social, anti-cheat, the web + mobile stack, live ops, and what an MVP vs the full build looks like technically.

Builds on Quant's `01-markets-economy.md` (5 s tick, per-tick batch auction, deterministic seeded engine, event sourcing, Net Worth Index, and §14 for one persistent world). Where I give a number, it is a design target to be validated by Tape's load and balance runs, not a measurement.

---

## 0. Design principles

1. **Server is the only truth.** Clients never run the authoritative sim, never hold the seed, never compute their own fills or balances. A client is a window plus an order pad.
2. **Ticks, not twitch.** Everything that matters resolves on the 5 s world tick. Your ping, device and connection never decide a trade, a hack or a race. A phone on 4G and a desktop on fiber are equal.
3. **Async-first multiplayer.** Most players play 15–60 minutes a day across timezones. Every interaction between players must work when the other side is offline: contracts with deadlines, standing orders, AIs that act for you, defenses that run without you.
4. **One persistent world, seasonal ladders.** Your empire, identity and reputation never reset. Seasons add 8-week ladders, titles and events on top, so a new player always has something real to win.
5. **Everything is a ledger entry.** Every cent moves through one double-entry ledger with a reason code. That single rule powers anti-cheat, court evidence, rollbacks, the stabilizer's faucet/sink metrics and customer support.
6. **Social pressure is the content.** The best moments come from other people: a rival's IPO you can short, an alliance betrayal, a whale's public filing, a court verdict. Systems should surface other players constantly.
7. **One codebase, three screens.** Desktop web, mobile web/PWA, and native wrappers share one Next.js app and one TypeScript engine package.

---

## 1. Quick answers for teammates

**Mathis's call (2026-10-07): one single persistent world.** There's one economy, one global leaderboard, country leaderboards and seasonal ladders inside the world. Nothing resets and there are no visible shards. The engine is partitioned behind the scenes (§3), and players never see it.

**@Quant: capacity targets for the one world** (these size NPC depth and demand through your `N_a`):

| Metric | Launch target | Architecture target (no redesign needed) |
|---|---|---|
| Registered | 50,000 | 1,000,000 |
| Weekly active | 15,000 | 300,000 |
| Peak concurrent (CCU) | 5,000 | 100,000 |
| AI agents | 40,000 | 750,000 |

Pools scale off activity-weighted players `N_a` (7-day decay), never sign-ups:
```
N_a(t) = Σ_players e^(−days_since_last_active / 7)
```
That plugs straight into your §14.1 (a new city every ~4k growth in `N_a`, NPC GDP ≈ 50× player net worth). At your estimate of 40–75 ms per 1k CCU per core group, 100k CCU needs about 20–30 core groups running in parallel. That's why the engine is partitioned by asset group, city and player range (§3.2), which your per-asset clearing makes possible.

**@Tape:** every action, including each hidden session's whole lifecycle (opened, accrual per tick, clues emitted, scans, disconnect), is in the event log with tick numbers, and the court reads it through a replay API (§3.3). See §4.2 for what the server needs from your new session math.

**@Ledger:** the DU budgets from RESOLVED-NUMBERS (A1) are unchanged. The world cap of 3.0M DU/tick was set for 20k agents, so for one world it becomes **per partition**: 3.0M DU/tick per player partition of up to ~25k agents, with a proportional "compute shortage" scale-down applied world-wide (§4).

**@Velvet:** the connections panel's data rules are in §4.2 (what the client may and may not receive). The screen list is in §12.6.

---

## 2. World topology: one persistent world

### 2.1 One world, partitioned invisibly

There is **one world**: one set of markets, regions and cities, one court, one Wire feed, one global leaderboard. Every player can trade with, hack, sue, partner with or take over any other player.

Why this is workable without visible shards:
- Quant's markets clear **per asset**, cities simulate **per city**, and player bookkeeping is **per player**. Those are natural partitions, so one logical world can run on many cores and machines (§3.2).
- The map grows with the population: Quant opens a new city for every ~4k growth in `N_a`. Crowding per city stays roughly constant, and each new city is a fresh frontier with early-mover advantage, which is the persistent-world replacement for "a new server opened".
- Being known still matters: global top 100, country boards, city boards and leagues give every player a small, recognisable peer group inside the big world.

### 2.2 Countries and regions

- **Country** (for country leaderboards) is set at sign-up and verified quietly. The priority order is app-store region (native apps), then the majority country of logins over the first 7 days, then IP geolocation at sign-up. A mismatch flags the account for review; it never auto-bans.
- You can change country once every 180 days, and a change resets your current-season country ladder score (stops board-hopping to a weaker country).
- A country board appears once it has ≥ 500 active players. Smaller countries roll up into a regional board ("Rest of Europe", "Southeast Asia") until they cross the line.
- In-game regions (Quant's 5 macro regions and their cities) are fiction and independent of real country. A French player can build an empire in a fictional Asian city.
- **Event clock:** with one world across every timezone, scheduled market events (earnings, central-bank meetings) rotate across the day so every region gets prime-time moments. Season finales use a 24-hour finish window rather than a single moment (§6.4).

### 2.3 Seasons inside the persistent world

Seasons are 8-week chapters of the same world, with no reset:

| Season element | What it means |
|---|---|
| Seasonal ladders | Richest this season and fastest climber (Quant §14.4), plus seasonal versions of the other boards, globally and per country |
| Season theme | A macro storyline (e.g. "The Rate Shock Season") that shapes Quant's event odds |
| Concession re-auctions | Quant's 8-week re-auction of unique infrastructure happens at the season boundary, a big public moment |
| Closing Bell week | The last 7 real days: final ladder rules apply (§6.4), and the Wire runs a season-recap mode |
| Season Finals | Top 100 of the season ladders get a 48-hour challenge event (§2.4) |
| Hall of Fame | Season champions recorded forever |
| Patches | Larger rule changes ship at season boundaries, small fixes any time |

### 2.4 Challenge events instead of flash worlds

Earlier I proposed separate flash worlds. With one world, they become **challenge events inside it**:
- A challenge uses a separate **challenge portfolio** (fixed starting cash, a ring-fenced balance that never touches your real empire), trading on the real world's markets or on a scripted scenario market.
- Examples: *Crash Course* (scenario market a week before a scripted crash), *Pure Markets* (no cyber layer), *Speedrun* (scenario market at 4× pace for 24 h).
- **Season Finals:** the top 100 of the season ladders get identical challenge portfolios for 48 hours, with a spectator page. Winner gets the rarest season title.
- Rewards are titles, cosmetics and Prestige only, never money. Challenge portfolios can't move money into the real economy, so they're not a faucet or a laundering route.
- Challenges are also how we test new rules safely before they reach the main world.

### 2.5 Late joiners in a world that never resets

A new player in year 2 must still have a real game:
- Tape's rookie zone (72 h protection that ends on your first attack, then rookie zone until day 7 or $1M).
- Quant's catch-up multiplier and shrinking returns above 0.5% of world wealth.
- Leagues grouped by wealth bracket (§6.3), the fastest-climber ladder with its $100k floor, and new cities as frontiers.
- The "join a Firm" path: alliances recruit newcomers for syndicates and shared defense (§7).

---

## 3. Simulation and networking architecture

### 3.1 Processes

```
 Browser/PWA ──► Next.js app (pages, auth, REST for non-realtime) ──► Postgres (accounts, social,
 Capacitor app                                                          contracts, read models)
      │ WebSocket
      ▼
 Gateways (stateless, N instances; auth, rate limits, subscriptions, presence, fan-out)
      │  message bus (NATS or Redis streams)
      ▼
 Tick coordinator (1 + hot standby) ── seals ticks, runs the macro step, commits the tick record
      │
      ├── Player partitions  P1..Pn   (by hash of player id: intents, holds, ledger, margin,
      │                                mark-to-market, AIs, hidden sessions, defense scans)
      ├── Market partitions  M1..Mk   (by asset group: batch auctions, NPC market makers)
      └── City partitions    C1..Cm   (by city: businesses, demand pools, real estate, districts)

 Event log (append-only, partitioned by partition id + game week)   Snapshots → object storage
```

- **Next.js** serves the app, auth and everything that isn't real-time: profiles, contract drafting, alliance admin, history, leaderboards.
- **Gateways** hold WebSockets (~10k each), check auth, apply rate limits, forward intents to the right player partition, and fan tick output out to subscribed clients.
- **Tick coordinator** owns the clock and the tiny macro state (rates, inflation, cycle, news decisions). It seals each tick, tells every partition to run it, collects the result hashes, and commits the tick.
- **Partitions** are single-writer, deterministic workers. Each owns a slice of state in memory and runs only its slice of Quant's engine. Several partitions can share one process (at launch, all of them do) or spread over many machines as the world grows. That is the "shard invisibly" plan: same code at 500 players and at 100k CCU, only the deployment changes.
- Next.js on serverless can't hold a 5 s loop or WebSockets reliably, so the coordinator, partitions and gateways are separate long-lived Node.js services.

### 3.2 The tick pipeline (every 5 s, one logical world)

| Step | Budget | Where | What happens |
|---|---|---|---|
| 1. Seal | t = 0 | Coordinator | Tick N is sealed; macro state and news decided at N−1 are broadcast to all partitions. Late intents roll into N+1 |
| 2. Validate + hold | 150 ms | Player partitions | Auth, ownership, license gates, court freezes, rate limits. Cash or assets needed by each order are **held** (reserved) so nothing can be double-spent across partitions |
| 3. AI phase | 600 ms | Player partitions (worker pool) | Trading, cyber and defense AIs emit intents (and holds) into tick N; scheduled defense scans run (§4.2) |
| 4. Route | 100 ms | Bus | Orders go to market partitions, business and property actions to city partitions, player-vs-player actions (hacks, contract swaps) to the victim's or counterparty's partition |
| 5. Clear | 1,000 ms | Market + city partitions in parallel | Batch auctions per asset; city demand, business income (once per game hour per Quant), rents |
| 6. Settle | 400 ms | Player partitions | Fills and income come back; ledger entries, holds released, mark-to-market, margin checks, hidden-session accrual, clue emission |
| 7. Commit | 300 ms | Coordinator | Every partition writes its events; the coordinator writes the tick record with all partition hashes. Tick N is final only now |
| 8. Broadcast | 300 ms | Gateways | Public diffs plus private deltas to clients |
| Slack | ~2.1 s | | Headroom for crash days and season boundaries |

Rules that keep this correct and deterministic:
- **Cross-partition money moves only by hold → settle.** Step 2 reserves funds, step 6 settles or releases. An atomic P2P swap holds both sides in both partitions and settles both in step 6, or neither.
- **Consequences land next tick.** A margin call found in step 6 of tick N becomes a liquidation order in tick N+1. A hack resolved in N opens its session in N+1. Every cascade is ordered and replayable.
- **Seeds per partition:** each partition draws from `hash(world_seed, partition_id, tick)`, and processes incoming messages in a fixed sort order, so the result never depends on network timing.
- **Hot assets:** one asset can't be split, but a batch auction is a sort plus a sweep. Even 100k orders on one mega-cap in a tick is a few tens of milliseconds. Tape's load test should include a "whole world buys one stock" crash-day case.
- **Rebalancing:** players move between partitions only at a snapshot boundary (pause → move state → resume), invisible to them.

If any partition overruns, the tick waits rather than skipping (world time slows slightly). A tick never commits partially. Load-test targets for Tape: 5,000 CCU + 40,000 agents on a single machine at launch, and a 100k CCU + 750k agents synthetic run on the partitioned deployment before we open the doors wide, with p99 tick work < 2.5 s.

News and fills for tick N publish together at step 8, after N+1's batch is already open, so no client can react to news inside the tick that produced it (Quant §9).

### 3.3 Determinism and event sourcing

- World state = fold(seed, config, all sealed intent batches, server entropy commits). Quant's engine is pure; coordinator and partitions add only I/O and message ordering.
- **Event log:** one row per sealed batch plus one row per resulting event (fill, transfer, hack, verdict). Partitioned by engine partition and game week.
- **Snapshots:** each partition serializes its state every game day (hourly real time), aligned on the same tick, plus at every season boundary, stored in object storage. Recovery = latest snapshot + replay of remaining ticks for the failed partition only (target < 60 s). The rest of the world waits at the tick boundary rather than running ahead.
- **Replay API:** any tick range can be replayed in a sandbox to reproduce a disputed fill, a hack, or a bug. Court cases (Tape) and support tickets cite tick numbers.
- **Versioning:** each batch records the engine version. A deploy replays the last game day on both versions in CI to check no divergence beyond intended changes.
- **Secret seed:** the world seed is server-only and per-tick entropy is mixed from a commit-reveal (hash published at tick N, value revealed at N+1000). Lets us prove after the fact that we didn't rig an outcome.

### 3.4 What clients receive

Interest management keeps bandwidth tiny. Clients subscribe to channels:

| Channel | Content | Size per tick (est.) |
|---|---|---|
| `ticker:watchlist` | price, change, volume for ≤ 50 symbols | ~1.5 KB |
| `book:{symbol}` | top 10 levels (only for the open trade screen) | ~0.5 KB |
| `me` | balances, positions, fills, margin, alerts, lawsuits, detected attacks | ~0.5 KB (often 0) |
| `me.connections` | your models' connections list (§4.2), refreshed at most once per game hour | on change |
| `city:{id}` | demand, rents, business news for open city view | ~1 KB on change |
| `news` | headlines, filtered to your regions, holdings and follows (one world is too loud to send everything) | ~0.3 KB avg |
| `alliance:{id}` | treasury, chat, ops board | on change |
| `board:top` | top 100 movers | every game hour only |

At ~4 KB per tick → under 1 KB/s per active client. Fine for mobile data. Binary encoding (MessagePack) and delta compression keep it small; JSON in dev.

**Client prediction:** none for money. Orders show as "pending tick N" with a countdown ring (also a nice design moment for Velvet: the tick pulse). UI optimism only for cosmetic things (moving a widget, renaming a business).

**Reconnects:** the client sends its last seen tick; the gateway replays missed `me` deltas (up to 1 game day) or sends a fresh snapshot.

### 3.5 Offline play

- Standing orders (limit, stop, take-profit, trailing) live server-side and fire while you sleep.
- Businesses earn up to the offline cap (Quant: 8 h, 16 h with a manager).
- Your AIs keep running inside their mandate (§4) and your cyber defense always runs.
- On return: a **"While You Were Away" report** (what earned, what filled, detected attacks, lawsuits filed, alliance events, and anything odd in your models' usage). This is the core re-engagement screen.
- Push notifications for things that need you (§8.4), all opt-in and throttled.

### 3.6 Read models

Partitions emit events; projectors build read models in Postgres/Redis for the app: leaderboards, player profiles, public filings, court docket, market history (OHLC candles at 1 tick, 1 game hour, 1 game day), news archive. The app never queries partitions for history.

### 3.7 State hygiene in a world that never resets

Aligned with Quant §14.2:
- **14 real days without a login:** the player becomes *inactive*. Businesses keep running under the offline cap rules, and their AIs keep their mandates.
- **30 days:** the player becomes *dormant* and leaves the active leaderboards (they stay on the all-time board). Businesses run on managers at 50%. Dormant players can't be targeted by new hacks, and any open hidden session on their models freezes (no accrual) until they return, so nobody loses everything during a holiday.
- **90 days:** unique assets go to an estate auction and the owner gets the cash, so a returning player is never wiped but the world isn't clogged with ghost-owned districts.
- **Storage:** event-log partitions older than one game year move to cold storage, with snapshots every season boundary kept forever. Any old tick can still be replayed for a court case or a support ticket, just more slowly.

---

## 4. AI agents and hidden sessions on the server (touches Ledger 05, Tape 03)

### 4.1 AI agents

Player AIs are the game's most expensive and most exploitable system. Rules:

1. **No user code runs on our servers.** Player "AIs" are built from in-game components: a model tier (from Ledger's tech tree), a data set, and a **strategy graph** made of blocks (signals, filters, sizing rules, execution algos, risk limits). Think visual rule builder plus learned parameters, not a Python sandbox. This avoids sandbox escapes and keeps CPU predictable.
2. **Same API as humans.** AIs submit intents into the same batch through the same validation. No special order types, no early data.
3. **Per-tick budget (resolved, RESOLVED-NUMBERS.md):** each AI gets an evaluation budget in decision units (1 DU = evaluate one signal on one symbol). Hard caps: **2,000 DU/tick per player** and **3,000,000 DU/tick per player partition** (≈25k agents each; the world total grows with partitions). If the world's total goes over its budget, every AI scales down proportionally (diegetic "compute shortage", which also raises Quant's compute price).

   | AI tier (Ledger 05 §8) | Cadence | Base DU per evaluation | Effective DU/tick |
   |---|---|---|---|
   | T0 Laptop script | every 6 ticks | 30 | 5 |
   | T1 Garage startup | every 6 ticks | 90 | 15 |
   | T2 Funded startup | every 3 ticks | 300 | 100 |
   | T3 Scale-up lab | every 2 ticks | 800 | 400 |
   | T4 Frontier lab | every tick | 1,500 | 1,500 |
   | T5 Hegemon | every tick | 2,000 | 2,000 |

   Compute raises the cap, relative to tier (RESOLVED-NUMBERS A1, compute bonus): `DU_cap(player) = min(2000, base_tier · (1 + 0.25·min(1, compute_owned / tier_run_midpoint)))`, so owned or reserved compute adds at most +25% over the tier's base, and the worst case is ~2.9M DU/tick per 20k agents, inside the per-partition cap. `compute_owned` counts only owned GPUs and reserved contracts; hijacked compute (Tape 03 §3) never raises a DU cap. DU is a server CPU cap (mine); in-game compute in PFLOP-days/GPU-hours is a priced commodity (Quant/Ledger). The two are never conflated. Cadences are staggered by player id so T0–T3 agents don't all fire on the same tick.
4. **AI quality = information, not speed.** A better model narrows Quant's σ on hidden variables. It never gets earlier ticks.
5. **Mandates:** you set limits your AI must obey (max position, max drawdown, allowed assets, legal-risk tolerance). An AI that breaks the law under your mandate is still your legal problem (Tape).
6. **Distillation is an event, not a file copy.** A stolen model is represented as parameters in the world state; distilling copies a fraction of quality minus noise. Its provenance stays traceable in the event log (court evidence, watermarking idea for Ledger/Tape: models carry a hidden fingerprint that survives distillation with probability p).
7. **Scale estimate:** at launch, 15,000 WAU × ~2.5 AIs ≈ 40,000 agents (two player partitions); at the architecture target, ~750,000 agents (~30 partitions). At the expected tier mix (T0 40%, T1 30%, T2 18%, T3 8%, T4 3%, T5 1%) the average is ~121 effective DU/tick per agent, so ~2.43M DU/tick per 20k agents, inside the 3.0M per-partition cap. That is ~4M signal evaluations per second, so the AI phase runs on a worker-thread pool (one worker per core, agents sharded by id) to fit the 600 ms budget. This is an estimate; Tape's load test replaces it with a measured number before Phase 3.

### 4.2 Hidden sessions: what the server needs (Mathis's hacking model)

Mathis's call: a successful hack doesn't trigger an alarm. It plants a subtle extra **session** on the victim's model, which shows up only as one more entry in its connections list. While the session stays connected, distillation builds up over time and never reaches 100%. The victim has to notice it and disconnect it. Tape owns the math (breach odds with a 1% floor, accrual curve, detection); Velvet owns the connections panel and how clues look. This section is the platform side.

**Sessions are world-state entities, owned by the victim's player partition:**
```
session(id, victim_model_id, attacker_char_id, opened_tick, strength, cover_label,
        distill_progress, clue_profile, status: active | frozen | disconnected)
```
- Each tick, in step 6, the victim's partition updates `distill_progress += f(strength, defense, progress) · presence_factor` with Tape's `f`, which tends toward a ceiling below 100%. Per-tick cost is a few arithmetic operations per session, so even a million open sessions is cheap.
- The attacker's copy improves from `distill_progress` (Ledger's student-model math), recomputed once per game hour, not every tick.
- The whole lifecycle goes into the event log for the court.

**Presence factor (copying slows while the victim is offline):**
- A victim counts as *present* if any of their clients has an open authenticated socket, or they sent an intent in the last 15 real minutes. Otherwise they're offline and accrual uses Tape's offline multiplier.
- Presence is computed server-side only. The attacker can't see or influence it. A victim who closes the app is genuinely offline, so there's nothing to fake.
- Dormant victims (30+ days) freeze all sessions on their models (§3.7).

**Clues have to be real, and they need noise around them:**
- The slowdown is real: an active session consumes a share of the victim AI's DU budget (Tape 03 §4.6: 2% Whisper, 5% Tap, 10% Siphon; total capped at 20% per victim), so the AI genuinely evaluates less. "Odd usage" appears as extra load in the model's usage graph.
- Clue events are generated server-side in step 6 from the session's `clue_profile`. The server also generates **benign anomalies** at a base rate (data-feed reconnects, a licensed renter's burst, a compute shortage slowdown) so a clue is evidence, not proof. Tape sets the false-alarm rate; Velvet shows both kinds the same way.

**Auto-scans by defense tier:**
- Higher-tier defense AIs scan more often (Tape 03 §4.6: T0 never, T1 every 24 h down to T5 every 2 h; scans keep running while you're offline). Each scan is scheduled in the AI phase, costs the defender DU, and has a detection chance from Tape's math. A hit marks the session in the victim's panel as "suspicious", never "hostile, from player X". Attribution needs a court case or an investigation.

**The connections list must not leak, client-side:**
- Hidden and legitimate connections are serialized **identically**: same fields, same ID format (random, rotating), no hostile flag, no attacker id, no opened-tick precision beyond what a legit entry shows. Anyone reading the network traffic or datamining the client learns nothing the panel doesn't show.
- **Legit churn:** a player's own AI workers, data feeds, alliance intel shares and licensed model renters open and close connections naturally, so "a new entry appeared" isn't an automatic tell. Velvet and Tape should tune how busy a typical list is per tier.
- **No scripted watching:** the connections list refreshes at most once per game hour through the API, and an external script diffing it gets the same churn a human sees. Noticing patterns is playing well; a bot that alerts instantly is what the churn and refresh limit blunt.

**Disconnecting has to cost something** (a proposal for Tape):
- If disconnecting were free, the dominant strategy is "disconnect everything every login", and the whole mechanic dies. So cutting a legit connection should break what it was doing (a data feed drops for a game day, a renter's license is refunded and they leave, an alliance share needs re-approval).
- **Lockdown** (disconnect all at once) is available as a panic button, but it pauses your own AIs for a few game hours and costs a fee.

**Limits** (Tape to set the numbers): maximum concurrent sessions per attacker and per victim model, a cooldown before the same attacker can re-plant on the same victim, and the rookie zone and protection window block planting entirely.

---

## 5. Accounts and identity

### 5.1 Sign-in

- **Guest first:** play the first session with no account (device-bound guest). An account is required after 30 minutes of play or before any P2P trade. Guests can't send money or contracts (anti-alt).
- **Upgrade paths:** email magic link, passkeys, Google, Apple, Discord. Apple sign-in is required on iOS if we offer other social logins in the native app (App Store rule), so we ship it from the start.
- **Auth library:** Better Auth or Auth.js in the Next.js app, sessions in Postgres, short-lived signed tokens for the WebSocket gateway.
- **2FA** (TOTP or passkey) required for top-1% wealth players and alliance leaders, to protect them from real account theft (very different from in-game hacking, and we must make that distinction loud in the UI).

### 5.2 Identity layers

| Layer | Lifetime | Contents |
|---|---|---|
| Account | forever | login, email, country (§2.2), age band, purchases, bans |
| Profile | forever | handle (unique, changeable once per season), avatar, titles, trophies, Hall of Fame, cosmetics, reputation history |
| Character | forever (one per account in the one world) | money, assets, AIs, connections, legal record, alliance, league |
| Season record | one season | ladder scores, season titles, season stats for the recap |

- **Display identity:** handle plus optional company name ("vega · Northline Capital"). Legal names never shown.
- **Reputation** (persistent): a public record of tenure, season ranks, convictions (Tape), contracts honored vs defaulted. Contract counterparties see it before signing. This is the main deterrent against scamming in P2P (more on that §7).

### 5.3 Compliance basics

- Age: 13+ globally, 16+ in EU countries that require it for data consent (or parental consent flow). Since the game is about money, markets and hacking, a 16+ rating is simpler; open question for Mathis.
- GDPR: data export and account deletion from settings. Deleting an account anonymizes the character ("Former player #8812") so the event log and other players' histories stay consistent.
- Clear in-game disclaimers: fictional markets, no real money in or out, nothing is financial advice. No cash-out path ever exists, which also keeps us out of gambling law.

---

## 6. Leaderboards and leagues

### 6.1 Ranking metric

Primary: **Net Worth Index (NWI)** from Quant = net worth ÷ world money-supply index, so year-3 numbers stay comparable with launch. Illiquid assets are marked at fair value, not last print, so nobody can pump their rank by trading a thin asset with an alt.

Storage: Redis sorted sets per board and per country, which handle millions of entries with fast rank lookups. Top 100 update live (every game hour), full boards every game day, and league tables every real day at a fixed time.

### 6.2 Boards

Every board exists in three scopes: **global**, **country** (§2.2) and **season** (resets every 8 weeks; the all-time version never does).

| Board | Ranks by | Why |
|---|---|---|
| Richest (all-time) | NWI | The headline board |
| Richest this season | NWI gain this season, excluding P2P inflows (Quant §14.4) | Late joiners can win it |
| Fastest climber | `ln(NW_end / max(NW_start, $100k))` this season (Quant §14.4) | Comebacks; the $100k floor stops fresh-alt farming |
| Trader | Season Sharpe ratio with minimum volume | Skill, not size |
| Tycoon | Business profit per game year | Builders |
| Alliance | Sum of top 20 members' NWI | Team play |
| Prestige | Lifestyle and collection score (Velvet) | Flex |
| Most Wanted | Successful hacks on unique, unlinked victims, minus convictions; opt-in, cosmetic only (Tape) | Villains |
| Defender | Sessions found and disconnected, value protected | Status for being hard to crack |
| City and sector boards | Profit per city or sector | Lots of small crowns |

Season boards crown season titles ("Season 3 Fastest Climber, France"). Rewards are titles, cosmetics and Prestige only, never money.

### 6.3 Leagues

Weekly leagues by NWI bracket inside the one world. With no reset they matter even more, because they're where a new player competes with peers:

| League | Bracket (by world NWI percentile) | Group size |
|---|---|---|
| Penny | bottom 30% | 50 |
| Retail | 30–60% | 50 |
| Pro | 60–85% | 50 |
| Institutional | 85–97% | 50 |
| Titan | top 3% | 30 |
| Apex | top 100 in the world | 1 group |

- Top 10 of a group promote each week and the bottom 10 drop. League score is % NWI growth that week, so a $100k player can beat a $10M player in their own group.
- Groups mix join dates and timezones, and players are placed by NWI, never by choice (no sandbagging into a weaker league).

### 6.4 Season finish rules

- The final season ladder score uses NWI averaged over the last 3 game days, not a single tick, so nobody wins with a last-second pump or a leveraged moonshot.
- The finish is a 24-hour window, so no timezone has to be awake at 4 a.m. to defend a rank.
- Positions in player-issued assets (your own IPO or token) are marked at the lower of fair value and 3-day VWAP for ladder purposes.
- There's no leverage-cap change at season end, because the world doesn't reset and real empires shouldn't be forced to deleverage for a ladder.

### 6.5 Hall of Fame and legacy

- Permanent per-season records: champions of every board globally and per country, biggest single trade, biggest crash survived, longest-undetected session caught in court, longest-lived alliance.
- **Tenure:** the profile shows seasons played and peak all-time rank. Since nothing resets, there's no separate legacy perk; tenure and titles are the legacy.

### 6.6 Season Finals

See §2.4: the top 100 of the season ladders play a 48-hour challenge event with identical starting portfolios and a spectator page.

---

## 7. Alliances and corporations

### 7.1 Structure

| Tier | Members | Unlocked by |
|---|---|---|
| Partnership | 2–5 | Free |
| Firm | up to 15 | $5M charter fee (sink) + HQ office |
| Corporation | up to 40 | $250M + HQ tower in a city |
| Conglomerate | up to 40 + 3 subsidiary firms | $5B net alliance worth |

Caps stay small even in a huge world on purpose: an alliance of 160 people at most is a group whose members know each other, and blocs above that form through contracts between alliances (§7.3), which are visible and breakable.

### 7.2 What an alliance can do

- **Treasury:** shared account funded by voluntary contributions or a member tax set by leaders (0–10% of business income). All movements on the public-to-members ledger.
- **Roles:** Chair, Treasurer, CISO (security), General Counsel (legal), Analyst, Member. Permissions per role (spend limit, approve deals, launch cyber ops, hire lawyers).
- **Syndicates:** pool money for one deal too big for one member (buy a T5 business, a stadium, a takeover). Ownership is split pro rata via a contract (§8), so profits flow automatically.
- **Shared defense:** a Corporation can buy a **SOC (security operations center)** that adds a defense bonus to every member, scaling with treasury spend. Joining an alliance is how mid-size players survive whales.
- **Shared intel:** a research feed members can publish into (AI signals, tips, rumors about rivals). Leaking alliance intel to another alliance is the classic betrayal (espionage, Tape).
- **Joint cyber ops:** combine several members' cyber AIs against one target for a bigger attack score. Detection risk is shared, and the court can charge every participant (Tape).
- **Alliance HQ** in a city raises that district's desirability (Quant's real-estate model), so alliances cluster and fight over districts.

### 7.3 Alliance conflict

- **Rivalries:** declare a public rivalry with another alliance for a league week. Rival-vs-rival actions (shorting their IPOs, takeover bids, legal suits, hacks) score points on a rivalry board. Winner gets a cosmetic trophy for their HQ. Purely a framing layer on existing systems, cheap to build, great for drama.
- **Mergers and acquisitions:** two alliances can merge by vote. An alliance can buy a majority of another's member companies (player takeovers per Quant).
- **Betrayal:** a Treasurer can steal from the treasury. It's possible, and it's **embezzlement**: an automatic, high-detection court case, the betrayer's reputation is marked forever. Drama with consequences.

### 7.4 Leaving and kicking

- Leaving costs a cooldown (48 h before joining another alliance) so nobody hops alliances for perks or spies by joining and leaving.
- Kicked members keep their own assets; syndicate stakes stay as contract holdings.

---

## 8. Player-to-player trading and contracts

### 8.1 Markets between players

| Market | What trades | Mechanism |
|---|---|---|
| Exchanges (Quant) | stocks, crypto, commodities, bonds, derivatives, player IPOs | per-tick batch auction |
| Business & property exchange | businesses, buildings, land | listings + bids, settles at tick, 2% tax, Quant's off-market price checks |
| Collectibles auction house | watches, art, cars (Velvet) | English auctions ending at a set tick, with anti-snipe extension (+12 ticks if a bid lands in the last 12) |
| Data market | data sets (Ledger) | listings; buyer gets a license, seller keeps the original |
| Model market | trained models, licensed not sold | rental per game day; licensed models are watermarked (Ledger/Tape) |
| Services | marketing, property management, law, security, intelligence (Quant's player-to-player businesses) | service contracts |

### 8.2 The contract engine

Contracts are the deepest multiplayer system: they let players build relationships the designers never scripted, while staying enforceable. No free-text legalese: a contract is a **typed bundle of clauses** that the engine can execute.

Clause library (v1 → full):

| Clause | Example | Enforcement |
|---|---|---|
| Transfer | "I pay $2M, you give me Café #3" | atomic swap at a tick |
| Loan | "$10M at 8%/game year, 1 game year, collateral: Tower B" | auto-repay schedule; default → collateral seized |
| Lease | "Rent my office for $40k/game week" | recurring transfer |
| Revenue share | "You get 20% of this business's profit for 2 game years" | auto payout each game day |
| Equity stake | syndicate splits | pro-rata payouts, voting weight |
| Option | "Right to buy my stake at $X before tick T, premium $Y" | exercise button |
| Service level | "Your security firm guarantees defense +15; refund if breached" | engine checks breach events |
| Non-compete | "Won't open a café in Glasshill for 1 game year" | engine blocks the action, or penalty clause |
| NDA | "Won't share data set D" | breach detection via provenance → court (Tape) |
| Bounty | "$5M to whoever proves player X committed fraud" | paid on a court conviction (legal bounty only; hiring someone to hack is a crime, Tape's call) |
| Penalty | "$1M if any clause above breaks" | automatic or via court |

- **Escrow:** money and assets in a contract are held by the **Clearing House** (a fictional neutral institution) until conditions are met. No "trust me" scams for the parts the engine can verify.
- **What the engine can't verify** (e.g. "I'll vote with you") becomes a court claim. The court (Tape) reads the contract and the event log.
- **Templates:** common contracts as one-tap templates ("Sell business", "Loan with collateral", "Join syndicate"), advanced builder for pros.
- **Fees:** 0.5% contract registration (sink) + Quant's 2% P2P transfer tax on value moved.
- **Reputation shown at signing:** counterparty's default history, convictions, seasons played.
- **Anti-funneling:** contracts with off-market terms (price > 10% from fair value, loans at 0%, revenue share to a new account) are flagged and capped by account age (§10).

### 8.3 Public filings (new idea, big one)

Like real-world disclosure rules: when a player crosses ownership thresholds or gets big, the world learns about it with a delay:
- Holding ≥ 5% of any company → public filing within 1 game day.
- Top 200 NWI players publish a **quarterly holdings report** (top 10 positions) at each game quarter end, 1 game week delayed.
- Insider trades on your own IPO'd company are public (and a legal trap if you lie, Tape).

This creates a whole metagame: tracking whales, front-running their disclosed holdings, hiding size through syndicates or AI execution algos, and suing people who don't file. Real finance does this; it's free content.

### 8.4 Social layer

- **Chat:** country and city channels (slow mode; one global channel would be unreadable at 100k CCU), league group, alliance (with ops channel), DMs (friends or contract counterparties only, to cut spam). Text only at launch; profanity filter, report button, mute/block. Moderation tooling in §11.
- **Feed:** the "Wire", filtered by your country, cities, holdings and follows, mixing news, public filings, big trades, court verdicts, alliance events, and follows.
- **Follow players:** see their public profile, filings, titles, and trade receipts they choose to share.
- **Shared receipts:** one tap to share a trade, a hack defended, or a verdict as an image card (marketing loop for Velvet's design).
- **Notifications:** push (Web Push for installed PWAs, native push in Capacitor), email digest. Categories: detected attack (a scan flagged a session, a lawsuit, a takeover bid; never a silent plant), margin call, contract needs signature, lawsuit filed, league result, rival moved. Hard cap ~5 pushes per day unless under active attack.

---

## 9. Spectating and storytelling

- **Whale Watch:** a page tracking the top 50 globally and in your country: filings, recent public trades, headlines.
- **Replays:** every big event (crash day, a hostile takeover, a famous hack) can be replayed tick by tick from the event log as an animated timeline. Cheap because the event log already exists.
- **Season recap:** at each season's end every player gets a personal recap (peak worth, best trade, worst day, who hurt you most), shareable.
- **Live events page:** central-bank meeting countdowns, earnings calendars, the Season Finals clock.

---

## 10. Anti-cheat and integrity

### 10.1 Threats and counters

| Threat | Counter |
|---|---|
| Client tampering (fake balances, fake orders) | Server authority; client sends intents only; all validation server-side |
| Botting the UI with scripts (outside the in-game AI) | Rate limits per account (e.g. 10 intents/tick human max), input timing analysis, no advantage from speed (batching), and in-game AIs are cheaper than scripting anyway. Mild policy: automation outside the game's AI is against ToS, enforced on abuse patterns (24/7 activity, perfectly periodic inputs) |
| Multi-accounting / alt funneling | Device fingerprint, IP/ASN clustering, payment and email signals, behavior similarity, off-market trade detection (Quant), P2P caps by account age (day 1: $10k/day, day 7: $1M/day, day 21: uncapped below 10% of net worth), no P2P for guests |
| Collusion (two "rivals" farming lawsuits, fake hacks, wash trades) | Graph analysis on counterparties: pairs with repeated one-directional value flow get flagged; court settlements between linked accounts are voided |
| Real-money trading (selling accounts or in-game cash for real money) | ToS ban, P2P caps, flags on large transfers to new accounts, handle-change limits. No cash-out exists so the market stays small |
| Exploiting bugs | Event log lets us find every beneficiary of a bug; targeted rollback of exploit gains (not a world rollback) via compensating ledger entries |
| Account theft (real) | 2FA for top players, new-device alerts, 24 h hold on large transfers after a password/email change |
| Harassment and griefing | Chat moderation, block lists, protection period for new players, Tape's design caps on repeat targeting (same attacker vs same victim cooldown) |
| Leaking hidden sessions (datamining the client, diffing the connections list with a script) | Hostile and legit connections serialized identically, random rotating IDs, natural legit churn, list refresh limited to once per game hour (§4.2) |
| Alts planting sessions on each other to farm distillation | Sessions between linked accounts are voided like collusion settlements; distillation from a linked victim gives nothing |
| Timing attacks on news/seed | Batches close before publish, seed secret, commit-reveal entropy (§3.3) |
| Insider abuse (staff, us) | Admin actions are ledger events too, visible in an internal audit log; no admin can mint money without a reason code and second approval |

### 10.2 Enforcement ladder

Warning → asset clawback → temporary ban (character frozen, removed from boards for the season) → account ban. All enforcement is logged with evidence; appeals via support form. Shadow pools (flagged players matched only with each other in leagues) for low-confidence cases.

### 10.3 Integrity telemetry

World dashboard, also per partition and per country (feeds Quant's stabilizer too): money minted vs destroyed per tick by reason code, top 20 wealth deltas per game day with explanation breakdown, P2P flow graph, contract defaults, flagged accounts, tick timing.

---

## 11. Live ops and admin

- **Admin console (internal web app):** search players, view ledgers and event history, freeze accounts, issue compensations (with second approval), inject or cancel news events, pause the world (ticks stop, clients show "Market halted"), adjust config knobs Quant exposes, schedule events, read moderation reports.
- **Market halt** is diegetic: "Trading halted by the Exchange" so outages and emergency fixes don't break immersion.
- **Deploys between ticks:** each partition supports graceful handover (new version loads latest snapshot + log, takes over at a tick boundary); partitions roll one at a time. Target zero missed ticks per deploy.
- **Feature flags** for staged rollouts: try a rule in a challenge event first (ring-fenced portfolios, §2.4), then in one country or city, then world-wide.
- **Event scheduler:** central banks, earnings, finale, holiday events, all as data.

---

## 12. Web + mobile stack plan

### 12.1 Monorepo

```
trading-game/
  apps/
    web/        Next.js (App Router) — the game client, marketing pages, auth, REST/Server Actions
    server/     gateway, tick coordinator, partition workers (Node.js, WebSocket; one process at launch, §3.1)
    admin/      internal console (can start as a route group in web, split later)
  packages/
    engine/     Quant's pure TS engine (src/engine today, moved here when the server lands)
    protocol/   shared types + schemas (zod) for intents, deltas, contracts
    ui/         shared components built from Velvet's tokens
    config/     tsconfig, eslint, tailwind preset
  tests/e2e/    Tape's Playwright suite
  scripts/balance/  Tape's balance harness (imports packages/engine)
  docs/
```
pnpm workspaces + Turborepo. One `npm run dev` starts web + server + a local world.

Engine location (confirmed in RESOLVED-NUMBERS.md): `src/engine/` for the Phase 0 prototype; at the server phase it moves to `packages/engine` behind a path alias so imports don't change.

### 12.2 Client

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js + React + TypeScript (strict) | Agreed stack |
| Styling | Tailwind + CSS variables from Velvet's `tokens.css` | Design tokens as the single source |
| Real-time state | Zustand store fed by the socket; TanStack Query for REST | Tick deltas are a stream, not request/response |
| Charts | TradingView Lightweight Charts for price charts (Apache-2.0, has an attribution requirement to check), custom canvas/SVG for game visuals | Fast, small, mobile-friendly; license note for Velvet's DESIGN.md |
| Animation | Framer Motion (Motion) for UI, CSS for the tick pulse | Velvet's motion rules |
| Forms/validation | zod schemas shared with the server (`packages/protocol`) | One schema both sides |
| i18n | English first, French second (Mathis), keys from day one | Cheap now, expensive later |
| Accessibility | Gain/loss never by color alone (Velvet), keyboard trading on desktop, screen-reader labels on numbers | Fairness and reach |

**Performance budgets:** first load < 200 KB JS on the trade screen (gzipped), tick render < 8 ms on a mid-range Android, chart updates without layout shift, 60 fps scrolling on lists of 500 positions (virtualized).

### 12.3 Server

| Concern | Choice |
|---|---|
| Runtime | Node.js 22 LTS (Bun as a later perf experiment) |
| WebSocket | `ws` or uWebSockets.js behind the gateway; MessagePack frames |
| DB | Postgres 16 (accounts, social, contracts, event log partitions, read models) via Drizzle ORM |
| Cache / pub-sub / boards | Redis (streams for intake, sorted sets for leaderboards, presence) |
| Object storage | S3-compatible for snapshots, archives, share images |
| Jobs | BullMQ (season close, estate auctions, recaps, emails, projections rebuild) |
| Observability | OpenTelemetry → Grafana stack; tick-time histogram as the #1 metric; Sentry for client + server errors |

### 12.4 Hosting (proposal, needs Mathis's budget call)

- Web app on Vercel (or the same box as the server to keep costs down early).
- World + gateway + Postgres + Redis on a single VPS for alpha (e.g. a Hetzner or similar dedicated box in the EU), then managed Postgres and more partition hosts as the world grows (§3.1).
- Rough cost guess, to be checked against real pricing when we pick: alpha under ~$50/month; the launch target (5k CCU) in the low hundreds per month, growing roughly with CCU. Cheap because the sim is batch-based and clients are thin.

### 12.5 PWA, then native

**PWA (phase 2):** web manifest, install prompt, service worker caching the shell and static assets (never market data), offline screen showing the last snapshot read-only, Web Push (works on iOS for home-screen-installed web apps since iOS 16.4).

**Capacitor (phase 4):** same Next.js build exported as static where possible; dynamic pages served from our domain inside the WebView, or a static export with all data via API/socket (preferred for store review and offline shell). Native plugins: push, haptics on fills and attacks, secure storage for tokens, share sheet, biometric unlock.

Store specifics to plan for:
- App Store: Sign in with Apple, privacy nutrition labels, simulated-trading disclaimer in the listing (finance apps get extra review attention), any purchases through IAP.
- Play Store: data safety form, target API level, same disclaimer.
- Both: age rating questionnaire (simulated gambling? we must answer "no" truthfully, so no loot boxes or chance-based paid items).

### 12.6 Key multiplayer screens (for Velvet to spec, Forge to build)

1. Season hub (chapter theme, ladders, countdown, country rank, your past seasons).
2. Trade terminal (chart, book, order pad with tick countdown, positions).
3. "While You Were Away" report.
4. Wire (world feed) and Whale Watch.
5. Leaderboards with league group view.
6. Player profile (titles, reputation, filings, public receipts).
7. Alliance HQ (treasury, roles, ops board, syndicates, chat).
8. Contract builder and inbox (templates, clause cards, escrow status, signatures).
9. Auction house and business/property exchange.
10. Court docket and case view (with Tape).
11. Season recap.
12. Model connections panel (§4.2; Velvet owns the look, Tape the clues).
13. Country and region boards with country switcher (§2.2).

---

## 13. Core data model (sketch)

```
account(id, email, country, country_changed_at, age_band, created_at, flags)
profile(account_id, handle, avatar, titles[], reputation_json)
season(no, theme, starts_tick, ends_tick, phase)
character(id, account_id, partition_id, league_id, alliance_id, status: active|inactive|dormant|estate)
season_record(season_no, character_id, nw_start, nw_end, ladder_scores_json, titles[])
ledger_entry(id, partition_id, tick, debit_acct, credit_acct, amount, currency, reason_code, ref_id)
hold(id, tick, from_partition, to_partition, amount, status)              -- cross-partition money (§3.2)
intent_batch(partition_id, tick, engine_version, payload_hash, payload)  -- event source
event(partition_id, tick, seq, type, payload)                             -- derived, for read models
snapshot(partition_id, tick, uri, state_hash)
session(id, victim_model_id, attacker_char_id, opened_tick, strength, cover_label,
        distill_progress, clue_profile, status)                           -- hidden sessions (§4.2)
connection(id, model_id, kind, label, opened_tick, public_id)             -- what the panel shows; sessions appear here identically
challenge_event(id, kind, ruleset, starts_tick, ends_tick)                -- ring-fenced portfolios (§2.4)
contract(id, parties[], clauses_json, escrow_json, status, signed_tick)
alliance(id, tier, name, treasury_acct, charter_json)
alliance_member(alliance_id, character_id, role, joined_tick)
filing(id, character_id, tick, kind, payload)
league_group(id, league, week_no)
board_snapshot(board, scope: global|country|season, scope_key, tick, rows_json)
chat_message(channel_id, author_id, ts, body, moderation_state)
report / sanction / appeal
```
Money is integer cents (or micro-units for crypto) in `bigint`, never floats. Quant's engine works in the same units at its boundary.

---

## 14. MVP vs full build

Build order is chosen so the game is **fun alone before it's multiplayer**, and multiplayer before it's adversarial. Each phase ends with Tape's PASS.

### Phase 0 — Single-player sandbox (proves the fun)
- Next.js app, engine runs **in the browser** (fine because there's nothing to cheat against yet), local save (IndexedDB) with export/import.
- Quant's MVP market slice: 1 city, 30 stocks, 5 crypto, gold/oil, 15 businesses, 3 districts.
- Screens: terminal, portfolio, businesses, city, news, simple progression.
- Tick speed slider (1×, 4×, 20×) for testing.
- Exit check: a new player understands the loop in 10 minutes and wants to come back.

### Phase 1 — Online single world (closed alpha, ~150 CCU)
- Accounts (guest + email + Google), gateway, coordinator and partitions running in one process, Postgres event log, snapshots. This is the real one world from day one; partitioning is code structure until load needs more machines.
- Same content as phase 0, now shared: shared prices, shared city demand, batch auction with real players.
- Global and country leaderboards, basic profile, country chat, Wire feed, "While You Were Away".
- Admin console v1 (search, freeze, halt, compensate).
- Exit check: 5,000 CCU + 40,000 agents synthetic load test passes p99 tick < 2.5 s; 2 weeks of alpha with no ledger mismatch.

### Phase 2 — Seasonal ladders and social (open beta)
- 8-week season chapters, season ladders (richest this season, fastest climber), Hall of Fame, leagues, all boards in §6.2, inactive and dormant rules (§3.7).
- Alliances (Partnership, Firm), syndicates, contract engine v1 (transfer, loan, lease, revenue share), escrow.
- Business/property exchange, auction house, public filings.
- PWA install + Web Push. French localization.
- Anti-cheat v1 (alt detection, P2P caps, collusion flags).

### Phase 3 — The adversarial layer (with Tape and Ledger)
- AI tech tree, trading AIs, hacking as hidden sessions (§4.2) with defense scans and the connections panel, distillation, court system, insurance.
- Corporations and Conglomerates, joint ops, rivalries.
- Challenge events and Season Finals (§2.4), estate auctions.
- Derivatives and IPOs/takeovers from Quant's later layers.

### Phase 4 — Native apps and scale
- Capacitor iOS/Android, native push, haptics, biometric unlock, store releases.
- Multi-machine partitions and rebalancing (§3.1), coordinator standby failover, load test to 100k CCU + 750k agents.
- Replays, season recap videos/cards, spectator pages.

**Rough effort:** with the team's current setup, Phase 0 is the realistic first build target and could be a few focused weeks. Phases 1–2 are where most engineering goes (server, persistence, contracts). I'd rather not promise dates until Phase 0 exists and we know our real velocity.

---

## 15. New ideas summary (from this section)

1. **Challenge events** with ring-fenced portfolios (speedrun, crash course, no-hack, chaos): rule test beds and weekend content inside the one world.
2. **Public filings** with delays: whale tracking, front-running, and disclosure lawsuits as a metagame.
3. **Rivalries** between alliances: a framing layer that turns existing systems into a weekly score.
4. **Season Finals**: the season ladders' top 100 play a 48 h event with identical starting portfolios.
5. **Clearing House escrow + typed clause contracts**: player-built relationships the engine can enforce.
6. **Embezzlement as a real move**: treasurer betrayal possible, permanently on your record.
7. **Commit-reveal entropy**: provable fairness for the RNG, a trust feature we can advertise.
8. **Replays from the event log**: crash days and famous hacks as rewatchable stories.
9. **Defender board**: rich players get status for being hard to crack, giving defense spending a payoff beyond safety.
10. **Diegetic outages**: "Trading halted by the Exchange" instead of error screens.
11. **Dormant players and estate auctions**: ghosts don't clog the world or feed hackers free targets, and their empires return to the market.
12. **Tick pulse UI**: the 5 s heartbeat as the game's signature visual rhythm (Velvet).
13. **Country boards**: national pride on top of one shared economy, with "France vs Germany" style season scores.
14. **Decoy anomalies**: the server generates harmless oddities so spotting a hidden session takes judgment, not a checklist.
15. **Disconnect costs**: cutting a connection breaks what it did, so paranoia has a price.

---

## 16. Touch points with other sections

- **Quant (01):** one-world scaling (01 §14: cities per ~4k `N_a`, per-asset clearing split by asset group, dormancy and estate rules, season ladder formulas, all used here), `NPC_scale` formula, tick pipeline budget for `step()`, fair-value marks for leaderboard and anti-funneling, P2P tax and caps, engine location move to `packages/engine`, money as integer units. Quant's estimate: ~40–75 ms per 1k CCU per core group (to be benchmarked). Still need: the list of tunable knobs for the admin console.
- **Tape (03):** court reads contracts + event log via the replay API; collusion and alt signals feed the regulator; harassment caps; bounty clause rules; embezzlement case; new-player protection (agreed: 72 h, ends on your first attack, then a rookie zone until day 7 or $1M). Most Wanted agreed as opt-in and cosmetic-only. Breach floor now 1%. Needed from Tape for hidden sessions (§4.2): the accrual curve and its ceiling, the offline multiplier, DU drain % by strength, false-alarm rate for decoy anomalies, scan cadence and detection odds by defense tier, per-attacker and per-victim session caps, and the disconnect and lockdown costs. Court-vs-engine clause split: Tape 03 §15, which the contract engine (§8.2) follows.
- **Ledger (05):** AI executes server-side with decision-unit budgets; models are parameters, distillation is an event; model licensing and watermarking on the model market. Per-tier DU budgets resolved (§4.1). Needed: how distillation progress maps into the attacker's student model quality.
- **Velvet (04):** screen list (§12.6), tick pulse, shared receipt cards, league and title cosmetics, Lightweight Charts license note for DESIGN.md. New for Velvet: the model connections panel (fields are identical for hostile and legit entries, so all suspicion comes from labels, timing and usage graphs), how busy a normal list is per tier, how clues and decoy anomalies look, country boards and the season hub. Velvet has specced my earlier §12.6 screens plus 8 more in 04 §10, and the first-10-minutes flow is in 04; I'll place the guest-to-account upgrade against that flow when Phase 1 starts.

---

## 17. Open questions (for Mathis via Ledger)

1. **Resolved:** one persistent world, global and country boards, seasonal ladders (Mathis, 2026-10-07).
2. **Country choice:** OK that players get one country change per 180 days (it resets their season country score), and small countries roll into regional boards until 500 active players?
3. **Monetization:** none decided. If any, I recommend cosmetics and a season pass with cosmetic rewards only, no pay-to-win, no loot boxes. This affects store setup and age ratings.
4. **Age rating:** target 16+ (simpler for money + hacking themes) or 13+?
5. **Chat:** open country and city chat at launch (social, needs moderation effort) or alliance/DM only at first?
6. **Guest play:** allow playing before sign-up (better onboarding, more alt risk), as proposed?
7. **Hosting budget** for alpha and beta, and whether Mathis wants the server on infrastructure he already pays for.
8. **Phase 0 first:** OK to build the single-player sandbox (engine in the browser) before any server work?
