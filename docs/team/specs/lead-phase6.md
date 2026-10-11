# Phase 6 lead decisions (systems and fantasy)

Binding for Phase 6. Commit as `docs/team/specs/lead-phase6.md`. Where a team spec exists it wins on detail; this file fixes
scope, numbers that are missing, and the order of work. 1 gd = 1 real hour. The world is one persistent online world.

## Tracks

### 6A. World events and rivals (UI on top of Phase 1 systems)
- World-event takeover UI: `specs/velvet-world-events.md` (telegraph, takeover ~3 s skippable after 1 s, banner, ambient,
  aftermath, flash crash) on the Phase 1 `worldEventView` / `MarketFrame.worldEvent`. Telegraph >= 8 real hours ahead for a
  major (M39); if the engine does not expose a telegraph yet, add a public pre-announcement field computed from the event
  schedule WITHOUT revealing magnitude or exact onset (a window, e.g. "within the next 8 to 16 hours").
- Rivals board: `specs/velvet-rivals-board.md` (M12): names and net worth only, "Next up" (the next rival above you), profile
  card. Rivals are the engine pool slices (`rivals.ts`, `rivalLeaderboard`); no holdings shown.
- Rivals get models and defense (M26): each rival fund has a tier and AP/DP from ROADMAP §2.3 / 03 §4.6.4 ranges, using the
  player security model in `src/world/cyber.ts` and `lab.ts` (Model, attackPoints, defensePoints). Honeypots (M29, ROADMAP
  §2.3) on both sides: players can run one honeypot model; rival funds at T2+ run one with 25% chance per game quarter;
  canary check add-on. Rival crews attack the player (M31): 72-game-hour new-account protection, rookie zone (no attacks below
  R2), 1% breach floor, offline protection (no attack while the player has been offline > 8 real hours, unless they hold
  stolen goods). Gate: rookies attacked < 5% in the harness; no attack before protection ends.

### 6B. Comeback and money
- Bankruptcy comeback: `specs/velvet-bankruptcy.md` (M20) + ROADMAP §2.6. Chapter screen, perks, at most once per 8 real
  weeks, leverage capped at 1x for 7 real days after a comeback. A busted save is never a dead end.
- Sponsor-break ads (M48), SIMULATED (no ad network, no tracking): `specs/velvet-rewarded-ads.md` + ROADMAP §2.7. Reward $250
  per break, at most 10 a game day, offered only when cash at the day start is under $1,000, counted per profile. Ad cash is
  tagged and held 72 real hours: it cannot fund hacking, insider actions, margin or transfers (C5 ruling). A "break" is a
  15-second in-app sponsor card for a FICTIONAL brand from a template list (no real brands), skippable after 5 s with no
  reward. Ad cash is a booked faucet line (`adCash`).

### 6C. Security, law and anti-cheat
- Insider tips from crime (M16 v1, `specs/quant-rumors.md`): tips only from crime actions (a successful session on a company
  insider or rival), always true, and flagged when traded.
- ECA regulator (M16 v2, ROADMAP §2.5): surveillance scores from the existing `surveil`/backstop points (Phase 4) plus tip
  trades; thresholds, evidence and the tribunal-lite in `court.ts`. Gates: blind rumor-following EV <= 0 after fees; wrongful
  convictions < 3% in the harness.
- Collusion graph (Phase 4 O-5): owner links from alliances PLUS shared funding (transfers), the same device/IP hash at
  registration (hashed, never shown), and trade mirroring between accounts (a score). Used by: IPO exclusions, the founder sell
  cap (extend to linked accounts, closes O-7a), Launchpad creator cap, ad caps per profile. Never shown to players; a refusal
  says "linked account" without naming it.

### 6D. Competitions and lifestyle
- Weekly AI tournament (M32 solo -> M43 server-run, ROADMAP §2.4): 3 secret seeds x 30 gd, headless isolated runs of the
  player's AI Lab model against the house AIs; score = median Sharpe over the three; seeds published after the reveal so
  results are reproducible; trade logs opt-in only (N8). Runs batched off the tick loop (a worker or a scheduled job).
- Weekly live auctions: one per real week, 3 to 5 rare collectibles (fictional), English ascending bids over 1 real hour,
  anti-snipe extension (+2 min when a bid lands in the last 2 min), seller fee 12% and buyer premium 15% as sinks (01 §6),
  reserve price from the collectible's index. Bids are public by handle at the end only (during: amount and count).
- Daily streak: consecutive real days with a login and one action. Rewards are FIXED (no chance), small, cosmetic-first:
  palette accents, badges, a title; cash at most $100 x rank index per day, capped at 7 days of growth. Missing a day keeps
  50% of the streak once a week (a "rest day"). No push nags.
- One-switch insurance: one toggle in Settings/Security, premium 0.4% of insured value per real week (sink), covers hack
  losses (drain), shop fires/theft events and collectible theft, deductible 10%, claim paid as a transfer from the NPC insurer.
  Payouts capped at 80% of the loss. Cannot be switched on during an active breach or within 24 h after one.
- Visible home room: the player's home (from the rank shell) shows owned lifestyle items placed in slots. Opt-in public view
  for others (off by default). Collection page: opt-in public, lists owned collectibles and badges.
- Stress test: a Portfolio tool showing the player's current book under the four world-event kinds (crash, bubble pop,
  crisis week, flash) using each kind's published typical shock by asset class, never the hidden schedule. Clearly labelled
  "illustrative".

## Order and branches
- Branches from v1 after Phase 5 merges: `p6/a` (6A), `p6/b` (6B), `p6/c` (6C), `p6/d` (6D). Each: implement, adversarial
  review, repair, merge `--no-ff`, screenshot tour reviewed by the lead, status doc `docs/V1-PHASE6.md`.
- Every new copy key in en and fr. Every refusal in three parts. No-reveal everywhere. Every new faucet and sink booked so the
  world money identity still closes to the cent.
