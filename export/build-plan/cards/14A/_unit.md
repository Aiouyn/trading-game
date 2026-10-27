# Unit 14A - Character, account link, ranks, license state, protection, restricted cash (stage S1)

Purpose: the gameplay identity every later module gates on (19 §12.2 row 14.A, depends on 03). One account, one profile and one `chr` ledger entity per player; guest and registration with the 16+ gate; handles and home city; ranks on rank-basis NW in real dollars with no demotion; the license ladder, renewal, lapse and 13 sanctions; charter applications (fund and exchange member at R3, bank, insurer and custodian at R4); new-player protection and the rookie zone; restricted cash buckets read from 03's lots; the Fresh Start owned by 14 (top-up to $5,000 real, once per 56 real days, cooldown shared by linked accounts). All files under `packages/engine/character`. Lifestyle, Prestige, Reputation, Notoriety, clubs, hosting, Houses, Legacy, deletion and status publications are 14B.

## Tasks (build order, one PR each)
T14A-01 Schema, ids (entity regex, ≤ 64 chars), constants, reject codes, event schemas
T14A-02 Real-dollar bigint helpers, 14A reason-code bindings, ports for later units
T14A-03 Guest creation and start state, registration and age gate, guest gate, protection window (14#1-3; INV-CHR-001, 002, 008)
T14A-04 Handles, profile, publication consent, home city, 2FA flag, common acct validation (14#4-5; INV-CHR-007)
T14A-05 Ranks: thresholds, day-close evaluation, no demotion, R6 gate, shells, ceremony (14#6-9; INV-PRG-001, INV-CHR-009)
T14A-06 License ladder, exams, purchase, LIC1 onboarding grant (14#10, 12; INV-CHR-003, 004)
T14A-07 Renewal, grace, LAPSED close-only gating, sanctions, charters (14#11; INV-CHR-010)
T14A-08 Read API for other modules, restricted cash buckets and purpose check (14#40; INV-CHR-006)
T14A-09 Fresh Start: triggers, top-up, shared cooldown, perk, blocks, clawback request, Phoenix (14#38, 39, 41-43; INV-CHR-005)
T14A-10 Views for the 14A screens (§7 part)
T14A-11 ModuleDef assembly, params, ports wiring, test helpers, integration suite (14#58; INV-PRG-002)

## Internal DAG
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11. Also 03, 05 → 08; 05, 08 → 09; 01-09 → 10; all → 11.
External: T02-04, T02-11, T02-21; T03-01, 02, 05, 08, 09, 12, 16, 17, 24, 26, 28.

## Exports to downstream units
`@tycoon/engine/character`: `CHARACTER_MODULE`, `createCharacterModule(ports)`; reads `rankOf`, `licenseOf`, `licenseLevel`, `hasActiveLicense`, `hasCharter`, `licenseAllows`, `isNewPlayerProtected`, `inRookieProtection`, `accountAgeTicks`, `accountAgeRealDays`/`accountAgeDays`, `principalChrOf`, `lastActiveTick`, `isGuest`, `guestGate`, `twoFactorGate`, `restrictedCashOf`, `restrictedBuckets`, `checkRestrictedPurpose`, `leverageCapOf`, `creditBlocked`, `activeFreshStartPerk`; `T_CHARACTER`, `isCharacter`, `HANDLE_RE`; test helpers `spawnCharacterImpl`, `createHarnessAccount`.
Intents `acct.character_create`, `acct.register`, `acct.profile.update`, `acct.handle.change`, `acct.homeCity.change`, `acct.publication.set`, `acct.license.buy`, `acct.license.renew`, `acct.exam.submit`, `acct.charter.apply`, `acct.ceremony.ack`, `acct.freshStart.declare`, `acct.freshStart.choosePerk`.
Events `acct.registered`, `acct.rank.up`, `acct.license.granted/.lapsed/.suspended/.revoked`, `acct.freshStart`, `acct.title.awarded` (T_PHOENIX only), plus new `acct.character.created`, `acct.protection.ended`, `acct.homeCity.changed`.
Views `acct.view.me`, `acct.view.rank.thresholds`, `acct.view.licenses`, `acct.view.freshStart`, `acct.view.settings`, `acct.view.public`.

## Acceptance tests by task
T14A-03: 1, 2, 3 · T14A-04: 4, 5 · T14A-05: 6-9 · T14A-06: 10, 12 · T14A-07: 11 · T14A-08: 40 · T14A-09: 38, 39, 41, 42, 43 · T14A-11: 58. All other 14 tests (13-37, 44-57) belong to 14B.

Invariants: INV-PRG-001 (T14A-05), INV-PRG-002 (T14A-11) from 20 §3.1, and unit-local INV-CHR-001..010 (proposed for 20 §3.1, owner 14).

## Registry gaps (23), resolved by Producer (ledger errata E-21)
- Catalog: `ACCT_HANDLE_FEE`, `ACCT_HOME_CITY_FEE` added (SINK/BURN 5250, owner 14, restrictedOk N); `ACCT_LICENSE_FEE` restrictedOk N and owner 14; `ACCT_ONBOARD_GRANT` owner 14. INV-CHR-006 kept.
- `comeback_garnish_rate` default 0.30 in 23, 03 §3.14.5, 03 AT 31 and 24 D048.
- PARAM values supplied by Quant (E-21 addendum (b); spec numbers confirmed, rank thresholds accepted by Avalon Systems, R6 $20B): `rank_r1..r5_threshold_real`, `license_fee_lic2..4_real`, `license_fee_lic1_real`, `license_renewal_share`, `protection_real_hours`, `rookie_zone_real_days`, `rookie_zone_nw_real`.
- Resolved (E-21 addendum (a)): start cash and Fresh Start are MSI-scaled; Fresh Start = max(0, $5k × MSI − liquid).
- Linked cooldown inert until 15 provides `linkedCharactersOf` (AC-14A-09-INERT).
- INV-CHR-001..010 added to 20 §3.1.
