# Work order 79: the gaps the second play-through found

Read `AGENTS.md`, `sim/README.md`, `docs/DIRECTION.md`. Work order 76 played every scenario and two long sandboxes in Quay and found these simulation gaps. Reproduce each with a short script first, then fix it at its cause.

You own `sim/modules/player/`, `sim/modules/banking/` and `sim/modules/corporate/`. Agent 52 is changing `sim/modules/markets` right now: touch it only if a fix cannot live elsewhere, and keep both sides when you rebase.

1. **Forced sales keep their fill.** A margin sale and a bankruptcy sale record the price and quantity each lot actually fetched, so the player sees "35 Salar Lithium sold at $91.40", not the last close.
2. **No scenario opens already won.** The heir, the struggling chief and the outside-money fund start above their worth goal (about $34,117 of $27,000, $36,794 of $32,000, $18,000 of $14,700). Set each goal from the opening book so that it must be earned, and keep the win rates of work order 69 (rerun its bot table for these three, `--workers 3`).
3. **A beginner can buy a share.** After the First paycheck deposit of $1,050 no listed share was cheap enough. Let firms split their shares when the price is high (a board decision in `corporate`, at most once a year, ratio 2-for-1 to 10-for-1, booked so the ledger and every holder's count stay exact, and printed in the paper), so most shares trade between $20 and $300.
4. **Grammar.** "if Iso Haltorley do it" and every other agreement slip in the player-facing text of the modules you own.
5. **Job changes stop the clock.** Gaining or losing a job (hire, layoff, quit, firm bankruptcy) is an interrupt in `/view` data, with its cause.
6. **A careful player's circle is not silent.** Run the careful-saver year again after the circle rewrite; if there are fewer than 20 letters, find why and fix it in the player module's circle setup (who the player knows at the start).

## Done

`node sim/run.ts --years 10` prints "Books balanced every day"; save and reload match. Paste each fix's before and after script output and the three-scenario bot table. Commit after `git pull --rebase`, push to v1-build, reply with that and your cost. Then stop.
