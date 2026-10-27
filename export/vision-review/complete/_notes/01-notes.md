# 01-notes: Evaluation of Vision v3

## 1. Parameters
01 is an evaluation document (not a module) and introduces no PARAM keys. Every number it cites is owned and parameterised in the module that owns it (02, 03, 09, 15, 21, ...).

## 2. Decisions (each is DEFAULT, Mathis may override, unless locked in 00)
- §4.1 V3 Part 13 Q1–Q5: decided in the §4.1 table. Institutional layer stays in full (all charters). Expert platform API is gated (LIC2 + 2FA + 7 days of account age) and shares the 20 intents/tick limit. Truth Machine is a server-side harness that is part of CI (20).
- §4.2 Roadmap Q1 build order: superseded by the module dependency graph (19 §12). Foundations (02, 03, 20 invariants) come first.
- §4.2 Roadmap Q2 T1 business pace: Option C, payback about 20 game days.
- §4.2 Roadmap Q3 ad eligibility: Option B, NW < $1,000 checked at the player's local day start; up to 10 ads at $2,500.
- §4.2 Roadmap Q4 solo carry-over: Option A, titles and cosmetics only.
- §4.2 Roadmap Q5 weekly seed challenge: ranked only on the server with commit-reveal; solo stays unranked.
- §4.2 Roadmap Q6 fund-manager betrayal: Option A, custody makes theft impossible; abuse is prosecuted as S5 and the first-loss stake pays first.
- §4.2 Roadmap Q7 hosting: one region at alpha; the partitioned design is the same from day one.
- §4.2 Roadmap Q8 Held in solo: Option B, off in solo.
- §4.3 01-markets Q1/Q3–Q7 and 02-multiplayer Q2–Q8: decided as in the §4.3 table (country change once per 180 days; chat open at launch with moderation; guest play limited to the first session).
- §5.1 Time model: 00 wins. 720 ticks per game day, 2 game minutes per tick, 5 real seconds per tick. The old 5-minute tick and the 288-tick day are retired.
- §5.2 City count: 15 cities (3 per bloc; the five 06-cities designs become the first city of each bloc) plus Isla Serena (00 §5.7; ruling in 24).
- §5.3 X1–X23 (each decided in the table): 400 instruments / 240 listed NPC companies at launch; 20 intents/tick; the relative DU formula; micro-units for every currency; elastic-sector faucets; stabilizer levers limited to faucets and sinks; stabilizer tracks the designed wealth curve; MSI/NWI defined; no identity-revealing whale auto-news; fresh start once per chapter; restricted cash 72 real hours; event rates; T1 payback; one world; per-stream RNG; commit before intake; 2,500 ms budget; new step contract; Stabilizer Board separate from the 5 central banks; look-through consolidation; Serena both fixed islands and free zone; homes at appraisal; engine layout in 19.

## 3. Interfaces assumed
- 19 §12: a module dependency graph and build order exists.
- 15: country ladder with a country-change rule; ranked challenge instances.
- 21: compensation, ad and moderation policies.
- 13: Held state and S1–S5 offence tiers; solo-mode switch.
- 08: fund custody and a first-loss stake account (`FND_FIRST_LOSS`).

## 4. Content needed (22)
- None beyond what 02 and 03 request.
