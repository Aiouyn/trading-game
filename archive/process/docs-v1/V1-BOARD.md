# Avalon Builder — V1 Board (approved)

**Status:** APPROVED by owner 2026-11-06 02:52 Europe/Paris (UTC+1) — “I agree” to proposed v1 plan; authorizes building; does **not** approve merges / deployment / spending.  
**Repo:** https://github.com/Aiouyn/trading-game  
**Cards:** 34  
**Gatekeeper:** Avalon Gatekeeper playtest + GO before owner merges a finished PR.  
**Merge authority:** none from this board.

## Process gates

1. Finished PRs → Avalon Gatekeeper fresh-player playtest → **GO** before owner milestone merge.  
2. **M1** local core + authoritative save/ticks.  
3. **M2** onboarding / leaderboard / mobile / owner playtest.  
4. **M3** private alpha URL — rate limits + backup/recovery before real private players.  
5. **M4** public — **separate owner yes** only.  
6. Out-of-scope systems: hide behind flags; do not delete.  
7. No merge / deploy / spend authorization from board sign-off alone.

## Cards (34)

### M0 — Board sign-off (6)

| ID | Card | Acceptance |
|---|---|---|
| **M0-01** | Board sign-off | Owner accepts In/Out, milestone ladder, and 34 cards. |
| **M0-02** | M4 separate yes | Public release needs a later separate owner yes. |
| **M0-03** | Gatekeeper on finished PRs | Gatekeeper GO before owner merges a finished PR. |
| **M0-04** | PR park / GO path | Park #95/#96; #98 only after Gatekeeper GO + explicit owner merge yes. |
| **M0-05** | Flag shroud | Out-of-scope systems stay in tree, default off via flags. |
| **M0-06** | Hosting / monetization stance | $45/mo Vercel Pro + Supabase Pro web+DB base sketch; monetization out; tick-host cost TBD. |

### M1 — Local core + authoritative save/ticks (12)

| ID | Card | Acceptance |
|---|---|---|
| **M1-01** | Simple auth (real sessions) | Real session auth; identity persists across refresh; player isolation (no cross-player cash/positions/orders). |
| **M1-02** | One authoritative world | All players attach to the same server-owned world id. |
| **M1-03** | Server persistence | Cash, positions, open orders survive process restart; isolation after restart. |
| **M1-04** | Seeded catalog 10–20 | Fictional assets ∈ [10,20]; fixed seed → deterministic marks. |
| **M1-05** | Authoritative live ticks | Server quotes on fixed cadence; shared quotes; golden/property. |
| **M1-06** | Broker market+limit + safety | Atomic cash/holding checks; idempotent submit/reconnect. |
| **M1-07** | Broker chart | History + live from server quotes within budget. |
| **M1-08** | Portfolio P/L | Matches server fills. |
| **M1-09** | Wire + crises → prices | News moves prices; deterministic replay. |
| **M1-10** | District backdrop | Read-only district or static within perf budget. |
| **M1-11** | Flag shroud verification | Flags off → out-of-scope UI unreachable. |
| **M1-12** | #98 conditional | About/News only after Gatekeeper GO + owner merge yes. |

### M2 — Onboarding, leaderboard, mobile, playtest (7)

| ID | Card | Acceptance |
|---|---|---|
| **M2-01** | 30s clarity + 2-min first trade | Timed playtest. |
| **M2-02** | Goal: grow $10k | Start cash $10k + visible NW target. |
| **M2-03** | Leaderboard NW | Server-ranked NW for shared world. |
| **M2-04** | Mobile shell | Broker + Portfolio + Wire ~390px. |
| **M2-05** | PWA | Manifest + installable offline shell. |
| **M2-06** | Owner + Gatekeeper playtest | GO/NO-GO recorded. |
| **M2-07** | Engine PR parks | #95/#96 stay parked unless explicit unpark. |

### M3 — Private alpha (6)

| ID | Card | Acceptance |
|---|---|---|
| **M3-01** | Private hosted URL | HTTPS for invited testers only. |
| **M3-02** | Error logs | Visible in host logging. |
| **M3-03** | Analytics baseline | Page/session analytics. |
| **M3-04** | Feedback channel | In-app or linked. |
| **M3-05** | Rate limits + backup before players | Verified before real private players. |
| **M3-06** | Spend guard | Host spend alerts; no monetization. |

### M4 — Public (3) — separate owner yes

| ID | Card | Acceptance |
|---|---|---|
| **M4-01** | Owner public-go | Explicit written yes before public deploy. |
| **M4-02** | Public hardening checklist | Signed for public candidate. |
| **M4-03** | Gatekeeper public playtest | Fresh-player GO on public candidate. |

## In / Out

**In:** real sessions + player isolation; persistent server save; one authoritative world; seeded 10–20 assets + live shared ticks; Broker market/limit/chart with atomic/idempotent safety; Portfolio P/L; leaderboard NW; Wire + crises→prices (replay); district backdrop; 30s/2min path; grow $10k; mobile PWA; private URL with logs/analytics/feedback; rate limits + backup before private players.

**Out:** banks/credit beyond flagged-off merged systems; businesses; AI Lab; 16A/16B; pro terminal; Whale Watch; multiplayer economics beyond shared market + leaderboard; monetization; public deploy without separate owner yes.
