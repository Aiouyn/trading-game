# 14 notes: Player progression and lifestyle

## 1. Parameters

| Key | Default | Range | Unit | What it affects |
|---|---|---|---|---|
| guest_max_real_minutes | 30 | 10–120 | real minutes | guest play before registration is required (§3.1.1) |
| handle_change_fee_real | $1,000 | $0–$100k | real $ | handle change once per chapter, sink ACCT_HANDLE_FEE (§3.1.3) |
| handle_release_hold_chapters | 1 | 0–4 | chapters | how long a released handle stays reserved (§3.1.3) |
| home_city_change_fee_real | $25,000 | $0–$1M | real $ | home city change once per chapter (§3.1.5) |
| profile_pinned_receipts_max | 6 | 3–12 | count | pinned receipts on the profile (§2) |
| chapter_active_days_min | 10 | 5–30 | active real days | eligibility for chapter-end awards and portraits (§2) |
| wire_purchase_threshold_real | $10,000,000 | $1M–$100M | real $ | displayed purchases that post to the Wire (§3.6.2) |
| rank_r6_floor_real | $20,000,000,000 | $5B–$100B | real $ | R6 Dynasty net-worth floor (§3.2.3) |
| rank_r6_top_n | 50 | 10–200 | positions | R6 board position requirement (§3.2.3) |
| rank_r6_streak_closes | 24 | 1–168 | day closes | consecutive closes inside top N for R6 (§3.2.3) |
| exam_retake_game_days | 1 | 0–7 | game days | wait before retaking a license exam (§3.3.1) |
| exam_valid_chapters | 2 | 1–6 | chapters | how long a passed exam stays valid without the license (§3.3) |
| license_grace_game_days | 7 | 1–28 | game days | grace after a failed renewal before LAPSED (§3.3.3) |
| house_title_pp_share | 0.5 | 0–1 | share | PP that predecessor titles keep in a House (§3.5.2, §3.15.5) |
| ceremony_idle_real_s | 10 | 3–60 | real seconds | idle time before a rank-up ceremony plays (§3.5.3) |
| drop_scale_na | 10,000 | 1k–100k | players | LIMITED drop size scaling `max(1, N_a/x)^0.5` (§3.6.3) |
| drop_window_ticks | 720 | 30–2,160 | ticks | request window for a LIMITED drop (§3.6.3) |
| drop_max_per_char | 1 | 1–3 | units | units of one drop per character (§3.6.3) |
| summit_early_bid_ticks | 30 | 0–360 | ticks | Summit Club early bidding on UNIQUE lots (§3.6.4) |
| paid_storage_rate | 1% | 0.25–5% | of value per game year | paid storage for items not displayed (§3.6.6) |
| edition_max_price_multiple | 3× | 1.5–10× | × production cost | player edition sales to linked accounts (§3.6.7) |
| condition_decay_unpaid | 0.02 | 0.005–0.1 | condition per unpaid day | decay of unmaintained items (§3.6.9) |
| restore_game_days | 3 | 1–14 | game days | restoration time (§3.6.9) |
| dealer_buyback_haircut | 0.15 | 0.05–0.4 | share | NPC dealer buyback discount (§3.6.10) |
| rent_min_cash_real | $1,000 | $0–$10k | real $ | rent waived below this cash (§3.7.1) |
| secondary_homes_max | 9 | 1–20 | count | secondary homes per character (§2) |
| starter_gift_lock_real_days | 7 | 0–30 | real days | lock on gifted starter items (§3.7.3) |
| experience_burst_game_days | 60 | 14–182 | game days | PP burst duration of experiences (§3.7.6) |
| rep_start | 50 | 30–70 | points | starting Reputation (§3.10.1) |
| rep_philanthropy_chapter_cap | 20 | 5–40 | points per chapter | Reputation from donations (§3.10.2) |
| hosting_duration_ticks | 720 | 360–2,160 | ticks | length of a hosted event (§3.12.2) |
| hosting_cooldown_real_hours | 24 | 6–168 | real hours | cooldown between hosted events (§3.12.2) |
| cross_bloc_settle_delay_ticks | 720 | 0–5040 | ticks | delay removed by owning a light jet (§3.12.5) |
| cos_queue_max | 3 | 1–10 | intents | Chief of Staff queued intents (§3.12.6) |
| fresh_start_nw_line_real | $1,000 | $0–$10k | real $ | NW below which Fresh Start is available (§3.13.1) |
| fresh_start_cash_real | $5,000 | $1k–$20k | real $ (× MSI) | restricted cash on Fresh Start (§3.13.2) |
| fresh_start_cooldown_real_days | 56 | 14–112 | real days | cooldown between Fresh Starts (§3.13.5) |
| fresh_start_clawback_real_days | 7 | 1–14 | real days | lookback for reversing transfers before a Fresh Start (§3.13.5) |
| house_founding_fee_real | $10,000,000 | $1M–$100M | real $ | founding a House (§3.15.1) |
| house_heirlooms_max | 12 | 4–24 | items | heirlooms per House (§3.15.3) |
| probate_ticks | 17,280 | 720–69,120 | ticks | succession probate (§3.15.4) |
| patrons_per_city | 12 | 5–25 | players | Hall of Patrons seats per city (§3.16.4) |
| lifestyle_cost_share_max | 25% | 10–40% | of R4 income | balance target for lifestyle running costs; 20 tunes upkeep down if exceeded (§3.17 sink sanity) |

Fixed numbers in tables (not PARAM keys, all `DEFAULT (Mathis may override)`):
- Rank thresholds: $20k / $250k / $5M / $100M / $2B real (§3.2.2).
- License fees LIC1 $250 / LIC2 $15k + exam / LIC3 $250k / LIC4 $5M; renewal 10% per game year (§3.3.1).
- Collateral advance rates UNIQUE 50% / LIMITED 30% / MASS 0% (§3.6.11).
- Clubs: Harbor 250 PP / Rep 40 / $150k; Glasshill 1,000 / 50 / $2M; Summit 5,000 / 60 / $25M; Back Room Notoriety 50 / $1M (§3.12.1).
- Hosting: dinner / party / gala $50k / $500k / $5M (§3.12.2).
- Security wing grades 1–5 at $100k to $50M (§3.12.9).
- Inheritance tax 0 / 10 / 20 / 30% above $100M / $1B / $10B real, × 16 TAX_INHERITANCE (§3.15.4).
- Reputation inheritance factor 0.5 (0.8 after a conviction); Notoriety ×0.25 (§3.15.4).
- reachWeight `min(2, 1 + 0.25·log10(1+PP))` (§3.8.3).

## 2. Decisions

- §3.1.3: handle 3–20 characters, changeable once per chapter for $1,000. DEFAULT.
- §3.1.4: 4 backgrounds, flavor plus one tilt, never cash. DEFAULT.
- §3.1.5: home city change once per chapter for $25,000. DEFAULT.
- §3.1.6: 2FA mandatory at top 1% NWI and for alliance Chairs. DEFAULT.
- §3.1.7: deletion anonymizes public records ("a former participant") instead of erasing history. DEFAULT.
- §3.2.2: rank names follow 00 (R3 Mogul, R4 Tycoon), replacing old R3 Operator / R4 Mogul. Old thresholds kept.
- §3.2.2: V3 question 1 resolved. Bank, insurer and custodian charters open at R4; fund and exchange membership at R3.
- §3.2.3: R6 needs all of: $20B real, top 50 at 24 consecutive closes, and a House. DEFAULT; this extends 17's "top 50" assumption.
- §3.2.4: ranks are evaluated at day close and never demoted. DEFAULT.
- §3.2.6: city access is home bloc at R0, other blocs at R2, Isla Serena at R4. DEFAULT.
- §3.3.1: license fees, exams and 10% renewal. DEFAULT.
- §3.3.1: LIC1 is paid by a $250 onboarding grant.
- §3.5.2: title PP has a fresh value during its chapter and a heritage value after it.
- §3.6.3: LIMITED drops are allocated by category PP, then request tick. There is no lottery (L5, no gambling). DEFAULT.
- §3.6.5: display requires residence storage; paid storage never displays. DEFAULT.
- §3.6.10: dealer buyback at −15%. DEFAULT.
- §3.7.1: homes use rarity 1 except UNIQUE homes. This resolves the old 04 table, which listed the mansion and estate as Limited but priced them at rarity 1.
- §3.7.6: the experience burst lasts 60 game days. This resolves the old 04 claim "1 game month ≈ 2.5 real days", which does not fit 00's clock.
- §3.8: the Prestige formula is from old 04 §7.2. Category weights are 0.5^(k−1) and a completed set gives +20%.
- §3.10: Reputation scaling is +Δ(100−R)/50 and −Δ(0.5+R/100). Conviction penalties run from S1 −10 to S6 −30. Philanthropy is capped at 20 per chapter. DEFAULT.
- §3.12.1: the Glasshill whisper accuracy band U(0.45, 0.75) is used by 16 §3.6.9.
- §3.12.6: the Chief of Staff can queue 3 intents. DEFAULT.
- §3.13: Fresh Start follows ROADMAP §2.6. It resolves ROADMAP conflict C5: 72-hour restricted cash, 56-day cooldown.
- §3.15.4: inheritance tax bands. DEFAULT.
- §3.15.5: no cross-account bequests. DEFAULT.
- §3.15.6: player characters do not age.
- §3.16.3: the Gilt List is published each game quarter, with a cover-star formula.
- §3.16.4: Hall of Patrons, 12 per city, frozen per chapter.

## 3. Interfaces assumed

- **03**:
  - `nw.rankBasisReal(characterId)`, consolidated across controlled entities.
  - `MSI` and `WLI` per city.
  - The boundary rule: NPC to player is FAUCET; player to NPC is SINK.
  - `postLedger(reasonCode, …)`.
- **07**:
  - `escrow.hold / release / returnToOwner`.
  - Collateral advance-rate hook.
  - Liquidation order on Fresh Start.
- **06**: `collectibleFairValue(itemId)` for UNIQUE marks; the auction house for UNIQUE lots.
- **10**:
  - Residences as properties: `storageProvided`, mortgage LTV.
  - City access gate.
  - Hall of Patrons parcels.
- **12**:
  - reads `physicalSecurityGrade` 0–5 and the heat bonus `clamp(0.02·(PP−2000)/1000, 0, 0.12)`;
  - E5 theft of displayed items;
  - `linkedAccounts`.
- **13**:
  - `law.licenseEligibility(characterId, licenseId) → {eligible, reason?}`;
  - `law.charter.apply`;
  - conviction severities S1–S6.
- **15**:
  - Wire posts;
  - boards (15 §3.4) for R6 and the Gilt List;
  - `linkedAccounts(a,b)` (15 §3.12);
  - chapter boundaries (15 §3.3);
  - activity states (15 §3.13, inactive at 14 days).
- **16**:
  - TAX_INHERITANCE lever (16 §3.5.9a);
  - clubs feed Circle whispers (16 §3.6.9);
  - Reputation events from REPORT actions (16 §3.11.4);
  - Research Desk published research (16 §3.6.6).
- **17**:
  - `rank.thresholds()`;
  - rank channel `{rank, thresholds[], nextAt, shellsEarned[], prestige, reputation, notoriety?}`;
  - ShellId 'r0'..'r6';
  - PresentationPrivacy.
- **18**: onboarding grants LIC1 and starter items.
- **19**: auth methods.
- **21**: moderation filter for handles, House names and statements.

## 4. Content needed (22)

- Homes, cars, watches, yachts and jets, art, wine, fashion, experiences, philanthropy and trophies: 46 catalog defs, with fictional brand and maker names for each.
- UNIQUE item list: about 30 at launch, including the skyline crown residence and the island.
- Artists and their bodies of work.
- The 9 collection sets with their members.
- Title and milestone names and texts.
- 4 background texts.
- Crest parts (shields, charges, colors, mottos) for Houses.
- 6 heir trait texts.
- 12 donation causes.
- Club names, interiors and invitation texts.
- Gala and hosting texts.
- Gilt List editorial templates.
- Rank shell art briefs r0–r6 (17).
- FR translations of all of the above (L8).
