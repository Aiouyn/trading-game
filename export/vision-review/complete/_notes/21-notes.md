# 21 notes — Live Ops, Admin, Monetization, Compliance

## 1. Parameters

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| `adm_access_window_hours` | 8 | 1–24 | real hours | just-in-time private-data access window |
| `adm_request_expiry_hours` | 72 | 24–168 | real hours | approval request expiry |
| `adm_halt_market_confirm_minutes` | 60 | 15–120 | real minutes | single-signer market halt auto-resume |
| `adm_critical_delay_minutes` | 30 | 10–120 | real minutes | CRITICAL action cancel window |
| `adm_mass_threshold` | 100 | 20–1000 | characters | mass action becomes CRITICAL |
| `audit_retention_years` | 10 | 5–15 | years | audit log retention |
| `liveops_boundary_shift_on_halt` | true | bool | — | chapter boundary moves by halt duration in last 48 h |
| `liveops_maintenance_max_minutes` | 30 | 10–60 | real minutes | max planned maintenance halt |
| `liveops_balance_notice_hours` | 48 | 24–168 | real hours | BALANCE patch notice |
| `liveops_rules_notice_days` | 14 | 7–28 | real days | RULES patch notice |
| `liveops_param_step_max_share` | 0.25 | 0.05–0.5 | share of 23 range | max param move per BALANCE patch |
| `liveops_rollout_stage_min_days` | 7 | 3–28 | real days | feature rollout stage length |
| `liveops_tournament_lock` | "Sun 18:00 UTC" | any weekly time | — | AI tournament entry lock |
| `new_city_na_step` | 4000 | 2000–10000 | N_a | new city opening trigger (01 §14.1) |
| `comp_min_real` | $10 | $1–$1,000 | real $ | minimum compensation/clawback line |
| `clawback_income_share` | 0.30 | 0.1–0.5 | share of daily income | clawback repayment schedule |
| `enf_repeat_window_days` | 180 | 90–365 | real days | repeat-offence window |
| `enf_min_confidence` | 0.8 | 0.6–0.95 | 0..1 | confidence for actions above WARNING |
| `enf_ban_estate_days` | 30 | 14–90 | real days | banned character's unique assets to estate |
| `enf_appeal_window_days` | 30 | 14–60 | real days | appeal window |
| `mod_hold_threshold` | 0.85 | 0.6–0.95 | score | classifier hold for review |
| `mod_sample_share` | 0.1 | 0–0.5 | share | sampling of mid-score messages |
| `mod_reports_per_day` | 20 | 5–50 | reports | report rate limit |
| `chat_retention_real_days` | 90 | 30–180 | real days | chat retention (owned by 15, cited) |
| `age_gate_retry_block_days` | 1 | 0–7 | real days | device retry block after under-16 |
| `spend_cap_minor_monthly_16_17` | €50 | €20–€100 | currency | monthly spend cap for 16_17 |
| `pass_marks_per_tier` | 100 | 50–200 | marks | Chapter Pass tier cost |
| `pass_festival_bonus_max` | 0.25 | 0–0.5 | share | festival mark bonus cap |
| `pass_items_return_chapters` | 2 | 1–4 | chapters | premium items return to Atelier |
| `ad_clock_mark_minutes` | 15 | 15 (fixed by tz offsets) | real minutes | wall-clock mark cadence |
| `ad_min_account_age_hours` | 24 | 24–168 | real hours | ad eligibility account age |
| `ad_nw_line_real` | $1,000 | locked L12 | real $ | ad eligibility NW line (×MSI) |
| `ad_grant_real` | $250 | locked L12 | real $ | ad grant (×MSI) |
| `ad_max_per_local_day` | 10 | locked L12 | ads | daily ad cap |
| `ad_min_hours_between_days` | 20 | 18–24 | real hours | min gap between ad-day evaluations |
| `tz_change_cooldown_days` | 30 | 7–90 | real days | timezone change limit |
| `ad_callback_max_age_minutes` | 30 | 5–120 | real minutes | ad verification callback freshness |
| `ad_faucet_alert_share` | 0.0001 | 0.00001–0.001 | share of net mint | AD_GRANT alert |
| `dr_replication_lag_max_minutes` | 5 | 1–15 | real minutes | standby-site replication lag |
| `dr_rto_minutes` | 60 | 15–240 | real minutes | site-loss recovery time objective |
| `push_cap_per_real_day` | 5 | 1–10 | pushes | push cap (cited from 15/19) |
| `support_tickets_per_day` | 5 | 1–20 | tickets | ticket rate limit |

## 2. Decisions

- DEFAULT (caller): rewarded-ad eligibility checked once at the start of the player's local day (resolves ROADMAP Q3, option B) via `sys.wallclock_mark` (Rule 3.14.2).
- DEFAULT: ad amounts indexed by MSI ($250 real, $1,000 real) like 14's thresholds; exactly L12 at MSI 1.0 (Rule 3.14.3).
- DEFAULT: rewarded ads only on native iOS/Android, never web/PWA/sandbox (Rule 3.14.1).
- DEFAULT: non-personalized ads only, no advertising identifier, no ATT prompt; blocked ad categories incl. trading/crypto/gambling (Rule 3.14.8). Ad network choice + tracking needs Mathis's explicit yes (24) (Rule 3.14.11, bible VI #10).
- DEFAULT: Held characters cannot receive ad grants (`AD_HELD`).
- DEFAULT (caller): solo sandbox progress never carries over (Q4), no ranked solo, weekly challenges server-only (Q5), Held in sandbox on game time (Q8) (§3.21). Contradiction with 19 Rule 3.17.4 (Held off in sandbox) flagged for 24.
- DEFAULT (caller): dedicated EU servers, primary + standby EU site (resolves ROADMAP Q7, old 02 Q7) (Rule 3.18.1).
- DEFAULT (caller): purchase code never imports the engine (Rule 3.13.3).
- DEFAULT: real-money store named "Atelier"; 14's in-game luxury shop keeps "Boutique"; 17 app 29 to be renamed (Rule 3.11.3) — naming collision found between 14 and 17.
- DEFAULT: no premium currency, direct real-currency prices, tiers T1–T6 €0.99–€14.99, Pass €7.99 (Rules 3.11.1, 3.11.6).
- DEFAULT: no gifting or trading of cosmetics (Rule 3.11.5).
- DEFAULT: 16_17 spend cap €50/month; forced strong-language mask; DM limits (Rules 3.8.8, 3.11.7).
- DEFAULT: Chapter Pass 50 tiers × 100 marks, catch-up doubling, no tier skips, premium items return after 2 chapters (§3.12).
- DEFAULT: web purchases via a merchant of record (Rule 3.13.1).
- DEFAULT: DSA-style statements of reasons and 6-monthly transparency summary (Rules 3.7.5, 3.8.7).
- DEFAULT: 16 h/day human moderation coverage at launch in en/fr (Rule 3.8.6); city/country chat open at launch per 15 §3.9.3 (old 02 Q5).
- DEFAULT: compensation tiers C1–C3 with replay counterfactual for C2+; no world rollbacks ever (§3.6).
- DEFAULT: enforcement ladder and sanctions table V01–V17 (Rule 3.7.1); shadow pools at confidence 0.5–0.8.
- DEFAULT: patch classes HOTFIX/BALANCE/RULES/CONTENT/CLIENT with notice and timing (Rule 3.4.1); RULES only at chapter boundaries (consistent with 15 §3.3.2).
- DEFAULT: live events only from templates flagged `liveOpsSchedulable`; staff never inject natural crises (Rule 3.5.1) — narrows 19's `adm.inject_event`.
- DEFAULT: governing law of the operator's EU establishment; 10-year invoice retention (Rules 3.16.3, 3.10.2).
- Resolved old 02 Q4 / bible #5: 16+ age gate design (§3.9). Old 02 Q3 monetization: cosmetics + pass only (locked L7) specified in full.

## 3. Interfaces assumed

- 19: `sys.ad_grant`, `sys.account_status`, `sys.profile_change` (timezone), `sys.param_change`, `sys.content_change`, `sys.engine_upgrade`, `adm.*` kinds of 19 §4.3; **new request: `sys.wallclock_mark { utcIso }` sealed every 15 real minutes by COORD**; platform channel `acct:entitlements` and `GET /api/v1/me/entitlements` served by the platform (not the engine); tables `account_cosmetic_loadout`, `entitlements`, `purchases`, `approval_requests`, `audit_log`, `support_tickets`, `moderation_*`, `consents`, `legal_versions`; PII schema separation (19 Rule 3.14.2); export/deletion (19 Rule 3.14.3–3.14.4).
- 14: `RestrictedCashLot` (AD_GRANT, 72 real hours), rank-basis NW, MSI-indexed "real dollar" convention, Fresh Start ordering; **request: `Account.cosmeticsOwned`, cosmetic `outfitId`/`frameId` and cosmetic shell selection must be platform read-model fields, not engine state** (Rule 3.11.5); handle rules and fees (forced renames waive fee).
- 15: chat message rules and `HELD_FOR_REVIEW`; link scores and `ALT_SUSPECT`; enforcement action enum; boundary patch hook; P2P caps; board exclusion on SUSPENDED/BANNED.
- 16: world-event template catalogue with a `liveOpsSchedulable` flag; news templates `NEWS_EXCHANGE_NOTICE`.
- 17: rename app 29 to Atelier; low-cash card per velvet spec; system overlay; report sheet on all UGC.
- 20: counterfactual MIRROR runs, Finding exposure lists, gates G0–G5, INV-STR-002..004, FAU.* bands.
- 03: reason codes `AD_GRANT` (FAUCET), `ADM_COMPENSATION` (FAUCET), `ADM_CLAWBACK` (SINK), `ADM_TRANSFER_REVERSAL` (TRANSFER); MSI.
- 22: IANA timezone rules as versioned content data; real-brand block list is staff data (not in 22).

## 4. Content needed (22)

- Cosmetic catalogue at launch: `DEFAULT` 120 Atelier items across the 14 slots (≈ 12 shell styles e.g. "Art Deco Office", "Brutalist Tower", "Harbour Loft"; 10 estate styles; 25 outfits; 15 frames; 10 nameplates; 8 chart themes; 12 wallpapers; 5 sound packs; 5 ticker styles; 10 crest parts; 8 tower facades; 6 storefront signs; 4 sticker sets; 6 recap card styles) plus 6 bundles.
- One Chapter Pass per chapter: 50 tiers, ~25 free + 50 premium cosmetic items per pass, each with a chapter theme.
- Earned-only cosmetics referenced: "Integrity Seal" frame (20), finals and title frames (15, 14).
- Live-event templates: Crash Course, Pure Markets, Speedrun challenges (02 §2.4), Crisis Week framing, Cosmetic Festival themes, Academy Week, City Opening ceremony.
- Strings: all disclaimers in EN/FR (Rule 3.16.1); reject codes `AD_*`, `RESTRICTED_CASH_USE`, `SYS_MODULE_PAUSED`, `MOD_NAME_REFUSED`; statement-of-reasons templates per V01–V17; Community Rules text.
- Reserved-name list additions: "Exchange", "Exchange Authority", "Moderator", "Support", "Staff", "Atelier".
