# Unit 14B - Lifestyle, Prestige, Reputation, Notoriety, clubs, hosting, House, Legacy, deletion, status publications (stage S7)

Purpose: the rest of module 14 on top of 14A (19 §12.2 row 14.B, depends on 14.A, 10.B, 13.B). The lifestyle catalog and owned items, the voluntary sinks (purchase hit, upkeep, staff, dues, hosting, experiences, philanthropy), Prestige, Reputation and Notoriety, clubs and hosting, the Chief of Staff, Houses and succession, Legacy and plaques, the Hall of Patrons slots, the Gilt List, verified track records, account deletion (§3.1.7) and the 14B views. All files under `packages/engine/character/life`.

## Tasks (build order, one PR each)
T14B-01 Schema, tables (extends 14A acct.title), reason-code bindings with 03 aliases, events
T14B-02 Catalog transcription and pure price, value and PP formulas (14#14, 16, 17)
T14B-03 Boutique, residence, storage, display, buyback, starter gift (14#13, 20)
T14B-04 Drops, NPC drop buyers, consignment, player editions (14#22, 23)
T14B-05 Upkeep, condition, restoration, marks, collateral, theft (14#15)
T14B-06 Prestige, sets, titles store, milestones, uses of PP (14#18, 21, 29, 30)
T14B-07 Reputation and Notoriety, 14A Fresh Start −10 handoff (14#24-28)
T14B-08 Clubs, hosting, Chief of Staff, security wing, fly-in, experiences, philanthropy (14#31-37)
T14B-09 Houses and succession (14#44-49)
T14B-10 Legacy, plaques, Hall of Patrons, portraits (14#50, 57)
T14B-11 Status publications and Gilt List (14#19, 51-54)
T14B-12 Deletion and anonymization (14#55)
T14B-13 Views (§7 rest)
T14B-14 Assembly, NPC hooks, §8/§9 suites, net-mint harness (14#56)

## Internal DAG
01 → 02 → 03 → {04, 05} ; 03 → 06 → 07 → 08 ; 06, 07 → 09 → 10 → 11 → 12 ; 03-11 → 13 ; all → 14. External: 14A (all), T03-02/05/09/12/13, T20B-02; ports to 06, 07, 08, 09, 10, 12, 13, 15, 16, 21.

## 14A handoffs
- `life.reputation.event { kind: 'FRESH_START', delta: -10 }` from T14A-09 → T14B-07.
- `acct.title` table (T14A-01, Phoenix rows from T14A-09) extended and owned by T14B-06.
- Ports `inProbate`, `hasHouse` implemented by T14B-09, wired by T14B-14.
- Deletion (§3.1.7) and the age-refused guest purge → T14B-12.

## Invariants (20 §3.1, owner 14; added by ledger errata E-22)
INV-CHR-011 Legacy never decreases (T14B-10) · 012 Reputation in [0,100], every change evented (T14B-07) · 013 Notoriety in [0,100], never an outcome input (T14B-07) · 014 PP only from displayed items, one set per item (T14B-06) · 015 drop allocation caps (T14B-14) · 016 no estate or House moves to another account (T14B-09) · 017 Back Room never public (T14B-08) · 018 public payloads allowlisted and bucketed (T14B-11) · 019 philanthropy Rep chapter cap (T14B-07) · 020 every 14 money movement uses a §3.17 code or alias (T14B-14).

## Catalog (ledger-ref v5, errata E-22)
The 14 missing codes now have rows (owner 14; fee and tax amounts marked 'Quant sign-off'). Aliased: `LIFE_BOUTIQUE_PURCHASE`/`LIFE_ITEM_RECOGNIZE` → `LIFE_PURCHASE` with valueLeg; `LIFE_ITEM_MARK` → `LED_LIFESTYLE_DEPRECIATION`; `LIFE_NPC_BUYBACK` → `LIFE_RESALE_TO_NPC`; `LIFE_DONATION` → `LIFE_CHARITY`.

## Inert until 15
Linked checks in T14B-04, T14B-07 and T14B-08 (AC-*-INERT, fixture `linkPorts.ts`).
