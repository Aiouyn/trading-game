# Resume this project

This folder is the whole trading game as of 2026-10-09: the playable app, the design bible, the later specs, the proof logs, and the Grok Bot chats that produced them. Read this file first. Do not treat `vision/ROADMAP.md` section 0 as the current tree. That section was written at 00:58 and the repo has moved since.

## Who did what

Mathis owns the product. His decisions are in Ledger's chat and in the group. The five bots shared one cloud computer. Their role text is in `grok-bot-export/01-roles.md`.

| Person | Chat | Canon they wrote |
| --- | --- | --- |
| Ledger, project chief | `grok-bot-export/03-ledger.md` | `vision/MASTER-BIBLE.md`, `vision/05-ai-research.md`, `vision/RESOLVED-NUMBERS.md`, `vision/ROADMAP.md` |
| Quant, markets | `grok-bot-export/04-quant.md` | `vision/01-markets-economy.md`, `specs/quant-*.md`, `engine-staging/`, `scripts/company/` |
| Forge, app | `grok-bot-export/07-forge.md` | `vision/02-multiplayer-systems.md`, `src/`, `specs/forge-desktop-shell.md` |
| Tape, QA | `grok-bot-export/05-tape.md` | `vision/03-conflict-legal-fairness.md`, `specs/tape-*.md`, `proof/`, `scripts/tape/tape_v15_joint.py`, `scripts/tape/tape_v16_backlog.py` |
| Velvet, visuals | `grok-bot-export/06-velvet.md` | `vision/04-experience-lifestyle.md`, `design/`, `handoff/DESIGN.md`, `specs/velvet-*.md` |
| All five together | `grok-bot-export/02-trading-game-team.md` | the group thread |

Raw JSON of those chats is in `grok-bot-export/raw/`.

## What is code, and what is only a spec

`src/` is the playable Next.js app on this PC. Git HEAD when these files were added was `a24e507` (catalysts in the live engine). Run it with `npm install` then `npm run dev`. Tests are Vitest (`npm test`) and Playwright (`tests/e2e`).

`engine-staging/` is Quant's later engine. It is not wired into the app. It has ecology, news, signals, drift, and alt-peak tests that `src/engine/` does not. `src/engine/` has `catalysts.ts`, which staging does not. Keep both. Do not copy one over the other.

`engine-drops/` holds three small archives (`engine-drop.tar`, `engine-drop2.tar`, `engine-drop3.tar`) from before staging. Staging is the newer tree.

Company building has no engine code. Tape says so at the top of `specs/tape-company-building.md`. The checks are modelled in `scripts/tape/tape_v15_joint.py` and `scripts/tape/tape_v16_backlog.py`, and in `scripts/company/signal_cap_breakeven.py`.

## Read order

1. `vision/00-mathis-vision.md` is the original pitch.
2. `vision/MASTER-BIBLE.md` and `vision/RESOLVED-NUMBERS.md` are the 2026-10-07 design, with Mathis's calls folded in (one persistent world, 1% breach floor, hidden sessions capped at 0.85, Ink & Brass).
3. `vision/01` through `vision/05` are the long sections behind the bible.
4. `vision/ROADMAP.md` is the build order. Its phase list is still the plan. Its "state of play" is not the current tree.
5. Company work, which is where they stopped: `specs/quant-company-building.v1.6.1.md`, then `specs/tape-company-building.md` (the v1.6.1 run), then `specs/velvet-company-app.md`. Older company drafts are the `quant-company-building.v1.3.md` through `v1.6.md` files. The unversioned `specs/quant-company-building.md` is the copy Tape hashed for that run.
6. The morning of 2026-10-09 after that run is only in the chats, not in a new spec file. Read the ends of `grok-bot-export/03-ledger.md`, `04-quant.md`, `05-tape.md`, and `02-trading-game-team.md`.

When a chat and an older bible line disagree, the later chat is the call. Ink & Brass is the default palette (`design/redesign/`).

## Where they stopped

Tape's v1.6.1 run failed. It is modelled, except the post-print drift probe, which was an engine run. No company code exists.

Still failing, from `specs/tape-company-building.md`:

- Public bots can still make money on predictable company news (hiring carry, shipped-revenue noise). Tape ids G18 and G20.
- The price only takes in about 70% of a big print the same day. A bot that follows the print wins. Tape id G21.
- A friend or a second account outside the covered set, or a derivative hedge, can keep the gain from fake orders. Tape id G16.
- Founder-sold fakes mostly fail to beat an honest seller after the v1.6 repayment. `freeOverflow` is the exception. Tape id G15.

Ledger's rulings for a v1.7 are in the Ledger chat that morning, and are not written into `specs/` yet:

- G15: book only orders the company can fill. Drop overflow orders.
- G16: count net derivative shorts in `S_k`. Extend the backstop to positions opened in the window and to split accounts. Caught tippees forfeit the gain.
- G21: print scheduled company signals in full at once, on player-company stocks only. Worlds with no player companies must stay byte-identical to the ecology sign-off.
- G22: rerun the correlation check on the engine after the G20 change. Leave the band where it is.

Quant's last note, still unfinished, is an alt-peak mark rule in `engine-staging` (`altpeak.test.ts`). Velvet's Company app mocks are in `design/redesign/` and `specs/velvet-company-app.md`.

## Leave the cloud copy behind

The WeTransfer zip also contained `review/app/node_modules` and a Linux build cache. Those were not copied. `review/app` was an older mirror of this repo (the roadmap names it at `02b780e`). This PC's `src/` is the app to continue.
