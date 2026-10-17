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
