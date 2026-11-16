# Work order 49: six stats, words first, and "why?" on every number

You own `ui/`, `sim/server.ts`, `sim/play.ts` and the player view in `sim/modules/player/`. Read `docs/DIRECTION.md` (sections "Surface rule" and launch conditions 4 and 6), `AGENTS.md` and `sim/README.md` first.

## Build

1. **The six stats** on every screen: net worth, cash (amount and weeks of runway at the current spending), stress, health, reputation, regulator attention. Each shows a word first (for example Calm, Strained, Breaking), a trend arrow, and the number on hover. Compute reputation and regulator attention from what the modules already hold (social standing, open investigations, the player's flagged trades); add the smallest exported functions where needed.
2. **"Why?" everywhere.** Every number on every screen (prices, profits, wages, rates, the six stats, a firm's staff count) has a "why?" that opens its cause chain down to named people. Where a number has no event, find the event that last changed it, or add one in the module that sets it (keep each addition small and list them).
3. **No hidden numbers.** Relationship values, personality facets, memories and habit timers appear only as words and a one-sentence reason (for example "Trusts you: you warned her about the Coppercliff crash").
4. **Choices with costs.** Each of the six stats can be moved by at least one player choice, with a cost and a cooldown (for example a holiday lowers stress, costs money and a month; a donation raises reputation; a lawyer lowers regulator attention). Use existing commands where they exist.
5. **Text mode too**: `play.ts` shows the six stats as words on its status line and accepts `why <thing>` for any number it shows.

## Done

A screenshot of the desk with the six stats, and of three different "why?" chains opened from three different numbers, all ending at named people. ## Done

`node sim/run.ts --years 30 --seed 1` (and seeds 2 and 3) finish with books balanced every day; save and reload still match (`SIM_POP=3000 node sim/worldgen.ts --years 7 --seed 5 --out /tmp/w`). Commit after `git pull --rebase`, push, and reply with what this order asks for and your cost. Then stop.
