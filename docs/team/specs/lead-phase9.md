# Phase 9 lead decisions (QA and docs)

Binding for Phase 9 on the tech fork (`v1`). Visual polish and the four-palette screenshot tour belong to the UX fork
(branches `ux/*`); this phase does not edit the Broker or the shell visuals.

## Tracks
- **9A Acceptance matrix.** Every item in `docs/team/specs/tape-*.md` (acceptance, desktop-shell, ecology-hunts, research-desk,
  company-building, stonks-exploits, e2e-conventions) gets a row in `docs/V1-ACCEPTANCE.md`: id, one-line claim, status
  (PASS with the test file and name / FAIL / NOT BUILT / DEFERRED with the ruling that defers it / N/A with why), and the
  command that runs it. Items that are feasible and not covered are implemented as Vitest or Playwright. A test that only
  restates code is not coverage: it must assert the spec's number or behaviour.
- **9B Exploits and the wealth curve.** Exploit suites named in the plan and ROADMAP R5, each as an adversarial bot or probe
  with a numeric gate: rewarded-ad farming (alts, alliance hops, restricted-cash laundering through shops, funds, Launchpad,
  court settlements), bust farming (fresh-start perks and write-offs), clip (the per-day impact clip: splitting or timing
  orders to dodge impact), alt-peak (pushing an alt's net-worth peak to unlock ranks or perks, then moving money back),
  insider alts (tips traded through linked accounts and funds). Each: EV versus an honest baseline <= 0 or the stated band.
  Wealth curve: `scripts/balance/wealth.ts` per management style (neglected, average, managed, excellent) and the rank-time
  table (days to R1..R4 at the 10th/50th/90th percentile), recorded in `docs/V1-PHASE9.md`.
- **9C Load and calibration residuals.**
  - Load: diagnose the 253 of 4,000 refused connections (Windows accept queue under bursts is the suspect): set an explicit
    listen backlog on the world server, give the load script a connect ramp, rerun 4,000 clients; gate: all connect, tick p99
    under 2.5 s. Record the machine and its load.
  - O-2: wire the residual surprise `s` (`valuation.ts` caller) and run the rho checks that waited on it.
  - O-12: a player company's sector shock is the engine's sector factor return for its sector that day (the `sectorRng`
    path), not a separate world stream. Worlds without player companies keep every fingerprint.
  - AUSD: settle the UNDECIDED stablecoin band with 300 seeds at 720 ticks (2 s.e.). If it still straddles, the stablecoin
    class band is [0.6, 1.1] on the RMS ratio, because depeg jumps dominate a stablecoin's variance; write the mechanism down.
- **9D Docs (last).** `README.md` for V1 (play, LAN, admin, backups, tests), `docs/TYCOON.md` becomes `docs/V1.md` (what V1 is,
  systems, rules, numbers, links to the phase docs), `docs/V1-PHASE9.md` (this phase's status), and every open item from the
  phase docs gathered into one "Known limits" list.

## Rulings after the 9B and 9C reviews (lead)

- **R-9-1 Clip.** Splitting one order into 720 one-tick clips costs about half the impact of the whole order (upper bound 2.04
  against the 1.5 gate). Impact becomes path-independent per account: a fill of q in an asset is charged
  I(cum + q) - I(cum), where cum is the account's same-direction filled quantity in that asset over the current game day
  and I is the existing square-root law. Gate `self_impact_clip_ratio` (720 clips against 1 order, 20 seeds, one-sided 95%)
  <= 1.5. Worlds with no player orders keep their fingerprints; worlds with player orders move, and the commit says so.
- **R-9-2 Unlinked alts: DEFERRED past V1.** An alt with its own device and no money, trade or alliance link cannot be told
  apart without an account identity layer. Keep the three `it.fails` gates, tag them DEFERRED with this ruling, and list it
  in Known limits. The per-IP registration limit stays.
- **R-9-3 Collusion groups.** Device and alliance links are transitive (union-find). Funding links (gifts, loans, fund
  deposits) and the trade-mirroring score link the two accounts directly only: a third party is not pooled through them.
- **R-9-4 One basis for rank and boards.** Leaderboards rank on the rank basis (marked net worth minus loans owed and net gifts
  received), the same as rank-ups. The ECA fine cap and the comeback card keep raw net worth (conservative, no money moves).
- **R-9-5 Partial defaults stay owed.** A default collected in part keeps the remainder open as a debt the lender can pursue
  again; it is not written off.
- **R-9-6 Ops.** Launchpad buzz items and the launch fee are ops: restricted (ad and fresh-start) cash cannot pay them.
- **R-9-7 Retry lottery from R0: DEFERRED** (Mathis's decision, post-V1). The insider roster's use of the collusion graph
  (9B.5 item 13) is confirmed.
- **R-9-8 Load gate at the production tick.** The gate runs at the game's real tick (one game day = one real hour = 720 ticks,
  5 s a tick), three repeats, all 4,000 welcomed and tick p99 < 2.5 s each time. The 1 s tick is a stress run, reported
  beside it, not gated.
- **R-9-9 Rank-time table.** Run the 365-day wealth bot (four styles x 20 seeds, sharded) for days to R1..R4 at p10/p50/p90;
  a style that never reaches a rank is reported as censored with the share reached.
- **R-9-1b Clip across the day boundary.** The 9B clip ratio (1.81) came from an attack window that straddles a game-day
  boundary: the calendar-day tally resets at the boundary, so the second half of the clips is charged against a fresh tally.
  Inside one game day the ratio is 1.01. The impact tally becomes a rolling window, not a calendar day: per account and asset,
  a same-direction quantity that decays with a half-life of half a game day (360 ticks), so no boundary resets it. The
  per-account tally is required (a shared tally lets one account's flow cheapen another's). Gate: 720 clips against 1 order,
  at any window start (include straddling starts), 20 seeds, one-sided 95% <= 1.5.
- **R-9-1c Amends R-9-1b: one shared rolling tally per asset.** A per-account tally lets N linked or unlinked accounts each
  start fresh (the N-account dodge the 9B track found). The temporary-impact tally is therefore per ASSET, shared by all
  flow (as in a real book: impact comes from aggregate flow), same-direction, decaying with a half-life of 360 ticks, with
  no calendar-day reset; a fill pays I(cum + q) - I(cum). The clip gate (720 clips against 1 order, any window start
  including straddling starts, 20 seeds, one-sided 95% <= 1.5) must pass as a normal test.
- **R-9-8b Load metric.** At the production 5 s tick the spacing between ticks is 5 s by design. The gate is: all 4,000
  clients welcomed; tick fan-out p99 (tick start to the last client's receipt) < 2.5 s; tick overrun p99 (spacing minus the
  nominal tick) < 0.5 s; three repeats. The 1 s stress run is reported, not gated; its regression against the earlier
  record is investigated and written down.

## R-9-10 Progressive business tax (lead, after the 504-day wealth table)

The 504-game-day wealth bot (21 real days, 4 styles x 20 seeds, VM) against 01 §8.4: week 1 is on target (managed $621k and
average $801k at real day 7, target median $500k), but week 3 overshoots: managed $110M and average $128M at day 21 (target
median $20M) and excellent $957M (top 1% target $400M) from shops alone at low risk. Growth does not decelerate (about 33% a
real day in week 3). 01 §8.2 and §8.3 name the missing lever: progressive tax brackets. None exists in the code.

- Business net income (per business, per game day, after its costs) is taxed in brackets of the owner's rank basis (marked
  net worth minus loans owed, R-9-4). Starting brackets (tunable): 0% up to $250k, 10% to $2.5M, 20% to $25M, 30% to $250M,
  40% above (top bracket inside 01 §8.2's 25-45%). The marginal rate applies to the whole day's business income of an owner
  in that bracket (no slicing): simple to read on the close card. Losses are not taxed and earn no credit.
- The tax is a booked sink (`businessTax`); the world money identity still closes. The stabilizer may scale every bracket
  by its lever within +-5 points (01 §8.2 lever 2), public on the money supply report.
- Copy: the Businesses card and the day-close card show "Tax (bracket N%)" as its own line, en and fr.
- Trading gains are not taxed in V1 (they are transfers with the market, not a faucet). Recorded as a V1 limit.
- Gate (for the tuning): with the 504-day bot on 20 seeds, managed p50 at real day 21 in [$15M, $60M] and at real day 7 in
  [$300k, $1.5M]; excellent p50 at day 21 <= $400M (the top-1% path) and at day 7 <= $5M; neglected unchanged in week 1.
  Tune brackets only on seed prefix `wealth`, then confirm on prefix `wealthH` (held out).
