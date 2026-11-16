# Port Avalon: direction and release plan

Written 16 Nov 2026 against `v1-build` at `e0da8d4`. This is the direction every work order should serve. It is not a work order: build nothing from it without one.

## What the game is

A life lived in a city where every price, job and scandal traces back to named people.

The finance simulation supplies the stakes. The story generator supplies the meaning. Neither is enough alone: the Wall Street Raider remaster has the finance and about 116 Steam reviews; RimWorld and Dwarf Fortress sell millions on stories.

| Finance sim gives | Story generator gives | Rule for the game |
|---|---|---|
| Prices, earnings, defaults computed from actor state | Named people with families, moods and memories | Every market move opens, in one click, on the people who caused it |
| Net worth as a score | A life: job, home, spouse, children, health, reputation | Money is the means; the life is what the player protects |
| Margin calls, bankruptcy, prison | Loss the player cares about | Ruin is real, and play continues as the heir |
| A ledger of every cent with its cause | A history worth reading | A chronicle of the city and the dynasty that the player can export and share |
| 200,000 simulated people | A cast the player remembers | Full detail only for the few dozen people around the player |

Dwarf Fortress grew this way: players wrote up what the simulation produced, the stories spread, and new players came. `sim/modules/history/chronicle.ts` is the start of the same thing here.

## Surface rule

Simple on top, deep underneath.

- The player sees six stats: net worth, cash (amount and weeks of runway), stress, health, reputation, regulator attention.
- Bars show a word first (Calm / Strained / Breaking) and the number on hover, with a trend arrow.
- Every number has a "why?" that opens `w.events.explain()` down to a named person.
- Every stat moves through a choice the player makes, and each choice has a cost and a cooldown.
- Relationship values, personality facets, memories and habit timers are never shown as numbers. They appear as words and one-sentence reasons.

## Launch conditions

Nobody outside plays until these six are true. They come from the repo's own reports.

1. **The player can lose.** `sim/bots/bots-report.md`: 0 bankruptcies in 220 runs. Margin calls, forced sales and personal bankruptcy must actually happen to the gambler and raider bots.
2. **No rule beats the market for free.** The value bot's 10th percentile (7.71x) beats the index median (4.88x); momentum does the same (5.80x against 4.58x). No coded strategy should.
3. **The law module is fair.** The index investor bot, which only buys the index, went to prison in 4 of 20 worlds and was caught 15 times.
4. **"Why?" works everywhere.** Any number on a screen opens its cause chain.
5. **A real playtest exists.** `sim/playtest/playtest-report.md` was run with "Model: fake (random valid commands, no API key)". Run it with real model personas, then five people for 30 minutes each.
6. **One story per session.** After 30 minutes a new player can say one thing that happened and why. If not, the screens are not exposing the simulation.

## Release plan

1. **Now**: close the six launch conditions; add the multiplayer groundwork below.
2. **V1, early access, single-player**: scenarios, sandbox, chronicle export, same-seed challenges, mods through the plain-text files in `sim/content/`.
3. **Updates**: expansions module by module, driven by reviews.
4. **Multiplayer update**: shared sessions of 2 to 8 players.
5. **Later**: a persistent city, only if sessions prove the demand.

Single-player comes first because the audience pays for the simulation and its stories (Dwarf Fortress and RimWorld are single-player), because multiplayer needs a player base to be worth joining, and because a shared economy with exploits is ruined quickly.

Multiplayer amplifies the simulation; it is not the product. What it adds: humans replace some of the simulated investors, chief executives and insiders, so rumours, lending, takeovers and reputation run between real people on top of the simulated population.

## Multiplayer groundwork that goes into V1

The sim is already deterministic, which is the hard part. Multiplayer will send only player inputs to identical simulations (the method Factorio uses), so these four must hold from V1 on.

| Requirement | State at `e0da8d4` | To do |
|---|---|---|
| Same seed gives the same world | Named streams in `sim/kernel/rng.ts`; no `Math.random` or `Date.now` in `sim/modules` or `sim/kernel` | Keep it that way. Never read the wall clock or an unnamed random source inside the sim |
| Proof that two runs agree | `sim/worldgen.ts` compares the ledger hash after save and reload | Also compare the daily hash between two machines (Windows and Linux) |
| Players act only through inputs | Every action is a `Command` passed to `act()` in `sim/modules/player/index.ts` | `sim/server.ts` and `ui/` never write world state. Record the command log with the day of each command; replaying seed plus log must reproduce the hash |
| More than one player | `PlayerState.who` is one person index; `playerIndex(w)` returns one | Hold a list of players keyed by id. `act(w, playerId, cmd)` and `view(w, playerId)`. V1 still runs with one |

## Same-seed challenges (in V1)

Everyone plays the same scenario on the same seed, alone, and compares the outcome.

- A challenge is a scenario id, a seed and a difficulty. Scenarios and seeds already exist in `sim/content/scenarios.txt`.
- The end screen gives a short code holding scenario, seed, difficulty, score and the hash of the command log, so a result can be shared and checked by replay.
- The end screen also exports the player's chronicle as text: the five events that mattered most with their causes, and the family tree.

## The clock in multiplayer (decide before the multiplayer update, not now)

Single-player lets the player pause and skip a month. A shared world has one clock.

| Mode | Time | Cost |
|---|---|---|
| Same-seed challenges | Each player owns their clock | Low. In V1 |
| Shared session, 2 to 8 players | One world, one agreed speed | Medium. Needs the groundwork above |
| Persistent city | One server, fixed clock, runs while players are away | High: hosting, cheating, an economy that never resets |

## Sources

- Repo at `e0da8d4`: `sim/README.md`, `sim/bots/bots-report.md`, `sim/playtest/playtest-report.md`, `sim/kernel/rng.ts`, `sim/worldgen.ts`, `sim/modules/player/index.ts`
- Factorio multiplayer: https://factorio.com/blog/post/fff-188 and https://factorio.com/blog/post/fff-76
- Dwarf Fortress community stories: https://dwarffortresswiki.org/index.php/Community_of_Dwarf_Fortress
- Dwarf Fortress sales: https://www.pcgamer.com/games/sim/dwarf-fortress-sells-1-million-copies-on-steam-so-now-bay-12-games-can-afford-that-little-party-it-planned
- Wall Street Raider on Steam: https://datahumble.com/wall-street-raider-3525620
- EVE Online economy: https://www.tentonhammer.com/guides/eve-online-market-primer-eve-online-guide
