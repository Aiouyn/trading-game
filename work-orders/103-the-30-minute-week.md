# Work order 103: the 30-minute week, played by five new players

Read `AGENTS.md`, `sim/README.md`, `sim/playtest/` (the agent-*.md personas and `run.ts`) and the `employer-week` scenario from order 104.

You own `sim/playtest/`. You may make small fixes in `sim/modules/player/` (wording, a broken command, a confusing refusal), nothing larger. Do not touch `src/`.

## Why

An outside reviewer suggested the real test: five new players play the same 30-minute scenario, then each answers four questions. If their answers differ in ways the game explains, the depth is working.

## Do

1. Play `employer-week` five times through the server's `/start` and `/act` (or `sim/play.ts`), once per persona: a cautious saver, a leveraged trader, a loyal worker who wants to protect colleagues, an ambitious climber who wants control of the firm, and a curious newcomer who reads everything. About 40–80 commands each; play it, do not script a fixed path.
2. After each, answer as that player:
   - What did you know that the market didn't?
   - Why did you take the risk you took?
   - What happened that you didn't expect?
   - What do you want to try next time?
3. Fix small problems you hit in `sim/modules/player/` (unclear text, a command that fails for no good reason). List the larger ones.
4. Keep the transcripts short in `sim/playtest/` if useful; no other reports.

## Done

In your reply: the five answer sets (short), how different the five outcomes were and why, the fixes you made and the larger problems left. Then `node sim/run.ts --years 10` showing "Books balanced every day". Commit after `git pull --rebase`, push to v1-build. Then stop.
