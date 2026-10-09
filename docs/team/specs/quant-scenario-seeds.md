# Scenario seeds

Short, hand-checked seeds that open inside a specific market, for challenges and for Tape. Same seed, same market for everyone.

## Data model and API

```
Scenario { id, seed, title, days, startRegime, note }
SCENARIOS: Scenario[]          // exported from src/engine
```

- Playing one is `createWorld(scenario.seed, defaultConfig({ initialRegime }))`. No second code path.
- The weekly challenge (Forge) picks `SCENARIOS[weekNumber % length]` so every player that week shares a market. Week number comes from the calendar, not from the engine.

## Rules and numbers

Phase 0 ships six, each verified by a sim run checked into the test:

| id | Opens in | What the player meets | Length |
|---|---|---|---|
| contraction-week | contraction | a falling market, gold holds up | 21 days |
| overheating | overheating | a hot market that can roll over | 21 days |
| flash | expansion, event forced on day 2 | the flash from the world-event spec | 5 days |
| earnings-heavy | expansion | at least 4 stocks report in the first 10 days | 21 days |
| quiet | expansion | no jump larger than 3% in 21 days | 21 days |
| crypto-winter | contraction | crypto down, stocks mixed | 21 days |

`flash` and `crypto-winter` depend on the world-event spec. Until that lands they are listed but not exported, so nothing ships half-wired.

## Edge cases and exploits

- A scenario is a seed, not a script. The player can still lose, and nothing guarantees a profit. The test checks that buy-and-hold is not positive in every scenario.
- Saves record the seed they started from, so a reload does not reroll.
- Sharing a result is an opt-in export. The engine only guarantees the seed reproduces the market, and it does not publish the player's orders.

## Acceptance

- Each exported scenario reproduces its headline condition on a fresh run.
- Two machines, same seed, byte-identical prices (the existing Linux/Windows check).
