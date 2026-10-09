# NPC rival funds (Phase 0)

Solo leaderboard fillers that trade the existing engine with a style, so the player is not alone and prices feel lived-in. They are not players: no account UI, no chat.

## Data model and API

```
Rival { id, name, style: 'value' | 'momentum' | 'degen', cash, positions, equityPeak }
WorldState.rivals: Rival[]          // 3 by default, config.rivals
```

- `rivalEquity(state, id)` and `leaderboard(state)` return the player plus the three rivals, sorted by equity. The public row is name and equity only. Style and positions stay inside the pool. Nothing on the board shows how a rival trades.
- They do not have an order path of their own. Hale is one member of the value pool, Pinn of the trend pool, Vetch of the crypto trend pool, in the market ecology. Their orders are part of that pool's flow and clear through the same impact as everyone else. Nothing is added twice.
- Own RNG stream `rival:<id>`, used only to break ties inside the pool, never the price streams. A save from before rivals loads with none.

## Rules and numbers

| Style | What it does | Rebalance |
|---|---|---|
| value | buys the 3 stocks furthest below their own value, read through a public value line: `lnV` plus one analyst-grade read per asset per 21-day epoch (sigma 0.088, the Hustler band). Hale never sees the true `lnV`, which no player can see (`lnP − lnVpub` most negative) | every 21 game days |
| momentum | buys the single stock with the best 63-day return | every 21 game days |
| degen | holds the 3 crypto with the best 21-day return, equal weight | every 5 game days |

- Names and starting cash are fixed. Display names are Hale & Ward, Pinn Partners and Vetch. Engine ids stay `hale`, `pinn` and `vetch`. Hale (value) starts at $7,000, close enough to the player's $5,000 that the rival you meet early is beatable. Pinn (momentum) and Vetch (degen) start at $50,000 and stay aspirational. Each rival's slice of its pool is capped at 5% of that asset's ADV per rebalance, and that slice clears with the pool, not beside it.
- Long only, whole shares, same fees as the player. They hold cash when nothing qualifies.

## Edge cases and exploits

- A rival never sees the next tick. It ranks on closes already printed.
- If the book is halted, the order waits like a player's.
- Rivals ignore the player's stops and never trade the player's own IPO (later phase).
- The pool's capacity limit is what stops a rival from being a free pump. Tape's band: no rival style beats buy-and-hold in more than 70% of seeds, same rule as the player strategies.
- Turning rivals off removes their slice of the pool. Prices then match a world whose pools never included them.

## Acceptance

- 3 rivals, deterministic per seed, equities finite, and their flow shows up inside the pool's cause vector rather than as a separate impact. A test asserts the public leaderboard objects have no style and no positions.
- A 60-seed run: each rival's median multiple over 5 years is between 0.4× and 2.5×, and none beats buy-and-hold in more than 70% of seeds.
- Price fingerprint with `rivals: []` matches the fingerprint with the field absent.
