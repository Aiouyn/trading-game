# Work order 93: play the new city and fix what breaks

Read `AGENTS.md` (including the Next.js block), `docs/DIRECTION.md`, and the recent work: the Diary and invitations (87, 90), the press (89: outlets, journalists, roundups, rumours and corrections, comments from the player), the yield curve (88), the macro rebalance (84) and the stability pass (82).

You own `src/apps/` and `src/components/`. Agents are editing `sim/modules/` (economy, labour, bots, corporate, markets, property, core) right now: do not change sim behaviour. You may add read-only fields to the `/view` payload in `sim/server.ts` if a screen needs them. Run Quay with `next dev --webpack`.

## Do

1. Play two new games as a player would, one sociable and one investor, for at least two game-years each at mixed speeds. Use the Diary, Messages, People, Society, Wire, Portfolio, Markets, the bond screens, Careers and the Bank.
2. **Wire**: show the papers as papers: outlet name and voice, journalist byline, beat, roundups folded, rumours marked as rumours, and corrections linked to the story they correct. When a journalist asks the player for comment, the player can answer from the Wire and from Messages.
3. **Diary leftovers**: remove the debug line "World created from seed '1'"; "Why?" links use the Quay tokens, not browser blue; quiet days fold into one line ("Jan 2–5: nothing planned") instead of one row each.
4. Fix everything else that looks broken, confusing, slow, empty, or debug-like: raw ids, NaN, untranslated keys, overflowing text, dead buttons, and anything that doesn't work at phone width.

## Done

List what you found and fixed. Add screenshots of the Wire and the Diary at desktop and phone width, saved to `docs/design/quay-wire*.png` and over `docs/design/quay-diary*.png`. `npx tsc --noEmit` has no new errors in `src/`. Commit after `git pull --rebase`, push to v1-build, and reply with that and your cost. Then stop.
