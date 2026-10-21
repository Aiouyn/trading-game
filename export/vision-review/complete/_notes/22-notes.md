# 22 notes: Content Catalogs

Written 2026-10-19 for 22-CONTENT-CATALOGS.md. Everything in 22 is fictional (L6). Each choice below is `DEFAULT (Mathis may override)` unless a ruling in 24 §6 fixes it.

## 1 Parameters (generator-level, introduced by 22; for 23)

| key | default | range | unit | affects |
|---|---|---|---|---|
| content.gen_collision_redraws | 10 | 3–50 | draws | §0.2 uniqueness rule for every generator |
| content.cap0_world_listed | 40,000,000,000,000 | 10T–100T | FDL $ | §4.1 genesis market caps of the 240 equities |
| content.cap0_tilt_sector_weight | 1.8 | 1.0–3.0 | × | §4.1 cap split by sector, §4.1.1 `eq_new` sector draw |
| content.cap0_intra_sector_split | 0.45/0.27/0.17/0.11 | sums to 1 | share | §4.1 four companies per sector |
| content.free_float_default | 0.75 | 0.5–0.95 | share | §4.1 equities |
| content.free_float_dynasty | 0.60 | 0.4–0.8 | share | §4.1, §10.4 dynasty-linked equities |
| content.free_float_reit | 0.90 | 0.7–1.0 | share | §4.1 REITs |
| content.new_city_listed_companies | 4 | 2–6 | count | §4.1.1 (06 §3.1.2 owns the number) |
| content.street_names_per_city | 480 | 400–600 | count | §3.7 (`PARAM.street_names_per_city`) |
| content.re_landlords_formula | 3 + floor(pop / 80,000), cap 6 | cap 4–8 | count | §3.8 landlords per city |
| content.re_developers_formula | 2 + floor(pop / 100,000), cap 4 | cap 3–6 | count | §3.8 developers per city |
| content.prehistory_days | 364 | 250–728 | game days | §4.12 price history before genesis |
| content.prehistory_storm_window | −120 … −100 | any 20-day window | game days | §4.12 stressed VaR window |
| content.npc_firm_capacity_sigma | 0.5 | 0.2–0.8 | lognormal σ | §6.9 private-firm sizes |
| content.npc_firm_capacity_clamp | 0.3–4.0 | 0.1–6.0 | × type capacity | §6.9 |
| content.npc_firm_max_per_type_city | 4 | 2–8 | firms | §6.9 |
| content.npc_firm_dynasty_share | 0.15 | 0.05–0.3 | share | §6.9, §10.4 |
| content.lab_honeypot_share | 0.20 | 0.1–0.3 | share of labs | §7.4 decoy labs (marked H) |
| content.sports_reserve_base | 3,000,000,000 | 1e9–1e10 | FDL $ × rentMult | §6.8 franchise auctions |
| content.gallery_tier_bands | $250k–$600k / $600k–$1.2M / $1.2M–$2.5M / $2.5M–$5M | inside 14's band | FDL $ | §9.3 artist tiers |
| content.actor_mobility_share | 0.08 | 0–0.2 | share | §10.3 family name from another bloc |
| content.actor_trait_beta_k | 8 | 4–20 | concentration | §10.2 trait spread |
| content.new_city_actors | 40 | 30–60 | actors | §10.1 (16 mix); lab heads counted inside |
| content.crew_grade | U{1,3} | 1–3 | grade | §8.4 crews |
| content.meme_prefix_share | 0.5 | 0–1 | share | §4.7 meme-coin names |
| content.startup_founders_mix | 1: 0.40, 2: 0.45, 3: 0.15 | sums to 1 | share | §6.11 |
| content.anon_label_digits | 4 | 4–6 | digits | §16.2 anonymized names |
| content.glossary_min_terms | 400 | ≥ 400 | terms | §17.3 (505 shipped), CV15 |

## 2 Decisions

1. Bloc id is the currency code (FDL, EUN, PYN, NKR, SRL); 04's two-letter ids are loader aliases (§0.3, §1.1).
2. French rule: proper names stay the same in FR; descriptive labels are translated through the §17.3 glossary (§0.1 rule 4).
3. Actor roster to 600 (00 §5.7, 16 AT-12): keeps 16's 532 and adds 68 (REGULATOR_HEAD +4, REGULATOR_OFFICIAL +10, FUND_PRINCIPAL +5 for SWFs, INSURER_CEO +3, EXCHANGE_HEAD +1 for TCH, CEO +31 for the 30 lab heads and the Lantern Proxy, EDITOR +12 sector analysts, SUPPLIER_OWNER +2) (§10.1).
4. 150 business types: 09's 85 binding rows plus 65 more; 5 suggested types dropped, with the reasons in §6.3. 135 product categories (§6.4). Capacity is derived from payback, not authored (§6.3, CV06).
5. Sports: one franchise per launch city, Isla Serena excluded (15). Sport by bloc: FDL gridiron, EUN football, PYN baseball, NKR ice hockey, SRL football (§6.8).
6. Tournament divisions: 15's LAPTOP/STARTUP/FRONTIER are the display names; 11's D01/D23/D45 are aliases (§7.10).
7. The Takeda dynasty is renamed Tachibana, because the original name has a strong real-company association (L6) (§10.4).
8. Atelier: 136 items, keeping 21's per-slot counts over its stated total of 120 (§14.1).
9. Unique collectibles: 131 (12 Vetro, 20 heritage watches, 60 masterworks by 12 masters, and others) rather than "about 30", so that sets can complete (§9.5).
10. Reserved names: every geographic proper name and every NPC institution name is reserved for players. The gambling vocabulary is banned in names (L5) (§16.4).
11. The "Supply Squeeze" theme is an alias for `thm_energy_squeeze` (§11.1). Stability Board and Stabilizer Board are one body, `Stabilizer Board` (§2.2).
12. Home-city fee $25,000 (24 R29). Rented room ≈ $5.40 (R24). Charter ranks per R13. The Atelier name per R05. Scenarios appear only in challenges, the Academy and practice worlds (R03).
13. Glossary: 505 terms grouped by owner module, with an FR term and an `F` flag where the owner supplies a formula (§17.3).
14. A content loader with 25 checks (CV01–CV25) refuses a build or a genesis on failure (§18).

## 3 Interfaces assumed

- 02: `rng(streamName, worldSeed)` streams, plus the world `contentHash` stored at genesis and checked on replay.
- 19: `packages/content/data/*.json` loaded before genesis; MARKET partitions keyed by the asset groups of §4.10.
- 18: `GlossaryTerm { id, termKey, defKey, formulaKey?, ownerModule }`, `HelpArticle`. The string namespaces are the ones in §17.1.
- 09: `ArchetypeRef`, `Certification`, twist hook names (CV08). 16: `Traits`, archetype enum, `sectorImpact_s`, news kinds. 11: lab tiers T1–T5, `D01/D23/D45`. 21: `ViolationCode` names V01–V17 and the disclaimer texts (§17.2).
- 03: reason codes (384, 24 R06/R23). 22 adds display names only (§16.1).
- 20: scenario ids `SC_*` map onto §11.8 (§15).

## 4 Content needed (prose the content team writes against 22's briefs)

- Lesson bodies and quiz templates: 327 lessons and the quiz banks of §12.2, in EN and FR.
- About 230 help article bodies (§12.4), plus long glossary definitions for 505 terms.
- News template bodies: 424 by kind plus 26 (§10.9), 16 AI headlines (§7.11), law news (§8.8), chronicle and WYWA templates (§10.14).
- Explanation templates: 360 trade one-liners, 60 memo sentences, 40 advisor notes (§12.3). Startup pitches beyond the 12 given.
- Art: 32 app glyphs and the action glyphs, wallpapers, avatar parts, crest parts (24/60/12) and 136 Atelier items. Sounds and 12 share cards (§13, §14).
- The FR localization pass for every descriptive label.
- The real-world name list (V12) and the technique-word list (CV24), maintained by Trust and Safety.

## 5 Catalogs referenced but undefined elsewhere, and how 22 defined them

| Referenced by | Catalog | How defined in 22 |
|---|---|---|
| 04, 06, 10 | Bloc names, currencies, capitals, exchanges | §1.1–§1.2, authored |
| 04 | Statistics offices, data-release names | §1.4, authored |
| 07, 08, 13 | Regulator divisions (13), courts, world institutions | §2.2–§2.4, authored |
| 10 | Districts and landmarks of the 16 cities; street names (≥ 400 per city) | §3.3 authored; §3.7 generator `street` |
| 10 | New-city personalities and the generator beyond the queue | §3.6 queue; §3.9 `city_new` |
| 10 | Real-estate NPC landlords, developers, land authorities | §3.8, authored names plus generator `re_npc` |
| 06 | 400 instruments (names, tickers, sectors), indices, DeFi protocols, meme names | §4.1–§4.9; `eq_new`, `meme` |
| 05, 07 | Pre-genesis price history; authored stress scenarios | §4.12 `prehistory`; §4.13 |
| 19 | MARKET asset groups | §4.10 (15 groups, against the "about 12" in 19 notes) |
| 05 | Claim kinds for the belief model | §4.11 |
| 07, 08 | 26 banks, dealers, 40 funds, rating agencies, insurers (3 specialty insurers added) | §5 |
| 09 | 150 types, 135 categories, 25 intermediate goods, 8 certifications, concessions, twists, staff pools, acquirers | §6, with generators `npc_firm`, `startup`, `sports` |
| 11 | Vendors, 68 brokers, 25 clouds, 30 labs, 40 star researchers, 120 slots, 400 codename roots, universities | §7, generators `lab_new` and `codename` |
| 12, 13 | Op names, deception items, endpoint labels, crews, law firms, PI firms, sanctions | §8, generators `endpoint_label` and `crew` |
| 14 | Brands, artists, wine estates, uniques, sets, titles, causes, clubs, crest parts, shell briefs | §9 |
| 16 | 600 actors, traits, 12 dynasties, 20 parties, 60 caucuses, 15 outlets, rumor sources, 120 shocks, 40 breakthroughs, 5 eras, secrets | §10, generators `actor` and `caucus` |
| 15 | Themes, roll-up regions, clause kinds, templates, 20 scenarios | §11 |
| 18 | Instructors, lesson ids, explanation templates, help ids, glossary (≥ 400) | §12, §17.3 |
| 17, 21 | Glyphs, wallpapers, sounds, Atelier items, pass generator, live events | §13, §14 |
| 19, 21 | Reject-code messages, halt strings, reserved and banned names | §16 |
| 19 | Content validation | §18 (CV01–CV25) |

## 6 Contradictions found and how they were resolved

| Where | Conflict | Resolution |
|---|---|---|
| 04 vs 00/06/10 | two-letter vs currency-code bloc ids | currency code canonical; aliases (cross-module fix for 04) |
| 10 vs 14 | Isla Serena islands 9 (10) vs 6 (14) | 10's count; ranks per 24 R14 |
| 09 | "81 binding rows" but 85 listed | all 85 kept |
| 09 notes | about 90 categories | 135 (Decision 4) |
| 07 | 26 banks vs 25 | 26 |
| 08 vs 16 | 40 funds vs 30 principals; 7 insurers vs 10 INSURER_CEO | the funds reconcile through multi-fund principals; 3 specialty insurers added |
| 05 vs 06 | 50-stock vs 30-stock regional indices | 30 (06 owns indices) |
| 10 notes | 108 districts estimated | 105 as authored in §3.3 (104 plus The Cays) |
| 04 vs 06 | SRL has no 30-year or linker bond, but 06 needs 30 government bonds | SRL slots are a 1-year bill and an FDL 10Y syndicated bond |
| 19 notes | about 12 asset groups | 15 |
| 16 vs 00 | 532 vs 600 actors | 68 added (Decision 3) |
| 14 | "46" catalog rows vs 44 definitions | 45 rows |
| 21 | Atelier 120 vs per-slot sum 136 | 136 |
| 15 | clause kinds | 19 including ASSIGNMENT |
| 11 vs 15 | shared-market tournament vs isolated runs; division names | 15's format and names; 11's ids aliased |
| 14 | about 30 uniques | 131 |
| 16 / old vision | dynasty Takeda | renamed Tachibana (L6) |
| 11 vs 16 | NPC labs had no actors | 30 lab heads added |
| 13 vs 08 | "Stability Board" vs "Stabilizer Board" | one body |
| 24 R29 | home-city fee | $25,000 applied |
