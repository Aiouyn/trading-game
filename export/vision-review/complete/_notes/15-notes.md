# 15 notes: Multiplayer and social

## 1. Parameters

| Key | Default | Range | Unit | What it affects |
|---|---|---|---|---|
| na_decay_real_days | 7 | 3–30 | real days | activity-weighted player count `N_a` used for drops, caps, dynasty targets (§3.1) |
| new_city_na_step | 4,000 | 2k–20k | N_a | growth that triggers a new city (with 10) (§3.1) |
| country_board_min_active | 500 | 100–2,000 | active characters | own country board (§3.2) |
| country_board_hysteresis_days | 14 | 3–56 | real days | below 450 before losing the board (§3.2) |
| country_change_real_days | 180 | 30–365 | real days | country change frequency (§3.2.2) |
| contract_clauses_max | 12 | 4–24 | clauses | clause count per contract (§3.6) |
| contract_max_term_game_days | 2,912 | 364–5,824 | game days | maximum contract term (§3.6.6) |
| payment_grace_game_days | 3 | 0–7 | game days | grace before a missed payment is a default (§3.6.6) |
| contract_registration_fee | 0.5% | 0.1–2% | of notional real, min $100, max $5M | contract registration sink (§3.6.8) |
| p2p_tax | 2% | 0–5% | of transferred value | tax on one-directional P2P transfers, principal exempt (§3.6.8, §3.6.12) |
| alliance_vote_game_days | 24 | 6–72 | game days | alliance vote duration (§3.7) |
| alliance_hop_cooldown_real_hours | 48 | 12–168 | real hours | wait before joining another alliance (§3.7) |
| registrar_fee_real | $5,000 | $500–$50k | real $ | late auto-filing fee (§3.8) |
| chat_max_chars | 500 | 200–1,000 | characters | chat message length (§3.9) |
| chat_retention_real_days | 90 | 30–365 | real days | chat retention, except contract threads (§3.9) |
| wire_halflife_ticks | 360 | 60–2,160 | ticks | Wire recency decay (§3.10) |
| wire_page | 50 | 20–100 | items | Wire page size (§3.10) |
| wire_post_fee_real | $500 | $0–$10k | real $ | Wire statement fee, max 3 per game day (§3.10) |
| statement_resolve_game_days | 5 | 1–14 | game days | statement fact-check window (§3.10.4) |
| wywa_min_absence_real_minutes | 20 | 5–240 | real minutes | While You Were Away card trigger (§3.11) |
| push_cap_per_real_day | 5 | 1–20 | pushes | push notifications per day, SECURITY and MARGIN up to 10 (§3.11) |
| link_hard | 0.7 | 0.5–0.9 | score | linked-account threshold (§3.12) |
| link_soft | 0.4 | 0.2–0.6 | score | suspect threshold (§3.12) |

Fixed numbers in tables (not PARAM keys, all `DEFAULT (Mathis may override)`):
- Chapter phases: OPEN to real day 50, CLOSING_BELL to 56, FINISH_WINDOW 24 closes, SETTLING (§3.3).
- Finish score: mean of 24 closes (§3.5).
- League tier: `clamp(prev + move, base ± 1)` (§3.5).
- Season Finals: 100 seats, $10M stake, 48 real hours, 30-tick spectator delay (§3.5).
- Contracts: 2–8 parties, 19 clause kinds (§3.6).
- Age-based P2P caps: $10k / $1M / max(10% NW, $1M) (§3.6.12).
- Alliance multisig: above $2M needs 2 approvals (§3.7).
- Alliance treasury tax: 2% on outbound transfers, capped (§3.7.2).
- SHORT_POSITION filing at 0.5%; OWNERSHIP_5 due within 720 ticks (§3.8).
- Link signals: DEVICE 0.5, PAYMENT 0.6, … (§3.12).
- Activity states: inactive at 14 days, dormant at 30, estate at 90 (§3.13).

## 2. Decisions

- §3.1: one persistent world (L1). Partitions are invisible, with a diff test.
- §3.2.2: old 02 open question 2 resolved. The country board rule is kept, with a 180-day change limit and a score reset.
- §3.3: chapters are 56 real days, with 4 phases and 12 themes. DEFAULT.
- §3.4: 17 boards. Net P2P inflows are subtracted from performance boards. DEFAULT.
- §3.5: the finish is the mean of 24 closes. This replaces old 02's "last 3 game days", which is only 3 real hours under 00's clock.
- §3.5.5: ROADMAP conflict C1 resolved. A new player's rival is the closest player above; if that player is more than 3× ahead, the nearest NPC reference row is shown instead.
- §3.5.6: Season Finals and the Hall of Fame. DEFAULT.
- §3.6.8: contract fees, and the 2% P2P tax with principal exempt. DEFAULT.
- §3.6.11: the Mandate shape is a superset of 08's assumed fields.
- §3.6.12: anti-funnel age caps. DEFAULT.
- §3.7.2: inflows to an alliance treasury are exempt from tax; outbound transfers are taxed at 2%, capped. DEFAULT.
- §3.8: HOLDINGS_QUARTERLY applies to funds and to LIC4 holders with ≥ $1B. This replaces old 02's top-200 public holdings report, which conflicts with L11. DEFAULT.
- §3.8: no automatic "whale accumulates" news items. Old 01 §6.3 is removed (L11).
- §3.9.2: no links or images in chat. DEFAULT.
- §3.9.3: old 02 open question 5 resolved. Chat opens at launch, with moderation.
- §3.9: chat is never evidence in 13 and never a channel for engine effects.
- §3.10: statements cost $500, 3 per game day, and are fact-checked by 16 and 13.
- §3.12: the human rate cap is 00's 20 intents per tick, overriding old 02's 10.
- §3.12.4: V3 question 3 resolved. The official API opens at R2 with Rep ≥ 30 and an account at least 7 days old. DEFAULT.
- §3.13: untargetability starts at inactive (14 days). This resolves the old 03 vs 02 inconsistency (dormant at 14 vs inactive 14 / dormant 30) and matches 12.
- §3.14.3: V3 question 4 resolved. Named, real-world-inspired scenarios appear only in challenges and the Academy, never in the live world.
- §3.14: the weekly AI tournament follows ROADMAP.
- §3.14: ROADMAP Q6 (fund-related) is left to 08.

## 3. Interfaces assumed

- **02**: clock, RNG streams, day-close hooks, partition routing.
- **03**:
  - beneficial ownership (`sameBeneficialOwner`);
  - ledger reason codes;
  - `nw.rankBasisReal`;
  - MSI for real-dollar caps;
  - consolidation for boards.
- **05**:
  - fills for LIVE_SHADOW challenges;
  - surveillance score input from false statements;
  - ADV.
- **07**:
  - escrow (`hold`, `release`, `returnToOwner`), used by contracts and alliances;
  - loan engine for LOAN clauses.
- **08**: `Mandate {mandateId, principalId, operatorId, allowedAssetClasses, maxLeverage, maxPositionPctNav, maxDrawdownPct, noticeTicksForChange}`, plus fund NAV for boards.
- **09**: business operating profit for the alliance member tax; SUPPLY and SERVICE clause execution.
- **11**: model freeze for the AI tournament.
- **12**: reads `linkedAccounts(a,b)` and activity states; Wire posts of public outcomes.
- **13**:
  - courts and arbitration for contract disputes;
  - filing obligations and penalties;
  - manipulation cases from statements;
  - bans.
- **14**:
  - Reputation events (CONTRACT_HONORED, CONTRACT_DEFAULT, FILING_LATE, etc.);
  - reachWeight;
  - titles from boards;
  - Hall of Fame display.
- **16**: news coverage of statements (16 §3.6.10), history entries, chronicle feeds the chapter recap.
- **17**: layouts.
- **19**: API.
- **21**: moderation queue, LiveOps themes.

## 4. Content needed (22)

- 12 chapter themes with names, texts and multipliers.
- The roll-up region table, mapping every country to a region.
- Board names and descriptions (17 boards).
- League tier names.
- Season Finals presentation texts.
- Contract template texts for each of the 19 clause kinds, plus about 12 starter contract templates.
- Alliance role names and crest parts.
- Filing form texts.
- Chat channel names and rules texts.
- Moderation word lists (EN and FR).
- Named challenge scenario templates: about 20, real-world inspired but with fictional names.
- AI tournament rule texts.
- Notification texts.
- While You Were Away card texts.
