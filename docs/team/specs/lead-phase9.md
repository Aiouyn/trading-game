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
