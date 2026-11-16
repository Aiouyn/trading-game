# Work order 57: play the game as a real player and report

Launch condition 5 in `docs/DIRECTION.md`. You do not change any code. You play.

Read `AGENTS.md`, `docs/DIRECTION.md` and the top of `sim/play.ts` first. Your persona is given at the end of this prompt.

## How to play

Play in steps of about one game month, with your own judgement every step:

1. Start: `node sim/play.ts --scenario <scenario> --save <tmp>/s0` (pick the scenario that fits your persona; `help` lists commands).
2. Each step: write the commands you want into a script file, run `node sim/play.ts --load <tmp>/sN --script <file> --save <tmp>/sN+1`, read the screen output, decide the next step. Use `why`, contacts, the news and the firm pages the way a curious player would.
3. Play at least 40 steps or until the scenario ends.

## What to write

One file `sim/playtest/agent-<persona>.md`, at most 150 lines:

- The story of your session in 10 lines: what you did, what happened to you, and why (from the game's own explanations).
- **Confused**: each moment you didn't know what to do or what a screen meant, with the screen line.
- **Blocked**: each thing you wanted to do and couldn't, with the command you tried.
- **Bored**: stretches where nothing you did mattered.
- **Delighted**: moments that felt alive.
- **Broken**: wrong numbers, crashes, impossible states, with the command that caused them.
- Your top 5 fixes, ranked by how much they would improve the first hour.

Commit only that file after `git pull --rebase`, push to v1-build, reply with your top 5 fixes and your cost. Then stop.
