# 13-notes — Law, Courts and Regulators

## 1. Parameters introduced

| Key | Default | Range | Unit | Affects |
|---|---|---|---|---|
| PARAM.evidence_decay_tau | 21 | 14–28 | real days | evidence exponential decay |
| PARAM.bar_civil | 40 | 35–50 | points | civil filing/verdict burden |
| PARAM.bar_regulator | 55 | 50–65 | points | regulator burden |
| PARAM.bar_criminal | 70 | 65–80 | points | criminal burden |
| PARAM.max_active_investigations | 3 | 2–5 | count | suspects a victim can pursue at once |
| PARAM.suspect_board_miss_rate | 0.15 | 0.05–0.25 | prob | chance the true attacker is off the board |
| PARAM.regulator_capacity_divisor | 200 | 100–400 | active chars/investigation | regulator finite attention |
| PARAM.counsel_logit_per_grade | 0.15 | 0.10–0.20 | logit/grade | counsel swing (cap ±0.75) |
| PARAM.court_fee_pct | 0.01 | 0.005–0.02 | fraction of claim | filing fee (min $500) |
| PARAM.appeal_fee_pct | 0.02 | 0.01–0.03 | fraction of judgment | appeal fee (refunded on win) |
| PARAM.garnishment_rate | 0.30 | 0.20–0.40 | fraction of daily income | garnishment plan |
| PARAM.vcf_advance_pct | 0.50 | 0.25–0.60 | fraction | victim-fund advance of an unpaid award |
| PARAM.fine_sink_share | 0.85 | fixed | fraction | fine destroyed |
| PARAM.fine_vcf_share | 0.10 | fixed | fraction | fine to victim fund |
| PARAM.fine_whistle_share | 0.05 | fixed | fraction | fine to whistleblower pool |
| PARAM.whistle_reward_pct | 0.05 | 0.03–0.07 | fraction of fine | whistleblower reward (cap $50M) |
| PARAM.held_grace_ticks | 720 | 360–1440 | ticks | grace before Held starts (1 game day) |
| PARAM.insurance_deductible_pct | 0.10 | 0.05–0.20 | fraction | each-claim deductible |
| PARAM.malicious_prosecution_nw_pct | 0.0025 | 0.001–0.005 | fraction of NW | cost of a lost wrongful filing |
| PARAM.case_sell_share_min / _max | 0.30 / 0.50 | — | fraction of award | case-selling assignee share |

The S1–S6 fine schedule (pct/floor/cap), severity modifiers (repeat ×1.5, punch-down ×3, plea −30%), verdict-time bands, and Held durations are inline in §3 and belong in 23 as fixed schedules (kept verbatim from old vision 03 §1, §9).

## 2. Decisions / DEFAULTs chosen and old questions resolved

- Resolved old roadmap **Q8** (Held in solo): Held is online-only; solo applies fines/op-bans/record only. DEFAULT (Mathis may override). (§3.10, test 12)
- Resolved old 03 §19 **Q2** (Held exists): temporary freeze ≤24h/verdict kept (Mathis-confirmed, bible). **Q3** (Most Wanted): opt-in, cosmetic, +15% detection on public top 10 (15 owns display). **Q4** (crime ≈ honest EV): target 0.8–1.2 (20 bands). **Q6** (case-selling): in, 30–50% share.
- DEFAULT: regulator capacity is per partition (invisible shards), scaling with that partition's active chars. (§7.3)
- DEFAULT: evidence can only derive from SEALED engine events (`sealedRefs` non-empty); fabricated reports yield zero evidence. (§5, test 18)
- DEFAULT: wrongful-conviction target band < 3%, audited by 20. (§14 #12)
- Confirmed Reputation never touches verdicts/fines/fees, only freezes and premiums (bible row 5). (§3.4)

## 3. Interfaces assumed from other modules

- **12 Conflict:** EvidenceSource rows on (attacker,victim,op) triples with points + proves-tag + sealedRefs; surveillance flags; world hack rate; the anti-grief caps enforced jointly; 13 writes `AttackCapability.opBanUntilTick` back.
- **05 Markets:** `surveillanceScore` per game day; antitrust trigger at >60% city-sector share; compute-futures concentration; fair-value liquidation band for Held margin calls; leverage halved for criminal defendants.
- **08 Funds/Insurance:** policy entities, pricing, capital rules, policy limits/exclusions; 13 adjudicates claims and sets payout reason codes (faucet for NPC Aegis, transfer for player insurers).
- **15 Social:** `linkedAccounts(a,b)`; contract clause library (NDA, penalty, bounty, non-compete) for court-enforced clauses; filings for OSINT and disclosure suits; Most Wanted/Defender boards; P2P caps.
- **02 Time/Engine:** `streamHash(worldSeed,'law',tick)`; replay API for tick-range subpoenas (needs a filed case); P11 slot; collusion graph query.
- **14 Lifestyle:** Reputation/Notoriety deltas on conviction; Held screen; verdict reveal card; declared income vs lifestyle spend for tax audits.
- **11 AI Lab:** residue `p_find = 1−e^(−3·residue)`; teacher training spend and student/teacher MCS for replacement-cost damages; model destruction reverts strategy modules.
- **03 Ledger:** reason codes `FINE_SINK`, `VCF_TRANSFER`, `WHISTLE_TRANSFER`, restitution/disgorgement transfers, court-fee sinks; marked NW at offense/verdict; the stabilizer's legal-sink budget (0.5–1.5% of money supply/game year).

## 4. Content needed in catalogs (22)

- 4 regulators: ECA (Exchange Conduct Authority), CMA (Competition & Mergers Agency), Revenue Office, CyberCert — with one tribunal each.
- Courts: Meridian Civil Court, Glasshill Criminal Bench, Clearing House arbitration.
- NPC firms: Northgate Forensics (forensic audit), Aegis Mutual (NPC insurer, owned by 08), NPC law firms and PI firms (grade 0–5; need ~6–10 fictional names), The Back Room (informant/fence venue).
- Sanction display names and verdict-card copy for 17/18 (Fine, Restitution, Disgorgement, License suspension, Op ban, Divestiture, Model destruction, Held, Public record).
- Consent-decree and settlement templates for news (16).
