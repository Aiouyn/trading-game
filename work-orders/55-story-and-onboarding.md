# Work order 55: one story per session, and a first hour that teaches

Launch condition 6 in `docs/DIRECTION.md`: after 30 minutes a new player can say one thing that happened and why. Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md` and `sim/playtest/playtest-report.md` first.

You own new files `sim/modules/player/story.ts` and `sim/modules/player/tutorial.ts`, the scenario definitions and their texts in `sim/modules/player/`, and the hooks needed in `sim/modules/player/index.ts` to expose them through `view()` and `act()`. Do not change other modules or `ui/` (another agent builds the screens and will read what you expose).

## What to build

1. **The story feed.** Each game week, pick the 1 to 5 events that matter most to this player: things that happened to them, their family, employer, contacts, holdings and the firms they follow. Rank by money at stake and closeness. Write each as one plain sentence with its cause ("Your employer Coppercliff Mining cut 40 jobs, because copper fell 18% after the port strike"). Expose it in `view()` as `story: { day, text, eventId, weight }[]`, keeping the last 200.
2. **Headlines that are stories.** When a chain of events reaches the player (a rate rise → their mortgage cost → their savings), say it as one story, not five lines.
3. **Tutorial as play, not text.** For the "First paycheck" scenario: a sequence of small goals (check your sheet, open a bank account, buy your first share, read why it moved, ask a contact, take a loan, pay it back), each triggered by the world and finished by doing it, with one hint line at a time. Exposed in `view()` as `tutorial: { step, goal, hint, done }`. Skippable.
4. **Help that answers.** `help` lists commands by topic with one example each; `help <topic>` explains it with the player's own current numbers.
5. **Scenario texts.** Give every scenario an opening paragraph and a closing one (win and loss), written from the world's actual state at that moment (names, firms, numbers).

## Done

In `node sim/play.ts --scenario first-paycheck`, a scripted run of the tutorial finishes all steps, and every week shows at least one story line with a cause. `node sim/run.ts --years 10` still prints "Books balanced every day"; save and reload still match. Commit after `git pull --rebase`, push to v1-build, reply with a 3-month transcript of the story feed and your cost. Then stop. No test suites, no docs.
