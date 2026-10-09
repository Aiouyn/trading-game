# T1 businesses for Phase 0

**On hold (Ledger, 2026-10-09).** The payback numbers below (about 90–105 game days) are not to be built. Mathis is choosing between the bible's ~6 game days, this pace, and Ledger's recommendation of about 20. Nothing here gets implemented until that answer.


The first tycoon loop: one city, a handful of cheap businesses, cash once a game day. The full logit model from 01 §4.1 is cut down so it fits the engine we have (no regions, no commodities-as-inputs market yet).

## Data model and API

```
BusinessDef { id, name, tier: 'T1', cost, baseDailyProfit, sector }
Business { defId, level, condition, lastCollectTick }
WorldState.businesses: Record<playerId, Business[]>
```

- `buyBusiness(state, playerId, defId)`, `collectBusinesses(state, playerId)`, `upgradeBusiness(state, playerId, defId, axis)`.
- Profit is paid into the same cash as trading. It shows in the portfolio as a separate `businessProfit` line so Tape can see it.
- Phase 0 catalog, all T1, all affordable from $5,000 with cash left for a trade:

| id | name | cost | base profit / game day |
|---|---|---|---|
| cart | Corner Cart | $2,500 | $28 |
| repair | Phone Repair | $3,000 | $32 |
| clean | Night Clean | $4,000 | $40 |
| bikes | Courier Bikes | $5,000 | $48 |

Payback is about 90–105 game days (roughly 4 real days at 1 game day = 1 real hour), faster than the bible's 6 real hours so the first business pays for itself inside a week of play. Numbers are a proposal for Tape to band, not a promise.

## Rules and numbers

- One of each. No second city in Phase 0, so no expansion axis. Axes that work now: capacity (+12% profit, cost 10% of the business × 1.18^n) and condition.
- Condition starts at 100 and falls 1 per game day. Below 50, profit is halved. `maintain` spends 2% of cost and restores 20 condition. This is the sink that stops a business being a bond.
- Collect is explicit, once per game day, so an idle tab does not mint money. Missed days are lost, not banked. That is the offline cap for Phase 0.
- Selling back to the city returns 85% of cost plus 85% of upgrade spend (01 §4.6). The 15% is the sink.

## Edge cases and exploits

- Buying with open orders: cash already reserved cannot be spent. Same reservation rule as trading.
- A business bought with ad cash or comeback cash earns normally, but its sale proceeds count as the same restricted cash for 21 days (see the rumor spec), so it cannot launder ad money into a hack.
- Collecting twice in one day pays once.
- Condition never goes below 0 or above 100. Profit is never negative in Phase 0 (no wages model yet).
- Conflict with the rank climb: four businesses at base rates earn about $148 a game day, so $5k to $20k from businesses alone takes about 100 game days. That is the "faster path" Velvet asked about, and it is still a real grind. Flagging it for Ledger rather than shortening it further.

## Acceptance

- Buy, collect, maintain, upgrade, sell: cash is exact to the cent, deterministic, and a JSON save round-trips.
- 21 missed days with no collect pays nothing for those days.
- Tape's band, proposed: a player who only runs businesses (no trading) reaches between $8k and $14k equity after 63 game days from a $5,000 start, across every seed (there is no randomness in T1, so one run is enough).
