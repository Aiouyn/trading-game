# Work order 71: words a person would write

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`. Every line the player reads comes from the simulation: letters in `sim/modules/circle/`, the weekly story in `sim/modules/player/story.ts`, headlines and rumours in `sim/modules/social/` and `sim/modules/media/`, and the "why" explanations. Much of it reads like a machine: "789 people are left on the floor", "I am number 396", "$96000.75", "I am no longer where I was", the same sentence shape from every writer.

You own the text-producing functions in `sim/modules/circle/`, `sim/modules/media/` and the headline and rumour wording in `sim/modules/social/`. Change words, never behaviour: the state hash of `node sim/run.ts --years 10 --seed 1` must stay the same before and after (text is not hashed; if it is, say so and keep the numbers identical).

## Do

1. **One money and number style everywhere**: `$96,000.75`, `$1.2 million` above a million in prose, `789 jobs`, percentages with a sign. A shared formatter, used by every module you own.
2. **Letters sound like people.** Several sentence templates per letter kind, chosen by the writer's facets (warm, blunt, anxious, proud, formal) and the bond (close friends are casual, rivals are cold, family worries). Refer back to shared history ("since the dinner in March"). No two letters in a row from different people may share the same sentence shape. Plain English, short sentences, no jargon like "on the floor" or "the seat".
3. **Headlines read like a newspaper**: varied verbs, the stake in numbers, the firm's name and sector, the city.
4. **Illness and death reach the circle**: when a contact or their family member falls ill or dies (the health module already decides this), the right people write, with the right tone.

## Done

`node sim/run.ts --years 10` prints "Books balanced every day" with the same hash as before your change. Paste 30 letters and 15 headlines from a 3-year run, before and after. Commit after `git pull --rebase`, push to v1-build, reply with that and your cost. Then stop.
