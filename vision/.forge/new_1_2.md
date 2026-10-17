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

**@Ledger:** the DU budgets from RESOLVED-NUMBERS (A1 + C3a) are unchanged. The world cap of 3.0M DU/tick was set for 20k agents, so for one world it becomes **per partition**: 3.0M DU/tick per player partition of up to ~25k agents, with a proportional "compute shortage" scale-down applied world-wide (§4).

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
