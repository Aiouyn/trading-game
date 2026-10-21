# Unit 03 - Ledger and accounting (stage S0; T03-29 in S10)

Purpose: the single source of truth for money and quantities: chart of accounts, entities, the complete reason-code catalog (FAUCET/SINK/TRANSFER/CREDIT/REVALUE + 24 §8), payment rail, templates, holds, GLOBAL-CONTEXT G7 behind 02's `LedgerProvider` port, tick commit with cross-partition legs, money aggregates and flows, restricted cash, marks and valuation, accruals and period close, ownership and look-through NAV, NW/NWrank, consolidation, statements, all taxes, the Stabilizer (R04) with MSI/NWI, insolvency incl. personal insolvency and fresh start, views, assembly and whole-game ledger runs.

## Tasks (build order)
T03-01 Schema, chart, keys, ids, events · T03-02 Catalog framework, FAUCET and SINK codes · T03-03 TRANSFER codes A · T03-04 TRANSFER codes B · T03-05 CREDIT, REVALUE, 24 §8 aliases, catalog checks (INV-LED-002)
T03-06 Posting rules and payment rail · T03-07 Entry templates · T03-08 Runtime state: entities, accounts, holds, facts (INV-BS-011) · T03-09 LedgerApi, LedgerProvider/LedgerPartition, commit (INV-LED-009, 013, INV-BS-012) · T03-10 Core ledger invariants (INV-LED-001, 005-008, 010, 012)
T03-11 Perimeters, money aggregates, flows, families and ρ (INV-LED-003, 004, 011) · T03-12 Restricted cash (INV-LED-014) · T03-13 Marks, thin-print guard, valueAccount · T03-14 Day-close valuation postings · T03-15 Accruals, period-close steps, standing-facility conversion
T03-16 Ownership, control, look-through (INV-BS-004) · T03-17 NW, NWrank, FX (INV-BS-001) · T03-18 Period totals, consolidation, related parties (INV-BS-008) · T03-19 Statements, publication, export · T03-20 Tax foundations, lots, gains, wash sale
T03-21 Domestic taxes · T03-22 Cross-border tax, exit tax · T03-23 Assessment, installments, audits, I22 · T03-24 Stabilizer, MSI/NWI · T03-25 Insolvency (INV-BS-002)
T03-26 Personal insolvency and fresh start · T03-27 Views (every §7 screen) · T03-28 ModuleDef assembly, NPC rules, §9 exploit suite · T03-29 Whole-game runs (S10, TYCOON_LONG)

## Internal DAG
Catalog: 01 → 02 → 03, 04 → 05. Rail, templates, runtime: 01, 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12. Valuation and close: 08 → 13 → 14 → 15 (also needs 07, 09). Ownership and statements: 13, 14 → 16 → 17 → 18 → 19. Tax: 18 → 20 → 21 → 22 → 23. Stabilizer: 11, 17 → 24. Insolvency: 13–18 → 25 → 26 (26 also needs 12, 20, 24). Assembly: 16–26 → 27; 01–27 → 28 → 29. External: T02-04, 09, 11, 21 (02 port and TestWorld) and T20A-01. T03-29 also needs T20B-02, 06–09 and 11.

## Exports to downstream units
`@tycoon/engine/ledger`: `LEDGER_MODULE` (`services.ledger = ledgerProvider`); G7 `LedgerApi`/`HoldApi` (plus `LedgerApiExt.availableFor`, `HoldApiExt.placeCashFor`) and `registerEntity`; `putFact` (the fact kinds of T03-01); `registerAccrual`, `registerObligation`, `registerCloseStep`; the catalog (`getCatalog`) and reason-code extension registration; `valueAccount`, `nwSolo`, `computeNwRank`, `nwi`, `msiValue`, `leverValue`, `LEVER_READERS`; tax helpers (`withholdingFor`, `vatOnSale`, `stampDuty`, `p2pTax`); insolvency hooks (`proposePlan`, `bankResolutionHooks`, `admitContingent`).
- Views `acct.view.*`, `acct.statement`, `acct.ledger.export`. Intents `acct.*` (03 §4). Events `ledger.*` (03 §5).

## Acceptance tests by task
T03-05: 1 · T03-06: 9 · T03-07: 3, 8, 11 · T03-10: 38 · T03-11: 2, 4-7, 39 · T03-12: 32 · T03-13: 13 · T03-14: 12 · T03-15: 10 · T03-16: 17, 18 · T03-17: 14, 15 · T03-18: 16, 19 · T03-19: 40, 41 · T03-20: 21, 22 · T03-21: 20 · T03-22: 23-26 · T03-23: 27, 28 · T03-24: 33-35 · T03-25: 29, 30 · T03-26: 31 · T03-29: 36, 37, 42 (they need the whole game and the 20B swarm, so S10)

Invariants owned: INV-LED-001…014 and INV-BS-001, 002, 004, 008, 011, 012. All are registered by T03-28. I22 is a sub-check of INV-LED-010.

## Registry gaps (23)
`led_code_alarm_mult`, `led_code_alarm_floor` (T03-11 code alarms); the restricted window, 72 h = 51,840 ticks (D036; constant `RESTRICTED_WINDOW_TICKS`); `stab_lever_ranges` (T03-24); 04's tax-rate ranges for `setRegimeRate`; the protected floor of $5,000 for crime and court debts (T03-26 `PROTECTED_FLOOR_REAL`).
