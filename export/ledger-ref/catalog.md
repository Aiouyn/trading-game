# V3 reason-code catalog (reference, non-normative)

Full data: `catalog.csv` (393 rows: 384 from 03 §3.4, 6 registered by 24 §8, 2 PD-12 canonical CONFLICT_* codes from 12). Columns: code, class, owner, cf, allowedTemplates, templates_source (card file:line), v3_source (03 file:line and section), note, description.

- **Classes** come from the 03 §3.4.x section each row sits in.
- **allowedTemplates** come from the card rows (`Tpl` column) of T03-02 (FAUCET, SINK), T03-03 and T03-04 (TRANSFER A/B) and T03-05 (CREDIT_*, REVALUE).
- Every one of the 384 codes was found in exactly one card row. No card row is missing from 03, and none is absent from it.
- Every card template is inside the class's `CLASS_TEMPLATES` set (T03-02 `:47-48`); I checked by script and found 0 violations.

## Counts per class (03 §3.4)

| Class | 03 section (start line) | Count | Card |
|---|---|---|---|
| FAUCET | §3.4.1 (`03:511`) | **37** | T03-02 |
| SINK | §3.4.2 (`03:553`) | **86** | T03-02 |
| TRANSFER | §3.4.3 (`03:644`) | **209** | T03-03 (83) + T03-04 (126) |
| CREDIT_CREATE | §3.4.4 (`03:858`) | **12** | T03-05 |
| CREDIT_DESTROY | §3.4.5 (`03:875`) | **13** | T03-05 |
| REVALUE | §3.4.6 (`03:897`) | **27** | T03-05 |
| **Total in 03** | | **384** | |
| Registered by 24 §8 (via T03-05 `:29`) | | 6 (3 FAUCET: `ACCT_BACKGROUND_DISCOUNT`, `CBK_IOR_P`, `CBK_DEPOSIT_INTEREST_P`; 3 TRANSFER: `BIZ_MARKETING_B2B`, `CBK_IOR_W`, `CBK_DEPOSIT_INTEREST_W`) | T03-05 |
| **Catalog total after T03-05** | | **390** | |

**37 FAUCET / 86 SINK: confirmed** for 03 §3.4.1/§3.4.2 (and T03-02 `:25`). The other card figures are also confirmed: TRANSFER 83 + 126 = 209 (T03-03/04), CREDIT_CREATE 12, CREDIT_DESTROY 13, REVALUE 27 (T03-05 `:29`).
After 24 §8 registration, the FAUCET count used at runtime is **40** (37 + 3) and TRANSFER is **212**. Anyone counting the live catalog should expect those numbers, not 37 and 209.

**Card defect.** The `REGISTERED_BY_24_8` rows in T03-05 are an unrendered placeholder `@@REG248@@` (`cards/03/T03-05.md:120`). The six codes and their classes come from 24 §8 (`24-DECISIONS-REGISTER.md:780,788,796`) and T03-05 `:121` (the `_P` codes are FAUCET via MINT, the `_W` codes are TRANSFER). In the CSV their templates are marked *derived*. Owner, sectors, legs and family must be filled before T03-05 can be implemented.

## PD-12 aliases (Producer decision, owner sign-off pending; ledger-core §11)

| Deprecated alias (03 row) | Canonical | Canonical source | Class |
|---|---|---|---|
| `OPS_RANSOM` (`03:816`, TRANSFER, owner 12) | `CONFLICT_RANSOM` | 12 `:441` | TRANSFER |
| `OPS_LOOT_CASH` (`03:815`, TRANSFER, owner 12) | `CONFLICT_CASH_LOOT` | 12 `:442` | TRANSFER |

Implementation notes:
- PD-12 inverts the usual 24 §8 direction. Elsewhere the module name is the alias and the 03 code is canonical (24 §8 `:773`: "A builder posts only the 03 code"). Here the 12 name becomes canonical.
- In the T03-05 `ALIASES` data, add `{ name: 'OPS_RANSOM', module: [12], targets: ['CONFLICT_RANSOM'] }` (and the same for loot). Replace the 03 rows' code with the CONFLICT_* name, keeping class TRANSFER, owner 12, cf OP and template PAY.
- Otherwise `buildCatalog` reports `ALIAS_SHADOWS_CODE` (T03-05 `:76`).
- The CSV keeps the OPS_* rows, flagged DEPRECATED, and adds the CONFLICT_* rows as CANONICAL.

## Other aliases
The full 24 §8 alias table (26 rows) is quoted in T03-05 `:90-118` and `24-DECISIONS-REGISTER.md:771-800`. `CBK_INTEREST_ON_RESERVES` (`03:850`) is superseded for those flows by `CBK_IOR_P/_W` and `CBK_DEPOSIT_INTEREST_P/_W` (24 §8).

## catalog.csv v2 (2026-10-20 23:55 CEST)

v2 adds the columns `legA, legB, sector, taxTag, family, restrictedOk, requestableBy, illicit, cols_source, derived` (v1 kept as `catalog.v1.csv`). Source: the per-class card tables T03-02..05 (legend at `cards/03/T03-02.md:80-91`, which transcribes 03 §3.4 + §3.3.3 value legs + §3.5.6 + §3.6). Each row's `cols_source` gives the card file:line.

| column | from card row | derived (flagged in `derived`) | coverage |
|---|---|---|---|
| legA / legB | 384 | 8 | 392/392 |
| sector | 384 (103 rows non-empty: ELASTIC_IN/OUT) | 8 | 392/392 |
| restrictedOk | 384 (35 = Y) | 8 (all N, except inherited) | 392/392 |
| requestableBy | 384 (16 non-owner) | 8 | 392/392 |
| taxTag / family | 384 | 8 | 392/392 |
| illicit | 03 §3.12.14 list (T03-02 legend) | CONFLICT_* inherit Y | 392/392 |

Derived rows (8): the six 24 §8 registrations (`ACCT_BACKGROUND_DISCOUNT`, `BIZ_MARKETING_B2B`, `CBK_IOR_P/_W`, `CBK_DEPOSIT_INTEREST_P/_W`; their card block is the unrendered `@@REG248@@` placeholder at T03-05:118), which get class defaults (FAUCET legA 4110, else `-`; restrictedOk N; owner-only), and `CONFLICT_RANSOM/CONFLICT_CASH_LOOT`, which inherit every v2 column from the OPS_* row they replace (PD-12).

`restrictedOk = Y` (41 codes; ACCT_LICENSE_FEE moved to N by E-21; E-22 adds LIFE_STORAGE, LIFE_RESTORATION, LIFE_SECURITY, LIFE_RENT, LIFE_EXPERIENCE, LIFE_BERTH_RENT, LIFE_HANGAR_RENT): ACCT_CHARTER_FEE, BIZ_PURCHASE_NEW, BIZ_UPKEEP, BIZ_UPGRADE_CAPEX, BIZ_PERMIT_FEE, CMP_INCORPORATION_FEE, PROP_PURCHASE_FROM_ELASTIC, PROP_UPKEEP, PROP_DEVELOPMENT_CAPEX, PROP_PERMIT_FEE, COLL_BUY_FROM_NPC, MKT_TRANSACTION_LEVY, LIFE_PURCHASE, LIFE_UPKEEP, TAX_* (12), MKT_TRADE, MKT_EXCHANGE_FEE, MKT_BLOCK_TRADE, BIZ_UPGRADE_CAPEX_B2B, BIZ_SALE_P2P, PROP_SALE_P2P, PROP_DEVELOPMENT_CAPEX_B2B, PROP_LAND_AUCTION.

`aliases.csv`: all 26 24 §8 alias rows (T03-05:92-117) plus the 2 PD-12 aliases = 28.

## legpolicy.csv (E-11, 2026-10-21 00:30 CEST)
Generated by `gen_legpolicy.py` (run: `python3 gen_legpolicy.py > gen_legpolicy.out`). 392 rows, one per code: legA and legB each with default, policy, allowed set and source, plus `negative_swap` and `ambiguous` columns.
