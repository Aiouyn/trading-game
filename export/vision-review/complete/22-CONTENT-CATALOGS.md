# 22 — Content Catalogs

Owner: content. Written 2026-10-19. Status: complete catalog of every named thing in the game.

This file is the authoritative list of **names and authored content data**. It does not own rules or numbers that a module owns: where a row repeats a number from an owner module, the owner module wins (00 §3.5 precedence) and the number is repeated here only so a builder can load one data file. Where an owner module wrote "names in 22", this file decides the name. Where an owner module proposed a name, this file keeps it unless a conflict forced a change (each change is listed in `_notes/22-notes.md`).

Everything is fictional (L6): no real company, brand, person, city, currency, institution, team or product is named. Where a name resembles an ordinary word or a common surname, that is intended.

Layout: this file is organised **by catalog**, not by the module template. Every catalog is a table with an ID column. Each catalog section names the data file it becomes (`content/<file>.json`), its owner module (who reads it), and, where the catalog is generated rather than hand-written, its generator: archetypes, distributions, name grammar and seed stream.

---

## §0 Conventions for all catalogs

### §0.1 Data files

1. Every catalog below is shipped as one JSON file under `packages/content/data/` (19 owns the package; 19 §3 module graph loads it before genesis). The file name is given in each section header as `→ content/<name>.json`.
2. One table row = one JSON object. Column names map to camelCase field names. Money columns are written in whole FDL dollars unless the column says otherwise; the loader converts with `toMoney()` (00 §3.1).
3. IDs are stable forever. A renamed item keeps its ID; only its string key text changes. Removing a row after launch is forbidden (mark it `retired: true`).
4. Display names are string keys `<namespace>.<id>.name` (L8). The English text is the name given here. **French rule (resolves every "FR translations" request in the notes files, DEFAULT, Mathis may override):** proper names (cities, districts, companies, brands, people, tokens, ships, artworks, institutions whose name is a proper noun) are identical in French; descriptive labels (sector names, board names, item types such as "Penthouse", rule texts) are translated by the localization pass using the glossary of §17.3. A row whose name mixes both (e.g. "Federal Treasury") is translated by the localization pass ("Trésor fédéral").
5. Every catalog file carries `catalogVersion` (integer). The engine hashes all content files into the world's `contentHash` at genesis (02 replay determinism): a replay must load the same content hash.

### §0.2 Generators

1. A **generator** produces rows deterministically from the world seed. Every generator uses its own RNG stream `rng('content/<generator-id>', worldSeed)` from 02 (stream names listed in each section).
2. Generators run **once**: at world genesis for launch content, and at the creation event for later content (a new city, a new actor). Their output is written into world state and never regenerated, so a later code change cannot rename an existing thing.
3. **Sampling rule** (all generators): to pick from a list of length `n`, draw `u` from the stream and take index `floor(u × n)`. "Without replacement" removes the picked item. Weighted picks use the cumulative-weight method in list order.
4. **Uniqueness rule**: a generated name must be unique within its scope (stated per generator). On collision, redraw up to 10 times; after 10 collisions append a roman numeral ` II`, ` III`, … to the first candidate.
5. **Moderation rule**: every generated name is checked against the reserved-word list and the banned-word list (§16.4) before acceptance; a hit counts as a collision.

### §0.3 Bloc codes

00 §5.7 and modules 06, 10 identify blocs by their currency code; module 04 uses two-letter bloc ids. Both are valid; this file defines the mapping, and **institution entity IDs use the currency code** (`cbk_FDL`, `exc_FDL`, `reg_FDL`, `gov_FDL`, `crt_FDL`). 04's ids `cbk_FU` etc. are aliases resolved by the content loader (one alias table, §1.1). DEFAULT (Mathis may override); listed in 22-notes as a cross-module fix for 04.

### §0.4 Personal-name pools (used by every person generator)

Person names are built `given + " " + family` from the bloc's pools. Pools are deliberately ordinary names; combinations are checked against the reserved-word list. Each person generator states its scope of uniqueness (usually world-wide for the full name).

| Bloc | Given names (40) | Family names (60) |
|---|---|---|
| FDL | Adam, Alice, Avery, Ben, Caleb, Carla, Dana, Dean, Elena, Ethan, Grace, Hank, Iris, Jack, Jade, Jonah, Kara, Leo, Lena, Mason, Maya, Miles, Nora, Owen, Paige, Quinn, Ray, Rosa, Ruth, Sam, Sara, Tess, Theo, Vera, Wade, Will, Wren, Yara, Zane, Zoe | Abbott, Archer, Baird, Barlow, Bennett, Boyd, Brennan, Calloway, Carver, Colby, Crane, Dalton, Drake, Ellery, Farrow, Fenwick, Garrison, Hale, Harlan, Hollis, Huxley, Ingram, Jarvis, Keane, Kendrick, Langley, Lawson, Lockwood, Mercer, Merritt, Monroe, Nash, Norwood, Oakley, Pembroke, Prescott, Quill, Radley, Ramsey, Rowan, Sawyer, Sinclair, Slade, Stanton, Sutter, Talbot, Thorne, Tolliver, Vance, Wardell, Wexler, Whitlock, Winslow, Yates, Yardley, Ashby, Bramwell, Cutler, Danforth, Everly |
| EUN | Adèle, Albin, Amélie, Anselm, Bastien, Bianca, Carlo, Cécile, Clara, Dario, Elise, Emil, Enzo, Fabien, Flora, Giulia, Hugo, Ilse, Ines, Jonas, Lea, Livia, Luca, Marek, Mathilde, Matteo, Nico, Noemi, Oskar, Paola, Pascal, Renata, Rosalie, Sandro, Silvia, Teo, Ursula, Valentin, Vittoria, Yves | Albrecht, Arnaud, Baldini, Bauer, Beaumont, Bellandi, Brunner, Castell, Chevalier, Conti, Corvi, Dorn, Duval, Falcone, Ferrand, Fontaine, Gallo, Gauthier, Grimaldi, Hartmann, Imbert, Kessler, Lambrecht, Laurent, Lenz, Lombardi, Marchand, Moretti, Navarre, Neumann, Orsini, Pascal, Perrin, Quaranta, Ricci, Rocher, Rossetti, Sauvage, Schenk, Serrano, Sorel, Steiner, Tassin, Vasseur, Vautrin, Vogel, Weiss, Zanetti, Aubert, Bassani, Clement, Delacroix, Egger, Favre, Galli, Huber, Jaquet, Lemaire, Mancini, Valcourt |
| PYN | Akira, Ami, Aoi, Daiki, Emi, Haru, Hana, Hiro, Jun, Kai, Kana, Kenji, Kiyo, Mai, Mei, Mina, Nao, Noa, Ren, Riku, Rin, Ryo, Sae, Saki, Sora, Taro, Tomo, Yui, Yuki, Yuto, Lan, Lian, Min, Jin, Seo, Hyun, Bao, Linh, Tao, Wen | Aoki, Arai, Endo, Fujita, Hamada, Hayashi, Hirano, Honda, Ikeda, Imai, Ishida, Kaneko, Kato, Kimura, Kondo, Kubo, Maeda, Matsui, Miura, Mori, Murata, Nagai, Nakano, Noguchi, Ogawa, Okada, Ono, Sakai, Sano, Shimada, Sugiyama, Takagi, Tamura, Ueda, Wada, Yamada, Yoshida, Chen, Han, Kang, Lin, Park, Seo, Song, Tran, Wu, Yoon, Zhao, Kaiyo, Asano, Shiomi, Tachibana, Tessan, Mizuno, Nishida, Otani, Iwata, Kubota, Mochizuki, Yagi |
| NKR | Agnes, Alva, Anders, Arne, Astrid, Bjorn, Britt, Dag, Ebba, Einar, Elin, Erik, Freja, Gunnar, Hanna, Hedda, Ingrid, Ivar, Jens, Kari, Karin, Lars, Liv, Magnus, Maja, Nils, Oda, Olav, Pia, Ragna, Rolf, Sigrid, Sindre, Solveig, Stig, Svea, Tora, Tove, Ulf, Vidar | Aas, Berg, Bergstrom, Brekke, Dahl, Ek, Engstrom, Falk, Fjeld, Gran, Hagen, Halvorsen, Hammar, Haug, Holm, Hovland, Isaksen, Jensen, Juvik, Kvist, Lind, Lund, Lyng, Malm, Moen, Myhre, Nesse, Norum, Nygard, Ostby, Rask, Rud, Sand, Skog, Solberg, Stav, Strand, Sund, Torvik, Vik, Wahl, Wik, Ylven, Alm, Bakke, Dalen, Eide, Fosse, Grimstad, Helle, Kjelland, Lie, Moe, Ness, Rognes, Saether, Tangen, Ulstein, Viken, Aune |
| SRL | Alba, Alejo, Ana, Bruno, Camila, Carmen, Dante, Diego, Elena, Emilio, Esteban, Gael, Ines, Joaquin, Julia, Lautaro, Lucia, Luz, Marco, Mateo, Mia, Nahuel, Paloma, Pilar, Rafael, Ramona, Rocio, Santiago, Sol, Tadeo, Tomas, Valeria, Vicente, Ximena, Yanina, Zoe, Iker, Lara, Renata, Amaru | Acosta, Aguirre, Alvarado, Arce, Barrios, Benitez, Bustos, Cabrera, Calderon, Campos, Cardenas, Castro, Cortes, Duarte, Escobar, Ferreyra, Figueroa, Fuentes, Galvez, Guzman, Herrera, Ibarra, Leiva, Lozano, Medina, Mendez, Miranda, Molina, Montes, Navarro, Ocampo, Olmedo, Ortega, Pacheco, Paredes, Pinto, Quiroga, Ramos, Rivas, Robles, Rojas, Salas, Sandoval, Soria, Tapia, Toledo, Urrutia, Valdes, Vega, Villalba, Zamora, Zuniga, Arriaga, Belmonte, Cobos, Donoso, Echeverria, Larrain, Palma, Varela |

Isla Serena people (rare: island staff, the Serena Trust) draw from the FDL and SRL pools with equal weight.

### §0.5 What is not in this file

- Rules and formulas (modules 02–21).
- Parameter defaults (23). A catalog row may carry an authored per-item number (a company's genesis market cap, a city's household size); those are content, and 23 lists only the generator-level parameters introduced here (22-notes §1).
- Long-form prose (lesson bodies, help article bodies, full news template bodies). For those, this file fixes the **catalog**: every ID, its title, slots, constraints and a one-line brief. The text itself is written by the content team against these briefs and validated by the checks in §18.

---

## §1 World: blocs, currencies, calendar → content/world.json

### §1.1 Blocs

| blocId (canonical = ccy) | 04 alias | Name | Currency name | Code | Display | Political capital | Financial centre (exchange) | Cities (slot 1, 2, 3) |
|---|---|---|---|---|---|---|---|---|
| FDL | FU | Federal Union | Federal Dollar | FDL | `$` | Port Avalon | Port Avalon | Port Avalon, Lakemont, Redmesa |
| EUN | EC | Euran Compact | Euran Mark | EUN | `EUN ` prefix | Meridia | Meridia | Meridia, Valcourt, Belmara |
| PYN | PL | Pacific League | Pacific Tael | PYN | `PYN ` prefix | Kaiyo City | Kaiyo City | Kaiyo City, Tessan, Mirako |
| NKR | NA | Nordic Alliance | Nordic Rune | NKR | `NKR ` prefix | Nordhaven City | Nordhaven City | Nordhaven City, Skarvik, Vintra |
| SRL | SC | Southern Coalition | Southern Sol | SRL | `SRL ` prefix | Alta Verde | Sundara Coast | Sundara Coast, Cobreval, Alta Verde |
| — | — | Isla Serena (no bloc) | uses Federal Dollar | FDL | `$` | — | — | Isla Serena |

All macro numbers of each bloc (GDP share, growth, inflation target, rates, FX regime, fiscal rule, personality) are 04 §2.2's default table; this file adds only names. Display rule: FDL amounts use `$`; other currencies use the code as prefix (`EUN 1,200.00`), never a symbol, so no real currency symbol appears (L6).

Initial FX rates (FDL per unit, from 04): EUN 1.1000, PYN 0.1500, NKR 0.0950, SRL 0.2000.

### §1.2 Exchanges (one equity exchange per bloc; `listingExchange` in 02/05/06)

| excId | Name | Short | City and district | Building (landmark) | Index family |
|---|---|---|---|---|---|
| exc_FDL | Port Avalon Exchange | PAX | Port Avalon, Financial Mile | Port Avalon Exchange Building | FED30 |
| exc_EUN | Meridia Bourse | MBX | Meridia, Business District | Bourse of the Compact | EUR30 |
| exc_PYN | Kaiyo Securities Exchange | KSX | Kaiyo City, Loop Central | Loop Central Station Tower (trading floor on levels 30–34) | PAC30 |
| exc_NKR | Nordhaven Exchange | NHX | Nordhaven City, Opera Quay | Exchange Pavilion on Opera Quay | NOR30 |
| exc_SRL | Coalition Exchange | CXS | Sundara Coast, Ocean Towers | Coalition Exchange Tower | SOU30 |

Non-exchange venues (06 `VenueId`): `ven_VAULTX` **Vault Exchange** (NPC crypto exchange, registered on Isla Serena, offices in Port Avalon Glasshill); `ven_RFQ` **The Dealer Net** (RFQ network of the NPC dealers); `ven_AUCTION_HV` **Halberd & Vane** (auction house for collectibles and unique lots, salerooms in Port Avalon Glasshill and Meridia Rialto Court); `ven_DISTRESSED` **The Workout Desk** (distressed-claims venue run by The Clearing House); `ven_PRIMARY` **Primary Window** (primary issuance auctions). AMM and lending venues take the protocol names of §4.9.

### §1.3 Holidays → content/holidays.json (dates owned by 02 §3.2)

| holidayId | Name | Blocs | Day of year | Brief (one line for the calendar tooltip) |
|---|---|---|---|---|
| hol_GENESIS | Genesis Day | all | 1 | The day the world's ledgers first opened. |
| hol_PYN_TIDE | Tide Festival | PYN | 39 | Lantern boats on the bay for the first spring tide. |
| hol_SRL_CARNIVAL | Carnival Monday | SRL | 50 | Street parades from the Sunset Strip to the Plaza Mayor. |
| hol_FDL_CHARTER | Charter Day | FDL | 60 | The signing of the Federal Charter. |
| hol_NKR_ICEBREAK | Ice Break | NKR | 95 | The fjords open to shipping. |
| hol_EUN_COMPACT | Compact Day | EUN | 129 | The founding of the Euran Compact. |
| hol_NKR_ALLIANCE | Alliance Day | NKR | 156 | The Nordic Alliance treaty. |
| hol_EUN_MIDSUMMER | Midsummer Fair | EUN | 177 | Fairs in every old town square. |
| hol_PYN_LEAGUE | League Day | PYN | 186 | The founding of the Pacific League. |
| hol_SRL_COALITION | Coalition Day | SRL | 213 | The Southern Coalition accord. |
| hol_FDL_HARVEST | Harvest Day | FDL | 236 | The end of the wheat harvest. |
| hol_PYN_MOON | Moon Market | PYN | 271 | Night markets under the harvest moon. |
| hol_SRL_SUNFEAST | Sun Feast | SRL | 299 | The highland harvest festival. |
| hol_EUN_LANTERN | Lantern Day | EUN | 318 | Lanterns on the canals of Meridia. |
| hol_NKR_LONGNIGHT | Long Night | NKR | 344 | The longest night of the northern year. |
| hol_FDL_FOUNDERS | Founders' Eve | FDL | 352 | The eve of the founders' anniversary. |

Months and weekdays use ordinary names (Jan–Dec in the 4-4-5 form, Mon–Sun) as 02 decided.

### §1.4 Statistics offices, cycle committees and data-release names → content/releases.json

| blocId | Statistics office (`npc` institution) | Cycle committee (04 §3.3.6) |
|---|---|---|
| FDL | Federal Statistics Bureau (FSB) | FSB Business Cycle Dating Committee |
| EUN | Compact Statistical Office (CSO) | CSO Cycle Council |
| PYN | League Bureau of Statistics (LBS) | LBS Economic Cycle Panel |
| NKR | Statistics Nordic (SN) | SN Cycle Committee |
| SRL | Coalition Institute of Statistics (CIS) | CIS Cycle Board |

Release display names (04 `ReleaseKind`). Pattern: `<bloc adjective> <release name>`; bloc adjectives: Federal, Compact, League, Nordic, Coalition.

| ReleaseKind | Release name (EN) | Short label |
|---|---|---|
| CPI | Consumer Price Index | CPI |
| JOBS | Payrolls and Unemployment Report | Jobs |
| GDP_ADV | GDP, Advance Estimate | GDP adv. |
| GDP_REV1 | GDP, Second Estimate | GDP 2nd |
| GDP_REV2 | GDP, Third Estimate | GDP 3rd |
| PMI | Purchasing Managers' Survey | PMI |
| RETAIL | Retail Sales | Retail |
| TRADE | Trade Balance | Trade |
| SENTIMENT | Household Sentiment Survey | Sentiment |
| HOUSING | Housing Starts and Prices | Housing |
| CREDIT | Bank Credit Conditions Survey | Credit |
| FISCAL | Monthly Treasury Statement | Fiscal |
| CB_DECISION | Policy Rate Decision | Rate decision |
| CB_GUIDANCE | Policy Statement and Projections | Guidance |
| CB_MINUTES | Minutes of the Policy Meeting | Minutes |
| RESERVES | Official Reserves Report | Reserves |

---

## §2 Public institutions → content/institutions.json

### §2.1 Per-bloc institutions

| Role | Entity id | FDL | EUN | PYN | NKR | SRL |
|---|---|---|---|---|---|---|
| Central bank | `cbk_<B>` | Federal Monetary Board (FMB) | Bank of the Compact (BoC) | League Monetary Authority (LMA) | Alliance Bank of the North (ABN) | Coalition Reserve Bank (CRB) |
| Central bank seat | — | Port Avalon, Financial Mile | Meridia, Business District | Kaiyo City, Loop Central | Nordhaven City, Opera Quay | Alta Verde, Government Hill |
| Treasury (sovereign issuer, tax authority's parent) | `gov_<B>` | Federal Treasury | Compact Treasury | League Ministry of Finance | Nordic Treasury Office | Coalition Ministry of Finance |
| Bond brand (06 display) | — | Federal Notes / Federal Bills / Federal Bonds | Compact Bonds | League Bonds | Nordic Bonds | Coalition Bonds |
| Tax authority (03 §2.9; 13's Revenue Office division) | `gov_<B>` sub-ledger | Federal Revenue Office | Compact Revenue Office | League Revenue Office | Nordic Revenue Office | Coalition Revenue Office |
| Financial regulator (`reg_<B>`; contains the four 13 divisions, §2.3) | `reg_<B>` | Federal Markets Authority (FMA) | Compact Financial Authority (CFA) | League Financial Services Agency (LFSA) | Nordic Financial Supervisory Authority (NFSA) | Coalition Securities and Banking Commission (CSBC) |
| Court system (`crt_<B>`; regional circuit of the world courts, §2.4) | `crt_<B>` | Federal Circuit | Compact Circuit | Pacific Circuit | Northern Circuit | Southern Circuit |
| Legislature (16 §3.5, 300 seats) | — | Federal Congress | Compact Assembly | League Diet | Alliance Thing | Coalition Congress |
| Deposit Guarantee Fund (07) | `npc_DGF_<B>` | Federal Deposit Guarantee Fund | Compact Deposit Guarantee Scheme | League Deposit Protection Fund | Nordic Deposit Guarantee Fund | Coalition Deposit Insurance Fund |
| Policyholder Guarantee Scheme (08) | `npc_PGS_<B>` | Federal Policyholder Protection Fund | Compact Insurance Guarantee Scheme | League Policyholder Fund | Nordic Policyholder Guarantee | Coalition Insurance Guarantee Fund |
| Bridge insurer (08, dormant until used) | `ins_BRIDGE_<B>` | Federal Bridge Assurance | Compact Bridge Assurance | League Bridge Assurance | Nordic Bridge Assurance | Coalition Bridge Assurance |
| Bad bank / asset management company (10, 07 resolution) | `npc_AMC_<B>` | Federal Asset Recovery Corporation | Compact Asset Workout Agency | League Asset Management Company | Nordic Recovery Holding | Coalition Asset Recovery Trust |
| Sovereign wealth fund (08, R6; NKR's is funded by surplus, 04 SURPLUS_SWF) | `fnd_SWF_<B>` | Federal Strategic Fund | Compact Future Fund | League Investment Corporation | Nordic Petroleum and Future Fund | Coalition Development Fund |
| Credit bureau (07 §3.4.1, one shared bureau with bloc desks) | `npc_BUREAU` | Ledgerline Credit Bureau (Federal desk) | Ledgerline (Compact desk) | Ledgerline (Pacific desk) | Ledgerline (Nordic desk) | Ledgerline (Southern desk) |
| Exchange (§1.2) | `exc_<B>` | Port Avalon Exchange | Meridia Bourse | Kaiyo Securities Exchange | Nordhaven Exchange | Coalition Exchange |
| NPC public warehouse at the bloc hub (06 §3.10.4) | `npc_WH_<B>` | Avalon Bonded Warehouses | Arsenal Yards Bonded Stores | Delta Wharf Storage | Skarvik Bonded Terminal | Cobreval Ore and Grain Stores |
| Independent valuer (08) | `npc_VAL_<B>` | Ashcombe Valuation (Federal) | Ashcombe Valuation (Compact) | Ashcombe Valuation (Pacific) | Ashcombe Valuation (Nordic) | Ashcombe Valuation (Southern) |
| Trustee and servicer (08 SPVs) | `npc_TRU_<B>` | Keel Street Trust Services | Compact Fiduciary SA | League Trust and Custody | Nordic Corporate Trustee | Coalition Fiduciaria |

### §2.2 World-level institutions

| Entity id | Name | What it is (owner module) |
|---|---|---|
| `sys_EXA` | **The Exchange Authority** | The diegetic operator of the world's rules; issues the Integrity Report (20) and owns the Stabilizer Board. Reserved name (§16.4) |
| `sys_STAB` | **Stabilizer Board of the Exchange** (short: the Stabilizer Board) | The game-money controller of 03 §3.7. 04's "Stability Board" is the same institution (one name, 01 X19) |
| — | **Money Supply Report** | Weekly public report of the Stabilizer Board (03 §3.7.7) |
| — | **Integrity Report** | Public report of the Exchange Authority (20, 03 §3.7.7) |
| — | **Luxury CPI** | Player-facing name of Stabilizer lever L2 (03 §3.7.4) |
| `npc_CSF` | **Concord Stability Facility** | Supranational lender of 04 §2.13; HQ Belmara, Lakeside Promenade |
| `ccp_TCH` | **The Clearing House** (TCH) | Central counterparty of 07; HQ Port Avalon, Financial Mile, with Meridia and Kaiyo offices |
| — | TCH services: **TCH Clear** (cleared derivatives), **TCH Repo** (cleared repo), **TCH Escrow** (contract escrow, 15), **TCH Default Fund** | 07 |
| `crt_MCC` | **Meridian Civil Court** | World civil court (13): player-vs-player civil claims; seat Meridia, Rialto Court |
| `crt_GCB` | **Glasshill Criminal Bench** | World criminal bench (13): S3–S6 prosecutions; seat Port Avalon, Glasshill |
| `crt_TCHA` | **Clearing House Arbitration Panel** | Arbitration forum of 13/15; seat Port Avalon |
| `npc_VCF` | **Victim Compensation Fund** | 13 fine split |
| `npc_ISFZ` | **Isla Serena Free-Zone Authority** | Tax and registry authority of Isla Serena (03 §2.9); levies only property tax and stamp duty |
| `npc_SERENA_TRUST` | **The Serena Trust** | Initial owner of the Serena islands (10 §3.18) |
| `npc_PROXY` | **Lantern Proxy Advisors** | The one global proxy advisory (09) |
| `npc_VALX` | **Ashcombe Valuation** | Valuation expert firm (09 fairness opinions; 08 valuer desks of §2.1) |
| `npc_TENDER` | **The Tender Board** | NPC customer tender venue (09 §3.9.1) |
| `npc_HALLS` | **Halls of Patrons** | One per city (10 §3.22); building names in §3.4 |
| `rat_SV`, `rat_MCO`, `rat_ORS` | Sterling & Vane Ratings; Meridian Credit Opinion; Orion Ratings Service | The three rating agencies (08 §3.4.1); parents in §5.5 |

### §2.3 Regulator divisions (13 `RegulatorId`)

13's four regulators are the four divisions present in **every** bloc regulator `reg_<B>`. A case is handled by the division of the bloc whose market, entity or tax base is affected (13 owns jurisdiction). Display: `<division> · <bloc regulator short>`, e.g. "ECA · FMA".

| RegulatorId | Division name | Domain (13 §… summary) | Tribunal (one per division, world-wide seat) |
|---|---|---|---|
| ECA | Exchange Conduct Authority | market abuse, manipulation, insider trading, false Wire posts | Market Conduct Tribunal (Port Avalon) |
| CMA | Competition and Mergers Agency | monopoly, cartels, compute corners, merger review | Competition Tribunal (Meridia) |
| REVENUE | Revenue Office | tax, unexplained wealth | Tax Tribunal (Valcourt) |
| CYBERCERT | CyberCert | cyber incidents, model registry, zero-day patches | Cyber Incident Tribunal (Nordhaven City) |

### §2.4 Courts

| Court | Seat | Benches | Circuit benches (regional, `crt_<B>`) |
|---|---|---|---|
| Meridian Civil Court | Meridia, Rialto Court | 8 civil benches | Federal, Compact, Pacific, Northern, Southern civil circuits |
| Glasshill Criminal Bench | Port Avalon, Glasshill | 6 criminal benches | Federal, Compact, Pacific, Northern, Southern criminal circuits |
| Clearing House Arbitration Panel | Port Avalon, Financial Mile | panels of 3 drawn from the JUDGE actors (16) | — |
| Appeals Chamber | Belmara, Old Spa | 3 appeal panels | — |

The 20 JUDGE actors of 16 sit on these benches: 6 at the Meridian Civil Court, 6 at the Glasshill Criminal Bench, 3 at the Appeals Chamber, 1 president per circuit (5).

---

## §3 Cities, districts, landmarks and the map → content/cities.json, content/districts.json

### §3.1 Launch cities (16)

Numbers owned by 10 (population, districts, unlock) are repeated; `cityGdpShare` and `cycleBeta` are authored here for 04 §3.2 (shares sum to 1 per bloc; beta 0.6 stable … 1.8 volatile). `cityRentMult`, `hhSize`, owner-occupier share and property tax are 10's personality inputs, authored here.

| cityId | Name | Bloc | Slot | Launch pop | Districts | Unlock | cityGdpShare | cycleBeta | Geographic constraint (LC04) | Coastal (port concession) | Commodity hub | cityRentMult | hhSize | Owner-occupier share | Property tax %/GY | CBD height cap (m) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| city_port_avalon | Port Avalon | FDL | 1 | 240,000 | 8 | R0 | 0.45 | 1.0 | crescent harbour bay, hill to the west | yes | FDL hub (Eastside Docks) | 1.00 | 2.4 | 0.55 | 1.0 | 320 |
| city_lakemont | Lakemont | FDL | 2 | 180,000 | 7 | R0 | 0.32 | 0.9 | large inland lake, bluffs to the north | no (lake port only) | — | 0.85 | 2.5 | 0.60 | 1.1 | 260 |
| city_redmesa | Redmesa | FDL | 3 | 150,000 | 7 | R0 | 0.23 | 1.2 | desert basin ringed by mesas | no | — | 0.70 | 2.7 | 0.65 | 0.8 | 180 |
| city_meridia | Meridia | EUN | 1 | 200,000 | 8 | R2 | 0.45 | 0.9 | lagoon with canal islands and a mainland gate | yes | EUN hub (Arsenal Yards) | 1.15 | 2.1 | 0.45 | 0.9 | 200 |
| city_valcourt | Valcourt | EUN | 2 | 150,000 | 7 | R2 | 0.33 | 0.8 | river valley with locks and an old foundry bank | no (river port) | — | 0.80 | 2.2 | 0.50 | 1.0 | 150 |
| city_belmara | Belmara | EUN | 3 | 90,000 | 6 | R2 | 0.22 | 0.7 | alpine lake between steep slopes | no | — | 1.30 | 2.0 | 0.60 | 0.7 | 80 |
| city_kaiyo | Kaiyo City | PYN | 1 | 320,000 | 8 | R2 | 0.48 | 1.1 | dense bay city with reclaimed land and a rail loop | yes | — | 1.10 | 2.2 | 0.40 | 1.2 | 380 |
| city_tessan | Tessan | PYN | 2 | 210,000 | 7 | R2 | 0.34 | 1.3 | river delta with a fab island | yes | PYN hub (Delta Wharf) | 0.75 | 2.8 | 0.45 | 0.9 | 260 |
| city_mirako | Mirako | PYN | 3 | 110,000 | 6 | R2 | 0.18 | 0.8 | terraced hills around a temple summit | no | — | 0.80 | 2.4 | 0.60 | 0.8 | 90 |
| city_nordhaven | Nordhaven City | NKR | 1 | 120,000 | 7 | R2 | 0.48 | 0.6 | fjord with a narrow mouth and islets | yes | — | 1.10 | 2.0 | 0.55 | 0.9 | 160 |
| city_skarvik | Skarvik | NKR | 2 | 80,000 | 6 | R2 | 0.30 | 1.0 | rugged islands and skerries, offshore rigs | yes | NKR hub (Rig Yards) | 0.80 | 2.3 | 0.60 | 0.8 | 90 |
| city_vintra | Vintra | NKR | 3 | 70,000 | 6 | R2 | 0.22 | 0.7 | inland lake and hydro valley | no | — | 0.75 | 2.2 | 0.65 | 0.7 | 100 |
| city_sundara | Sundara Coast | SRL | 1 | 190,000 | 7 | R2 | 0.34 | 1.8 | long beach strip under coastal hills | yes | — | 0.95 | 3.0 | 0.50 | 1.1 | 280 |
| city_cobreval | Cobreval | SRL | 2 | 140,000 | 7 | R2 | 0.28 | 1.5 | ore port below a hillside old town | yes | SRL hub (Ore Docks) | 0.65 | 3.1 | 0.55 | 0.9 | 160 |
| city_alta_verde | Alta Verde | SRL | 3 | 160,000 | 7 | R2 | 0.38 | 1.2 | highland plateau with coffee slopes | no | — | 0.70 | 3.2 | 0.55 | 1.0 | 200 |
| city_isla_serena | Isla Serena | — | — | 0 (estates only) | 1 | view R0, own R6 | n/a (10 `islaSerenaIndex()`) | n/a | archipelago of 9 islands | yes (marinas only) | — | 2.50 | 3.0 | 1.00 | 0.5 | 30 |

Property-tax rates are the launch values of `PARAM.property_tax_rate_<city>` (10) and the initial value of 16's `TAX_PROPERTY` lever per city.

### §3.2 City personalities (visual and peril profile; 10 §3.19 and 08 per-city perils)

Peril classes: 0 none, 1 low, 2 moderate, 3 high (08 maps classes to frequency). District flags: C coastal, R river, F fault, H hill.

| cityId | Palette (materials) | Street trees | Roof and facade archetype family | Flood | Coastal storm | Quake | Wildfire | Heatwave | Snow and ice | Flagged districts |
|---|---|---|---|---|---|---|---|---|---|---|
| city_port_avalon | brick, brass, slate | plane, oak | harbour brick, glass towers | 2 | 2 | 0 | 0 | 1 | 1 | C: Eastside Docks, Industrial Basin, Old Harbor; R: Riverside Lofts; H: Glasshill, Summit Estates |
| city_lakemont | glass, cedar, limestone | cedar, birch | campus modern, lake towers | 1 | 1 | 0 | 1 | 1 | 2 | C (lake): Lakefront, Northshore, Cedar Point; H: The Bluffs |
| city_redmesa | terracotta, sand, steel | palo verde, desert willow | adobe low-rise, solar canopies | 1 | 0 | 1 | 2 | 3 | 0 | F: Canyon Row; H: Mesa Heights, Saguaro Hills |
| city_meridia | ochre, marble, terracotta | cypress, oleander | canal palazzi, mainland blocks | 3 | 1 | 1 | 0 | 2 | 0 | C: Lido Strand, San Telmo Islands, Grand Canal, New Lagoon, Arsenal Yards |
| city_valcourt | limestone, slate, iron | lime, chestnut | river terraces, mills | 2 | 0 | 0 | 0 | 1 | 1 | R: Foundry Bank, Lock Quarter, Southern Mills; H: Cathedral Rise |
| city_belmara | timber, stone, copper | larch, pine | chalets, grand hotels | 1 | 0 | 1 | 0 | 0 | 3 | C (lake): Lakeside Promenade; H: Vineyard Slopes, Pinecrest |
| city_kaiyo | steel, neon glass, tile | ginkgo, cherry | dense towers, alley blocks | 2 | 2 | 3 | 0 | 1 | 0 | C: Harbor Freight, Reclaim Grid, Shiomi Docks; F: Loop Central, Neon Ward; R: Riverbend |
| city_tessan | concrete, jade tile, steel | banyan, bamboo | delta shophouses, fab halls | 3 | 3 | 1 | 0 | 2 | 0 | C/R: Fab Island, Delta Wharf, Canal Homes, Market Bridge |
| city_mirako | lacquer, timber, stone | maple, pine | temple roofs, terrace houses | 1 | 1 | 2 | 1 | 1 | 1 | H: Terrace Steps, Temple Hill, Maple Slopes; F: Temple Hill |
| city_nordhaven | white render, birch, glass | birch, spruce | pitched roofs, quay blocks | 1 | 2 | 0 | 0 | 0 | 3 | C: Harbor Works, Fjord Quarter, Opera Quay, Isle Mouth; H: Birch Hills |
| city_skarvik | red timber, granite | rowan, pine | fishing sheds, rig yards | 2 | 3 | 0 | 0 | 0 | 2 | C: Rig Yards, Herring Quay, Skerries, Harbor Exchange |
| city_vintra | slate, pine, concrete | spruce, aspen | mill towns, data halls | 1 | 1 | 0 | 1 | 0 | 3 | C (lake): Lakeside; R: Hydro Flats, Turbine Valley; H: Spruce Ridge |
| city_sundara | white stucco, teal tile | palm, bougainvillea | beach towers, barrio stairs | 2 | 3 | 1 | 1 | 2 | 0 | C: Sunset Strip, Marina Quarter, Palm Bay, Ocean Towers; H: Hill Barrios, Cliffside |
| city_cobreval | copper, adobe, whitewash | jacaranda, eucalyptus | colonial hill town, smelters | 1 | 1 | 2 | 2 | 2 | 0 | C: Ore Docks, Smelter Flats; H: Old Town Hill, Copper Terraces, Mirador; F: Mirador |
| city_alta_verde | green tile, stone, timber | ceiba, coffee shade trees | colonial centre, highland villas | 1 | 1 | 2 | 1 | 1 | 0 | H: Government Hill, Coffee Slopes, Highland Park; F: Colonial Center |
| city_isla_serena | coral stone, white timber | coconut palm, sea grape | private estates | 1 | 3 | 0 | 0 | 2 | 0 | C: The Cays |

### §3.3 Districts and landmarks (one landmark per district, 10 §3.19.6)

District names and tiers are 10 §3.2.2's list, final. `distId = dist_<city slug>_<district slug>`; landmark id `lmk_<district slug>` inside the city. Height caps per district come from 10's personality rules (heritage districts capped at 25 m outside the landmark).

| distId | City | District | Tier | Terrain role | Heritage | Landmark (lmk id) | Landmark brief |
|---|---|---|---|---|---|---|---|
| dist_port_avalon_eastside_docks | Port Avalon | Eastside Docks | working | waterfront | no | The Coal Crane (`lmk_the_coal_crane`) | a riveted harbour crane kept as a monument |
| dist_port_avalon_industrial_basin | Port Avalon | Industrial Basin | working | industrial_shore | no | Basin Gasworks (`lmk_basin_gasworks`) | brick gasholder frames turned into a market hall |
| dist_port_avalon_old_harbor | Port Avalon | Old Harbor | mid | waterfront | no | Old Harbor Lighthouse (`lmk_old_harbor_lighthouse`) | the first light of the bay |
| dist_port_avalon_riverside_lofts | Port Avalon | Riverside Lofts | mid | riverside | no | Ironworks Bridge (`lmk_ironworks_bridge`) | a lattice bridge over the river mouth |
| dist_port_avalon_midtown | Port Avalon | Midtown | mid | flat_center | no | Union Station (`lmk_union_station`) | the domed rail terminus |
| dist_port_avalon_financial_mile | Port Avalon | Financial Mile | prime | flat_center | no | Port Avalon Exchange Building (`lmk_port_avalon_exchange_building`) | columned hall of the exchange (CBD) |
| dist_port_avalon_glasshill | Port Avalon | Glasshill | prime | hill | no | Glasshill Observatory (`lmk_glasshill_observatory`) | copper-domed observatory over the bay |
| dist_port_avalon_summit_estates_on_gilt_hill | Port Avalon | Summit Estates on Gilt Hill | trophy | hill | no | Gilt Hill Gates (`lmk_gilt_hill_gates`) | wrought gates at the summit road |
| dist_lakemont_rail_yards | Lakemont | Rail Yards | working | flat_center | no | Roundhouse Market (`lmk_roundhouse_market`) | a locomotive roundhouse turned food hall |
| dist_lakemont_northshore | Lakemont | Northshore | mid | waterfront | no | Northshore Pier (`lmk_northshore_pier`) | a timber pier with a carousel |
| dist_lakemont_campus_quarter | Lakemont | Campus Quarter | mid | flat_center | no | University Tower (`lmk_university_tower`) | the clock tower of Lakemont University |
| dist_lakemont_old_town | Lakemont | Old Town | mid | flat_center | no | Clockmakers' Hall (`lmk_clockmakers_hall`) | guild hall of the clockmakers |
| dist_lakemont_lakefront | Lakemont | Lakefront | prime | waterfront | no | Lakefront Spire (`lmk_lakefront_spire`) | the tallest tower on the lake (CBD) |
| dist_lakemont_cedar_point | Lakemont | Cedar Point | prime | waterfront | no | Cedar Point Light (`lmk_cedar_point_light`) | a lake lighthouse among cedars |
| dist_lakemont_the_bluffs | Lakemont | The Bluffs | trophy | hill | no | Bluffs Overlook (`lmk_bluffs_overlook`) | a cliff-top terrace over the lake |
| dist_redmesa_powerline_flats | Redmesa | Powerline Flats | working | edge | no | Substation Seven (`lmk_substation_seven`) | a lattice substation lit at night |
| dist_redmesa_depot_district | Redmesa | Depot District | working | flat_center | no | Freight Depot Clocktower (`lmk_freight_depot_clocktower`) | the old freight depot |
| dist_redmesa_mesa_heights | Redmesa | Mesa Heights | mid | hill | no | Mesa Water Tower (`lmk_mesa_water_tower`) | a painted water tower |
| dist_redmesa_sunwell | Redmesa | Sunwell | mid | flat_center | no | Sunwell Solar Arch (`lmk_sunwell_solar_arch`) | an arch of solar panels over the main street |
| dist_redmesa_canyon_row | Redmesa | Canyon Row | mid | edge | no | Canyon Row Arcade (`lmk_canyon_row_arcade`) | a shaded arcade along the canyon rim |
| dist_redmesa_central_plaza | Redmesa | Central Plaza | prime | flat_center | no | Redmesa Capitol Plaza (`lmk_redmesa_capitol_plaza`) | the plaza before the old capitol (CBD) |
| dist_redmesa_saguaro_hills | Redmesa | Saguaro Hills | prime | hill | no | Saguaro Botanical Dome (`lmk_saguaro_botanical_dome`) | a glass dome of desert plants |
| dist_meridia_arsenal_yards | Meridia | Arsenal Yards | working | industrial_shore | no | The Old Arsenal (`lmk_the_old_arsenal`) | walled shipyards of the old navy |
| dist_meridia_lido_strand | Meridia | Lido Strand | mid | waterfront | no | Lido Bathhouse (`lmk_lido_bathhouse`) | a striped bathhouse on the sand bar |
| dist_meridia_mainland_gate | Meridia | Mainland Gate | mid | edge | no | Causeway Gate (`lmk_causeway_gate`) | the gate at the end of the causeway |
| dist_meridia_business_district | Meridia | Business District | prime | flat_center | no | Bourse of the Compact (`lmk_bourse_of_the_compact`) | the bourse and the central bank on one square (CBD) |
| dist_meridia_san_telmo_islands | Meridia | San Telmo Islands | mid | island | yes | San Telmo Bell Tower (`lmk_san_telmo_bell_tower`) | a leaning brick bell tower |
| dist_meridia_rialto_court | Meridia | Rialto Court | prime | flat_center | yes | Court of the Merchants (`lmk_court_of_the_merchants`) | arcaded merchants' court, seat of the Meridian Civil Court |
| dist_meridia_grand_canal | Meridia | Grand Canal | trophy | waterfront | yes | Palazzo Serrano (`lmk_palazzo_serrano`) | a marble palazzo on the great canal |
| dist_meridia_new_lagoon | Meridia | New Lagoon | mid | reclaimed | no | Lagoon Barrier Locks (`lmk_lagoon_barrier_locks`) | the tide barrier that protects the lagoon |
| dist_valcourt_foundry_bank | Valcourt | Foundry Bank | working | riverside | no | Great Foundry Chimney (`lmk_great_foundry_chimney`) | the last chimney of the iron foundries |
| dist_valcourt_lock_quarter | Valcourt | Lock Quarter | mid | riverside | no | Lock Nine (`lmk_lock_nine`) | a staircase of river locks |
| dist_valcourt_cathedral_rise | Valcourt | Cathedral Rise | mid | hill | no | Valcourt Cathedral (`lmk_valcourt_cathedral`) | twin-spired cathedral |
| dist_valcourt_atelier_row | Valcourt | Atelier Row | prime | flat_center | no | Velour Maison Atelier (`lmk_velour_maison_atelier`) | the couture house's glass-roofed workshop |
| dist_valcourt_bourse_square | Valcourt | Bourse Square | prime | flat_center | no | Valcourt Bourse Hall (`lmk_valcourt_bourse_hall`) | the old regional bourse (CBD) |
| dist_valcourt_southern_mills | Valcourt | Southern Mills | working | riverside | no | Southern Mill Wheel (`lmk_southern_mill_wheel`) | a working undershot mill wheel |
| dist_valcourt_parkside | Valcourt | Parkside | mid | flat_center | no | Parkside Conservatory (`lmk_parkside_conservatory`) | an iron-and-glass palm house |
| dist_belmara_station_quarter | Belmara | Station Quarter | mid | flat_center | no | Belmara Central Station (`lmk_belmara_central_station`) | an alpine station with a clock gable |
| dist_belmara_old_spa | Belmara | Old Spa | mid | hill | yes | Thermal Baths of Belmara (`lmk_thermal_baths_of_belmara`) | domed thermal baths, seat of the Appeals Chamber nearby |
| dist_belmara_lakeside_promenade | Belmara | Lakeside Promenade | prime | waterfront | no | Kursaal Concert Hall (`lmk_kursaal_concert_hall`) | a lakeside concert hall (CBD) |
| dist_belmara_vineyard_slopes | Belmara | Vineyard Slopes | prime | hill | no | Slopes Funicular (`lmk_slopes_funicular`) | a funicular through the vines |
| dist_belmara_pinecrest | Belmara | Pinecrest | trophy | hill | no | Pinecrest Chalet Row (`lmk_pinecrest_chalet_row`) | a row of historic timber chalets |
| dist_belmara_valley_works | Belmara | Valley Works | working | edge | no | Valley Hydro Dam (`lmk_valley_hydro_dam`) | an arched dam at the valley head |
| dist_kaiyo_harbor_freight | Kaiyo City | Harbor Freight | working | industrial_shore | no | Container Gantries (`lmk_container_gantries`) | a line of giant container cranes |
| dist_kaiyo_neon_ward | Kaiyo City | Neon Ward | mid | flat_center | no | Neon Ward Night Market (`lmk_neon_ward_night_market`) | a night market under neon signs |
| dist_kaiyo_delta_markets | Kaiyo City | Delta Markets | mid | riverside | no | Delta Fish Market (`lmk_delta_fish_market`) | the dawn fish auction hall |
| dist_kaiyo_loop_central | Kaiyo City | Loop Central | prime | flat_center | no | Loop Central Station Tower (`lmk_loop_central_station_tower`) | the rail-loop hub tower (CBD) |
| dist_kaiyo_reclaim_grid | Kaiyo City | Reclaim Grid | mid | reclaimed | no | Seawall Park (`lmk_seawall_park`) | a park on the reclaimed seawall |
| dist_kaiyo_shinbashi_heights | Kaiyo City | Shinbashi Heights | trophy | hill | no | Shinbashi Sky Garden (`lmk_shinbashi_sky_garden`) | a garden bridge between two towers |
| dist_kaiyo_riverbend | Kaiyo City | Riverbend | mid | riverside | no | Riverbend Shrine (`lmk_riverbend_shrine`) | a red-gated shrine at the river bend |
| dist_kaiyo_shiomi_docks | Kaiyo City | Shiomi Docks | working | waterfront | no | Shiomi Drydock (`lmk_shiomi_drydock`) | a stone drydock still in use |
| dist_tessan_fab_island | Tessan | Fab Island | working | island | no | Fab One Cleanroom Hall (`lmk_fab_one_cleanroom_hall`) | the white hall of the first fab |
| dist_tessan_delta_wharf | Tessan | Delta Wharf | working | industrial_shore | no | Delta Wharf Cranes (`lmk_delta_wharf_cranes`) | river-sea transfer cranes |
| dist_tessan_market_bridge | Tessan | Market Bridge | mid | riverside | no | Market Bridge (`lmk_market_bridge`) | a covered bridge lined with stalls |
| dist_tessan_old_ward | Tessan | Old Ward | mid | flat_center | yes | Old Ward Pagoda (`lmk_old_ward_pagoda`) | a nine-storey pagoda |
| dist_tessan_tower_bund | Tessan | Tower Bund | prime | waterfront | no | Bund Clocktower (`lmk_bund_clocktower`) | the clocktower of the riverfront bund (CBD) |
| dist_tessan_hillgarden | Tessan | Hillgarden | prime | hill | no | Hillgarden Tea Terraces (`lmk_hillgarden_tea_terraces`) | stepped tea terraces above the delta |
| dist_tessan_canal_homes | Tessan | Canal Homes | mid | riverside | no | Canal Lantern Walk (`lmk_canal_lantern_walk`) | a canal path lit by lanterns |
| dist_mirako_terrace_steps | Mirako | Terrace Steps | mid | hill | yes | Thousand Steps (`lmk_thousand_steps`) | a stone stairway through the terraces |
| dist_mirako_temple_hill | Mirako | Temple Hill | prime | hill | yes | Temple of the Mountain Gate (`lmk_temple_of_the_mountain_gate`) | the summit temple |
| dist_mirako_riverside_arcades | Mirako | Riverside Arcades | mid | riverside | no | Riverside Covered Arcade (`lmk_riverside_covered_arcade`) | a covered shopping arcade on the river |
| dist_mirako_station_center | Mirako | Station Center | prime | flat_center | no | Mirako Grand Station (`lmk_mirako_grand_station`) | the station and plaza (CBD) |
| dist_mirako_kiln_yard | Mirako | Kiln Yard | working | edge | no | Old Kiln Chimneys (`lmk_old_kiln_chimneys`) | a cluster of pottery kiln chimneys |
| dist_mirako_maple_slopes | Mirako | Maple Slopes | mid | hill | no | Maple Slopes Ropeway (`lmk_maple_slopes_ropeway`) | a cable car over the maples |
| dist_nordhaven_harbor_works | Nordhaven City | Harbor Works | working | industrial_shore | no | Shipyard Crane (`lmk_shipyard_crane`) | the yellow shipyard crane |
| dist_nordhaven_gamla_town | Nordhaven City | Gamla Town | mid | flat_center | yes | Gamla Town Hall (`lmk_gamla_town_hall`) | a stepped-gable town hall |
| dist_nordhaven_terrace_row | Nordhaven City | Terrace Row | mid | hill | no | Terrace Row Steps (`lmk_terrace_row_steps`) | painted terraces up the slope |
| dist_nordhaven_fjord_quarter | Nordhaven City | Fjord Quarter | prime | waterfront | no | Fjord Baths (`lmk_fjord_baths`) | floating sea baths |
| dist_nordhaven_opera_quay | Nordhaven City | Opera Quay | prime | waterfront | no | Nordhaven Opera House (`lmk_nordhaven_opera_house`) | an opera house sloping into the fjord (CBD) |
| dist_nordhaven_birch_hills | Nordhaven City | Birch Hills | mid | hill | no | Birch Hills Ski Jump (`lmk_birch_hills_ski_jump`) | a ski jump over the city |
| dist_nordhaven_isle_mouth | Nordhaven City | Isle Mouth | working | island | no | Isle Mouth Fortress (`lmk_isle_mouth_fortress`) | a star fort at the fjord mouth |
| dist_skarvik_rig_yards | Skarvik | Rig Yards | working | industrial_shore | no | Rig Yard Gantry (`lmk_rig_yard_gantry`) | the gantry that builds offshore rigs |
| dist_skarvik_herring_quay | Skarvik | Herring Quay | mid | waterfront | yes | Herring Salt Houses (`lmk_herring_salt_houses`) | red salting houses on stilts |
| dist_skarvik_rockside | Skarvik | Rockside | mid | edge | no | Rockside Chapel (`lmk_rockside_chapel`) | a granite chapel on bare rock |
| dist_skarvik_harbor_exchange | Skarvik | Harbor Exchange | prime | waterfront | no | Energy Exchange Hall (`lmk_energy_exchange_hall`) | the energy trading hall (CBD) |
| dist_skarvik_skerries | Skarvik | Skerries | prime | island | no | Skerry Lighthouse (`lmk_skerry_lighthouse`) | a lighthouse on the outer skerry |
| dist_skarvik_northfield | Skarvik | Northfield | working | edge | no | Northfield Gas Terminal (`lmk_northfield_gas_terminal`) | spherical gas tanks by the sea |
| dist_vintra_turbine_valley | Vintra | Turbine Valley | working | riverside | no | Turbine Hall One (`lmk_turbine_hall_one`) | the first hydro turbine hall |
| dist_vintra_lakeside | Vintra | Lakeside | mid | waterfront | no | Vintra Lake Pier (`lmk_vintra_lake_pier`) | a long timber pier |
| dist_vintra_old_mill | Vintra | Old Mill | mid | riverside | no | Old Paper Mill (`lmk_old_paper_mill`) | a brick paper mill turned studios |
| dist_vintra_vintra_center | Vintra | Vintra Center | prime | flat_center | no | Town Square Clock (`lmk_town_square_clock`) | the square's iron clock (CBD) |
| dist_vintra_spruce_ridge | Vintra | Spruce Ridge | prime | hill | no | Spruce Ridge Lodge (`lmk_spruce_ridge_lodge`) | a log lodge on the ridge |
| dist_vintra_hydro_flats | Vintra | Hydro Flats | working | flat_center | no | Vintra Dam (`lmk_vintra_dam`) | the great dam above the town |
| dist_sundara_sunset_strip | Sundara Coast | Sunset Strip | working | waterfront | no | Sunset Boardwalk (`lmk_sunset_boardwalk`) | a boardwalk of food stalls |
| dist_sundara_coastal_spine | Sundara Coast | Coastal Spine | mid | edge | no | Coastal Highway Arch (`lmk_coastal_highway_arch`) | the arch over the coast road |
| dist_sundara_hill_barrios | Sundara Coast | Hill Barrios | working | hill | no | Barrio Murals Stair (`lmk_barrio_murals_stair`) | a stair painted with murals |
| dist_sundara_marina_quarter | Sundara Coast | Marina Quarter | mid | waterfront | no | Marina Lighthouse (`lmk_marina_lighthouse`) | the marina's harbour light |
| dist_sundara_palm_bay | Sundara Coast | Palm Bay | prime | waterfront | no | Palm Bay Pier (`lmk_palm_bay_pier`) | a white pier and pavilion |
| dist_sundara_ocean_towers | Sundara Coast | Ocean Towers | prime | waterfront | no | Coalition Exchange Tower (`lmk_coalition_exchange_tower`) | the exchange tower (CBD) |
| dist_sundara_cliffside | Sundara Coast | Cliffside | mid | hill | no | Cliffside Lookout (`lmk_cliffside_lookout`) | a lookout over the surf |
| dist_cobreval_smelter_flats | Cobreval | Smelter Flats | working | industrial_shore | no | Great Smelter Stack (`lmk_great_smelter_stack`) | the tallest smelter chimney |
| dist_cobreval_ore_docks | Cobreval | Ore Docks | working | industrial_shore | no | Ore Loading Pier (`lmk_ore_loading_pier`) | a long ore pier with conveyors |
| dist_cobreval_old_town_hill | Cobreval | Old Town Hill | mid | hill | yes | Cobreval Funicular (`lmk_cobreval_funicular`) | a funicular up the old town |
| dist_cobreval_plaza_mayor | Cobreval | Plaza Mayor | prime | flat_center | no | Cobreval Cabildo (`lmk_cobreval_cabildo`) | the arcaded town council (CBD) |
| dist_cobreval_copper_terraces | Cobreval | Copper Terraces | mid | hill | no | Copper Dome Church (`lmk_copper_dome_church`) | a church with a green copper dome |
| dist_cobreval_mirador | Cobreval | Mirador | prime | hill | no | Mirador Balcony (`lmk_mirador_balcony`) | a terrace over the bay |
| dist_cobreval_riverside_colonia | Cobreval | Riverside Colonia | mid | riverside | no | Colonia River Market (`lmk_colonia_river_market`) | a river market under tin roofs |
| dist_alta_verde_market_valley | Alta Verde | Market Valley | working | flat_center | no | Valley Wholesale Market (`lmk_valley_wholesale_market`) | the great produce market |
| dist_alta_verde_government_hill | Alta Verde | Government Hill | prime | hill | no | Coalition Congress Palace (`lmk_coalition_congress_palace`) | the congress and central bank (CBD) |
| dist_alta_verde_colonial_center | Alta Verde | Colonial Center | mid | flat_center | yes | Colonial Cathedral (`lmk_colonial_cathedral`) | a baroque cathedral |
| dist_alta_verde_coffee_slopes | Alta Verde | Coffee Slopes | mid | hill | no | Coffee Exchange Hacienda (`lmk_coffee_exchange_hacienda`) | the old coffee exchange house |
| dist_alta_verde_highland_park | Alta Verde | Highland Park | prime | hill | no | Highland Observatory (`lmk_highland_observatory`) | an observatory in the park |
| dist_alta_verde_southern_ring | Alta Verde | Southern Ring | working | edge | no | Southern Ring Bus Terminal (`lmk_southern_ring_bus_terminal`) | a modernist bus terminal |
| dist_alta_verde_university_mesa | Alta Verde | University Mesa | mid | flat_center | no | University Mesa Library (`lmk_university_mesa_library`) | a library with a mosaic facade |
| dist_isla_serena_the_cays | Isla Serena | The Cays | trophy | island | no | Serena Lighthouse Key (`lmk_serena_lighthouse_key`) | a lighthouse on the central key |

Total: 105 districts (104 in the 15 bloc cities plus The Cays). 10's notes estimated 108; the authoritative count is the table above.

### §3.4 Civic buildings per city: Hall of Patrons and the crown residence

| cityId | Hall of Patrons building (10 §3.22) | Skyline crown residence (14 `lid_skyline_tower_penthouse`, one per bloc city CBD) | Crown tower id |
|---|---|---|---|
| city_port_avalon | Hall of Patrons of Port Avalon | The Crown at Meridian Spire | `tower_crown_port_avalon` |
| city_lakemont | Hall of Patrons of Lakemont | The Crown at Lakefront Spire Crown | `tower_crown_lakemont` |
| city_redmesa | Hall of Patrons of Redmesa | The Crown at Capitol Plaza Tower | `tower_crown_redmesa` |
| city_meridia | Hall of Patrons of Meridia | The Crown at Torre della Laguna | `tower_crown_meridia` |
| city_valcourt | Hall of Patrons of Valcourt | The Crown at Bourse Square Belvedere | `tower_crown_valcourt` |
| city_belmara | Hall of Patrons of Belmara | The Crown at Kursaal Tower | `tower_crown_belmara` |
| city_kaiyo | Hall of Patrons of Kaiyo City | The Crown at Loop Crown | `tower_crown_kaiyo` |
| city_tessan | Hall of Patrons of Tessan | The Crown at Bund Pinnacle | `tower_crown_tessan` |
| city_mirako | Hall of Patrons of Mirako | The Crown at Station Center Crown | `tower_crown_mirako` |
| city_nordhaven | Hall of Patrons of Nordhaven City | The Crown at Opera Quay Tower | `tower_crown_nordhaven` |
| city_skarvik | Hall of Patrons of Skarvik | The Crown at Harbor Exchange Light | `tower_crown_skarvik` |
| city_vintra | Hall of Patrons of Vintra | The Crown at Vintra Center Spire | `tower_crown_vintra` |
| city_sundara | Hall of Patrons of Sundara Coast | The Crown at Ocean Towers Crown | `tower_crown_sundara` |
| city_cobreval | Hall of Patrons of Cobreval | The Crown at Plaza Mayor Torre | `tower_crown_cobreval` |
| city_alta_verde | Hall of Patrons of Alta Verde | The Crown at Government Hill Mirador | `tower_crown_alta_verde` |

### §3.5 Isla Serena islands → content/serena_islands.json

10 §3.18 owns the rules: 9 islands at launch, 3 auctioned in launch week, then 1 per chapter, queue up to 15 (`PARAM.serena_island_max`). 14 §3.7.7 said "6 at launch"; 10 owns geography, so 9 is final (22-notes). Order of the table = auction order.

| islandId | Name | Area class | Features | Launch | Auction slot |
|---|---|---|---|---|---|
| isl_coral_key | Coral Key | large | deep-water marina, airstrip, reef lagoon | yes | launch week |
| isl_pelican_cay | Pelican Cay | medium | marina, airstrip, salt pond | yes | launch week |
| isl_lantern_cay | Lantern Cay | medium | marina, airstrip, old lighthouse | yes | launch week |
| isl_moonrise_island | Moonrise Island | large | marina, airstrip, volcanic peak | yes | chapter 2 |
| isl_saltwind_cay | Saltwind Cay | small | marina, airstrip, windward cliffs | yes | chapter 3 |
| isl_heron_island | Heron Island | medium | marina, airstrip, mangrove inlet | yes | chapter 4 |
| isl_azure_cay | Azure Cay | small | marina, airstrip, blue hole | yes | chapter 5 |
| isl_palmetto_key | Palmetto Key | medium | marina, airstrip, palm grove | yes | chapter 6 |
| isl_sable_cay | Sable Cay | large | marina, airstrip, black-sand beach | yes | chapter 7 |
| isl_starfall_cay | Starfall Cay | small | marina, airstrip | queued (joins when a new coastal city opens, 10 §3.2.3) | after the launch nine |
| isl_mangrove_key | Mangrove Key | medium | marina, airstrip | queued (joins when a new coastal city opens, 10 §3.2.3) | after the launch nine |
| isl_driftwood_cay | Driftwood Cay | small | marina, airstrip | queued (joins when a new coastal city opens, 10 §3.2.3) | after the launch nine |
| isl_turtle_cay | Turtle Cay | medium | marina, airstrip | queued (joins when a new coastal city opens, 10 §3.2.3) | after the launch nine |
| isl_gull_island | Gull Island | large | marina, airstrip | queued (joins when a new coastal city opens, 10 §3.2.3) | after the launch nine |
| isl_coralline_key | Coralline Key | medium | marina, airstrip | queued (joins when a new coastal city opens, 10 §3.2.3) | after the launch nine |

### §3.6 New-city personality queue → content/city_queue.json

10 §3.2.3 opens new cities in a bloc; each uses the next personality of that bloc's queue. Each has a distinct geographic constraint (LC04). The queue below covers the first 3 openings per bloc (15 cities, enough for `N_a` up to about 60,000 above launch); beyond it, the generator of §3.8 builds personalities. Launch population = 60% of the bloc's mean launch city population (10).

| Queue | cityId | Name | Bloc | Geographic constraint | Coastal | Districts (tier) | Palette | Signature landmark |
|---|---|---|---|---|---|---|---|---|
| FDL-1 | city_granite_falls | Granite Falls | FDL | river gorge with waterfalls and quarries | no | Quarry Row (working), Falls Bridge (mid), Millrace (mid), Gorge Center (prime, CBD), Overlook Heights (prime), Ridgeway (mid) | granite, timber | Falls Bridge |
| FDL-2 | city_pelican_sound | Pelican Sound | FDL | barrier islands enclosing a shallow sound | yes | Sound Docks (working), Causeway (mid), Barrier Beach (mid), Sound Center (prime, CBD), Dune Estates (prime), Marsh Edge (working) | clapboard, sand | Sound Causeway Light |
| FDL-3 | city_frostpine | Frostpine | FDL | northern mountain valley with a ski bowl | no | Rail Siding (working), Lodge Row (mid), Bowl Village (prime, CBD), Timberline (prime), Creekside (mid), Mill Flats (working) | log, stone | Frostpine Lodge |
| EUN-1 | city_castellaro | Castellaro | EUN | walled hilltop town above a plain | no | Plain Works (working), Borgo (mid, heritage), Rocca (prime, heritage), Nuova Piazza (prime, CBD), Vigne (mid), Stazione (mid) | tuff, terracotta | The Rocca walls |
| EUN-2 | city_havren | Havren | EUN | tidal flats port with dikes | yes | Dike Harbor (working), Polder (mid), Weigh House (mid, heritage), Havren Center (prime, CBD), Dune Villas (prime), Flats Works (working) | brick, white trim | The Weigh House |
| EUN-3 | city_sorvenna | Sorvenna | EUN | volcanic island with a crater lake | yes | Pumice Port (working), Lava Terraces (mid), Crater Rim (prime), Marina Grande (prime, CBD), Old Village (mid, heritage), Black Beach (mid) | basalt, whitewash | Crater Rim Walk |
| PYN-1 | city_hoshima | Hoshima | PYN | volcanic island arc linked by bridges | yes | Ferry Port (working), Hot Springs (mid), Ash Fields (working), Bridge Center (prime, CBD), Crater View (prime), Fishing Village (mid) | black stone, cedar | The Arc Bridges |
| PYN-2 | city_ryugawa | Ryugawa | PYN | deep river gorge with cliff dwellings | no | Gorge Works (working), Cliff Ward (mid), Rapids (mid), Ryugawa Center (prime, CBD), Upper Terraces (prime), Dam Village (working) | timber, slate | Dragon Gorge Bridge |
| PYN-3 | city_saiban | Saiban | PYN | planned new town on salt flats | yes | Salt Works (working), Grid One (mid), Grid Two (mid), Saiban Core (prime, CBD), Lagoon Villas (prime), Logistics Park (working) | white concrete, glass | Saiban Core Tower |
| NKR-1 | city_ostergrund | Ostergrund | NKR | outer archipelago of granite islets | yes | Ferry Quay (working), Pilot Island (mid), Granite Isles (prime), Ostergrund Center (prime, CBD), Fisher Holm (mid), Boatyards (working) | red timber, granite | Pilot Tower |
| NKR-2 | city_kaldmark | Kaldmark | NKR | tundra mining town under the aurora | no | Pit Edge (working), Barracks Row (mid), Aurora Center (prime, CBD), Reindeer Flats (mid), Lake Kald (prime), Rail Head (working) | corrugated steel, larch | Aurora Dome |
| NKR-3 | city_lysfjell | Lysfjell | NKR | high plateau with wind farms | no | Turbine Ridge (working), Plateau Town (mid), Lys Center (prime, CBD), Summit Lodges (prime), Moor Houses (mid), Quarry Gap (working) | stone, birch | Lysfjell Wind Gate |
| SRL-1 | city_puerto_brisa | Puerto Brisa | SRL | wind-swept cape with a deep harbour | yes | Cape Docks (working), Lighthouse Hill (prime), Brisa Center (prime, CBD), Fishermen's Row (mid), Kite Beach (mid), Wind Farm Flats (working) | whitewash, blue shutters | Cape Brisa Light |
| SRL-2 | city_selvana | Selvana | SRL | rainforest river city on stilts | no | River Port (working), Stilt Town (mid), Canopy Heights (prime), Selvana Center (prime, CBD), Mission Quarter (mid, heritage), Sawmill Bend (working) | timber, palm thatch | Canopy Walkway |
| SRL-3 | city_san_aurelio | San Aurelio | SRL | desert oasis with palm groves | no | Caravan Yards (working), Palm Grove (prime), Old Oasis (mid, heritage), Aurelio Center (prime, CBD), Dune Edge (mid), Solar Fields (working) | adobe, palm | The Old Cistern |

### §3.7 Street names (generator `street`) → generated into content state at city creation

10 needs at least 400 street names per city with bilingual string keys. Generator `rng('content/street/<cityId>', worldSeed)`:

1. Candidate set = `roots(bloc) ∪ localRoots(city)` × `suffixes(bloc)`, plus the 20 "civic" forms `<landmark root> <civic suffix>` from the city's own landmarks and districts.
2. Shuffle the candidate set with the stream (Fisher–Yates) and keep the first `PARAM.street_names_per_city = 480` (≥ 400 required, 20% headroom for new parcels). Unique within the city.
3. String key `street.<cityId>.<n>`; EN text = the composed name. FR text: the root is kept; the suffix is translated by the suffix table (FR column). Streets in EUN cities keep their native form in both languages.
4. 10's road generator assigns names: arterials take civic forms first, then the longest streets take "Avenue/Boulevard"-class suffixes, then the rest in shuffled order.

**Roots per bloc (60 each)**

| Bloc | Roots |
|---|---|
| FDL | Maple, Cedar, Elm, Willow, Hickory, Chestnut, Juniper, Laurel, Magnolia, Spruce, Harbor, Anchor, Beacon, Bayview, Clipper, Mariner, Pier, Lighthouse, Tidewater, Ferry, Union, Liberty, Charter, Founders, Senate, Congress, Commerce, Market, Exchange, Mint, Granite, Copper, Iron, Foundry, Mill, Quarry, Canal, Railway, Depot, Station, Prospect, Summit, Ridge, Valley, Meadow, Orchard, Garden, Park, Lake, Brook, Franklin, Hamilton, Jefferson, Madison, Lincoln, Garfield, Grant, Monroe, Jackson, Polk |
| EUN | Rosiers, Tilleuls, Marronniers, Cyprès, Oliviers, Vignes, Lavande, Saules, Acacias, Platanes, Arsenal, Bourse, Douane, Lagune, Rialto, Gondole, Pescheria, Lido, Darse, Canal, Cathédrale, Chapelle, Couvent, Abbaye, Prieuré, Évêché, Palais, Château, Rempart, Bastion, Fonderie, Écluse, Moulin, Forge, Tisserands, Orfèvres, Horlogers, Tanneurs, Drapiers, Verriers, Concorde, Compact, Républica, Libertà, Unione, Europa, Fontana, Piazzetta, Belvédère, Terrasse, Lumière, Aurore, Soleil, Étoile, Saint-Clair, San Telmo, Santa Lucia, San Marco Vecchio, Notre-Rive, Sankt Anna |
| PYN | Sakura, Momiji, Matsu, Take, Ume, Ginkgo, Kiri, Fuji-no, Ayame, Tsubaki, Minato, Hatoba, Kaigan, Shiomi, Funabashi, Kawabata, Sunagawa, Hamabe, Misaki, Seto, Ichiban, Niban, Sanban, Yonban, Goban, Chuo, Higashi, Nishi, Kita, Minami, Hikari, Kaze, Kumo, Hoshi, Tsuki, Hi-no-de, Yuhi, Asahi-dori, Kogane, Shirogane, Tenjin, Inari, Hachiman, Kannon, Bunka, Gakuen, Shinbashi, Daimon, Ote, Honmachi, Kanda, Kyobashi, Tokiwa, Ryogoku, Nakadori, Kotobuki, Sakae, Midori, Aoba, Wakaba |
| NKR | Björk, Gran, Furu, Rønn, Asp, Lind, Ek, Alm, Hassel, Sälg, Havn, Brygge, Fyr, Kai, Skjær, Sund, Vik, Fjord, Holme, Strand, Kirke, Torg, Rådhus, Skole, Mølle, Smie, Verft, Damm, Bro, Port, Nord, Sør, Øst, Vest, Lys, Norrsken, Sol, Måne, Stjerne, Vind, Kong, Dronning, Prins, Jarl, Riddar, Skald, Saga, Rune, Odin, Frøya, Tunnel, Bakke, Lia, Haug, Dal, Myr, Åsen, Berg, Elv, Foss |
| SRL | Palmeras, Jacarandas, Ceibos, Olivos, Naranjos, Laureles, Cedros, Eucaliptos, Bugambilias, Cafetales, Puerto, Muelle, Faro, Marina, Ribera, Malecón, Arena, Coral, Gaviotas, Brisa, Independencia, Libertad, Coalición, Constitución, República, Congreso, Cabildo, Catedral, Misión, Convento, Cobre, Plata, Oro, Fundición, Mina, Molino, Hacienda, Viñedo, Cosecha, Mercado, Sol, Luna, Estrella, Aurora, Arcoíris, Cumbre, Mirador, Cerro, Quebrada, Valle, San Martín, Santa Rosa, San Isidro, Santa Fe, San Telmo Sur, Los Andes Altos, Las Flores, Los Pinos, La Paz Vieja, El Prado |

**Local roots (10 per city)**: the city's district names and landmark roots (first word of each, de-duplicated), padded with these city words: Port Avalon (Avalon, Gilt, Crescent); Lakemont (Lakeshore, Bluff, Campus); Redmesa (Mesa, Saguaro, Canyon); Meridia (Laguna, Serrano, Telmo); Valcourt (Valcourt, Lock, Atelier); Belmara (Belmara, Kursaal, Pinecrest); Kaiyo City (Kaiyo, Loop, Neon); Tessan (Tessan, Bund, Delta); Mirako (Mirako, Kiln, Temple); Nordhaven City (Nordhaven, Gamla, Opera); Skarvik (Skarvik, Herring, Skerry); Vintra (Vintra, Turbine, Spruce); Sundara Coast (Sundara, Palm, Sunset); Cobreval (Cobreval, Smelter, Mirador); Alta Verde (Alta Verde, Highland, Colonial).

**Suffixes per bloc (EN form; FR translation)**

| Bloc | Suffixes |
|---|---|
| FDL | Street (rue), Avenue (avenue), Boulevard (boulevard), Lane (allée), Road (route), Drive (promenade), Place (place), Court (cour), Way (voie), Terrace (terrasse), Row (rangée) |
| EUN | Rue / Via / Strasse chosen by city (Meridia: Calle, Fondamenta, Campo, Rio Terà; Valcourt: Rue, Quai, Place, Impasse; Belmara: Strasse, Weg, Platz, Promenade); kept in both languages |
| PYN | -dori (avenue), -michi (lane), -suji (street), -zaka (slope), -bashi (bridge road), -yokocho (alley) |
| NKR | -gata (street), -vegen (road), -allé (avenue), -plass (square), -bryggen (wharf), -stien (path) |
| SRL | Calle (rue), Avenida (avenue), Paseo (promenade), Callejón (ruelle), Camino (chemin), Plaza (place), Costanera (corniche) |

Civic suffixes: Square, Plaza, Quay, Promenade, Circus (FDL); Piazza, Quai, Platz (EUN); Hiroba, Ekimae (PYN); Torget, Kaia (NKR); Plaza Mayor, Alameda (SRL).

### §3.8 Real-estate NPC institutions per city (generator `re_npc`) → content/re_npc.json

10 needs per city: 3–6 named NPC landlords (≈ 70 world-wide; two per bloc are the listed REITs), 2–4 NPC developers (≈ 45), one land authority and one NPC property fund. Counts: landlords `= 3 + floor(pop / 80,000)` capped at 6 (Port Avalon 6, Kaiyo City 6, Tessan 5, Meridia 5, Sundara Coast 5, Lakemont 5, Alta Verde 5, Redmesa 4, Valcourt 4, Cobreval 4, Nordhaven City 4, Mirako 4, Belmara 4, Skarvik 4, Vintra 3 = 68, plus the 10 REITs, which are landlords in their home city and in up to 2 other cities of their bloc); developers `= 2 + floor(pop / 100,000)` capped at 4 (total 41 at launch, plus the 5 listed developers of §4.1 counted in their home city); 1 land authority and 1 property fund per city.

**Fixed (authored) names**

| Kind | cityId | Name |
|---|---|---|
| Land authority | each bloc city | `<City> Land Authority` (e.g. Port Avalon Land Authority) |
| Land authority | city_isla_serena | The Serena Trust (§2.2) acts as land authority |
| NPC property fund (instant buyer, 10 §3.9.3) | each bloc city | `<City> Property Fund` run by the bloc SIB's asset-management arm (e.g. "Port Avalon Property Fund · Avalon National") |
| Landlord (named in 10) | city_port_avalon | Harbor Realty Trust (listed REIT, ticker HRBT); Gilt Hill Family Office |
| Listed REITs | per bloc | the two REAL_ESTATE REITs of §4.1 for that bloc |
| Listed developers | per bloc | the developer row of §4.1 (Aurelius Holdings for FDL, etc.) |

**Generated names** (scope: unique world-wide). Grammar, pick by weight:

| Weight | Landlord pattern | Developer pattern |
|---|---|---|
| 0.30 | `<district root> Realty` | `<family> Construction and Development` |
| 0.25 | `<family> Family Office` | `<city root> Builders` |
| 0.20 | `<landmark root> Estates` | `<district root> Developments` |
| 0.15 | `<family> & <family> Properties` | `<family> Group` |
| 0.10 | `<city root> Housing Cooperative` | `<city root> Urban Partners` |

`<family>` from the bloc pool (§0.4); `<district root>` and `<landmark root>` = first word of a district or landmark name of that city; `<city root>` = first word of the city name. SRL and EUN cities use native forms with weight 0.5: SRL "Inmobiliaria <family>", "Desarrollos <district root>"; EUN "Immobiliare <family>", "Société Foncière <district root>", "<family> Immobilien". Generated landlords and developers are not named actors: they are BACKGROUND institutions run by 10's policy rules and owned by a generated family `npc` entity (they are counted among the BACKGROUND private-firm owners of 16 §3.3.1, see §10.3). Stream `rng('content/re_npc/<cityId>', worldSeed)`.

### §3.9 New-city generator (beyond the queue; generator `city_new`)

For a city opened after a bloc's queue (§3.6) is exhausted:
1. Geographic constraint drawn without replacement from: `fjord`, `delta`, `lagoon`, `desert basin`, `alpine lake`, `river gorge`, `volcanic island`, `archipelago`, `terraced hills`, `tidal flats`, `plateau`, `rainforest river`, `oasis`, `cape`, `crater lake`, `canyon`, `bay with reclaimed land`, `river confluence`; a constraint already used by a city of the same bloc is excluded (LC04).
2. Name = `<root><ending>` with roots and endings per bloc style: FDL roots {Ash, Bright, Clear, Fair, Green, High, Iron, Lone, Pine, Red, Silver, Stone, Sun, West} × endings {field, ford, haven, ridge, port, water, view, gate}; EUN roots {Alba, Bel, Castel, Fonte, Lago, Mont, Pietra, Riva, Roche, Val} × endings {-ara, -court, -mont, -ville, -enza, -berg}; PYN roots {Asa, Hoshi, Kawa, Kita, Minami, Nami, Shima, Taka, Yama, Kai} × endings {-gawa, -hama, -saki, -oka, -mura, -jima}; NKR roots {Bjør, Fjell, Hav, Is, Lys, Nord, Sol, Stor, Vind, Øst} × endings {-vik, -haven, -fjord, -by, -nes, -heim}; SRL roots {Agua, Brisa, Cerro, Luna, Monte, Palma, Rio, Santa, Sierra, Valle} × endings {-verde, -mar, -alta, -dorado, -bella, -sol}. Unique world-wide.
3. 6–8 districts: one `working` (named after the city's main industry for its constraint), two `mid`, one `prime` CBD (`<Name> Center`), one more `prime` (named after the constraint's best feature), plus 1–3 more `mid` or `working`; names from the district grammar `<feature word> <district noun>` (feature words per constraint, nouns: Quarter, Heights, Row, Flats, Docks, Terraces, Gate, Center).
4. One landmark per district from the landmark grammar `<district root> <landmark noun>` (nouns: Tower, Bridge, Hall, Market, Light, Gate, Steps, Baths, Chimney, Dome, Pier).
5. Personality numbers: `cityRentMult ~ U(0.65, 1.10)`, `hhSize ~ U(2.0, 3.2)` (SRL +0.3), `ownerOcc ~ U(0.45, 0.65)`, `cycleBeta = bloc mean of launch cities × U(0.9, 1.2)`, `cityGdpShare`: the new city takes 60% of the mean launch-city share, and the bloc's other cities are scaled down proportionally so shares still sum to 1. Perils drawn from the constraint's table (coastal constraints: coastal storm ≥ 2).
6. Content created with the city: 4 listed companies (§4.1.1 generator), 40 private firms (§6.9), 40 actors (16 §3.3.1), landlords and developers (§3.8), a street bank (§3.7), a Hall of Patrons, a crown tower (if the city has a prime CBD), one sports franchise (§6.8 generator), 2 NPC labs (11 §3.17, §7.4 generator), one regional NPC bank (§5.1).

## §4 The tradeable universe → content/instruments.json

06 §3.1.1 fixes the launch universe at exactly 400 authored instruments: 240 equities, 30 ETFs, 30 government bonds, 50 corporate bonds, 10 FX pairs, 20 commodity lines and 20 tokens. This section lists every one. Indices are reference values, not instruments (§4.8). Rule-created instruments (derivative series, LP tokens, new issues, IPOs, meme coins, non-benchmark hub lines, collectibles) are not listed here; their id grammar is 06 §3.1.3.

### §4.1 Equities: the 240 NPC listed companies

**Columns.** `assetId = ast_EQ_<TICKER>`, issuer `cmp_<ticker lowercase>`. Sector = 06 `SectorId`. HQ = headquarters city (10 premises and city employment). `cap0` = genesis market capitalisation in billions of FDL (converted at genesis FX), from the authored rule below. Size = 06 size class by free-float cap within the bloc: L (top 12, large cap), M (next 24), S (bottom 12, small cap). `px0` = genesis share price in the listing currency; shares outstanding = `cap0 / FX0 / px0` rounded down to 1,000. `09 type` = the catalog business type used when 09 absorbs the company into the catalog economy (09 §3.13.10 mapping) and the type whose `ArchetypeRef` drives its fundamentals. Notes name special roles.

**Authoring rule for cap0 (DEFAULT, Mathis may override).** World listed cap at genesis = $40T FDL. Bloc total = $40T × `gdpShare0` (04). Within a bloc, sector weight = 1.8 for the bloc's three tilt sectors (04 §2.2 sector tilt), 1.0 otherwise, normalised. Within a sector the four companies take 45%, 27%, 17%, 11% in table order. `px0 = 20 + (h mod 380)` listing-currency units, where `h` = first 32 bits of SHA-256 of the ticker (deterministic). Free float 75% by default; dynasty-linked companies 60% (§10.4 sets which); REITs 90%. Earnings report slot: tickers sorted alphabetically within a bloc alternate PRE and POST; report day within the quarter = trading day `6 + (h mod 15)` (09 earnings calendar).

**Default factor loadings (05 §3.3.3).** By size class: L `L_GX 0.55, L_EQ 0.30, L_SEC 0.45`; M `0.50, 0.28, 0.42`; S `0.42, 0.25, 0.38` (each satisfies `L_GX² + L_EQ² + L_SEC² ∈ [0.35, 0.65]`). Sector extras: TECH `RATES +0.15, AI_RACE +0.20`; SEMI `AI_RACE +0.30` (PYN also `FX_PYN −0.10`); ENERGY `CMD_ENERGY +0.35`; MATERIALS `CMD_METALS +0.35`; INDUSTRIALS `CMD_ENERGY −0.10` (PYN also `FX_PYN −0.10`); FINANCIALS `RATES −0.15, CREDIT +0.25`; STAPLES `CMD_AGRI −0.15`; DISCRETIONARY `CREDIT +0.10`; REAL_ESTATE `RATES +0.30`; gold miners `GOLD +0.40` instead of CMD_METALS; HEALTH, MEDIA, SECURITY none. The loader checks `Σ L² ≤ 1` (05).

| assetId | Ticker | Company | Bloc | Sector | HQ | cap0 ($B) | Size | px0 | 09 type | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| ast_EQ_HALC | HALC | Halcyon Systems | FDL | TECH | Port Avalon | 720.0 | L | 346 | saas_company | tone-setter: cloud software, high P/E, rate-sensitive |
| ast_EQ_BRLN | BRLN | Brightline Software | FDL | TECH | Lakemont | 432.0 | L | 372 | saas_company |  |
| ast_EQ_CPLF | CPLF | Copperleaf Cloud | FDL | TECH | Lakemont | 272.0 | M | 127 | cloud_provider | NPC cloud provider (11) |
| ast_EQ_QRMD | QRMD | Quorum Data | FDL | TECH | Port Avalon | 176.0 | M | 261 | data_broker | NPC data broker parent (11) |
| ast_EQ_NIMB | NIMB | Nimbus Compute | FDL | SEMI | Lakemont | 720.0 | L | 282 | semiconductor_design_house | tone-setter: the GPU-shortage stock; NPC hardware vendor (DX line) |
| ast_EQ_ARCL | ARCL | Arclight Semiconductor | FDL | SEMI | Redmesa | 432.0 | L | 381 | chip_fab | NPC hardware vendor (GX line) |
| ast_EQ_FOXG | FOXG | Foxglove Microsystems | FDL | SEMI | Lakemont | 272.0 | M | 239 | semiconductor_design_house |  |
| ast_EQ_RMSI | RMSI | Redmesa Silicon | FDL | SEMI | Redmesa | 176.0 | M | 392 | data_center | NPC data-center operator |
| ast_EQ_PRCE | PRCE | Prairie Crest Energy | FDL | ENERGY | Redmesa | 400.0 | L | 242 | oil_well |  |
| ast_EQ_GLFS | GLFS | Gulfstar Petroleum | FDL | ENERGY | Port Avalon | 240.0 | M | 93 | refinery |  |
| ast_EQ_SNWL | SNWL | Sunwell Power | FDL | ENERGY | Redmesa | 151.1 | M | 314 | solar_farm |  |
| ast_EQ_MGRD | MGRD | Mesa Grid Utilities | FDL | ENERGY | Redmesa | 97.8 | S | 264 | power_utility | NPC utility of the FDL cities |
| ast_EQ_IRBM | IRBM | Ironbridge Materials | FDL | MATERIALS | Port Avalon | 400.0 | L | 352 | steel_mill |  |
| ast_EQ_CBRM | CBRM | Cobalt Ridge Mining | FDL | MATERIALS | Redmesa | 240.0 | M | 248 | copper_mine |  |
| ast_EQ_LKCH | LKCH | Lakemont Chemical | FDL | MATERIALS | Lakemont | 151.1 | M | 316 | chemicals_plant |  |
| ast_EQ_GRPK | GRPK | Granite Peak Aggregates | FDL | MATERIALS | Redmesa | 97.8 | S | 166 | quarry |  |
| ast_EQ_TALN | TALN | Talon Aerospace | FDL | INDUSTRIALS | Port Avalon | 400.0 | L | 152 | ev_auto_factory | aircraft maker (absorbed as heavy manufacturing) |
| ast_EQ_UNRL | UNRL | Union Rail Systems | FDL | INDUSTRIALS | Lakemont | 240.0 | M | 257 | rail_freight |  |
| ast_EQ_HRLW | HRLW | Harlow Machinery | FDL | INDUSTRIALS | Lakemont | 151.1 | M | 347 | robotics_integrator |  |
| ast_EQ_BAYL | BAYL | Bayline Logistics | FDL | INDUSTRIALS | Port Avalon | 97.8 | S | 30 | trucking_fleet |  |
| ast_EQ_AVNB | AVNB | Avalon National Bank | FDL | FINANCIALS | Port Avalon | 720.0 | L | 53 | bank | FDL SIB; prime broker; primary dealer; TCH member |
| ast_EQ_LKSB | LKSB | Lakeshore Bancorp | FDL | FINANCIALS | Lakemont | 432.0 | L | 264 | bank | FDL commercial bank A; primary dealer; TCH member |
| ast_EQ_ORIG | ORIG | Orion Information Group | FDL | FINANCIALS | Port Avalon | 272.0 | M | 295 | data_broker | parent of Orion Ratings Service |
| ast_EQ_BWAM | BWAM | Brightwater Asset Management | FDL | FINANCIALS | Port Avalon | 176.0 | M | 98 | asset_management_boutique | sponsor of NPC funds |
| ast_EQ_LUMN | LUMN | Lumen Pharma | FDL | HEALTH | Lakemont | 400.0 | L | 85 | biotech_lab | tone-setter: binary trial events |
| ast_EQ_CRWL | CRWL | Carewell Health Systems | FDL | HEALTH | Port Avalon | 240.0 | M | 180 | hospital_network |  |
| ast_EQ_BLFD | BLFD | Bluefield Biotech | FDL | HEALTH | Lakemont | 151.1 | M | 355 | biotech_lab |  |
| ast_EQ_CYPM | CYPM | Cypress Medical Devices | FDL | HEALTH | Redmesa | 97.8 | S | 29 | medical_device_maker |  |
| ast_EQ_PALF | PALF | Pallas Foods | FDL | STAPLES | Port Avalon | 400.0 | L | 139 | supermarket_chain | tone-setter: defensive |
| ast_EQ_HMST | HMST | Homestead Grocers | FDL | STAPLES | Lakemont | 240.0 | M | 25 | supermarket_chain |  |
| ast_EQ_CLSP | CLSP | Clearspring Beverages | FDL | STAPLES | Redmesa | 151.1 | M | 381 | bakery | soft drinks and juices |
| ast_EQ_HRTH | HRTH | Hearthstone Household | FDL | STAPLES | Lakemont | 97.8 | S | 276 | chemicals_plant | household products |
| ast_EQ_FWYM | FWYM | Freeway Motors | FDL | DISCRETIONARY | Lakemont | 400.0 | L | 113 | ev_auto_factory | mass-market cars |
| ast_EQ_MRQR | MRQR | Marquee Resorts | FDL | DISCRETIONARY | Port Avalon | 240.0 | M | 373 | hotel_chain |  |
| ast_EQ_PALR | PALR | Paloma Retail | FDL | DISCRETIONARY | Redmesa | 151.1 | M | 132 | ecommerce_marketplace |  |
| ast_EQ_SMTO | SMTO | Summit Outfitters | FDL | DISCRETIONARY | Lakemont | 97.8 | S | 71 | supermarket_chain | outdoor retail chain |
| ast_EQ_AURH | AURH | Aurelius Holdings | FDL | REAL_ESTATE | Port Avalon | 400.0 | M | 88 | real_estate_developer | tone-setter: leveraged developer; listed developer of FDL |
| ast_EQ_HRBT | HRBT | Harbor Realty Trust | FDL | REAL_ESTATE | Port Avalon | 240.0 | M | 120 | property_management_agency | listed REIT (residential, Port Avalon) |
| ast_EQ_GLOR | GLOR | Glasshill Office REIT | FDL | REAL_ESTATE | Port Avalon | 151.1 | S | 366 | property_management_agency | listed REIT (offices) |
| ast_EQ_MLPR | MLPR | Mesa Logistics Properties | FDL | REAL_ESTATE | Redmesa | 97.8 | S | 108 | warehouse_operator |  |
| ast_EQ_BCNB | BCNB | Beacon Broadcasting | FDL | MEDIA | Port Avalon | 400.0 | M | 122 | news_outlet | owns outlet The Avalon Beacon |
| ast_EQ_STRL | STRL | Starling Studios | FDL | MEDIA | Lakemont | 240.0 | M | 171 | streaming_studio |  |
| ast_EQ_PXFG | PXFG | Pixelforge Games | FDL | MEDIA | Lakemont | 151.1 | S | 104 | game_studio |  |
| ast_EQ_CRDN | CRDN | Cardinal News Group | FDL | MEDIA | Port Avalon | 97.8 | S | 182 | news_outlet | owns outlet The Federal Ledger |
| ast_EQ_SNTL | SNTL | Sentinel Cyber | FDL | SECURITY | Port Avalon | 400.0 | M | 23 | cybersecurity_firm | tone-setter: revenue rises with world hack rate |
| ast_EQ_IRCD | IRCD | Ironclad Defense | FDL | SECURITY | Redmesa | 240.0 | M | 50 | electronics_assembly | defence electronics |
| ast_EQ_WTCH | WTCH | Watchtower Security Services | FDL | SECURITY | Port Avalon | 151.1 | S | 218 | security_guarding_firm |  |
| ast_EQ_PLDN | PLDN | Paladin Identity | FDL | SECURITY | Lakemont | 97.8 | S | 241 | cybersecurity_firm |  |
| ast_EQ_NOVS | NOVS | Novalis Software | EUN | TECH | Meridia | 275.0 | L | 182 | saas_company |  |
| ast_EQ_KLDO | KLDO | Kaleido Systèmes | EUN | TECH | Valcourt | 165.0 | M | 349 | it_consultancy |  |
| ast_EQ_VIRO | VIRO | Vireo Digital | EUN | TECH | Meridia | 103.9 | M | 288 | ecommerce_marketplace |  |
| ast_EQ_LMNW | LMNW | Lumière Networks | EUN | TECH | Valcourt | 67.2 | S | 216 | cloud_provider | NPC cloud provider (11) |
| ast_EQ_SLTR | SLTR | Siltera | EUN | SEMI | Valcourt | 275.0 | L | 219 | chip_fab | NPC hardware vendor (DX flagship line) |
| ast_EQ_OPVC | OPVC | Optivec Photonics | EUN | SEMI | Belmara | 165.0 | M | 193 | semiconductor_design_house |  |
| ast_EQ_VCME | VCME | Valcourt Microelectronics | EUN | SEMI | Valcourt | 103.9 | M | 336 | electronics_assembly |  |
| ast_EQ_QNTL | QNTL | Quanta Lithographie | EUN | SEMI | Valcourt | 67.2 | S | 218 | robotics_integrator | lithography tools |
| ast_EQ_RHNV | RHNV | Rhenova Énergie | EUN | ENERGY | Valcourt | 275.0 | L | 29 | gas_power_plant |  |
| ast_EQ_ADRG | ADRG | Adriana Gas | EUN | ENERGY | Meridia | 165.0 | M | 231 | fuel_distributor |  |
| ast_EQ_SLVN | SLVN | Solvento Renewables | EUN | ENERGY | Meridia | 103.9 | M | 378 | wind_farm |  |
| ast_EQ_EUGR | EUGR | Euran Grid | EUN | ENERGY | Meridia | 67.2 | S | 219 | power_utility | NPC utility of the EUN cities |
| ast_EQ_FRMT | FRMT | Ferromonte | EUN | MATERIALS | Valcourt | 275.0 | L | 102 | steel_mill |  |
| ast_EQ_CLCR | CLCR | Calcara Cement | EUN | MATERIALS | Valcourt | 165.0 | M | 236 | cement_works |  |
| ast_EQ_LCRX | LCRX | Lacroix Chimie | EUN | MATERIALS | Valcourt | 103.9 | M | 245 | chemicals_plant |  |
| ast_EQ_ALPG | ALPG | Alpina Glass | EUN | MATERIALS | Belmara | 67.2 | S | 220 | cement_works | glass and building materials |
| ast_EQ_OSTR | OSTR | Ostrava Steel | EUN | INDUSTRIALS | Valcourt | 495.0 | L | 143 | steel_mill | tone-setter: cyclical, commodity input costs |
| ast_EQ_BRNM | BRNM | Brenner Maschinen | EUN | INDUSTRIALS | Belmara | 297.0 | L | 163 | robotics_integrator |  |
| ast_EQ_AERV | AERV | Aeroval | EUN | INDUSTRIALS | Meridia | 187.0 | M | 229 | ev_auto_factory | aircraft components |
| ast_EQ_DNBR | DNBR | Danubia Rail | EUN | INDUSTRIALS | Valcourt | 121.0 | M | 214 | rail_freight |  |
| ast_EQ_MRDB | MRDB | Meridia Bank | EUN | FINANCIALS | Meridia | 275.0 | L | 362 | bank | tone-setter; EUN SIB; prime broker; primary dealer; TCH member |
| ast_EQ_BVLC | BVLC | Banca Valcourt | EUN | FINANCIALS | Valcourt | 165.0 | M | 28 | bank | EUN commercial bank A; primary dealer; TCH member |
| ast_EQ_BLMP | BLMP | Belmara Privatbank | EUN | FINANCIALS | Belmara | 103.9 | M | 252 | asset_management_boutique | private banking group (owns EUN commercial bank B) |
| ast_EQ_MAGP | MAGP | Meridian Analytics Group | EUN | FINANCIALS | Meridia | 67.2 | S | 25 | data_broker | parent of Meridian Credit Opinion |
| ast_EQ_VTLS | VTLS | Vitalis Pharma | EUN | HEALTH | Meridia | 275.0 | L | 146 | pharma_generic_maker |  |
| ast_EQ_SNVA | SNVA | Sanovia Biotech | EUN | HEALTH | Belmara | 165.0 | M | 365 | biotech_lab |  |
| ast_EQ_CLAR | CLAR | Cliniques Arlen | EUN | HEALTH | Valcourt | 103.9 | M | 362 | clinic |  |
| ast_EQ_ORTH | ORTH | Orthema Devices | EUN | HEALTH | Valcourt | 67.2 | S | 176 | medical_device_maker |  |
| ast_EQ_FTRG | FTRG | Fattoria Group | EUN | STAPLES | Meridia | 495.0 | L | 122 | family_farm | agri-food group |
| ast_EQ_LTRD | LTRD | Lattiera Dairy | EUN | STAPLES | Belmara | 297.0 | L | 376 | dairy |  |
| ast_EQ_CERS | CERS | Maison Cérès | EUN | STAPLES | Valcourt | 187.0 | M | 287 | bakery | industrial bakery |
| ast_EQ_PURL | PURL | Purella Home Care | EUN | STAPLES | Meridia | 121.0 | M | 244 | chemicals_plant | household care |
| ast_EQ_CRVO | CRVO | Corvo Motors | EUN | DISCRETIONARY | Meridia | 495.0 | L | 93 | ev_auto_factory | tone-setter: luxury EVs, meme-prone; brand of lid_corvo_esport |
| ast_EQ_VLRM | VLRM | Velour Maison | EUN | DISCRETIONARY | Valcourt | 297.0 | L | 258 | fashion_house | tone-setter: tracks top-1% wealth; brand of the Velour wardrobes |
| ast_EQ_MRCA | MRCA | Marchetti Automobili | EUN | DISCRETIONARY | Valcourt | 187.0 | M | 329 | ev_auto_factory | brand of the Marchetti cars |
| ast_EQ_VAEL | VAEL | Vael Horlogerie | EUN | DISCRETIONARY | Belmara | 121.0 | M | 55 | watch_manufacture | brand of the Vael watches |
| ast_EQ_IMRL | IMRL | Immobiliare Rialto | EUN | REAL_ESTATE | Meridia | 275.0 | M | 379 | real_estate_developer | listed developer of EUN |
| ast_EQ_LGNE | LGNE | Lagoon Estates REIT | EUN | REAL_ESTATE | Meridia | 165.0 | M | 343 | property_management_agency | listed REIT (residential, Meridia) |
| ast_EQ_BSQP | BSQP | Bourse Square Properties | EUN | REAL_ESTATE | Valcourt | 103.9 | S | 378 | property_management_agency | listed REIT (offices and retail) |
| ast_EQ_CLPK | CLPK | Compact Logistics Parks | EUN | REAL_ESTATE | Valcourt | 67.2 | S | 150 | warehouse_operator |  |
| ast_EQ_ARCM | ARCM | Arcadia Media | EUN | MEDIA | Meridia | 275.0 | M | 360 | news_outlet | owns outlet Il Corriere della Laguna |
| ast_EQ_FOLM | FOLM | Folio Media | EUN | MEDIA | Valcourt | 165.0 | M | 125 | news_outlet | owns outlet Le Quotidien du Compact |
| ast_EQ_SPFM | SPFM | Spectra Films | EUN | MEDIA | Meridia | 103.9 | S | 52 | streaming_studio |  |
| ast_EQ_LUDG | LUDG | Ludica Games | EUN | MEDIA | Belmara | 67.2 | S | 337 | game_studio |  |
| ast_EQ_AEGD | AEGD | Aegide Cyber | EUN | SECURITY | Valcourt | 275.0 | M | 283 | cybersecurity_firm |  |
| ast_EQ_BLWK | BLWK | Bulwark Systems | EUN | SECURITY | Meridia | 165.0 | M | 33 | electronics_assembly | defence systems |
| ast_EQ_GRDS | GRDS | Garde Sécurité | EUN | SECURITY | Valcourt | 103.9 | S | 215 | security_guarding_firm |  |
| ast_EQ_VGLD | VGLD | Vigil Defence | EUN | SECURITY | Belmara | 67.2 | S | 352 | cybersecurity_firm |  |
| ast_EQ_KUMO | KUMO | Kumo Systems | PYN | TECH | Kaiyo City | 540.0 | L | 68 | cloud_provider | NPC cloud provider (11) |
| ast_EQ_HKRI | HKRI | Hikari Software | PYN | TECH | Kaiyo City | 324.0 | L | 147 | saas_company |  |
| ast_EQ_TSDG | TSDG | Tessan Digital | PYN | TECH | Tessan | 204.0 | M | 258 | it_consultancy |  |
| ast_EQ_RNSH | RNSH | Ranshi Commerce | PYN | TECH | Kaiyo City | 132.0 | M | 331 | ecommerce_marketplace |  |
| ast_EQ_KGSM | KGSM | Kaigan Semiconductor | PYN | SEMI | Tessan | 540.0 | L | 198 | chip_fab | NPC hardware vendor (GX40 and DX100 foundry) |
| ast_EQ_TFAB | TFAB | Tessan Fab Works | PYN | SEMI | Tessan | 324.0 | L | 254 | chip_fab |  |
| ast_EQ_SNSM | SNSM | Shinsei Memory | PYN | SEMI | Tessan | 204.0 | M | 161 | electronics_assembly |  |
| ast_EQ_MIRD | MIRD | Mirai Devices | PYN | SEMI | Kaiyo City | 132.0 | M | 89 | semiconductor_design_house |  |
| ast_EQ_KRNE | KRNE | Kairo Energy | PYN | ENERGY | Kaiyo City | 300.0 | L | 144 | refinery |  |
| ast_EQ_DYGP | DYGP | Daiyo Gas and Power | PYN | ENERGY | Kaiyo City | 180.0 | M | 151 | gas_power_plant |  |
| ast_EQ_TYSL | TYSL | Taiyo Solar | PYN | ENERGY | Tessan | 113.3 | M | 335 | solar_farm |  |
| ast_EQ_LGNP | LGNP | League Nuclear Power | PYN | ENERGY | Mirako | 73.3 | S | 265 | power_utility | NPC utility of the PYN cities |
| ast_EQ_KRGN | KRGN | Kurogane Steel | PYN | MATERIALS | Tessan | 300.0 | L | 55 | steel_mill |  |
| ast_EQ_HSCH | HSCH | Hoshi Chemical | PYN | MATERIALS | Tessan | 180.0 | M | 215 | chemicals_plant |  |
| ast_EQ_TSRM | TSRM | Tessan Rare Metals | PYN | MATERIALS | Tessan | 113.3 | M | 259 | rare_earth_mine | rare-earth refiner |
| ast_EQ_PCPP | PCPP | Pacific Paper and Pulp | PYN | MATERIALS | Mirako | 73.3 | S | 59 | timber_estate |  |
| ast_EQ_ATLF | ATLF | Atlas Freight | PYN | INDUSTRIALS | Kaiyo City | 540.0 | L | 294 | shipping_line | tone-setter: tracks trade volume and fuel |
| ast_EQ_RYJN | RYJN | Ryujin Heavy Industries | PYN | INDUSTRIALS | Tessan | 324.0 | L | 349 | ev_auto_factory | strategic acquirer |
| ast_EQ_KYSB | KYSB | Kaiyo Shipbuilding | PYN | INDUSTRIALS | Kaiyo City | 204.0 | M | 198 | yacht_builder | commercial shipbuilder |
| ast_EQ_HYTR | HYTR | Hayate Robotics | PYN | INDUSTRIALS | Kaiyo City | 132.0 | M | 121 | robotics_integrator |  |
| ast_EQ_KYPB | KYPB | Kaiyo Pacific Bank | PYN | FINANCIALS | Kaiyo City | 300.0 | L | 303 | bank | PYN SIB; prime broker; primary dealer; TCH member |
| ast_EQ_TSCB | TSCB | Tessan Commercial Bank | PYN | FINANCIALS | Tessan | 180.0 | M | 71 | bank | PYN commercial bank A; primary dealer; TCH member |
| ast_EQ_DCHS | DCHS | Daichi Securities | PYN | FINANCIALS | Kaiyo City | 113.3 | M | 137 | brokerage |  |
| ast_EQ_KYMF | KYMF | Kaiyo Marine and Fire | PYN | FINANCIALS | Kaiyo City | 73.3 | S | 397 | insurance_company | PYN primary NPC insurer (08) |
| ast_EQ_SHRO | SHRO | Shiro Pharmaceutical | PYN | HEALTH | Kaiyo City | 300.0 | L | 389 | pharma_generic_maker |  |
| ast_EQ_MRKB | MRKB | Mirako Biologics | PYN | HEALTH | Mirako | 180.0 | M | 124 | biotech_lab |  |
| ast_EQ_KNKO | KNKO | Kenko Medical | PYN | HEALTH | Kaiyo City | 113.3 | M | 256 | hospital_network |  |
| ast_EQ_AOBA | AOBA | Aoba Diagnostics | PYN | HEALTH | Tessan | 73.3 | S | 398 | diagnostics_lab |  |
| ast_EQ_HNMF | HNMF | Hanami Foods | PYN | STAPLES | Kaiyo City | 300.0 | L | 128 | supermarket_chain |  |
| ast_EQ_KOME | KOME | Kome Agrigroup | PYN | STAPLES | Mirako | 180.0 | M | 338 | family_farm |  |
| ast_EQ_SRYB | SRYB | Seiryo Beverages | PYN | STAPLES | Mirako | 113.3 | M | 84 | bubble_tea_stall | tea and drinks |
| ast_EQ_TSRU | TSRU | Tsuru Home Products | PYN | STAPLES | Tessan | 73.3 | S | 223 | chemicals_plant |  |
| ast_EQ_KAZE | KAZE | Kaze Motors | PYN | DISCRETIONARY | Tessan | 300.0 | L | 248 | ev_auto_factory |  |
| ast_EQ_HSZE | HSZE | Hoshizora Electronics | PYN | DISCRETIONARY | Kaiyo City | 180.0 | M | 374 | electronics_assembly | consumer electronics |
| ast_EQ_NWRT | NWRT | Neon Ward Retail | PYN | DISCRETIONARY | Kaiyo City | 113.3 | M | 273 | convenience_store | convenience chain |
| ast_EQ_RYKN | RYKN | Ryokan Hospitality Group | PYN | DISCRETIONARY | Mirako | 73.3 | S | 197 | hotel_chain |  |
| ast_EQ_KYLD | KYLD | Kaiyo Land | PYN | REAL_ESTATE | Kaiyo City | 300.0 | M | 37 | real_estate_developer | listed developer of PYN |
| ast_EQ_LCRT | LCRT | Loop Central REIT | PYN | REAL_ESTATE | Kaiyo City | 180.0 | M | 379 | property_management_agency | listed REIT (offices) |
| ast_EQ_RCGP | RCGP | Reclaim Grid Properties | PYN | REAL_ESTATE | Kaiyo City | 113.3 | S | 399 | property_management_agency | listed REIT (residential) |
| ast_EQ_TSIP | TSIP | Tessan Industrial Parks | PYN | REAL_ESTATE | Tessan | 73.3 | S | 156 | warehouse_operator |  |
| ast_EQ_HKRB | HKRB | Hikaru Broadcasting | PYN | MEDIA | Kaiyo City | 300.0 | M | 349 | news_outlet | owns outlet Kaiyo Shimbun |
| ast_EQ_ORGM | ORGM | Origami Studios | PYN | MEDIA | Kaiyo City | 180.0 | M | 225 | streaming_studio |  |
| ast_EQ_PXRN | PXRN | Pixel Ronin Games | PYN | MEDIA | Tessan | 113.3 | S | 377 | game_studio |  |
| ast_EQ_SHBN | SHBN | Shinbun Media Group | PYN | MEDIA | Tessan | 73.3 | S | 249 | news_outlet | owns outlet The League Herald |
| ast_EQ_KGMS | KGMS | Kagemusha Cyber | PYN | SECURITY | Kaiyo City | 300.0 | M | 319 | cybersecurity_firm |  |
| ast_EQ_SHPC | SHPC | Shield Pacific | PYN | SECURITY | Tessan | 180.0 | M | 188 | security_guarding_firm |  |
| ast_EQ_TTSD | TTSD | Tetsu Defense | PYN | SECURITY | Tessan | 113.3 | S | 136 | electronics_assembly | defence electronics |
| ast_EQ_KTSN | KTSN | Kitsune Security Labs | PYN | SECURITY | Kaiyo City | 73.3 | S | 31 | cybersecurity_firm |  |
| ast_EQ_FJSF | FJSF | Fjordsoft | NKR | TECH | Nordhaven City | 87.5 | L | 35 | saas_company |  |
| ast_EQ_NRLY | NRLY | Nordlys Digital | NKR | TECH | Nordhaven City | 52.5 | M | 268 | it_consultancy |  |
| ast_EQ_SKLD | SKLD | Skald Systems | NKR | TECH | Vintra | 33.1 | M | 174 | saas_company |  |
| ast_EQ_PLRS | PLRS | Polaris Payments | NKR | TECH | Nordhaven City | 21.4 | S | 237 | payments_processor |  |
| ast_EQ_NRSK | NRSK | Norrsken Compute | NKR | SEMI | Vintra | 87.5 | L | 187 | data_center | cool-climate data centres; NPC colocation provider |
| ast_EQ_ISBR | ISBR | Isbre Silicon | NKR | SEMI | Vintra | 52.5 | M | 97 | semiconductor_design_house |  |
| ast_EQ_KVNT | KVNT | Kvant Photonics | NKR | SEMI | Nordhaven City | 33.1 | M | 359 | semiconductor_design_house |  |
| ast_EQ_FRSL | FRSL | Frost Logic | NKR | SEMI | Vintra | 21.4 | S | 20 | electronics_assembly |  |
| ast_EQ_VRDN | VRDN | Verdane Energy | NKR | ENERGY | Skarvik | 157.5 | L | 173 | oil_well | tone-setter: oil and gas, tracks crude |
| ast_EQ_SKOF | SKOF | Skarvik Offshore | NKR | ENERGY | Skarvik | 94.5 | L | 187 | oil_well |  |
| ast_EQ_NRHY | NRHY | Nordhav Hydro | NKR | ENERGY | Vintra | 59.5 | M | 85 | hydro_plant | NPC utility of the NKR cities |
| ast_EQ_BRWD | BRWD | Boreal Wind | NKR | ENERGY | Skarvik | 38.5 | M | 120 | wind_farm |  |
| ast_EQ_MALM | MALM | Malm Mining | NKR | MATERIALS | Vintra | 157.5 | L | 194 | copper_mine |  |
| ast_EQ_JRNV | JRNV | Jernvik Steel | NKR | MATERIALS | Skarvik | 94.5 | L | 220 | steel_mill |  |
| ast_EQ_TNDR | TNDR | Tundra Timber | NKR | MATERIALS | Vintra | 59.5 | M | 207 | timber_estate |  |
| ast_EQ_SLTA | SLTA | Saltsjö Aluminium | NKR | MATERIALS | Nordhaven City | 38.5 | M | 45 | steel_mill | aluminium smelter |
| ast_EQ_NRDL | NRDL | Nordline Shipping | NKR | INDUSTRIALS | Nordhaven City | 87.5 | L | 160 | shipping_line | Halvorsen-linked (16 example) |
| ast_EQ_VARG | VARG | Varg Marine Engineering | NKR | INDUSTRIALS | Skarvik | 52.5 | M | 133 | port_maintenance_firm |  |
| ast_EQ_OSRL | OSRL | Östra Rail | NKR | INDUSTRIALS | Nordhaven City | 33.1 | M | 248 | rail_freight |  |
| ast_EQ_HMMR | HMMR | Hammar Industries | NKR | INDUSTRIALS | Vintra | 21.4 | S | 311 | robotics_integrator |  |
| ast_EQ_NRHB | NRHB | Nordhaven Bank | NKR | FINANCIALS | Nordhaven City | 157.5 | L | 168 | bank | NKR SIB; primary dealer; TCH member |
| ast_EQ_SKSB | SKSB | Skarvik Sparebank | NKR | FINANCIALS | Skarvik | 94.5 | L | 290 | bank | NKR commercial bank A; primary dealer; TCH member |
| ast_EQ_HLVR | HLVR | Halvorsen Re | NKR | FINANCIALS | Nordhaven City | 59.5 | M | 48 | insurance_company | global reinsurer (08); Halvorsen dynasty |
| ast_EQ_FJCP | FJCP | Fjord Capital Partners | NKR | FINANCIALS | Nordhaven City | 38.5 | M | 294 | asset_management_boutique |  |
| ast_EQ_LVKR | LVKR | Livkraft Pharma | NKR | HEALTH | Nordhaven City | 87.5 | L | 342 | pharma_generic_maker |  |
| ast_EQ_NRBI | NRBI | Norrbio | NKR | HEALTH | Vintra | 52.5 | M | 220 | biotech_lab |  |
| ast_EQ_HLSN | HLSN | Helse Nordic | NKR | HEALTH | Nordhaven City | 33.1 | M | 36 | hospital_network |  |
| ast_EQ_KLDM | KLDM | Kalde Medtech | NKR | HEALTH | Nordhaven City | 21.4 | S | 396 | medical_device_maker |  |
| ast_EQ_HVBK | HVBK | Havbruk Seafood | NKR | STAPLES | Skarvik | 87.5 | L | 213 | fishery |  |
| ast_EQ_NRDM | NRDM | Nordmark Dairy | NKR | STAPLES | Vintra | 52.5 | M | 60 | dairy |  |
| ast_EQ_KJKS | KJKS | Kjeks and Co | NKR | STAPLES | Nordhaven City | 33.1 | M | 348 | bakery |  |
| ast_EQ_RNHT | RNHT | Renhet Household | NKR | STAPLES | Nordhaven City | 21.4 | S | 325 | chemicals_plant |  |
| ast_EQ_STRA | STRA | Stratos Aviation | NKR | DISCRETIONARY | Nordhaven City | 87.5 | L | 343 | ev_auto_factory | brand of the Stratos jets |
| ast_EQ_AURL | AURL | Aurel Marine | NKR | DISCRETIONARY | Skarvik | 52.5 | M | 317 | yacht_builder | brand of the Aurel yachts |
| ast_EQ_LYSD | LYSD | Lys Design House | NKR | DISCRETIONARY | Nordhaven City | 33.1 | M | 391 | design_studio | furniture and design |
| ast_EQ_FJSP | FJSP | Fjellsport Outdoor | NKR | DISCRETIONARY | Vintra | 21.4 | S | 101 | supermarket_chain | outdoor retail |
| ast_EQ_BRCH | BRCH | Birch Hills Development | NKR | REAL_ESTATE | Nordhaven City | 87.5 | M | 30 | real_estate_developer | listed developer of NKR |
| ast_EQ_OPQP | OPQP | Opera Quay Properties | NKR | REAL_ESTATE | Nordhaven City | 52.5 | M | 274 | property_management_agency | listed REIT (offices) |
| ast_EQ_NRRT | NRRT | Nordic Residential REIT | NKR | REAL_ESTATE | Nordhaven City | 33.1 | S | 311 | property_management_agency | listed REIT (residential) |
| ast_EQ_FJLE | FJLE | Fjord Logistics Estates | NKR | REAL_ESTATE | Skarvik | 21.4 | S | 308 | warehouse_operator |  |
| ast_EQ_SAGA | SAGA | Saga Broadcasting | NKR | MEDIA | Nordhaven City | 87.5 | M | 42 | news_outlet | owns outlet Nordhaven Morgenblad |
| ast_EQ_RUNE | RUNE | Runestone Games | NKR | MEDIA | Vintra | 52.5 | M | 52 | game_studio |  |
| ast_EQ_MRGN | MRGN | Morgen Media Group | NKR | MEDIA | Nordhaven City | 33.1 | S | 152 | news_outlet | owns outlet The Northern Courier |
| ast_EQ_FJFM | FJFM | Fjord Films | NKR | MEDIA | Nordhaven City | 21.4 | S | 259 | streaming_studio |  |
| ast_EQ_VKMS | VKMS | Vaktmester Cyber | NKR | SECURITY | Nordhaven City | 87.5 | M | 121 | cybersecurity_firm |  |
| ast_EQ_SKJD | SKJD | Skjold Defence | NKR | SECURITY | Skarvik | 52.5 | M | 258 | electronics_assembly | defence systems |
| ast_EQ_ISVK | ISVK | Isvakt Security | NKR | SECURITY | Vintra | 33.1 | S | 59 | security_guarding_firm |  |
| ast_EQ_RAVN | RAVN | Ravn Intelligence | NKR | SECURITY | Nordhaven City | 21.4 | S | 22 | private_intelligence_firm |  |
| ast_EQ_SOLS | SOLS | Solaria Software | SRL | TECH | Sundara Coast | 187.5 | L | 236 | saas_company |  |
| ast_EQ_PMPD | PMPD | Pampa Digital | SRL | TECH | Alta Verde | 112.5 | M | 327 | it_consultancy |  |
| ast_EQ_VELA | VELA | Vela Pagos | SRL | TECH | Sundara Coast | 70.8 | M | 59 | payments_processor |  |
| ast_EQ_CMBR | CMBR | Cumbre Cloud | SRL | TECH | Alta Verde | 45.8 | S | 399 | cloud_provider | NPC cloud provider (11) |
| ast_EQ_CBEL | CBEL | Cobreval Electronics | SRL | SEMI | Cobreval | 187.5 | L | 163 | electronics_assembly |  |
| ast_EQ_TRSI | TRSI | Tierra Silicon | SRL | SEMI | Cobreval | 112.5 | M | 256 | chip_fab |  |
| ast_EQ_LMBR | LMBR | Lumbre Semicon | SRL | SEMI | Alta Verde | 70.8 | M | 143 | semiconductor_design_house |  |
| ast_EQ_RAYO | RAYO | Rayo Devices | SRL | SEMI | Sundara Coast | 45.8 | S | 297 | electronics_assembly |  |
| ast_EQ_PTSR | PTSR | Petrosur | SRL | ENERGY | Cobreval | 337.5 | L | 365 | oil_well |  |
| ast_EQ_SDSL | SDSL | Sundara Solar | SRL | ENERGY | Sundara Coast | 202.5 | L | 188 | solar_farm |  |
| ast_EQ_GSDS | GSDS | Gasoducto del Sur | SRL | ENERGY | Cobreval | 127.5 | M | 183 | fuel_distributor |  |
| ast_EQ_HDAL | HDAL | Hidroalta | SRL | ENERGY | Alta Verde | 82.5 | M | 31 | hydro_plant | NPC utility of the SRL cities |
| ast_EQ_CBMY | CBMY | Cobre Mayor | SRL | MATERIALS | Cobreval | 337.5 | L | 40 | copper_mine |  |
| ast_EQ_LTVD | LTVD | Litio Verde | SRL | MATERIALS | Alta Verde | 202.5 | L | 108 | lithium_mine |  |
| ast_EQ_MNMR | MNMR | Minera Mirador | SRL | MATERIALS | Cobreval | 127.5 | M | 271 | gold_mine |  |
| ast_EQ_CMAL | CMAL | Cementos Alta | SRL | MATERIALS | Alta Verde | 82.5 | M | 265 | cement_works |  |
| ast_EQ_PTSL | PTSL | Puerto Sur Logistics | SRL | INDUSTRIALS | Cobreval | 187.5 | L | 391 | port_maintenance_firm |  |
| ast_EQ_FCAU | FCAU | Ferrocarril Austral | SRL | INDUSTRIALS | Alta Verde | 112.5 | M | 176 | rail_freight |  |
| ast_EQ_CNDR | CNDR | Máquinas Cóndor | SRL | INDUSTRIALS | Cobreval | 70.8 | M | 29 | industrial_equipment_repair |  |
| ast_EQ_ASTC | ASTC | Astillero Coalición | SRL | INDUSTRIALS | Sundara Coast | 45.8 | S | 109 | yacht_builder | commercial shipyard |
| ast_EQ_BSDR | BSDR | Banco Sundara | SRL | FINANCIALS | Sundara Coast | 187.5 | L | 217 | bank | SRL SIB; primary dealer; TCH member |
| ast_EQ_BAVD | BAVD | Banco Alta Verde | SRL | FINANCIALS | Alta Verde | 112.5 | M | 209 | bank | SRL commercial bank A; primary dealer; TCH member |
| ast_EQ_SLNS | SLNS | Solano Seguros | SRL | FINANCIALS | Sundara Coast | 70.8 | M | 299 | insurance_company | SRL primary NPC insurer (08) |
| ast_EQ_CRAU | CRAU | Crédito Austral | SRL | FINANCIALS | Alta Verde | 45.8 | S | 372 | brokerage | consumer finance and brokerage |
| ast_EQ_FRMS | FRMS | Farmasur | SRL | HEALTH | Alta Verde | 187.5 | L | 395 | pharma_generic_maker |  |
| ast_EQ_CLVD | CLVD | Clínicas Vida | SRL | HEALTH | Sundara Coast | 112.5 | M | 376 | clinic |  |
| ast_EQ_BCMP | BCMP | Biocampo | SRL | HEALTH | Alta Verde | 70.8 | M | 107 | biotech_lab |  |
| ast_EQ_SLAN | SLAN | Salud Andina | SRL | HEALTH | Cobreval | 45.8 | S | 326 | hospital_network |  |
| ast_EQ_CFTU | CFTU | Cafetales Unidos | SRL | STAPLES | Alta Verde | 187.5 | L | 361 | coffee_cocoa_plantation |  |
| ast_EQ_GRDV | GRDV | Granos del Valle | SRL | STAPLES | Alta Verde | 112.5 | M | 212 | family_farm |  |
| ast_EQ_CCSR | CCSR | Cacao Serrano | SRL | STAPLES | Alta Verde | 70.8 | M | 44 | coffee_cocoa_plantation |  |
| ast_EQ_HGLM | HGLM | Hogar Limpio | SRL | STAPLES | Sundara Coast | 45.8 | S | 199 | chemicals_plant |  |
| ast_EQ_PLYA | PLYA | Playa Resorts | SRL | DISCRETIONARY | Sundara Coast | 187.5 | M | 291 | hotel_chain |  |
| ast_EQ_MDSD | MDSD | Moda Sundara | SRL | DISCRETIONARY | Sundara Coast | 112.5 | M | 31 | fashion_house |  |
| ast_EQ_CEIB | CEIB | Autos Ceibo | SRL | DISCRETIONARY | Cobreval | 70.8 | S | 308 | car_dealership | car importer and dealer group |
| ast_EQ_PASE | PASE | Tiendas Paseo | SRL | DISCRETIONARY | Alta Verde | 45.8 | S | 245 | supermarket_chain | department stores |
| ast_EQ_PLMR | PLMR | Constructora Palmar | SRL | REAL_ESTATE | Sundara Coast | 337.5 | L | 270 | real_estate_developer | listed developer of SRL |
| ast_EQ_MQRT | MQRT | Marina Quarter REIT | SRL | REAL_ESTATE | Sundara Coast | 202.5 | L | 359 | property_management_agency | listed REIT (residential and marina) |
| ast_EQ_PZMP | PZMP | Plaza Mayor Properties | SRL | REAL_ESTATE | Cobreval | 127.5 | M | 238 | property_management_agency | listed REIT (offices and retail) |
| ast_EQ_CSTD | CSTD | Costa Desarrollos | SRL | REAL_ESTATE | Sundara Coast | 82.5 | M | 360 | construction_company |  |
| ast_EQ_CNSL | CNSL | Canal Sol | SRL | MEDIA | Sundara Coast | 187.5 | M | 175 | news_outlet | owns outlet Diario del Sol |
| ast_EQ_NOVL | NOVL | Novela Studios | SRL | MEDIA | Sundara Coast | 112.5 | M | 334 | streaming_studio |  |
| ast_EQ_DIAU | DIAU | Diario Austral Group | SRL | MEDIA | Alta Verde | 70.8 | S | 391 | news_outlet | owns outlet El Austral |
| ast_EQ_FSTG | FSTG | Fiesta Games | SRL | MEDIA | Alta Verde | 45.8 | S | 315 | game_studio |  |
| ast_EQ_ESCD | ESCD | Escudo Cyber | SRL | SECURITY | Sundara Coast | 187.5 | M | 45 | cybersecurity_firm |  |
| ast_EQ_GDCO | GDCO | Guardia Coalición | SRL | SECURITY | Alta Verde | 112.5 | M | 167 | security_guarding_firm |  |
| ast_EQ_CTDF | CTDF | Centinela Defensa | SRL | SECURITY | Cobreval | 70.8 | S | 312 | electronics_assembly | defence systems |
| ast_EQ_SMBR | SMBR | Sombra Labs | SRL | SECURITY | Sundara Coast | 45.8 | S | 207 | cybersecurity_firm |  |

Tone-setting names of old 01 §3.1 are all present (Halcyon Systems, Verdane Energy, Ostrava Steel, Lumen Pharma, Meridia Bank, Corvo Motors, Pallas Foods, Aurelius Holdings, Nimbus Compute, Sentinel Cyber, Atlas Freight, Velour Maison). 01 called Ostrava Steel an industrial: it stays in INDUSTRIALS. 01 placed Verdane in Energy without a bloc; it is the NKR energy leader.

**Role summary.** Listed REITs (2 per bloc, 10 §3.16): HRBT, GLOR, LGNE, BSQP, LCRT, RCGP, OPQP, NRRT, MQRT, PZMP. Listed developers (one per bloc): AURH, IMRL, KYLD, BRCH, PLMR. Listed rating-agency parents: ORIG (Orion), MAGP (Meridian). Listed insurers: KYMF, SLNS, HLVR. NPC hardware vendors (11 §3.3.1, four): Nimbus Compute (DX100, DX300, DX900POD), Arclight Semiconductor (GX10, GX40), Kaigan Semiconductor (GX40, DX100 second source), Siltera (DX300 second source). NPC cloud providers that are listed: CPLF, LMNW, KUMO, CMBR (the others are private, §7.3). Outlet owners: BCNB, CRDN, ARCM, FOLM, HKRB, SHBN, SAGA, MRGN, CNSL, DIAU (10 of the 15 outlets; the other 5 are owned by dynasties or are public broadcasters, §10.7).

#### §4.1.1 Listed-company generator for new cities (generator `eq_new`)

06 §3.1.2: each new city adds 4 NPC listed companies to its bloc. Stream `rng('content/eq_new/<cityId>', worldSeed)`.

1. Sectors: draw 4 sectors without replacement with weights = the bloc's sector weights (tilts 1.8) × the city's constraint affinity (mining constraints ×2 MATERIALS, coastal ×1.5 INDUSTRIALS, resort constraints ×1.5 DISCRETIONARY, rainforest/agri ×2 STAPLES, hydro/wind ×2 ENERGY).
2. Name: pattern by weight: 0.35 `<City root> <sector noun>`; 0.30 `<family> <sector noun>` (§0.4 pool); 0.20 `<invented root> <sector noun>`; 0.15 bloc-native form (EUN `<root> <Fr/It/De noun>`, SRL `<noun> <root>` e.g. "Minera Selvana", PYN `<root> <-tech | Kogyo-style noun>`, NKR `<root>-<noun>` compound). Sector nouns: TECH {Software, Systems, Digital, Networks}; SEMI {Semiconductor, Microsystems, Compute, Devices}; ENERGY {Energy, Power, Petroleum, Renewables}; MATERIALS {Mining, Metals, Chemical, Materials}; INDUSTRIALS {Industries, Logistics, Machinery, Rail}; FINANCIALS {Bank, Capital, Financial}; HEALTH {Pharma, Health, Biotech, Medical}; STAPLES {Foods, Farms, Beverages, Household}; DISCRETIONARY {Motors, Resorts, Retail, Apparel}; REAL_ESTATE {Properties, Land, Realty}; MEDIA {Media, Studios, Games, Broadcasting}; SECURITY {Security, Defence, Cyber}. Invented roots: 2-syllable from bloc syllable sets (FDL: Bel, Cor, Dex, Mar, Ren, Tal, Ver, Wyn + -an, -ex, -ia, -on, -or; EUN: Al, Bel, Cor, Fer, Lum, Nov, Ser, Val + -a, -ia, -is, -o, -ane; PYN: Ka, Ki, Mi, Ri, Sa, Ta, Yo, Ha + -ko, -ma, -ro, -shi, -to; NKR: Bra, Fro, Hav, Lys, Nor, Sol, Var, Vik + -en, -ia, -um, -or, -und; SRL: Ca, Mar, Pal, Ri, Sal, Te, Va, Zu + -ana, -ero, -illa, -ora, -ura).
3. Ticker: first letters of the name words padded from the following consonants to 4 letters, unique world-wide (collision: replace the last letter by the next unused letter A–Z).
4. cap0 = the median cap of the bloc's S class × U(0.6, 1.4); size class S; 09 type = the sector's default type (TECH saas_company, SEMI semiconductor_design_house, ENERGY solar_farm, MATERIALS copper_mine, INDUSTRIALS robotics_integrator, FINANCIALS brokerage, HEALTH clinic, STAPLES family_farm, DISCRETIONARY hotel_chain, REAL_ESTATE real_estate_developer, MEDIA streaming_studio, SECURITY cybersecurity_firm).

### §4.2 ETFs (30)

Sponsors are the three NPC ETF-sponsor funds of §5.4 (08): **Keel Index Funds** (KIF, FDL), **Compass Shares** (CMP, EUN) and **Tidemark ETFs** (TDM, PYN). Creation unit 50,000 shares (06). Expense ratios in bps per year. `px0` in FDL; the ETF holds its index basket at genesis.

| assetId | Ticker | Name | Tracks (index id, §4.8) | Sponsor | Exp. bps | px0 |
|---|---|---|---|---|---|---|
| ast_ETF_GXH | GXH | Keel GX100 ETF | idx_GX100 | KIF | 5 | 100 |
| ast_ETF_FEDX | FEDX | Keel Federal 30 ETF | idx_FED30 | KIF | 7 | 50 |
| ast_ETF_EURX | EURX | Compass Euran 30 ETF | idx_EUR30 | CMP | 9 | 50 |
| ast_ETF_PACX | PACX | Tidemark Pacific 30 ETF | idx_PAC30 | TDM | 9 | 50 |
| ast_ETF_NORX | NORX | Compass Nordic 30 ETF | idx_NOR30 | CMP | 12 | 40 |
| ast_ETF_SOUX | SOUX | Tidemark Southern 30 ETF | idx_SOU30 | TDM | 15 | 25 |
| ast_ETF_XTEC | XTEC | Keel GX Technology ETF | idx_GXS_TECH | KIF | 15 | 40 |
| ast_ETF_XSMI | XSMI | Compass GX Semiconductors and Compute ETF | idx_GXS_SEMI | CMP | 15 | 40 |
| ast_ETF_XENR | XENR | Tidemark GX Energy ETF | idx_GXS_ENERGY | TDM | 15 | 40 |
| ast_ETF_XMAT | XMAT | Keel GX Materials and Mining ETF | idx_GXS_MATERIALS | KIF | 15 | 40 |
| ast_ETF_XIND | XIND | Compass GX Industrials and Logistics ETF | idx_GXS_INDUSTRIALS | CMP | 15 | 40 |
| ast_ETF_XFIN | XFIN | Tidemark GX Financials ETF | idx_GXS_FINANCIALS | TDM | 15 | 40 |
| ast_ETF_XHLT | XHLT | Keel GX Healthcare and Biotech ETF | idx_GXS_HEALTH | KIF | 15 | 40 |
| ast_ETF_XSTP | XSTP | Compass GX Consumer Staples ETF | idx_GXS_STAPLES | CMP | 15 | 40 |
| ast_ETF_XDSC | XDSC | Tidemark GX Consumer Discretionary and Luxury ETF | idx_GXS_DISCRETIONARY | TDM | 15 | 40 |
| ast_ETF_XRES | XRES | Keel GX Real Estate ETF | idx_GXS_REAL_ESTATE | KIF | 15 | 40 |
| ast_ETF_XMED | XMED | Compass GX Media and Entertainment ETF | idx_GXS_MEDIA | CMP | 15 | 40 |
| ast_ETF_XSEC | XSEC | Tidemark GX Security and Defence ETF | idx_GXS_SECURITY | TDM | 15 | 40 |
| ast_ETF_GDIV | GDIV | Keel GX Dividend 30 ETF | idx_GXDIV30 | KIF | 20 | 40 |
| ast_ETF_GAGG | GAGG | Compass GX Bond Aggregate ETF | idx_GXAGG | CMP | 6 | 100 |
| ast_ETF_GHYB | GHYB | Tidemark GX High Yield ETF | idx_GXHY | TDM | 35 | 50 |
| ast_ETF_FTSY | FTSY | Keel Federal Treasury ETF | idx_TSY_FDL | KIF | 5 | 100 |
| ast_ETF_ETSY | ETSY | Compass Compact Treasury ETF | idx_TSY_EUN | CMP | 7 | 100 |
| ast_ETF_PTSY | PTSY | Tidemark League Treasury ETF | idx_TSY_PYN | TDM | 8 | 100 |
| ast_ETF_NTSY | NTSY | Compass Nordic Treasury ETF | idx_TSY_NKR | CMP | 9 | 100 |
| ast_ETF_STSY | STSY | Tidemark Coalition Treasury ETF | idx_TSY_SRL | TDM | 18 | 50 |
| ast_ETF_GREI | GREI | Keel GX REIT ETF | idx_GXREIT | KIF | 25 | 30 |
| ast_ETF_GCMX | GCMX | Compass CMX Commodity ETF | idx_CMX | CMP | 45 | 30 |
| ast_ETF_GLDT | GLDT | Keel Gold Trust | idx_GOLD_SPOT | KIF | 25 | 190 |
| ast_ETF_CR10 | CR10 | Tidemark CRX10 Crypto ETF | idx_CRX10 | TDM | 75 | 20 |

### §4.3 Government bonds (30)

Ids `ast_GB_<CCY>_<TENOR>_L0` (the launch line of each tenor; later lines get `_L1`, `_L2`… from 04's issuance). Maturity in game days from genesis; coupons fixed (linkers: real coupon on CPI-indexed principal). Coupons follow 04's genesis curve (policy rate plus term premium). **SRL exception**: 04 §3.10.1 gives the Southern Coalition no 30-year and no linker issuance; its two slots are the 1-year bill and the FDL-denominated "SC Global FDL 10Y" syndicated bond, so the count stays 30 (DEFAULT).

| assetId | Issuer | Name | Tenor | Ccy | Maturity (GD) | Coupon % | px0 |
|---|---|---|---|---|---|---|---|
| ast_GB_FDL_B3M_L0 | gov_FDL | Federal 3-Month Bill | B3M | FDL | 91 | 0 (discount) | 99.25 |
| ast_GB_FDL_N2Y_L0 | gov_FDL | Federal 2-Year Note | N2Y | FDL | 728 | 3.10 | 100.00 |
| ast_GB_FDL_N5Y_L0 | gov_FDL | Federal 5-Year Note | N5Y | FDL | 1820 | 3.30 | 100.00 |
| ast_GB_FDL_N10Y_L0 | gov_FDL | Federal 10-Year Note | N10Y | FDL | 3640 | 3.55 | 100.00 |
| ast_GB_FDL_N30Y_L0 | gov_FDL | Federal 30-Year Bond | N30Y | FDL | 10920 | 3.85 | 100.00 |
| ast_GB_FDL_L10Y_L0 | gov_FDL | Federal 10-Year Inflation-Linked Note | L10Y | FDL | 3640 | 1.40 | 100.00 |
| ast_GB_EUN_B3M_L0 | gov_EUN | Compact 3-Month Bill | B3M | EUN | 91 | 0 (discount) | 99.44 |
| ast_GB_EUN_N2Y_L0 | gov_EUN | Compact 2-Year Note | N2Y | EUN | 728 | 2.30 | 100.00 |
| ast_GB_EUN_N5Y_L0 | gov_EUN | Compact 5-Year Note | N5Y | EUN | 1820 | 2.50 | 100.00 |
| ast_GB_EUN_N10Y_L0 | gov_EUN | Compact 10-Year Note | N10Y | EUN | 3640 | 2.80 | 100.00 |
| ast_GB_EUN_N30Y_L0 | gov_EUN | Compact 30-Year Bond | N30Y | EUN | 10920 | 3.10 | 100.00 |
| ast_GB_EUN_L10Y_L0 | gov_EUN | Compact 10-Year Inflation-Linked Note | L10Y | EUN | 3640 | 0.90 | 100.00 |
| ast_GB_PYN_B3M_L0 | gov_PYN | League 3-Month Bill | B3M | PYN | 91 | 0 (discount) | 99.31 |
| ast_GB_PYN_N2Y_L0 | gov_PYN | League 2-Year Note | N2Y | PYN | 728 | 2.85 | 100.00 |
| ast_GB_PYN_N5Y_L0 | gov_PYN | League 5-Year Note | N5Y | PYN | 1820 | 3.05 | 100.00 |
| ast_GB_PYN_N10Y_L0 | gov_PYN | League 10-Year Note | N10Y | PYN | 3640 | 3.30 | 100.00 |
| ast_GB_PYN_N30Y_L0 | gov_PYN | League 30-Year Bond | N30Y | PYN | 10920 | 3.60 | 100.00 |
| ast_GB_PYN_L10Y_L0 | gov_PYN | League 10-Year Inflation-Linked Note | L10Y | PYN | 3640 | 1.00 | 100.00 |
| ast_GB_NKR_B3M_L0 | gov_NKR | Nordic 3-Month Bill | B3M | NKR | 91 | 0 (discount) | 99.38 |
| ast_GB_NKR_N2Y_L0 | gov_NKR | Nordic 2-Year Note | N2Y | NKR | 728 | 2.55 | 100.00 |
| ast_GB_NKR_N5Y_L0 | gov_NKR | Nordic 5-Year Note | N5Y | NKR | 1820 | 2.70 | 100.00 |
| ast_GB_NKR_N10Y_L0 | gov_NKR | Nordic 10-Year Note | N10Y | NKR | 3640 | 2.95 | 100.00 |
| ast_GB_NKR_N30Y_L0 | gov_NKR | Nordic 30-Year Bond | N30Y | NKR | 10920 | 3.20 | 100.00 |
| ast_GB_NKR_L10Y_L0 | gov_NKR | Nordic 10-Year Inflation-Linked Note | L10Y | NKR | 3640 | 0.95 | 100.00 |
| ast_GB_SRL_B3M_L0 | gov_SRL | Coalition 3-Month Bill | B3M | SRL | 91 | 0 (discount) | 97.70 |
| ast_GB_SRL_B1Y_L0 | gov_SRL | Coalition 1-Year Bill | B1Y | SRL | 364 | 0 (discount) | 91.20 |
| ast_GB_SRL_N2Y_L0 | gov_SRL | Coalition 2-Year Note | N2Y | SRL | 728 | 9.25 | 100.00 |
| ast_GB_SRL_N5Y_L0 | gov_SRL | Coalition 5-Year Note | N5Y | SRL | 1820 | 9.00 | 100.00 |
| ast_GB_SRL_N10Y_L0 | gov_SRL | Coalition 10-Year Note | N10Y | SRL | 3640 | 8.90 | 100.00 |
| ast_GB_SRL_G10Y_L0 | gov_SRL | Coalition SC Global FDL 10-Year Bond | G10Y | FDL | 3640 | 6.40 | 100.00 |

### §4.4 Corporate bonds (50)

One benchmark bond per issuer: the 50 most leveraged large issuers, 10 per bloc, including the senior bonds of the 10 NPC banks that are listed (SIB and commercial bank A of each bloc). Id `ast_CB_<TICKER>_<tenor>`. Initial rating from 08's agencies at genesis (the median of the three; shown here as the authored starting point, which 08 recomputes on the first review). Coupon = 04 curve at tenor + rating spread (AA 0.9, A 1.4, BBB 2.5, BB 5.0, B 8.0 %) rounded to 0.125.

| assetId | Issuer (ticker) | Bloc | Tenor | Maturity (GD) | Rating0 | Coupon % | Callable |
|---|---|---|---|---|---|---|---|
| ast_CB_AVNB_10Y | AVNB | FDL | 10Y | 3640 | A | 5.000 | no |
| ast_CB_LKSB_5Y | LKSB | FDL | 5Y | 1820 | A | 4.750 | no |
| ast_CB_AURH_10Y | AURH | FDL | 10Y | 3640 | BB | 8.500 | yes (from year 5) |
| ast_CB_GLFS_5Y | GLFS | FDL | 5Y | 1820 | BBB | 5.750 | no |
| ast_CB_PRCE_10Y | PRCE | FDL | 10Y | 3640 | BB | 8.500 | yes (from year 5) |
| ast_CB_IRBM_5Y | IRBM | FDL | 5Y | 1820 | BBB | 5.750 | no |
| ast_CB_TALN_10Y | TALN | FDL | 10Y | 3640 | BBB | 6.000 | no |
| ast_CB_MRQR_5Y | MRQR | FDL | 5Y | 1820 | BB | 8.250 | no |
| ast_CB_FWYM_10Y | FWYM | FDL | 10Y | 3640 | BB | 8.500 | yes (from year 5) |
| ast_CB_MGRD_5Y | MGRD | FDL | 5Y | 1820 | A | 4.750 | no |
| ast_CB_MRDB_10Y | MRDB | EUN | 10Y | 3640 | A | 4.250 | no |
| ast_CB_BVLC_5Y | BVLC | EUN | 5Y | 1820 | BBB | 5.000 | no |
| ast_CB_IMRL_10Y | IMRL | EUN | 10Y | 3640 | BB | 7.750 | yes (from year 5) |
| ast_CB_OSTR_5Y | OSTR | EUN | 5Y | 1820 | BB | 7.500 | no |
| ast_CB_FRMT_10Y | FRMT | EUN | 10Y | 3640 | BBB | 5.250 | no |
| ast_CB_CLCR_5Y | CLCR | EUN | 5Y | 1820 | BBB | 5.000 | no |
| ast_CB_RHNV_10Y | RHNV | EUN | 10Y | 3640 | BBB | 5.250 | no |
| ast_CB_CRVO_5Y | CRVO | EUN | 5Y | 1820 | BB | 7.500 | no |
| ast_CB_EUGR_10Y | EUGR | EUN | 10Y | 3640 | A | 4.250 | no |
| ast_CB_AERV_5Y | AERV | EUN | 5Y | 1820 | BBB | 5.000 | no |
| ast_CB_KYPB_10Y | KYPB | PYN | 10Y | 3640 | A | 4.750 | no |
| ast_CB_TSCB_5Y | TSCB | PYN | 5Y | 1820 | BBB | 5.500 | no |
| ast_CB_KYLD_10Y | KYLD | PYN | 10Y | 3640 | BBB | 5.750 | no |
| ast_CB_RYJN_5Y | RYJN | PYN | 5Y | 1820 | BBB | 5.500 | no |
| ast_CB_KRGN_10Y | KRGN | PYN | 10Y | 3640 | BB | 8.250 | yes (from year 5) |
| ast_CB_KRNE_5Y | KRNE | PYN | 5Y | 1820 | BBB | 5.500 | no |
| ast_CB_KYSB_10Y | KYSB | PYN | 10Y | 3640 | BB | 8.250 | yes (from year 5) |
| ast_CB_KAZE_5Y | KAZE | PYN | 5Y | 1820 | BB | 8.000 | no |
| ast_CB_ATLF_10Y | ATLF | PYN | 10Y | 3640 | BBB | 5.750 | no |
| ast_CB_DYGP_5Y | DYGP | PYN | 5Y | 1820 | A | 4.500 | no |
| ast_CB_NRHB_10Y | NRHB | NKR | 10Y | 3640 | AA | 3.875 | no |
| ast_CB_SKSB_5Y | SKSB | NKR | 5Y | 1820 | A | 4.125 | no |
| ast_CB_VRDN_10Y | VRDN | NKR | 10Y | 3640 | BBB | 5.500 | no |
| ast_CB_SKOF_5Y | SKOF | NKR | 5Y | 1820 | BB | 7.750 | no |
| ast_CB_NRDL_10Y | NRDL | NKR | 10Y | 3640 | BB | 8.000 | yes (from year 5) |
| ast_CB_JRNV_5Y | JRNV | NKR | 5Y | 1820 | BBB | 5.250 | no |
| ast_CB_MALM_10Y | MALM | NKR | 10Y | 3640 | BBB | 5.500 | no |
| ast_CB_BRCH_5Y | BRCH | NKR | 5Y | 1820 | BB | 7.750 | no |
| ast_CB_NRHY_10Y | NRHY | NKR | 10Y | 3640 | AA | 3.875 | no |
| ast_CB_HLVR_5Y | HLVR | NKR | 5Y | 1820 | A | 4.125 | no |
| ast_CB_BSDR_10Y | BSDR | SRL | 10Y | 3640 | BBB | 10.375 | no |
| ast_CB_BAVD_5Y | BAVD | SRL | 5Y | 1820 | BB | 12.000 | no |
| ast_CB_PTSR_10Y | PTSR | SRL | 10Y | 3640 | BB | 11.875 | yes (from year 5) |
| ast_CB_CBMY_5Y | CBMY | SRL | 5Y | 1820 | BB | 12.000 | no |
| ast_CB_LTVD_10Y | LTVD | SRL | 10Y | 3640 | B | 13.750 | yes (from year 5) |
| ast_CB_PLMR_5Y | PLMR | SRL | 5Y | 1820 | B | 13.750 | no |
| ast_CB_PLYA_10Y | PLYA | SRL | 10Y | 3640 | B | 13.750 | yes (from year 5) |
| ast_CB_GSDS_5Y | GSDS | SRL | 5Y | 1820 | BB | 12.000 | no |
| ast_CB_HDAL_10Y | HDAL | SRL | 10Y | 3640 | BBB | 10.375 | no |
| ast_CB_PTSL_5Y | PTSL | SRL | 5Y | 1820 | B | 13.750 | no |

SRL corporate coupons use 0.6 × the spread table because the local curve already carries the bloc's risk premium (DEFAULT).

### §4.5 FX pairs (10) and PPP anchors

Quoting per 06 §3.9.1 (base priority EUN > FDL > NKR > PYN > SRL). `S0` = genesis rate from 04's initial FX. `PPP_0` = the purchasing-power-parity anchor of 06 §3.9.2 (authored; a small genesis misalignment gives FX a first story: EUN slightly undervalued, PYN undervalued, NKR overvalued, SRL overvalued). Only the four FDL legs carry a PPP anchor; crosses are derived.

| assetId | Pair | S0 | PPP_0 | Leg? | Display decimals |
|---|---|---|---|---|---|
| ast_FX_EUNFDL | EUN/FDL | 1.1000 | 1.1330 | yes | 4 |
| ast_FX_FDLNKR | FDL/NKR | 10.5263 | 10.0000 | yes | 4 |
| ast_FX_FDLPYN | FDL/PYN | 6.6667 | 6.3500 | yes | 2 |
| ast_FX_FDLSRL | FDL/SRL | 5.0000 | 5.3000 | yes | 4 |
| ast_FX_EUNNKR | EUN/NKR | 11.5789 | derived | cross | 4 |
| ast_FX_EUNPYN | EUN/PYN | 7.3333 | derived | cross | 2 |
| ast_FX_EUNSRL | EUN/SRL | 5.5000 | derived | cross | 4 |
| ast_FX_NKRPYN | NKR/PYN | 0.6333 | derived | cross | 2 |
| ast_FX_NKRSRL | NKR/SRL | 0.4750 | derived | cross | 4 |
| ast_FX_PYNSRL | PYN/SRL | 0.7500 | derived | cross | 4 |

### §4.6 Commodities (20 lines), hubs, routes and contract sizes

Numbers of 06 §3.10.1 (unit, reference price, cover, elasticity, storage, perish, σ) are owned by 06 and not repeated. This catalog adds names, futures contract sizes, CMX weights, benchmark hubs, and the hub and route tables.

| assetId | Code | Name | Unit | Benchmark hub | Futures contract size | CMX weight | Notes |
|---|---|---|---|---|---|---|---|
| ast_CM_CRUDE | CRUDE | Skarvik Blend Crude Oil | bbl | hub_NKR | 1,000 bbl | 0.22 | physical |
| ast_CM_NATGAS | NATGAS | Natural Gas | MMBtu | hub_FDL | 10,000 MMBtu | 0.08 | physical |
| ast_CM_GOLD | GOLD | Gold | oz | hub_FDL | 100 oz | 0.12 | physical |
| ast_CM_SILVER | SILVER | Silver | oz | hub_FDL | 5,000 oz | 0.03 | physical |
| ast_CM_COPPER | COPPER | Copper | t | hub_FDL | 25 t | 0.12 | physical |
| ast_CM_LITHIUM | LITHIUM | Lithium Carbonate | t | hub_SRL | 10 t | 0.05 | physical |
| ast_CM_RARE_EARTH | RARE_EARTH | Rare-Earth Basket | kg | hub_PYN | 1,000 kg | 0.03 | physical |
| ast_CM_WHEAT | WHEAT | Wheat | bu | hub_FDL | 5,000 bu | 0.08 | physical |
| ast_CM_CORN | CORN | Corn | bu | hub_FDL | 5,000 bu | 0.08 | physical |
| ast_CM_COFFEE | COFFEE | Coffee (arabica-type) | lb | hub_FDL | 37,500 lb | 0.04 | physical |
| ast_CM_COCOA | COCOA | Cocoa | t | hub_FDL | 10 t | 0.03 | physical |
| ast_CM_LUMBER | LUMBER | Lumber | mbf | hub_FDL | 100 mbf | 0.04 | physical |
| ast_CM_URANIUM | URANIUM | Uranium Oxide | lb | hub_NKR | 250 lb | 0.08 | physical |
| ast_CM_COMPUTE | COMPUTE | Compute (GPU-hours) | GPUh | world (no hub) | 10,000 GPUh | — | game-native, 06 §3.10.6 |
| ast_CM_DATA | DATA | Data, standard grade | DQU | world | 100,000 DQU | — | game-native |
| ast_CM_POWER_FDL | POWER_FDL | Federal Power | MWh | grid_FDL | 100 MWh over the month | — | one market per bloc |
| ast_CM_POWER_EUN | POWER_EUN | Compact Power | MWh | grid_EUN | 100 MWh over the month | — | one market per bloc |
| ast_CM_POWER_PYN | POWER_PYN | League Power | MWh | grid_PYN | 100 MWh over the month | — | one market per bloc |
| ast_CM_POWER_NKR | POWER_NKR | Nordic Power | MWh | grid_NKR | 100 MWh over the month | — | one market per bloc |
| ast_CM_POWER_SRL | POWER_SRL | Coalition Power | MWh | grid_SRL | 100 MWh over the month | — | one market per bloc |

CMX weights sum to 1.00 (13 physical commodities, front-month futures, 06 §3.5.1). The crude benchmark is named **Skarvik Blend** after its hub.

**Hubs** (`Hub`, 06 §3.10.4; storage capacity in units of each commodity's normal 30-day world demand × the factor):

| hubId | Name | City | Storage factor | Warehouse operator | Benchmark for |
|---|---|---|---|---|---|
| hub_FDL | Avalon Terminal | Port Avalon (Eastside Docks) | 1.0 | Avalon Bonded Warehouses | NATGAS, GOLD, SILVER, COPPER, WHEAT, CORN, COFFEE, COCOA, LUMBER |
| hub_EUN | Arsenal Terminal | Meridia (Arsenal Yards) | 0.6 | Arsenal Yards Bonded Stores | — |
| hub_PYN | Delta Terminal | Tessan (Delta Wharf) | 0.8 | Delta Wharf Storage | RARE_EARTH |
| hub_NKR | Skarvik Terminal | Skarvik (Rig Yards) | 0.7 | Skarvik Bonded Terminal | CRUDE, URANIUM |
| hub_SRL | Ore Docks Terminal | Cobreval (Ore Docks) | 0.7 | Cobreval Ore and Grain Stores | LITHIUM |

**Shipping routes** (06 §3.10.5): transit `routeDays` in game days and `distanceFactor` (multiplies `qty · unitWeight · FRX`). Routes are symmetric.

| routeId | From | To | routeDays | distanceFactor | Chokepoint (16 shock scope) |
|---|---|---|---|---|---|
| rte_FDL_EUN | hub_FDL | hub_EUN | 6 | 1.0 | Gilt Strait |
| rte_FDL_PYN | hub_FDL | hub_PYN | 10 | 1.6 | Long Passage |
| rte_FDL_NKR | hub_FDL | hub_NKR | 5 | 0.9 | Gilt Strait |
| rte_FDL_SRL | hub_FDL | hub_SRL | 4 | 0.7 | Coral Channel |
| rte_EUN_PYN | hub_EUN | hub_PYN | 12 | 1.8 | Serpent Canal |
| rte_EUN_NKR | hub_EUN | hub_NKR | 2 | 0.4 | none |
| rte_EUN_SRL | hub_EUN | hub_SRL | 7 | 1.1 | Coral Channel |
| rte_PYN_NKR | hub_PYN | hub_NKR | 11 | 1.7 | Serpent Canal |
| rte_PYN_SRL | hub_PYN | hub_SRL | 9 | 1.4 | Long Passage |
| rte_NKR_SRL | hub_NKR | hub_SRL | 8 | 1.2 | Gilt Strait |

Chokepoints (fictional sea lanes, targets of 16 "shipping-lane disruption" and "canal closure" shocks): **Gilt Strait**, **Long Passage**, **Coral Channel**, **Serpent Canal**. The FRX Freight Index (06 §3.10.5) has base `FRX_base = 1,000` points at genesis.

**Power merit-order stack (NPC, per bloc; 06 §3.10.6).** Each bloc's NPC generation stack in order of marginal cost ($/MWh at genesis): FDL nuclear 18 (20%), wind/solar 5 (18%), hydro 8 (6%), gas 55 (40%), oil peakers 140 (16%); EUN nuclear 20 (25%), renewables 6 (22%), gas 75 (38%), coal 90 (10%), peakers 170 (5%); PYN nuclear 18 (20%), renewables 7 (12%), coal 60 (35%), gas 80 (28%), peakers 160 (5%); NKR hydro 6 (55%), wind 5 (20%), nuclear 20 (15%), gas 70 (10%); SRL hydro 10 (35%), solar 6 (15%), gas 60 (30%), diesel 150 (20%). Shares are of bloc capacity; total capacity = 1.15 × genesis peak demand. Named NPC operators are the utility rows of §4.1.

### §4.7 Crypto: tokens (20), chains, protocols and pools

Chains (06 §3.11.5): **Aurum** (AURUM, transfers only), **Lattice** (LATTICE, smart contracts), **Meridian** (MERIDIAN, second platform). Token rows below use 06 §3.11.1's codes, chains and kinds; this catalog adds genesis supply, price and fundamental anchor `v0` (06 §3.11.2's `auc_v0` and `v0`). `v0` = genesis fundamental per token in FDL; `p0` = genesis market price (hype premium H₀ in 06 = ln(p0/v0) clamped).

| assetId | Code | Name | Chain | Kind | Circulating supply at genesis | Max supply | p0 (FDL) | v0 (FDL) | Notes |
|---|---|---|---|---|---|---|---|---|---|
| ast_CR_AUC | AUC | Aurum Coin | AURUM | NATIVE | 9,500,000 | 18,000,000 | 40,000 | 34,000 | block reward to NPC miners |
| ast_CR_LTX | LTX | Lattice | LATTICE | NATIVE | 120,000,000 | none (4%/yr staking issuance) | 2,400 | 2,100 |  |
| ast_CR_MRD | MRD | Meridian | MERIDIAN | NATIVE | 400,000,000 | none (5%/yr staking issuance) | 140 | 120 | hosts Cascade range pools |
| ast_CR_SYN | SYN | Synapse | LATTICE | UTILITY | 2,000,000,000 | 5,000,000,000 | 1.80 | 1.10 | AI-race linked |
| ast_CR_GUSD | GUSD | Guardian Dollar | LATTICE | STABLE_FIAT | 6,000,000,000 | none | 1.00 | 1.00 | issuer Guardian Trust |
| ast_CR_EUNX | EUNX | Euran Token | LATTICE | STABLE_FIAT | 1,500,000,000 | none | 1.10 | 1.10 | pegged to 1 EUN |
| ast_CR_VSD | VSD | Vesta Dollar | LATTICE | STABLE_CDP | 900,000,000 | none | 1.00 | 1.00 |  |
| ast_CR_VSG | VSG | Vesta Governance | LATTICE | GOV | 10,000,000 | 12,000,000 | 85 | 70 |  |
| ast_CR_MUSD | MUSD | Mirage USD | MERIDIAN | STABLE_ALGO | 1,200,000,000 | none | 1.00 | 1.00 |  |
| ast_CR_MSH | MSH | Mirage Share | MERIDIAN | GOV | 250,000,000 | none | 12 | 7 | absorbs MUSD volatility |
| ast_CR_FRO | FRO | Ferro | LATTICE | GOV | 100,000,000 | 100,000,000 | 6.50 | 5.00 | Ferro lending |
| ast_CR_TDP | TDP | Tidepool | LATTICE | GOV | 400,000,000 | 1,000,000,000 | 3.20 | 2.40 | Tidepool AMM |
| ast_CR_QLL | QLL | Quill | LATTICE | UTILITY | 80,000,000 | 100,000,000 | 14 | 11 | oracle network |
| ast_CR_ARC | ARC | Arc | MERIDIAN | GOV | 600,000,000 | 1,000,000,000 | 0.85 | 0.60 | Arc Bridge |
| ast_CR_VXT | VXT | Vault Token | LATTICE | UTILITY | 150,000,000 | 200,000,000 | 22 | 16 | Vault Exchange fee token |
| ast_CR_PLT | PLT | Pallet | MERIDIAN | UTILITY | 3,000,000,000 | 5,000,000,000 | 0.40 | 0.30 | payments |
| ast_CR_GRD | GRD | Gridcoin | LATTICE | UTILITY | 8,000,000,000 | 10,000,000,000 | 0.12 | 0.09 | compute and power linked |
| ast_CR_ORE | ORE | Ore | LATTICE | WRAPPED | 400,000 | none (1 ORE = 1 oz in vault) | 1,900 | 1,900 | gold-backed; vault: Keystone |
| ast_CR_KST | KST | Kestrel | MERIDIAN | UTILITY | 1,000,000,000 | 2,000,000,000 | 0.75 | 0.50 | fast payments |
| ast_CR_SBL | SBL | Sable | LATTICE | UTILITY | 20,000,000,000 | 50,000,000,000 | 0.05 | 0.03 | gaming and media |

Rule-created: `wAUC` Wrapped Aurum (Lattice, custodian Keystone), Arc-bridged wrappers `aLTX`, `aMRD`, `aGUSD` (id grammar 06). Genesis wAUC supply 120,000; bridged supplies 0.

**NPC crypto entities** (all `npc` institutions, 16 actors where noted):

| Entity id | Name | Role | Home | Notes |
|---|---|---|---|---|
| npc_GUARDIAN | Guardian Trust | GUSD issuer (06 §3.12.6) | Port Avalon | reserves 60% bills / 30% deposits at Lakeshore Bancorp / 10% repo (the named NPC reserve bank) |
| npc_EUNX_ISSUER | Guardian Trust Europe | EUNX issuer | Meridia | reserve bank: Banca Valcourt |
| npc_KEYSTONE | Keystone Custody | wAUC custodian and ORE gold vault | Isla Serena | vault in the Serena Free Zone |
| npc_VAULTX | Vault Exchange | NPC centralised exchange (ven_VAULTX) | Isla Serena | owns Vault Clearing, the crypto-native TCH member (§5.2) |
| npc_VESTA_DAO | Vesta Governance Council | Vesta stability-fee governance | — | NPC rule actor |
| npc_MIRAGE_LABS | Mirage Labs | Mirage protocol operator | — |  |
| npc_TIDEPOOL | Tidepool Foundation | Tidepool AMM treasury | — |  |
| npc_FERRO | Ferro Labs | Ferro lending treasury | — |  |
| npc_HARBOR_DEFI | Harbor Protocol | Harbor lending (Meridian) | — | not related to Harbor Club or Harbor Realty |
| npc_CASCADE | Cascade Collective | Cascade range-pool treasury | — |  |
| npc_QUILL | Quill Network | oracle | — |  |
| npc_ARC | Arc Bridge Operators | bridge | — |  |
| npc_MINERS | Aurum Mining Pools (Deepvein, Northlight, Saltpan) | NPC miners: 3 pools with 45/35/20% of hash | FDL, NKR, SRL |  |
| npc_STAKERS | Lattice and Meridian validators (Granite Stake, Kelp Validators, Basalt Nodes) | NPC stakers | — |  |

**Launch AMM pools (24)**. Venue `ven_AMM_<poolId>`. Reserves in token units at genesis (priced at p0, so both sides are equal value). Fee per protocol (Tidepool CP 0.30%, Tidepool stableswap 0.04% A = 100, Cascade tiers as listed).

| poolId | Protocol | Pair | Kind | Fee | Seed value per side (FDL) |
|---|---|---|---|---|---|
| TP_LTX_GUSD | Tidepool | LTX/GUSD | CONSTANT_PRODUCT | 0.30% | 60M |
| TP_wAUC_GUSD | Tidepool | wAUC/GUSD | CONSTANT_PRODUCT | 0.30% | 40M |
| TP_wAUC_LTX | Tidepool | wAUC/LTX | CONSTANT_PRODUCT | 0.30% | 25M |
| TP_SYN_LTX | Tidepool | SYN/LTX | CONSTANT_PRODUCT | 0.30% | 8M |
| TP_FRO_LTX | Tidepool | FRO/LTX | CONSTANT_PRODUCT | 0.30% | 4M |
| TP_TDP_LTX | Tidepool | TDP/LTX | CONSTANT_PRODUCT | 0.30% | 6M |
| TP_QLL_LTX | Tidepool | QLL/LTX | CONSTANT_PRODUCT | 0.30% | 4M |
| TP_VSG_LTX | Tidepool | VSG/LTX | CONSTANT_PRODUCT | 0.30% | 3M |
| TP_VXT_GUSD | Tidepool | VXT/GUSD | CONSTANT_PRODUCT | 0.30% | 5M |
| TP_GRD_LTX | Tidepool | GRD/LTX | CONSTANT_PRODUCT | 0.30% | 3M |
| TP_SBL_LTX | Tidepool | SBL/LTX | CONSTANT_PRODUCT | 0.30% | 2M |
| TP_ORE_GUSD | Tidepool | ORE/GUSD | CONSTANT_PRODUCT | 0.30% | 6M |
| TPS_GUSD_VSD | Tidepool | GUSD/VSD | STABLESWAP | 0.04% | 150M |
| TPS_GUSD_EUNX | Tidepool | GUSD/EUNX | STABLESWAP (rate-adjusted 1.10) | 0.04% | 60M |
| TPS_aGUSD_MUSD | Tidepool | aGUSD/MUSD | STABLESWAP | 0.04% | 40M |
| CS_MRD_MUSD_30 | Cascade | MRD/MUSD | RANGE | 0.30% | 30M |
| CS_MRD_MUSD_05 | Cascade | MRD/MUSD | RANGE | 0.05% | 15M |
| CS_MSH_MUSD_100 | Cascade | MSH/MUSD | RANGE | 1.00% | 20M |
| CS_ARC_MRD_30 | Cascade | ARC/MRD | RANGE | 0.30% | 4M |
| CS_PLT_MUSD_30 | Cascade | PLT/MUSD | RANGE | 0.30% | 5M |
| CS_KST_MUSD_30 | Cascade | KST/MUSD | RANGE | 0.30% | 4M |
| CS_aLTX_MRD_30 | Cascade | aLTX/MRD | RANGE | 0.30% | 8M |
| CS_aGUSD_MRD_05 | Cascade | aGUSD/MRD | RANGE | 0.05% | 12M |
| CS_SYN_MRD_100 | Cascade | SYN/MRD | RANGE | 1.00% | 3M |

Cascade range pools are seeded as one position from 0.5× to 2× the genesis price. Lending markets at genesis: Ferro (LTX, wAUC, GUSD, VSD, ORE), Harbor (MRD, MUSD, aGUSD, MSH). Initial deposits: 30% of each token's AMM seed value; borrow at 40% utilisation.

**Meme-coin name generator** (06 §3.11.4; generator `meme`, stream `rng('content/meme', tick)` at each spawn). Name = `<prefix><core>` or `<core> <suffix>` (50/50). Prefixes: Baby, Mega, Turbo, Lil, Moon, Based, Royal, Space, Super, Night. Cores (60): Otter, Pigeon, Biscuit, Noodle, Pickle, Waffle, Comet, Goblin, Hamster, Toaster, Pebble, Mango, Pretzel, Llama, Rocket, Sloth, Penguin, Badger, Donut, Bubble, Cactus, Gecko, Panda, Walrus, Muffin, Turnip, Sprout, Kettle, Lobster, Yeti, Narwhal, Crumpet, Gizmo, Pixel, Raccoon, Wombat, Puffin, Taco, Bagel, Ferret, Koala, Marmot, Quokka, Squid, Dodo, Bison, Moose, Parrot, Snail, Frog, Croissant, Dumpling, Meatball, Pudding, Popcorn, Tofu, Ramen, Sushi, Nacho, Pancake. Suffixes: Coin, Token, Cash, Moon, Rocket, Club, DAO, Bucks, Gold, Finance. Ticker: first 3–5 consonant-preferring letters of the core, uppercased, prefixed with nothing; unique among live tokens (collision: append a digit 2–9). No ticker may equal a launch token, an equity ticker, or a reserved word. 06 caps spawns at 2 per game week.

### §4.8 Indices (reference values, not instruments) → content/indices.json

Methods and rules are 06 §3.5.1. Index level at genesis = 1,000.00 for every index except GXV (computed) and FRX (1,000 points by definition).

| indexId | Name | Method (06) | Universe | Cap | Rebalance | Used by |
|---|---|---|---|---|---|---|
| idx_GX100 | GX 100 | FFMC_CAPPED | 100 largest equities world-wide by free-float cap in FDL | 10% | quarterly | ETF GXH, index futures, options, GXV |
| idx_FED30 | Federal 30 | FFMC_CAPPED | 30 largest FDL-listed | 10% | quarterly | FEDX, futures |
| idx_EUR30 | Euran 30 | FFMC_CAPPED | 30 largest EUN-listed | 10% | quarterly | EURX, futures |
| idx_PAC30 | Pacific 30 | FFMC_CAPPED | 30 largest PYN-listed | 10% | quarterly | PACX, futures |
| idx_NOR30 | Nordic 30 | FFMC_CAPPED | 30 largest NKR-listed | 10% | quarterly | NORX, futures |
| idx_SOU30 | Southern 30 | FFMC_CAPPED | 30 largest SRL-listed | 10% | quarterly | SOUX, futures |
| idx_GXS_TECH … idx_GXS_SECURITY (12) | GX Technology, GX Semiconductors and Compute, GX Energy, GX Materials and Mining, GX Industrials and Logistics, GX Financials, GX Healthcare and Biotech, GX Consumer Staples, GX Consumer Discretionary and Luxury, GX Real Estate, GX Media and Entertainment, GX Security and Defence | FFMC_CAPPED | all listed equities of the sector | 20% | quarterly | sector ETFs, 05 `SEC_<sector>` factor reference |
| idx_GXDIV30 | GX Dividend 30 | FFMC_CAPPED | 30 highest trailing yields, payout ≤ 90% | 6% | semiannual | GDIV |
| idx_GXREIT | GX REIT | FFMC_CAPPED | the listed REITs | 20% | quarterly | GREI |
| idx_GXAGG | GX Bond Aggregate | RULE_BOND | government + IG corporate, ≥ 1y | — | monthly | GAGG |
| idx_GXIG | GX Investment Grade Credit | RULE_BOND | corporate bonds rated BBB− or better | 3% per issuer | monthly | 08 IG reference, NPC IG funds |
| idx_GXHY | GX High Yield | RULE_BOND | corporate bonds below BBB− | 3% per issuer | monthly | GHYB |
| idx_GXC40 | GX Credit 40 | RULE_BOND (CDS) | equal-weight CDS of the 40 most liquid corporate reference entities | equal | semiannual roll | CDS index (06 swaps), 05 `CREDIT` factor reference |
| idx_TSY_FDL … idx_TSY_SRL (5) | Federal / Compact / League / Nordic / Coalition Treasury Index | RULE_BOND | the bloc's government bonds ≥ 1y (SRL: local-currency only) | — | monthly | treasury ETFs, 05 `RATES_<bloc>` reference |
| idx_CMX | CMX Commodity | RULE_COMMODITY | 13 physical, front-month futures, weights §4.6 | — | monthly roll days 5–9 | GCMX |
| idx_GOLD_SPOT | Gold Spot Reference | RULE_COMMODITY | ast_CM_GOLD benchmark hub spot | — | — | GLDT |
| idx_CRX10 | CRX10 | RULE_CRYPTO | 10 largest non-stable tokens by free-float cap | 25% | monthly | CR10, 05 `CRYPTO` factor reference |
| idx_GXV | GX Volatility Index (GXV) | VOL | 30-game-day implied vol of GX100 | — | — | 06 §3.5.3 |
| idx_FRX | FRX Freight Index | rule | fleet utilisation (06 §3.10.5) | — | — | shipping businesses, 09 |
| idx_AIRACE | AI Race Index | owned by 11 | 0–100 | — | — | 05 `AI_RACE` factor, 16 eras |
| idx_LUXCPI | Luxury CPI | owned by 03 (Stabilizer lever L2) | — | — | — | 14 price display |
| idx_CI_WATCH, idx_CI_CAR, idx_CI_ART, idx_CI_WINE, idx_CI_YACHT, idx_CI_JET | Collectible indices: Watches, Classic Cars, Art, Fine Wine, Yachts, Jets | owned by 06 §2.7 (driven by top-1% wealth growth and the hype cycle) | — | — | — | 14 valuation of LIMITED/UNIQUE items |

05 asked for "one 50-stock index per bloc"; 06 owns indices and defines 30-stock regional indices, so the regional indices are the **30**s above (22-notes).

### §4.9 DeFi protocols (06 §3.12.1)

| protocolId | Name | Chain | Kind | Governance token | Operator entity |
|---|---|---|---|---|---|
| prot_TIDEPOOL | Tidepool | Lattice | AMM (constant product, stableswap) | TDP | npc_TIDEPOOL |
| prot_FERRO | Ferro | Lattice | lending | FRO | npc_FERRO |
| prot_VESTA | Vesta | Lattice | CDP stablecoin VSD | VSG | npc_VESTA_DAO |
| prot_QUILL | Quill | Lattice | oracle | QLL | npc_QUILL |
| prot_CASCADE | Cascade | Meridian | range AMM | — (fees to npc_CASCADE) | npc_CASCADE |
| prot_HARBOR | Harbor | Meridian | lending | — | npc_HARBOR_DEFI |
| prot_MIRAGE | Mirage | Meridian | algorithmic stablecoin MUSD/MSH | MSH | npc_MIRAGE_LABS |
| prot_ARC | Arc Bridge | Lattice ↔ Meridian | bridge | ARC | npc_ARC |
| prot_KEYSTONE | Keystone | Aurum → Lattice | custodial wrapper (wAUC) | — | npc_KEYSTONE |

### §4.10 MARKET asset groups (19 MARKET partitions) → content/asset_groups.json

Every instrument belongs to exactly one asset group; 19 assigns groups to MARKET partitions. Rule-created instruments inherit the group of their underlying (options and futures on a bloc equity → `DERIV_<bloc>`; on an index → the index's bloc, GX100 → `DERIV_FDL`; on commodities → `CMD_ALL`; on crypto → `CRYPTO_ALL`; on rates and FX → `DERIV_<bloc>` of the quote currency).

| groupId | Members |
|---|---|
| EQ_FDL, EQ_EUN, EQ_PYN, EQ_NKR, EQ_SRL | that bloc's equities and the bloc's ETFs (FEDX…SOUX, the bloc's treasury ETF) |
| EQ_GLOBAL | GX ETFs (GXH, sector ETFs, GDIV, GREI, GCMX, GLDT, CR10, GAGG, GHYB) |
| BOND_ALL | all government and corporate bonds |
| FX_ALL | the 10 FX pairs and FX forwards |
| CMD_ALL | 20 commodity lines, non-benchmark hub lines, commodity and power futures, compute futures |
| CRYPTO_ALL | tokens, wrapped tokens, meme coins, LP tokens, crypto futures and perps |
| DERIV_FDL, DERIV_EUN, DERIV_PYN, DERIV_NKR, DERIV_SRL | options, index futures, rate futures, bond futures, swaps and CDS referencing that bloc |

That is 15 groups at launch (19 estimated "about 12").

### §4.11 Claim kinds for the belief model (05 §6.3) → content/claim_kinds.json

`assertedMove` is the log move the claim asserts if true, for an average company; 05 scales it by the asset's σ relative to its sector σ. Direction is fixed by the kind unless marked ±.

| claimKind | Display name | assertedMove | Typical sources |
|---|---|---|---|
| ACCOUNTING_IRREGULARITY | Accounting irregularity | −0.25 | short report, outlet investigation |
| FRAUD_ALLEGATION | Fraud allegation | −0.35 | short report, whistle |
| PRODUCT_DELAY | Product delay | −0.08 | rumor, analyst note |
| PRODUCT_FAILURE | Product failure or recall | −0.12 | rumor, outlet |
| TRIAL_RESULT | Trial result (±) | ±0.30 | rumor (HEALTH only) |
| TAKEOVER_INTEREST | Takeover interest | +0.15 | rumor, Circle whispers |
| TAKEOVER_COLLAPSE | Takeover talks collapse | −0.10 | rumor |
| EARNINGS_BEAT | Earnings will beat | +0.05 | analyst note, rumor |
| EARNINGS_MISS | Earnings will miss | −0.06 | analyst note, rumor |
| GUIDANCE_CUT | Guidance cut coming | −0.08 | rumor |
| CEO_EXIT | Chief executive to leave | −0.05 | rumor |
| ACTIVIST_STAKE | Activist building a stake | +0.06 | rumor, filing chatter |
| CONTRACT_WIN | Large contract win | +0.07 | rumor |
| CONTRACT_LOSS | Large customer lost | −0.09 | rumor |
| REGULATORY_PROBE | Regulator investigating | −0.10 | rumor, outlet |
| LAWSUIT_LOSS | Will lose a major lawsuit | −0.07 | rumor |
| CAPITAL_RAISE | Dilutive capital raise coming | −0.06 | rumor |
| BUYBACK | Buyback coming | +0.04 | rumor |
| DIVIDEND_CUT | Dividend cut coming | −0.07 | rumor |
| CREDIT_DOWNGRADE | Downgrade coming | −0.05 | rumor (equity); bonds use 08 sizes |
| LIQUIDITY_STRESS | Funding problems (banks, funds, exchanges) | −0.20 | rumor, outlet |
| DEPEG_RISK | Stablecoin reserve doubts | −0.04 (on the stablecoin) | rumor, outlet |
| EXCHANGE_INSOLVENCY | Venue insolvency (Vault Exchange) | −0.30 (on VXT) | rumor |
| SUPPLY_DISRUPTION | Supply disruption (commodity ±) | ±0.10 | outlet precursor |
| POLICY_CHANGE | Policy change affecting the company (±) | ±0.05 | outlet precursor, bill news |
| HACK_RUMOR | Breach at the company (outcome only) | −0.08 | rumor |
| PUMP_CLAIM | Undefined "big news soon" (crypto and small caps) | +0.10 | player posts, meme spawns |
| REBUTTAL | Company rebuttal (offsets an active claim) | −0.5 × the claim it rebuts | company, 12 M4 |

Engine-verifiable claims (a filing, a verdict, a release) use the owner module's size, not this table (05 §6.3).

### §4.12 Genesis pre-history (generator `prehistory`)

05 needs 250 trading days of prices before genesis for historical VaR, and 07 a 364-game-day burn-in (07 §3.15). Generator stream `rng('content/prehistory', worldSeed)`:

1. Run 05's value process (§3.3) for every launch instrument for 364 game days **backward-indexed** (days −364 … −1) with factor draws from the stream, regime EXPANSION throughout except one authored STORM window: days −120 … −100 a **"Pre-genesis rate scare"** (RATE_SCARE: `RATES_<bloc>` −2σ jumps, GX −6% over 10 days, recovery over 30 days), so stressed-window VaR is non-trivial.
2. Rescale each series so its last close equals the genesis price exactly (multiplicative drift adjustment).
3. Store daily closes only (no intraday), flagged `prehistory: true`; charts show them in a muted tone with the label "before Genesis Day".
4. Macro pre-history (04 releases) for the same window is generated with 04's measurement model so the first "prior" values exist.

### §4.13 Authored stress scenarios (07, 08, 05; also harness and Academy seeds)

| scenarioId | Name | Owner use | Shock vector (applied instantaneously unless a path is given) |
|---|---|---|---|
| STR_REG_ADVERSE | Regulator's adverse scenario | 07 §3.11 bank stress tests | policy rates +3.00 pp; house prices −25%; unemployment +4 pp; equities −40%; credit spreads ×3; FX: SRL −25%, PYN −10%, EUN −5%, NKR −5% vs FDL; commodities −30% (oil −40%); over 4 game quarters, static balance sheet |
| STR_TCH_DEFAULT_A | TCH extreme-but-plausible: equity crash | 07 §3.17.5 default fund sizing | GX −25%, bloc indices −20…−35%, implied vol ×2.5, crypto −50%, spreads ×2 |
| STR_TCH_DEFAULT_B | TCH extreme-but-plausible: rates shock | 07 | all curves +250 bp parallel, curve flattening 100 bp, FX ±15%, bond futures limit moves |
| STR_TCH_DEFAULT_C | TCH extreme-but-plausible: commodity squeeze | 07 | crude +80%, gas +150%, metals +40%, freight ×3, commodity vol ×2 |
| STR_RUN_RETAIL | Retail run | 07 run test | deposit outflow 25% of uninsured over 5 GD at the target bank, rumor credibility 0.8 |
| STR_REPO_RUN | Repo run | 07 repo test | repo haircuts ×3 on non-government collateral, rollover rate 60% for 10 GD |
| STR_STABLE_CONF | Stablecoin confidence shock | 06 test | GUSD reserve bank deposit haircut 20%, redemption demand 40% of supply over 5 GD |
| STR_MIRAGE_SPIRAL | Mirage spiral | 06 test | MSH demand −70%, hype H → 0.1, MUSD secondary 0.92 |
| STR_BRIDGE_IMPAIR | Bridge impairment | 06 test | Arc Bridge locked −35% |
| STR_EARNINGS_SEASON | Earnings season | 05, 09 tests | all companies report within 10 trading days with surprise σ ×1.5 |
| STR_STD_* | Standard shocks (05 §risk) | 05 stress engine | rates ±200 bp; equities −20%; FX ±10%; spreads ×2; vol ×1.5 (one row each) |

Historical replays (05: "Crash of Y2 Q3"): named automatically from world history as `"<Crisis display name> of Y<year> Q<quarter>"` using §10.11 crisis names; the factor vector is the one recorded at the time.

### §4.14 Collectible categories (06 §2.7) and their catalogs

Collectible instruments are rule-created from the lifestyle catalog (§9) and auction lots. Categories and their index: WATCH → CI_WATCH; CAR (classic) → CI_CAR; ART → CI_ART; WINE → CI_WINE; YACHT → CI_YACHT; JET → CI_JET; SNEAKER (sneaker resale inventory, 09 FLIP_TRADING) → no index (marked by last sale and hype). Provenance records list prior owners as "private collection" unless the owner opted in (L11). The named unique items (Vetro classics, heritage watches, masterworks, island lots) are in §9.

## §5 Financial institutions (NPC) → content/fin_institutions.json

### §5.1 NPC banks (26)

07 §6.1 roster: per bloc 1 NPC_SIB, 2 NPC_COMMERCIAL, 2 NPC_REGIONAL, plus 1 NPC_PRIVATE on Isla Serena. Strategy archetype per 07 (`NpcBankStrategy`). Total assets at genesis as a share of bloc nominal GDP (04 world GDP split); the loader converts to money. "Dyn" = controlled by a dynasty (16 §3.4.1: 8 of the 25 bloc banks are dynasty-controlled lenders; §10.4 names the families). PD = primary dealer (04). TCH = clearing member (07). PB = prime broker. CUST = custodian, securities-lending agent and tri-party agent. Default retail bank = 07's suggested first savings bank for players homed in that city (18 introduces it).

| bankId | Name | Bloc | Kind | Strategy | HQ | Assets (% bloc GDP) | Listed | Roles | Default retail bank for | Dyn |
|---|---|---|---|---|---|---|---|---|---|---|
| bnk_avnb | Avalon National Bank | FDL | NPC_SIB | INVESTMENT | Port Avalon | 8.0 | AVNB | PD, TCH, PB | — | — |
| bnk_lksb | Lakeshore Bancorp | FDL | NPC_COMMERCIAL | BALANCED | Lakemont | 4.0 | LKSB | PD, TCH, CUST; GUSD reserve bank | — | — |
| bnk_chst | Charter Street Bank | FDL | NPC_COMMERCIAL | GROWTH | Port Avalon | 2.0 | no | — | Port Avalon | Calloway |
| bnk_nssl | Northshore Savings and Loan | FDL | NPC_REGIONAL | REGIONAL | Lakemont | 0.6 | no | — | Lakemont | Whitlock |
| bnk_rmsb | Redmesa Savings Bank | FDL | NPC_REGIONAL | REGIONAL | Redmesa | 0.6 | no | — | Redmesa | — |
| bnk_mrdb | Meridia Bank | EUN | NPC_SIB | INVESTMENT | Meridia | 9.0 | MRDB | PD, TCH, PB | — | — |
| bnk_bvlc | Banca Valcourt | EUN | NPC_COMMERCIAL | BALANCED | Valcourt | 4.5 | BVLC | PD, TCH, CUST; EUNX reserve bank | — | — |
| bnk_blag | Banque Lagunaire | EUN | NPC_COMMERCIAL | GROWTH | Meridia | 2.0 | no | — | Meridia | Serrano |
| bnk_cevl | Caisse d'Épargne de Valcourt | EUN | NPC_REGIONAL | REGIONAL | Valcourt | 0.7 | no | — | Valcourt | — |
| bnk_bmcb | Belmara Cantonal Bank | EUN | NPC_REGIONAL | REGIONAL | Belmara | 0.8 | no (subsidiary of BLMP) | — | Belmara | Halden |
| bnk_kypb | Kaiyo Pacific Bank | PYN | NPC_SIB | INVESTMENT | Kaiyo City | 9.0 | KYPB | PD, TCH, PB | — | — |
| bnk_tscb | Tessan Commercial Bank | PYN | NPC_COMMERCIAL | BALANCED | Tessan | 4.5 | TSCB | PD, TCH, CUST | — | — |
| bnk_shtb | Shinbashi Trust Bank | PYN | NPC_COMMERCIAL | CONSERVATIVE | Kaiyo City | 2.5 | no | — | Kaiyo City | Tachibana |
| bnk_tdsb | Tessan Delta Shinkin Bank | PYN | NPC_REGIONAL | REGIONAL | Tessan | 0.6 | no | — | Tessan | — |
| bnk_mirb | Mirako Regional Bank | PYN | NPC_REGIONAL | REGIONAL | Mirako | 0.5 | no | — | Mirako | — |
| bnk_nrhb | Nordhaven Bank | NKR | NPC_SIB | INVESTMENT | Nordhaven City | 10.0 | NRHB | PD, TCH | — | — |
| bnk_sksb | Skarvik Sparebank | NKR | NPC_COMMERCIAL | BALANCED | Skarvik | 5.0 | SKSB | PD, TCH, CUST | — | — |
| bnk_fjbk | Fjordbanken | NKR | NPC_COMMERCIAL | CONSERVATIVE | Nordhaven City | 3.0 | no | — | Nordhaven City | Halvorsen |
| bnk_vtsb | Vintra Sparebank | NKR | NPC_REGIONAL | REGIONAL | Vintra | 0.8 | no | — | Vintra | — |
| bnk_sksv | Skerries Savings Bank | NKR | NPC_REGIONAL | REGIONAL | Skarvik | 0.6 | no | — | Skarvik | — |
| bnk_bsdr | Banco Sundara | SRL | NPC_SIB | INVESTMENT | Sundara Coast | 6.0 | BSDR | PD, TCH | — | — |
| bnk_bavd | Banco Alta Verde | SRL | NPC_COMMERCIAL | BALANCED | Alta Verde | 3.5 | BAVD | PD, TCH, CUST | — | — |
| bnk_bcob | Banco del Cobre | SRL | NPC_COMMERCIAL | GROWTH | Cobreval | 2.0 | no | — | Cobreval | Cobos |
| bnk_ccob | Caja Cobreval | SRL | NPC_REGIONAL | REGIONAL | Cobreval | 0.5 | no | — | — | — |
| bnk_cpav | Caja Popular Alta Verde | SRL | NPC_REGIONAL | REGIONAL | Alta Verde | 0.6 | no | — | Alta Verde; Sundara Coast | Larrain |
| bnk_serena | Serena Private Bank | — | NPC_PRIVATE | CONSERVATIVE | Isla Serena | $40B fixed | no | TCH | Isla Serena (wealth clients only) | — |

Dynasty-controlled lenders: 8 (Calloway, Whitlock, Serrano, Halden, Tachibana, Halvorsen, Cobos, Larrain), matching 16 §3.4.1. Every city has at least one retail NPC bank. The 25 bloc banks are run by the 25 BANK_CEO actors of 16; Serena Private Bank is run by a LENDER_OWNER actor (16 roster unchanged).

**Broker members (client clearing, 07):** each SIB and commercial bank A runs a broker subsidiary named `<bank short> Securities` (Avalon National Securities, Lakeshore Securities, Meridia Bank Securities, Banca Valcourt Securities, Kaiyo Pacific Securities, Tessan Commercial Securities, Nordhaven Bank Securities, Skarvik Sparebank Securities, Banco Sundara Valores, Banco Alta Verde Valores). The player's in-game broker in the Broker app clears through the broker of the player's home bloc SIB by default (display "Cleared by Avalon National Securities").

**Regional bank generator for new cities** (`bank_new`): name `<City root> <Savings Bank | Sparebank | Caja | Shinkin Bank | Caisse d'Épargne>` by bloc; strategy REGIONAL; assets 0.4% of bloc GDP; CEO = the BANK_CEO actor spawned with the city (16 §3.3.1).

### §5.2 Dealers, primary dealers and clearing members

| Entity id | Name | Kind | HQ | Roles |
|---|---|---|---|---|
| npc_dlr_GRAY | Graybridge Securities | NPC dealer firm | Port Avalon | TCH member; primary dealer in all 5 blocs; options market maker of 06 |
| npc_dlr_OSTP | Ostrander & Pike | NPC dealer firm | Meridia | TCH member; primary dealer in all 5 blocs; FX and rates dealer |
| npc_VAULTCLR | Vault Clearing | crypto-native clearing member (owned by Vault Exchange) | Isla Serena | TCH member for CRY products |

**Primary dealers (04: 8 per bloc = 40 seats).** In every bloc: that bloc's SIB, that bloc's commercial bank A, the four other blocs' SIBs (foreign primary dealers), Graybridge Securities and Ostrander & Pike. 04's NPC dealer pool per bloc aggregates these 8.

**TCH members (07: 14 at launch):** the 5 SIBs, the 5 commercial banks A, Graybridge Securities, Ostrander & Pike, Vault Clearing, Serena Private Bank.

**NPC authorized participants and tranche dealers (08 §6.2: 2 dealer banks per bloc):** the bloc's SIB and commercial bank A.

**Prime brokers (07):** Avalon National Bank, Meridia Bank, Kaiyo Pacific Bank.

### §5.3 Loan and credit product names (07)

| productId | Display name | Owner rule |
|---|---|---|
| LN_LOMBARD | Lombard Line (securities-backed credit line) | 07 |
| LN_MORTGAGE_RES | Home Mortgage | 07, 10 |
| LN_MORTGAGE_COM | Commercial Mortgage | 07, 10 |
| LN_CONSTRUCTION | Construction Loan | 07, 10 |
| LN_SME | Business Term Loan | 07, 09 |
| LN_REVOLVER | Revolving Credit Facility | 07, 09 |
| LN_LBO | Leveraged Acquisition Facility | 07, 09 |
| LN_PERSONAL | Personal Credit Line | 07 |
| LN_MARGIN | Margin Loan | 07 |
| LN_REPO | Repo (bilateral, TCH Repo, tri-party) | 07 |
| LN_SECLEND | Securities Loan | 07 |
| DEP_CURRENT | Current Account | 07 |
| DEP_SAVINGS | Savings Account | 07 |
| DEP_TERM | Term Deposit (1, 4, 13 game weeks) | 07 |

### §5.4 NPC funds (40) → content/npc_funds.json

08 §6.1 roster: 12 hedge, 10 long-only, 4 credit, 3 venture, 3 private equity, 5 money-market, 3 ETF sponsors. The roadmap M12 rivals keep their rules. AUM at genesis in FDL. Principal = the FUND_PRINCIPAL actor (16: 30 principals; the two VC/PE houses each have one principal for both funds, and MMFs and ETF sponsors are run by their parent bank or sponsor's BACKGROUND policy, so 26 + 4 = 30). "Rival" = appears as a reference row on boards (15 §3.4.1).

| fundId | Name | Kind | Strategy (08) | Home | AUM0 | Fees | Principal | Notes |
|---|---|---|---|---|---|---|---|---|
| fnd_haleward | Hale & Ward | HEDGE | LONG_SHORT_EQUITY (value; 05 value pool slice) | FDL | $250M | 2/20 | yes | rival, "reachable at $7,000" scaled board row (08, roadmap M12) |
| fnd_pinn | Pinn Partners | HEDGE | QUANT (momentum, 05 trend pool slice) | FDL | $400M | 2/20 | yes | rival |
| fnd_vetch | Vetch | HEDGE | CRYPTO (crypto trend pool slice) | Isla Serena | $60M | 2/25 | yes | rival, "crypto degen" |
| fnd_northwind | Northwind Macro | HEDGE | MACRO | NKR | $8B | 2/20 | yes | |
| fnd_saltmarsh | Saltmarsh Relative Value | HEDGE | RELATIVE_VALUE | FDL | $6B | 1.5/20 | yes | |
| fnd_corbel | Corbel Event Partners | HEDGE | EVENT_DRIVEN | EUN | $4B | 2/20 | yes | activist campaigns |
| fnd_quadrant | Quadrant Quantitative | HEDGE | QUANT | PYN | $12B | 2/25 | yes | |
| fnd_greyheron | Grey Heron Capital | HEDGE | LONG_SHORT_EQUITY | FDL | $5B | 2/20 | yes | short reports (12 M1 as NPC) |
| fnd_ventana | Ventana Global Macro | HEDGE | MACRO | SRL | $2B | 2/20 | yes | |
| fnd_shirokane | Shirokane Long/Short | HEDGE | LONG_SHORT_EQUITY | PYN | $3B | 2/20 | yes | |
| fnd_aster | Aster Multi-Strategy | HEDGE | MULTI_ASSET | EUN | $15B | 2/20 | yes | |
| fnd_bluefjord | Blue Fjord Credit Opportunities | HEDGE | CREDIT | NKR | $3B | 1.5/20 | yes | distressed |
| fnd_keel_eq | Keel Long-Term Equity | LONG_ONLY | LONG_ONLY_EQUITY | FDL | $60B | 0.5/0 | yes | |
| fnd_harlan | Harlan Growth Fund | LONG_ONLY | LONG_ONLY_EQUITY (growth) | FDL | $25B | 0.7/0 | yes | |
| fnd_compass_eu | Compass European Equity | LONG_ONLY | LONG_ONLY_EQUITY | EUN | $30B | 0.6/0 | yes | |
| fnd_valtrust | Valcourt Balanced Trust | LONG_ONLY | MULTI_ASSET | EUN | $12B | 0.6/0 | yes | |
| fnd_tidemark_as | Tidemark Asia Leaders | LONG_ONLY | LONG_ONLY_EQUITY | PYN | $35B | 0.6/0 | yes | |
| fnd_hanabira | Hanabira Income Fund | LONG_ONLY | MULTI_ASSET | PYN | $10B | 0.5/0 | yes | |
| fnd_nordic_pens | Nordic Pension Equity | LONG_ONLY | LONG_ONLY_EQUITY | NKR | $18B | 0.3/0 | yes | pension-linked |
| fnd_sur_crece | Fondo Sur Crecimiento | LONG_ONLY | LONG_ONLY_EQUITY | SRL | $6B | 1.0/0 | yes | |
| fnd_bwam_div | Brightwater Dividend Fund | LONG_ONLY | LONG_ONLY_EQUITY (income) | FDL | $20B | 0.5/0 | yes | sponsor BWAM |
| fnd_fjcp_glob | Fjord Global Allocation | LONG_ONLY | MULTI_ASSET | NKR | $9B | 0.6/0 | yes | sponsor FJCP |
| fnd_ironbark | Ironbark Credit | CREDIT | CREDIT | FDL | $10B | 1/10 | yes | buys tranche equity |
| fnd_lagune_cr | Lagune Credit Partners | CREDIT | CREDIT | EUN | $6B | 1/10 | yes | |
| fnd_kaiyo_cr | Kaiyo Private Credit | CREDIT | CREDIT | PYN | $5B | 1/15 | yes | private loans |
| fnd_austral_cr | Austral High Yield | CREDIT | CREDIT | SRL | $2B | 1.2/15 | yes | |
| fnd_launchpad | Launchpad Ventures I | VENTURE | VENTURE | FDL | $3B | 2/20 | Launchpad (shared) | Launchpad Partners house |
| fnd_genkai_vc | Genkai Seed Fund | VENTURE | VENTURE | PYN | $1.5B | 2/20 | Genkai (shared) | Genkai Capital house |
| fnd_aurora_vc | Aurora Nordic Ventures | VENTURE | VENTURE | NKR | $0.8B | 2/20 | yes | |
| fnd_launchpad_bo | Launchpad Buyout II | PRIVATE_EQUITY | BUYOUT | FDL | $12B | 1.5/20 | Launchpad (shared) | LBOs of private firms (09 §3.14) |
| fnd_genkai_bo | Genkai Buyout | PRIVATE_EQUITY | BUYOUT | PYN | $8B | 1.5/20 | Genkai (shared) | |
| fnd_castell_bo | Castell Private Equity | PRIVATE_EQUITY | BUYOUT | EUN | $9B | 1.5/20 | yes | |
| fnd_mmf_fdl | Avalon Treasury Money Fund | MONEY_MARKET | CASH | FDL | $80B | 0.10/0 | — (Avalon National) | |
| fnd_mmf_eun | Meridia Liquidity Fund | MONEY_MARKET | CASH | EUN | $50B | 0.10/0 | — (Meridia Bank) | |
| fnd_mmf_pyn | Kaiyo Cash Reserve Fund | MONEY_MARKET | CASH | PYN | $45B | 0.10/0 | — (Kaiyo Pacific) | |
| fnd_mmf_nkr | Nordhaven Likviditet | MONEY_MARKET | CASH | NKR | $12B | 0.10/0 | — (Nordhaven Bank) | |
| fnd_mmf_srl | Sundara Fondo de Liquidez | MONEY_MARKET | CASH | SRL | $10B | 0.15/0 | — (Banco Sundara) | |
| fnd_kif | Keel Index Funds | ETF sponsor | INDEX | FDL | sum of its ETFs | per ETF | — | sponsor of GXH, FEDX, … (§4.2) |
| fnd_cmp | Compass Shares | ETF sponsor | INDEX | EUN | sum of its ETFs | per ETF | — | |
| fnd_tdm | Tidemark ETFs | ETF sponsor | INDEX | PYN | sum of its ETFs | per ETF | — | |

The five sovereign wealth funds (§2.1) are counted under 04 treasuries, not in the 40.

**Style reference profiles (08 §3.1.13)**: allowed factor-beta ranges `[lo, hi]` per strategy. Factors: MKT (GX), SEC (largest sector loading), REG (largest bloc loading), RATES, RISK (fear, sign + = risk-on), FX (largest currency), CRYPTO.

| StrategyClass | MKT | SEC | REG | RATES | RISK | FX | CRYPTO |
|---|---|---|---|---|---|---|---|
| MACRO | −0.5 … 0.5 | −0.3 … 0.3 | −0.5 … 0.5 | −1.5 … 1.5 | −1 … 1 | −1 … 1 | −0.3 … 0.3 |
| RELATIVE_VALUE | −0.2 … 0.2 | −0.3 … 0.3 | −0.2 … 0.2 | −0.5 … 0.5 | −0.3 … 0.3 | −0.3 … 0.3 | −0.1 … 0.1 |
| EVENT_DRIVEN | 0.1 … 0.6 | −0.5 … 0.5 | −0.3 … 0.5 | −0.3 … 0.3 | −0.3 … 0.6 | −0.3 … 0.3 | −0.1 … 0.1 |
| QUANT | −0.3 … 0.3 | −0.3 … 0.3 | −0.3 … 0.3 | −0.3 … 0.3 | −0.3 … 0.3 | −0.3 … 0.3 | −0.2 … 0.2 |
| CREDIT | 0 … 0.4 | −0.2 … 0.2 | −0.3 … 0.3 | 0 … 1.0 | 0 … 0.6 | −0.2 … 0.2 | 0 … 0 |
| LONG_SHORT_EQUITY | 0.3 … 0.7 | −0.5 … 0.5 | −0.5 … 0.5 | −0.3 … 0.3 | −0.3 … 0.6 | −0.3 … 0.3 | −0.1 … 0.1 |
| LONG_ONLY_EQUITY | 0.8 … 1.2 | −0.4 … 0.4 | −0.4 … 0.6 | −0.4 … 0.4 | 0 … 0.8 | −0.4 … 0.4 | 0 … 0.1 |
| MULTI_ASSET | 0.3 … 0.8 | −0.3 … 0.3 | −0.3 … 0.5 | 0 … 0.8 | 0 … 0.6 | −0.4 … 0.4 | 0 … 0.1 |
| CRYPTO | −0.2 … 0.5 | −0.2 … 0.2 | −0.2 … 0.2 | −0.3 … 0.3 | −0.5 … 1.5 | −0.2 … 0.2 | 0.5 … 1.5 |
| VENTURE | 0.5 … 1.5 | −0.5 … 1.0 | −0.5 … 0.5 | −0.5 … 0.5 | 0 … 1.0 | −0.3 … 0.3 | 0 … 0.3 |
| BUYOUT | 0.6 … 1.4 | −0.5 … 0.5 | −0.5 … 0.5 | −0.5 … 0.5 | 0 … 0.8 | −0.3 … 0.3 | 0 … 0.1 |
| CASH | −0.05 … 0.05 | −0.05 … 0.05 | −0.05 … 0.05 | 0 … 0.1 | −0.05 … 0.05 | −0.05 … 0.05 | 0 … 0 |
| INDEX | 0.9 … 1.1 | −0.2 … 0.2 | −0.3 … 0.3 | −0.2 … 0.2 | −0.2 … 0.2 | −0.2 … 0.2 | 0 … 0 |

### §5.5 Rating agencies (08 §3.4.1)

| ratId | Name | Style | Parent | Parent listing | HQ |
|---|---|---|---|---|---|
| rat_SV | Sterling & Vane Ratings | CONSERVATIVE | Sterling & Vane Holdings, owned by the Calloway dynasty holding (§10.4) | private | Port Avalon, Financial Mile |
| rat_MCO | Meridian Credit Opinion | MODERATE | Meridian Analytics Group | MAGP (EUN) | Meridia, Business District |
| rat_ORS | Orion Ratings Service | ISSUER_FRIENDLY | Orion Information Group | ORIG (FDL) | Port Avalon, Glasshill |

Rating scale display names (08 grades): AAA, AA+, AA, AA−, A+, A, A−, BBB+, BBB, BBB−, BB+, BB, BB−, B+, B, B−, CCC, CC, C, D. Outlook names: Stable, Positive, Negative, Developing. Watch names: "On Watch Positive", "On Watch Negative".

### §5.6 Insurers, reinsurers, guarantee schemes and cat capital (08)

| insId | Name | Kind | Home | Listed | Lines written | Notes |
|---|---|---|---|---|---|---|
| ins_aegis | Aegis Mutual | primary | FDL (Port Avalon) | no (mutual) | all player lines; HH_* in FDL | the cyber insurer named in 03 §11.2 and 12 |
| ins_halden | Halden Assurance | primary | EUN (Valcourt) | no (Halden dynasty) | all lines; HH_* in EUN | |
| ins_kaiyo | Kaiyo Marine and Fire | primary | PYN (Kaiyo City) | KYMF | all lines; HH_* in PYN | |
| ins_nordvik | Nordvik Mutual | primary | NKR (Nordhaven City) | no (mutual) | all lines; HH_* in NKR | |
| ins_solano | Solano Seguros | primary | SRL (Sundara Coast) | SLNS | all lines; HH_* in SRL | |
| ins_bastion | Bastion Re | reinsurer | Isla Serena | no | CAT_XOL, quota share | global |
| ins_halvorsen | Halvorsen Re | reinsurer | NKR (Nordhaven City) | HLVR | CAT_XOL, quota share | global; Halvorsen dynasty |
| ins_lanyard | Lanyard Specialty | specialty insurer | FDL (Port Avalon) | no | MARINE_CARGO, ENERGY_ASSET, CONSTRUCTION_ALL_RISK | global specialty capacity |
| ins_ridgeline | Ridgeline Surety and Credit | specialty insurer | EUN (Meridia) | no | TRADE_CREDIT, PROFESSIONAL_INDEMNITY, DIRECTORS_OFFICERS | |
| ins_aerie | Aerie Specialty | specialty insurer | PYN (Kaiyo City) | no | KEY_PERSON, MODEL_IP, CYBER, RANSOMWARE_BI | |

The three specialty insurers are added so that 16's roster of 10 INSURER_CEO actors (5 primary + 2 reinsurers + 3) has institutions to run; they price with the same NPC loads and `modelQuality = 0.6` as the primaries and add capacity only on their lines (DEFAULT, 22-notes). Guarantee schemes and bridge insurers are in §2.1.

**Line-of-business tables (08 §3.5.2 inputs).**

Product-liability rate by 06 sector (`productRate`, fraction of annual revenue): TECH 0.001, SEMI 0.002, ENERGY 0.004, MATERIALS 0.004, INDUSTRIALS 0.003, FINANCIALS 0.0005, HEALTH 0.008, STAPLES 0.002 (food 0.002), DISCRETIONARY 0.003, REAL_ESTATE 0.001, MEDIA 0.001, SECURITY 0.002.

Base rates for limit-priced lines: KEY_PERSON 0.03 × limit; MARINE_CARGO 0.004 × cargo value (×1.5 through a chokepoint under a STORM shock); MODEL_IP `p_theft × replacement` with `p_theft` from 12; ENERGY_ASSET 0.006 × insured value; CONSTRUCTION_ALL_RISK 0.004 × contract value; PROFESSIONAL_INDEMNITY 0.01 × annual fees; LEGAL_EXPENSE 0.015 × limit; COLLECTIBLES 0.004 × appraised value (×0.5 at physical security grade ≥ 3).

Premium risk factors for D&O frequency by listing status: listed 0.04 suits/GY, private 0.01; × (1 + 0.5 × convictions in the last 4 GY).

**NPC cat capital and pensions (cat-bond and senior-tranche buyers, 08 §6.3; 10 named):**

| Entity id | Name | Kind | Home | Appetite |
|---|---|---|---|---|
| npc_cat_tempest | Tempest Cat Fund | cat fund | Isla Serena | cat bonds, all perils |
| npc_cat_seawall | Seawall Resilience Fund | cat fund | FDL | coastal storm, flood |
| npc_cat_faultline | Faultline Capital | cat fund | PYN | quake |
| npc_cat_northern | Northern Lights ILS | cat fund | NKR | winter storm, cyber cat |
| npc_pen_fdl | Federal Teachers' Pension | pension | FDL | AA+ tranches, govt bonds |
| npc_pen_eun | Compact Civil Service Pension | pension | EUN | AA+ |
| npc_pen_pyn | League Workers' Pension Fund | pension | PYN | AA+ |
| npc_pen_nkr | Nordic National Pension | pension | NKR | AA+, equities |
| npc_pen_srl | Coalition Retirement Fund | pension | SRL | AA+ |
| npc_pen_serena | Serena Endowment | endowment | Isla Serena | cat bonds and AA tranches |

## §6 Businesses and the catalog economy → content/business_types.json, content/categories.json

09 owns every formula; this section owns every row. 09 §3.1.4 fixes 85 binding rows (09 calls them "81"; the table holds 85) and `PARAM.catalog_size_target = 150`; the 65 added rows below combine existing archetypes, categories and segments, so no new mechanic is needed (09 §3.1.4). All prices are launch FDL at price level 1.0, indexed by 09 §3.1.3.

### §6.1 Archetype reference values (`ArchetypeRef` defaults)

Every type takes its archetype's defaults unless its row overrides them. `κ` = COGS ratio (variable cost share of revenue), `φ` = fixed-cost ratio at reference utilisation (split 60% staff, 25% premises, 15% other), margin `= 1 − κ − φ` at reference. Hours are local city time. Weekend factor multiplies Saturday and Sunday demand. Season profile ids are in §6.2. DEFAULT (Mathis may override); 20 tunes.

| Archetype | κ (COGS) | φ (fixed) | Margin at ref | Open hours | Weekend factor | Season profile | Demand source (09 `DemandSource`) | Cycle beta | Income elasticity | Price elasticity |
|---|---|---|---|---|---|---|---|---|---|---|
| FOOTFALL_RETAIL | 0.38 | 0.32 | 0.30 | 07–21 | 1.15 | FLAT_RETAIL | HOUSEHOLD | 0.8 | 0.9 | -1.4 |
| LOCAL_SERVICE | 0.25 | 0.40 | 0.35 | 08–19 | 0.50 | FLAT | HOUSEHOLD | 0.7 | 0.8 | -1.1 |
| B2B_CONTRACT | 0.30 | 0.40 | 0.30 | 08–18 | 0.20 | FLAT | BUSINESS_DERIVED | 1.0 | 1.0 | -0.8 |
| COMMODITY_PRODUCER | 0.35 | 0.30 | 0.35 | 00–24 | 1.00 | COMMODITY | COMMODITY_MARKET | 1.2 | 0.6 | -0.3 |
| PROCESSOR | 0.55 | 0.20 | 0.25 | 00–24 | 1.00 | FLAT | BUSINESS_DERIVED | 1.3 | 1.0 | -0.9 |
| PLATFORM_COMMISSION | 0.20 | 0.45 | 0.35 | 00–24 | 1.10 | EVENING | FLOW_TAKE | 1.1 | 1.2 | -1.0 |
| SUBSCRIPTION | 0.20 | 0.50 | 0.30 | 00–24 | 1.00 | FLAT | HOUSEHOLD | 0.5 | 0.7 | -0.7 |
| HIT_DRIVEN | 0.25 | 0.45 | 0.30 | 00–24 | 1.20 | HOLIDAY | HOUSEHOLD | 0.9 | 1.4 | -1.2 |
| TOURISM | 0.30 | 0.40 | 0.30 | 00–24 | 1.30 | SUMMER | TOURISM | 1.5 | 1.6 | -1.3 |
| TRANSPORT_CAPACITY | 0.50 | 0.25 | 0.25 | 00–24 | 0.80 | FLAT | BUSINESS_DERIVED | 1.3 | 1.1 | -0.6 |
| REGULATED_UTILITY | 0.45 | 0.30 | 0.25 | 00–24 | 0.90 | WINTER | HOUSEHOLD | 0.3 | 0.3 | -0.2 |
| COMPUTE_PROVIDER | 0.40 | 0.30 | 0.30 | 00–24 | 1.00 | FLAT | BUSINESS_DERIVED | 1.1 | 1.0 | -0.7 |
| TRIAL_BINARY | 0.20 | 0.60 | 0.20 | 08–18 | 0.00 | FLAT | GOVERNMENT | 0.2 | 0.2 | -0.1 |
| TROPHY | 0.30 | 0.45 | 0.25 | event days | 1.00 | SEASON | HOUSEHOLD | 0.6 | 1.5 | -0.5 |
| FLIP_TRADING | 0.70 | 0.10 | 0.20 | 10–22 | 1.30 | HOLIDAY | HOUSEHOLD | 1.4 | 1.8 | -1.6 |
| FINANCIAL_INSTITUTION | — | — | — | market hours | — | — | PLAYER_SERVICES | — | — | — |  

FINANCIAL_INSTITUTION types (bank, insurer, fund manager) are off the payback curve; 07 and 08 own their economics (09 §3.8.2). `ai_lab` is a gateway type that creates an 11 Lab and has no ArchetypeRef.

**Derived capacity rule (how every `capacityPerHour0` below was computed).** `dailyRevenue0 = c0 / (paybackDays(tier) × marginAtRef)` with paybackDays B1 6, B2 12, B3 24, B4 48, B5 96, B6 200 game days (09 §3.2.4 payback curve); `capacityPerHour0 = dailyRevenue0 / (0.75 × openHours × refPrice)` (reference utilisation 75%). The loader recomputes these from the row and fails if the stored value differs by more than 1%. Staff per capacity: 1 reference employee per `max(1, round(capacityPerHour0 × refPrice / 120))` FDL of hourly revenue (FOOTFALL and LOCAL_SERVICE), per 400 FDL (B2B, TRANSPORT, PROCESSOR), per 2,000 FDL (COMMODITY, UTILITY, PLATFORM, SUBSCRIPTION, COMPUTE). Data by-product `dataRateDquPerUnit` = 0.01 for `hackable` types, 0.002 otherwise; types with `TW_DATA_RICH` ×5.

### §6.2 Hour and season profiles → content/demand_profiles.json

Hour profiles are 24 weights (local hours 00–23, mean 1.0 over open hours, 0 when closed). Season profiles are 52 weekly weights (mean 1.0); here given as 13 four-week blocks (each weight applies to 4 consecutive game weeks). Holidays (§1.3) multiply FOOTFALL and HIT_DRIVEN demand by 1.3 and B2B by 0.3 on the day.

| Profile | Hours shape | 13 four-week season blocks |
|---|---|---|
| FLAT_RETAIL | peaks 08 (1.3), 12–13 (1.5), 17–19 (1.4); trough 15 (0.7) | 0.95 0.92 0.97 1.00 1.00 1.00 1.02 1.03 1.00 1.00 1.02 1.05 1.24 |
| FLAT | flat 1.0 over open hours; 0.9 first and last hour | 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 |
| COMMODITY | flat 1.0 all 24 h | 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 (harvest types override with `TW_HARVEST_SEASON`: blocks 8–10 at 2.6, others 0.52) |
| EVENING | 00–06 0.3; 07–11 0.8; 12–13 1.4; 14–17 0.9; 18–22 1.8; 23 0.9 | 1.02 0.96 0.97 0.98 1.00 0.98 0.97 0.98 1.00 1.01 1.03 1.05 1.05 |
| HOLIDAY | 00–07 0.4; 08–16 0.9; 17–23 1.7 | 0.90 0.85 0.90 0.95 0.95 0.95 1.00 1.00 0.95 1.00 1.05 1.20 1.30 |
| SUMMER | 00–06 0.6; 07–22 1.15; 23 0.9 | 0.70 0.70 0.80 0.95 1.10 1.30 1.45 1.40 1.15 0.95 0.80 0.75 0.95 (SRL and Isla Serena use the southern mirror: block k takes block (k+6) mod 13) |
| WINTER | 00–05 0.7; 06–09 1.2; 10–16 0.9; 17–21 1.4; 22–23 0.9 | 1.25 1.20 1.10 0.95 0.85 0.80 0.85 0.85 0.85 0.95 1.05 1.15 1.20 (southern mirror for SRL) |
| SEASON | event days only: 2 home fixtures per game week at 19–22 | season blocks 3–10 at 1.6; off-season 0.2 |

### §6.3 The 150 business types

Columns: `typeId`; name (string key `biz.<typeId>.name`); sector (09 `BizSector`); tier and the rank that opens it (14 §3.2.2); `c0` (FDL); archetype; default operating model; market scope; unique rule; product category (§6.4); unit; `refPrice` (FDL per unit); `capacityPerHour0` (derived, §6.1; — where not on the curve); inputs per unit (06 commodity codes in capitals, where `ENERGY` = MWh of the bloc's `POWER_<bloc>` line; intermediate goods in lower case, §6.5); twist ids (§6.10); flags. Setup days: B1 1 game hour, B2 1, B3 3, B4 7, B5 14 game days; B6 per row (power_utility 91, nuclear_plant 182, chip_fab 182, stock_exchange 56; sports_franchise transfers at auction). Allowed segments: household types BUDGET, MAINSTREAM, PREMIUM (default MAINSTREAM; LUXURY sector default PREMIUM and no BUDGET); B2B types B2B and INSTITUTIONAL (default B2B); COMMODITY_PRODUCER a single segment `B2B`. Allowed models: the default plus LEASED_PREMISES↔OWNED_PREMISES swap for premises types; ONLINE types also allow none.

Rows 1–85 are 09 §3.1.4's binding rows (values copied, the categories and inputs filled); rows 86–150 are added here (marked +).

| # | typeId | Name | Sector | Tier (rank) | c0 | Archetype | Model | Scope | Unique | Category | Unit | refPrice | cap/h₀ | Inputs per unit | Twists | Flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `coffee_cart` | Coffee cart | FOOD_HOSPITALITY | B1 (R0) | 2,500 | FOOTFALL_RETAIL | MOBILE | DISTRICT | - | coffee_to_go | cup | 4.50 | 29.4 | COFFEE 0.03 lb | TW_COMMODITY_INPUT | beginner |
| 2 | `food_truck` | Food truck | FOOD_HOSPITALITY | B1 (R0) | 6,000 | FOOTFALL_RETAIL | MOBILE | DISTRICT | - | street_food | meal | 11 | 28.9 | WHEAT 0.02 bu; CORN 0.02 bu | TW_MOVE_DISTRICT_DAILY; TW_FESTIVAL_BOOST | beginner |
| 3 | `cafe` | Café | FOOD_HOSPITALITY | B2 (R1) | 40,000 | FOOTFALL_RETAIL | LEASED_PREMISES | DISTRICT | - | coffee_to_go | cup | 5.20 | 204 | COFFEE 0.03 lb | TW_COMMODITY_INPUT; TW_CLUSTER_BONUS | — |
| 4 | `restaurant` | Restaurant | FOOD_HOSPITALITY | B2 (R1) | 150,000 | FOOTFALL_RETAIL | LEASED_PREMISES | DISTRICT | - | dining_out | cover | 48 | 82.7 | WHEAT 0.05 bu; ENERGY 0.004 | TW_CRITIC_REVIEW | — |
| 5 | `restaurant_chain` | Restaurant chain | FOOD_HOSPITALITY | B3 (R2) | 1,800,000 | FOOTFALL_RETAIL | LEASED_PREMISES | CITY | - | dining_out | cover | 32 | 744 | WHEAT 0.05 bu; ENERGY 0.004 | TW_EXPANSION_NATIVE | — |
| 6 | `boutique_hotel` | Boutique hotel | FOOD_HOSPITALITY | B3 (R2) | 3,000,000 | TOURISM | OWNED_PREMISES | CITY | - | hotel_nights | room-night | 260 | 89.0 | ENERGY 0.03 | TW_NEEDS_HOTEL_PROPERTY | — |
| 7 | `food_delivery_app` | Food delivery app | FOOD_HOSPITALITY | B4 (R3) | 15,000,000 | PLATFORM_COMMISSION | ONLINE | CITY | - | food_delivery | order | 3.20 | 15,501 | COMPUTE 0.002 | TW_COMMISSION_ON_CATEGORY(dining_out,coffee_to_go,street_food; 0.15); TW_DATA_RICH | hackable |
| 8 | `hotel_chain` | Hotel chain | FOOD_HOSPITALITY | B4 (R3) | 40,000,000 | TOURISM | OWNED_PREMISES | BLOC | - | hotel_nights | room-night | 180 | 857 | ENERGY 0.03 | TW_RECESSION_SENSITIVE | — |
| 9 | `resort_island` | Resort and island | FOOD_HOSPITALITY | B5 (R4) | 600,000,000 | TOURISM | SITE | WORLD | PER_CITY(Isla Serena) | luxury_resort | guest-night | 2,400 | 482 | ENERGY 0.08 | TW_TROPHY_PRESTIGE | — |
| 10 | `phone_repair_kiosk` | Phone repair kiosk | RETAIL_CONSUMER | B1 (R0) | 3,000 | LOCAL_SERVICE | LEASED_PREMISES | DISTRICT | - | device_repair | repair | 45 | 3.85 | electronics_components 0.2 | TW_LOW_VARIANCE | beginner |
| 11 | `sneaker_resale` | Sneaker resale | RETAIL_CONSUMER | B1 (R0) | 8,000 | FLIP_TRADING | ONLINE | CITY | - | sneakers | pair | 240 | 3.09 | - | TW_DROP_FLIP | beginner |
| 12 | `convenience_store` | Convenience store | RETAIL_CONSUMER | B2 (R1) | 90,000 | FOOTFALL_RETAIL | LEASED_PREMISES | DISTRICT | - | groceries | basket | 14 | 170 | packaged_food 0.8 | TW_DEFENSIVE | — |
| 13 | `supermarket` | Supermarket | RETAIL_CONSUMER | B3 (R2) | 2,500,000 | FOOTFALL_RETAIL | OWNED_PREMISES | CITY | - | groceries | basket | 38 | 870 | packaged_food 0.85 | TW_INFLATION_PASSTHROUGH | — |
| 14 | `supermarket_chain` | Supermarket chain | RETAIL_CONSUMER | B4 (R3) | 30,000,000 | FOOTFALL_RETAIL | OWNED_PREMISES | BLOC | - | groceries | basket | 36 | 5,511 | packaged_food 0.85 | TW_DATA_RICH | — |
| 15 | `ecommerce_marketplace` | E-commerce marketplace | RETAIL_CONSUMER | B5 (R4) | 800,000,000 | PLATFORM_COMMISSION | ONLINE | BLOC | - | online_retail | order | 2.40 | 551,146 | COMPUTE 0.004 | TW_COMMISSION_ON_SECTOR(RETAIL_CONSUMER; 0.08); TW_DATA_RICH | hackable |
| 16 | `cleaning_service` | Cleaning service | REAL_ESTATE_SERVICES | B1 (R0) | 4,000 | LOCAL_SERVICE | FIELD_SERVICE | CITY | - | building_cleaning | visit | 60 | 3.85 | - | TW_DEMAND_FROM_PLAYER_PROPERTIES | beginner |
| 17 | `property_management_agency` | Property management agency | REAL_ESTATE_SERVICES | B2 (R1) | 120,000 | B2B_CONTRACT | LEASED_PREMISES | CITY | - | property_management | managed-unit-day | 1.20 | 3,704 | - | TW_PLAYER_SERVICE(PROPERTY_MGMT; 8% of rent) | — |
| 18 | `construction_company` | Construction company | REAL_ESTATE_SERVICES | B3 (R2) | 2,000,000 | B2B_CONTRACT | FIELD_SERVICE | CITY | - | construction_services | contract-day | 5,200 | 7.12 | LUMBER 0.4 mbf; COPPER 0.05 t; steel 1.2 t | TW_CONTRACT_DELAYS | — |
| 19 | `real_estate_developer` | Real-estate developer | REAL_ESTATE_SERVICES | B4 (R3) | 25,000,000 | PROCESSOR | SITE | CITY | - | development_projects | m² delivered | 3,100 | 37.3 | construction_services 1 | TW_DEVELOPER(10) | — |
| 20 | `courier_bikes` | Courier bikes | LOGISTICS_TRANSPORT | B1 (R0) | 5,000 | LOCAL_SERVICE | FIELD_SERVICE | CITY | - | parcel_delivery | delivery | 7 | 41.2 | - | TW_SCALES_WITH(online_retail) | beginner |
| 21 | `moving_company` | Moving company | LOGISTICS_TRANSPORT | B2 (R1) | 60,000 | LOCAL_SERVICE | FIELD_SERVICE | CITY | - | removals | move | 900 | 1.92 | fuel 40 l | TW_SCALES_WITH(property_transactions) | — |
| 22 | `trucking_fleet` | Trucking fleet | LOGISTICS_TRANSPORT | B3 (R2) | 1,500,000 | TRANSPORT_CAPACITY | SITE | BLOC | - | road_freight | truck-day | 1,100 | 12.6 | fuel 300 l | TW_FUEL_INPUT | — |
| 23 | `port_terminal` | Port terminal | LOGISTICS_TRANSPORT | B5 (R4) | 500,000,000 | PLATFORM_COMMISSION | SITE | CITY | CONCESSION_PER_CITY(coastal) | port_throughput | TEU | 150 | 5,511 | ENERGY 0.02 | TW_CONCESSION; TW_TRADE_VOLUME_FEE | — |
| 24 | `shipping_line` | Shipping line | LOGISTICS_TRANSPORT | B5 (R4) | 700,000,000 | TRANSPORT_CAPACITY | SITE | WORLD | - | sea_freight | TEU-voyage | 1,400 | 1,157 | fuel 900 l | TW_FREIGHT_RATE(FRX) | — |
| 25 | `airline` | Airline | LOGISTICS_TRANSPORT | B5 (R4) | 900,000,000 | TRANSPORT_CAPACITY | SITE | WORLD | - | air_travel | seat | 210 | 9,921 | fuel 60 l | TW_FUEL_INPUT; TW_RECESSION_SENSITIVE | — |
| 26 | `rooftop_solar_installer` | Rooftop solar installer | ENERGY | B2 (R1) | 80,000 | B2B_CONTRACT | FIELD_SERVICE | CITY | - | solar_installs | install | 9,500 | 0.312 | electronics_components 3 | TW_POLICY_SUBSIDY(SECTOR_SUBSIDY) | — |
| 27 | `oil_well` | Oil well | ENERGY | B3 (R2) | 3,000,000 | COMMODITY_PRODUCER | SITE | SITE | - | crude_output | bbl | 75 | 265 | - | TW_COMMODITY_OUTPUT(CRUDE); TW_LIFTING_COST(28) | — |
| 28 | `solar_farm` | Solar farm | ENERGY | B3 (R2) | 2,500,000 | COMMODITY_PRODUCER | SITE | BLOC | - | power_output | MWh | 60 | 276 | - | TW_COMMODITY_OUTPUT(POWER); TW_SUPPLY_OWN_DATACENTERS; TW_DAYLIGHT_PROFILE | — |
| 29 | `wind_farm` | Wind farm | ENERGY | B4 (R3) | 20,000,000 | COMMODITY_PRODUCER | SITE | BLOC | - | power_output | MWh | 60 | 1,102 | - | TW_COMMODITY_OUTPUT(POWER); TW_WEATHER_VARIANCE | — |
| 30 | `refinery` | Refinery | ENERGY | B5 (R4) | 600,000,000 | PROCESSOR | SITE | BLOC | - | refined_products | bbl | 95 | 14,620 | CRUDE 1 bbl | TW_CRACK_SPREAD | — |
| 31 | `power_utility` | Power utility | ENERGY | B6 (R5) | 5,000,000,000 | REGULATED_UTILITY | SITE | CITY | CONCESSION_PER_CITY | grid_supply | MWh | 85 | 65,359 | POWER 1 MWh | TW_CONCESSION; TW_REGULATED_RETURN; TW_SELLS_TO_DATACENTERS | — |
| 32 | `nuclear_plant` | Nuclear plant | ENERGY | B6 (R5) | 12,000,000,000 | COMMODITY_PRODUCER | SITE | BLOC | CONCESSION_PER_BLOC | power_output | MWh | 60 | 158,730 | URANIUM 0.005 lb | TW_CONCESSION; TW_LONG_BUILD(182); TW_REGULATORY_EVENTS | — |
| 33 | `family_farm` | Family farm | MINING_AGRICULTURE | B2 (R1) | 70,000 | COMMODITY_PRODUCER | SITE | SITE | - | grain_output | bu | 5.50 | 168 | fertilizer 0.01 t | TW_COMMODITY_OUTPUT(WHEAT|CORN); TW_WEATHER_SEASON | — |
| 34 | `coffee_cocoa_plantation` | Coffee and cocoa plantation | MINING_AGRICULTURE | B3 (R2) | 1,200,000 | COMMODITY_PRODUCER | SITE | SITE | - | softs_output | lb | 1.80 | 4,409 | fertilizer 0.0005 t | TW_COMMODITY_OUTPUT(COFFEE|COCOA); TW_VERTICAL_LINK(cafe) | — |
| 35 | `gold_mine` | Gold mine | MINING_AGRICULTURE | B4 (R3) | 35,000,000 | COMMODITY_PRODUCER | SITE | SITE | - | gold_output | oz | 1,900 | 60.9 | - | TW_COMMODITY_OUTPUT(GOLD); TW_AISC(1100); TW_RESERVE_YEARS(12) | — |
| 36 | `lithium_mine` | Lithium mine | MINING_AGRICULTURE | B4 (R3) | 45,000,000 | COMMODITY_PRODUCER | SITE | SITE | - | lithium_output | t | 20,000 | 7.44 | - | TW_COMMODITY_OUTPUT(LITHIUM); TW_RESERVE_YEARS(15) | — |
| 37 | `rare_earth_mine` | Rare-earth mine | MINING_AGRICULTURE | B5 (R4) | 400,000,000 | COMMODITY_PRODUCER | SITE | SITE | - | rare_earth_output | kg | 60 | 11,023 | - | TW_COMMODITY_OUTPUT(RARE_EARTH); TW_EMBARGO_EVENTS; TW_RESERVE_YEARS(20) | — |
| 38 | `print_shop` | Print shop | MANUFACTURING | B1 (R0) | 7,000 | LOCAL_SERVICE | LEASED_PREMISES | CITY | - | printing | job | 85 | 4.75 | paper 0.02 t | TW_NONE | beginner |
| 39 | `furniture_workshop` | Furniture workshop | MANUFACTURING | B2 (R1) | 100,000 | PROCESSOR | LEASED_PREMISES | CITY | - | furniture | piece | 650 | 2.85 | LUMBER 0.15 mbf | TW_HOUSING_CYCLE | — |
| 40 | `electronics_assembly` | Electronics assembly | MANUFACTURING | B3 (R2) | 3,000,000 | PROCESSOR | SITE | BLOC | - | electronics_components | unit | 120 | 231 | chips 1; COPPER 0.0005 t | TW_CHIP_INPUT | — |
| 41 | `ev_auto_factory` | EV and auto factory | MANUFACTURING | B5 (R4) | 1,000,000,000 | PROCESSOR | SITE | BLOC | - | cars | car | 38,000 | 60.9 | LITHIUM 0.04 t; steel 1.1 t; chips 40; COPPER 0.08 t | TW_SELLS_TO_DEALERSHIPS | — |
| 42 | `chip_fab` | Chip fab | MANUFACTURING | B6 (R5) | 20,000,000,000 | PROCESSOR | SITE | BLOC | CONCESSION_PER_BLOC | chips | chip | 85 | 261,438 | RARE_EARTH 0.01 kg; POWER 0.05 MWh | TW_CONCESSION; TW_LONG_BUILD(182); TW_STRATEGIC_SUPPLY | — |
| 43 | `freelance_dev_studio` | Freelance dev studio | TECH_AI | B1 (R0) | 5,000 | B2B_CONTRACT | ONLINE | CITY | - | software_projects | dev-day | 420 | 0.882 | - | TW_QUALITY_ONLY_UPGRADES | beginner |
| 44 | `mobile_app_studio` | Mobile app studio | TECH_AI | B2 (R1) | 150,000 | HIT_DRIVEN | ONLINE | WORLD | - | mobile_apps | install | 1.50 | 1,543 | COMPUTE 0.0001 | TW_POWER_LAW_HITS; TW_DATA_RICH | hackable |
| 45 | `saas_company` | SaaS company | TECH_AI | B3 (R2) | 3,000,000 | SUBSCRIPTION | ONLINE | BLOC | - | business_software | seat-day | 2.20 | 10,522 | COMPUTE 0.001 | TW_LOW_CHURN; TW_RATE_SENSITIVE_VALUATION | hackable |
| 46 | `data_center` | Data center | TECH_AI | B4 (R3) | 40,000,000 | COMPUTE_PROVIDER | SITE | BLOC | - | compute_capacity | GPUh | 0.12 | 1,286,008 | POWER 0.0015 MWh | TW_SELLS_COMPUTE(11); TW_ENERGY_INPUT | hackable |
| 47 | `ai_lab` | AI lab | TECH_AI | B4 (R3) | 50,000,000 | (lab) | SITE | - | - | ai_lab | - | — | — | - | TW_CREATES_LAB(11) | hackable |
| 48 | `social_network` | Social network | TECH_AI | B5 (R4) | 900,000,000 | SUBSCRIPTION | ONLINE | WORLD | - | social_ads | ad-impression-k | 4 | 434,028 | COMPUTE 0.01 | TW_DATA_LEAK_EVENTS; TW_DATA_RICH | hackable |
| 49 | `cloud_provider` | Cloud provider | TECH_AI | B5 (R4) | 1,000,000,000 | COMPUTE_PROVIDER | SITE | BLOC | - | compute_capacity | GPUh | 0.14 | 13,778,660 | POWER 0.0015 MWh | TW_SELLS_COMPUTE(11) | hackable |
| 50 | `currency_exchange_booth` | Currency exchange booth | FINANCE | B1 (R0) | 6,000 | FOOTFALL_RETAIL | LEASED_PREMISES | DISTRICT | - | fx_retail | exchange | 9 | 35.3 | - | TW_TOURIST_FLOW | beginner |
| 51 | `accounting_firm` | Accounting firm | FINANCE | B2 (R1) | 90,000 | B2B_CONTRACT | LEASED_PREMISES | CITY | - | accounting_services | engagement-day | 380 | 8.77 | - | TW_PLAYER_SERVICE(ACCOUNTING; client tax −≤5%) | — |
| 52 | `brokerage` | Brokerage | FINANCE | B3 (R2) | 3,000,000 | PLATFORM_COMMISSION | ONLINE | BLOC | - | retail_brokerage | trade | 4 | 4,960 | COMPUTE 0.0005 | TW_NPC_FLOW_ONLY | — |
| 53 | `insurance_company` | Insurance company | FINANCE | B4 (R3) | 30,000,000 | FINANCIAL_INSTITUTION | OWNED_PREMISES | BLOC | - | insurance | - | — | — | - | TW_BECOMES_INSURER(08) | license:CH_INSURER |
| 54 | `bank` | Bank | FINANCE | B5 (R4) | 800,000,000 | FINANCIAL_INSTITUTION | OWNED_PREMISES | BLOC | - | banking | - | — | — | - | TW_BECOMES_BANK(07) | license:CH_BANK |
| 55 | `hedge_fund` | Hedge fund | FINANCE | B5 (R4) | 300,000,000 | FINANCIAL_INSTITUTION | OWNED_PREMISES | WORLD | - | fund_management | - | — | — | - | TW_BECOMES_FUND_MANAGER(08) | license:CH_FUND |
| 56 | `stock_exchange` | Stock exchange | FINANCE | B6 (R5) | 15,000,000,000 | PLATFORM_COMMISSION | OWNED_PREMISES | BLOC | CONCESSION_PER_BLOC | exchange_fees | - | — | — | - | TW_CONCESSION; TW_CAPPED_EXCHANGE_FEE | license:CH_EXCHANGE_MEMBER |
| 57 | `content_channel` | Content channel | MEDIA_ENTERTAINMENT | B1 (R0) | 2,000 | HIT_DRIVEN | ONLINE | WORLD | - | online_video | view-k | 3 | 20.6 | - | TW_VIRAL_EVENTS | beginner |
| 58 | `marketing_agency` | Marketing agency | MEDIA_ENTERTAINMENT | B2 (R1) | 120,000 | B2B_CONTRACT | LEASED_PREMISES | CITY | - | marketing_services | campaign-day | 900 | 4.94 | - | TW_PLAYER_SERVICE(MARKETING) | — |
| 59 | `nightclub` | Nightclub | MEDIA_ENTERTAINMENT | B2 (R1) | 180,000 | FOOTFALL_RETAIL | LEASED_PREMISES | DISTRICT | - | nightlife | entry | 30 | 159 | ENERGY 0.002 | TW_NIGHT_HOURS; TW_STATUS_VENUE(14) | — |
| 60 | `record_label` | Record label | MEDIA_ENTERTAINMENT | B3 (R2) | 2,000,000 | HIT_DRIVEN | ONLINE | WORLD | - | recorded_music | stream-k | 4 | 3,858 | - | TW_POWER_LAW_HITS | — |
| 61 | `news_outlet` | News outlet | MEDIA_ENTERTAINMENT | B3 (R2) | 2,500,000 | SUBSCRIPTION | ONLINE | BLOC | - | news_subscriptions | subscriber-day | 0.30 | 64,300 | - | TW_PUBLISHES_STORIES(16); TW_MANIPULATION_CHECK(13) | hackable |
| 62 | `esports_team` | Esports team | MEDIA_ENTERTAINMENT | B3 (R2) | 3,000,000 | HIT_DRIVEN | SITE | WORLD | - | esports | event | 90,000 | 0.257 | - | TW_SEASONAL_PRIZES | — |
| 63 | `streaming_studio` | Streaming studio | MEDIA_ENTERTAINMENT | B4 (R3) | 40,000,000 | SUBSCRIPTION | ONLINE | WORLD | - | streaming_subscriptions | subscriber-day | 0.40 | 385,802 | COMPUTE 0.0005 | TW_CONTENT_SLATE | hackable |
| 64 | `sports_franchise` | Sports franchise | MEDIA_ENTERTAINMENT | B6 (R5) | 3,000,000,000 | TROPHY | OWNED_PREMISES | CITY | PER_CITY(auctioned) | spectator_sport | ticket | 85 | — | - | TW_TROPHY_PRESTIGE; TW_AUCTION_ONLY | — |
| 65 | `pharmacy` | Pharmacy | HEALTH | B2 (R1) | 150,000 | FOOTFALL_RETAIL | LEASED_PREMISES | DISTRICT | - | pharmacy_retail | prescription | 28 | 142 | pharma_goods 0.7 | TW_DEFENSIVE | — |
| 66 | `clinic` | Clinic | HEALTH | B3 (R2) | 2,000,000 | LOCAL_SERVICE | LEASED_PREMISES | CITY | - | primary_care | visit | 140 | 206 | pharma_goods 0.1 | TW_STEADY | — |
| 67 | `biotech_lab` | Biotech lab | HEALTH | B4 (R3) | 30,000,000 | TRIAL_BINARY | SITE | WORLD | - | drug_pipeline | - | — | — | - | TW_TRIAL(0.35; 10-30x); TW_IPO_ON_WIN | — |
| 68 | `hospital_network` | Hospital network | HEALTH | B5 (R4) | 700,000,000 | REGULATED_UTILITY | OWNED_PREMISES | BLOC | - | hospital_care | bed-day | 900 | 1,800 | pharma_goods 0.15 | TW_REGULATED_RETURN; TW_DEFENSIVE | — |
| 69 | `watch_boutique` | Watch boutique | LUXURY | B3 (R2) | 2,500,000 | FOOTFALL_RETAIL | LEASED_PREMISES | DISTRICT | - | luxury_watches | watch | 9,500 | 3.48 | watches 1 | TW_SELLS_LIFESTYLE(14 WATCH) | — |
| 70 | `car_dealership` | Car dealership | LUXURY | B3 (R2) | 3,000,000 | FOOTFALL_RETAIL | OWNED_PREMISES | CITY | - | car_sales | car | 52,000 | 0.763 | cars 1 | TW_BUYS_FROM_FACTORIES; TW_SELLS_LIFESTYLE(14 CAR) | — |
| 71 | `watch_manufacture` | Watch manufacture | LUXURY | B4 (R3) | 45,000,000 | PROCESSOR | SITE | WORLD | - | watches | watch | 6,500 | 32.1 | GOLD 0.5 oz; SILVER 1 oz | TW_LIMITED_EDITIONS(14) | — |
| 72 | `fashion_house` | Fashion house | LUXURY | B5 (R4) | 500,000,000 | PROCESSOR | SITE | WORLD | - | fashion | garment | 600 | 1,929 | textiles 1 | TW_HYPE_CYCLE | — |
| 73 | `yacht_builder` | Yacht builder | LUXURY | B5 (R4) | 800,000,000 | PROCESSOR | SITE | WORLD | - | yachts | yacht | 12,000,000 | 0.154 | steel 200 t; electronics_components 400 | TW_ORDER_BOOK(91-182) | — |
| 74 | `it_support_shop` | IT support shop | SECURITY_LEGAL_INTEL | B1 (R0) | 4,000 | LOCAL_SERVICE | FIELD_SERVICE | CITY | - | it_support | ticket | 70 | 3.30 | - | TW_PATH_TO_SECURITY | beginner |
| 75 | `law_firm` | Law firm | SECURITY_LEGAL_INTEL | B3 (R2) | 1,500,000 | B2B_CONTRACT | LEASED_PREMISES | BLOC | - | legal_services | case-day | 2,400 | 11.6 | - | TW_PLAYER_SERVICE(LEGAL); TW_LITIGIOUS_WORLD | — |
| 76 | `cybersecurity_firm` | Cybersecurity firm | SECURITY_LEGAL_INTEL | B3 (R2) | 3,000,000 | B2B_CONTRACT | ONLINE | BLOC | - | cyber_defence | contract-day | 1,800 | 30.9 | COMPUTE 0.01 | TW_PLAYER_SERVICE(SECURITY); TW_HACK_RATE | — |
| 77 | `data_broker` | Data broker | SECURITY_LEGAL_INTEL | B3 (R2) | 2,500,000 | PROCESSOR | ONLINE | WORLD | - | data_sales | DQU | 2 | 11,574 | DATA 1 | TW_DATA_TRADE(11); TW_FENCING_ILLEGAL | hackable |
| 78 | `private_intelligence_firm` | Private intelligence firm | SECURITY_LEGAL_INTEL | B4 (R3) | 25,000,000 | B2B_CONTRACT | LEASED_PREMISES | WORLD | - | investigations | engagement-day | 9,000 | 25.7 | - | TW_PLAYER_SERVICE(INTEL); TW_FORENSICS(13) | — |
| 79 | `medical_courier` | Medical courier | LOGISTICS_TRANSPORT | B1 (R0) | 9,000 | LOCAL_SERVICE | FIELD_SERVICE | CITY | - | medical_logistics | delivery | 35 | 14.8 | fuel 2 l | TW_DERIVED_DEMAND(clinic,pharmacy,hospital_network); TW_CERT(MedGrade) | — |
| 80 | `refrigerated_storage` | Refrigerated storage | LOGISTICS_TRANSPORT | B2 (R1) | 180,000 | B2B_CONTRACT | SITE | CITY | - | cold_storage | pallet-day | 3.50 | 1,905 | POWER 0.003 MWh | TW_DERIVED_DEMAND(supermarket,pharma_generic_maker,food_delivery_app); TW_HEATWAVE_COST; TW_CERT(ColdChain Assured) | — |
| 81 | `industrial_equipment_repair` | Industrial equipment repair | MANUFACTURING | B2 (R1) | 110,000 | B2B_CONTRACT | FIELD_SERVICE | CITY | - | maintenance_service | call-out | 1,200 | 3.40 | - | TW_DERIVED_DEMAND(factories,mines,plants); TW_RESPONSE_TIME_TENDERS | — |
| 82 | `efficient_cooling_contractor` | Efficient cooling contractor | ENERGY | B3 (R2) | 900,000 | B2B_CONTRACT | FIELD_SERVICE | BLOC | - | cooling_service | MW-day | 260 | 64.1 | - | TW_DERIVED_DEMAND(data_center MW); TW_CERT(GridSafe) | — |
| 83 | `regional_data_supplier` | Regional data supplier | TECH_AI | B3 (R2) | 1,400,000 | PROCESSOR | ONLINE | BLOC | - | data_sales | DQU | 2.20 | 5,892 | - | TW_LEGAL_PROVENANCE(11) | — |
| 84 | `port_maintenance_firm` | Port maintenance firm | LOGISTICS_TRANSPORT | B3 (R2) | 1,600,000 | B2B_CONTRACT | FIELD_SERVICE | CITY | - | port_services | contract-day | 3,200 | 9.26 | steel 0.5 t | TW_DERIVED_DEMAND(port_terminal throughput); TW_CERT(PortSafe); coastal only | — |
| 85 | `cold_chain_transporter` | Cold-chain transporter | LOGISTICS_TRANSPORT | B3 (R2) | 1,200,000 | TRANSPORT_CAPACITY | FIELD_SERVICE | BLOC | - | cold_freight | truck-day | 1,500 | 7.41 | fuel 300 l | TW_CERT(ColdChain Assured); TW_PHARMA_CONTRACTS (S01) | — |
| 86 + | `bakery` | Bakery | FOOD_HOSPITALITY | B1 (R0) | 7,500 | FOOTFALL_RETAIL | LEASED_PREMISES | DISTRICT | - | baked_goods | loaf | 3.80 | 104 | WHEAT 0.012 bu | TW_COMMODITY_INPUT; TW_MORNING_PEAK | beginner |
| 87 + | `bubble_tea_stall` | Bubble-tea stall | FOOD_HOSPITALITY | B1 (R0) | 4,500 | FOOTFALL_RETAIL | MOBILE | DISTRICT | - | drinks_to_go | cup | 5.50 | 43.3 | packaged_food 0.3 | TW_TREND_HYPE | beginner |
| 88 + | `event_caterer` | Event caterer | FOOD_HOSPITALITY | B2 (R1) | 85,000 | B2B_CONTRACT | FIELD_SERVICE | CITY | - | catering | cover | 55 | 57.2 | packaged_food 1.5 | TW_DERIVED_DEMAND(hosted events, galas, corporate); TW_FESTIVAL_BOOST | — |
| 89 + | `bookshop` | Bookshop | RETAIL_CONSUMER | B2 (R1) | 60,000 | FOOTFALL_RETAIL | LEASED_PREMISES | DISTRICT | - | books | book | 18 | 88.2 | paper 0.0005 t | TW_CLUSTER_BONUS | — |
| 90 + | `gym` | Gym | RETAIL_CONSUMER | B2 (R1) | 140,000 | SUBSCRIPTION | LEASED_PREMISES | DISTRICT | - | fitness | member-day | 1.60 | 1,350 | ENERGY 0.0005 | TW_JANUARY_SURGE | — |
| 91 + | `barber` | Barber | RETAIL_CONSUMER | B1 (R0) | 5,000 | LOCAL_SERVICE | LEASED_PREMISES | DISTRICT | - | personal_care | cut | 25 | 11.5 | - | TW_LOW_VARIANCE | beginner |
| 92 + | `laundromat` | Laundromat | RETAIL_CONSUMER | B1 (R0) | 9,000 | LOCAL_SERVICE | LEASED_PREMISES | DISTRICT | - | laundry | wash | 6 | 86.6 | ENERGY 0.002 | TW_DEFENSIVE | beginner |
| 93 + | `pet_groomer` | Pet groomer | RETAIL_CONSUMER | B1 (R0) | 6,500 | LOCAL_SERVICE | LEASED_PREMISES | DISTRICT | - | pet_care | groom | 40 | 9.38 | - | TW_LOW_VARIANCE | beginner |
| 94 + | `bike_repair` | Bike repair | RETAIL_CONSUMER | B1 (R0) | 3,500 | LOCAL_SERVICE | LEASED_PREMISES | DISTRICT | - | bike_service | repair | 30 | 6.73 | - | TW_SUMMER_PEAK | beginner |
| 95 + | `florist` | Florist | RETAIL_CONSUMER | B1 (R0) | 6,000 | FOOTFALL_RETAIL | LEASED_PREMISES | DISTRICT | - | flowers | bouquet | 35 | 9.07 | - | TW_GIFT_DAY_PEAKS; TW_PERISHABLE_STOCK | beginner |
| 96 + | `tutoring_centre` | Tutoring centre | RETAIL_CONSUMER | B2 (R1) | 45,000 | LOCAL_SERVICE | LEASED_PREMISES | CITY | - | tutoring | session | 40 | 32.5 | - | TW_SCHOOL_TERMS | — |
| 97 + | `car_wash` | Car wash | RETAIL_CONSUMER | B1 (R0) | 9,500 | LOCAL_SERVICE | LEASED_PREMISES | DISTRICT | - | car_care | wash | 15 | 36.6 | ENERGY 0.001 | TW_WEATHER_VARIANCE | beginner |
| 98 + | `coworking_operator` | Coworking operator | REAL_ESTATE_SERVICES | B3 (R2) | 1,100,000 | SUBSCRIPTION | LEASED_PREMISES | CITY | - | flexible_office | desk-day | 25 | 340 | ENERGY 0.004 | TW_NEEDS_OFFICE_PROPERTY; TW_RECESSION_SENSITIVE | — |
| 99 + | `parking_operator` | Parking operator | REAL_ESTATE_SERVICES | B2 (R1) | 160,000 | FOOTFALL_RETAIL | OWNED_PREMISES | DISTRICT | - | parking | car-hour | 4 | 1,058 | - | TW_DOWNTOWN_DEMAND | — |
| 100 + | `architecture_firm` | Architecture firm | REAL_ESTATE_SERVICES | B3 (R2) | 1,200,000 | B2B_CONTRACT | LEASED_PREMISES | CITY | - | design_services | project-day | 2,600 | 8.55 | - | TW_PLAYER_SERVICE(DESIGN; permit time −10%) | — |
| 101 + | `recruitment_agency` | Recruitment agency | FINANCE | B2 (R1) | 75,000 | B2B_CONTRACT | LEASED_PREMISES | CITY | - | recruitment | placement | 4,500 | 0.617 | - | TW_HIRING_CYCLE; TW_PLAYER_SERVICE(HIRING; hire time −25%) | — |
| 102 + | `payroll_bureau` | Payroll bureau | FINANCE | B2 (R1) | 85,000 | SUBSCRIPTION | ONLINE | CITY | - | payroll_services | employee-day | 0.35 | 3,748 | - | TW_STEADY | hackable |
| 103 + | `payments_processor` | Payments processor | FINANCE | B4 (R3) | 28,000,000 | PLATFORM_COMMISSION | ONLINE | BLOC | - | card_payments | transaction-k | 18 | 5,144 | COMPUTE 0.002 | TW_COMMISSION_ON_SECTOR(RETAIL_CONSUMER,FOOD_HOSPITALITY; 0.012); TW_DATA_RICH | hackable |
| 104 + | `asset_management_boutique` | Asset-management boutique | FINANCE | B3 (R2) | 2,000,000 | SUBSCRIPTION | LEASED_PREMISES | BLOC | - | wealth_management | client-day | 55 | 281 | - | TW_MAY_SPONSOR_FUND(08; needs CH_FUND) | — |
| 105 + | `it_consultancy` | IT consultancy | TECH_AI | B3 (R2) | 900,000 | B2B_CONTRACT | LEASED_PREMISES | BLOC | - | software_projects | consultant-day | 950 | 17.5 | - | TW_PLAYER_SERVICE(IT) | — |
| 106 + | `cloud_msp` | Cloud managed-services provider | TECH_AI | B3 (R2) | 1,800,000 | SUBSCRIPTION | ONLINE | BLOC | - | managed_it | seat-day | 3.10 | 4,480 | COMPUTE 0.002 | TW_LOW_CHURN | hackable |
| 107 + | `satellite_data_provider` | Satellite data provider | TECH_AI | B5 (R4) | 350,000,000 | SUBSCRIPTION | SITE | WORLD | - | alt_data | DQU | 3.50 | 192,901 | COMPUTE 0.01 | TW_ALT_DATA_FEED(11 partnerships) | hackable |
| 108 + | `semiconductor_design_house` | Semiconductor design house | TECH_AI | B4 (R3) | 42,000,000 | B2B_CONTRACT | ONLINE | WORLD | - | chip_designs | licence-day | 9,000 | 43.2 | COMPUTE 0.05 | TW_DESIGN_ROYALTY(chip_fab) | hackable |
| 109 + | `robotics_integrator` | Robotics integrator | MANUFACTURING | B4 (R3) | 21,000,000 | B2B_CONTRACT | FIELD_SERVICE | BLOC | - | automation_projects | project-day | 14,000 | 13.9 | electronics_components 30; steel 0.5 t | TW_AUTOMATION_TECH(16) | — |
| 110 + | `drone_services` | Drone services | LOGISTICS_TRANSPORT | B2 (R1) | 120,000 | B2B_CONTRACT | FIELD_SERVICE | CITY | - | aerial_services | flight | 650 | 6.84 | electronics_components 0.2 | TW_DERIVED_DEMAND(construction, mines, insurers) | — |
| 111 + | `game_studio` | Game studio | MEDIA_ENTERTAINMENT | B3 (R2) | 1,600,000 | HIT_DRIVEN | ONLINE | WORLD | - | video_games | copy | 25 | 494 | COMPUTE 0.0005 | TW_POWER_LAW_HITS | — |
| 112 + | `podcast_network` | Podcast network | MEDIA_ENTERTAINMENT | B2 (R1) | 55,000 | HIT_DRIVEN | ONLINE | WORLD | - | podcasts | listen-k | 6 | 141 | - | TW_VIRAL_EVENTS | — |
| 113 + | `ticketing_platform` | Ticketing platform | MEDIA_ENTERTAINMENT | B4 (R3) | 12,000,000 | PLATFORM_COMMISSION | ONLINE | BLOC | - | ticketing | ticket | 2.50 | 15,873 | COMPUTE 0.0005 | TW_COMMISSION_ON_CATEGORY(spectator_sport,nightlife,esports; 0.06) | hackable |
| 114 + | `design_studio` | Design studio | MEDIA_ENTERTAINMENT | B2 (R1) | 70,000 | B2B_CONTRACT | LEASED_PREMISES | CITY | - | creative_services | project-day | 700 | 3.70 | - | TW_PLAYER_SERVICE(BRANDING; brand +2 on client) | — |
| 115 + | `ride_hail_platform` | Ride-hail platform | LOGISTICS_TRANSPORT | B4 (R3) | 18,000,000 | PLATFORM_COMMISSION | ONLINE | CITY | - | ride_hail | ride | 2.10 | 28,345 | COMPUTE 0.0003 | TW_SURGE_PRICING; TW_DATA_RICH | hackable |
| 116 + | `freight_broker` | Freight broker | LOGISTICS_TRANSPORT | B2 (R1) | 95,000 | PLATFORM_COMMISSION | ONLINE | BLOC | - | freight_brokerage | load | 140 | 8.98 | - | TW_COMMISSION_ON_CATEGORY(road_freight; 0.08) | — |
| 117 + | `warehouse_operator` | Warehouse operator | LOGISTICS_TRANSPORT | B3 (R2) | 2,200,000 | B2B_CONTRACT | SITE | CITY | - | warehousing | pallet-day | 1.40 | 29,101 | ENERGY 0.0004 | TW_COMMODITY_STORAGE(06 hubs) | — |
| 118 + | `last_mile_hub` | Last-mile hub | LOGISTICS_TRANSPORT | B3 (R2) | 1,300,000 | TRANSPORT_CAPACITY | SITE | CITY | - | parcel_delivery | parcel | 4.50 | 2,675 | fuel 0.2 l | TW_SCALES_WITH(online_retail) | — |
| 119 + | `rail_freight` | Rail freight operator | LOGISTICS_TRANSPORT | B5 (R4) | 650,000,000 | TRANSPORT_CAPACITY | SITE | BLOC | - | rail_freight | wagon-day | 900 | 1,672 | POWER 0.5 MWh | TW_BULK_COMMODITY_LINK | — |
| 120 + | `container_depot` | Container depot | LOGISTICS_TRANSPORT | B3 (R2) | 2,800,000 | B2B_CONTRACT | SITE | CITY | - | port_services | TEU-day | 18 | 2,881 | - | TW_DERIVED_DEMAND(port_terminal throughput); coastal only | — |
| 121 + | `fuel_distributor` | Fuel distributor | ENERGY | B3 (R2) | 2,400,000 | PROCESSOR | SITE | BLOC | - | fuel | l | 1.30 | 17,094 | refined_products 0.0068 bbl | TW_CRACK_PASS_THROUGH | — |
| 122 + | `ev_charging_network` | EV charging network | ENERGY | B4 (R3) | 14,000,000 | FOOTFALL_RETAIL | SITE | CITY | - | ev_charging | kWh | 0.45 | 205,761 | POWER 0.001 MWh | TW_EV_ADOPTION(16 ENERGY tech) | — |
| 123 + | `battery_storage_farm` | Battery storage farm | ENERGY | B4 (R3) | 22,000,000 | COMMODITY_PRODUCER | SITE | BLOC | - | power_storage | MWh shifted | 25 | 2,910 | POWER 1.1 MWh | TW_POWER_ARBITRAGE (charges at low hours, sells at peak) | — |
| 124 + | `hydro_plant` | Hydro plant | ENERGY | B5 (R4) | 450,000,000 | COMMODITY_PRODUCER | SITE | BLOC | - | power_output | MWh | 60 | 12,401 | - | TW_COMMODITY_OUTPUT(POWER); TW_DROUGHT_RISK | — |
| 125 + | `geothermal_plant` | Geothermal plant | ENERGY | B4 (R3) | 38,000,000 | COMMODITY_PRODUCER | SITE | BLOC | - | power_output | MWh | 60 | 2,094 | - | TW_COMMODITY_OUTPUT(POWER); TW_BASELOAD | — |
| 126 + | `gas_power_plant` | Gas power plant | ENERGY | B4 (R3) | 30,000,000 | PROCESSOR | SITE | BLOC | - | power_output | MWh | 70 | 1,984 | NATGAS 7 MMBtu | TW_SPARK_SPREAD | — |
| 127 + | `environmental_consultancy` | Environmental consultancy | SECURITY_LEGAL_INTEL | B2 (R1) | 80,000 | B2B_CONTRACT | LEASED_PREMISES | CITY | - | compliance_services | project-day | 800 | 3.70 | - | TW_PLAYER_SERVICE(PERMITS; planning risk −10%) | — |
| 128 + | `fertilizer_plant` | Fertilizer plant | MINING_AGRICULTURE | B4 (R3) | 28,000,000 | PROCESSOR | SITE | BLOC | - | fertilizer | t | 420 | 309 | NATGAS 28 MMBtu | TW_GAS_INPUT; TW_HARVEST_SEASON | — |
| 129 + | `fishery` | Fishery | MINING_AGRICULTURE | B2 (R1) | 90,000 | COMMODITY_PRODUCER | SITE | SITE | - | seafood | t | 4,200 | 0.283 | fuel 200 l | TW_SEASON; TW_WEATHER_VARIANCE; coastal only | — |
| 130 + | `vineyard` | Vineyard | MINING_AGRICULTURE | B3 (R2) | 1,400,000 | COMMODITY_PRODUCER | SITE | SITE | - | wine_cases | case | 220 | 42.1 | - | TW_HARVEST(9); TW_VINTAGE_QUALITY (feeds 14 wine items) | — |
| 131 + | `dairy` | Dairy farm | MINING_AGRICULTURE | B2 (R1) | 130,000 | COMMODITY_PRODUCER | SITE | SITE | - | dairy_products | hl | 55 | 31.3 | CORN 0.4 bu | TW_FEED_INPUT | — |
| 132 + | `timber_estate` | Timber estate | MINING_AGRICULTURE | B3 (R2) | 1,500,000 | COMMODITY_PRODUCER | SITE | SITE | - | timber_output | mbf | 500 | 19.8 | - | TW_COMMODITY_OUTPUT(LUMBER); TW_FIRE_RISK | — |
| 133 + | `quarry` | Quarry | MINING_AGRICULTURE | B3 (R2) | 1,800,000 | COMMODITY_PRODUCER | SITE | SITE | - | aggregates | t | 14 | 850 | fuel 0.8 l | TW_DERIVED_DEMAND(construction_services) | — |
| 134 + | `copper_mine` | Copper mine | MINING_AGRICULTURE | B4 (R3) | 32,000,000 | COMMODITY_PRODUCER | SITE | SITE | - | copper_output | t | 8,500 | 12.4 | - | TW_COMMODITY_OUTPUT(COPPER); TW_AISC(5200); TW_RESERVE_YEARS(18) | — |
| 135 + | `steel_mill` | Steel mill | MANUFACTURING | B5 (R4) | 550,000,000 | PROCESSOR | SITE | BLOC | - | steel | t | 720 | 1,768 | iron_ore 1.5 t; NATGAS 4 MMBtu; POWER 0.45 MWh | TW_CYCLICAL; TW_TARIFF_EXPOSED | — |
| 136 + | `cement_works` | Cement works | MANUFACTURING | B4 (R3) | 26,000,000 | PROCESSOR | SITE | BLOC | - | cement | t | 120 | 1,003 | aggregates 1.5 t; NATGAS 3 MMBtu | TW_CONSTRUCTION_CYCLE | — |
| 137 + | `chemicals_plant` | Chemicals plant | MANUFACTURING | B4 (R3) | 35,000,000 | PROCESSOR | SITE | BLOC | - | chemicals | t | 1,100 | 147 | CRUDE 2 bbl; NATGAS 10 MMBtu | TW_FEEDSTOCK_SPREAD | — |
| 138 + | `pharma_generic_maker` | Generic pharma maker | HEALTH | B4 (R3) | 33,000,000 | PROCESSOR | SITE | BLOC | - | pharma_goods | pack | 9 | 16,975 | chemicals 0.0002 t | TW_CERT(MedGrade); TW_DEFENSIVE | — |
| 139 + | `medical_device_maker` | Medical device maker | HEALTH | B4 (R3) | 24,000,000 | PROCESSOR | SITE | WORLD | - | medical_devices | device | 3,200 | 34.7 | electronics_components 6 | TW_CERT(MedGrade); TW_RECALL_EVENTS | — |
| 140 + | `dental_clinic_chain` | Dental clinic chain | HEALTH | B3 (R2) | 1,700,000 | LOCAL_SERVICE | LEASED_PREMISES | CITY | - | dental_care | visit | 160 | 153 | pharma_goods 0.05 | TW_STEADY | — |
| 141 + | `veterinary_clinic` | Veterinary clinic | HEALTH | B2 (R1) | 110,000 | LOCAL_SERVICE | LEASED_PREMISES | CITY | - | veterinary_care | visit | 90 | 35.3 | pharma_goods 0.1 | TW_STEADY | — |
| 142 + | `elder_care_home` | Elder-care home | HEALTH | B3 (R2) | 2,600,000 | SUBSCRIPTION | OWNED_PREMISES | CITY | - | elder_care | resident-day | 210 | 95.5 | packaged_food 3 | TW_REGULATED_INSPECTIONS; TW_DEFENSIVE | — |
| 143 + | `diagnostics_lab` | Diagnostics lab | HEALTH | B3 (R2) | 2,100,000 | B2B_CONTRACT | SITE | CITY | - | diagnostics | test | 45 | 864 | chemicals 0.00001 t | TW_DERIVED_DEMAND(clinic,hospital_network,dental_clinic_chain); TW_CERT(CleanLab) | — |
| 144 + | `telehealth_platform` | Telehealth platform | HEALTH | B4 (R3) | 16,000,000 | SUBSCRIPTION | ONLINE | BLOC | - | telehealth | consult | 38 | 1,624 | COMPUTE 0.001 | TW_PANDEMIC_SURGE; TW_DATA_RICH | hackable |
| 145 + | `auction_house` | Auction house | LUXURY | B4 (R3) | 20,000,000 | PLATFORM_COMMISSION | OWNED_PREMISES | WORLD | - | luxury_auctions | lot | — | — | - | TW_AUCTION_COMMISSION (consignments routed by sellers; fees per 06) | — |
| 146 + | `jewellery_maker` | Jewellery maker | LUXURY | B3 (R2) | 1,900,000 | PROCESSOR | SITE | WORLD | - | jewellery | piece | 2,400 | 7.33 | GOLD 0.4 oz; SILVER 2 oz | TW_COMMODITY_INPUT; TW_LIMITED_EDITIONS(14) | — |
| 147 + | `perfume_house` | Perfume house | LUXURY | B4 (R3) | 18,000,000 | PROCESSOR | SITE | WORLD | - | fragrance | bottle | 140 | 595 | chemicals 0.00002 t | TW_HYPE_CYCLE | — |
| 148 + | `art_gallery` | Art gallery | LUXURY | B2 (R1) | 150,000 | FOOTFALL_RETAIL | LEASED_PREMISES | CITY | - | art_sales | piece | 12,000 | 0.331 | - | TW_SELLS_LIFESTYLE(14 ART drops); TW_ARTIST_ROSTER | — |
| 149 + | `engineering_consultancy` | Engineering consultancy | MANUFACTURING | B3 (R2) | 1,600,000 | B2B_CONTRACT | LEASED_PREMISES | BLOC | - | engineering_services | project-day | 3,200 | 9.26 | - | TW_DERIVED_DEMAND(development, plants) | — |
| 150 + | `security_guarding_firm` | Security guarding firm | SECURITY_LEGAL_INTEL | B2 (R1) | 100,000 | B2B_CONTRACT | FIELD_SERVICE | CITY | - | physical_security | guard-day | 260 | 14.2 | - | TW_PLAYER_SERVICE(PHYSICAL_SECURITY; +1 grade for E5 defence on contracted sites) | — |

Counts: 150 types; tiers B1 20, B2 32, B3 42, B4 32, B5 19, B6 5; 13 sectors each with 7–17 types; 19 `beginner` types (the B1 set shown first by 18 §3.3.2); 19 `hackable` types expose a data surface to 12. Unique rows: `resort_island` (one per Isla Serena island lot, §3.5), `port_terminal` (concession per coastal city), `power_utility` (concession per city), `nuclear_plant` and `chip_fab` and `stock_exchange` (concession per bloc), `sports_franchise` (one per city, auctioned, §6.8).

**Rows dropped from 09's suggestion list** (DEFAULT): credit bureau (Ledgerline Credit Bureau is a public institution, §2.2, so a player-owned bureau would compete with a rules component); pension administrator (folded into `payroll_bureau`); forensic accountancy (folded into `forensic_audit_firm` 13 uses); wedding planner and translation agency (thin, no distinct mechanic; `event_caterer` and `design_studio` cover their demand).

### §6.4 Product categories → content/categories.json

There are 135 categories (09 notes estimated about 90; the larger number comes from giving every commodity output and every B2B service its own market, DEFAULT). Each row: the 16 consumption or B2B category it draws from (16 §2.1), the demand source, the default segment split (household categories: share of the demand pool in BUDGET / MAINSTREAM / PREMIUM; B2B categories: B2B / INSTITUTIONAL), the requirement profile for tenders (§6.7, B2B only) and the average tender size in units per game day (09 §3.9.1: half of the median reference type's daily capacity at 75% utilisation). Input-output coefficients for BUSINESS_DERIVED demand are the `TW_DERIVED_DEMAND` lists in §6.3 plus the input lines of the buying types (09 computes derived demand from them).

| Category id | Name | Draws from (16) | Demand source | Segment split | Requirement profile | Avg tender (units/day) | Types |
|---|---|---|---|---|---|---|---|
| `accounting_services` | Accounting services | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 32.9 | accounting_firm |
| `aerial_services` | Aerial services | B2B:DATA | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 25.6 | drone_services |
| `aggregates` | Aggregates | COMMODITY (06 line) | COMMODITY_MARKET | single (B2B) | — | — | quarry |
| `ai_lab` | AI lab | — (07/08/11 own the economics) | — | — | — | — | ai_lab |
| `air_travel` | Air travel | HH:TRANSPORT | HOUSEHOLD + TOURISM | 0.35 / 0.50 / 0.15 | — | — | airline |
| `alt_data` | Alt data | B2B:DATA | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 1,736,111 | satellite_data_provider |
| `art_sales` | Art sales | HH:LUXURY | HOUSEHOLD | 0 / 0.30 / 0.70 | — | — | art_gallery |
| `automation_projects` | Automation projects | B2B:IT_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 52.1 | robotics_integrator |
| `baked_goods` | Baked goods | HH:FOOD_BEV | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | bakery |
| `banking` | Banking | — (07/08/11 own the economics) | — | — | — | — | bank |
| `bike_service` | Bike service | HH:RETAIL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | bike_repair |
| `books` | Books | HH:RETAIL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | bookshop |
| `building_cleaning` | Building cleaning | B2B:MAINTENANCE | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 15.9 | cleaning_service |
| `business_software` | Business software | B2B:IT_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 94,697 | saas_company |
| `car_care` | Car care | HH:RETAIL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | car_wash |
| `car_sales` | Car sales | HH:LUXURY | HOUSEHOLD | 0 / 0.30 / 0.70 | — | — | car_dealership |
| `card_payments` | Card payments | HH:FINANCIAL | FLOW_TAKE | 0.25 / 0.50 / 0.25 | — | — | payments_processor |
| `cars` | Cars | B2B:MAINTENANCE | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 548 | ev_auto_factory |
| `catering` | Catering | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 215 | event_caterer |
| `cement` | Cement | B2B:MAINTENANCE | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 9,028 | cement_works |
| `chemicals` | Chemicals | B2B:MAINTENANCE | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 1,326 | chemicals_plant |
| `chip_designs` | Chip designs | B2B:IT_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 162 | semiconductor_design_house |
| `chips` | Chips | B2B:MAINTENANCE | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 2,352,941 | chip_fab |
| `coffee_to_go` | Coffee to go | HH:FOOD_BEV | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | coffee_cart, cafe |
| `cold_freight` | Cold freight | B2B:COLD_CHAIN | BUSINESS_DERIVED | B2B 0.50 / INST 0.50 | CERTIFIED_LED | 66.7 | cold_chain_transporter |
| `cold_storage` | Cold storage | B2B:COLD_CHAIN | BUSINESS_DERIVED | B2B 0.50 / INST 0.50 | CERTIFIED_LED | 7,143 | refrigerated_storage |
| `compliance_services` | Compliance services | B2B:LEGAL | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 13.9 | environmental_consultancy |
| `compute_capacity` | Compute capacity | B2B:COMPUTE | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 124,007,937 | data_center, cloud_provider |
| `construction_services` | Construction services | B2B:CONSTRUCTION | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 26.7 | construction_company |
| `cooling_service` | Cooling service | B2B:MAINTENANCE | BUSINESS_DERIVED | B2B 0.50 / INST 0.50 | CERTIFIED_LED | 240 | efficient_cooling_contractor |
| `copper_output` | Copper output | COMMODITY (06 line) | COMMODITY_MARKET | single (B2B) | — | — | copper_mine |
| `creative_services` | Creative services | B2B:MARKETING | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 13.9 | design_studio |
| `crude_output` | Crude output | COMMODITY (06 line) | COMMODITY_MARKET | single (B2B) | — | — | oil_well |
| `cyber_defence` | Cyber defence | B2B:SECURITY | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 116 | cybersecurity_firm |
| `dairy_products` | Dairy products | COMMODITY (06 line) | COMMODITY_MARKET | single (B2B) | — | — | dairy |
| `data_sales` | Data sales | B2B:DATA | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 104,167 | data_broker, regional_data_supplier |
| `dental_care` | Dental care | HH:HEALTH | HOUSEHOLD | 0.25 / 0.50 / 0.25 | — | — | dental_clinic_chain |
| `design_services` | Design services | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 32.1 | architecture_firm |
| `development_projects` | Development projects | B2B:CONSTRUCTION | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 336 | real_estate_developer |
| `device_repair` | Device repair | HH:RETAIL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | phone_repair_kiosk |
| `diagnostics` | Diagnostics | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.50 / INST 0.50 | CERTIFIED_LED | 3,241 | diagnostics_lab |
| `dining_out` | Dining out | HH:FOOD_BEV | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | restaurant, restaurant_chain |
| `drinks_to_go` | Drinks to go | HH:FOOD_BEV | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | bubble_tea_stall |
| `drug_pipeline` | Drug pipeline | HH:HEALTH | HOUSEHOLD + GOVERNMENT | 0.25 / 0.50 / 0.25 | — | — | biotech_lab |
| `elder_care` | Elder care | HH:HEALTH | HOUSEHOLD + GOVERNMENT | 0.25 / 0.50 / 0.25 | — | — | elder_care_home |
| `electronics_components` | Electronics components | B2B:MAINTENANCE | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 2,083 | electronics_assembly |
| `engineering_services` | Engineering services | B2B:CONSTRUCTION | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 34.7 | engineering_consultancy |
| `esports` | Esports | HH:ENTERTAINMENT | HOUSEHOLD | 0.25 / 0.50 / 0.25 | — | — | esports_team |
| `ev_charging` | EV charging | HH:UTILITIES | HOUSEHOLD | 0.25 / 0.50 / 0.25 | — | — | ev_charging_network |
| `exchange_fees` | Exchange fees | HH:FINANCIAL | FLOW_TAKE | 0.25 / 0.50 / 0.25 | — | — | stock_exchange |
| `fashion` | Fashion | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 17,361 | fashion_house |
| `fertilizer` | Fertilizer | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 2,778 | fertilizer_plant |
| `fitness` | Fitness | HH:RETAIL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | gym |
| `flexible_office` | Flexible office | HH:HOUSING | HOUSEHOLD | 0.25 / 0.50 / 0.25 | — | — | coworking_operator |
| `flowers` | Flowers | HH:RETAIL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | florist |
| `food_delivery` | Food delivery | HH:FOOD_BEV | FLOW_TAKE | 0.25 / 0.50 / 0.25 | — | — | food_delivery_app |
| `fragrance` | Fragrance | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 5,357 | perfume_house |
| `freight_brokerage` | Freight brokerage | HH:TRANSPORT | FLOW_TAKE | 0.35 / 0.50 / 0.15 | — | — | freight_broker |
| `fuel` | Fuel | B2B:ENERGY | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 153,846 | fuel_distributor |
| `fund_management` | Fund management | — (07/08/11 own the economics) | — | — | — | — | hedge_fund |
| `furniture` | Furniture | B2B:MAINTENANCE | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 25.6 | furniture_workshop |
| `fx_retail` | FX retail | HH:FINANCIAL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | currency_exchange_booth |
| `gold_output` | Gold output | COMMODITY (06 line) | COMMODITY_MARKET | single (B2B) | — | — | gold_mine |
| `grain_output` | Grain output | COMMODITY (06 line) | COMMODITY_MARKET | single (B2B) | — | — | family_farm |
| `grid_supply` | Grid supply | B2B:ENERGY | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 588,235 | power_utility |
| `groceries` | Groceries | HH:RETAIL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | convenience_store, supermarket, supermarket_chain |
| `hospital_care` | Hospital care | HH:HEALTH | HOUSEHOLD + GOVERNMENT | 0.25 / 0.50 / 0.25 | — | — | hospital_network |
| `hotel_nights` | Hotel nights | HH:FOOD_BEV | TOURISM | 0.25 / 0.50 / 0.25 | — | — | boutique_hotel, hotel_chain |
| `insurance` | Insurance | — (07/08/11 own the economics) | — | — | — | — | insurance_company |
| `investigations` | Investigations | B2B:LEGAL | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 96.5 | private_intelligence_firm |
| `it_support` | IT support | B2B:IT_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 13.6 | it_support_shop |
| `jewellery` | Jewellery | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 66.0 | jewellery_maker |
| `laundry` | Laundry | HH:RETAIL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | laundromat |
| `legal_services` | Legal services | B2B:LEGAL | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 43.4 | law_firm |
| `lithium_output` | Lithium output | COMMODITY (06 line) | COMMODITY_MARKET | single (B2B) | — | — | lithium_mine |
| `luxury_auctions` | Luxury auctions | HH:LUXURY | FLOW_TAKE | 0 / 0.30 / 0.70 | — | — | auction_house |
| `luxury_resort` | Luxury resort | HH:FOOD_BEV | TOURISM | 0.25 / 0.50 / 0.25 | — | — | resort_island |
| `luxury_watches` | Luxury watches | HH:LUXURY | HOUSEHOLD | 0 / 0.30 / 0.70 | — | — | watch_boutique |
| `maintenance_service` | Maintenance service | B2B:MAINTENANCE | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 12.7 | industrial_equipment_repair |
| `managed_it` | Managed it | B2B:IT_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 40,323 | cloud_msp |
| `marketing_services` | Marketing services | B2B:MARKETING | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 18.5 | marketing_agency |
| `medical_devices` | Medical devices | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.50 / INST 0.50 | CERTIFIED_LED | 313 | medical_device_maker |
| `medical_logistics` | Medical logistics | B2B:COLD_CHAIN | BUSINESS_DERIVED | B2B 0.50 / INST 0.50 | CERTIFIED_LED | 61.2 | medical_courier |
| `mobile_apps` | Mobile apps | HH:TECH | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | mobile_app_studio |
| `news_subscriptions` | News subscriptions | HH:ENTERTAINMENT | HOUSEHOLD | 0.25 / 0.50 / 0.25 | — | — | news_outlet |
| `nightlife` | Nightlife | HH:ENTERTAINMENT | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | nightclub |
| `online_retail` | Online retail | HH:RETAIL | FLOW_TAKE | 0.25 / 0.50 / 0.25 | — | — | ecommerce_marketplace |
| `online_video` | Online video | HH:ENTERTAINMENT | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | content_channel |
| `parcel_delivery` | Parcel delivery | HH:TRANSPORT | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | courier_bikes, last_mile_hub |
| `parking` | Parking | HH:HOUSING | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | parking_operator |
| `payroll_services` | Payroll services | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 33,730 | payroll_bureau |
| `personal_care` | Personal care | HH:RETAIL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | barber |
| `pet_care` | Pet care | HH:RETAIL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | pet_groomer |
| `pharma_goods` | Pharma goods | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.50 / INST 0.50 | CERTIFIED_LED | 152,778 | pharma_generic_maker |
| `pharmacy_retail` | Pharmacy retail | HH:HEALTH | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | pharmacy |
| `physical_security` | Physical security | B2B:SECURITY | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 53.4 | security_guarding_firm |
| `podcasts` | Podcasts | HH:ENTERTAINMENT | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | podcast_network |
| `port_services` | Port services | B2B:LOGISTICS | BUSINESS_DERIVED | B2B 0.50 / INST 0.50 | CERTIFIED_LED | 10,802 | port_maintenance_firm, container_depot |
| `port_throughput` | Port throughput | HH:TRANSPORT | FLOW_TAKE | 0.25 / 0.50 / 0.25 | — | — | port_terminal |
| `power_output` | Power output | B2B:ENERGY | COMMODITY_MARKET | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 18,849 | solar_farm, wind_farm, nuclear_plant, hydro_plant, geothermal_plant, gas_power_plant |
| `power_storage` | Power storage | B2B:ENERGY | COMMODITY_MARKET | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 26,190 | battery_storage_farm |
| `primary_care` | Primary care | HH:HEALTH | HOUSEHOLD + GOVERNMENT | 0.25 / 0.50 / 0.25 | — | — | clinic |
| `printing` | Printing | B2B:MARKETING | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 19.6 | print_shop |
| `property_management` | Property management | B2B:CONSTRUCTION | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 13,889 | property_management_agency |
| `rail_freight` | Rail freight | B2B:LOGISTICS | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 15,046 | rail_freight |
| `rare_earth_output` | Rare earth output | COMMODITY (06 line) | COMMODITY_MARKET | single (B2B) | — | — | rare_earth_mine |
| `recorded_music` | Recorded music | HH:ENTERTAINMENT | HOUSEHOLD | 0.25 / 0.50 / 0.25 | — | — | record_label |
| `recruitment` | Recruitment | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 2.31 | recruitment_agency |
| `refined_products` | Refined products | B2B:ENERGY | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 131,579 | refinery |
| `removals` | Removals | HH:TRANSPORT | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | moving_company |
| `retail_brokerage` | Retail brokerage | HH:FINANCIAL | FLOW_TAKE | 0.25 / 0.50 / 0.25 | — | — | brokerage |
| `ride_hail` | Ride hail | HH:TRANSPORT | FLOW_TAKE | 0.25 / 0.50 / 0.25 | — | — | ride_hail_platform |
| `road_freight` | Road freight | B2B:LOGISTICS | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 114 | trucking_fleet |
| `sea_freight` | Sea freight | B2B:LOGISTICS | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 10,417 | shipping_line |
| `seafood` | Seafood | COMMODITY (06 line) | COMMODITY_MARKET | single (B2B) | — | — | fishery |
| `sneakers` | Sneakers | HH:RETAIL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | sneaker_resale |
| `social_ads` | Social ads | B2B:MARKETING | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 3,906,250 | social_network |
| `softs_output` | Softs output | COMMODITY (06 line) | COMMODITY_MARKET | single (B2B) | — | — | coffee_cocoa_plantation |
| `software_projects` | Software projects | B2B:IT_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 65.8 | freelance_dev_studio, it_consultancy |
| `solar_installs` | Solar installs | B2B:CONSTRUCTION | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 1.17 | rooftop_solar_installer |
| `spectator_sport` | Spectator sport | HH:ENTERTAINMENT | HOUSEHOLD | 0.25 / 0.50 / 0.25 | — | — | sports_franchise |
| `steel` | Steel | B2B:MAINTENANCE | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 15,914 | steel_mill |
| `streaming_subscriptions` | Streaming subscriptions | HH:ENTERTAINMENT | HOUSEHOLD | 0.25 / 0.50 / 0.25 | — | — | streaming_studio |
| `street_food` | Street food | HH:FOOD_BEV | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | food_truck |
| `telehealth` | Telehealth | HH:HEALTH | HOUSEHOLD | 0.25 / 0.50 / 0.25 | — | — | telehealth_platform |
| `ticketing` | Ticketing | HH:ENTERTAINMENT | FLOW_TAKE | 0.25 / 0.50 / 0.25 | — | — | ticketing_platform |
| `timber_output` | Timber output | COMMODITY (06 line) | COMMODITY_MARKET | single (B2B) | — | — | timber_estate |
| `tutoring` | Tutoring | HH:RETAIL | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | tutoring_centre |
| `veterinary_care` | Veterinary care | HH:HEALTH | HOUSEHOLD | 0.35 / 0.50 / 0.15 | — | — | veterinary_clinic |
| `video_games` | Video games | HH:ENTERTAINMENT | HOUSEHOLD | 0.25 / 0.50 / 0.25 | — | — | game_studio |
| `warehousing` | Warehousing | B2B:LOGISTICS | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | RELIABILITY_LED | 109,127 | warehouse_operator |
| `watches` | Watches | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 288 | watch_manufacture |
| `wealth_management` | Wealth management | HH:FINANCIAL | HOUSEHOLD | 0.25 / 0.50 / 0.25 | — | — | asset_management_boutique |
| `wine_cases` | Wine cases | COMMODITY (06 line) | COMMODITY_MARKET | single (B2B) | — | — | vineyard |
| `yachts` | Yachts | B2B:BUSINESS_SERVICES | BUSINESS_DERIVED | B2B 0.75 / INST 0.25 | PRICE_LED | 1.39 | yacht_builder |

Income-level shift (16 §3.2.3): per +25% city wage index, household categories in `HH:LUXURY` gain 0.02 of the city's FOOD_BEV pool; PREMIUM segment share +0.03 and BUDGET −0.03. Era shifts (16 §3.10.3) are in §10.12.

### §6.5 Intermediate goods → content/intermediate_goods.json

Intermediate goods are lower-case input codes. Each has a unit, a reference price at launch (FDL), the catalog types that make it, and an NPC fallback supplier (the bloc firm sector `frm` sells at `refPrice × 1.15` when player and named NPC supply is short, a SINK on the player boundary, 16 §3.2.5).

| Code | Name | Unit | refPrice | Made by (types) | NPC fallback |
|---|---|---|---|---|---|
| `roasted_coffee` | Roasted coffee | lb | 9 | coffee_roaster | yes |
| `packaged_food` | Packaged food | basket-equivalent | 9.5 | food_processor, bakery | yes |
| `furniture` | Furniture | piece | 420 | furniture_maker | yes |
| `electronics_components` | Electronics components | kit | 38 | electronics_assembler | yes |
| `chips` | Chips | wafer-lot | 2400 | chip_fab, semiconductor_design_house (designs only) | yes, at ×1.30 during a chip shortage (11 §3.3.4) |
| `cars` | Cars | vehicle | 31000 | ev_auto_factory | yes |
| `refined_products` | Refined products | bbl | 95 | refinery | yes |
| `fuel` | Fuel (wholesale) | l | 0.66 | fuel_distributor | yes |
| `construction_services` | Construction services | crew-day | 1800 | construction_company, real_estate_developer | yes |
| `aggregates` | Aggregates | t | 14 | quarry | yes |
| `cement` | Cement | t | 120 | cement_works | yes |
| `steel` | Steel | t | 720 | steel_mill | yes |
| `iron_ore` | Iron ore | t | 105 | — (NPC miners only at launch; a player iron mine is a later catalog row) | yes |
| `chemicals` | Chemicals | t | 900 | chemicals_plant | yes |
| `fertilizer` | Fertilizer | t | 450 | fertilizer_plant | yes |
| `pharma_goods` | Pharma goods | pack | 6 | pharma_generic_maker | yes, MedGrade only |
| `paper` | Paper | t | 850 | — (NPC: Pacific Paper and Pulp and others) | yes |
| `textiles` | Textiles | bolt | 60 | — (NPC textile mills) | yes |
| `watches` | Watch movements | movement | 900 | watch_manufacture | yes |
| `freight` | Freight | t-km block (1,000 t·km) | 45 | trucking_company, shipping_line, rail_freight, freight_broker | yes |
| `cold_storage` | Cold storage | pallet-day | 1.6 | refrigerated_storage | yes, not ColdChain-certified |
| `maintenance_service` | Maintenance service | technician-hour | 85 | industrial_repair_firm, port_maintenance_firm | yes |
| `cooling_service` | Cooling service | MW-day of cooling | 140 | efficient_cooling_contractor | yes |
| `software_licenses` | Software licences | seat-month | 45 | saas_company, freelance_dev_studio | yes |
| `compute_hours` | Compute | GPUh | COMPUTE line | data_center, cloud_provider | via 06 COMPUTE market |

### §6.6 Certifications → content/certifications.json

`Certification` (09 §2.2). Cost is paid at the start of prep (SINK `BIZ_CERT_FEE`); during prep the business runs normally; an audit failure suspends the cert for its remaining validity and bars re-application for 28 game days. DEFAULT values.

| certId | Name | Cost (FDL, ×price level) | Prep (game days) | Validity (game days) | Audit prob. per quarter | Requirements | Required by tenders in |
|---|---|---|---|---|---|---|---|
| cert_medgrade | MedGrade | 60,000 | 14 | 364 | 0.15 | quality level ≥ 2, condition ≥ 80, 1 compliance staff | pharma_goods, medical_devices, medical_logistics, diagnostics |
| cert_coldchain | ColdChain Assured | 35,000 | 10 | 364 | 0.12 | condition ≥ 75, refrigeration upgrade level ≥ 1 | cold_freight, cold_storage, medical_logistics |
| cert_securevault | SecureVault | 80,000 | 14 | 364 | 0.1 | quality level ≥ 2, 1 compliance staff, defense monitoring level ≥ 2 (12) | physical_security, data_sales, managed_it, wealth_management |
| cert_qualitymark | QualityMark | 20,000 | 7 | 364 | 0.08 | quality level ≥ 1, condition ≥ 70 | any B2B category (adds +0.3 to the CERTIFIED promise term) |
| cert_gridsafe | GridSafe | 90,000 | 21 | 364 | 0.12 | quality level ≥ 2, 1 compliance staff | cooling_service, grid_supply, solar_installs, power_storage |
| cert_portsafe | PortSafe | 75,000 | 21 | 364 | 0.12 | condition ≥ 80, coastal city | port_services, sea_freight, warehousing (port districts) |
| cert_cleanlab | CleanLab | 55,000 | 14 | 364 | 0.15 | quality level ≥ 2, condition ≥ 85 | diagnostics, drug_pipeline |
| cert_fincompliance | FinCompliance | 120,000 | 28 | 364 | 0.2 | 2 compliance staff, no S3+ conviction in the chapter (13) | payroll_services, accounting_services, card_payments, compliance_services, fund_management |

### §6.7 Requirement profiles → content/requirement_profiles.json

Weights `w_p / w_r / w_rep / w_q / w_inc` of 09 §3.9.3 and the requirement draws for each tender (09 §3.9.1). Each B2B category in §6.4 names its profile.

| Profile | Weights | minReliability draw | Certification required | maxResponseHours draw | Confidentiality required | Penalty (% of contract value per breach day) |
|---|---|---|---|---|---|---|
| PRICE_LED | 0.6 / 0.2 / 0.1 / 0.1 / 0.2 | U(0.80, 0.90) | p 0.1 (QualityMark) | {48, 72} | p 0.05 | 0.5% |
| RELIABILITY_LED | 0.3 / 0.4 / 0.1 / 0.2 / 0.3 | U(0.90, 0.97) | p 0.3 (the category's cert, else QualityMark) | {6, 12, 24} | p 0.15 | 1.0% |
| CERTIFIED_LED | 0.3 / 0.3 / 0.2 / 0.2 / 0.3 | U(0.92, 0.98) | p 1.0 (the category's cert, §6.6) | {4, 12, 24} | p 0.30 | 1.5% |

### §6.8 Concessions, unique sites and trophies → content/concessions.json

Slots per 09 §3.8.3. Concessions are re-auctioned at every chapter boundary; build time = setup days of §6.3 (a winner who already owns the asset keeps operating). Coastal cities are those marked `yes` in the Coastal column of §3.1: Port Avalon, Meridia, Kaiyo City, Tessan, Nordhaven City, Skarvik, Sundara Coast, Cobreval (Isla Serena has marinas only and no port terminal). Slot ids: `con_<type>_<cityId|blocId>`.

| Concession type | Scope | Slots at launch | Reserve bid (FDL per chapter) | Build or setup (game days) | Rank gate |
|---|---|---|---|---|---|
| power_utility | per city | 16 (one per launch city including Isla Serena) | 2% of c0 = 100,000,000 | 91 | R5 |
| port_terminal | per coastal city | 8 | 2% of c0 = 10,000,000 | 14 | R4 |
| stock_exchange | per bloc | 5 (operates that bloc's listing exchange, §1.2) | 300,000,000 | 56 | R5 + CH_EXCHANGE_MEMBER |
| chip_fab | per bloc | 5 | 400,000,000 | 182 | R5 |
| nuclear_plant | per bloc | 5 | 240,000,000 | 182 | R5 |

**Sports franchises (generator `sports`, one per city, 15 at launch, Isla Serena excluded).** Unique B6 `sports_franchise`, auctioned (reserve 3,000,000,000 FDL × the city's `rentMult`). Sport by bloc (DEFAULT): FDL gridiron, EUN football, PYN baseball, NKR ice hockey, SRL football. Names (EN = FR, proper names): 

| franchiseId | City | Name | Sport | Home ground |
|---|---|---|---|---|
| `spf_port_avalon` | Port Avalon | Port Avalon Mariners | gridiron | Crescent Field |
| `spf_lakemont` | Lakemont | Lakemont Lumberjacks | gridiron | Bluff Park |
| `spf_redmesa` | Redmesa | Redmesa Scorpions | gridiron | Saguaro Dome |
| `spf_meridia` | Meridia | Meridia FC | football | Stadio Laguna |
| `spf_valcourt` | Valcourt | Valcourt Athletic | football | Parc des Ateliers |
| `spf_belmara` | Belmara | Belmara United | football | Arena Belmara |
| `spf_kaiyo` | Kaiyo City | Kaiyo Thunderbirds | baseball | Harborlight Stadium |
| `spf_tessan` | Tessan | Tessan Cranes | baseball | Delta Field |
| `spf_mirako` | Mirako | Mirako Comets | baseball | Maple Slopes Park |
| `spf_nordhaven` | Nordhaven City | Nordhaven Wolves | ice hockey | Fjordhallen |
| `spf_skarvik` | Skarvik | Skarvik Ravens | ice hockey | Offshore Arena |
| `spf_vintra` | Vintra | Vintra Turbines | ice hockey | Spruce Ridge Rink |
| `spf_cobreval` | Cobreval | Club Atlético Cobreval | football | Estadio del Cobre |
| `spf_alta_verde` | Alta Verde | Alta Verde Jaguares | football | Estadio Selva |
| `spf_sundara` | Sundara Coast | Sundara Coast Marlins | football | Estadio Brisa |

New-city franchise name: `<City> <mascot>` with mascots drawn from the bloc list (FDL Hawks, Stallions, Pioneers, Rangers; EUN Athletic, United, Sporting, Racing (prefix form `<Racing> <City>`); PYN Dragons, Swallows, Herons, Tigers; NKR Bears, Lynx, Vikings, Eagles; SRL Cóndores, Pumas, Toros, Delfines), stream `rng('content/sports/<cityId>', worldSeed)`. If the city list in §3.1 changes, this table follows it.

### §6.9 NPC private firms (generator `npc_firm`) → generated at world creation and at each city opening

`PARAM.npc_private_firms_per_city = 40` (09 §6). Stream `rng('content/npc_firm/<cityId>', worldSeed)`. 16 creates the founder as a BACKGROUND private-firm owner actor (§10.1) for 19 of the 40 per city opened after launch; at launch all 40 founders are generated here and only those with `focus` change become actors (16 §3.3.7).

1. **Type mix.** Draw 40 catalog types (with replacement) from the B1–B4 rows of §6.3 that are allowed in the city (coastal-only types need a coastline), with weight `= 1 / tierIndex² × (1.8 if the type's sector is a bloc tilt sector else 1) × cityAffinity` (mining and farm SITE types ×2 in cities whose §3.2 personality lists a matching resource; tourism ×2 in resort cities). Cap 4 firms per type per city.
2. **Size.** Capacity = the type's `capacityPerHour0 × LogNormal(0, 0.5)` clamped to [0.3, 4]×; quality level `floor(U(0, 3))`; price = `refPrice × U(0.92, 1.10)`; markets 1 (p 0.6), 2 (0.3), 3 (0.1) (extra markets are neighbouring districts or the same category in a neighbouring segment).
3. **Founder.** Name from §0.4 pools of the city's bloc; age `U(28, 68)`; `founderIndependence ~ Beta(2, 3) × 0.9` (09 W04); goal mix: INDEPENDENCE p 0.35, GROW_SHARE p 0.40, PROTECT_CONTROL (family firm) p 0.25; 15% of firms are dynasty-held (2–6 per dynasty, §10.4) and take PROTECT_CONTROL.
4. **Name grammar** by weights: 0.30 `<Family> & <Noun>` (e.g. "Barlow & Daughters"), 0.25 `<Street or district root> <category noun>` ("Crescent Roasters"), 0.20 `<Family>'s <category noun>` ("Okafor's Bakery"), 0.15 bloc-native form (EUN `<Noun> <Family>` "Boulangerie Lenoir", SRL `<Noun> <Family>` "Panadería Ríos", PYN `<Family> <Noun>` "Hamada Shoten", NKR `<Family>s <Noun>` "Bergs Bakeri"), 0.10 invented root + noun (§4.1.1 roots). Category nouns come from `categoryNoun[category]` = the last word of the category's display name, with these overrides: coffee_to_go Roasters/Coffee, dining_out Kitchen/Bistro, groceries Market/Grocers, device_repair Fix/Repairs, it_support IT, software_projects Code/Labs, legal_services Law/Legal, physical_security Guard/Security, road_freight Haulage/Transport, warehousing Storage/Depot. Uniqueness within the city; moderation per §0.2.
5. **Balance sheet.** Equity = `0.6 × c0 × size`; debt = `0.4 × c0 × size` from the city's default retail NPC bank (07); cash = 28 game days of fixed costs.
6. **Acquisition mapping** (09 §6 `biz.ma.approachPrivate`): a firm converts into units of its own catalog type at `level = round(log2(capacity / capacityPerHour0))` clamped [0, 5], quality level kept.

### §6.10 Twist catalog → content/twists.json

Twist ids in §6.3 name 09's twist hooks (09 §3.10). Parameters in parentheses in the row are the twist's arguments. Grouped by mechanic; every id used in §6.3 is listed exactly once.

- **Input and cost exposure**: `TW_COMMODITY_INPUT`, `TW_ENERGY_INPUT`, `TW_FUEL_INPUT`, `TW_GAS_INPUT`, `TW_FEED_INPUT`, `TW_CHIP_INPUT`, `TW_HEATWAVE_COST`, `TW_LIFTING_COST`, `TW_INFLATION_PASSTHROUGH`, `TW_CRACK_SPREAD`, `TW_CRACK_PASS_THROUGH`, `TW_SPARK_SPREAD`, `TW_FEEDSTOCK_SPREAD`, `TW_FREIGHT_RATE`, `TW_TARIFF_EXPOSED`, `TW_BUYS_FROM_FACTORIES`, `TW_PERISHABLE_STOCK`.
- **Output and commodity link**: `TW_COMMODITY_OUTPUT`, `TW_COMMODITY_STORAGE`, `TW_RESERVE_YEARS`, `TW_BULK_COMMODITY_LINK`, `TW_BASELOAD`, `TW_DAYLIGHT_PROFILE`, `TW_POWER_ARBITRAGE`, `TW_HARVEST`, `TW_HARVEST_SEASON`, `TW_VINTAGE_QUALITY`, `TW_SELLS_COMPUTE`, `TW_SELLS_TO_DATACENTERS`, `TW_SELLS_TO_DEALERSHIPS`, `TW_SUPPLY_OWN_DATACENTERS`, `TW_STRATEGIC_SUPPLY`, `TW_VERTICAL_LINK`, `TW_AISC`.
- **Demand shape**: `TW_DERIVED_DEMAND`, `TW_DEMAND_FROM_PLAYER_PROPERTIES`, `TW_DOWNTOWN_DEMAND`, `TW_TOURIST_FLOW`, `TW_FESTIVAL_BOOST`, `TW_GIFT_DAY_PEAKS`, `TW_JANUARY_SURGE`, `TW_MORNING_PEAK`, `TW_NIGHT_HOURS`, `TW_SCHOOL_TERMS`, `TW_SEASON`, `TW_SUMMER_PEAK`, `TW_WEATHER_SEASON`, `TW_WEATHER_VARIANCE`, `TW_PANDEMIC_SURGE`, `TW_EV_ADOPTION`, `TW_HIRING_CYCLE`, `TW_HOUSING_CYCLE`, `TW_CONSTRUCTION_CYCLE`, `TW_CYCLICAL`, `TW_DEFENSIVE`, `TW_RECESSION_SENSITIVE`, `TW_STEADY`, `TW_LOW_VARIANCE`, `TW_LOW_CHURN`, `TW_LITIGIOUS_WORLD`, `TW_HACK_RATE`, `TW_SURGE_PRICING`, `TW_SCALES_WITH`.
- **Platform and flow take**: `TW_COMMISSION_ON_CATEGORY`, `TW_COMMISSION_ON_SECTOR`, `TW_TRADE_VOLUME_FEE`, `TW_CAPPED_EXCHANGE_FEE`, `TW_AUCTION_COMMISSION`, `TW_NPC_FLOW_ONLY`, `TW_DATA_TRADE`, `TW_ALT_DATA_FEED`.
- **Hits, hype and trials**: `TW_POWER_LAW_HITS`, `TW_CONTENT_SLATE`, `TW_HYPE_CYCLE`, `TW_TREND_HYPE`, `TW_VIRAL_EVENTS`, `TW_DROP_FLIP`, `TW_LIMITED_EDITIONS`, `TW_CRITIC_REVIEW`, `TW_SEASONAL_PRIZES`, `TW_TRIAL`, `TW_IPO_ON_WIN`, `TW_DESIGN_ROYALTY`, `TW_ARTIST_ROSTER`, `TW_SELLS_LIFESTYLE`, `TW_ORDER_BOOK`, `TW_STATUS_VENUE`, `TW_TROPHY_PRESTIGE`, `TW_AUCTION_ONLY`.
- **Location and operations**: `TW_MOVE_DISTRICT_DAILY`, `TW_CLUSTER_BONUS`, `TW_EXPANSION_NATIVE`, `TW_NEEDS_HOTEL_PROPERTY`, `TW_NEEDS_OFFICE_PROPERTY`, `TW_LONG_BUILD`, `TW_CONTRACT_DELAYS`, `TW_QUALITY_ONLY_UPGRADES`, `TW_AUTOMATION_TECH`, `TW_RESPONSE_TIME_TENDERS`, `TW_DEVELOPER`, `TW_FIRE_RISK`, `TW_DROUGHT_RISK`, `TW_EMBARGO_EVENTS`, `TW_RECALL_EVENTS`, `TW_REGULATORY_EVENTS`, `TW_REGULATED_INSPECTIONS`, `TW_DATA_LEAK_EVENTS`.
- **Regulation and money**: `TW_CONCESSION`, `TW_REGULATED_RETURN`, `TW_POLICY_SUBSIDY`, `TW_RATE_SENSITIVE_VALUATION`, `TW_CERT`, `TW_LEGAL_PROVENANCE`, `TW_MANIPULATION_CHECK`, `TW_FENCING_ILLEGAL`, `TW_BECOMES_BANK`, `TW_BECOMES_INSURER`, `TW_BECOMES_FUND_MANAGER`, `TW_MAY_SPONSOR_FUND`, `TW_CREATES_LAB`, `TW_DATA_RICH`.
- **Player services and intelligence**: `TW_PLAYER_SERVICE`, `TW_PUBLISHES_STORIES`, `TW_FORENSICS`, `TW_PATH_TO_SECURITY`, `TW_NONE`.
- **Other**: `TW_PHARMA_CONTRACTS`.

127 twist ids. The loader fails on a twist id in a row that has no hook in 09.

### §6.11 Startup generator (generator `startup`, 09 §3.12.4)

Weekly per bloc `PARAM.startups_per_week` startups. Stream `rng('content/startup/<blocId>/<week>', worldSeed)`.
1. **Category**: drawn from product-based categories of B3–B5 types in TECH_AI 0.30, HEALTH 0.20, MEDIA_ENTERTAINMENT 0.15, RETAIL_CONSUMER 0.10, ENERGY 0.10, LOGISTICS_TRANSPORT 0.08, FINANCE 0.07 (FINANCE excludes chartered types).
2. **Founders**: 1 (p 0.4), 2 (0.45), 3 (0.15) from §0.4 pools; team score `U(0.2, 0.9)`; market score `U(0.1, 0.9)`.
3. **Name**: 0.4 invented root (§4.1.1) + optional tech suffix {ly, io, ra, ix, a, hub, works}; 0.3 `<Noun><Noun>` compound from {Bright, Quick, Clear, Deep, Open, Kind, True, Swift, Bold, Calm} × {Path, Loop, Leaf, Stack, Wave, Field, Nest, Port, Beam, Mint}; 0.3 bloc-native (EUN Italian/French noun, PYN 2-syllable romanised word, NKR Nordic noun, SRL Spanish noun). Must not equal any listed or private firm name.
4. **Pitch template** (string `startup.pitch.<n>`, slots {name, category, city, metric}): 12 templates, e.g. "{name} wants to make {category} in {city} twice as fast"; "{name} turns idle {metric} into revenue"; "{name} builds the back office for every {category} business"; "{name} brings premium {category} to people who never had it"; "{name}: one app for {category}, no waiting"; "{name} sells {category} data to the firms that need it"; "{name} automates the slowest step in {category}"; "{name} is the {category} platform for small owners"; "{name} lowers the energy bill of {category}"; "{name} makes {category} safe enough for hospitals"; "{name} ships {category} across the bloc overnight"; "{name} turns {category} into a subscription".
5. **Numbers**: burn per game day `= LogNormal(ln 4,000, 0.6)` FDL; round size `= burn × U(180, 360)`; pre-money per 09 venture rule.

### §6.12 Staff pools → content/staff.json

Manager and key-staff names come from §0.4 pools of the business's city bloc (stream `rng('content/staff/<bizId>', worldSeed)`). Key-staff archetypes (09 `StaffRole` key roles) and their display titles:

| Key role | Title (EN) | Used by sectors | Skill draw | Wage multiple of bloc median |
|---|---|---|---|---|
| HEAD_CHEF | Head chef | FOOD_HOSPITALITY | U(40, 85) | 1.6 |
| STORE_MANAGER | Store manager | RETAIL_CONSUMER, LUXURY | U(35, 80) | 1.4 |
| LEAD_ENGINEER | Lead engineer | TECH_AI, MANUFACTURING, ENERGY | U(45, 90) | 2.4 |
| HEAD_OF_RESEARCH | Head of research | HEALTH, TECH_AI | U(50, 92) | 3.0 |
| PLANT_MANAGER | Plant manager | MANUFACTURING, ENERGY, MINING_AGRICULTURE | U(40, 85) | 2.2 |
| FLEET_MANAGER | Fleet manager | LOGISTICS_TRANSPORT | U(35, 80) | 1.6 |
| CHIEF_COMPLIANCE | Compliance lead | FINANCE, HEALTH, SECURITY_LEGAL_INTEL | U(40, 85) | 2.0 |
| CREATIVE_DIRECTOR | Creative director | MEDIA_ENTERTAINMENT, LUXURY | U(35, 95) | 2.2 |
| HEAD_OF_SALES | Head of sales | all B2B types | U(35, 85) | 1.8 |
| SITE_FOREMAN | Site foreman | REAL_ESTATE_SERVICES | U(35, 80) | 1.5 |
| CHIEF_PHYSICIAN | Chief physician | HEALTH (clinics, hospitals) | U(50, 90) | 3.2 |
| HEAD_OF_SECURITY | Head of security | SECURITY_LEGAL_INTEL | U(40, 85) | 1.8 |

Manager candidates (09 MANAGED mode) show `<Name> · <years> years · <previous employer>` where the previous employer is drawn from the city's NPC private firms (§6.9) or listed companies (§4.1) in the same sector.

### §6.13 Other NPC business institutions

**Strategic acquirers (20, 09 §3.13)**: listed NPC companies that make M&A bids under 16 CEO actions. Each bids for targets in its appetite sectors when target EV is within its range (as a share of its own cap0) and its leverage allows.

| Acquirer (listed, §4.1) | Bloc | Appetite (09 sectors) | Target EV range (% of own cap) |
|---|---|---|---|
| Aurelius Holdings (AURH) | FDL | REAL_ESTATE_SERVICES, FOOD_HOSPITALITY | 0.5–8% |
| Harlow Machinery (HRLW) | FDL | MANUFACTURING, ENERGY | 0.5–6% |
| Talon Aerospace (TALN) | FDL | MANUFACTURING, SECURITY_LEGAL_INTEL | 0.5–5% |
| Pallas Foods (PALF) | FDL | FOOD_HOSPITALITY, MINING_AGRICULTURE | 0.5–6% |
| Brenner Maschinen (BRNM) | EUN | MANUFACTURING, LOGISTICS_TRANSPORT | 0.5–6% |
| Fattoria Group (FTRG) | EUN | FOOD_HOSPITALITY, MINING_AGRICULTURE | 0.5–8% |
| Arcadia Media (ARCM) | EUN | MEDIA_ENTERTAINMENT, TECH_AI | 0.5–10% |
| Rhenova Énergie (RHNV) | EUN | ENERGY | 0.5–6% |
| Ryujin Heavy Industries (RYJN) | PYN | MANUFACTURING, ENERGY, LOGISTICS_TRANSPORT | 0.5–5% |
| Ranshi Commerce (RNSH) | PYN | RETAIL_CONSUMER, TECH_AI | 0.5–10% |
| Hanami Foods (HNMF) | PYN | FOOD_HOSPITALITY | 0.5–8% |
| Kumo Systems (KUMO) | PYN | TECH_AI | 0.5–10% |
| Hammar Industries (HMMR) | NKR | MANUFACTURING, ENERGY | 0.5–6% |
| Nordline Shipping (NRDL) | NKR | LOGISTICS_TRANSPORT | 0.5–8% |
| Verdane Energy (VRDN) | NKR | ENERGY, MINING_AGRICULTURE | 0.5–6% |
| Fjordsoft (FJSF) | NKR | TECH_AI, FINANCE (non-chartered) | 0.5–10% |
| Petrosur (PTSR) | SRL | ENERGY, LOGISTICS_TRANSPORT | 0.5–6% |
| Cobre Mayor (CBMY) | SRL | MINING_AGRICULTURE, MANUFACTURING | 0.5–6% |
| Granos del Valle (GRDV) | SRL | MINING_AGRICULTURE, FOOD_HOSPITALITY | 0.5–8% |
| Tiendas Paseo (PASE) | SRL | RETAIL_CONSUMER, FOOD_HOSPITALITY | 0.5–8% |

**Other named business-side NPC institutions**: Lantern Proxy Advisors (the one global proxy advisor, §2.2); NPC underwriter banks = the primary dealers and SIBs of §5.1–§5.2; Ashcombe Valuation (the NPC valuation expert firm `npc_VALX`, with one valuer desk per bloc, §2.1–§2.2); The Tender Board (`npc_TENDER`, one board per city, §2.2); NPC VC houses Launchpad Partners and Genkai Capital (§5.4).

## §7 AI Lab → content/ai.json

11 owns every number not repeated here. IDs: hardware `hw_<model>`, vendors `vnd_<slug>`, brokers `brk_<domain>_<bloc>` (global `brk_<slug>_GLOBAL`), clouds `cld_<slug>`, colocation `colo_<slug>`, NPC labs `lab_<slug>`, star researchers `res_star_<nn>`, partnership slots `pslot_<domain>_<bloc>_<n>`.

### §7.1 Hardware models and NPC vendors

| hwId | Model | Class | Flavour text (`hw.<id>.desc`) |
|---|---|---|---|
| hw_gx10 | GX10 | consumer | A gaming card that learned to do maths. Every lab starts here. |
| hw_gx40 | GX40 | prosumer | Four times the memory, a fan you can hear from the hallway. |
| hw_dx100 | DX100 | datacenter | The workhorse node. A rack of these is what people mean by "a cluster". |
| hw_dx300 | DX300 | flagship | The node every lab wants and every vendor rations. |
| hw_dx900pod | DX900POD | frontier node | Not a card but a room: liquid-cooled, megawatt-hungry, sold by allocation. |

| vendorId | Vendor (listed, §4.1) | Bloc | Sells | Note |
|---|---|---|---|---|
| vnd_nimbus | Nimbus Compute (NIMB) | FDL | all models; designs DX100, DX300, DX900POD | primary designer |
| vnd_arclight | Arclight Semiconductor (ARCL) | FDL | all models; designs GX10, GX40 | consumer leader |
| vnd_kaigan | Kaigan Semiconductor (KGSM) | PYN | all models; second source for GX40 and DX100 | exposed to Pacific chip-fab shocks |
| vnd_siltera | Siltera (SLTR) | EUN | all models; second source for DX300 | export-rule exposure in trade wars |

Every vendor sells every model (11 §6.3); "designs" only sets which vendor's stock is hit first by a shortage event on that model.

### §7.2 NPC data brokers (68) → content/data_brokers.json

One broker per (domain, bloc) plus 3 global brokers (11 §6.2). Name = `<root> <domain noun>`. Global brokers cover all 13 domains with `bloc = GLOBAL` datasets.

| Domain | FDL | EUN | PYN | NKR | SRL |
|---|---|---|---|---|---|
| EQUITIES | Keystone Equity Data (`brk_equities_FDL`) | Delacroix Equity Data (`brk_equities_EUN`) | Kanade Equity Data (`brk_equities_PYN`) | Fjellstad Equity Data (`brk_equities_NKR`) | Andina Equity Data (`brk_equities_SRL`) |
| CREDIT_RATES | Bayard Rates Data (`brk_credit_rates_FDL`) | Aurelia Rates Data (`brk_credit_rates_EUN`) | Hoshino Rates Data (`brk_credit_rates_PYN`) | Norrøna Rates Data (`brk_credit_rates_NKR`) | Cordillera Rates Data (`brk_credit_rates_SRL`) |
| FX | Halstead FX Feeds (`brk_fx_FDL`) | Fontaine FX Feeds (`brk_fx_EUN`) | Tsubame FX Feeds (`brk_fx_PYN`) | Havbris FX Feeds (`brk_fx_NKR`) | Altiplano FX Feeds (`brk_fx_SRL`) |
| COMMODITIES | Prairie Commodity Intelligence (`brk_commodities_FDL`) | Brera Commodity Intelligence (`brk_commodities_EUN`) | Akane Commodity Intelligence (`brk_commodities_PYN`) | Isfjord Commodity Intelligence (`brk_commodities_NKR`) | Pampero Commodity Intelligence (`brk_commodities_SRL`) |
| CRYPTO | Ridgeway Chain Analytics (`brk_crypto_FDL`) | Lumen Chain Analytics (`brk_crypto_EUN`) | Seiun Chain Analytics (`brk_crypto_PYN`) | Lysne Chain Analytics (`brk_crypto_NKR`) | Brisa Chain Analytics (`brk_crypto_SRL`) |
| MACRO | Copperline Macro Data (`brk_macro_FDL`) | Castellan Macro Data (`brk_macro_EUN`) | Mizuho Macro Data (`brk_macro_PYN`) | Stormvik Macro Data (`brk_macro_NKR`) | Quetzal Macro Data (`brk_macro_SRL`) |
| SENTIMENT | Crestmark Sentiment Research (`brk_sentiment_FDL`) | Varenne Sentiment Research (`brk_sentiment_EUN`) | Kazan Sentiment Research (`brk_sentiment_PYN`) | Bjørkdal Sentiment Research (`brk_sentiment_NKR`) | Ceibo Sentiment Research (`brk_sentiment_SRL`) |
| MICROSTRUCTURE | Fairhaven Tick Data (`brk_microstructure_FDL`) | Orsini Tick Data (`brk_microstructure_EUN`) | Ishida Tick Data (`brk_microstructure_PYN`) | Vinterlys Tick Data (`brk_microstructure_NKR`) | Araucaria Tick Data (`brk_microstructure_SRL`) |
| OPERATIONS | Liberty Row Operations Data (`brk_operations_FDL`) | Monteverdi Operations Data (`brk_operations_EUN`) | Hikari Tape Operations Data (`brk_operations_PYN`) | Solberg Operations Data (`brk_operations_NKR`) | Tierra Alta Operations Data (`brk_operations_SRL`) |
| PROPERTY | Westbrook Property Data (`brk_property_FDL`) | Rivoli Property Data (`brk_property_EUN`) | Sorano Property Data (`brk_property_PYN`) | Kvist Property Data (`brk_property_NKR`) | Selva Property Data (`brk_property_SRL`) |
| SEC_OFFENSE | Stonegate Threat Research (`brk_sec_offense_FDL`) | Ansel Threat Research (`brk_sec_offense_EUN`) | Kumoi Threat Research (`brk_sec_offense_PYN`) | Ravnå Threat Research (`brk_sec_offense_NKR`) | Mirador Threat Research (`brk_sec_offense_SRL`) |
| SEC_DEFENSE | Northfield Defense Telemetry (`brk_sec_defense_FDL`) | Beaulieu Defense Telemetry (`brk_sec_defense_EUN`) | Tenma Defense Telemetry (`brk_sec_defense_PYN`) | Eikland Defense Telemetry (`brk_sec_defense_NKR`) | Rumbo Defense Telemetry (`brk_sec_defense_SRL`) |
| MEDIA | Harlan Media Corpus (`brk_media_FDL`) | Marchand Media Corpus (`brk_media_EUN`) | Nagare Media Corpus (`brk_media_PYN`) | Tindra Media Corpus (`brk_media_NKR`) | Austral Media Corpus (`brk_media_SRL`) |

Global: Orbis Data Exchange (`brk_orbis_GLOBAL`), Common Tape Consortium (`brk_commontape_GLOBAL`), Globe Archive Partners (`brk_globearchive_GLOBAL`).

**Archive packages (6 per broker, 408 total).** `pkg_<brokerId>_<code>`; display name `<domain short> <grade> archive, <size> DQU` (e.g. "Equities A archive, 50,000 DQU").

| Code | Grade | Quality q | Size (DQU) | Data end (days before genesis, 11 freshness) |
|---|---|---|---|---|
| A1 | A | 0.95 | 1,000 | 7 |
| A2 | A | 0.95 | 50,000 | 28 |
| B1 | B | 0.85 | 10,000 | 14 |
| B2 | B | 0.85 | 250,000 | 56 |
| C1 | C | 0.7 | 100 | 0 |
| C2 | C | 0.7 | 1,000,000 | 91 |

Packages are restocked at each chapter boundary with the data-end date moved to the boundary minus the same lag.

### §7.3 NPC cloud and colocation providers (25) → content/clouds.json

3 clouds and 2 colocation providers per bloc (11 §6.4). Listed clouds are the cloud arms of the named listed companies.

| Bloc | Cloud 1 | Cloud 2 | Cloud 3 | Colocation 1 | Colocation 2 |
|---|---|---|---|---|---|
| FDL | Copperleaf Cloud (CPLF, listed) | Halcyon Compute Services (Halcyon Systems arm) | Prairie Racks (private) | Eastside Dock Colocation (private) | Redmesa Desert Halls (private) |
| EUN | Lumière Networks Cloud (LMNW, listed) | Nuvola Compact (private) | Valcourt Rechenzentrum (private) | Arsenal Yards Hosting (private) | Belmara Cold Halls (private) |
| PYN | Kumo Cloud (KUMO, listed) | Tessan Grid Compute (private) | Ranshi Cloud (Ranshi Commerce arm) | Reclaim Grid Data Halls (private) | Delta Wharf Colocation (private) |
| NKR | Norrsken Cloud (Norrsken Compute arm) | Fjordsoft Cloud (Fjordsoft arm) | Vintra Hydro Compute (private) | Turbine Valley Halls (private) | Skarvik Rock Vaults (private) |
| SRL | Cumbre Cloud (CMBR, listed) | Nube Austral (private) | Pampa Compute (Pampa Digital arm) | Ore Docks Data Halls (private) | Altiplano Cold Racks (private) |

Ids: `cld_<bloc>_<1..3>`, `colo_<bloc>_<1..2>` in table order. Private providers are owned by BACKGROUND NPC firms (§6.9 style) of the named city.

### §7.4 NPC labs (30 at launch; generator `lab_new` for growth) → content/npc_labs.json

11 §3.17 and §6.1: tiers T1 ×8, T2 ×10, T3 ×7, T4 ×4, T5 ×1; 6 per bloc. Each lab is run by one named actor (§10.1 adds 30 lab-head actors to 16's roster to make the 600 total). `cleanliness` and `aggression` are fixed. Honeypot: the 6 labs marked H hold a decoy (20% of 30).

| labId | Lab | Archetype | Bloc | Home city | Tier | Cleanliness | Aggression | Owner | H |
|---|---|---|---|---|---|---|---|---|---|
| `lab_halcyon_frontier` | Halcyon Frontier Lab | BIG_TECH | FDL | Port Avalon | T5 | 0.85 | 0.55 | Halcyon Systems (HALC) | H |
| `lab_saltmarsh_ai` | Saltmarsh Research | QUANT_SHOP | FDL | Port Avalon | T4 | 0.7 | 0.65 | fund Saltmarsh (fnd_saltmarsh) | — |
| `lab_federal_ai_institute` | Federal AI Institute | STATE_LAB | FDL | Lakemont | T3 | 0.95 | 0.2 | Federal Treasury | — |
| `lab_lakemont_univ` | Lakemont University Machine Learning Group | ACADEMIC | FDL | Lakemont | T2 | 0.98 | 0.05 | Lakemont University (fictional) | — |
| `lab_sentinel_ai` | Sentinel Cyber AI | BOUTIQUE_SECURITY | FDL | Redmesa | T2 | 0.8 | 0.3 | Sentinel Cyber (SNTL) | H |
| `lab_gridline_ops` | Gridline Operations AI | OPS_VENDOR | FDL | Redmesa | T1 | 0.9 | 0.15 | private | — |
| `lab_novalis_ai` | Novalis Intelligence | BIG_TECH | EUN | Meridia | T4 | 0.85 | 0.45 | Novalis Software (NOVS) | — |
| `lab_compact_ai_office` | Compact Office for Applied AI | STATE_LAB | EUN | Valcourt | T3 | 0.95 | 0.2 | Compact Treasury | — |
| `lab_valcourt_polytech` | Valcourt Polytechnic AI Lab | ACADEMIC | EUN | Valcourt | T2 | 0.98 | 0.05 | Valcourt Polytechnic (fictional) | — |
| `lab_aegide_ai` | Aegide Defence Models | BOUTIQUE_SECURITY | EUN | Meridia | T2 | 0.75 | 0.4 | Aegide Cyber (AEGD) | H |
| `lab_belmara_quant` | Belmara Quant Atelier | QUANT_SHOP | EUN | Belmara | T2 | 0.6 | 0.55 | Belmara Privatbank (BLMP) | — |
| `lab_brera_ops` | Brera Automazione | OPS_VENDOR | EUN | Valcourt | T1 | 0.9 | 0.1 | private | — |
| `lab_kumo_brain` | Kumo Brain | BIG_TECH | PYN | Kaiyo City | T4 | 0.8 | 0.5 | Kumo Systems (KUMO) | — |
| `lab_pacific_state_ai` | Pacific League Computing Centre | STATE_LAB | PYN | Tessan | T3 | 0.9 | 0.35 | League Treasury | H |
| `lab_quadrant_ai` | Quadrant Research | QUANT_SHOP | PYN | Kaiyo City | T3 | 0.55 | 0.7 | fund Quadrant (fnd_quadrant) | — |
| `lab_mirako_univ` | Mirako Institute of Technology AI Lab | ACADEMIC | PYN | Mirako | T2 | 0.98 | 0.05 | Mirako Institute (fictional) | — |
| `lab_kitsune_ai` | Kitsune Security Labs AI | BOUTIQUE_SECURITY | PYN | Tessan | T1 | 0.4 | 0.75 | Kitsune Security Labs (KTSN) | — |
| `lab_hayate_ops` | Hayate Factory Intelligence | OPS_VENDOR | PYN | Tessan | T2 | 0.9 | 0.15 | Hayate Robotics (HYTR) | — |
| `lab_fjordsoft_ai` | Fjordsoft Research | BIG_TECH | NKR | Nordhaven City | T4 | 0.9 | 0.35 | Fjordsoft (FJSF) | — |
| `lab_nordic_rune_ai` | Rune Council Model Office | STATE_LAB | NKR | Nordhaven City | T2 | 0.95 | 0.15 | Nordic Treasury | — |
| `lab_northwind_quant` | Northwind Systematic | QUANT_SHOP | NKR | Nordhaven City | T3 | 0.65 | 0.6 | fund Northwind (fnd_northwind) | — |
| `lab_vintra_univ` | Vintra Technical University AI Group | ACADEMIC | NKR | Vintra | T1 | 0.98 | 0.05 | Vintra Technical University (fictional) | — |
| `lab_ravn_ai` | Ravn Intelligence Models | BOUTIQUE_SECURITY | NKR | Skarvik | T3 | 0.5 | 0.7 | Ravn Intelligence (RAVN) | H |
| `lab_turbine_ops` | Turbine Valley Automation | OPS_VENDOR | NKR | Vintra | T1 | 0.9 | 0.1 | private | — |
| `lab_solaria_ai` | Solaria Inteligencia | BIG_TECH | SRL | Sundara Coast | T3 | 0.8 | 0.45 | Solaria Software (SOLS) | — |
| `lab_southern_state_ai` | Coalition Applied AI Agency | STATE_LAB | SRL | Cobreval | T2 | 0.9 | 0.25 | Coalition Treasury | — |
| `lab_ventana_quant` | Ventana Signals | QUANT_SHOP | SRL | Sundara Coast | T2 | 0.45 | 0.7 | fund Ventana (fnd_ventana) | H |
| `lab_altaverde_univ` | Alta Verde University AI Lab | ACADEMIC | SRL | Alta Verde | T1 | 0.98 | 0.05 | Alta Verde University (fictional) | — |
| `lab_sombra_ai` | Sombra Labs Models | BOUTIQUE_SECURITY | SRL | Cobreval | T1 | 0.3 | 0.8 | Sombra Labs (SMBR) | — |
| `lab_condor_ops` | Cóndor Operaciones IA | OPS_VENDOR | SRL | Cobreval | T1 | 0.9 | 0.15 | Máquinas Cóndor (CNDR) | — |

**Secret-sauce signature (the T5 lab).** Halcyon Frontier Lab: display name "Halcyon Lattice"; lab-unique A bonus 2.4 (inside 11's U(1.5, 3.0), fixed at genesis); watermark family id `wm_halcyon`; the distillation target of 11 §3.14. A lab that later reaches T5 draws its own: name `<lab short name> <one of Lattice, Weave, Prism, Keel, Spindle, Meridian Engine, Loom, Compass>`, bonus U(1.5, 3.0).

**Fictional universities named here** (also usable by 16 careers and 18 instructors): Lakemont University, Valcourt Polytechnic, Mirako Institute of Technology, Vintra Technical University, Alta Verde University, plus non-lab: Port Avalon School of Commerce, Meridia Conservatory of Finance, Kaiyo Imperial College, Nordhaven Maritime Academy, Cobreval School of Mines.

**Generator `lab_new`** (2 labs per new city, 11 §3.17). Stream `rng('content/lab_new/<cityId>', worldSeed)`. Archetype by weights QUANT_SHOP 0.25, BIG_TECH 0.15 (only if the bloc has a listed TECH or SEMI company without a lab; owner = that company), ACADEMIC 0.25 (owner = a new university `<City> University`), BOUTIQUE_SECURITY 0.15, OPS_VENDOR 0.20; tier T1 (0.6) or T2 (0.4); cleanliness `Beta(5,2)` (ACADEMIC fixed 0.98); aggression `Beta(2,4)` (BOUTIQUE_SECURITY `Beta(3,3)`). Name: `<City or owner short name> <one of Research, Labs, AI, Intelligence, Models, Signals (QUANT_SHOP only), Automation (OPS_VENDOR only)>`.

### §7.5 Star researchers (40) → content/star_researchers.json

Skill 90–99 (`star = true`), 11 §6.7 preferences. Specialty split: ARCHITECTURE 9, DATA 7, TRADING 9, SECURITY 6, SAFETY 5, OPERATIONS 4. 8 per home bloc. Ask = `salaryPerGY` from 11 §3.7.2 at the star's skill × 1.5. Initial employer: 24 employed by NPC labs (2 per T3+ lab, 1 per T2 lab until exhausted, in table order), 16 free agents in the hiring pool at genesis.

| id | Name | Specialty | Home bloc | Skill | prefersClean | prefersFrontier | Employer at genesis |
|---|---|---|---|---|---|---|---|
| `res_star_01` | Avery Okafor | DATA | FDL | 98 | yes | no | lab_halcyon_frontier |
| `res_star_02` | Adèle Lenoir | SECURITY | EUN | 93 | yes | no | lab_halcyon_frontier |
| `res_star_03` | Akira Hayashi | ARCHITECTURE | PYN | 93 | yes | yes | lab_saltmarsh_ai |
| `res_star_04` | Astrid Berglund | SAFETY | NKR | 99 | yes | yes | lab_saltmarsh_ai |
| `res_star_05` | Camila Aguilar | SECURITY | SRL | 95 | no | yes | lab_federal_ai_institute |
| `res_star_06` | Caleb Brennan | SECURITY | FDL | 99 | yes | no | lab_federal_ai_institute |
| `res_star_07` | Matteo Bianchi | TRADING | EUN | 95 | yes | yes | lab_lakemont_univ |
| `res_star_08` | Hana Ishikawa | ARCHITECTURE | PYN | 91 | no | yes | lab_sentinel_ai |
| `res_star_09` | Einar Dahl | SAFETY | NKR | 96 | yes | no | lab_novalis_ai |
| `res_star_10` | Diego Benítez | OPERATIONS | SRL | 91 | yes | no | lab_novalis_ai |
| `res_star_11` | Iris Castillo | TRADING | FDL | 95 | no | yes | lab_compact_ai_office |
| `res_star_12` | Cécile Duval | ARCHITECTURE | EUN | 92 | no | yes | lab_compact_ai_office |
| `res_star_13` | Kenji Kobayashi | DATA | PYN | 98 | no | yes | lab_valcourt_polytech |
| `res_star_14` | Freja Eriksen | SECURITY | NKR | 93 | no | no | lab_aegide_ai |
| `res_star_15` | Ximena Cáceres | TRADING | SRL | 93 | yes | yes | lab_belmara_quant |
| `res_star_16` | Jonah Hollis | SAFETY | FDL | 99 | yes | yes | lab_kumo_brain |
| `res_star_17` | Luca Ferrante | TRADING | EUN | 95 | yes | yes | lab_kumo_brain |
| `res_star_18` | Mei Mori | DATA | PYN | 99 | no | no | lab_pacific_state_ai |
| `res_star_19` | Magnus Holm | TRADING | NKR | 91 | no | yes | lab_pacific_state_ai |
| `res_star_20` | Tadeo Duarte | OPERATIONS | SRL | 95 | yes | yes | lab_quadrant_ai |
| `res_star_21` | Maya Marlow | DATA | FDL | 98 | no | no | lab_quadrant_ai |
| `res_star_22` | Ilse Kessel | ARCHITECTURE | EUN | 93 | yes | no | lab_mirako_univ |
| `res_star_23` | Riku Nakajima | SECURITY | PYN | 90 | no | yes | lab_hayate_ops |
| `res_star_24` | Sigrid Lindqvist | ARCHITECTURE | NKR | 93 | yes | yes | lab_fjordsoft_ai |
| `res_star_25` | Paloma Ferreyra | SECURITY | SRL | 91 | no | no | free agent |
| `res_star_26` | Theo Pryce | TRADING | FDL | 95 | yes | yes | free agent |
| `res_star_27` | Bastien Morel | TRADING | EUN | 97 | no | yes | free agent |
| `res_star_28` | Sora Sato | SAFETY | PYN | 92 | yes | yes | free agent |
| `res_star_29` | Vidar Nyberg | OPERATIONS | NKR | 95 | yes | no | free agent |
| `res_star_30` | Lautaro Ibarra | OPERATIONS | SRL | 98 | yes | no | free agent |
| `res_star_31` | Wren Sutter | DATA | FDL | 93 | no | no | free agent |
| `res_star_32` | Noemi Rinaldi | SAFETY | EUN | 97 | yes | no | free agent |
| `res_star_33` | Lian Wen | ARCHITECTURE | PYN | 96 | yes | no | free agent |
| `res_star_34` | Ingrid Strand | DATA | NKR | 95 | no | no | free agent |
| `res_star_35` | Rocío Quiroga | ARCHITECTURE | SRL | 90 | no | no | free agent |
| `res_star_36` | Quinn Vance | TRADING | FDL | 92 | no | yes | free agent |
| `res_star_37` | Valentin Vogel | ARCHITECTURE | EUN | 99 | yes | yes | free agent |
| `res_star_38` | Hyun Seo | ARCHITECTURE | PYN | 98 | no | yes | free agent |
| `res_star_39` | Nils Vik | TRADING | NKR | 98 | no | yes | free agent |
| `res_star_40` | Esteban Salazar | DATA | SRL | 99 | yes | yes | free agent |

### §7.6 Alt-data partnership slots (120) → content/partnership_slots.json

8 domains × 5 blocs × 3 slots (11 §3.4.4). Each slot is a named partner (a listed company of that bloc, §4.1) whose operational data the winner licenses for the chapter. Label (`pslot.<id>.name`) = `<Partner> <feed name>`.

| Domain (feed) | FDL | EUN | PYN | NKR | SRL |
|---|---|---|---|---|---|
| EQUITIES (footfall) | Pallas Foods footfall; Homestead Grocers footfall; Clearspring Beverages footfall | Fattoria Group footfall; Lattiera Dairy footfall; Maison Cérès footfall | Hanami Foods footfall; Kome Agrigroup footfall; Seiryo Beverages footfall | Havbruk Seafood footfall; Nordmark Dairy footfall; Kjeks and Co footfall | Cafetales Unidos footfall; Granos del Valle footfall; Cacao Serrano footfall |
| COMMODITIES (shipping manifests) | Talon Aerospace shipping manifests; Union Rail Systems shipping manifests; Harlow Machinery shipping manifests | Ostrava Steel shipping manifests; Brenner Maschinen shipping manifests; Aeroval shipping manifests | Atlas Freight shipping manifests; Ryujin Heavy Industries shipping manifests; Kaiyo Shipbuilding shipping manifests | Nordline Shipping shipping manifests; Varg Marine Engineering shipping manifests; Östra Rail shipping manifests | Puerto Sur Logistics shipping manifests; Ferrocarril Austral shipping manifests; Máquinas Cóndor shipping manifests |
| MACRO (card-spend nowcast) | Avalon National Bank card-spend nowcast; Lakeshore Bancorp card-spend nowcast; Orion Information Group card-spend nowcast | Meridia Bank card-spend nowcast; Banca Valcourt card-spend nowcast; Belmara Privatbank card-spend nowcast | Kaiyo Pacific Bank card-spend nowcast; Tessan Commercial Bank card-spend nowcast; Daichi Securities card-spend nowcast | Nordhaven Bank card-spend nowcast; Skarvik Sparebank card-spend nowcast; Halvorsen Re card-spend nowcast | Banco Sundara card-spend nowcast; Banco Alta Verde card-spend nowcast; Solano Seguros card-spend nowcast |
| MICROSTRUCTURE (venue depth feed) | PAX exchange venue depth feed; Avalon National Bank venue depth feed; Lakeshore Bancorp venue depth feed | MBX exchange venue depth feed; Meridia Bank venue depth feed; Banca Valcourt venue depth feed | KSX exchange venue depth feed; Kaiyo Pacific Bank venue depth feed; Tessan Commercial Bank venue depth feed | NHX exchange venue depth feed; Nordhaven Bank venue depth feed; Skarvik Sparebank venue depth feed | CXS exchange venue depth feed; Banco Sundara venue depth feed; Banco Alta Verde venue depth feed |
| CRYPTO (on-chain clustering) | Halcyon Systems on-chain clustering; Brightline Software on-chain clustering; Copperleaf Cloud on-chain clustering | Novalis Software on-chain clustering; Kaleido Systèmes on-chain clustering; Vireo Digital on-chain clustering | Kumo Systems on-chain clustering; Hikari Software on-chain clustering; Tessan Digital on-chain clustering | Fjordsoft on-chain clustering; Nordlys Digital on-chain clustering; Skald Systems on-chain clustering | Solaria Software on-chain clustering; Pampa Digital on-chain clustering; Vela Pagos on-chain clustering |
| SENTIMENT (panel survey) | Beacon Broadcasting panel survey; Starling Studios panel survey; Pixelforge Games panel survey | Arcadia Media panel survey; Folio Media panel survey; Spectra Films panel survey | Hikaru Broadcasting panel survey; Origami Studios panel survey; Pixel Ronin Games panel survey | Saga Broadcasting panel survey; Runestone Games panel survey; Morgen Media Group panel survey | Canal Sol panel survey; Novela Studios panel survey; Diario Austral Group panel survey |
| PROPERTY (listing pipeline) | Aurelius Holdings listing pipeline; Harbor Realty Trust listing pipeline; Glasshill Office REIT listing pipeline | Immobiliare Rialto listing pipeline; Lagoon Estates REIT listing pipeline; Bourse Square Properties listing pipeline | Kaiyo Land listing pipeline; Loop Central REIT listing pipeline; Reclaim Grid Properties listing pipeline | Birch Hills Development listing pipeline; Opera Quay Properties listing pipeline; Nordic Residential REIT listing pipeline | Constructora Palmar listing pipeline; Marina Quarter REIT listing pipeline; Plaza Mayor Properties listing pipeline |
| OPERATIONS (supplier telemetry) | Ironbridge Materials supplier telemetry; Cobalt Ridge Mining supplier telemetry; Lakemont Chemical supplier telemetry | Ferromonte supplier telemetry; Calcara Cement supplier telemetry; Lacroix Chimie supplier telemetry | Kurogane Steel supplier telemetry; Hoshi Chemical supplier telemetry; Tessan Rare Metals supplier telemetry | Malm Mining supplier telemetry; Jernvik Steel supplier telemetry; Tundra Timber supplier telemetry | Cobre Mayor supplier telemetry; Litio Verde supplier telemetry; Minera Mirador supplier telemetry |

Slot ids `pslot_<domain>_<bloc>_<1..3>` in cell order. When a partner company is delisted or absorbed the slot keeps its id and takes the bloc's next company of the same sector.

### §7.7 Strategy templates (12, 11 §3.10.5) → content/strategy_templates.json

| templateId | Name | Gate (11) | Choices the player makes (3–5) |
|---|---|---|---|
| tpl_trend | Trend Follower | — | universe (watchlist / sector / index); lookback (fast 5, medium 20, slow 60 game days); position size (% of mandate); stop distance |
| tpl_meanrev | Mean Reverter | — | universe; band width (1, 1.5, 2 σ); holding cap (game days); position size |
| tpl_pairs | Pairs | CLASSIC_ML | pair (two assets of one sector); entry z-score; exit z-score; max holding |
| tpl_mm | Market Maker | SEQUENCE + market-maker concession or LIC3 | instrument; quote width (bps); inventory cap; skew strength |
| tpl_sentiment | Sentiment Rider | DEEP_NETS | universe; news kinds followed; reaction window; size per story |
| tpl_earnings | Earnings Drift | CLASSIC_ML | universe; surprise threshold; hold days after report; size |
| tpl_carry | Macro Carry | — | currency set; minimum rate gap; volatility cap; rebalance cadence |
| tpl_basis | Crypto Basis | LIC3 | token; minimum annualised basis; leverage cap; roll rule |
| tpl_voltarget | Volatility-Target Overlay | — | target volatility; base portfolio; rebalance threshold |
| tpl_defensive | Defensive Rebalancer | — | asset mix (equity / bond / gold / cash); drift band; rebalance cadence |
| tpl_hedger | Hedger | LIC2 | business to hedge (09); commodity; hedge ratio; instrument (future or swap) |
| tpl_exec | Execution Assistant | — | order to work; algo (TWAP / VWAP / participation); horizon; price limit |

### §7.8 Model codename bank (generator `codename`) → content/codenames.json

Codename = `<Root>-<n>` where n is the lab's next version number for that root ("Aster-2"); a lab picks a fresh root per model family with stream `rng('content/codename/<labId>', worldSeed)` and never reuses a root another lab of the same bloc has used in the chapter. 400 roots in 8 themes of 50 (proper names excluded; all are common words or invented):

- **Stars and sky**: Aster, Vega, Lyra, Orion, Sirius, Nova, Altair, Deneb, Rigel, Mira, Castor, Pollux, Antares, Capella, Spica, Electra, Maia, Atlas, Halo, Zenith, Nadir, Corona, Aurora, Nebula, Comet, Quasar, Pulsar, Equinox, Solstice, Eclipse, Perihelion, Apogee, Umbra, Penumbra, Meteor, Polaris, Cygnus, Draco, Lynx, Lepus, Carina, Vela, Pyxis, Fornax, Tucana, Pavo, Grus, Ara, Norma, Lucida.
- **Birds**: Kestrel, Merlin, Falcon, Osprey, Harrier, Swift, Martin, Wren, Finch, Linnet, Siskin, Tern, Petrel, Gannet, Heron, Egret, Ibis, Crane, Plover, Curlew, Avocet, Dunlin, Sanderling, Puffin, Auk, Shrike, Oriole, Tanager, Bunting, Lark, Pipit, Wagtail, Starling, Jay, Magpie, Raven, Rook, Kite, Buzzard, Condor, Albatross, Shearwater, Skua, Grebe, Loon, Teal, Wigeon, Pintail, Eider, Kingfisher.
- **Minerals**: Quartz, Basalt, Granite, Obsidian, Jasper, Onyx, Agate, Beryl, Garnet, Topaz, Zircon, Spinel, Opal, Jade, Malachite, Azurite, Pyrite, Galena, Cinnabar, Feldspar, Mica, Gypsum, Calcite, Dolomite, Fluorite, Halite, Talc, Corundum, Olivine, Rutile, Ilmenite, Magnetite, Hematite, Bauxite, Cobaltite, Bismuth, Tellurium, Gallium, Indium, Cerium, Iridium, Osmium, Rhodium, Ruthenium, Selenium, Vanadium, Niobium, Tantalum, Hafnium, Lithic.
- **Winds and weather**: Mistral, Sirocco, Zephyr, Chinook, Foehn, Bora, Levante, Tramontane, Haboob, Monsoon, Squall, Gust, Gale, Tempest, Drizzle, Flurry, Sleet, Rime, Hoarfrost, Thaw, Fog, Haar, Brume, Cirrus, Stratus, Cumulus, Nimbus, Thunderhead, Updraft, Downdraft, Jetstream, Doldrums, Tradewind, Calm, Breeze, Draft, Eddy, Vortex, Cyclone, Derecho, Graupel, Virga, Fogbow, Sundog, Mirage, Thermal, Front, Isobar, Barometer, Dewpoint.
- **Trees and plants**: Alder, Aspen, Birch, Cedar, Cypress, Elm, Fir, Hazel, Holly, Juniper, Larch, Linden, Maple, Oak, Olive, Pine, Poplar, Rowan, Spruce, Willow, Yew, Acacia, Baobab, Banyan, Ceiba, Ginkgo, Kapok, Laurel, Magnolia, Myrtle, Sequoia, Tamarind, Teak, Walnut, Hawthorn, Blackthorn, Bramble, Fern, Moss, Lichen, Clover, Thistle, Sorrel, Tansy, Yarrow, Sage, Thyme, Fennel, Saffron, Indigo.
- **Rivers and coast**: Delta, Estuary, Fjord, Lagoon, Atoll, Reef, Shoal, Cove, Inlet, Sound, Strait, Isthmus, Cape, Headland, Bluff, Dune, Marsh, Fen, Bayou, Rapids, Cascade, Weir, Lock, Quay, Jetty, Breakwater, Tideway, Ebb, Flood, Spring, Neap, Current, Undertow, Swell, Breaker, Spindrift, Foam, Brine, Salt, Kelp, Coral, Pearl, Nacre, Conch, Whelk, Scallop, Anchor, Mooring, Beacon, Lighthouse.
- **Craft and tools**: Anvil, Bellows, Chisel, Lathe, Loom, Shuttle, Spindle, Treadle, Plumb, Level, Square, Caliper, Gauge, Vernier, Sextant, Astrolabe, Compass, Quadrant, Chronometer, Escapement, Gimbal, Ratchet, Pawl, Cam, Crank, Flywheel, Governor, Piston, Valve, Sluice, Siphon, Crucible, Kiln, Forge, Ingot, Rivet, Bolt, Hinge, Keystone, Corbel, Lintel, Truss, Rafter, Joist, Mortise, Tenon, Dovetail, Plane, Adze, Spokeshave.
- **Invented**: Avalen, Brivo, Calder, Dexa, Elvon, Fenra, Galo, Halix, Ivra, Jentu, Kelso, Lumo, Marro, Nexa, Ovid, Pella, Quiro, Rensa, Sorell, Tavi, Ulmo, Varo, Wyndra, Xeno, Yavra, Zelto, Arvo, Belin, Corra, Dovra, Estra, Fiel, Gavra, Helo, Istra, Jarra, Kova, Lenna, Mavi, Norra, Oska, Prima, Quell, Rivo, Sella, Tarro, Ulva, Venn, Wessa, Zora.

### §7.9 Research node texts (10) → strings `lab.node.<id>.*`

| Node | Display name | One-line description | Art brief (17 illustration style) |
|---|---|---|---|
| LINEAR | Linear Models | Straight lines through noisy data: fast, cheap, honest about what they miss. | a ruler laid across a scatter of brass dots |
| CLASSIC_ML | Classic Machine Learning | Trees and ensembles that find thresholds a line cannot. | a small forest of branching brass trees |
| DEEP_NETS | Deep Networks | Layers that learn their own features, including from text. | stacked glass panes with light passing through |
| SEQUENCE | Sequence Models | Models that read the order of events, tick by tick. | a ticker tape folding into a spiral |
| TRANSFORMER | Attention Models | Models that weigh every input against every other; they can write summaries. | threads connecting every bead on a wire frame |
| MOE | Mixture of Experts | Many specialists, only a few awake at a time: cheaper to run. | a row of desks with only three lamps lit |
| RL | Reinforcement Learning | Learning by acting and being scored: the path to full autonomy. | a figure on a winding stair with a lit door |
| MULTIMODAL | Multimodal Models | Charts, text, maps and manifests read together. | a desk with a map, a chart and a manifest under one lamp |
| FRONTIER_STACK | Frontier Stack | Everything at once, at a scale few labs can pay for. | a lit control room seen through tall windows at night |
| SECRET_SAUCE | Secret Sauce | The thing only your lab knows. Others will try to take it. | a locked brass box glowing at the seams |

### §7.10 Tournament titles and division names

Divisions have one id in 11 (`D01`, `D23`, `D45`) and one in 15 (`LAPTOP`, `STARTUP`, `FRONTIER`); they are the same three divisions (DEFAULT: 15's names are the display names, 11's ids are aliases). Weekly title (14 §3.5.2 tournament class): "Laptop Champion · Week N", "Startup Champion · Week N", "Frontier Champion · Week N". Chapter aggregate titles: "Laptop Grandmaster", "Startup Grandmaster", "Frontier Grandmaster". Arena (v2) winner title: "Arena Victor". Earned cosmetics (never sold, 21): frames `cos_frame_tourney_laptop`, `cos_frame_tourney_startup`, `cos_frame_tourney_frontier` (brass seal mark); decor trophies `dec_trophy_laptop`, `dec_trophy_startup`, `dec_trophy_frontier`.

### §7.11 AI headline templates (16) → news templates of kind TECH (16 §3.6.3)

| templateId | Trigger event (11) | Headline (EN) |
|---|---|---|
| NEWS_AI_INCIDENT | safety incident (11 §3.15.2) | AI incident at {labPublicName}: deployment halted |
| NEWS_AI_INCIDENT_FOLLOWUP | incident report filed (13) | {labPublicName} files incident report; regulator reviews |
| NEWS_AI_REGISTRY_NEW | registry update, new registration | {labPublicName} registers {codename} in the {band} band |
| NEWS_AI_MILESTONE_T3 | first lab in the world to reach T3 | A lab crosses into the flagship tier |
| NEWS_AI_MILESTONE_T4 | first T4 | Frontier nodes come online at {labPublicName} |
| NEWS_AI_MILESTONE_T5 | first T5 after genesis | {labPublicName} claims a secret recipe; rivals take note |
| NEWS_AI_RACE_INDEX | AIRaceIndex crosses 25/50/75 (11) | The AI race quickens: index passes {level} |
| NEWS_AI_NODE_FIRST | first lab to finish a research node | First {nodeName} system completed |
| NEWS_AI_CHIP_SHORTAGE | chip shortage starts (11 §3.3.4) | Card shortage: {model} deliveries slip |
| NEWS_AI_CHIP_SHORTAGE_END | shortage ends | {model} supply recovers |
| NEWS_AI_RULE_PROPOSED | AiRule bill introduced (16) | {bloc} lawmakers move to {ruleSummary} |
| NEWS_AI_RULE_IN_FORCE | AiRule in force | New AI rule in force across {bloc}: {ruleSummary} |
| NEWS_AI_AUDIT_SWEEP | audit sweep starts | {regulator} launches an AI audit sweep |
| NEWS_AI_DATA_OUTAGE | data provider outage (16) | {broker} feeds go dark |
| NEWS_AI_TOURNAMENT | weekly tournament results | Week {n} AI tournament: {laptopWinner}, {startupWinner}, {frontierWinner} take their divisions |
| NEWS_AI_DISTILL_VERDICT | distillation conviction (13) | Court orders a copied model destroyed |

Names inside headlines use public names only (a lab that opted out shows "an anonymous lab"); no positions, strategies or performance (L11).

### §7.12 AiRule templates and political triggers → content/ai_rules.json

Five kinds (11 §3.15.3); 16 politics proposes them through the levers AI_REGISTRATION_THRESHOLD and DATA_SCRAPE_LEGALITY or as bills of kind AI_RULE that 13 enforces.

| Kind | Template id | Parameters | Summary string (`airule.<id>.summary`) |
|---|---|---|---|
| THRESHOLD | air_threshold | multiplier 0.5×–4× | change the AI registration threshold to {x} |
| STRATEGY_BAN | air_strategy_ban | strategy class (ShortHorizonFlow, QuoteTwoSided, NewsReaction), duration 28–91 GD | ban {class} strategies on {bloc} assets for {days} days |
| DATA_RULING | air_data_ruling | domain, effect (SCRAPE becomes ILLICIT for new runs) | outlaw scraped {domain} data for new training |
| AUDIT_SWEEP | air_audit_sweep | audit probability ×5 for one game quarter | run an AI audit sweep this quarter |
| AUTONOMY_LIMIT | air_autonomy_limit | MCS ceiling for FULL_AUTO | forbid fully autonomous AI above MCS {mcs} |

**16 political triggers** (each raises the probability that a government or private-member bill picks the named rule within 91 game days; 16 §3.5.4 agenda): T01 a public AI safety incident in the bloc (AUDIT_SWEEP, AUTONOMY_LIMIT); T02 a second incident within 28 GD (AUTONOMY_LIMIT); T03 a flash crash with AI flow share > 30% (05) (STRATEGY_BAN ShortHorizonFlow); T04 a market-maker withdrawal episode (STRATEGY_BAN QuoteTwoSided, reversed by T12); T05 a public data-leak verdict (DATA_RULING); T06 an S1 terms-claim wave > 10 claims in a quarter (DATA_RULING); T07 AIRaceIndex passes 50 (THRESHOLD down); T08 AIRaceIndex passes 75 (AUTONOMY_LIMIT); T09 a distillation conviction (AUDIT_SWEEP); T10 a government of `tech < −0.3` forms (THRESHOLD down); T11 a government of `tech > +0.3` forms (THRESHOLD up, repeal of bans); T12 a liquidity drought in the bloc's equity market (repeal QuoteTwoSided ban); T13 an AI breakthrough (16 §3.10) in the AI domain (THRESHOLD up); T14 a rumour-driven price swing traced to NewsReaction flow (STRATEGY_BAN NewsReaction); T15 a CyberCert world-hack-rate peak (12) (AUDIT_SWEEP); T16 a successful lobbying petition on an AI lever (whatever the petition names).

## §8 Conflict, intelligence and law → content/conflict.json, content/law.json

Everything here is a name, a label or a display string. Mechanics, odds and costs belong to 12 and 13. Cyber content stays abstract: names describe outcomes, never techniques (00 L-rules, 12 §1).

### §8.1 Op display names and one-line tooltips (12 §3.9) → strings `ops.<kind>.name`, `ops.<kind>.tip`

| Kind | Display name | Tooltip (EN) |
|---|---|---|
| C01_SURVEY | Survey | Map what a target exposes and roughly how well it is defended. |
| C02_LURE_STAFF | Lure staff | Win one employee's access through a convincing approach. |
| C03_LOCKOUT | Lockout | Freeze a business until it pays or restores. Loud: the victim knows at once. |
| C04_DATA_SIPHON | Siphon data | Quietly copy a dataset. The copy carries an ILLICIT tag forever. |
| C05_MODEL_SESSION | Model session | Hold a hidden session on a model to train a copy from it. |
| C06_QUERY_DISTILL | Query distill | Learn a model through its public licence, one query at a time. |
| C07_COMPUTE_LEECH | Compute leech | Borrow someone else's compute for your own runs. |
| C08_ORDER_TAP | Order tap | See a target's standing orders while the session lasts. |
| C09_JAM_AI | Jam AI | Pause a target's AI for a few game hours. Loud. |
| C10_MOLE_FEED | Mole feed | A placed insider sends a slow, steady stream of intel. |
| C11_VENDOR_PIVOT | Vendor pivot | Reach every client of a player-owned vendor through the vendor. |
| C12_FALSE_STORY | False story | Spread a false story to move a price. Market manipulation if proven. |
| E1_BRIBE | Bribe | Pay an employee for one leak. |
| E2_PLANT_MOLE | Plant mole | Get your candidate hired by the target. |
| E3_POACH | Poach researcher | Hire a rival's researcher openly. Legal. |
| E4_WALKOUT | Walkout with files | A departing employee carries data or weights out. |
| E5_BREAK_IN | Break in | A hired crew takes a physical item from a home. |
| E6_ALLIANCE_LEAK | Alliance leak | An insider shares alliance intel. |
| E7_INFORMANT | Hire informant | Buy a tip in The Back Room. 60–85% accurate. |
| E8_DUE_DILIGENCE | Due diligence | A public-record dossier. Always legal. |
| M1_SHORT_CAMPAIGN | Short campaign | Short a stock and publish research. Lawful if true. |
| M2_SQUEEZE | Squeeze | Corner the float against short sellers. Watched by the ECA. |
| M3_PUMP_PROMOTE | Pump & promote | Promote a holding with media spend. Manipulation if misleading. |
| M4_REBUTTAL | Rebuttal | Answer a campaign against you with counsel and PR. |

Counter-intelligence items (12 §4.6): HR vetting, Loyalty program, Compartmentalization, Exit interviews + clawback, Canary briefing (names as in 12).

### §8.2 Deception item names (12 §2.8)

| kind | Display name | Description string |
|---|---|---|
| HONEYPOT_BASIC | Honeypot Basic | A decoy model that looks valuable to a survey. Poison 0.20. |
| HONEYPOT_ADVANCED | Honeypot Advanced | A convincing decoy with realistic traffic. Poison 0.40. |
| HONEYPOT_FRONTIER | Honeypot Frontier | A decoy indistinguishable from a frontier model at survey depth. Poison 0.60. |
| CANARY_DATASET | Canary dataset | Marked records inside a real dataset; they trip when a stolen copy is used. |
| CANARY_BRIEFING | Canary briefing | A fake order shown to one suspect; trading on it proves the leak. |

### §8.3 Connection endpoint labels (generator `endpoint_label`, 12 §2.6)

Label = `<CODE>-<nn> · <Place>`, e.g. `AMBER-42 · Port Avalon`. Stream `rng('content/endpoint/<ownerId>/<rotationEpoch>', worldSeed)`; labels rotate per 12's rotation rule; the same hidden session keeps its label within one epoch. `nn` = 10–99. Place = a launch city name (§3.1) with probability 0.5, else one of the fictional region names below. Legitimate connections and hidden sessions draw from the same pools (so a label never reveals intent).

- **Code words (48)**: AMBER, ASH, AZURE, BIRCH, BRASS, CEDAR, CINDER, COBALT, COPPER, CORAL, CRIMSON, DUSK, EMBER, FALCON, FERN, FLINT, FROST, GARNET, GLACIER, GRANITE, HARBOR, HAZEL, INDIGO, IVORY, JADE, JUNIPER, LANTERN, LINEN, MAPLE, MARBLE, MERIDIAN, NICKEL, OCHRE, ONYX, OPAL, PEWTER, QUARTZ, RAVEN, RUST, SABLE, SAFFRON, SILVER, SLATE, TIDE, UMBER, VELVET, WILLOW, ZINC.
- **Region names (24, fictional)**: Gilt Strait, Long Passage, Coral Channel, Serpent Canal (the §4.6 chokepoints), North Reach, Eastern Shelf, Ironcoast, Saltwind Banks, High Plateau, Lowmarch, Westerly Isles, Amber Coast, Pinewall, Duskfield, Tidewater, Greyhaven Sound, Copper Belt, Southern Cape, Mistral Bay, Frostmark, Sunreach, Cinder Flats, Harrow Downs, Lantern Isles.

### §8.4 NPC crews (generator `crew`, 12 §6.1)

16 roster: 10 CRIME_CREW actors at launch, 2 per bloc, +1 per new city. A crew is named, never a real group. Name = `the <Adjective> <Noun>` from Adjectives {Grey, Quiet, Night, Velvet, Paper, Glass, Silent, Long, Low, Hollow, Copper, Salt} × Nouns {Hands, Coats, Lanterns, Keys, Owls, Foxes, Tides, Hours, Ledgers, Gloves, Masks, Pilots}; crew grade 1–3 drawn U{1,3} (12 caps crews at T1–T3 strength). Crews appear to players only in verdicts and Wire items about cleared cases ("the Night Owls"), never with methods.

### §8.5 Named services and venues

| id | Name | What it is | Owner module |
|---|---|---|---|
| `svc_backroom` | **The Back Room** | Informant and fence venue (12 §6.3), club in 14 §3.12.1 (Notoriety ≥ 50). Address shown as "a door off Herring Quay, Skarvik" in every bloc's UI as the same abstract venue. | 12, 14 |
| `svc_northgate` | **Northgate Forensics** | NPC forensic-audit firm (13 investigations, 08 claims adjusting). Offices in every bloc capital. | 13 |
| `ins_aegis` | **Aegis Mutual** | NPC cyber and property insurer (§5.6). | 08 |

**NPC law firms** (13 §11; fees SINK; grade = counsel grade 0–5, 13 §3.4). Two per bloc plus two global elite firms:

| firmId | Name | Bloc | Grade | Specialty |
|---|---|---|---|---|
| `law_pemberton` | Pemberton Sloane LLP | FDL | 4 | litigation, market conduct |
| `law_okafor_reyes` | Okafor & Reyes | FDL | 2 | civil, contracts |
| `law_duval_ferrante` | Duval Ferrante Avocats | EUN | 4 | antitrust, tax |
| `law_studio_rinaldi` | Studio Legale Rinaldi | EUN | 2 | civil |
| `law_nakajima_mori` | Nakajima Mori Law Offices | PYN | 4 | cyber cases, IP |
| `law_seo_partners` | Seo & Partners | PYN | 2 | contracts |
| `law_lindqvist_dahl` | Lindqvist Dahl Advokatfirma | NKR | 3 | regulatory, shipping |
| `law_holm_vik` | Holm & Vik | NKR | 1 | civil |
| `law_ibarra_quiroga` | Ibarra Quiroga Abogados | SRL | 3 | criminal defence, mining |
| `law_benitez` | Estudio Benítez | SRL | 1 | civil |
| `law_harrowgate` | Harrowgate Chambers | world | 5 | elite counsel, all venues |
| `law_castellan_wyatt` | Castellan Wyatt International | world | 5 | elite counsel, regulatory tribunals |

**NPC private-investigation firms** (13 §4, PI grade 0–5):

| firmId | Name | Bloc | Grade |
|---|---|---|---|
| `pi_lamplight` | Lamplight Inquiries | FDL | 3 |
| `pi_corvid` | Corvid Investigations | EUN | 4 |
| `pi_hoshi` | Hoshi Research Bureau | PYN | 3 |
| `pi_tracker` | Sporhund Etterforskning | NKR | 2 |
| `pi_ojo` | Ojo Austral | SRL | 2 |
| `pi_meridian_watch` | Meridian Watch Group | world | 5 |

### §8.6 Regulators, tribunals and courts (13 §7.1, §3.8)

Regulators are per-bloc divisions of the bloc regulator (§2.3): ECA (Exchange Conduct Authority), CMA (Competition & Mergers Agency), Revenue Office, CyberCert. Tribunals (one world-wide seat per division, §2.3): Market Conduct Tribunal, Competition Tribunal, Tax Tribunal, Cyber Incident Tribunal. Courts (§2.4): Meridian Civil Court, Glasshill Criminal Bench, Clearing House Arbitration Panel, Appeals Chamber (Belmara). Case display: `<Division>, <Bloc name>` (e.g. "Exchange Conduct Authority, Federal Union").

### §8.7 Sanction and verdict strings (13 §3.9) → strings `law.sanction.<id>.*`

| id | Display name | Verdict-card line (EN) |
|---|---|---|
| FINE | Fine | A fine of {amount}. Most of it is destroyed; part compensates victims. |
| RESTITUTION | Restitution | {amount} returned to {victim}. |
| DISGORGEMENT | Disgorgement | {amount} of gains given up. |
| LICENSE_SUSPENSION | License suspension | {license} suspended for {days} days. Open positions can only be closed. |
| OP_BAN | Op ban | No operations for {days} days. |
| DIVESTITURE | Divestiture | {asset} must be sold at fair value less 15%. |
| MODEL_DESTRUCTION | Model destruction | Model {codename} is deleted. |
| HELD | Held | Held for {hours} hours, starting in one game day. Businesses run at 70%. |
| PUBLIC_RECORD | Public record | A permanent line on your public profile. |

Verdict card headers: "Found liable", "Not liable", "Convicted", "Acquitted", "Settled", "Consent decree", "Case dismissed", "Appeal upheld", "Appeal rejected". Severity tier labels S1–S6: Minor, Moderate, Serious, Grave, Severe, Systemic.

### §8.8 Consent-decree and settlement news templates (16 kind VERDICT)

| templateId | Headline (EN) |
|---|---|
| NEWS_LAW_CONSENT_DECREE | {party} agrees consent decree with the {regulator}; {sanctionSummary} |
| NEWS_LAW_SETTLEMENT | {claimant} and {defendant} settle {caseKind} case |
| NEWS_LAW_CONVICTION | {court} convicts {party} of {offenceClass} |
| NEWS_LAW_ACQUITTAL | {court} acquits {party} |
| NEWS_LAW_CIVIL_AWARD | {court} awards {amountBucket} to {claimant} |
| NEWS_LAW_DIVESTITURE | {regulator} orders {party} to sell {asset} |
| NEWS_LAW_HELD | {party} held for {hours} hours after {offenceClass} conviction |
| NEWS_LAW_APPEAL | Appeals Chamber {upholds/overturns} ruling against {party} |
| NEWS_LAW_WHISTLE_AWARD | Whistleblower award paid in {regulator} case |
| NEWS_LAW_LICENSE | {regulator} suspends {party}'s {license} |

Player parties appear only when the verdict is public under 13 (public record); never amounts below the bucket rule of 15.
## §9 Lifestyle, status and Houses → content/lifestyle.json

14 owns every number (prices, upkeep, PP, ranks). This section owns names, makers, rosters and texts. Item ids are 14's `defId`s; unique instances are `uq_<kind>_<nn>`.

### §9.1 Brands and makers (10 brand pages) → strings `brand.<id>.*`

| brandId | Brand | Category | Maker (owner) | Home | Line | Brand page tagline (EN) |
|---|---|---|---|---|---|---|
| brd_corvo | Corvo | cars | Corvo Motors (CRVO, listed) | Valcourt | E-Sport | Electric, quick, everywhere. |
| brd_halden | Halden | cars | Halden Motorenwerk (private, Halden dynasty holding, §10.4) | Belmara | GT | Grand touring since the first pass road. |
| brd_marchetti | Marchetti | cars | Marchetti Automobili (MRCA, listed) | Meridia | Furia, Furia Ultima, 250 "Vetro" classics | Twelve cylinders and a long memory. |
| brd_kessler | Kessler | watches | Kessler Uhren (private, Valcourt) | Valcourt | Field, Diver | Honest watches for working wrists. |
| brd_vael | Vael | watches | Vael Horlogerie (VAEL, listed) | Belmara | Perpetual, Grand Complication | Time, kept beautifully. |
| brd_oriel | Oriel | watches | Oriel Manufacture (private, Belmara) | Belmara | "One of 12" Tourbillon | Twelve pieces. Never thirteen. |
| brd_aurel | Aurel | yachts | Aurel Marine (AURL, listed) | Nordhaven City | Aurel 40, Aurel 80; superyacht and gigayacht builds | Built for cold water and warm harbours. |
| brd_stratos | Stratos | jets | Stratos Aviation (STRA, listed) | Nordhaven City | Light, Long-Range | Your own hours in the sky. |
| brd_velour | Velour Maison | fashion | Velour Maison (VLRM, listed) | Meridia | Wardrobe, Atelier wardrobe, Couture season | Dressed for the room you want to enter. |
| brd_lescure | Domaine Lescure | wine | Domaine Lescure (private, Valcourt valley) | Valcourt | everyday cases, rare vintages, legendary lots (with the estates of §9.4) | Patient vines, patient people. |

Player-made editions (14 §3.6.7) carry the maker company's own name.

### §9.2 Catalog display names (45 rows, 14 §3.7)

Display string `life.<defId>.name` = the Item column of 14 §3.7 verbatim (EN); descriptions `life.<defId>.desc` follow the brief below. Hero image brief (17 §3.15): dark studio backdrop, dusk light, item three-quarter view.

| Group | defIds | Description brief |
|---|---|---|
| Homes | lid_rented_room, lid_studio_riverside, lid_loft_riverside, lid_penthouse_glasshill, lid_mansion_summit, lid_estate_summit, lid_island_serena, lid_skyline_tower_penthouse | the view from the window; for city variants the district name replaces the default district |
| Cars | lid_used_hatchback, lid_corvo_esport, lid_halden_gt, lid_marchetti_furia, lid_marchetti_furia_ultima, lid_marchetti_vetro, lid_racing_seat | the sound and the road; the racing seat is a season in the fictional "Meridian GT Series" |
| Watches | lid_kessler_field, lid_kessler_diver, lid_vael_perpetual, lid_vael_grand_complication, lid_oriel_one_of_12, lid_heritage_watch, lid_player_edition_watch | the movement, the dial, who wore it |
| Yachts and jets | lid_aurel_40, lid_aurel_80, lid_superyacht_110, lid_gigayacht_160, lid_stratos_light, lid_stratos_longrange | range, berths, crew |
| Art, wine, fashion | lid_emerging_print, lid_gallery_piece, lid_masterwork, lid_wine_case_everyday, lid_wine_rare_vintage, lid_wine_legendary_lot, lid_velour_wardrobe, lid_velour_atelier, lid_couture_season | the artist or estate (§9.3, §9.4), the season |
| Experiences, philanthropy, trophies | lid_gala_table, lid_private_concert, lid_orbital_flight, lid_hospital_wing, lid_museum_wing, lid_scholarship_fund, lid_public_space, lid_sports_franchise | what it does for the city; the franchise is §6.8 |

14 §3.7.7 says "46 catalog defs"; its tables hold 45 rows, one of which is `lid_player_edition_watch` (player editions), so there are 44 authored defs. This file lists all 45 rows; the count in 14 is a slip (recorded in 22-notes). The superyacht builder for `lid_superyacht_110` is Aurel Marine or a player `yacht_builder` (§6.3).

### §9.3 Artist roster (40 in 4 tiers) → content/artists.json

Gallery pieces (14 `lid_gallery_piece`) are sold in NPC gallery drops; the artist tier sets the price inside 14's band: tier 1 $250k–$600k, tier 2 $600k–$1.2M, tier 3 $1.2M–$2.5M, tier 4 $2.5M–$5M (DEFAULT). Masterworks are by the 12 historic masters (§9.5). Emerging prints (`lid_emerging_print`) are by tier-1 artists. A living artist moves up one tier with probability 0.1 per chapter if their pieces resold above band midpoint twice (16 history).

| artistId | Name | Bloc | Medium | Tier | Signature series |
|---|---|---|---|---|---|
| `art_01` | Nora Abernathy | FDL | oil | 4 | Harbour Studies |
| `art_02` | Theo Castellan-Reid | FDL | textile | 1 | Night Ledgers |
| `art_03` | Wren Hollister | FDL | mixed media | 1 | Salt and Brass |
| `art_04` | Miles Okonkwo | FDL | large-format photography | 3 | Quiet Machines |
| `art_05` | Jade Pemberton | FDL | ink on paper | 3 | Weather Rooms |
| `art_06` | Caleb Ashworth | FDL | light installation | 4 | Paper Cities |
| `art_07` | Rosa Delgado-Finch | FDL | bronze | 2 | Inland Seas |
| `art_08` | Owen Thackeray | FDL | glass | 2 | Small Hours |
| `art_09` | Cécile Varenne | EUN | oil | 1 | Copper Fields |
| `art_10` | Matteo Lanzani | EUN | textile | 3 | Lantern Days |
| `art_11` | Ilse Brandauer | EUN | mixed media | 1 | Open Books |
| `art_12` | Bastien Morel | EUN | large-format photography | 2 | Glass Gardens |
| `art_13` | Giulia Ferraris | EUN | ink on paper | 3 | After the Close |
| `art_14` | Anselm Kreutzer | EUN | light installation | 2 | North Light |
| `art_15` | Livia Santangelo | EUN | bronze | 1 | River Notes |
| `art_16` | Fabien Lacoste | EUN | glass | 3 | Tide Tables |
| `art_17` | Aoi Fujimura | PYN | oil | 2 | Market Faces |
| `art_18` | Kenji Arakawa | PYN | textile | 1 | Folded Maps |
| `art_19` | Mei Lanfang | PYN | mixed media | 2 | Late Trains |
| `art_20` | Haru Tsukishima | PYN | large-format photography | 2 | Stone Choirs |
| `art_21` | Seo Yunhee | PYN | ink on paper | 1 | Ash Orchards |
| `art_22` | Yuki Kaneshiro | PYN | light installation | 4 | Blue Hours |
| `art_23` | Bao Thanh | PYN | bronze | 2 | Grain |
| `art_24` | Ren Mizoguchi | PYN | glass | 2 | Heirlooms |
| `art_25` | Astrid Solheim | NKR | oil | 1 | Long Exposure |
| `art_26` | Einar Kvalvik | NKR | textile | 2 | The Ledger Series |
| `art_27` | Freja Lund | NKR | mixed media | 1 | Dust and Gold |
| `art_28` | Vidar Næss | NKR | large-format photography | 1 | Echo Rooms |
| `art_29` | Tove Granqvist | NKR | ink on paper | 3 | Field Recordings |
| `art_30` | Gunnar Ekdahl | NKR | light installation | 1 | Winter Coats |
| `art_31` | Sigrid Hovland | NKR | bronze | 1 | Borrowed Light |
| `art_32` | Ulf Brandt | NKR | glass | 2 | Signal and Noise |
| `art_33` | Ximena Arguedas | SRL | oil | 2 | Thresholds |
| `art_34` | Lautaro Pizarro | SRL | textile | 3 | Kites |
| `art_35` | Paloma Echeverría | SRL | mixed media | 1 | Furnace |
| `art_36` | Tadeo Villalba | SRL | large-format photography | 4 | Marble Weather |
| `art_37` | Luz Marina Ocampo | SRL | ink on paper | 3 | Nets |
| `art_38` | Gael Sotomayor | SRL | light installation | 1 | Distant Shores |
| `art_39` | Renata Iturbe | SRL | bronze | 1 | Iron Lace |
| `art_40` | Nahuel Calfucura | SRL | glass | 1 | Sun Prints |

### §9.4 Wine estates (for rare vintages and legendary lots)

Rare vintage cases and legendary cellar lots name an estate and a vintage year (game year of the vintage, Y−3 to Y−40 relative to genesis, from 06's collectible prehistory). Estates (fictional, all EUN or SRL wine country): Domaine Lescure (Valcourt valley), Château Varenne-Haut (Valcourt), Tenuta Belcanto (Meridia hinterland), Weingut Alpstein (Belmara Vineyard Slopes), Bodega Cerro Alto (Alta Verde), Viña Cumbre Blanca (Alta Verde), Clos des Ateliers (Valcourt), Tenuta Rialto Vecchio (Meridia). Vintage quality draw per estate-year U(0.6, 1.0) from 06's wine index seed.

### §9.5 Unique items at launch (131)

14 notes asked for "about 30" uniques; 14 §3.7.7 itself requires 12 Vetro classics, 20 heritage watches, 60 masterworks, the island lots, 15 crown residences and 15 sports franchises. The full launch set is therefore: 9 island lots (§3.5), 15 skyline crown residences (§3.4), 15 sports franchises (§6.8), 12 Vetro classics, 20 heritage watches, 60 masterworks = 131. Masterworks and watches are owned by NPC collectors (dynasties of §10.4 hold 40%, Serena Trust 10%, museums 30% (never sold), private NPC collectors 20%) until an estate sale or a dynasty dispute (16) puts them at auction.

**Marchetti 250 "Vetro" classics (12)**: `uq_vetro_01`–`uq_vetro_12`, chassis numbers 0712, 0731, 0744, 0758, 0763, 0779, 0786, 0791, 0803, 0815, 0822, 0838; nicknames: "Lagoon Blue", "The Alpine Car", "Rosso Notte", "The Ambassador", "Silver Arrowhead", "Bianca", "The Rialto Car", "Ottavo", "The Last Spider", "Verde Belmara", "The Long Nose", "Gilt Edge". Each carries a provenance line naming 1–3 previous owners from the NPC dynasties or §0.4 names.

**Heritage watches (20)**: `uq_hwatch_01`–`uq_hwatch_20`, makers Vael (8), Oriel (6), Kessler (3, historic military issue), and the defunct houses Maison Ardent (2) and Horlogerie Lune (1). Names: "The Cartographer", "Admiral's Reference", "The Night Ledger", "Perpetual No. 1", "The Glacier Minute Repeater", "Moonphase for the Opera", "The Twin Barrel", "Lune Céleste", "Ardent Tourbillon 1", "Ardent Tourbillon 2", "The Diver of Skarvik", "Field Issue 7", "Field Issue 9", "The Bourse Chronograph", "The Belmara Calendar", "Oriel Prototype A", "Oriel Prototype B", "The Gilt Repeater", "Equation of Time", "The Last Commission".

**Masterworks (60)**: `uq_mw_01`–`uq_mw_60`, 5 by each of 12 historic masters. Masters: Aurelio Benvenuti (EUN); Margarethe Vollrath (EUN); Josias Pell (FDL); Hester Wainwright (FDL); Ishiyama Kōun (PYN); Lin Zhaoyan (PYN); Halvard Rønne (NKR); Ingeborg Sæther (NKR); Inés de Arrieta (SRL); Mateo Quispe Laredo (SRL); Clément Daubigny-Roux (EUN); Abigail Thorne (FDL). Titles in id order (master = `(id−1) mod 12`): 01 The Harbour at Dusk; 02 Portrait of a Banker; 03 Lagoon Morning; 04 The Ledger Keeper; 05 Wheat Before Rain; 06 The Bridge at Valcourt; 07 Snow on the Fjord; 08 The Copper Market; 09 Girl with a Brass Lamp; 10 Still Life with Scales; 11 The Shipwright; 12 Evening on the Canal; 13 The Mountain Spa; 14 Coffee Pickers; 15 The Exchange Floor; 16 Two Sisters; 17 Storm over Skarvik; 18 The Orchard Wall; 19 Red Mesa; 20 The Lighthouse Keeper; 21 Night Train to Mirako; 22 The Temple Steps; 23 Herring Boats; 24 The Gilt Mirror; 25 Self-Portrait in Grey; 26 The Salt Pans; 27 Harvest Festival; 28 The Iron Foundry; 29 Woman Reading a Letter; 30 The Vineyard Slopes; 31 Cranes over Tessan; 32 The Card Players; 33 Winter Market; 34 The Bay of Pelicans; 35 The Old Bourse; 36 Boats at Lantern Cay; 37 The Clockmaker; 38 Morning Prayer; 39 The Lake at Belmara; 40 Pines in Wind; 41 The Merchant's Daughter; 42 Moonrise over the Cays; 43 The Rope Walk; 44 The Blue Doorway; 45 Fishermen Mending Nets; 46 The Grand Canal in Fog; 47 The Wheat Exchange; 48 A Quiet Room; 49 The Signal Tower; 50 Copper Terraces; 51 The Dancer; 52 Field of Flax; 53 The Northern Lights; 54 The Cathedral Rise; 55 Market Day in Cobreval; 56 The Glass Factory; 57 The Ferryman; 58 Autumn Ledger; 59 The Last Harvest; 60 Figures on a Pier. Museums holding the 18 never-sold works: Meridia Civic Gallery, Port Avalon Museum of Art, Kaiyo National Collection, Nordhaven Kunsthall, Museo Alta Verde.

### §9.6 Collection sets (9, 14 §3.9)

Names, requirements and titles are 14's; display strings `set.<setId>.name` and `set.<setId>.title` = 14's Name and Title columns. Set badge art brief: a brass medallion with the set's central object (yacht, watch, car, museum, globe, bottle, jet, maker's mark, starter key).

### §9.7 Titles and milestones text

Milestone names and rewards are 14 §3.5.1; title strings `title.<id>`. Additional decor items referenced by 14 and 18 (`dec_<id>`): First Dollar framed bill, champagne bucket, house keys, gavel, watch box, league pennant, fountain pen, laptop lab, crest frame, storefront awning (Starter Stripe), trade receipt frame (Brass Edge), watchlist theme (Ledger Green), card designs "First steps", "Two doors", "Owner", "Three Doors" (M_THREE_BUSINESSES), "Firewall" badge. Experience title "Orbital"; philanthropy titles "Patron of the Arts" (set), "Benefactor" (cumulative donations ≥ $10M real), "Founder of the Wing" (hospital or museum wing), "Friend of the City" (public space sponsor 3 chapters); Gilt titles "Cover Star · Q<n>", "Climber of the Quarter", "Most Generous · Q<n>".

### §9.8 Backgrounds (4, 14 §3.1.4) → strings `bg.<id>.*`

| Background | Display name | Text (EN, shown at character creation) |
|---|---|---|
| DROPOUT_CODER | Dropout coder | You left the lecture hall for the terminal. Your first clients were friends who needed a website; now you want to build something of your own. |
| EX_BANK_INTERN | Ex-bank intern | Six months on a trading floor taught you how money really moves. Then the internship ended. You kept the habit of reading the news before breakfast. |
| STREET_FLIPPER | Street flipper | You can tell a fake sneaker by the stitching and a good deal by the seller's face. Buy low, sell to the right person, repeat. |
| BARISTA_WITH_A_PLAN | Barista with a plan | You know every regular's order and every supplier's price. One cart, one corner, and a notebook full of numbers. |

### §9.9 Heir traits (6, 14 §3.15.4)

| Trait | Display name | Text (EN) |
|---|---|---|
| BUILDER | The Builder | Raised on building sites. Upgrades cost 5% less for one chapter. |
| QUANT_RAISED | Quant-raised | Grew up with spreadsheets. Research Desk and analysts cost 10% less for one chapter. |
| DIPLOMAT | The Diplomat | Knows everyone, offends no one. Reputation recovers twice as fast for one chapter. |
| COLLECTOR | The Collector | Remembers every heirloom's story. Heirlooms age a little more gracefully. |
| STEWARD | The Steward | Runs a tight household. Staff costs 10% less for one chapter. |
| SPARTAN | The Spartan | Needs little. Lifestyle upkeep 10% less for one chapter. |

### §9.10 Donation causes (12) → content/causes.json

`life.donate { causeId }` (14 §4). Each cause is run by a fictional foundation; the Gilt List "Most Generous" names the cause.

| causeId | Cause | Foundation |
|---|---|---|
| cause_hospitals | Hospitals and care | Carewell Foundation for Hospitals |
| cause_schools | Schools and scholarships | Open Ledger Scholarship Trust |
| cause_arts | Museums and the arts | Friends of the Civic Galleries |
| cause_music | Music and performance | Opera Quay Music Fund |
| cause_parks | Parks and public spaces | Green Commons Trust |
| cause_housing | Affordable housing | Hearth Housing Alliance |
| cause_oceans | Oceans and coasts | Saltwind Ocean Trust |
| cause_research | Medical research | Lumen Research Foundation |
| cause_disaster | Disaster relief | First Light Relief |
| cause_literacy | Libraries and literacy | Lantern Libraries |
| cause_heritage | Historic buildings | Stone and Brass Heritage Fund |
| cause_youth_sport | Youth sport | Fair Play Youth Sport |

### §9.11 Clubs: interiors and invitations (14 §3.12.1)

| Club | Venue (fictional address) | Interior art brief | Invitation text (EN) |
|---|---|---|---|
| Harbor Club | Old Harbor, Port Avalon (branches in every bloc capital) | panelled bar over the water, ship models, brass lamps | The Harbor Club would be glad to count you among its members. Dues are billed each quarter. |
| Glasshill Circle | Glasshill, Port Avalon | glass-walled dining room above the city, long table, one painting | The Circle meets the evening before each central-bank decision. A seat has been kept for you. |
| Summit Society | Summit Estates, Port Avalon | library with a fire, leather chairs, a map table | The Society invites you to join a small company of people who sit on boards. |
| The Back Room | no address is given | a narrow room, one lamp, a ledger on the table | Someone you have not met thinks you should come by. Bring cash. |

**Hosting texts** (14 §3.12.2): invitation `host.<kind>.invite` = "{host} invites you to {kind} at {home}, {date}."; DINNER "a dinner for eight", PARTY "an evening party", GALA "a gala". Wire line (consented): "{host} hosted {kindArticle} at {home}; {count} guests." Gala table (`lid_gala_table`) Wire line: "The {city} charity gala raised funds for {cause}." Central-bank Gala (Glasshill Circle): "The {bloc} Gala, on the eve of the {centralBank} decision."

### §9.12 Gilt List editorial templates (14 §3.16)

Issue masthead: "The Gilt List · {scope} · Quarter {q}, Year {y}". Section headers: "The Hundred", "Climbers", "Most Flamboyant", "Most Generous", "Cover Star". Cover line templates (one picked by `hash(issueId)`): "{name}: the quarter belonged to them"; "How {name} climbed {rankDelta} places"; "{name} and the house on {district}"; "A new name at the top: {name}"; "{name}, {houseName}, and the long game". Row line: "{rank}. {name} · {nwBucket} · {homeCity}". Never shows amounts below the bucket rule (15) or any position.

### §9.13 Crest parts library (Houses, alliances, funds, banks) → content/crest_parts.json

Counts follow 14 §3.7.7 (24 shields, 60 charges, 12 tinctures), above 17's minimums (12, 40). Mottos are chosen from a list (no free text, moderation, 21).

- **Shields (24)**: heater, kite, round, square, lozenge, oval, banner, pavise, tablet, cartouche, roundel, hexagon, octagon, swallowtail pennant, scroll, keystone, arch, gable, shield-with-chief, shield-with-base, notched heater, twin-lobed, tower shield, seal.
- **Charges (60)**: anchor, key, crossed keys, bell, lantern, ship, compass, scales, ledger, quill, gear, anvil, hammer, ear of wheat, coffee branch, grape vine, oak leaf, pine, olive branch, laurel, rose, lily, star, sun, crescent moon, comet, mountain, wave, river bend, bridge, tower, crown, gate, column, arch, beehive, owl, falcon, heron, fox, stag, bear, wolf, lion, horse, dolphin, whale, crane, swallow, salmon, hourglass, telescope, sextant, chain link, coin, bar of gold, lightning bolt, flame, open book, hand holding a torch.
- **Tinctures (12)**: drawn from the active palette's accent family (17 §3.3.1) as 12 named tones: Brass, Gold, Ivory, Ink, Oxblood, Forest, Sea, Slate, Copper, Ash, Midnight, Teal.
- **Divisions (8)**: plain, per pale, per fess, per bend, quarterly, chevron, chief, bordure.
- **Mottos (40, EN with FR translation keys)**: Steady hands; By the tick; Patience pays; Build, then buy; Fortune favours the prepared; Nothing without risk; Honest ledgers; We keep our word; From the corner shop; The long game; Quiet money; Above the noise; Rise by work; Trade fair, sleep well; The harbour holds; Light the way; Bend, do not break; Measure twice; Count the cost; Hold the line; First in, last out; Seen and unafraid; For those who follow; One more season; Brick by brick; Earn the view; By sea and ledger; Keep the faith; Few words, many deeds; Ever onward; Stand together; Fair winds; The door is open; Truth in numbers; Make it last; Grow the orchard; Mind the margin; Through every storm; Our name is our bond; Lead by example.

### §9.14 Rank shell art briefs (r0–r6, 17 §3.12)

| Shell | Rank | Material and scene brief |
|---|---|---|
| r0 | Broke | a cracked phone on a rented-room table; cold light; a coffee ring on the desk |
| r1 | Hustler | a new phone and a notebook in a studio flat; morning light |
| r2 | Owner | a laptop on a loft workbench; brick wall, plants, late afternoon |
| r3 | Mogul | a three-screen desk in a penthouse; city lights below; brass desk lamp |
| r4 | Tycoon | a private office, walnut and brass, framed first dollar on the wall |
| r5 | Titan | a glass trading floor above the CBD at dusk; staff silhouettes |
| r6 | Dynasty | an island control room: stone, glass, the sea at night, the crest above the door |

## §10 The living world → content/actors.json, content/politics.json, content/news.json, content/world_events.json

### §10.1 Named actor roster (600 at launch)

16 §3.3.1 lists per-archetype counts that add up to **532**, while 00 §5.7 and 16 acceptance test 12 require exactly 600. This file keeps every 16 count and adds 68 actors for institutions this catalog defines and that 16's roster leaves without a leader (DEFAULT, Mathis may override; recorded in 22-notes):

| Archetype | 16 count | Added here | Total | What the added actors run |
|---|---|---|---|---|
| CENTRAL_BANKER | 15 | — | 15 | — |
| FINANCE_MINISTER | 5 | — | 5 | — |
| REGULATOR_HEAD | 5 | 4 | 9 | The Exchange Authority chair, the Stabilizer Board chair, the Isla Serena Free-Zone Authority head, the Tender Board president (§2.2) |
| REGULATOR_OFFICIAL | 15 | 10 | 25 | 5 deposit-guarantee fund heads and 5 asset-management company (bad bank) heads (§2.1) |
| JUDGE | 20 | — | 20 | — |
| POLITICIAN | 60 | — | 60 | — |
| BANK_CEO | 25 | — | 25 | (Serena Private Bank is run by a LENDER_OWNER, §5.1) |
| FUND_PRINCIPAL | 30 | 5 | 35 | the 5 sovereign wealth funds (§2.1); the 40 NPC funds of §5.4 already reconcile to 30 principals |
| INSURER_CEO | 10 | 3 | 13 | Lanyard Specialty, Ridgeline Surety and Credit, Aerie Specialty (§5.6) |
| RATING_HEAD | 3 | — | 3 | — |
| EXCHANGE_HEAD | 5 | 1 | 6 | The Clearing House (ccp_TCH) chief executive |
| CEO | 115 | 31 | 146 | 30 NPC lab heads (§7.4) and the Lantern Proxy Advisors head |
| FOUNDER | 40 | — | 40 | — |
| DYNASTY_MEMBER | 96 | — | 96 | — |
| EDITOR | 30 | 12 | 42 | the 12 named sector analysts of 16 §3.6.6 (§10.8), modelled as EDITOR actors without an outlet |
| RUMOR_SOURCE | 20 | — | 20 | — |
| SUPPLIER_OWNER | 12 | 2 | 14 | owners of the 2 largest private global data brokers (Common Tape Consortium, Globe Archive Partners, §7.2) |
| LENDER_OWNER | 8 | — | 8 | — |
| CRIME_CREW | 10 | — | 10 | — |
| UNION_LEADER | 8 | — | 8 | — |
| ARBITRATOR | 0 | — | 0 | drawn from JUDGE |
| **Total** | **532** | **68** | **600** | |

New cities add exactly 40 actors with 16's mix (16 §3.3.1) plus the 2 lab heads of the city's 2 new labs, who are counted inside the 19 BACKGROUND owners (DEFAULT).

### §10.2 Trait and goal distributions per archetype (generator `actor`) → content/actor_archetypes.json

Traits are Beta(α, β) draws on [0, 1] (16 `Traits`); written as mean / spread, where Beta parameters are `α = m·k`, `β = (1−m)·k` with k = 8 unless stated. Goals list the 2–5 goal kinds with base weights (jitter ±0.05, renormalised). Ideology for archetypes that have one: each axis `N(μ_bloc, 0.35)` clamped to [−1, 1], with bloc means from §10.5.

| Archetype | risk | aggr | patience | integrity | loyalty | ambition | social | competence | Goals (weights) |
|---|---|---|---|---|---|---|---|---|---|
| CENTRAL_BANKER | 0.3 | 0.25 | 0.75 | 0.85 | 0.6 | 0.5 | 0.5 | 0.75 | STABILIZE_PRICES .6, PROTECT_REPUTATION .25, ADVANCE_POLICY .15 |
| FINANCE_MINISTER | 0.45 | 0.45 | 0.5 | 0.65 | 0.7 | 0.7 | 0.7 | 0.65 | WIN_ELECTION .35, ADVANCE_POLICY .35, PROTECT_REPUTATION .30 |
| REGULATOR_HEAD | 0.3 | 0.55 | 0.6 | 0.8 | 0.6 | 0.55 | 0.45 | 0.7 | ADVANCE_POLICY .4, PROTECT_REPUTATION .35, PUNISH_RIVAL .25 |
| REGULATOR_OFFICIAL | 0.3 | 0.45 | 0.6 | 0.8 | 0.65 | 0.45 | 0.4 | 0.65 | ADVANCE_POLICY .5, PROTECT_REPUTATION .5 |
| JUDGE | 0.25 | 0.3 | 0.8 | 0.9 | 0.5 | 0.4 | 0.4 | 0.75 | PROTECT_REPUTATION 1.0 |
| POLITICIAN | 0.5 | 0.5 | 0.45 | 0.55 | 0.6 | 0.75 | 0.75 | 0.55 | WIN_ELECTION .45, ADVANCE_POLICY .35, EXPAND_INFLUENCE .20 |
| BANK_CEO | 0.4 | 0.45 | 0.55 | 0.65 | 0.55 | 0.65 | 0.55 | 0.65 | PRESERVE_LIQUIDITY .30, GROW_SHARE .30, MAXIMIZE_RETURN .25, PROTECT_DEPOSITORS .15 |
| FUND_PRINCIPAL | 0.6 | 0.55 | 0.45 | 0.6 | 0.45 | 0.7 | 0.5 | 0.65 | MAXIMIZE_RETURN .6, PROTECT_REPUTATION .2, GROW_SHARE .2 |
| INSURER_CEO | 0.35 | 0.4 | 0.65 | 0.7 | 0.6 | 0.55 | 0.5 | 0.65 | PRESERVE_LIQUIDITY .4, MAXIMIZE_RETURN .4, PROTECT_REPUTATION .2 |
| RATING_HEAD | 0.3 | 0.35 | 0.65 | 0.7 | 0.55 | 0.5 | 0.45 | 0.7 | PROTECT_REPUTATION .6, GROW_SHARE .4 |
| EXCHANGE_HEAD | 0.4 | 0.4 | 0.6 | 0.7 | 0.6 | 0.6 | 0.55 | 0.65 | GROW_SHARE .5, PROTECT_REPUTATION .5 |
| CEO | 0.5 | 0.5 | 0.5 | 0.6 | 0.5 | 0.65 | 0.55 | 0.6 | MAXIMIZE_RETURN .4, GROW_SHARE .35, PROTECT_CONTROL .25 |
| FOUNDER | 0.65 | 0.55 | 0.4 | 0.6 | 0.55 | 0.75 | 0.55 | 0.55 | INDEPENDENCE .4, GROW_SHARE .4, MAXIMIZE_RETURN .2 |
| DYNASTY_MEMBER | 0.45 | 0.45 | 0.55 | 0.55 | 0.65 | 0.55 | 0.6 | 0.5 | heads per 16 §3.4.2; others PROTECT_CONTROL .3, MAXIMIZE_RETURN .3, EXPAND_INFLUENCE .2, SECURE_SUCCESSION .2 |
| EDITOR | 0.45 | 0.5 | 0.45 | 0.65 | 0.55 | 0.6 | 0.65 | 0.6 | SCOOP .5, PROTECT_REPUTATION .3, ADVANCE_POLICY .2 |
| RUMOR_SOURCE | 0.6 | 0.45 | 0.35 | 0.45 | 0.4 | 0.6 | 0.75 | 0.5 | SCOOP .7, EXPAND_INFLUENCE .3 |
| SUPPLIER_OWNER | 0.45 | 0.4 | 0.55 | 0.65 | 0.6 | 0.55 | 0.55 | 0.6 | DEPENDABLE_CUSTOMERS .5, MAXIMIZE_RETURN .3, INDEPENDENCE .2 |
| LENDER_OWNER | 0.45 | 0.45 | 0.55 | 0.6 | 0.55 | 0.6 | 0.5 | 0.65 | MAXIMIZE_RETURN .5, PRESERVE_LIQUIDITY .3, DEPENDABLE_CUSTOMERS .2 |
| CRIME_CREW | 0.8 | 0.75 | 0.3 | 0.1 | 0.6 | 0.6 | 0.35 | 0.55 | MAXIMIZE_RETURN .7, PUNISH_RIVAL .3 |
| UNION_LEADER | 0.45 | 0.6 | 0.5 | 0.7 | 0.75 | 0.55 | 0.7 | 0.55 | ADVANCE_POLICY .6, PROTECT_REPUTATION .4 |

**Corrupt minority** (16 §3.3.3): `integrity < 0.25` is allowed only for CRIME_CREW (all), and with probability 0.06 for POLITICIAN, 0.04 for CEO, 0.03 for FUND_PRINCIPAL (integrity then drawn U(0.05, 0.24)); every other archetype is clamped to ≥ 0.30.

### §10.3 Actor names, ages and careers (generator `actor`)

Stream `rng('content/actor/<archetype>/<n>', worldSeed)`. Name = given + family from §0.4 pools of the actor's bloc; 8% of actors draw the family name from another bloc's pool (mobility). Dynasty members take the dynasty name (spouses keep theirs with p 0.5). Age at genesis by archetype: CENTRAL_BANKER U(50, 68), JUDGE U(48, 70), POLITICIAN U(35, 70), CEO U(42, 66), FOUNDER U(26, 55), EDITOR U(35, 65), RUMOR_SOURCE U(25, 60), dynasty heads U(58, 80), heirs U(22, 45), others U(30, 65).

Career history: 2–4 prior entries `{roleKey, institutionId}` drawn backwards in time (each 3–12 actor-years) from the archetype's feeder list: CENTRAL_BANKER ← {treasury official, university economist (§7.4 universities), bank chief economist}; REGULATOR_* ← {regulator official, law firm partner (§8.5), bank compliance head}; JUDGE ← {law firm partner, regulator counsel}; BANK_CEO ← {bank division head, rival bank CFO}; FUND_PRINCIPAL ← {bank trader, fund portfolio manager}; CEO ← {COO of a same-sector company, CFO, consultancy partner}; EDITOR ← {reporter, columnist}; POLITICIAN ← {mayor, union leader, business owner, lawyer}. Institutions are drawn from the same bloc's catalog entries of the matching kind. Role strings: `career.<roleKey>`.

### §10.4 Dynasties (12) → content/dynasties.json

16 §3.4.1: 2–3 per bloc, a head and 7 other members each (96 DYNASTY_MEMBER actors), 1–3 holding companies, 3–8 listed stakes of 5–40%, 2–6 private firms (§6.9), 1–3 nominee shell layers, 2–4 influence assets. World totals required by 16 and met below: 8 controlled lenders, 9 controlled outlets, 6 shipping or logistics groups, 10 industrial groups, 12 city real-estate portfolios, 20 political ties.

| dynastyId | Family | Bloc | Seat | Succession | Holding companies (`cmp_`) | Listed stakes (ticker %) | Influence assets |
|---|---|---|---|---|---|---|---|
| `dyn_calloway` | Calloway | FDL | Summit Estates, Port Avalon | PRIMOGENITURE | Calloway Holdings; Sterling & Vane Holdings | AVNB 8, BCNB 22, HRLW 12, MRQR 9 | lender Charter Street Bank; outlet Beacon Broadcasting; industrial Harlow Machinery; RE portfolio Port Avalon; 2 political ties |
| `dyn_whitlock` | Whitlock | FDL | The Bluffs, Lakemont | DESIGNATED | Whitlock Family Office | LKSB 11, LKCH 18, UNRL 14 | lender Northshore Savings and Loan; industrial Lakemont Chemical; RE portfolio Lakemont; 2 political ties |
| `dyn_ashby` | Ashby | FDL | Mesa Heights, Redmesa | MERIT | Ashby Capital; Mesa Land Trust | MGRD 9, SNWL 15, GRPK 30, BAYL 10 | logistics Bayline Logistics; industrial Granite Peak Aggregates; RE portfolio Redmesa; outlet Cardinal News Group; 1 political tie |
| `dyn_serrano` | Serrano | EUN | Palazzo Serrano, Meridia | PRIMOGENITURE | Serrano Holding; Laguna Nominees | ARCM 20, IMRL 25, MRCA 15, FTRG 8 | lender Banque Lagunaire; outlet Arcadia Media; RE portfolio Meridia; 2 political ties |
| `dyn_halden` | Halden | EUN | Lakeside Promenade, Belmara | COUNCIL_VOTE | Halden Familienholding; Halden Motorenwerk | BLMP 30, VAEL 12, ALPG 20 | lender Belmara Cantonal Bank; industrial Halden Motorenwerk; insurer Halden Assurance (private); RE portfolio Belmara; 2 political ties |
| `dyn_delacourt` | Delacourt | EUN | Cathedral Rise, Valcourt | DESIGNATED | Delacourt Participations | FOLM 18, OSTR 14, LCRX 9, DNBR 12 | outlet Folio Media; industrial Ostrava Steel; logistics Danubia Rail; RE portfolio Valcourt; 1 political tie |
| `dyn_tachibana` | Tachibana | PYN | Temple Hill, Mirako | PRIMOGENITURE | Tachibana Kōsan; Shinbashi Nominees | SHBN 25, RYJN 10, KYSB 16, KYLD 12 | lender Shinbashi Trust Bank; outlet Shinbun Media Group; industrial Kaiyo Shipbuilding; shipping Kaiyo Shipbuilding yards; RE portfolio Kaiyo City and Mirako (2); 2 political ties |
| `dyn_amamiya` | Amamiya | PYN | Fab Island, Tessan | MERIT | Amamiya Holdings | TFAB 12, HKRB 15, ATLF 9, TSIP 20 | outlet Hikaru Broadcasting; shipping Atlas Freight; industrial Tessan Fab Works; RE portfolio Tessan; 2 political ties |
| `dyn_halvorsen` | Halvorsen | NKR | Birch Hills, Nordhaven City | PRIMOGENITURE | Halvorsen Holding AS; Fjord Nominees | HLVR 35, NRDL 34, SAGA 15 | lender Fjordbanken; shipping Nordline Shipping; outlet Saga Broadcasting; RE portfolio Nordhaven City; 2 political ties |
| `dyn_strandberg` | Strandberg | NKR | Herring Quay, Skarvik | COUNCIL_VOTE | Strandberg Invest | SKOF 18, HVBK 25, VARG 12, MRGN 10 | shipping Varg Marine Engineering; industrial Skarvik Offshore; outlet Morgen Media Group; RE portfolio Skarvik and Vintra (2); 1 political tie |
| `dyn_cobos` | Cobos | SRL | Old Town Hill, Cobreval | PRIMOGENITURE | Grupo Cobos; Cerro Nominees | CBMY 22, PTSL 18, CNSL 12, CMAL 15 | lender Banco del Cobre; shipping Puerto Sur Logistics; industrial Cobre Mayor and Cementos Alta (2); outlet Canal Sol; 2 political ties |
| `dyn_larrain` | Larrain | SRL | Coffee Slopes, Alta Verde | DESIGNATED | Inversiones Larrain | CFTU 30, GRDV 14, DIAU 20, PLYA 8 | lender Caja Popular Alta Verde; outlet Diario Austral Group; industrial Cafetales Unidos; RE portfolio Alta Verde and Sundara Coast (2); 1 political tie |

Tally: lenders 8 (Charter Street, Northshore, Banque Lagunaire, Belmara Cantonal, Shinbashi Trust, Fjordbanken, Banco del Cobre, Caja Popular Alta Verde, matching §5.1); outlets 9 (Beacon, Cardinal, Arcadia, Folio, Shinbun, Hikaru, Saga, Morgen, Diario Austral; Canal Sol is a 12% non-controlling stake counted as a political-adjacent holding, not a controlled outlet); shipping or logistics 6 (Bayline, Danubia Rail, Kaiyo Shipbuilding yards, Atlas Freight, Nordline, Varg, Puerto Sur: Kaiyo yards and Atlas count once together as the Tachibana–Amamiya joint venture pact at genesis); industrial 10 (Harlow, Lakemont Chemical, Granite Peak, Halden Motorenwerk, Ostrava Steel, Kaiyo Shipbuilding, Tessan Fab Works, Skarvik Offshore, Cobre Mayor + Cementos Alta as one group, Cafetales Unidos); RE portfolios 12 city portfolios; political ties 20. Controlled share of a listed company is the stake shown (5–40%, 16) through 1–3 nominee layers; tickers above 30% are disclosed under 15's filing rules via the nominee.

**Members (8 per family, generator).** Head (age per §10.3), spouse, 2–3 children (heir candidates), 1–2 siblings, 1 cousin, filling to 8; designated heir for DESIGNATED families = the child with highest competence at genesis. Each family starts with 1 faction pair (aims drawn from EXPAND, SELL, MODERNIZE, CONSERVE) and the feuds and pacts: feuds Calloway–Ashby (0.5), Serrano–Delacourt (0.6), Cobos–Larrain (0.4); pacts Tachibana–Amamiya (JOINT_VENTURE), Halvorsen–Strandberg (MARRIAGE), Whitlock–Calloway (CROSS_HOLDING).

**New dynasties** (16 §3.4.7) take the founder actor's family name: "the <Family> family".

### §10.5 Parties (20) → content/parties.json

4 per bloc, one per (econ, reg) quadrant (16 §3.5.1). Position = (econ, reg, trade, tech); trade and tech are fixed here inside U(−0.6, 0.6). Launch seat shares sum to 300 per bloc and form the genesis government by 16 §3.5.2.

| partyId | Bloc | Party | Quadrant (econ, reg) | Position (econ, reg, trade, tech) | Seats |
|---|---|---|---|---|---|
| `pty_FDL_1` | FDL | Liberty Party | +,+ | 0.6, 0.6, 0.4, 0.5 | 96 |
| `pty_FDL_2` | FDL | Union Labour Party | −,− | −0.6, −0.5, −0.2, 0.1 | 92 |
| `pty_FDL_3` | FDL | Commonwealth Party | −,+ | −0.4, 0.4, 0.3, 0.4 | 62 |
| `pty_FDL_4` | FDL | Heartland Alliance | +,− | 0.4, −0.4, −0.5, −0.3 | 50 |
| `pty_EUN_1` | EUN | Social Compact | −,− | −0.5, −0.6, 0.3, −0.1 | 94 |
| `pty_EUN_2` | EUN | Civic Liberals | +,+ | 0.5, 0.5, 0.5, 0.4 | 78 |
| `pty_EUN_3` | EUN | Greens of the Compact | −,+ | −0.5, 0.3, 0.2, −0.4 | 70 |
| `pty_EUN_4` | EUN | Patria | +,− | 0.4, −0.3, −0.5, −0.2 | 58 |
| `pty_PYN_1` | PYN | League Democratic Party | +,− | 0.5, −0.4, 0.3, 0.3 | 120 |
| `pty_PYN_2` | PYN | Progressive League | −,− | −0.4, −0.4, 0.1, 0.0 | 76 |
| `pty_PYN_3` | PYN | Harbor Reform | +,+ | 0.5, 0.5, 0.5, 0.6 | 60 |
| `pty_PYN_4` | PYN | People's Commons | −,+ | −0.6, 0.3, −0.3, 0.2 | 44 |
| `pty_NKR_1` | NKR | Labour Alliance | −,− | −0.5, −0.5, 0.3, 0.2 | 104 |
| `pty_NKR_2` | NKR | Conservative Rally | +,− | 0.5, −0.2, 0.2, 0.1 | 82 |
| `pty_NKR_3` | NKR | Northern Liberals | +,+ | 0.4, 0.6, 0.5, 0.5 | 62 |
| `pty_NKR_4` | NKR | Green Left | −,+ | −0.6, 0.2, 0.1, −0.4 | 52 |
| `pty_SRL_1` | SRL | Popular Front | −,− | −0.6, −0.6, −0.4, 0.0 | 112 |
| `pty_SRL_2` | SRL | Republican Union | +,− | 0.5, −0.3, 0.1, 0.0 | 84 |
| `pty_SRL_3` | SRL | New Coalition | +,+ | 0.6, 0.5, 0.6, 0.5 | 62 |
| `pty_SRL_4` | SRL | Andean Greens | −,+ | −0.4, 0.3, 0.0, −0.3 | 42 |

Bloc voter-median start (16 `PublicMood.voterMedian`) = the seat-weighted mean of party positions.

### §10.6 Caucuses, constituencies and the lever sector-impact table

**Caucuses (60, generator `caucus`).** 3 per party; id `cau_<partyId>_<1..3>`; seats split 45/33/22% of the party's seats (rounded, remainder to the first). Name = `<Party short> <constituency label>` (e.g. "Liberty Party – Harbour caucus"). Constituency labels and their content per bloc are drawn from this list of 12 constituency kinds, each kind used at most twice per bloc: Harbour (coastal cities; INDUSTRIALS 0.4, ENERGY 0.2, FINANCIALS 0.2, STAPLES 0.2), Financial district (capital; FINANCIALS 0.5, TECH 0.2, REAL_ESTATE 0.3), Industrial belt (slot-2 city; INDUSTRIALS 0.4, MATERIALS 0.3, ENERGY 0.3), Farm country (slot-3 city; STAPLES 0.6, MATERIALS 0.2, ENERGY 0.2), Tech corridor (TECH 0.5, SEMI 0.3, MEDIA 0.2), Suburbs (REAL_ESTATE 0.4, DISCRETIONARY 0.3, HEALTH 0.3), Public sector (HEALTH 0.4, SECURITY 0.3, STAPLES 0.3), Energy country (ENERGY 0.6, MATERIALS 0.4), Students and young workers (TECH 0.3, MEDIA 0.3, DISCRETIONARY 0.4), Retirees (HEALTH 0.5, STAPLES 0.3, FINANCIALS 0.2), Small business (DISCRETIONARY 0.4, STAPLES 0.3, REAL_ESTATE 0.3), Mining towns (MATERIALS 0.7, INDUSTRIALS 0.3). Assignment: a party's 3 caucuses take the 3 kinds whose sector mix best fits its position (econ + favours FINANCIALS, TECH; econ − favours HEALTH, STAPLES; reg − favours industrial and mining kinds) without repeating within the party. City sets: the cities named in the label, else all bloc cities. Caucus leaders are the 12 POLITICIAN actors of the bloc.

**Lever sector-impact table** (16 §3.5.6 `sectorImpact_s(bill)` for an **upward** move; a downward move flips the sign). Sectors are 06 `SectorId`s. Values in [−1, 1]; blank = 0.

| Lever | TECH | SEMI | ENERGY | MATERIALS | INDUSTRIALS | FINANCIALS | HEALTH | STAPLES | DISCRETIONARY | REAL_ESTATE | MEDIA | SECURITY |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TAX_CORP | -0.6 | -0.6 | -0.5 | -0.5 | -0.5 | -0.6 | -0.4 | -0.3 | -0.5 | -0.4 | -0.5 | -0.3 |
| TAX_TOP_INCOME | -0.3 | -0.2 |  |  |  | -0.4 |  | +0.1 | -0.4 | -0.3 | -0.2 |  |
| TAX_CAPITAL_GAINS | -0.4 | -0.3 |  |  |  | -0.6 |  |  | -0.2 | -0.4 |  |  |
| TAX_PROPERTY |  |  |  |  | -0.2 | -0.1 |  |  | -0.2 | -0.8 |  |  |
| TAX_TRANSACTION |  |  |  |  |  | -0.8 |  |  |  | -0.1 |  |  |
| TAX_INHERITANCE |  |  |  |  |  | -0.3 |  |  | -0.2 | -0.3 |  |  |
| CAP_BANK_MIN_RATIO | -0.1 | -0.1 | -0.1 | -0.1 | -0.2 | -0.7 |  |  | -0.2 | -0.4 |  |  |
| LEVERAGE_CAP_RETAIL | +0.1 | +0.1 |  |  |  | +0.5 |  |  | +0.1 |  |  |  |
| LEVERAGE_CAP_PRO | +0.1 | +0.1 | +0.1 | +0.1 |  | +0.6 |  |  |  | +0.1 |  |  |
| AI_REGISTRATION_THRESHOLD | +0.6 | +0.5 |  |  | +0.1 | +0.2 |  |  |  |  | +0.3 | -0.2 |
| DATA_SCRAPE_LEGALITY | +0.6 | +0.2 |  |  |  | +0.1 |  |  |  |  | -0.4 | -0.2 |
| TARIFF | -0.3 | -0.5 | +0.2 | +0.4 | +0.5 | -0.2 | -0.1 | +0.3 | -0.4 |  |  | +0.2 |
| SECTOR_SUBSIDY | +1 for the named sector, −0.1 for the others | | | | | | | | | | | |
| ZONING_DENSITY |  |  |  | +0.3 | +0.4 | +0.2 |  |  | +0.2 | +0.8 |  |  |
| MIN_WAGE | -0.1 |  |  | -0.2 | -0.3 |  | -0.2 | -0.5 | -0.6 | -0.1 | -0.2 | -0.3 |
| SHORT_SELLING_RULE | +0.1 | +0.1 |  |  |  | -0.5 |  |  |  | +0.1 |  |  |
| DISCLOSURE_THRESHOLD |  |  |  |  |  | +0.4 |  |  |  |  |  |  |
| CRYPTO_REGIME | +0.4 | +0.2 |  |  |  | +0.3 |  |  |  |  | +0.1 | -0.1 |
| FISCAL_SPEND | +0.2 | +0.2 | +0.3 | +0.4 | +0.6 | +0.3 | +0.6 | +0.4 | +0.5 | +0.4 | +0.2 | +0.7 |
| ANTITRUST_SHARE_THRESHOLD | +0.5 | +0.4 | +0.3 | +0.3 | +0.4 | +0.4 | +0.2 | +0.3 | +0.3 | +0.2 | +0.5 | +0.2 |
| REGULATOR_BUDGET | -0.2 | -0.1 | -0.1 | -0.1 | -0.1 | -0.5 | -0.1 |  | -0.1 | -0.1 | -0.2 | +0.2 |

Secondary consequence rules for C12 (bill in force) authored here: ZONING_DENSITY up → construction starts +10% per +0.1 (10, 91–365 d); MIN_WAGE up → FOOD_HOSPITALITY and RETAIL_CONSUMER wage cost +x (09, 0 d), prices +0.4x (09, 28–91 d); TARIFF up on a pair → import share of affected commodity −x/2 (06, 0–28 d); CRYPTO_REGIME down → Vault Exchange volume −30% per step (05, 0–7 d); SECTOR_SUBSIDY → named sector revenue +x (09, 0 d).

### §10.7 News outlets (15) and editors → content/outlets.json

Scope: bloc or WORLD. Audience: relative size 0.5–2.0 (16 §3.11.4 sale price, 16 §3.6.4 publishing). Slant = Ideology (econ, reg, trade, tech). Owner: listed company (§4.1), dynasty (§10.4) or public. Each outlet has one EDITOR actor; the other 15 EDITOR actors are deputy editors who succeed them.

| outletId | Outlet | Scope | Audience | Slant (econ, reg, trade, tech) | Owner | Controlled by |
|---|---|---|---|---|---|---|
| `out_wire` | The Wire Desk | WORLD | 2.0 | 0, 0, 0, 0 | public trust of The Exchange Authority (neutral house service, always NEUTRAL tone) | — |
| `out_ledger` | The Global Ledger | WORLD | 1.8 | 0.3, 0.3, 0.5, 0.3 | Orion Information Group (ORIG) | — |
| `out_beacon` | Beacon News | FDL | 1.4 | 0.4, 0.4, 0.2, 0.3 | Beacon Broadcasting (BCNB) | Calloway |
| `out_cardinal` | The Cardinal | FDL | 1.0 | −0.2, −0.3, −0.2, 0.0 | Cardinal News Group (CRDN) | Ashby |
| `out_arcadia` | Arcadia Sera | EUN | 1.2 | 0.2, −0.1, 0.1, 0.0 | Arcadia Media (ARCM) | Serrano |
| `out_folio` | Le Folio | EUN | 1.0 | −0.3, −0.4, 0.3, −0.2 | Folio Media (FOLM) | Delacourt |
| `out_shinbun` | Shinbun Daily | PYN | 1.5 | 0.3, −0.2, 0.2, 0.4 | Shinbun Media Group (SHBN) | Tachibana |
| `out_hikaru` | Hikaru News Network | PYN | 1.1 | 0.1, 0.2, 0.4, 0.5 | Hikaru Broadcasting (HKRB) | Amamiya |
| `out_saga` | Saga Nyheter | NKR | 0.9 | 0.0, −0.2, 0.4, 0.2 | Saga Broadcasting (SAGA) | Halvorsen |
| `out_morgen` | Morgenposten | NKR | 0.7 | 0.4, 0.2, 0.3, 0.1 | Morgen Media Group (MRGN) | Strandberg |
| `out_diario` | Diario Austral | SRL | 1.0 | −0.1, −0.2, −0.1, 0.0 | Diario Austral Group (DIAU) | Larrain |
| `out_canalsol` | Canal Sol Noticias | SRL | 1.2 | −0.4, −0.3, −0.4, 0.1 | Canal Sol (CNSL) | — (Cobos 12% non-controlling) |
| `out_compact_radio` | Compact Public Radio | EUN | 0.8 | −0.1, −0.2, 0.3, 0.0 | public broadcaster | — |
| `out_pacific_review` | The Pacific Review | PYN | 0.6 | 0.5, 0.5, 0.6, 0.6 | private (Kaiyo editorial trust) | — |
| `out_market_whisper` | Market Whisper | WORLD | 0.5 | 0.6, 0.6, 0.6, 0.7 | private (online, Isla Serena) | — |

The outlet named "The Wire" in 15/17 is the player-facing feed; The Wire Desk is its NPC house outlet that publishes every always-publish item (bills, filings, rule notices). 15 outlets = 10 owned by listed companies + 3 private + 1 public + 1 house service; 9 controlled by dynasties (16 §3.4.1).

### §10.8 Rumor sources (20) and sector analysts (12)

**Rumor sources** (16 §3.6.7; hidden accuracy U(0.40, 0.70) drawn at genesis, never published). Public names (handles and columns, never real people):

| sourceId | Name | Kind | Bloc focus |
|---|---|---|---|
| `rum_01` | The Gilt Gossip | society column | FDL |
| `rum_02` | Pier Seven | anonymous trading-floor account | FDL |
| `rum_03` | Mesa Notes | regional newsletter | FDL |
| `rum_04` | Capitol Corridor | political insider column | FDL |
| `rum_05` | La Lanterna | canal-side newsletter | EUN |
| `rum_06` | Bourse Murmurs | trading-floor column | EUN |
| `rum_07` | The Alpine Letter | private-bank newsletter | EUN |
| `rum_08` | Quai des Rumeurs | anonymous account | EUN |
| `rum_09` | Loop Whisper | anonymous account | PYN |
| `rum_10` | Neon Ward Talk | nightlife-and-deals blog | PYN |
| `rum_11` | The Delta Desk | supply-chain newsletter | PYN |
| `rum_12` | Red Lantern Notes | political column | PYN |
| `rum_13` | Fjord Murmur | anonymous account | NKR |
| `rum_14` | Rig Talk | offshore-industry newsletter | NKR |
| `rum_15` | Nordlys Brief | political column | NKR |
| `rum_16` | Quayside | shipping gossip column | NKR |
| `rum_17` | Voz del Puerto | harbour column | SRL |
| `rum_18` | El Mirador | political newsletter | SRL |
| `rum_19` | Cafetal Notes | commodities newsletter | SRL |
| `rum_20` | Serena Sundowner | island society account | world |

Circle whispers (16 §3.6.9) carry the label "Circle whispers" with no named source.

**Sector analysts** (16 §3.6.6, one per 06 sector, each at a fictional research house): TECH Priya Holloway (Keystone Research), SEMI Daiki Arai (Kanade Securities Research), ENERGY Ragna Sæther (Fjell Energy Research), MATERIALS Esteban Ferreyra (Cordillera Research), INDUSTRIALS Marek Vogel (Brenner & Kessel Research), FINANCIALS Grace Abbott (Bayard Bank Research), HEALTH Elise Morel (Lumière Santé Research), STAPLES Camila Duarte (Granero Analytics), DISCRETIONARY Mason Hollis (Main Street Research), REAL_ESTATE Hana Mori (Kaiyo Land Research), MEDIA Luca Rinaldi (Studio Brera Research), SECURITY Sigrid Holm (Skjold Research). They are EDITOR actors without an outlet (§10.1).

### §10.9 News templates → content/news_templates.json

16 §3.6.3 asks for about 400 templates. This file fixes the catalog: template id grammar `NEWS_<KIND>_<SLUG>`, the count per kind, the base weight per kind (16 §3.6.2 `base_kind`), the required slots and three tone variants each (NEUTRAL, WARM, CRITICAL; EN and FR keys `news.<id>.<tone>.headline|body`). Bodies are written by the content team against these ids (§0.5). Named templates already authored elsewhere in this file: §7.11 (16 AI), §8.8 (10 law), §10.14 (history).

| NewsKind | Base weight | Templates | Source events (owner) | Required slots | Example headline (NEUTRAL) |
|---|---|---|---|---|---|
| MACRO_DATA | 0.6 | 30 | release published (04) | release, bloc, actual, consensus, surprise | {bloc} inflation {actual}, {aboveBelow} the {consensus} forecast |
| CENTRAL_BANK | 1.0 | 24 | rate decision, speech, QE/QT (04) | centralBank, decision, rate, vote | {centralBank} {decision} rates to {rate} |
| EARNINGS | 0.5 | 30 | earnings release (06/09) | company, eps, consensus, guidance | {company} earnings {beatMiss} expectations |
| GUIDANCE | 0.45 | 12 | guidance change (09) | company, direction, metric | {company} {raises/cuts} {metric} outlook |
| PRODUCT | 0.3 | 20 | launch, recall (09) | company, product, category | {company} launches {product} |
| TRIAL | 0.6 | 10 | trial result (09 biotech) | company, drug, phase, outcome | {company}'s {drug} {passes/fails} {phase} trial |
| LAWSUIT | 0.4 | 12 | case filed (13) | claimant, defendant, caseKind | {claimant} sues {defendant} |
| VERDICT | 0.55 | 16 | verdict, settlement, sanction (13) | court, party, outcome | see §8.8 |
| M_AND_A | 0.7 | 22 | bid, tender, completion (09) | acquirer, target, premium | {acquirer} bids for {target} at a {premium} premium |
| EXEC_CHANGE | 0.35 | 12 | CEO exit or appointment (16) | company, person, role | {company} names {person} chief executive |
| SCANDAL | 0.65 | 14 | scandal fact made public (16/13) | subject, allegation | {subject} faces questions over {allegation} |
| REGULATION | 0.5 | 14 | regulator rule or registry update (13/11) | regulator, rule | {regulator} tightens {rule} |
| BILL | 0.5 | 20 | bill stage change (16), always published | bloc, lever, stage, vote | {bloc} {lever} bill {stage} |
| ELECTION | 0.8 | 14 | campaign, result, coalition (16) | bloc, parties, shares | {party} wins {seats} seats in {bloc} election |
| WEATHER | 0.5 | 16 | shock telegraph and onset (16 WEATHER) | city, event, probability | Storm watch for {city}: {probability} chance of landfall |
| GEOPOLITICS | 0.7 | 16 | GEOPOLITICAL shocks, tariffs (16) | blocs, event | Tensions rise between {blocA} and {blocB} |
| SUPPLY | 0.55 | 18 | COMMODITY_SUPPLY shock, shortage (16/06/11) | commodity, route, magnitude | {route} disruption hits {commodity} supply |
| LABOR | 0.5 | 10 | strike ballot, strike, settlement (16) | union, sector, city | {sector} workers in {city} vote on strike |
| CRYPTO_INCIDENT | 0.55 | 10 | depeg, protocol halt, venue outage (06) | token, venue, magnitude | {token} slips from its peg |
| CYBER | 0.5 | 10 | public outcome of an incident (12), CYBER_WAVE (16); outcomes only | victim, outcome | {victim} reports systems offline |
| BANKRUPTCY | 0.8 | 10 | default, failure, resolution (07/09) | entity, creditors | {entity} files for protection from creditors |
| IPO | 0.5 | 10 | filing, pricing, first trade (09) | company, exchange, price | {company} prices IPO at {price} on {exchange} |
| DYNASTY | 0.6 | 14 | dispute, succession, pact (16) | family, event | Succession at the {family} family: {heir} takes the chair |
| TECH | 0.45 | 18 | breakthrough, AI milestone (16/11) | domain, level, company | Breakthrough in {domain}: {name} |
| CITY | 0.25 | 16 | city opening, land auction, planning, completions, foreclosure sales (10) | city, district, project | {city} approves {project} in {district} |
| PLAYER_PUBLIC | 0.3 | 8 | player public statement or filing (15) | player, statement | {player}: "{statementShort}" |
| ERA | 1.0 | 5 | era change (16) | era | A new era begins: {eraName} |
| HISTORY | 0.2 | 8 | anniversary of a permanent history entry (16) | entry, years | {years} years since {entry} |

Total: 419 templates (+ the 16 AI and 10 law templates above = 445). Rumor template: "{source} hears that {claim}" (one per `claim.factKind`, 12 kinds). The 10 city news families asked for by 10 notes are inside CITY: `NEWS_CITY_OPENING`, `NEWS_CITY_LAND_AUCTION`, `NEWS_CITY_PLANNING_10K`, `NEWS_CITY_COMPLETION`, `NEWS_CITY_FORECLOSURE_SALE` (anonymous), `NEWS_CITY_DISTRICT_EVENT`, `NEWS_CITY_HALL_SNAPSHOT`, `NEWS_CITY_CROWN_CHANGE`, `NEWS_CITY_CONCESSION`, `NEWS_CITY_DISASTER_RECOVERY`.

### §10.10 Shock catalog (120) → content/shocks.json

Category weights per tier (16 §3.7.2; RIPPLE and STORM as 16's launch weights; MAJOR shifts weight to geopolitics, health and cyber):

| Tier | WEATHER | GEOPOLITICAL | LABOR | HEALTH | TECH | ACCIDENT | DISCOVERY | COMMODITY_SUPPLY | CYBER_WAVE |
|---|---|---|---|---|---|---|---|---|---|
| RIPPLE | 0.25 | 0.15 | 0.12 | 0.05 | 0.10 | 0.12 | 0.06 | 0.10 | 0.05 |
| STORM | 0.25 | 0.15 | 0.12 | 0.05 | 0.10 | 0.12 | 0.06 | 0.10 | 0.05 |
| MAJOR | 0.15 | 0.25 | 0.05 | 0.15 | 0.10 | 0.05 | 0.00 | 0.15 | 0.10 |

Defs: id `shk_<tier>_<cat>_<nn>`. Effects use 16 §3.7.4 owner hooks; magnitudes are ranges drawn at onset. Cyber defs describe outcomes only. Each line: name (scope; main effects).

- **RIPPLE · WEATHER** (8): `01` Local storm (CITY; district closures 1–2 d, 09 capacity −10–30%); `02` Heavy rain flooding (CITY; flood-flagged districts −20%, 08 small claims); `03` Heat spell (CITY; energy demand +5–10%, cooling cost +); `04` Cold snap (CITY; POWER demand +8%); `05` Fog closes the port (CITY coastal; port throughput −40% for 1–2 d); `06` Hail damage (CITY; vehicles and crops, 08 claims); `07` Lightning strike on a substation (CITY; district power cut 4–12 game hours); `08` Dust storm (CITY desert; transport −20% 1 d).
- **RIPPLE · GEOPOLITICAL** (5): `01` Trade-talk stall (BLOC; risk premium +5 bps); `02` Diplomatic spat (BLOC_PAIR; tariff-bill probability +0.05); `03` Border-inspection slowdown (BLOC; delivery lead times +10%); `04` Embassy row (BLOC; FX vol +0.2 regime); `05` Sanction threat on one firm (SECTOR; that firm −5–10% demand abroad).
- **RIPPLE · LABOR** (5): `01` Port slowdown (CITY coastal; throughput −15%); `02` Transit strike (CITY; footfall −10% for 1–3 d); `03` Warehouse walkout (CITY; warehousing capacity −20%); `04` Hospital staff protest (CITY; clinics −10%); `05` Driver shortage (BLOC; trucking rates +5%).
- **RIPPLE · HEALTH** (3): `01` Seasonal flu bump (CITY; staff absence −3% capacity); `02` Food-safety alert (SECTOR STAPLES; one category −15% demand 7 d); `03` Local outbreak closes schools (CITY; tutoring and childcare demand shift).
- **RIPPLE · TECH** (6): `01` Product recall (SECTOR; recalled firm −20% category share); `02` App-store outage (WORLD; platform orders −10% for 1 d); `03` Payments outage (BLOC; card spend shifted 1 d); `04` Satellite glitch (WORLD; alt-data feeds pause 1 d); `05` Software fault at an NPC broker (BLOC; one venue halted 1 game hour); `06` Navigation-signal outage (BLOC; logistics delays 1 d).
- **RIPPLE · ACCIDENT** (6): `01` Factory fire (CITY; one NPC plant closed 14–60 d); `02` Road closure (CITY; district footfall −20%); `03` Local power cut (CITY; businesses offline 2–8 game hours); `04` Warehouse collapse (CITY; inventory loss, 08 claim); `05` Bridge inspection closure (CITY; delivery delays); `06` Gas leak evacuation (CITY; one district closed 1 d).
- **RIPPLE · DISCOVERY** (4): `01` New mineral seam (COMMODITY; one mine reserve +10%); `02` Archaeological find halts a site (CITY; one development delayed 30 d); `03` Celebrity scandal at a brand (SECTOR DISCRETIONARY; brand −10% 14 d); `04` Viral product craze (SECTOR; one category demand +20% 14 d).
- **RIPPLE · COMMODITY_SUPPLY** (5): `01` Port delay (COMMODITY; hub basis +2–4%); `02` Pipeline maintenance (COMMODITY NATGAS; −5% supply 5 d); `03` Harvest delay (COMMODITY ags; −3% supply); `04` Refinery outage (COMMODITY; crack spread +10%); `05` Container shortage (WORLD; freight index +5%).
- **RIPPLE · CYBER_WAVE** (3): `01` Small incident at an NPC firm (SECTOR; one firm offline 1 d); `02` Data exposure at an NPC retailer (CITY; retailer brand −5%); `03` Phishing wave (BLOC; world hack rate +2%).
- **STORM · WEATHER** (8): `01` Regional drought (BLOC; ags −10–20%, hydro −15%); `02` Hurricane on a coastal city (CITY coastal; districts damaged, 08 cat losses, port closed 3–7 d); `03` River flood (CITY; river districts damaged); `04` Heatwave (BLOC; POWER prices +20–40%, crops −5%); `05` Blizzard (BLOC NKR/EUN; transport −30% 3–5 d); `06` Wildfire season (CITY; wildfire-flagged districts, timber −10%); `07` Monsoon floods (BLOC PYN; supply chains −10%); `08` Volcanic ash cloud (BLOC; air travel halted 2–5 d).
- **STORM · GEOPOLITICAL** (7): `01` Tariff escalation (BLOC_PAIR; TARIFF +5–15%); `02` Shipping-lane disruption (WORLD; one chokepoint closed 7–28 d); `03` Export ban on a mineral (COMMODITY RARE_EARTH or LITHIUM; −20% supply); `04` Snap election called (BLOC; risk premium +15 bps); `05` Capital-control scare (BLOC; FX outflow pressure); `06` Sanctions on a sector (BLOC_PAIR × SECTOR; −15% trade); `07` Currency-peg pressure (BLOC SRL or PYN; FX vol regime +1).
- **STORM · LABOR** (4): `01` Regional strike (BLOC × SECTOR; capacity −30–60%, 16 §3.7.5); `02` Port strike (CITY coastal; throughput −70% 3–14 d); `03` Mine strike (COMMODITY; −10% supply); `04` Airline strike (BLOC; air travel −50%).
- **STORM · HEALTH** (5): `01` Regional outbreak (BLOC; entertainment −15%, health +10%, 28–56 d); `02` Drug shortage (SECTOR HEALTH; pharma prices +20%); `03` Crop disease (COMMODITY ag; −15–25% supply); `04` Livestock disease (SECTOR STAPLES; dairy and seafood −20%); `05` Orchard pest plague (COMMODITY softs; −15%).
- **STORM · TECH** (4): `01` Chip-fab outage (COMMODITY COMPUTE; 11 shortage, compute +30%); `02` Data-center outage (BLOC; compute price +x, AI lab delays, C17); `03` Major product failure (SECTOR TECH; leader −10% share); `04` Telecom outage (BLOC; online orders −20% 1–3 d).
- **STORM · ACCIDENT** (6): `01` Refinery explosion (COMMODITY; regional fuel +15%); `02` Tanker spill (CITY coastal; tourism −20%, fishery closed); `03` Rail derailment (BLOC; rail freight −40% 7 d); `04` Mine collapse (COMMODITY; one major mine offline 30–90 d); `05` Dam failure scare (CITY; hydro offline, flood risk); `06` Chemical plant leak (CITY; district closed 3–7 d, 13 inquiry).
- **STORM · DISCOVERY** (3): `01` Major oil find (COMMODITY CRUDE; futures −5–10%); `02` New lithium basin (COMMODITY LITHIUM; −10% price path); `03` Breakthrough drug approved early (SECTOR HEALTH; one firm +).
- **STORM · COMMODITY_SUPPLY** (6): `01` OPEC-style output cut by a producer group (COMMODITY CRUDE; +10–20%); `02` Grain export halt (COMMODITY WHEAT/CORN; +15%); `03` Copper smelter shutdown (COMMODITY COPPER; +10%); `04` Coffee frost (COMMODITY COFFEE; +20–40%); `05` Gas pipeline cut (COMMODITY NATGAS; +30%); `06` Uranium supply halt (COMMODITY URANIUM; +25%).
- **STORM · CYBER_WAVE** (4): `01` Regional outage wave (BLOC; many NPC firms offline 1–3 d); `02` Exchange connectivity incident (BLOC; 05 halt 1–4 game hours); `03` Data-broker breach (WORLD; broker feeds stop, 11); `04` Bank systems outage (BLOC; payments delayed 1 d).
- **MAJOR · WEATHER** (4): `01` Major quake (CITY fault-flagged; heavy damage, 08 cat losses, reconstruction 365 d); `02` Super-typhoon (CITY coastal PYN/SRL; port closed 14 d); `03` Continental drought (multi-BLOC; ags −30%, hydro −40%); `04` Great flood (BLOC; multiple cities damaged).
- **MAJOR · GEOPOLITICAL** (5): `01` Trade war between two blocs (BLOC_PAIR; TARIFF +20–40%, risk-off); `02` Sovereign default scare (BLOC; spreads +200–500 bps, 04 stress); `03` Chokepoint closure (WORLD; Gilt Strait or Serpent Canal closed 28–91 d); `04` Embargo on energy (BLOC_PAIR; CRUDE/NATGAS +40%); `05` Coalition collapse and constitutional crisis (BLOC; FX −10%).
- **MAJOR · LABOR** (2): `01` General strike (BLOC; GDP −1–2% for a quarter); `02` Global seafarers' strike (WORLD; sea freight −50% 14–28 d).
- **MAJOR · HEALTH** (3): `01` Pandemic wave (WORLD; C19, entertainment and transport −, health and tech +, 91–364 d); `02` Global food-safety crisis (SECTOR STAPLES WORLD; −20%); `03` Antibiotic-resistant outbreak (multi-BLOC; health capacity strain).
- **MAJOR · TECH** (4): `01` AI breakthrough shock (WORLD; from 16 §3.10, labour displacement, tech re-rating); `02` Global chip shortage (WORLD; COMPUTE +60%, autos −20%); `03` Satellite network failure (WORLD; logistics and alt-data down 7 d); `04` Battery recall cascade (WORLD; EV and device makers −15%).
- **MAJOR · ACCIDENT** (3): `01` Nuclear plant incident (BLOC; plant offline, URANIUM −, POWER +50%, policy reaction); `02` Mega-port fire (CITY hub; commodity hub closed 28 d); `03` Major dam collapse (CITY; heavy damage, hydro −, reconstruction 365 d).
- **MAJOR · COMMODITY_SUPPLY** (4): `01` Global energy shock (WORLD; CRUDE +60–100%); `02` Commodity super-squeeze (COMMODITY; one metal +100%); `03` Fertilizer collapse (WORLD; ags −15% next harvest); `04` Rare-earth cut-off (WORLD; SEMI and EV supply −30%).
- **MAJOR · CYBER_WAVE** (3): `01` Systemic cyber wave (WORLD; many firms offline 1–7 d, data exposed; outcomes only); `02` Clearing-system outage (WORLD; settlement delayed, 07 liquidity stress); `03` Cloud collapse (WORLD; compute and platforms offline 2–5 d).

Crisis Week themes (04 §3.16.1, 21 copy only): "Storm Season", "The Squeeze", "Fault Lines", "Cold Front", "Supply Shock Week", "The Long Night".

### §10.11 Crisis display names and consequence magnitudes

**Crisis display names** (used by history, the Archive and stress scenarios named from history, §4.13): MAJOR shock → its def name; endogenous crises: bank run → "The {bank} Run"; contagion across ≥ 2 banks → "The {bloc} Banking Panic"; sovereign stress → "The {bloc} Debt Crisis"; equity crash ≥ 20% in 5 GD → "The {month} Crash"; stablecoin depeg → "The {token} Depeg"; CCP member default → "The {member} Default"; flash crash → "The Flash Crash of {date}"; commodity spike ≥ 50% → "The {commodity} Spike". Full name: `"<display> of Y<year> Q<quarter>"`.

**Magnitude tables for 16 §3.8.2 rules** (DEFAULT): C01 plant closure: employment −jobs/LF; housing −0.5×; supplier orders −(input share of the plant); rent −0.3×. C03 bank failure: credit tightening +0.2 if assets < 2% of bloc GDP, +0.4 if ≥ 2%; CAP bill p 0.6. C04 bankruptcy: spread +50 bps (+100 if a listed company with cap ≥ 1% of bloc). C05 takeover: layoffs U(0, 8)% of target staff. C06 strike settlement: wage +x as settled. C07 rate surprise: mortgage rate pass-through 0.8 within 3 d; housing turnover −4% per +25 bps surprise. C08 commodity spike: input cost × dependency share; CPI pass-through 0.1 × weight. C09 disaster: population −U(0, 2)%; reconstruction demand = 0.6 × insured + uninsured loss over 365 d. C10 scandal: CEO exit p 0.5. C11 election: premium ± 10 bps per 0.1 policy distance. C13 breakthrough: productivity +2–5% per level in exposed sectors. C14 succession: sale p 0.3, feud p 0.2. C16 downgrade: +25 bps per notch. C17 compute outage: compute price +10–40%. C18 port disruption: delivery delays +1–3 d; inventory premium +2–8%. C19 pandemic: consumption share shift 0.03 from ENTERTAINMENT and TRANSPORT to HEALTH and TECH; labour −2%. C20 fraud verdict: regulator budget bill p 0.3.

### §10.12 Economy tables, breakthroughs and eras

**Consumption shares by income level** (16 §3.2.3; rows = city wage index band; era shifts below):

| Wage index | FOOD_BEV | RETAIL | HOUSING | TRANSPORT | ENTERTAINMENT | HEALTH | PERSONAL_SERVICES | TECH | FINANCIAL | EDUCATION | LUXURY | UTILITIES |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| < 0.85 | 0.17 | 0.13 | 0.23 | 0.09 | 0.05 | 0.08 | 0.05 | 0.04 | 0.03 | 0.03 | 0.01 | 0.09 |
| 0.85–1.15 (launch) | 0.14 | 0.12 | 0.22 | 0.09 | 0.06 | 0.08 | 0.06 | 0.05 | 0.04 | 0.03 | 0.03 | 0.08 |
| 1.15–1.40 | 0.12 | 0.11 | 0.22 | 0.08 | 0.07 | 0.08 | 0.07 | 0.06 | 0.05 | 0.03 | 0.05 | 0.06 |
| > 1.40 | 0.10 | 0.10 | 0.23 | 0.07 | 0.07 | 0.08 | 0.07 | 0.06 | 0.06 | 0.03 | 0.07 | 0.06 |

**Era shifts** (added to the row, then renormalised): era 1 RETAIL −0.01, TECH +0.01; era 2 RETAIL −0.02, TECH +0.02; era 3 RETAIL −0.02, PERSONAL_SERVICES −0.01, TECH +0.02, ENTERTAINMENT +0.01; era 4 FOOD_BEV −0.01, RETAIL −0.02, TECH +0.02, HEALTH +0.01.

**B2B shares** (16 §3.2.2 `b2bShare_k`, of intermediate demand): LOGISTICS 0.16, CONSTRUCTION 0.14, IT_SERVICES 0.12, BUSINESS_SERVICES 0.14, ENERGY 0.12, DATA 0.04, COMPUTE 0.04, SECURITY 0.05, MAINTENANCE 0.08, COLD_CHAIN 0.03, MARKETING 0.05, LEGAL 0.03.

**R&D domain shares per bloc** (16 `rndGameDay`; share of each bloc's NPC R&D, R&D = 2.5% of output):

| Bloc | COMPUTE | AI | ENERGY | BIOTECH | AUTOMATION | MATERIALS | LOGISTICS | FINTECH |
|---|---|---|---|---|---|---|---|---|
| FDL | 0.18 | 0.22 | 0.1 | 0.14 | 0.1 | 0.06 | 0.08 | 0.12 |
| EUN | 0.1 | 0.12 | 0.16 | 0.18 | 0.14 | 0.12 | 0.08 | 0.1 |
| PYN | 0.24 | 0.16 | 0.1 | 0.08 | 0.2 | 0.1 | 0.07 | 0.05 |
| NKR | 0.1 | 0.1 | 0.26 | 0.12 | 0.1 | 0.12 | 0.12 | 0.08 |
| SRL | 0.06 | 0.08 | 0.22 | 0.12 | 0.08 | 0.22 | 0.14 | 0.08 |

**Breakthroughs (40, 16 §3.10.2)**: id `bt_<domain>_<level>`. Effects as 16's examples where given; others DEFAULT, each with diffusion 91 game days.

| Domain | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| COMPUTE | Stacked Memory (compute cost −8%) | Photonic Interconnect (compute cost −15%, AI training efficiency +10%) | Cold Silicon (data-center energy −15%) | Wafer-Scale Nodes (DX900POD throughput +20%) | Reversible Logic (compute cost −25%) |
| AI | Self-Checking Models (AI incident rate −20%) | Long Memory (MCS +5% for sequence and attention archs) | Agentic Planners (DU per decision −15%) | Universal Learners (data relevance +10%) | General Reasoners (AIRaceIndex +10, AUTOMATION exposure +) |
| ENERGY | Grid Batteries (power price volatility −10%) | Cheap Solar Film (energy input cost −8%) | Deep Geothermal (new geothermal sites, POWER −5%) | Small Modular Reactors (nuclear build time −30%) | Fusion Pilot (POWER long-run −15%) |
| BIOTECH | Rapid Diagnostics (diagnostics capacity +15%) | Gene Therapies (new HEALTH product category, trial success +5 pts) | Lab-Grown Protein (STAPLES input cost −5%) | Universal Vaccine Platform (pandemic severity −30%) | Organ Printing (hospital margins +3 pts) |
| AUTOMATION | Warehouse Robots (warehousing staff −10%) | Autonomous Trucks (trucking cost −8%) | Lights-Out Factories (manufacturing labour share −0.02) | Service Robots (personal-service staff −10%) | Universal Assemblers (manufacturing capacity +15%) |
| MATERIALS | Low-Carbon Cement (cement cost −5%) | Recycled Metals at Scale (copper demand −5%) | Solid-State Batteries (lithium demand +15%, EV adoption +) | Super Alloys (aerospace and engines capacity +10%) | Room-Temperature Superconductor Pilot (grid losses −20%) |
| LOGISTICS | Smart Routing (delivery lead times −10%) | Automated Ports (port throughput +15%) | Drone Delivery (last-mile cost −20%) | Hyperloop Freight Pilot (rail freight capacity +20%) | Global Tracking Mesh (inventory premium −50%) |
| FINTECH | Instant Settlement (payments float −50%) | Programmable Money (stablecoin share +) | Open Banking (bank switching cost −30%) | Tokenized Assets (player tokens gate, 16 §3.10.4) | Atomic Clearing (CCP margin −10%) |

**Eras (5, 16 §3.10.3)**: era 0 **The Ledger Age** (brass and paper accents), era 1 **The Wired Age** (copper and cable accents), era 2 **The Signal Age** (glass and teal accents), era 3 **The Autonomous Age** (steel and amber accents), era 4 **The Lattice Age** (white gold and deep blue accents). Accent briefs go to 17 (L4: palettes keep tokens; era accents are decorative overlays only).

### §10.13 Secrets (40 authored + 60 decorative) and archive documents → content/secrets.json

Every authored secret has ≥ 2 discovery paths, one PUBLIC_MOSAIC (16 §3.11.3). Rewards are knowledge (and the uses of 16 §3.11.4), titles or collection entries, never cash. Path codes: F filings chain, R research map, D due diligence, A archive study (document id), C conversation, E espionage, W whistle.

| secretId | Fact (true at genesis) | Paths | Reward |
|---|---|---|---|
| `sec_01` | Halvorsen holds 34% of Nordline Shipping through Fjord Nominees | F, R, C | fact; title "Ship Spotter" |
| `sec_02` | Calloway holding owns Sterling & Vane Ratings | F, A(doc_01), D | fact |
| `sec_03` | Tachibana and Amamiya run a joint venture in Kaiyo shipyards | R, A(doc_02), C | fact |
| `sec_04` | Serrano family controls Arcadia Media's editorial board | F, D, C | fact; title "Media Watcher" |
| `sec_05` | Whitlock and Calloway hold cross-stakes | F, R | fact |
| `sec_06` | A Cobos politician tie sits on the Southern finance committee | A(doc_03), C, E | fact |
| `sec_07` | Belmara Privatbank lent to a Halden holding above its own limits | D, W, E | fact (material) |
| `sec_08` | Delacourt Participations is short Ostrava Steel through a swap | R, E | fact (material) |
| `sec_09` | Ashby Capital plans to sell Granite Peak | C, E, W | fact (material, NON_PUBLIC unless C at trust ≥ 40 discloses lawfully) |
| `sec_10` | Gulfstar Petroleum's reserve report used an old survey | A(doc_04), D | fact |
| `sec_11` | Lumen Pharma's lead drug trial site changed | F, D | fact |
| `sec_12` | Paloma Retail's landlord in Port Avalon is a Calloway firm | F, R | fact |
| `sec_13` | Glasshill Office REIT has a related-party lease with its manager | F, D | fact |
| `sec_14` | The Strandberg heir is negotiating with Varg's rival | C, E | fact |
| `sec_15` | Shinbashi Trust Bank holds a large undisclosed Tessan land loan | D, A(doc_05) | fact |
| `sec_16` | Kaze Motors sourced batteries from a sanctioned supplier | D, W | fact |
| `sec_17` | Fattoria Group's olive estates have a water-rights dispute | A(doc_06), D | fact |
| `sec_18` | Cafetales Unidos pays Larrain-family brokers above market | F, D, W | fact |
| `sec_19` | Puerto Sur Logistics pricing matches Cobos-affiliated carriers | R, D | fact (13 cartel lead if REPORTED) |
| `sec_20` | A Meridia Bank board member sits on a competitor's board | F, R | fact |
| `sec_21` | Marquee Resorts' Isla Serena expansion was rejected once | A(doc_07), C | fact |
| `sec_22` | Copperleaf Cloud has one customer above 30% of revenue | D, R | fact |
| `sec_23` | The Pacific Review is funded by a Harbor Reform donor | F, A(doc_08) | fact |
| `sec_24` | Saga Nyheter's editor owes a Halvorsen loan | D, C | fact |
| `sec_25` | A Union Labour Party caucus leader co-owns a Lakemont dealership | F, A(doc_09) | fact |
| `sec_26` | Hikaru Broadcasting will be sold if Amamiya debt stress exceeds 0.6 | R, C | fact |
| `sec_27` | Nordhav Hydro's dam inspection was delayed | A(doc_10), W | fact |
| `sec_28` | Petrosur's offshore lease expires next chapter | F, A(doc_11) | fact |
| `sec_29` | Cobre Mayor's tailings pond needs reinforcement | D, W | fact (material) |
| `sec_30` | Sundara Coast zoning plan favours Costa Desarrollos parcels | A(doc_12), C | fact |
| `sec_31` | A Vael heritage watch in a museum is a later copy | A(doc_13), D | title "Horologist's Eye" |
| `sec_32` | Hammar Industries owns a dormant shell on Isla Serena | F, D | fact |
| `sec_33` | Ironclad Defense supplies the Federal Treasury's guards | F, R | fact |
| `sec_34` | Brightwater Asset Management's star fund manager is leaving | C, E | fact (material) |
| `sec_35` | Kaiyo Land owns the parcel under the Loop Central crown tower | F, R | fact |
| `sec_36` | The Calloway–Ashby feud began over a Redmesa water deal | A(doc_14), C | title "Historian" |
| `sec_37` | A Halden cousin secretly controls a Kessler distributor | F, D | fact |
| `sec_38` | The Serena Trust holds 6 masterworks | A(doc_15), D | collection entry |
| `sec_39` | Atlas Freight's fleet age is above its covenant | D, R | fact |
| `sec_40` | Valcourt Microelectronics has a fab-capacity deal with Siltera | F, R, C | fact |

Material NON_PUBLIC facts trade as insider information under 13; the PUBLIC_MOSAIC paths make the same fact lawful to act on once found by them (16 §3.11.2).

**Decorative secrets (60)**: `dec_sec_01`–`dec_sec_60`, 4 per launch city (15 cities), each a local story with an archive document and a collection entry "City Lore: <city>" (completing all 4 of a city gives title "Keeper of <city>"). Kinds by slot: 1 a lost painting's provenance (links to a §9.5 masterwork), 2 a founder's first shop (links to a listed company's founding address in a district), 3 a landmark's hidden history (the city's landmark, §3.3), 4 a family legend (a dynasty or a §0.4 local family). Example (Port Avalon): "The Harbour at Dusk was painted from the Eastside Docks crane"; "Pallas Foods began as a bakery cart on Crescent Row"; "The Meridian Spire's top floor was never finished"; "The Calloways arrived as ferry pilots".

**Archive documents**: `doc_01`–`doc_15` named above (board minutes, survey reports, court records, planning files, letters), plus one founding charter per listed company (`doc_charter_<ticker>`, 240) and one per dynasty (`doc_family_<dynastyId>`, 12), plus the 60 decorative documents. Titles: "Minutes of the board of <entity>, Y<year>", "<Commodity> reserve survey of <site>", "Ruling of the <court> in <case>", "Planning file <city>-<nnnn>", "Letter from <person> to <person>".

### §10.14 Chronicle, brief and While You Were Away templates

| Template id | Use | Text (EN) |
|---|---|---|
| `chron.title` | chapter chronicle page | Chronicle of Chapter {n} |
| `chron.entry` | chronicle line | {date} · {summary} |
| `chron.bloc_header` | per-bloc section | In the {blocName} |
| `hist.anniversary` | HISTORY news | {years} years since {entry} |
| `brief.what` | opportunity brief | What happened: {summary} |
| `brief.why` | opportunity brief | Why it matters to you: {relevance} |
| `brief.known` | opportunity brief | Known: {fact} |
| `brief.uncertain` | opportunity brief | Still open: {question} |
| `wywa.header` | While You Were Away | While you were away ({duration}) |
| `wywa.holding` | WYWA card | {asset} moved {pct} after {cause} |
| `wywa.business` | WYWA card | {business} earned {amount}; {event} |
| `wywa.contract` | WYWA card | {counterparty} {action} your contract |
| `wywa.city` | WYWA card | In {city}: {summary} |
| `wywa.security` | WYWA card | Security: {summary} |
| `wywa.empty` | WYWA card | Quiet hours. Your empire kept running. |

## §11 Multiplayer and social → content/social.json

### §11.1 Chapter themes (12, 15 §3.3.3) → content/chapter_themes.json

Multipliers apply to 16 shock categories (in [0.5, 2.0]); unlisted categories 1.0. 16 §3.7.2 cites a theme "Supply Squeeze" as an example; it is the theme `thm_energy_squeeze` below (DEFAULT alias).

| themeId | Name | Masthead line (EN) | Multipliers |
|---|---|---|---|
| `thm_rate_shock` | The Rate Shock | Money gets expensive. | GEOPOLITICAL 1.3, COMMODITY_SUPPLY 1.2, TECH 0.8 |
| `thm_silicon_spring` | Silicon Spring | The machines are getting smarter. | TECH 2.0, CYBER_WAVE 1.3, WEATHER 0.8 |
| `thm_long_drought` | The Long Drought | The rivers are low and the fields are dry. | WEATHER 1.8, COMMODITY_SUPPLY 1.4, CYBER_WAVE 0.7 |
| `thm_harbor_strikes` | Harbor Strikes | The docks are restless. | LABOR 2.0, ACCIDENT 1.2, DISCOVERY 0.7 |
| `thm_crypto_weather` | Crypto Weather | Storms on the chain. | CYBER_WAVE 1.6, TECH 1.3, LABOR 0.7 |
| `thm_credit_thaw` | The Credit Thaw | Lenders are lending again. | DISCOVERY 1.4, TECH 1.2, GEOPOLITICAL 0.7 |
| `thm_election_season` | Election Season | Every bloc is counting votes. | GEOPOLITICAL 1.6, LABOR 1.3, WEATHER 0.8 |
| `thm_energy_squeeze` | The Energy Squeeze | Every barrel counts. | COMMODITY_SUPPLY 2.0, GEOPOLITICAL 1.3, HEALTH 0.7 |
| `thm_merger_mania` | Merger Mania | Everyone is buying everyone. | DISCOVERY 1.3, TECH 1.2, ACCIDENT 0.8 |
| `thm_quiet_boom` | The Quiet Boom | Good times, for now. | all 0.8 except DISCOVERY 1.5 |
| `thm_data_wars` | The Data Wars | Information is the new oil. | CYBER_WAVE 2.0, TECH 1.4, WEATHER 0.8 |
| `thm_frontier_rush` | Frontier Rush | New mines, new labs, new cities. | DISCOVERY 2.0, ACCIDENT 1.3, HEALTH 0.8 |

### §11.2 Roll-up regions (15 §3.2.3) → content/rollup_regions.json

Real-world player geography (boards only; the game world stays fictional). Mapping rule: country code (ISO 3166-1 alpha-2) → its UN M49 sub-region → RollupRegion by this table; a country with its own board is excluded from the roll-up. Overrides listed after the table.

| RollupRegion | UN M49 sub-regions | Board display name |
|---|---|---|
| NA_OTHER | Northern America (except a country with its own board), Caribbean | North America |
| LATAM | Central America, South America | Latin America |
| EU_WEST_OTHER | Northern Europe, Western Europe, Southern Europe (west of 20°E) | Western Europe |
| EU_EAST_OTHER | Eastern Europe, Southern Europe (east of 20°E), Central Asia | Eastern Europe and Central Asia |
| MENA | Northern Africa, Western Asia | Middle East and North Africa |
| SSA | Sub-Saharan Africa (all four sub-regions) | Sub-Saharan Africa |
| SOUTH_ASIA | Southern Asia | South Asia |
| SEA | South-eastern Asia | South-East Asia |
| EAST_ASIA_OTHER | Eastern Asia | East Asia |
| OCEANIA | Australia and New Zealand, Melanesia, Micronesia, Polynesia | Oceania |

Overrides: Greenland → EU_WEST_OTHER; Cyprus → EU_EAST_OTHER; Turkey and the South Caucasus → MENA; unknown or unassignable → the region of the IP geolocation, else EU_WEST_OTHER (the game's hosting region, 21).

### §11.3 Boards and leagues → strings `board.<id>.*`, `league.<tier>.*`

| BoardId | Display name | One-line description |
|---|---|---|
| RICHEST | The Richest | Net worth, all time. |
| RICHEST_CHAPTER | Chapter Wealth | Wealth made this chapter, net of gifts. |
| CLIMBER | Climbers | Fastest growth this chapter. |
| TRADER | Traders | Best risk-adjusted trading this chapter. |
| TYCOON | Tycoons | Business operating profit. |
| ALLIANCE | Alliances | Combined wealth of the top 20 members. |
| PRESTIGE | Prestige | Status from what you own and do. |
| MOST_WANTED | Most Wanted | Notorious operators (opt-in). |
| DEFENDER | Defenders | Attacks caught and repelled. |
| CITY_WEALTH | City Wealth | The richest residents of a city. |
| CITY_PROFIT | City Profit | Business profit made in a city. |
| SECTOR_PROFIT | Sector Profit | Business profit in a sector. |
| LEGACY | Legacy | What you leave behind. |
| TOP_LABS | Top Labs | The strongest deployed models. |
| CLEANEST_LAB | Cleanest Labs | Strong models, clean records. |
| RIVALS | Rivals | Chapter wealth against the NPC funds. |
| AI_TOURNAMENT | AI Tournament | Weekly results by division. |

League tiers: PENNY "Penny League", RETAIL "Retail League", PRO "Pro League", INSTITUTIONAL "Institutional League", TITAN "Titan League", APEX "Apex". Week result strings: "Promoted", "Relegated", "Stayed". Pennant decor per tier: `dec_pennant_<tier>`.

**Season Finals texts** (15 §3.5.4): title "Season Finals · Chapter {n}"; lobby line "The best of chapter {n} start with the same {notional}. One market, 48 hours."; result card "Champion of Chapter {n}"; Hall of Fame plaque "{handle} · Chapter {n} Champion · {score}". Hall of Fame room names: "The Hall of Champions" (Finals), "The Gallery of Founders" (first to reach each rank in the world), "The Wing of Patrons" (philanthropy records).

### §11.4 Contracts: clause texts and starter templates (15 §3.6)

Clause display names and one-line plain-English renderings (`contract.clause.<kind>`); the builder renders each clause from its typed fields:

| Clause | Display name | Rendering (EN) |
|---|---|---|
| TRANSFER | Transfer | {from} gives {assets} to {to} {when}. |
| LOAN | Loan | {lender} lends {principal} to {borrower} at {rate} a year, repaid {schedule}. |
| LEASE | Lease | {lessor} leases {property} to {lessee} for {rent} every {period}. |
| REVENUE_SHARE | Revenue share | {payer} pays {payee} {share} of {business}'s revenue for {term}. |
| EQUITY_STAKE | Equity stake | {holding} is owned {stakes}; votes {votingRule}. |
| OPTION | Option | {holder} may {buy/sell} {underlying} at {strike} until {expiry}; premium {premium}. |
| SERVICE_LEVEL | Service level | {provider} provides {serviceKind} to {client}, guaranteeing {guarantee}. |
| NON_COMPETE | Non-compete | {restricted} will not compete in {scope} for {term}. |
| NDA | Confidentiality | The parties keep {subjects} confidential for {term}. |
| BOUNTY | Bounty | {sponsor} pays {amount} to whoever gets {target} convicted of {offence} before {expiry}. |
| PENALTY | Penalty | If {trigger}, {payer} pays {payee} {amount}. |
| COVENANT | Covenant | {obligor} agrees to {covenantText}. Covenant kinds: VOTE_WITH "vote with", NOT_SUE_CIVIL "not to sue (civil)", EXCLUSIVE_DEALING "deal exclusively", BEST_EFFORTS "use best efforts", CUSTOM_TYPED "custom (typed)". |
| MANDATE | Mandate | {manager} manages {assets} for {owner} under the mandate shown. |
| LICENSE | Licence | {licensor} licenses {model/data} to {licensee} for {fee} a day for {term}. |
| SUPPLY | Supply | {supplier} delivers {units} of {output} to {buyer} each {period} at {price}. |
| SUBCONTRACT | Subcontract | {sub} delivers {share} of {prime}'s contract for {payShare} of its payment. |
| GUARANTEE | Guarantee | {guarantor} guarantees clause {n} up to {cap}. |
| ASSIGNMENT | Assignment | {assignor} assigns its rights under {contract} to {assignee}. |
| TERMINATION | Termination | {whoMay} may end this contract with {notice} days' notice for {fee}. |

(15 notes say 19 clause kinds; 15 §2.6 types 19 including ASSIGNMENT.)

**Starter templates (12)** (`ctpl_<id>`): Simple loan (LOAN + PENALTY + TERMINATION); Secured loan (LOAN + GUARANTEE + PENALTY); Shop lease (LEASE + TERMINATION); Supply deal (SUPPLY + PENALTY + TERMINATION); Security service (SERVICE_LEVEL DEFENSE_FLOOR + PENALTY); Property management (SERVICE_LEVEL + REVENUE_SHARE); Joint venture (EQUITY_STAKE + COVENANT VOTE_WITH + NON_COMPETE); Silent partner (REVENUE_SHARE + NDA); Model licence (LICENSE + NDA + TERMINATION); Managed account (MANDATE + TERMINATION); Call option on shares (OPTION); Bounty notice (BOUNTY).

### §11.5 Alliances (15 §3.7)

Tier names: PARTNERSHIP "Partnership", FIRM "Firm", CORPORATION "Corporation", CONGLOMERATE "Conglomerate". Role names: CHAIR "Chair", TREASURER "Treasurer", CISO "Chief Security Officer", GENERAL_COUNSEL "General Counsel", ANALYST "Analyst", MEMBER "Member". Alliance crests use the §9.13 library plus 6 alliance-only frames: Ring, Laurel, Chain, Banner, Keystone Arch, Compass Rose. Alliance tags: 2–5 letters A–Z/0–9, checked against §16.4.

### §11.6 Filing forms (15 §2.8) → strings `filing.<kind>.*`

| FilingKind | Form title | Public summary line |
|---|---|---|
| OWNERSHIP_5 | Form O-5: Substantial holding | {filer} holds {pctBucket} of {company} |
| SHORT_POSITION | Form S-1: Net short position | {filer} holds a net short of {pctBucket} in {company} |
| INSIDER_TRADE | Form I-2: Insider dealing | {officer} of {company} {bought/sold} shares |
| HOLDINGS_QUARTERLY | Form Q-13: Quarterly holdings | {filer}'s top holdings at quarter end |
| MATERIAL_CONTRACT | Form M-8: Material contract | {company} signs a material {contractKind} |
| COMPANY_PERIODIC | Form P-10: Periodic report | {company} quarterly statements |
| COMPANY_EVENT | Form E-8: Current event | {company} reports {event} |
| PROSPECTUS | Form P-1: Prospectus | {company} offers {shares} shares |
| FUND_REPORT | Form F-4: Fund report | {fund} reports NAV and holdings |
| LOBBYING | Form L-1: Lobbying registration | {lobbyist} lobbies on {lever} for {client} |
| CONTRIBUTION | Form C-1: Political contribution | {donor} contributes to {party} |
| VOLUNTARY_STATEMENT | Statement | {filer}: {headline} |

### §11.7 Chat channels and rules texts (15 §3.9)

| ChannelKind | Name pattern | Rules line (pinned) |
|---|---|---|
| COUNTRY | "{country flag} {country}" | Be civil. No personal data, no links. Market talk is not advice. |
| CITY | "{city} square" | Talk about {city}: businesses, property, events. |
| LEAGUE_GROUP | "{league} · Group {n}" | Your league group for this week. |
| ALLIANCE | "{alliance}" | Members only. |
| ALLIANCE_OPS | "{alliance} · Ops" | Roles with ops permission only. |
| CONSORTIUM | "{syndicate}" | Syndicate members only. |
| CLUB | "{club} members" | Members only. What is said here is not inside information. |
| EVENT_ROOM | "{host}'s {event}" | Open for the event window. |
| CONTRACT_THREAD | "Contract {id}" | About this contract only. Chat is never evidence (15). |
| DM | "{handle}" | Private. Block and report are always available. |
| FINALS_LOBBY | "Finals lobby · Chapter {n}" | Finalists and spectators. |

**Moderation word lists** (`copy-banned.json`, `chat-filter.json`, EN and FR): content is maintained by the Trust and Safety team (21) and is not printed in this design file. Structure: categories SLUR (mask always), PROFANITY (mask unless the adult option is on; 16–17 accounts always masked), SEXUAL, THREAT (hold for review), SELF_HARM (hold and show help resources), PERSONAL_DATA (regex: emails, phone numbers, street-address patterns), REAL_MONEY_TRADE (phrases offering to sell game money or accounts; hold), ADVICE_WORDS (17 copy rule: "guaranteed", "risk-free", "sure thing", "can't lose" and FR equivalents "garanti", "sans risque", "à coup sûr", "gain assuré"; blocked in player-authored public statements and in all game copy). Sources: a licensed multilingual list plus the game-specific additions of §16.4.

### §11.8 Named challenge scenario templates (20) → content/scenarios.json

Replayable scenario templates for challenge events, the Academy and practice worlds only (24 R03). Real-world inspired, fictional names. Each has a seed family `scn_<id>` in 20's registry.

| scenarioId | Name | Inspired by (mechanism only) | Main mechanism | Used by |
|---|---|---|---|---|
| `scn_securitization` | The Securitization Unwind | mortgage-pool losses spreading through tranches | tranche losses, ratings cliffs | 15 SCENARIO, 18 fund_3, 20 SC_CRISIS_SECURITIZATION |
| `scn_repo_run` | The Repo Run | collateral haircut spiral | haircuts, margin calls | 15, 18 bank_3, 20 SC_CRISIS_REPO_RUN |
| `scn_sovereign_default` | Sovereign Default | a bloc's debt crisis and FX fall | spreads, FX, bank capital | 15, 18 macro_4, 20 SC_CRISIS_SOVEREIGN_FX |
| `scn_crypto_winter` | Crypto Winter | token crash and lender failures | liquidations, depegs | 15, 18 crypto_2 |
| `scn_rate_shock` | The Rate Shock | fast policy tightening | duration losses | 15, 18 macro_1 |
| `scn_flash_crash` | The Flash Crash | liquidity withdrawal in minutes | book depth, halts | 15, 18 trade_4 |
| `scn_bank_run` | The Bank Run | deposit flight from one bank | liquidity, CB facility | 18 bank_4, 20 SC_CRISIS_BANK_RUN |
| `scn_ccp_default` | The Member Default | a clearing member fails | default waterfall | 18 bank_5, 20 SC_CRISIS_CCP_MEMBER_DEFAULT |
| `scn_depeg` | The Depeg | a stablecoin loses its peg | redemption run | 18 crypto_2, 20 SC_CRISIS_STABLECOIN_DEPEG |
| `scn_crash_week` | Crash Week | equity bear week | drawdowns, stops | 15 CRASH_COURSE, 18 seed "crash week" |
| `scn_overheating` | Overheating | boom, inflation, policy catch-up | rates vs growth | 18 seed |
| `scn_credit_crunch` | The Credit Crunch | lending standards tighten | spreads, defaults | 18 seed |
| `scn_earnings_season` | Earnings Season | dense earnings calendar | surprises, drift | 18 seed |
| `scn_quiet_market` | The Quiet Market | low volatility, carry | carry, crowding | 18 seed |
| `scn_short_squeeze` | The Squeeze | heavily shorted stock rallies | borrow recalls | 18 trade_5 |
| `scn_commodity_spike` | The Oil Spike | supply shock in energy | futures curves, hedging | 18 deriv_3 |
| `scn_currency_peg` | The Broken Peg | a pegged currency floats | FX regime change | 18 macro_3 |
| `scn_tech_bubble` | The Silicon Bubble | tech valuations far above earnings | valuation, momentum | 15 SPEEDRUN |
| `scn_supply_chain` | The Long Wait | port closure and shortages | inventory, B2B contracts | 18 biz_2 |
| `scn_insurance_cat` | The Great Storm | catastrophe losses hit insurers | cat bonds, reinsurance | 18 fund_4 |

The first six are the six named in 15 §3.14.3.

### §11.9 AI tournament rule texts (15 §3.14.4)

`tourney.rules.*` (EN): "One frozen model per week."; "Entries lock Sunday 18:00 UTC."; "Three secret markets, 30 game days each, $1,000,000 each."; "Score: median Sharpe across the three markets, after fees."; "Disqualified above 40% drawdown or below 20 trades in any market."; "Top entries are audited. Copied models are disqualified."; "Rewards are titles and decor. No money."; "Your strategy is never published unless you choose to share your trade log."

### §11.10 Notification texts (15 §3.11, 17 §3.10)

Notification ids `notif.<event>`; each has a title and a one-line body with slots. Launch set (EN):

| id | Title | Body |
|---|---|---|
| notif.order_filled | Order filled | {side} {qty} {ticker} at {price} |
| notif.margin_call | Margin call | Add {amount} or reduce positions by {deadline} |
| notif.liquidation | Position closed | {ticker} closed at the liquidation price |
| notif.attack_detected | Security alert | Unusual activity on {unit} |
| notif.session_disconnected | Connection closed | A connection to {model} was closed |
| notif.case_filed | Case filed | {claimant} filed a {caseKind} case |
| notif.verdict | Verdict | {court}: {outcome} |
| notif.held_scheduled | Held soon | You will be Held in one game day |
| notif.contract_offer | Contract offer | {party} sent you a contract |
| notif.contract_breach | Contract breach | {party} breached clause {n} |
| notif.rank_up | New rank | You are now {rank} |
| notif.league_result | League week | You were {result} |
| notif.chapter_end | Chapter ending | {days} days left in chapter {n} |
| notif.business_event | Business update | {business}: {event} |
| notif.tender_won | Tender won | {business} won {tender} |
| notif.auction_outbid | Outbid | You were outbid on {lot} |
| notif.alliance_vote | Alliance vote | A vote on {proposal} closes in {time} |
| notif.filing_due | Filing due | {form} is due by {deadline} |
| notif.tournament_result | Tournament | Week {n}: rank {rank} in {division} |
| notif.protection_ending | Protection ending | Your protection ends in {hours} hours |
## §12 Onboarding, Academy and help → content/academy.json, content/help.json

18 owns the goal ladder (G01–G20), the 60 JIT intros (J01–J60), the 14 coach marks, the 67 courses, drills and widgets, with their ids and one-line briefs. This section adds the content catalog those need: instructors, lesson ids, quiz banks, explanation and advisor templates, help article ids and the starter set.

### §12.1 Academy instructors (6, 18 §6)

Presentation-only voices; portraits are stylized silhouettes (17 §3.15). Each covers two or three of 18's 16 tracks.

| instructorId | Name | Tracks | Voice brief |
|---|---|---|---|
| `ins_marlow` | Professor Iris Marlow | Basics, Macro, Lifestyle | former central-bank economist, warm, uses kitchen-table examples |
| `ins_okafor` | Dana Okafor | Trading, Crypto, Multiplayer | ex-floor trader, brisk, loves a good chart |
| `ins_ferrante` | Matteo Ferrante | Businesses, Property, Corporate finance | ran a restaurant group, practical, numbers on a napkin |
| `ins_sato` | Yui Sato | AI Lab, Security | lab lead turned teacher, calm, precise, never sensational |
| `ins_lindqvist` | Astrid Lindqvist | Banking, Funds, Institutions | risk officer, dry humour, always asks "what if it goes wrong?" |
| `ins_ibarra` | Judge Esteban Ibarra (ret.) | Law, Derivatives | retired judge, patient, explains rules before tricks |

### §12.2 Lesson, quiz and badge ids

- Lesson id `les_<courseId>_<nn>` (nn 01–08, 18 §3.10.2 gives the count per course; 327 lessons in total by 18's counts, matching its "≈300").
- Lesson string keys `acad.<lessonId>.title|body|summary`; bodies are written by the content team (§0.5) in EN and FR.
- Quiz banks `qb_<courseId>` with ≥ 18 templated questions per knowledge course and ≥ 40 for `trade_5`, `deriv_1`, `corp_3` (licence exams); question template id `q_<courseId>_<nnn>`; each template names the module pure function it calls for randomized parameters (18 §3.10.5).
- Badge cosmetics `badge_<courseId>`, `badge_drill_<drillId>`; titles "Academy Fellow" and "Academy Master" (18 §3.10.7).
- Practice-world seeds for courses: the §11.8 scenarios; replay worlds use the live public tape (18 §3.10.3).

### §12.3 Explanation templates (18 §3.12) → content/explain.json

| Family | Count | Id grammar | Slots | Example (EN) |
|---|---|---|---|---|
| Trade one-liners, by dominant cause (05 `explainMove` factor) | 12 causes × 30 = 360 | `exp_trade_<cause>_<nn>` | asset, move, cause, size | "{asset} rose {move} mostly because {cause}; your order added {impactBps} bps of impact." |
| Desk memo sentences | 60 | `exp_memo_<nn>` | factor, weight, window | "Over {window}, {factor} explained about {weight} of the move." |
| Waterfall labels | 24 | `exp_wf_<component>` | — | "Fees", "Impact", "Carry", "Funding", "Price move", "FX", "Dividends", "Taxes", … |
| Advisor notes (W08) | 40 | `adv_<topic>_<nn>` | metric, threshold | "Your largest position is {pct} of your net worth. A single bad day there would cost {amount}." |

Dominant causes (12): NEWS, EARNINGS, RATES, FX, COMMODITY, SECTOR_FLOW, NPC_FUND_FLOW, RETAIL_FLOW, MARKET_MAKER_INVENTORY, RUMOR, HALT_REOPEN, MEAN_REVERSION. Advisor topics (8 × 5): CONCENTRATION, LEVERAGE, LIQUIDITY, CASH_BUFFER, FEES, DEFENSE_GAP, LICENSE_RENEWAL, IDLE_BUSINESS. Rule (18 §3.12): explanations describe mechanisms after the fact and never recommend a trade.

### §12.4 Help articles

One article per 17 §7 screen id: id `help.<screenId>`, title = the screen title, body sections "What this is", "What you can do here", "What it costs", "Learn more" (links to the Academy course and glossary terms). Plus course topic articles `help.topic.<courseId>` (67) and policy articles `help.policy.<id>` (Community Rules, Privacy, Purchases and refunds, Age and accounts, Simulated markets disclaimer: texts owned by 21 §3.16). Glossary terms are §17.3.

### §12.5 First-session content (18 §3.3)

- Suggested first businesses (B1 `beginner` rows of §6.3): coffee_cart, food_truck, phone_repair_kiosk, sneaker_resale, cleaning_service, courier_bikes, freelance_dev_studio, it_support_shop and the other `beginner` rows; background tilts per §9.8.
- First headline candidates: any published MACRO_DATA or EARNINGS item about a LIC1-tradeable asset in the player's home bloc (18 §3.3.3).
- Rivals (18 §3.3.5): the NPC rival funds Hale & Ward, Pinn Partners and Vetch (§5.4) and the benchmark ghost "The Index" (display name of 15's benchmark reference row).
- Starter watch: Kessler Field (§9.1).
## §13 Interface assets (17) → content/ui_assets.json

### §13.1 Glyphs (Quay family, 17 §3.15)

24 px grid, 1.5 px line. **App glyphs (32)**, `gly_app_<appId>`, one per 17 §3.2.4 app: Broker (candlestick pair), Portfolio (stacked coins as discs), Wire (folded newspaper), Messages (two speech bubbles), Markets (globe with grid), Risk (shield with gauge), Quant Lab (flask with sine), Research Desk (magnifier over page), Businesses (awning shopfront), Company (office block), Property (house with key), City (skyline), Bank & Credit (columned bank), Funds (pie in a box), Insurance (umbrella), Institutions (pediment with seal), AI Lab (chip with spark), Security (padlock with ring), Legal & Court (scales), Estate (gate with lantern), Boards (podium), Profile (portrait card), Alliance (linked rings), Contracts (pen on page), Auctions (gavel on block), Civic (ballot box), Academy (open book with cap), Help (question in circle), Atelier (needle and thread), Settings (gear), Replay (circular arrow with play), API (angle brackets with key).

**Action glyphs (88)**, `gly_act_<name>`: buy, sell, short, cover, limit, stop, cancel, amend, confirm, hold-to-confirm, pending, filled, partial, rejected, alert, bell, mute, pin, unpin, watch, unwatch, filter, sort, search, export, share, report, block, follow, unfollow, invite, kick, vote, propose, sign, escrow, release, dispute, file, appeal, settle, bid, outbid, hammer, upgrade, repair, hire, fire, relocate, expand, close-business, open-business, train, deploy, pause-ai, resume-ai, scan, quarantine, lockdown, disconnect, tag, honeypot, canary, lobby, donate, host, attend, crest, heirloom, display, store, transfer, deposit, withdraw, borrow, repay, margin, collateral, hedge, rebalance, calendar, clock, tick-ring, map, district, parcel, build, demolish.

### §13.2 Wallpapers and illustrations

- **Wallpapers**: 4 palettes (Ink & Brass, Broadsheet, Phosphor, Riviera) × 7 rank materials (r0–r6) = 28 earned wallpapers `wp_<palette>_<rank>`; plus 15 home-city skylines `wp_skyline_<cityId>` (unlocked at R5, 17) and the Isla Serena seascape `wp_skyline_city_isla_serena` (R6). The 12 Atelier wallpapers of §14.1 are separate and never imitate rank materials.
- **Home illustrations**: 8 home tiers (rented room, studio, loft, penthouse, mansion, estate, island, skyline tower) × 5 bloc architectural styles (FDL harbour brick, EUN canal stone, PYN dense modern, NKR timber and glass, SRL colonial whitewash) = 40, plus island variants per §3.5 island (9).
- **Storefront art**: 13 sectors (09) × 3 awning variants = 39 `ill_store_<sector>_<v>`; the variants are the default storefront signs (§14.1 adds 6 purchasable sign styles).
- **Item hero images**: one per §9.2 row (45) plus one per unique (131, §9.5), with the dusk studio lighting brief.

### §13.3 Avatar parts (17 §3.15)

- **Silhouettes (8)**: 4 builds × 2 heights, no realistic faces.
- **Earned outfits (24)**: Street Casual, Hoodie and Cap, Barista Apron, Courier Jacket, Office Shirt, Blazer, Three-Piece Suit, Trader Vest, Lab Coat, Field Jacket, Linen Summer Suit, Winter Overcoat, Evening Dress, Tuxedo, Sailing Jacket, Pilot Jacket, Riding Coat, Workshop Overalls, Hard Hat and Vest, Kimono-cut Jacket, Nordic Knit, Poncho Coat, Club Blazer (Harbor Club members), Gala Attire (after a hosted gala). Atelier outfits are §14.1.
- **Watches**: drawn from the catalog watch the player owns and displays (§9.1, 14).
- **Poses (8)**: Standing, Arms Crossed, Hands in Pockets, Leaning on Desk, Seated, Phone to Ear, Looking at Watch, Raised Glass.

### §13.4 Sounds (17 §3.14) → `snd_<id>`

| id | Sound | Brief |
|---|---|---|
| snd_bell_open | Market bell (open/close) | soft brass bell, 1.2 s |
| snd_bell_low | Market bell (crash) | same bell a fifth lower |
| snd_fill | Fill tick | muted wooden tick, 80 ms |
| snd_attack | Attack thud | low felt thud, 300 ms |
| snd_rank | Rank bell | single low bell with long tail |
| snd_gavel | Gavel | one tap on wood |
| snd_close | Paper slide | sheet sliding across a desk |
| snd_hammer | Auction hammer | two quick taps |
| snd_room_r4 | Room tone (R4+) | quiet office air, −24 dB |
| snd_room_r6 | Room tone (island) | distant sea, −24 dB |

No coin, slot, reel or casino sounds (L5).

### §13.5 Share card templates (12, 17 §3.21)

`card_<id>`: trade_receipt, daily_close, rank_up, milestone, verdict, defended_hack, chapter_recap, gilt_cover, league_promotion, ipo_bell, estate_snapshot, tournament_result. Each lists allowed fields in 17; layout brief: 1080 × 1350, wordmark top-left, disclaimer line bottom, the event's glyph large, percentages only by default.

### §13.6 Reference devices for performance budgets (19 §3.17.3)

Described by specification, not brand (L6 keeps brands out of game content; the test lab buys any device that matches):

| Profile | Class | CPU | RAM | GPU class | Display | Browser / OS level |
|---|---|---|---|---|---|---|
| `dev_ref_mid_phone` | reference mid-range phone | 8 cores (2 × 2.2 GHz performance + 6 × 1.8 GHz efficiency) | 4 GB | mid-range mobile GPU of the same generation | 6.5", 1080 × 2400, 60 Hz | current stable mobile browser, OS two major versions old |
| `dev_low_phone` | floor phone | 8 × 1.6 GHz efficiency cores | 3 GB | entry mobile GPU | 6.5", 720 × 1600 | same |
| `dev_ref_laptop` | reference laptop | 4 cores, 2.4 GHz | 8 GB | integrated | 1920 × 1080 | current stable desktop browser |
| `dev_tablet` | tablet | 8 cores | 4 GB | mid-range | 2000 × 1200 | current stable |

## §14 LiveOps, cosmetics and platform strings (21) → content/cosmetics.json, content/liveops.json

### §14.1 Atelier launch catalog (21 §3.11)

21 notes list per-slot counts that add up to 136, not the 120 they state; the per-slot counts are kept (136 items, DEFAULT). Ids `cos_<slot short>_<slug>`; price tier per 21 Rule 3.11.6 typical use. No item imitates a rank shell, an earned frame or a club.

| Slot | Count | Tier | Items |
|---|---|---|---|
| SHELL_STYLE | 12 | T5 | Art Deco Office (`cos_shell_art_deco_office`); Brutalist Tower (`cos_shell_brutalist_tower`); Harbour Loft (`cos_shell_harbour_loft`); Canal Studio (`cos_shell_canal_studio`); Alpine Chalet (`cos_shell_alpine_chalet`); Night Market (`cos_shell_night_market`); Fjord Cabin (`cos_shell_fjord_cabin`); Hacienda Study (`cos_shell_hacienda_study`); Observatory (`cos_shell_observatory`); Library Reading Room (`cos_shell_library_reading_room`); Rooftop Greenhouse (`cos_shell_rooftop_greenhouse`); Lighthouse Watch Room (`cos_shell_lighthouse_watch_room`) |
| ESTATE_STYLE | 10 | T5 | Mid-Century (`cos_estate_mid_century`); Neo-Classical (`cos_estate_neo_classical`); Japanese Minimal (`cos_estate_japanese_minimal`); Scandinavian Light (`cos_estate_scandinavian_light`); Colonial Courtyard (`cos_estate_colonial_courtyard`); Industrial Loft (`cos_estate_industrial_loft`); Mediterranean Villa (`cos_estate_mediterranean_villa`); Art Nouveau (`cos_estate_art_nouveau`); Desert Modern (`cos_estate_desert_modern`); Tropical Pavilion (`cos_estate_tropical_pavilion`) |
| AVATAR_OUTFIT | 25 | T3 | Double-Breasted Navy (`cos_outfit_double_breasted_navy`); Camel Overcoat (`cos_outfit_camel_overcoat`); Linen Safari (`cos_outfit_linen_safari`); Velvet Smoking Jacket (`cos_outfit_velvet_smoking_jacket`); Tech Fleece (`cos_outfit_tech_fleece`); Rain Shell (`cos_outfit_rain_shell`); Tweed Hunting (`cos_outfit_tweed_hunting`); Cricket Whites (`cos_outfit_cricket_whites`); Sailing Oilskin (`cos_outfit_sailing_oilskin`); Ski Lodge Knit (`cos_outfit_ski_lodge_knit`); Desert Scarf Set (`cos_outfit_desert_scarf_set`); Silk Evening (`cos_outfit_silk_evening`); Harbour Pea Coat (`cos_outfit_harbour_pea_coat`); Workshop Denim (`cos_outfit_workshop_denim`); Café Racer (`cos_outfit_café_racer`); Jazz Club Suit (`cos_outfit_jazz_club_suit`); Garden Party (`cos_outfit_garden_party`); Monsoon Cape (`cos_outfit_monsoon_cape`); Northern Parka (`cos_outfit_northern_parka`); Riviera Stripes (`cos_outfit_riviera_stripes`); Gallery Black (`cos_outfit_gallery_black`); Track Jacket (`cos_outfit_track_jacket`); Tuxedo Midnight (`cos_outfit_tuxedo_midnight`); Kimono Haori (`cos_outfit_kimono_haori`); Poncho Andino (`cos_outfit_poncho_andino`) |
| PROFILE_FRAME | 15 | T2 | Brass Rule (`cos_frame_brass_rule`); Ink Wash (`cos_frame_ink_wash`); Art Deco Fan (`cos_frame_art_deco_fan`); Rope Knot (`cos_frame_rope_knot`); Mosaic Tile (`cos_frame_mosaic_tile`); Pinstripe (`cos_frame_pinstripe`); Paper Fold (`cos_frame_paper_fold`); Laurel Silver (`cos_frame_laurel_silver`); Ticker Band (`cos_frame_ticker_band`); Glass Edge (`cos_frame_glass_edge`); Woodgrain (`cos_frame_woodgrain`); Wave Crest (`cos_frame_wave_crest`); Lattice (`cos_frame_lattice`); Copper Rivet (`cos_frame_copper_rivet`); Starfield (`cos_frame_starfield`) |
| NAMEPLATE | 10 | T1 | Engraved Serif (`cos_plate_engraved_serif`); Stencil (`cos_plate_stencil`); Neon Script (`cos_plate_neon_script`); Typewriter (`cos_plate_typewriter`); Gilt Capitals (`cos_plate_gilt_capitals`); Ledger Hand (`cos_plate_ledger_hand`); Block Sans (`cos_plate_block_sans`); Brush Stroke (`cos_plate_brush_stroke`); Railway Sign (`cos_plate_railway_sign`); Monospace Terminal (`cos_plate_monospace_terminal`) |
| CHART_THEME | 8 | T2 | Graphite (`cos_chart_graphite`); Sepia Ledger (`cos_chart_sepia_ledger`); Ocean Night (`cos_chart_ocean_night`); High Contrast Ivory (`cos_chart_high_contrast_ivory`); Forest (`cos_chart_forest`); Dusk Rose (`cos_chart_dusk_rose`); Blueprint (`cos_chart_blueprint`); Amber Terminal (`cos_chart_amber_terminal`) |
| DESKTOP_WALLPAPER | 12 | T2 | Rain on Glass (`cos_wall_rain_on_glass`); Harbour Cranes at Night (`cos_wall_harbour_cranes_at_night`); Canal Morning (`cos_wall_canal_morning`); Neon Alley (`cos_wall_neon_alley`); Fjord Light (`cos_wall_fjord_light`); Coffee Slopes (`cos_wall_coffee_slopes`); Desert Mesas (`cos_wall_desert_mesas`); Snowy Pass (`cos_wall_snowy_pass`); Old Bourse Ceiling (`cos_wall_old_bourse_ceiling`); Map of the World (`cos_wall_map_of_the_world`); Ledger Pages (`cos_wall_ledger_pages`); Lantern Festival (`cos_wall_lantern_festival`) |
| SOUND_PACK | 5 | T3 | Typewriter Desk (`cos_sound_typewriter_desk`); Glass and Chime (`cos_sound_glass_and_chime`); Analogue Synth (`cos_sound_analogue_synth`); Harbour Bells (`cos_sound_harbour_bells`); Woodwind Soft (`cos_sound_woodwind_soft`) |
| TICKER_STYLE | 5 | T1 | Split-Flap (`cos_ticker_split_flap`); LED Dot (`cos_ticker_led_dot`); Newsprint (`cos_ticker_newsprint`); Marquee Bulbs (`cos_ticker_marquee_bulbs`); Ribbon Script (`cos_ticker_ribbon_script`) |
| CREST_PART | 10 | T1 | Gothic Shield (`cos_crest_gothic_shield`); Heart Shield (`cos_crest_heart_shield`); Ornate Cartouche (`cos_crest_ornate_cartouche`); Phoenix (`cos_crest_phoenix`); Griffin (`cos_crest_griffin`); Kraken (`cos_crest_kraken`); Sun Wheel (`cos_crest_sun_wheel`); Clockwork (`cos_crest_clockwork`); Trident (`cos_crest_trident`); Ivy Border (`cos_crest_ivy_border`) |
| TOWER_FACADE | 8 | T3 | Bronze Fins (`cos_facade_bronze_fins`); Green Wall (`cos_facade_green_wall`); White Lattice (`cos_facade_white_lattice`); Art Deco Setbacks (`cos_facade_art_deco_setbacks`); Mirror Glass (`cos_facade_mirror_glass`); Terracotta Louvres (`cos_facade_terracotta_louvres`); Night Light Strips (`cos_facade_night_light_strips`); Timber Screen (`cos_facade_timber_screen`) |
| STOREFRONT_SIGN | 6 | T2 | Hand-Painted (`cos_sign_hand_painted`); Neon Tube (`cos_sign_neon_tube`); Brass Letters (`cos_sign_brass_letters`); Enamel Plate (`cos_sign_enamel_plate`); Chalkboard (`cos_sign_chalkboard`); Lightbox (`cos_sign_lightbox`) |
| CHAT_STICKER | 4 | T1 | Market Moods (`cos_sticker_market_moods`); City Mascots (`cos_sticker_city_mascots`); Brass Office (`cos_sticker_brass_office`); Weather Report (`cos_sticker_weather_report`) |
| RECAP_CARD_STYLE | 6 | T2 | Broadsheet Front Page (`cos_recap_broadsheet_front_page`); Gallery Card (`cos_recap_gallery_card`); Postage Stamp (`cos_recap_postage_stamp`); Blueprint Sheet (`cos_recap_blueprint_sheet`); Polaroid (`cos_recap_polaroid`); Old Map (`cos_recap_old_map`) |

Total 136. **Bundles (6, T6)**: `bnd_harbour` (Harbour Loft shell, Harbour Pea Coat, Harbour Cranes at Night, Harbour Bells); `bnd_deco` (Art Deco Office, Art Deco Fan frame, Art Deco Setbacks facade, Gilt Capitals plate); `bnd_nordic` (Fjord Cabin, Scandinavian Light estate, Northern Parka, Fjord Light); `bnd_canal` (Canal Studio, Canal Morning, Mosaic Tile frame, Enamel Plate sign); `bnd_tropic` (Tropical Pavilion estate, Riviera Stripes, Wave Crest frame, Polaroid recap); `bnd_terminal` (Amber Terminal chart, Monospace Terminal plate, Split-Flap ticker, Typewriter Desk sound).

**Earned-only cosmetics** (never sold, 21 Rule 3.11.4): frame "Integrity Seal" and title "Auditor" (20), Finals and champion frames (15), tournament frames (§7.10), set and milestone decor (§9.6–§9.7), Academy badges (§12.2), rank shells and rank wallpapers (§13.2).

### §14.2 Chapter Pass generator (21 §3.12)

One pass `pass_C<n>` per chapter, 50 tiers, themed by the chapter theme (§11.1). Items are generated from the theme and the slot plan below, then art-directed: free track 25 items on even tiers; premium track 50 items. Slot plan per pass: premium = 6 outfits, 8 frames, 6 nameplates, 4 chart themes, 6 wallpapers, 2 sound packs, 3 ticker styles, 5 crest parts, 3 facades, 3 signs, 2 sticker sets, 2 recap styles; free = 5 frames, 5 nameplates, 5 wallpapers, 4 crest parts, 3 sticker sets, 3 recap styles. Item names: `<Theme keyword> <slot noun>` with theme keywords per theme (e.g. The Rate Shock: Basis Point, Yield, Curve, Hawk, Dove; Silicon Spring: Wafer, Circuit, Spark, Lattice; The Long Drought: Dust, Riverbed, Mirage, Sunbaked …, 6 keywords per theme authored by art direction). Pass titles are marked "Pass" ("Chapter 3 Pass: Curve Rider"). Items return to the Atelier after 2 chapters (21 Rule 3.12.6); free items return in the "Archive" set.

### §14.3 Live-event templates (21 §3.5) → content/live_events.json

| templateId | Kind | Name | Copy brief |
|---|---|---|---|
| `lev_crash_course` | CHALLENGE | Crash Course | a scripted crash inside a scenario world; $100,000; a weekend |
| `lev_pure_markets` | CHALLENGE | Pure Markets | live-shadow trading, no cyber layer, one league week |
| `lev_speedrun` | CHALLENGE | Speedrun | pace ×4 scenario, 24 real hours, businesses allowed |
| `lev_scenario` | CHALLENGE | Scenario: {scenarioName} | one of §11.8, 3 real days |
| `lev_crisis_week` | CRISIS_WEEK | Crisis Week: {theme} | framing copy only for the engine-drawn week (04 §3.16.1); themes §10.10 |
| `lev_festival` | COSMETIC_FESTIVAL | Festival of {theme} | Atelier themed items, pass marks bonus ≤ 25%; themes: Lanterns, Harbours, Winter Lights, Carnival, Harvest, Night Markets |
| `lev_academy_week` | ACADEMY_WEEK | Academy Week | new lessons and practice worlds, instructor spotlight (§12.1) |
| `lev_city_opening` | CITY_OPENING | Opening of {city} | ribbon-cutting copy, land auction schedule, new labs and companies (§3.9) |
| `lev_finals` | SEASON_FINALS | Season Finals · Chapter {n} | §11.3 |
| `lev_maintenance` | MAINTENANCE | Scheduled exchange maintenance | diegetic notice (§16.2) |

### §14.4 Statement-of-reasons templates (21 Rule 3.8, V01–V17)

Each moderation decision shows `sor.<code>` filled with the decision, the evidence category, the rule text reference and the appeal path. Titles (EN):

V01_MULTI_ACCOUNT_FUNNEL Multiple accounts used to move value; V02_COLLUSION Collusion between accounts; V03_EXPLOIT_ABUSE Abuse of a bug or exploit; V04_AUTOMATION_OUTSIDE_GAME_AI Automation outside the game's own AI and API; V05_REAL_MONEY_TRADING Selling or buying game value for real money; V06_ACCOUNT_SHARING_OR_SALE Account sharing or sale; V07_HARASSMENT Harassment; V08_HATE Hateful content; V09_SEXUAL_CONTENT Sexual content; V10_PERSONAL_DATA Sharing personal data; V11_IMPERSONATION Impersonation; V12_REAL_BRAND_OR_PERSON_NAME A real brand or person's name; V13_SPAM Spam; V14_PAYMENT_FRAUD Payment fraud; V15_UNDERAGE Under the minimum age; V16_THREATS Threats; V17_ILLEGAL_CONTENT Illegal content. The titles are the display strings of 21 `ViolationCode`. Template body: "We {action} because {ruleSummary} ({ruleRef}). What we saw: {evidenceCategory}. This decision lasts {duration}. You can appeal within 14 days from Settings › Account › Decisions."

Disclaimers (21 Rule 3.16.1) are exact strings owned by 21 and are not repeated here.

## §15 Harness content (20)

20 owns the 47 test-agent archetypes (A01–A47, policies in harness code), the 6 population templates (POP_BASELINE, POP_CONFLICT, POP_EXPLOIT, POP_LATE, POP_INSTITUTIONAL, POP_BROKE) and the integrated scenarios S01–S08. They are not player content and are not duplicated here. This file provides what 20 asked of 22:

- Harness scenario ids map to §11.8: `SC_CRISIS_SECURITIZATION` → `scn_securitization`, `SC_CRISIS_REPO_RUN` → `scn_repo_run`, `SC_CRISIS_SOVEREIGN_FX` → `scn_sovereign_default`, `SC_CRISIS_BANK_RUN` → `scn_bank_run`, `SC_CRISIS_CCP_MEMBER_DEFAULT` → `scn_ccp_default`, `SC_CRISIS_STABLECOIN_DEPEG` → `scn_depeg`; S01–S08 keep 20's `SC_*` ids (e.g. `SC_COLD_CHAIN` uses the ColdChain Assured certification of §6.6 and `cold_chain_transporter`).
- Test agents use generated handles `bot_<archetype>_<nnnn>` and never use §0.4 names (so a harness world cannot be confused with a live one).
- Integrity Report issuer: The Exchange Authority (§2.2); templates `NEWS_INTEGRITY_REPORT` ("Integrity Report, week {n}: {summary}") and `NEWS_EXCHANGE_NOTICE` ("The Exchange: {notice}"), shared with 21.
- Earned cosmetics: title "Auditor", frame "Integrity Seal" (§14.1).

## §16 Codes, platform strings and name lists → content/strings_system.json

### §16.1 Ledger reason-code display names

03 owns the 384 canonical codes (24 R06, R23). Display rule: `reason.<CODE>.name` = the code with the module prefix removed, underscores as spaces, sentence case (`BIZ_CERT_FEE` → "Cert fee"), unless overridden. Overrides for codes players see most (EN): ACCT_START_CASH "Starting cash"; ACCT_ONBOARD_GRANT "Welcome grant"; ACCT_BACKGROUND_DISCOUNT "Background discount"; ACCT_STARTER_GIFT "Starter watch"; ACCT_LICENSE_FEE "Licence fee"; ACCT_REWARDED_AD "Ad reward"; HH_CONSUMPTION_PLAYER "Customer sales"; FRM_B2B_PLAYER "Business sales"; FINE_SINK "Fine"; VCF_TRANSFER "Victim compensation"; LIFE_CLUB_DUES "Club dues"; LIFE_HOSTING "Hosting"; LIFE_DONATION "Donation"; CONCESSION_FEE "Concession fee"; AI_HW_PURCHASE "Hardware purchase"; AI_DATA "Data purchase"; LOBBY_SPEND "Lobbying"; FACT_SALE_NPC "Story sold to the press"; CONFLICT_NPC_THEFT "Theft by an NPC crew". FR strings follow the same keys.

### §16.2 Reject codes and diegetic system strings

| Code | Owner | Message (EN) |
|---|---|---|
| BAD_SIGNATURE | 19 | This request could not be verified. Please sign in again. |
| BAD_SCHEMA | 19 | This request was not understood. |
| DUPLICATE | 19 | This was already received. |
| RATE_LIMITED | 19 | Too many actions this tick. Try again next tick. |
| LATE_EXACT | 19 | This arrived after the tick closed. |
| REJECT_STALE | 02 | This action was more than 3 ticks old. |
| WORLD_HALTED | 19 | Trading is halted by the Exchange. |
| AUTH_NOT_PERMITTED | 19 | You do not have permission for this. |
| PLATFORM_NO_RESULT | 19 | No result yet. It will appear when the tick closes. |
| CHANNEL_DENIED | 19 | You cannot open this channel. |
| CHANNEL_REVOKED | 19 | Access to this channel ended. |
| SESSION_REVOKED | 19 | You were signed out on this device. |
| TOO_MANY_SOCKETS | 19 | Too many open windows for this account. |
| SLOW_CONSUMER | 19 | Your connection is falling behind; refreshing. |
| UPGRADE_REQUIRED | 19 | A new version is required. |
| SYS_QUARANTINED | 20 | This action is paused while a system check runs. |
| SYS_KIND_BLOCKED | 20 | This action is temporarily unavailable. |
| SYS_MODULE_PAUSED | 21 | This feature is paused for maintenance. |
| MOD_NAME_REFUSED | 21 | That name is not allowed. Please choose another. |
| RESTRICTED_CASH_USE | 21 | Ad rewards cannot be used for margin or derivatives. |
| AD_NOT_AVAILABLE | 21 | No reward is available right now. |
| AD_DAILY_CAP | 21 | You have reached today's ad reward limit. |
| LAB_E_CLOUD_FULL | 11 | Cloud capacity is fully booked. Try reserved capacity or wait. |

Codes 20 lists as `TM_*` take the message pattern "Test mode: {reason}" and appear only in harness and staff tools. **Diegetic halt and maintenance reasons** (`halt.<id>`): `exchange_halt` "Trading halted by the Exchange"; `circuit_breaker` "Circuit breaker: trading resumes at {time}"; `maintenance` "Scheduled exchange maintenance"; `clock_sync` "Clock synchronization"; `system_check` "System check"; `settlement` "Settlement in progress". Patch notes (`sys.engine_upgraded`): key `patch.<version>.title` = "Rules update {version}", body sections "What changed", "Why", "What it means for you".

**Anonymized-character labels** (19, 21 deletion and estates): "Estate of a departed trader #{nnnn}"; "Former player #{nnnn}"; "Anonymous lab"; "A private investor"; "An undisclosed buyer". `nnnn` = 4 digits from `hash(characterId)`, collision → 5 digits.

### §16.3 Generated-label word pools

Endpoint labels: §8.3. Codenames: §7.8. Crews: §8.4. Street names: §3.7. Chapter pass item names: §14.2.

### §16.4 Reserved and banned name lists → content/names_reserved.json, content/copy-banned.json

**Reserved words** (no player handle, House, alliance, company, business, fund or model name may contain them as a whole word, case-insensitive, EN and FR forms): Exchange, Exchange Authority, Autorité des marchés (FR), Moderator, Modérateur, Admin, Support, Staff, Équipe, Atelier, Official, Officiel, System, Système, Claude, Anthropic, Stabilizer, Clearing House, Central Bank, Banque centrale, Treasury, Trésor, Regulator, Régulateur, Court, Tribunal, Police, CyberCert, Revenue Office, Wire Desk, Integrity, Gilt List, Hall of Fame, Season Finals, Academy (for player companies, "Academy" is allowed only with a qualifying word, e.g. "Ridge Academy of Cooking" is refused; DEFAULT), and every proper name defined in this file (cities, districts, blocs, currencies, listed companies, banks, funds, insurers, agencies, outlets, dynasties, labs, brokers, brands; collision check by exact name). Player names may contain a district or city name as a non-initial word ("Bistro Glasshill" is refused; "Glasshill" alone is refused; "The Corner on Glasshill Lane" is refused) — DEFAULT: all geographic proper names reserved, to prevent impersonation of NPC institutions.

**Banned lists**: the moderation categories of §11.7 apply to every player-authored name and every generated name (§0.2 rule 5). Additional game-specific bans: real-world brand, company, bank, exchange, currency and public-figure names (V12; maintained list, seeded from the major stock-index constituents of large real markets, major banks, central banks, currencies and heads of state; refreshed quarterly by Trust and Safety); real-world crypto token names and tickers; words implying guaranteed returns (§11.7 ADVICE_WORDS); gambling words used as names (casino, jackpot, slots, bet, poker, roulette, lottery and FR equivalents) per L5.

## §17 Strings and glossary → content/strings_*.json, content/glossary.json

### §17.1 String-key conventions (L8)

| Namespace | Pattern | Example |
|---|---|---|
| Catalog item | `<ns>.<id>.name`, `.desc`, `.brief` | `biz.coffee_cart.name` = "Coffee cart" |
| Reason code | `reason.<CODE>.name` | `reason.FINE_SINK.name` = "Fine" |
| News template | `news.<templateId>.headline`, `.body` | `news.TECH_LAB_RELEASE.headline` |
| Academy | `acad.<lessonId>.title|body|summary`, `q.<qid>.stem|choice.<n>|explain` | `acad.les_trade_1_01.title` |
| Help | `help.<screenId>.title|body` | `help.MKT-01.title` |
| Glossary | `gloss.<termId>.term|short|long|formula` | `gloss.batch_auction.short` |
| Reject / halt | `err.<CODE>`, `halt.<id>` | `err.RATE_LIMITED` |
| Notifications | `notif.<kind>.title|body` | `notif.MARGIN_CALL.title` |
| UI chrome | `ui.<screenId>.<element>` | `ui.HLP-03.search_placeholder` |

Rules: keys are lowercase snake_case after the namespace, except ids that are themselves uppercase codes. Slots use `{name}` and ICU plural syntax; money and dates are formatted by the client from typed slots, never pre-formatted. Every key exists in `en` and `fr` before a build passes (§18). Proper names follow §0.1 rule 4 (FR identical).

### §17.2 Disclaimers and policy texts

The texts are owned by 21 §3.16 (simulated-markets disclaimer, no-real-money statement, Atelier cosmetics-only line, ad-reward terms, age gate). This file only fixes their keys: `policy.disclaimer.simulated`, `policy.disclaimer.no_cashout`, `policy.atelier.cosmetic_only`, `policy.ads.rewards`, `policy.age_gate`, `policy.community_rules`, `policy.privacy`, `policy.refunds`. They are shown in the first-run flow (18), the store (21) and HLP-01.

### §17.3 Glossary (18 §3.11; `GlossaryTerm`)

Term id = the snake_case of the EN term. `F` = the owner module supplies `formulaKey` text. The one-line definition is the `short` string; the `long` string is written by the content team from the owner module's section. French terms are the localization-pass reference (§0.1 rule 4). 00 §4 core terms are included verbatim in meaning.

| id | Term (EN) | Term (FR) | Owner | F | Short definition |
|---|---|---|---|---|---|
| | **Core and time** | | | | |
| `tick` | Tick | Tick | 00/02 |  | One 5-second step of the world, equal to 2 game minutes; everything resolves on ticks |
| `intent` | Intent | Intention | 00/02 |  | A request (order, purchase, op, contract) submitted to the next tick |
| `game_hour` | Game hour | Heure de jeu | 00/02 | F | 30 ticks, or 2.5 real minutes |
| `game_day` | Game day | Jour de jeu | 00/02 | F | 720 ticks, or one real hour |
| `chapter` | Chapter | Chapitre | 00/02 |  | An 8-week season frame for ladders, events and concessions; nothing resets |
| `character` | Character | Personnage | 00/02 |  | A player's in-world identity; one per account |
| `entity` | Entity | Entité | 00/02 |  | Anything with a balance sheet |
| `npc` | NPC | PNJ | 00/02 |  | A non-player actor run by the world |
| `genesis` | Genesis | Genèse | 00/02 |  | The creation of a world from its seed and content |
| `world_seed` | World seed | Graine du monde | 00/02 |  | The number from which every random stream of a world derives |
| `replay` | Replay | Rejeu | 00/02 |  | Re-running a world from its seed and intent log to the same result |
| `content_hash` | Content hash | Empreinte du contenu | 00/02 |  | The hash of all catalog files loaded at genesis |
| `while_you_were_away` | While You Were Away | Pendant votre absence | 00/02 |  | The summary of what happened since your last visit |
| `offline_mode` | Offline mode | Mode hors ligne | 00/02 |  | Standing rules that act for you while you are away |
| `standing_order` | Standing order | Ordre permanent | 00/02 |  | An instruction repeated every period until cancelled |
| `stale_intent` | Stale intent | Intention périmée | 00/02 |  | An intent more than 3 ticks old, rejected |
| `rate_limit` | Rate limit | Limite de fréquence | 00/02 |  | The maximum number of intents per tick |
| `halt` | Halt | Suspension | 00/02 |  | A pause of trading in an asset or the world |
| `business_day` | Business day | Jour ouvré | 00/02 |  | A day the bloc's exchange is open |
| `holiday` | Holiday | Jour férié | 00/02 |  | A bloc day without exchange trading |
| | **Ledger and accounting** | | | | |
| `ledger` | Ledger | Grand livre | 03 |  | The double-entry record of every money movement |
| `double_entry` | Double entry | Partie double | 03 |  | Every movement debits one account and credits another by the same amount |
| `faucet` | Faucet | Robinet | 03 |  | A flow that creates money in the player economy |
| `sink` | Sink | Puits | 03 |  | A flow that destroys money in the player economy |
| `transfer` | Transfer | Transfert | 03 |  | A flow between entities that neither creates nor destroys money |
| `reason_code` | Reason code | Code motif | 03 |  | The label attached to every ledger movement |
| `balance_sheet` | Balance sheet | Bilan | 03 |  | Assets, liabilities and equity at a moment |
| `income_statement` | Income statement | Compte de résultat | 03 |  | Revenue, costs and profit over a period |
| `cash_flow_statement` | Cash flow statement | Tableau des flux | 03 |  | Where cash came from and went over a period |
| `asset` | Asset | Actif | 03 |  | Something owned that has value |
| `liability` | Liability | Passif | 03 |  | Something owed |
| `equity` | Equity | Capitaux propres | 03 | F | Assets minus liabilities |
| `net_worth` | Net worth | Valeur nette | 03 | F | A character's equity at mark-to-market |
| `net_worth_index` | Net Worth Index | Indice de valeur nette | 03 | F | Net worth divided by the world money-supply index; the ranking metric |
| `money_supply_index` | Money supply index | Indice de masse monétaire | 03 | F | The world's total player money relative to genesis |
| `mark_to_market` | Mark-to-market | Valorisation au marché | 03 |  | Valuing a holding at its current price |
| `mark_to_model` | Mark-to-model | Valorisation sur modèle | 03 |  | Valuing a holding with a formula when no price exists |
| `accrual` | Accrual | Régularisation | 03 |  | Recording income or cost when earned, not when paid |
| `depreciation` | Depreciation | Amortissement | 03 | F | Spreading an asset's cost over its useful life |
| `impairment` | Impairment | Dépréciation | 03 |  | Writing down an asset whose value fell |
| `revenue` | Revenue | Chiffre d'affaires | 03 |  | Money earned from sales |
| `gross_margin` | Gross margin | Marge brute | 03 | F | Revenue minus direct costs, as a share of revenue |
| `operating_profit` | Operating profit | Résultat d'exploitation | 03 | F | Profit before interest and tax |
| `net_income` | Net income | Résultat net | 03 | F | Profit after all costs, interest and tax |
| `ebitda` | EBITDA | EBITDA | 03 | F | Profit before interest, tax, depreciation and amortization |
| `retained_earnings` | Retained earnings | Bénéfices non distribués | 03 |  | Profits kept rather than paid out |
| `dividend` | Dividend | Dividende | 03 |  | A payment of profits to shareholders |
| `tax` | Tax | Impôt | 03 |  | A payment to a government, a sink |
| `audit` | Audit | Audit | 03 |  | An independent check of an entity's accounts |
| `restricted_cash` | Restricted cash | Trésorerie restreinte | 03 |  | Money that can be spent only on stated uses |
| `escrow` | Escrow | Séquestre | 03 |  | Money held by a neutral party until conditions are met |
| `victim_compensation` | Victim compensation | Indemnisation des victimes | 03 |  | A transfer to a player harmed by a proven offence |
| `fine` | Fine | Amende | 03 |  | A penalty paid to a regulator or court, a sink |
| `fee` | Fee | Frais | 03 |  | A charge for a service |
| `working_capital` | Working capital | Fonds de roulement | 03 | F | Current assets minus current liabilities |
| | **Macro, central banks, sovereigns** | | | | |
| `bloc` | Bloc | Bloc | 04 |  | One of the five economic regions with its own currency and central bank |
| `central_bank` | Central bank | Banque centrale | 04 |  | The institution that sets a bloc's policy rate and money |
| `policy_rate` | Policy rate | Taux directeur | 04 |  | The central bank's main interest rate |
| `inflation` | Inflation | Inflation | 04 | F | The rise in the general price level |
| `cpi` | CPI | IPC | 04 | F | Consumer price index, the basket price measure |
| `gdp` | GDP | PIB | 04 | F | The value of everything a bloc produces |
| `output_gap` | Output gap | Écart de production | 04 | F | How far output is above or below its potential |
| `unemployment_rate` | Unemployment rate | Taux de chômage | 04 | F | The share of the workforce without work |
| `business_cycle` | Business cycle | Cycle économique | 04 |  | The swing between expansion and recession |
| `recession` | Recession | Récession | 04 |  | A period of falling output |
| `expansion` | Expansion | Expansion | 04 |  | A period of rising output |
| `taylor_rule` | Taylor rule | Règle de Taylor | 04 | F | A formula linking the policy rate to inflation and the output gap |
| `forward_guidance` | Forward guidance | Orientation prospective | 04 |  | What a central bank says about future rates |
| `quantitative_easing` | Quantitative easing | Assouplissement quantitatif | 04 |  | A central bank buying bonds to lower long rates |
| `quantitative_tightening` | Quantitative tightening | Resserrement quantitatif | 04 |  | A central bank shrinking its bond holdings |
| `reserve_requirement` | Reserve requirement | Réserves obligatoires | 04 |  | The share of deposits banks must hold at the central bank |
| `lender_of_last_resort` | Lender of last resort | Prêteur en dernier ressort | 04 |  | The central bank lending to solvent banks in a panic |
| `sovereign` | Sovereign | Souverain | 04 |  | A national government as a borrower |
| `sovereign_debt` | Sovereign debt | Dette souveraine | 04 |  | Bonds issued by a government |
| `fiscal_deficit` | Fiscal deficit | Déficit budgétaire | 04 | F | Government spending above revenue |
| `debt_to_gdp` | Debt-to-GDP | Dette sur PIB | 04 | F | Government debt as a share of output |
| `sovereign_default` | Sovereign default | Défaut souverain | 04 |  | A government failing to pay its bonds |
| `exchange_rate` | Exchange rate | Taux de change | 04 |  | The price of one currency in another |
| `ppp` | PPP | PPA | 04 | F | Purchasing power parity, the exchange rate that equalizes prices |
| `real_interest_rate` | Real interest rate | Taux d'intérêt réel | 04 | F | Nominal rate minus inflation |
| `yield_curve` | Yield curve | Courbe des taux | 04 |  | Bond yields plotted by maturity |
| `inverted_curve` | Inverted curve | Courbe inversée | 04 |  | Short yields above long yields |
| `term_premium` | Term premium | Prime de terme | 04 |  | Extra yield for lending longer |
| `data_release` | Data release | Publication de données | 04 |  | A scheduled statistics announcement |
| `consensus` | Consensus | Consensus | 04 |  | The average forecast before a data release |
| `surprise` | Surprise | Surprise | 04 | F | The gap between a release and its consensus |
| `stabilizer_board` | Stabilizer Board | Conseil de stabilisation | 04 |  | The world body that watches systemic risk |
| `treasury` | Treasury | Trésor | 04 |  | The government department that issues bonds |
| `capital_controls` | Capital controls | Contrôle des capitaux | 04 |  | Limits on money leaving a bloc |
| `election` | Election | Élection | 04 |  | A vote that can change a bloc's government and policies |
| | **Markets and prices** | | | | |
| `batch_auction` | Batch auction | Enchère groupée | 05 |  | All orders on an asset clear each tick at one uniform price |
| `clearing_price` | Clearing price | Prix d'équilibre | 05 | F | The single price at which a batch auction clears |
| `order_book` | Order book | Carnet d'ordres | 05 |  | The list of open buy and sell orders |
| `bid` | Bid | Prix acheteur | 05 |  | The best price a buyer offers |
| `ask` | Ask | Prix vendeur | 05 |  | The best price a seller asks |
| `spread` | Spread | Écart | 05 | F | Ask minus bid |
| `mid_price` | Mid price | Prix moyen | 05 | F | Halfway between bid and ask |
| `last_price` | Last price | Dernier prix | 05 |  | The most recent clearing price |
| `market_order` | Market order | Ordre au marché | 05 |  | An order that fills at whatever the auction clears |
| `limit_order` | Limit order | Ordre à cours limité | 05 |  | An order that fills only at its price or better |
| `stop_order` | Stop order | Ordre stop | 05 |  | An order that activates when price crosses a level |
| `stop_limit_order` | Stop-limit order | Ordre stop limite | 05 |  | A stop that becomes a limit order |
| `trailing_stop` | Trailing stop | Stop suiveur | 05 |  | A stop that follows the price at a set distance |
| `iceberg_order` | Iceberg order | Ordre iceberg | 05 |  | A large order shown in small slices |
| `time_in_force` | Time in force | Durée de validité | 05 |  | How long an order stays open |
| `fill` | Fill | Exécution | 05 |  | A completed part of an order |
| `partial_fill` | Partial fill | Exécution partielle | 05 |  | An order only partly completed |
| `slippage` | Slippage | Glissement | 05 | F | The gap between the expected and actual fill price |
| `market_impact` | Market impact | Impact de marché | 05 | F | How much your own order moves the price |
| `basis_point` | Basis point | Point de base | 05 |  | One hundredth of a percent |
| `liquidity` | Liquidity | Liquidité | 05 |  | How easily an asset trades without moving its price |
| `depth` | Depth | Profondeur | 05 |  | The quantity available near the current price |
| `volume` | Volume | Volume | 05 |  | The quantity traded over a period |
| `volatility` | Volatility | Volatilité | 05 | F | How much a price moves, measured as standard deviation |
| `implied_volatility` | Implied volatility | Volatilité implicite | 05 | F | The volatility an option price implies |
| `beta` | Beta | Bêta | 05 | F | How much an asset moves with its market |
| `correlation` | Correlation | Corrélation | 05 | F | How two prices move together, from -1 to 1 |
| `fundamental_value` | Fundamental value | Valeur fondamentale | 05 | F | What an asset is worth from its cash flows |
| `fair_value` | Fair value | Juste valeur | 05 | F | The engine's anchor price for an asset |
| `mean_reversion` | Mean reversion | Retour à la moyenne | 05 |  | The pull of a price back toward its fair value |
| `momentum` | Momentum | Momentum | 05 |  | The tendency of recent moves to continue |
| `market_maker` | Market maker | Teneur de marché | 05 |  | A participant that always quotes a bid and an ask |
| `inventory` | Inventory | Inventaire | 05 |  | A market maker's net position |
| `circuit_breaker` | Circuit breaker | Coupe-circuit | 05 |  | An automatic halt after a large move |
| `price_limit` | Price limit | Limite de prix | 05 |  | The largest move allowed in one tick |
| `rumor` | Rumor | Rumeur | 05 |  | An unconfirmed claim that can move prices |
| `belief` | Belief | Croyance | 05 |  | What NPC traders currently think a claim's truth is |
| `claim` | Claim | Affirmation | 05 |  | A statement about an asset that the market can believe or doubt |
| `explain_move` | Explain move | Expliquer le mouvement | 05 |  | The breakdown of why a price moved |
| `short_selling` | Short selling | Vente à découvert | 05 |  | Selling a borrowed asset to buy back later |
| `borrow_fee` | Borrow fee | Frais d'emprunt de titres | 05 | F | The cost of borrowing a share to short |
| `short_squeeze` | Short squeeze | Short squeeze | 05 |  | A rise forcing short sellers to buy back |
| `long_position` | Long position | Position longue | 05 |  | Owning an asset to profit if it rises |
| `short_position` | Short position | Position courte | 05 |  | Owing an asset to profit if it falls |
| `position_size` | Position size | Taille de position | 05 |  | How much of an asset you hold |
| `p_l` | P&L | Résultat | 05 | F | Profit and loss |
| `unrealized_p_l` | Unrealized P&L | Résultat latent | 05 | F | Profit or loss on positions still open |
| `realized_p_l` | Realized P&L | Résultat réalisé | 05 | F | Profit or loss locked in by closing |
| `drawdown` | Drawdown | Perte maximale | 05 | F | The fall from a peak to a trough |
| `sharpe_ratio` | Sharpe ratio | Ratio de Sharpe | 05 | F | Return above cash per unit of volatility |
| `benchmark` | Benchmark | Indice de référence | 05 |  | What a strategy's return is compared with |
| `index` | Index | Indice | 05 | F | A weighted basket price used as a reference |
| `sector` | Sector | Secteur | 05 |  | A group of companies in the same line of business |
| `tape` | Tape | Ruban | 05 |  | The public record of trades |
| `front_running` | Front running | Front running | 05 |  | Trading ahead of a known client order, prohibited |
| `spoofing` | Spoofing | Spoofing | 05 |  | Placing orders meant to be cancelled to mislead, prohibited |
| `wash_trading` | Wash trading | Transactions fictives | 05 |  | Trading with yourself to fake volume, prohibited |
| `market_manipulation` | Market manipulation | Manipulation de marché | 05 |  | Any act meant to mislead prices, prohibited |
| `insider_trading` | Insider trading | Délit d'initié | 05 |  | Trading on non-public information, prohibited |
| | **Asset classes** | | | | |
| `stock` | Stock | Action | 06 |  | A share of ownership in a company |
| `share` | Share | Part | 06 |  | One unit of a company's ownership |
| `market_capitalization` | Market capitalization | Capitalisation boursière | 06 | F | Share price times shares outstanding |
| `p_e_ratio` | P/E ratio | PER | 06 | F | Price divided by earnings per share |
| `earnings_per_share` | Earnings per share | Bénéfice par action | 06 | F | Net income divided by shares |
| `earnings_report` | Earnings report | Publication de résultats | 06 |  | A company's quarterly results |
| `guidance` | Guidance | Prévisions | 06 |  | What a company says about its next results |
| `etf` | ETF | ETF | 06 |  | A fund traded on an exchange like a stock |
| `nav` | NAV | VL | 06 | F | Net asset value per share of a fund |
| `premium_to_nav` | Premium to NAV | Prime sur VL | 06 | F | A fund price above its NAV |
| `bond` | Bond | Obligation | 06 |  | A loan sold as a tradeable security |
| `coupon` | Coupon | Coupon | 06 |  | A bond's periodic interest payment |
| `face_value` | Face value | Valeur nominale | 06 |  | The amount a bond repays at maturity |
| `maturity` | Maturity | Échéance | 06 |  | The date a bond repays |
| `yield_to_maturity` | Yield to maturity | Rendement à l'échéance | 06 | F | A bond's total return if held to maturity |
| `duration` | Duration | Duration | 06 | F | A bond's price sensitivity to rates |
| `convexity` | Convexity | Convexité | 06 | F | How duration changes as rates move |
| `credit_spread` | Credit spread | Écart de crédit | 06 | F | Extra yield over a government bond |
| `investment_grade` | Investment grade | Catégorie investissement | 06 |  | Bonds rated BBB or better |
| `high_yield` | High yield | Haut rendement | 06 |  | Bonds rated below BBB |
| `accrued_interest` | Accrued interest | Intérêts courus | 06 | F | Coupon earned since the last payment |
| `callable_bond` | Callable bond | Obligation remboursable par anticipation | 06 |  | A bond the issuer may repay early |
| `commodity` | Commodity | Matière première | 06 |  | A raw good such as oil, grain or metal |
| `spot_price` | Spot price | Prix au comptant | 06 |  | The price for delivery now |
| `futures` | Futures | Contrat à terme | 06 |  | An exchange contract to trade later at a set price |
| `contango` | Contango | Contango | 06 |  | Futures priced above spot |
| `backwardation` | Backwardation | Déport | 06 |  | Futures priced below spot |
| `roll` | Roll | Roulement | 06 |  | Replacing an expiring future with a later one |
| `contract_size` | Contract size | Taille du contrat | 06 |  | The quantity one futures contract covers |
| `delivery` | Delivery | Livraison | 06 |  | Settling a commodity contract with the physical good |
| `storage_cost` | Storage cost | Coût de stockage | 06 | F | The cost of holding a physical commodity |
| `hub` | Hub | Hub | 06 |  | A place where a commodity is priced and delivered |
| `route` | Route | Route | 06 |  | A shipping lane between hubs |
| `currency_pair` | Currency pair | Paire de devises | 06 |  | Two currencies quoted against each other |
| `carry_trade` | Carry trade | Carry trade | 06 |  | Borrowing in a low-rate currency to hold a high-rate one |
| `option` | Option | Option | 06 |  | The right, not the obligation, to buy or sell at a set price |
| `call_option` | Call option | Option d'achat | 06 |  | The right to buy |
| `put_option` | Put option | Option de vente | 06 |  | The right to sell |
| `strike` | Strike | Prix d'exercice | 06 |  | The price fixed in an option |
| `expiry` | Expiry | Expiration | 06 |  | The last day an option can be used |
| `premium` | Premium | Prime | 06 |  | The price paid for an option |
| `in_the_money` | In the money | Dans la monnaie | 06 |  | An option worth exercising now |
| `out_of_the_money` | Out of the money | Hors de la monnaie | 06 |  | An option not worth exercising now |
| `delta` | Delta | Delta | 06 | F | How much an option moves per unit of the underlying |
| `gamma` | Gamma | Gamma | 06 | F | How fast delta changes |
| `theta` | Theta | Thêta | 06 | F | How much an option loses per day |
| `vega` | Vega | Véga | 06 | F | How much an option moves with volatility |
| `black_scholes` | Black-Scholes | Black-Scholes | 06 | F | The standard option pricing formula |
| `swap` | Swap | Swap | 06 |  | An exchange of payment streams |
| `interest_rate_swap` | Interest rate swap | Swap de taux | 06 |  | Swapping fixed for floating interest |
| `credit_default_swap` | Credit default swap | CDS | 06 |  | Insurance against a borrower's default |
| `crypto_token` | Crypto token | Jeton crypto | 06 |  | A fictional digital asset on a fictional chain |
| `stablecoin` | Stablecoin | Stablecoin | 06 |  | A token designed to hold a fixed price |
| `depeg` | Depeg | Décrochage | 06 |  | A stablecoin losing its fixed price |
| `chain` | Chain | Chaîne | 06 |  | A fictional ledger network for tokens |
| `liquidity_pool` | Liquidity pool | Pool de liquidité | 06 |  | Tokens deposited for automated trading |
| `staking` | Staking | Staking | 06 |  | Locking tokens to earn a reward |
| `impermanent_loss` | Impermanent loss | Perte impermanente | 06 | F | The cost of providing pool liquidity when prices diverge |
| `collectible` | Collectible | Objet de collection | 06 |  | A unique item valued by rarity and condition |
| `provenance` | Provenance | Provenance | 06 |  | The ownership history of a collectible |
| `lot` | Lot | Lot | 06 |  | An item or bundle offered at auction |
| `underlying` | Underlying | Sous-jacent | 06 |  | The asset a derivative depends on |
| | **Banking, credit and clearing** | | | | |
| `bank` | Bank | Banque | 07 |  | An institution that takes deposits and lends |
| `deposit` | Deposit | Dépôt | 07 |  | Money placed with a bank |
| `loan` | Loan | Prêt | 07 |  | Money borrowed to be repaid with interest |
| `interest` | Interest | Intérêt | 07 | F | The price of borrowing money |
| `apr` | APR | TAEG | 07 | F | Annual percentage rate on a loan |
| `principal` | Principal | Capital | 07 |  | The amount borrowed |
| `amortization` | Amortization | Amortissement de prêt | 07 | F | Repaying a loan in instalments |
| `collateral` | Collateral | Garantie | 07 |  | An asset pledged to secure a loan |
| `haircut` | Haircut | Décote | 07 | F | The discount applied to collateral value |
| `loan_to_value` | Loan-to-value | Ratio prêt-valeur | 07 | F | Loan size as a share of collateral value |
| `credit_score` | Credit score | Score de crédit | 07 | F | A lender's rating of your reliability |
| `credit_line` | Credit line | Ligne de crédit | 07 |  | A loan you can draw as needed |
| `default` | Default | Défaut | 07 |  | Failing to pay what you owe |
| `recovery_rate` | Recovery rate | Taux de recouvrement | 07 | F | The share of a defaulted debt eventually repaid |
| `margin` | Margin | Marge | 07 |  | Collateral posted against a leveraged position |
| `initial_margin` | Initial margin | Marge initiale | 07 | F | Collateral required to open a position |
| `maintenance_margin` | Maintenance margin | Marge de maintien | 07 | F | The minimum collateral to keep it open |
| `margin_call` | Margin call | Appel de marge | 07 |  | A demand to add collateral |
| `liquidation` | Liquidation | Liquidation | 07 |  | Forced closing of a position or sale of assets |
| `leverage` | Leverage | Effet de levier | 07 | F | Controlling more than your equity with borrowed money |
| `clearing_house` | Clearing House | Chambre de compensation | 07 |  | The central counterparty for cleared products |
| `ccp` | CCP | CCP | 07 |  | Central counterparty; another name for the Clearing House |
| `clearing_member` | Clearing member | Membre compensateur | 07 |  | A firm that clears trades for itself and clients |
| `default_fund` | Default fund | Fonds de défaillance | 07 |  | Members' pooled money to cover a member default |
| `default_waterfall` | Default waterfall | Cascade de défaillance | 07 |  | The order in which losses are absorbed |
| `variation_margin` | Variation margin | Marge de variation | 07 | F | Daily payment of gains and losses on cleared positions |
| `settlement` | Settlement | Règlement | 07 |  | The final exchange of cash and assets |
| `repo` | Repo | Pension livrée | 07 |  | A loan secured by bonds with a buy-back |
| `repo_rate` | Repo rate | Taux de pension | 07 |  | The interest on a repo |
| `interbank_rate` | Interbank rate | Taux interbancaire | 07 |  | The rate banks lend to each other |
| `bank_run` | Bank run | Panique bancaire | 07 |  | Depositors withdrawing at once |
| `capital_ratio` | Capital ratio | Ratio de fonds propres | 07 | F | Bank capital as a share of risk-weighted assets |
| `risk_weighted_assets` | Risk-weighted assets | Actifs pondérés | 07 | F | Assets scaled by riskiness |
| `liquidity_coverage_ratio` | Liquidity coverage ratio | Ratio de liquidité | 07 | F | Liquid assets over expected outflows |
| `deposit_insurance` | Deposit insurance | Garantie des dépôts | 07 |  | A scheme repaying depositors if a bank fails |
| `bail_in` | Bail-in | Renflouement interne | 07 |  | Making creditors absorb a bank's losses |
| `mortgage` | Mortgage | Prêt immobilier | 07 |  | A loan secured by property |
| `securitization` | Securitization | Titrisation | 07 |  | Pooling loans into tradeable securities |
| `tranche` | Tranche | Tranche | 07 |  | A slice of a securitization with its own risk |
| `primary_dealer` | Primary dealer | Négociateur principal | 07 |  | A bank that buys government bonds at auction |
| `covenant` | Covenant | Clause restrictive | 07 |  | A condition a borrower must keep |
| `credit_limit` | Credit limit | Plafond de crédit | 07 |  | The most a lender will lend you |
| | **Funds, structured products, insurance** | | | | |
| `fund` | Fund | Fonds | 08 |  | A pool of money managed for investors |
| `hedge_fund` | Hedge fund | Fonds spéculatif | 08 |  | A fund using leverage, shorts and derivatives |
| `mutual_fund` | Mutual fund | Fonds commun | 08 |  | A fund open to ordinary investors |
| `sovereign_wealth_fund` | Sovereign wealth fund | Fonds souverain | 08 |  | A fund owned by a government |
| `pension_fund` | Pension fund | Fonds de pension | 08 |  | A fund that pays retirement income |
| `management_fee` | Management fee | Frais de gestion | 08 | F | A yearly fee on assets managed |
| `performance_fee` | Performance fee | Commission de performance | 08 | F | A share of profits paid to the manager |
| `high_water_mark` | High-water mark | Plus haut historique | 08 | F | The level a fund must pass before earning performance fees |
| `subscription` | Subscription | Souscription | 08 |  | Putting money into a fund |
| `redemption` | Redemption | Rachat | 08 |  | Taking money out of a fund |
| `lock_up` | Lock-up | Période de blocage | 08 |  | A time investors cannot redeem |
| `gate` | Gate | Plafond de rachat | 08 |  | A limit on redemptions in a period |
| `aum` | AUM | Encours | 08 |  | Assets under management |
| `mandate` | Mandate | Mandat | 08 |  | The rules an operator must follow when managing for you |
| `rating_agency` | Rating agency | Agence de notation | 08 |  | A firm that grades credit risk |
| `credit_rating` | Credit rating | Note de crédit | 08 |  | A letter grade for default risk |
| `downgrade` | Downgrade | Dégradation | 08 |  | A lower credit rating |
| `structured_product` | Structured product | Produit structuré | 08 |  | A security built from bonds and derivatives |
| `capital_protection` | Capital protection | Protection du capital | 08 |  | A promise to repay the original sum |
| `insurance` | Insurance | Assurance | 08 |  | Paying a premium to be covered against a loss |
| `insurer` | Insurer | Assureur | 08 |  | A firm that sells insurance |
| `reinsurance` | Reinsurance | Réassurance | 08 |  | Insurance bought by insurers |
| `policy` | Policy | Police | 08 |  | An insurance contract |
| `deductible` | Deductible | Franchise | 08 |  | The part of a loss you pay yourself |
| `claim_insurance` | Claim (insurance) | Sinistre | 08 |  | A request for an insurer to pay |
| `peril` | Peril | Péril | 08 |  | A cause of loss such as fire or flood |
| `catastrophe_bond` | Catastrophe bond | Obligation catastrophe | 08 |  | A bond that loses value if a disaster happens |
| `loss_ratio` | Loss ratio | Ratio sinistres | 08 | F | Claims paid over premiums earned |
| `solvency_ratio` | Solvency ratio | Ratio de solvabilité | 08 | F | An insurer's capital over its required capital |
| `guarantee_scheme` | Guarantee scheme | Fonds de garantie | 08 |  | A fund that pays if an insurer fails |
| `fund_of_funds` | Fund of funds | Fonds de fonds | 08 |  | A fund that invests in other funds |
| `track_record` | Track record | Historique de performance | 08 |  | A manager's past results |
| | **Businesses and companies** | | | | |
| `business` | Business | Entreprise | 09 |  | A company you run that sells goods or services |
| `business_type` | Business type | Type d'entreprise | 09 |  | One of the 150 kinds of business |
| `tier` | Tier | Palier | 09 |  | A business's size class from B1 to B6 |
| `archetype` | Archetype | Archétype | 09 |  | The economic model a business type follows |
| `capacity` | Capacity | Capacité | 09 | F | How many sales a business can make per hour |
| `utilization` | Utilization | Taux d'utilisation | 09 | F | Sales as a share of capacity |
| `footfall` | Footfall | Fréquentation | 09 |  | Customers passing a location |
| `demand_curve` | Demand curve | Courbe de demande | 09 | F | How sales fall as price rises |
| `price_elasticity` | Price elasticity | Élasticité-prix | 09 | F | How strongly demand reacts to price |
| `reference_price` | Reference price | Prix de référence | 09 |  | The typical price customers expect |
| `payback_period` | Payback period | Délai de récupération | 09 | F | How long profits take to repay the setup cost |
| `setup_cost` | Setup cost | Coût d'installation | 09 |  | The money to open a business |
| `upkeep` | Upkeep | Frais fixes | 09 |  | Running costs paid whatever you sell |
| `wages` | Wages | Salaires | 09 |  | Money paid to staff |
| `staff` | Staff | Personnel | 09 |  | The people who work in a business |
| `manager` | Manager | Gérant | 09 |  | A staff member who runs a business for you |
| `supplier` | Supplier | Fournisseur | 09 |  | A firm that sells you inputs |
| `input` | Input | Intrant | 09 |  | A good a business needs to produce |
| `intermediate_good` | Intermediate good | Bien intermédiaire | 09 |  | A product made to be used by other businesses |
| `b2b` | B2B | B2B | 09 |  | Sales between businesses |
| `product_category` | Product category | Catégorie de produits | 09 |  | A group of goods customers compare |
| `market_share` | Market share | Part de marché | 09 | F | Your sales as a share of the category |
| `competition` | Competition | Concurrence | 09 |  | Other sellers in your category and city |
| `season` | Season | Saison | 09 |  | A time of year that shifts demand |
| `hour_profile` | Hour profile | Profil horaire | 09 |  | How demand varies over the day |
| `certification` | Certification | Certification | 09 |  | A credential that unlocks customers or products |
| `licence` | Licence | Licence | 09 |  | A permit required to operate or trade |
| `concession` | Concession | Concession | 09 |  | An exclusive right to run a site, won by tender |
| `tender` | Tender | Appel d'offres | 09 |  | A sealed competition for a concession |
| `franchise_sports` | Franchise (sports) | Franchise sportive | 09 |  | A sports team operated as a business |
| `twist` | Twist | Particularité | 09 |  | A special rule that makes a business type distinctive |
| `startup` | Startup | Start-up | 09 |  | A young company seeking investment |
| `valuation` | Valuation | Valorisation | 09 | F | What a company is judged to be worth |
| `pre_money_valuation` | Pre-money valuation | Valorisation pré-money | 09 | F | A company's value before new investment |
| `dilution` | Dilution | Dilution | 09 | F | Your share shrinking when new shares are issued |
| `cap_table` | Cap table | Table de capitalisation | 09 |  | Who owns what share of a company |
| `ipo` | IPO | Introduction en bourse | 09 |  | Listing a company's shares for the first time |
| `acquisition` | Acquisition | Acquisition | 09 |  | Buying a whole company |
| `merger` | Merger | Fusion | 09 |  | Two companies combining |
| `strategic_acquirer` | Strategic acquirer | Acquéreur stratégique | 09 |  | A listed company that buys businesses in its sector |
| `exit` | Exit | Sortie | 09 |  | Selling your stake in a company |
| `holding_company` | Holding company | Société holding | 09 |  | A company that owns other companies |
| `shell_company` | Shell company | Société écran | 09 |  | A company with no real operations |
| `bankruptcy` | Bankruptcy | Faillite | 09 |  | A company unable to pay its debts |
| `reputation_business` | Reputation (business) | Réputation commerciale | 09 |  | Customers' view of a business |
| `inventory_business` | Inventory (business) | Stock | 09 |  | Goods a business holds to sell |
| `spoilage` | Spoilage | Pertes | 09 |  | Stock lost to expiry |
| | **Real estate and cities** | | | | |
| `city` | City | Ville | 10 |  | One of the game's cities where you can own businesses and property |
| `district` | District | Quartier | 10 |  | A part of a city with its own rents and demand |
| `landmark` | Landmark | Monument | 10 |  | A district's notable building |
| `plot` | Plot | Parcelle | 10 |  | A piece of land you can build on |
| `lease` | Lease | Bail | 10 |  | A contract to rent property |
| `rent` | Rent | Loyer | 10 |  | The price of using a property |
| `rental_yield` | Rental yield | Rendement locatif | 10 | F | Yearly rent as a share of price |
| `cap_rate` | Cap rate | Taux de capitalisation | 10 | F | Net operating income over property value |
| `vacancy_rate` | Vacancy rate | Taux de vacance | 10 | F | The share of property empty |
| `zoning` | Zoning | Zonage | 10 |  | Rules on what can be built where |
| `permit` | Permit | Permis | 10 |  | Approval to build or change a property |
| `construction` | Construction | Construction | 10 |  | Building on a plot over time |
| `renovation` | Renovation | Rénovation | 10 |  | Improving a property to raise its value |
| `gentrification` | Gentrification | Gentrification | 10 |  | A district becoming more expensive |
| `home_city` | Home city | Ville d'origine | 10 |  | The city where your character lives |
| `residence` | Residence | Résidence | 10 |  | Where your character lives |
| `penthouse` | Penthouse | Penthouse | 10 |  | A top-floor luxury home |
| `property_tax` | Property tax | Taxe foncière | 10 |  | A yearly tax on property |
| `appraisal` | Appraisal | Expertise | 10 |  | An estimate of a property's value |
| `hall_of_patrons` | Hall of Patrons | Salle des mécènes | 10 |  | A city's public list of its top patrons |
| `crown_residence` | Crown residence | Résidence de prestige | 10 |  | A city's single most prestigious home |
| `isla_serena` | Isla Serena | Isla Serena | 10 |  | The private islands sold to the wealthiest players |
| `peril_map` | Peril map | Carte des risques | 10 |  | Where fires, floods and storms are likely |
| `reit` | REIT | SIIC | 10 |  | A listed company that owns property |
| | **AI Lab** | | | | |
| `ai_lab` | AI Lab | Laboratoire IA | 11 |  | Where you build trading models |
| `model` | Model | Modèle | 11 |  | A trained program that makes trading decisions |
| `mcs` | MCS | MCS | 11 | F | Model Capability Score, the scalar capability of an AI model |
| `decision_unit` | Decision unit | Unité de décision | 11 |  | The CPU budget for one AI evaluation of one signal |
| `compute` | Compute | Puissance de calcul | 11 |  | The hardware capacity for training and running models |
| `gpu` | GPU | GPU | 11 |  | A processor used to train models |
| `cloud` | Cloud | Nuage | 11 |  | Rented compute from a provider |
| `colocation` | Colocation | Colocation | 11 |  | Placing your hardware in a provider's data centre |
| `dataset` | Dataset | Jeu de données | 11 |  | Data used to train a model |
| `data_broker` | Data broker | Courtier en données | 11 |  | A firm that sells datasets |
| `alternative_data` | Alternative data | Données alternatives | 11 |  | Non-price data such as foot traffic or shipping |
| `training_run` | Training run | Entraînement | 11 |  | Building a model from data and compute |
| `overfitting` | Overfitting | Surapprentissage | 11 |  | A model that fits the past but fails on new data |
| `backtest` | Backtest | Test rétrospectif | 11 |  | Running a strategy on past data |
| `out_of_sample` | Out-of-sample | Hors échantillon | 11 |  | Data not used for training |
| `signal` | Signal | Signal | 11 |  | A model's prediction about an asset |
| `strategy_template` | Strategy template | Modèle de stratégie | 11 |  | A starting design for a trading model |
| `research_node` | Research node | Nœud de recherche | 11 |  | An upgrade on the lab's research tree |
| `star_researcher` | Star researcher | Chercheur vedette | 11 |  | A rare hire who boosts research |
| `codename` | Codename | Nom de code | 11 |  | A model's name |
| `model_card` | Model card | Fiche modèle | 11 |  | The public summary of a model |
| `model_licensing` | Model licensing | Licence de modèle | 11 |  | Renting your model to others |
| `breakthrough` | Breakthrough | Percée | 11 |  | A world event that raises what models can do |
| `era` | Era | Ère | 11 |  | A period of AI capability in the world |
| `ai_rule` | AI rule | Règle IA | 11 |  | A regulation that limits how models may trade |
| `kill_switch` | Kill switch | Arrêt d'urgence | 11 |  | A control that stops a model at once |
| `model_tournament` | Model tournament | Tournoi de modèles | 11 |  | A competition between players' models |
| `partnership_slot` | Partnership slot | Partenariat de données | 11 |  | An exclusive alt-data deal with a firm |
| `inference` | Inference | Inférence | 11 |  | Running a trained model to get decisions |
| | **Conflict and intelligence** | | | | |
| `ap` | AP | PA | 12 | F | Attack Power in the conflict system |
| `dp` | DP | PD | 12 | F | Defense Power in the conflict system |
| `operation` | Operation | Opération | 12 |  | An action against another entity |
| `quiet_op` | Quiet op | Opération discrète | 12 |  | An operation meant to stay hidden |
| `loud_op` | Loud op | Opération ouverte | 12 |  | An operation that is visible |
| `hidden_session` | Hidden session | Session cachée | 12 |  | A concealed connection that accrues progress until found |
| `detection` | Detection | Détection | 12 | F | Discovering an operation against you |
| `attribution` | Attribution | Attribution | 12 |  | Proving who ran an operation |
| `evidence` | Evidence | Preuve | 12 |  | Records that support attribution in court |
| `endpoint` | Endpoint | Point d'accès | 12 |  | A system of yours that ops can target |
| `security_audit` | Security audit | Audit de sécurité | 12 |  | A paid check of your defenses |
| `defense_gap` | Defense gap | Faille de défense | 12 |  | Weak defenses against current threats |
| `crew` | Crew | Équipe | 12 |  | A group hired to run operations |
| `deception` | Deception | Leurre | 12 |  | A false target meant to mislead attackers |
| `intelligence` | Intelligence | Renseignement | 12 |  | Information about others' plans and holdings |
| `secret` | Secret | Secret | 12 |  | A hidden fact about the world that can be found |
| `mosaic` | Mosaic | Mosaïque | 12 |  | Assembling a secret from public clues |
| `leak` | Leak | Fuite | 12 |  | Information about an entity exposed without its consent |
| `notoriety` | Notoriety | Notoriété | 12 | F | Fame from crime |
| `heat` | Heat | Pression | 12 | F | How closely the authorities are watching you |
| `forensics` | Forensics | Investigation numérique | 12 |  | Examining systems after an incident |
| `insurance_cyber` | Insurance (cyber) | Assurance cyber | 12 |  | Cover against losses from operations |
| | **Law, courts and regulators** | | | | |
| `regulator` | Regulator | Régulateur | 13 |  | The body that writes and enforces rules |
| `exchange_authority` | Exchange Authority | Autorité des marchés | 13 |  | The world body that polices market conduct |
| `investigation` | Investigation | Enquête | 13 |  | A regulator examining suspected misconduct |
| `charge` | Charge | Accusation | 13 |  | A formal allegation |
| `lawsuit` | Lawsuit | Procès civil | 13 |  | A civil claim between parties |
| `plaintiff` | Plaintiff | Demandeur | 13 |  | The party who sues |
| `defendant` | Defendant | Défendeur | 13 |  | The party who is sued |
| `settlement_legal` | Settlement (legal) | Transaction | 13 |  | Ending a case by agreement |
| `verdict` | Verdict | Verdict | 13 |  | A court's decision |
| `appeal` | Appeal | Appel | 13 |  | Asking a higher court to review |
| `damages` | Damages | Dommages-intérêts | 13 |  | Money awarded for harm |
| `injunction` | Injunction | Injonction | 13 |  | A court order to do or stop something |
| `sanction` | Sanction | Sanction | 13 |  | A penalty imposed by a regulator |
| `ban` | Ban | Interdiction | 13 |  | A prohibition from an activity |
| `probation` | Probation | Mise à l'épreuve | 13 |  | A period of extra scrutiny |
| `compliance` | Compliance | Conformité | 13 |  | Following the rules |
| `disclosure` | Disclosure | Déclaration | 13 |  | A required public filing |
| `filing` | Filing | Dépôt réglementaire | 13 |  | A document submitted to a regulator |
| `law_firm` | Law firm | Cabinet d'avocats | 13 |  | A firm that represents you |
| `private_investigator` | Private investigator | Détective privé | 13 |  | A hire who gathers evidence |
| `statute_of_limitations` | Statute of limitations | Prescription | 13 |  | The time after which a case cannot be brought |
| `burden_of_proof` | Burden of proof | Charge de la preuve | 13 |  | How much evidence is needed to win |
| `lobbying` | Lobbying | Lobbying | 13 |  | Spending to influence policy |
| `whistleblower` | Whistleblower | Lanceur d'alerte | 13 |  | Someone who reports misconduct |
| | **Progression and lifestyle** | | | | |
| `rank` | Rank | Rang | 14 |  | Your tier from R0 Broke to R6 Dynasty, from net worth |
| `prestige` | Prestige | Prestige | 14 | F | Status from lifestyle |
| `reputation` | Reputation | Réputation | 14 | F | Trust from clean conduct |
| `legacy` | Legacy | Héritage | 14 |  | The permanent public record of what you built |
| `shell` | Shell | Habillage | 14 |  | The interface's material theme, upgraded with rank |
| `background` | Background | Origine | 14 |  | Your character's starting story |
| `heir` | Heir | Héritier | 14 |  | A successor who inherits your estate |
| `estate` | Estate | Succession | 14 |  | What passes to your heir |
| `dynasty` | Dynasty | Dynastie | 14 |  | A family line that carries a legacy |
| `crest` | Crest | Blason | 14 |  | Your House's emblem |
| `house` | House | Maison | 14 |  | Your family name in the world |
| `motto` | Motto | Devise | 14 |  | Your crest's phrase |
| `title` | Title | Titre | 14 |  | An earned label shown with your name |
| `club` | Club | Club | 14 |  | A members' circle with dues and perks |
| `hosting` | Hosting | Réception | 14 |  | Holding an event that raises prestige |
| `philanthropy` | Philanthropy | Philanthropie | 14 |  | Giving to causes |
| `cause` | Cause | Cause | 14 |  | A charity area you can support |
| `gilt_list` | Gilt List | Gilt List | 14 |  | The public ranking of the wealthiest Houses |
| `collection_set` | Collection set | Collection | 14 |  | A group of collectibles that gives a bonus when complete |
| `unique_item` | Unique item | Pièce unique | 14 |  | A one-of-a-kind collectible |
| `luxury_good` | Luxury good | Produit de luxe | 14 |  | A prestige purchase |
| `decor` | Decor | Décor | 14 |  | Items that furnish your residence |
| | **Multiplayer and social** | | | | |
| `alliance` | Alliance | Alliance | 15 |  | A group of players that cooperate |
| `contract` | Contract | Contrat | 15 |  | A binding agreement between players |
| `clause` | Clause | Clause | 15 |  | One term of a contract |
| `leaderboard` | Leaderboard | Classement | 15 |  | A public ranking |
| `league` | League | Ligue | 15 |  | A ranked group of players |
| `theme` | Theme | Thème | 15 |  | A chapter's featured market story |
| `scenario` | Scenario | Scénario | 15 |  | An authored practice world |
| `tournament` | Tournament | Tournoi | 15 |  | A timed competition |
| `roll_up_region` | Roll-up region | Région agrégée | 15 |  | A group of cities ranked together |
| `chat_channel` | Chat channel | Canal de discussion | 15 |  | A place to talk with other players |
| `report` | Report | Signalement | 15 |  | Flagging content for moderators |
| `moderation` | Moderation | Modération | 15 |  | Enforcement of community rules |
| `mentor` | Mentor | Mentor | 15 |  | A player who guides a newcomer |
| `public_filing` | Public filing | Déclaration publique | 15 |  | A disclosure other players can read |
| | **Living world** | | | | |
| `npc_actor` | NPC actor | Acteur PNJ | 16 |  | One of the 600 named people who run the world |
| `trait` | Trait | Trait | 16 |  | A personality value that shapes an actor's choices |
| `career` | Career | Carrière | 16 |  | An actor's job history |
| `party` | Party | Parti | 16 |  | A political party |
| `caucus` | Caucus | Groupe parlementaire | 16 |  | A bloc of legislators on an issue |
| `lever` | Lever | Levier | 16 |  | A policy a government can pull |
| `outlet` | Outlet | Média | 16 |  | A news organization |
| `headline` | Headline | Titre | 16 |  | A news item's title |
| `rumor_source` | Rumor source | Source de rumeurs | 16 |  | A channel that spreads unconfirmed claims |
| `analyst` | Analyst | Analyste | 16 |  | A commentator who rates companies |
| `shock` | Shock | Choc | 16 |  | A sudden world event |
| `crisis` | Crisis | Crise | 16 |  | A large shock with chained effects |
| `chronicle` | Chronicle | Chronique | 16 |  | The world's written history |
| `event_chain` | Event chain | Chaîne d'événements | 16 |  | Events that trigger further events |
| | **Interface, Academy and platform** | | | | |
| `launcher` | Launcher | Lanceur | 17/18/21 |  | The home grid of apps |
| `simple_mode` | Simple mode | Mode simple | 17/18/21 |  | A view with fewer numbers |
| `pro_mode` | Pro mode | Mode pro | 17/18/21 |  | A view with full detail |
| `watchlist` | Watchlist | Liste de suivi | 17/18/21 |  | Assets you follow |
| `alert` | Alert | Alerte | 17/18/21 |  | A notification when a condition is met |
| `notification` | Notification | Notification | 17/18/21 |  | A message from the game |
| `academy` | Academy | Académie | 17/18/21 |  | The in-game school of courses |
| `course` | Course | Cours | 17/18/21 |  | A set of lessons on one topic |
| `lesson` | Lesson | Leçon | 17/18/21 |  | One short teaching unit |
| `quiz` | Quiz | Quiz | 17/18/21 |  | Questions that check a lesson |
| `drill` | Drill | Exercice | 17/18/21 |  | A timed practice task |
| `practice_world` | Practice world | Monde d'entraînement | 17/18/21 |  | A private world for learning |
| `licence_exam` | Licence exam | Examen de licence | 17/18/21 |  | A test that unlocks an asset class |
| `coach_mark` | Coach mark | Repère guidé | 17/18/21 |  | A pointer that teaches a control |
| `goal` | Goal | Objectif | 17/18/21 |  | A step on the early-game ladder |
| `advisor` | Advisor | Conseiller | 17/18/21 |  | Notes that describe your risks, never trade tips |
| `atelier` | Atelier | Atelier | 17/18/21 |  | The store for cosmetic items |
| `cosmetic` | Cosmetic | Cosmétique | 17/18/21 |  | An item that changes looks only |
| `chapter_pass` | Chapter pass | Passe de chapitre | 17/18/21 |  | A track of cosmetic rewards for a chapter |
| `live_event` | Live event | Événement | 17/18/21 |  | A timed world event with its own goals |
| `rewarded_ad` | Rewarded ad | Publicité récompensée | 17/18/21 |  | An optional ad that grants restricted cash |
| `patch_notes` | Patch notes | Notes de version | 17/18/21 |  | What changed in an update |
| `integrity_report` | Integrity Report | Rapport d'intégrité | 17/18/21 |  | The Exchange's weekly report on market conduct |
| `violation` | Violation | Infraction | 17/18/21 |  | A breach of the community rules |

505 terms. New terms are added by the owning module's content pass; ids are stable (§0.1 rule 3).

## §18 Validation checks (content loader; run in CI and at genesis)

The content loader in 19 refuses to build or to start a world when any check fails. Each check has an id so 20 can reference it.

| id | Check | Fails when |
|---|---|---|
| CV01 | Unique ids | any id repeats within a catalog, or a global id (entity, instrument, actor) repeats across catalogs |
| CV02 | Stable ids | an id present in the previous `catalogVersion` is missing (must be `retired: true` instead) |
| CV03 | Launch counts | not exactly: 5 blocs, 16 launch cities, 400 authored instruments (240 equities, 30 ETFs, 30 government bonds, 50 corporate bonds, 10 FX pairs, 20 commodity lines, 20 tokens), 26 banks, 40 NPC funds, 150 business types, 68 data brokers, 25 clouds, 30 NPC labs, 40 star researchers, 120 partnership slots, 600 actors, 12 dynasties, 20 parties, 15 outlets, 120 shocks, 40 authored secrets, 40 breakthroughs, 136 Atelier items, 20 scenarios |
| CV04 | Foreign keys | a row references an id (city, district, bloc, sector, category, certification, actor, institution) that does not exist |
| CV05 | Bloc aliases | an alias in the §1.1 alias table points to no bloc, or two aliases collide |
| CV06 | Business calibration | for any business type, the stored `capacityPerHour0` differs by more than 1% from `dailyRev / (0.75 × openHours × refPrice)` with `dailyRev = c0 / (payback × margin)` (§6.3) |
| CV07 | Category coverage | a business type sells into no category, or a category has no seller type and no NPC firm generator weight |
| CV08 | Twist hooks | a twist names a hook the engine of 09 does not export, or a business type references a missing twist |
| CV09 | Index weights | an index's constituents do not exist or weights do not sum to 1 ± 1e-9 |
| CV10 | Asset groups | an instrument has no asset group, or a group maps to no MARKET partition (19) |
| CV11 | Secrets | an authored secret has fewer than 2 discovery paths, or none of its paths is `PUBLIC_MOSAIC` |
| CV12 | Shocks | a shock references a missing sector, bloc or commodity, or its magnitude band is outside 16's bounds |
| CV13 | News templates | a template uses a slot its kind does not supply, or a kind has fewer templates than 16 requires |
| CV14 | Strings | any `<ns>.<id>.*` key referenced by a catalog is missing in `en` or `fr`; any template slot differs between `en` and `fr` |
| CV15 | Glossary | a glossary-tagged UI key points to a missing term (18-AT-22); fewer than 400 terms |
| CV16 | Help | a 17 §7 screen id has no `help.<screenId>` article |
| CV17 | Moderation | any authored or generated name hits the banned list or a reserved word outside its own institution (§16.4); generators re-run the check at generation time (§0.2 rule 5) |
| CV18 | Fiction (L6) | any name matches the real-world name list maintained by Trust and Safety (V12) |
| CV19 | No gambling or vice (L5, L10) | any item, business type, event or Atelier entry is tagged gambling, prediction market or vice |
| CV20 | Cosmetics only (L7) | an Atelier, pass or event-reward item carries a gameplay effect field |
| CV21 | Generator determinism | running every generator twice with the same seed yields byte-identical output |
| CV22 | Generator uniqueness | a generator cannot produce its declared count of unique names within the collision rule (§0.2 rule 4) for 1,000 test seeds |
| CV23 | Content hash | the world's stored `contentHash` differs from the hash of the loaded files (replays refuse to run) |
| CV24 | Conflict content | an op, crew or deception text contains a term from the technique-word list (abstract-only rule of 12) |
| CV25 | Money units | a money column is not a whole number in its stated currency, or a negative price appears |

Checks CV03 and CV06 also run in the 20 harness at every content change.
