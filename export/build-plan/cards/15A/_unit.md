# Unit 15A - Contract engine core: typed clauses, escrow via 03 holds, the anchor rule, filings core, linked-accounts predicate (stage S1)

Scope (19 §12.2 row 15.A; depends on 03, 14.A, 19.B). 15B owns boards, leagues, chapters, alliances, chat, the Wire, spectating, challenges and the anti-cheat policy: signal collection, value-flow graph, reviews, botting, enforcement and shadow pools. Files under `packages/engine/social`.

## Tasks (one PR each)
T15A-01 Schema, codes, ports (15#27)
T15A-02 Linked accounts core: `linkedAccounts`, `linkedCharactersOf`, households (15#42, 51)
T15A-03 Drafting, validation, counterparty card, signing (15#18)
T15A-04 Lifecycle, escrow via 03 holds, anchor rule, voiding (15#19)
T15A-05 Fees, P2P tax and caps; INV-SOC-003 (15#24, 25, 43)
T15A-06 Clause execution (15#20-23)
T15A-07 Mandates (15#26)
T15A-08 Filings core (15#32-34)
T15A-09 Assembly and port wiring

## DAG
01 → 02 → 03 → 04 → 05 → 06 ; 01, 05 → 07 ; 01 → 08 ; all → 09. External: T03-01/02/08/09/16/17/19, T14A-01/02/07/08/11, T13A-03/07, T02-09/11/12/14/15/21, T20A-01.

## Linked accounts
`linkedAccounts` / `linkedCharactersOf` are delivered here (T15A-02) because 15A contracts need them and 14A, 14B and 13B consume them. The signals that feed the score come from 15B and 21 through `ports.linkSignals` (default: none). Until 15B, only same-controller, beneficial-owner, household and admin-confirmed links fire.

## Open questions (conservative choice in force)
1. (Ruled, E-25: TRANSFER to the tax authority; three rows added; gaps empty.) Formerly: 15 §3.15 called `CTR_P2P_TAX` a SINK, but its alias `TAX_P2P_TRANSFER` is a TRANSFER owned by 03. `CTR_OPTION_SETTLE`, `CTR_COLLATERAL_SEIZE` and `FILING_REGISTRAR_FEE` have no rows. Choice: aliases as mapped, the gaps listed in `CATALOG_GAPS_15A`; needs errata E-25.
2. (Ruled, E-25: 03 holds behind a stable API.) 15 §3.6.4 says 07's escrow sub-ledger, while the 19 unit row says 03 holds. Choice: 03 holds with purpose ESCROW now; 07 can wrap the same API later.
3. `linkedCharactersOf` returns direct links only (not transitive). Clusters are 15B.
4. (Ruled, E-25) The P2P cap uses a rolling 17,280-tick window per payer: 24 hourly buckets with a running sum.
5. Notional for REVENUE_SHARE needs trailing profit; for new businesses it uses 0 (minimum fee $100).
