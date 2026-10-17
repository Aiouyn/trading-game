# Rumors and insider tips

Some tips are true, some are noise. Trading on a tip that came from a real upcoming number is what the regulator can see. Phase 0 records the facts; fines and court stay with Tape (03). No real-money anything.

## Data model and API

```
Tip { id, tick, assetId, claim: 'up' | 'down', truth: boolean, insider: boolean,
      source: 'rumor' | 'insider', revealsTick, logMove }
WorldState.tips: Tip[]          // kept 60
WorldState.flags: { playerId, tipId, tradedBeforeReveal: boolean }[]
```

- `postTip(state, tip)` is engine-side only. The app never invents truth.
- Stream `news:tips`, separate from price streams.
- A tip points at a jump that is already scheduled: the engine draws the next earnings surprise one quarter ahead and locks it, and a tip either leaks it or invents the opposite.

## Rules and numbers

- Rumors: 3 per game week across the whole market. 55% true (inside the bible's 40–70%). A true rumor names the sign of the next earnings move; a false one names the other sign. `insider: false`.
- Insider tips: not generated in normal play. They are created only by a later crime action (Tape). When one exists it is always true and `insider: true`, and it carries the exact log move.
- The number stays hidden until `revealsTick` (the earnings print). Before that, `wire` shows the claim and the source, never `truth`.
- If the player buys or sells that asset between the tip and the reveal, the engine appends a flag. Only `insider: true` flags are prosecutable. Rumors never are, even when true. That is the line the court uses.
- A rumor carries no priced-in band at all, so it is not a preview of the drift.

## Edge cases and exploits

- A tip about an asset the player cannot trade yet is not flagged.
- Selling a position opened before the tip is not a flag (only orders placed after the tip tick).
- Refreshing or reloading cannot reroll a tip: it is in the save.
- Ad cash and gifted cash (bankruptcy) can fund a rumor trade; they cannot fund an insider action. The engine rejects an insider tip while the account carries unspent ad or comeback cash from the last 21 days. Flag for Forge's save format.
- False rumors must not be right more than 60% of the time over 200 seeds, or the "some are fake" promise is a lie.

## Acceptance

- 55% ± 8 points true over 200 seeds. Insider tips 100% true and 100% flagged when traded.
- A rumor trade produces zero flags.
- Prices with no tips consumed match the no-tip fingerprint (the early draw is cached, not an extra shock).
