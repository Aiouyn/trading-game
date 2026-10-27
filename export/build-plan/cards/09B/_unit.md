# Unit 09B: company building, corporate finance, IPOs, M&A (stage S3)

Depends on 09A, 06A, 07A, 15A (plus placeholder deps on 05, 06A, 08, 11, 13A, 14A, 16A, marked -??).

## Tasks
| Card | Title | Tests | est_loc |
|---|---|---|---|
| T09B-01 | Schema, codes, ports, CompanyHook09 shell | — | |
| T09B-02 | Product lines and R&D | 24, 25 | |
| T09B-03 | Internal allocation and synergies | 18, 19 | 600 |
| T09B-04 | Valuation, V, listing sector (09 §3.1.4), selling | 15, 16, 17, 32 | 1000 |
| T09B-05 | Cap tables, debt, covenants, payouts, related party; INV-BS-005 | 33, 34 | 1300 |
| T09B-06 | IPOs | 26, 27 | 1000 |
| T09B-07 | Post-listing, earnings, governance, spin-offs | 28–31 | 1100 |
| T09B-08 | Startups and venture | 43 | 1000 |
| T09B-09 | Thresholds, tenders, mergers, antitrust, NPC absorption | 35, 36 | 1400 |
| T09B-10 | Defences and proxy | 37, 38 | 900 |
| T09B-11 | LBOs | 39 | 700 |
| T09B-12 | Distress and restructuring | 40–42 | 1400 |
| T09B-13 | Assembly; ACs for 47–49 parts | — | 700 |

## DAG
01 → 02, 04, 05; 04 → 05 → 03; 04, 05 → 06 → 07 → 09 → 10; 04, 05, 06 → 08; 09 → 11; 04, 05 → 12; all → 13.
(03 depends on 05 for `hasMinorityHolders`; 05 depends on 04 for price checks.)

## Id prefixes (approved E-44; on the E-26 table and lint allow-list)
pln_ product line, rdp_ R&D project, tof_ tender offer, mrg_ merger, vrd_ venture round, rst_ restructuring case, mot_ motion, lbo_ LBO deal, ipo_ IPO.

## Registry gaps (spec §3.17 code with no catalog row)
RESOLVED (E-44): all six bound as TRANSFER rows (see T09B-01); underwriting fee is TRANSFER to the NPC underwriter.

## Open questions
1. RESOLVED (E-44): largest EV share, ties to the lower sector number (AC-09B-04-SECTOR-TIE).
2. RESOLVED (E-44): TRANSFER.
3. RESOLVED (E-45): the retired `biz_ltv_cap` mention removed from 09 §3.12.2 (E-44 had wrongly reported it absent).
4. RESOLVED (E-44): 09B keeps its partial ACs for 09#47–49 in T09B-13; 09A cites the rest of 09#47–49.
