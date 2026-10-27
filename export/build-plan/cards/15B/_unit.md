# Unit 15B: boards, leagues, chapters, alliances, chat, Wire, anti-cheat (stage S7)

Depends on 15A, 14B, 16A, 19C (plus placeholders on 05/09A/10A/11/12/13B/21).

## Tasks
| Card | Title | Tests | Invariants |
|---|---|---|---|
| T15B-01 | Schema, ids, ports, clusters | — | — |
| T15B-02 | N_a, countries, activity states | 1–4, 44, 45 | — |
| T15B-03 | Chapters | 5, 6 | — |
| T15B-04 | Boards | 7–12 | INV-SOC-004 (20 §3.1.6, E-52) |
| T15B-05 | Leagues, Finals, HoF | 13–17 | — |
| T15B-06 | Alliances | 28–31 | — |
| T15B-07 | Chat, Wire, WYWA, push | 35–41 | — |
| T15B-08 | Anti-cheat (signals → 15A score) | 50, 52 | — |
| T15B-09 | Challenges / AI tournament | 46–49 | INV-SOC-001, 002 |
| T15B-10 | Assembly and exploit sweep | — | — |

15A keeps: contracts/filings/mandates/P2P (18–27, 32–34, 42–43, 51) and INV-SOC-003.

## DAG
01 → 02 → 03 → 04 → 05; 01 → 06; 01, 04 → 07; 01 → 08; 05 → 09; all → 10.

## Proposed id prefixes
chn_ chat channel, wir_ Wire item, brd_ board snapshot, lgr_ league group, chp_ chapter (if needed), chl_ challenge, riv_ rivalry, itp_ intel post, ics_ integrity case. `ali_` already approved as a 03 entity kind.

## Open questions
1. Approve the proposed prefixes on the E-26 allow-list.
2. Several `ALI_*` / `WIRE_POST_FEE` / `INTEGRITY_CLAWBACK` codes are named in 15 §3.15; resolved in E-52 (aliases/new rows, existing classes only; `INTEGRITY_CLAWBACK` inherits the original class, E-52 2a).
3. Official API age/licence gate numbers [Quant] — kept as written in 15#50.
4. Fresh Start remains entirely in 14 (not re-implemented here).
5. INV-SOC-004 is named in 20 §3.15 but missing from the 20 §3.1 table; card owns the behaviour as an AC until Quant/Producer adds the row.
