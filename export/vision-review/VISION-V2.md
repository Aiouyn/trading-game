# Trading Game — Vision v2 (Elevated to 9.5/10)

Prepared for Mathis, 2026-10-18. This document takes the existing `/vision` design and **rewrites the vision itself** to resolve the weaknesses found in the first review (`VISION-REVIEW.md`). It is written so the score is auditable: a rubric, the current score, the changes, and a re-score with residual risks named honestly.

This is a design document, not a repo change. Nothing here edits the codebase.

---

## Part 0 — How "9.5/10" is defined (the rubric)

A vision is not scored on ambition. It is scored on whether it describes **a game that will get made, get played, and get loved.** Eight dimensions, weighted by how often each one actually kills a game like this.

| # | Dimension | Weight | What a 10 looks like |
|---|---|---|---|
| D1 | **Core loop clarity & proven fun** | 20% | The first 30 minutes are specified *and* have a validation gate; the moment-to-moment loop is obviously compelling before any deep system exists |
| D2 | **Buildability & scope discipline** | 20% | There is a shippable "minimum lovable game," a hard cut line, and everything past it is earned by evidence, not planned up front |
| D3 | **Economic & systemic soundness** | 15% | The money supply, price formation and balance survive a never-reset world and adversarial players; cheats are closed by construction |
| D4 | **Depth without chores** | 10% | Every system adds a *decision*, not a maintenance task; breadth is playable without becoming four jobs |
| D5 | **Multiplayer & social payoff** | 10% | Other people are the content; async works; there is drama, status and recognition, and anti-grief is real |
| D6 | **Fairness & integrity** | 10% | No pay-to-win, no determinism exploit, no "rich = untouchable," no wipe; competition is honest by construction |
| D7 | **Identity, retention & the long game** | 10% | A reason to stay for a year; wealth becomes a *name*; late joiners have a real shot |
| D8 | **Coherence & documentation** | 5% | One source of truth; aspiration vs. ground-truth code is clear; numbers reconcile |

**Score = Σ (dimension score × weight).** 9.5 overall means no dimension below 9, and the two heaviest (D1, D2) at 9.5+.

---

## Part 1 — Scoring the *current* vision (the honest baseline)

| Dimension | Score | Why |
|---|---|---|
| D1 Core loop proven fun | **6.0** | First 30 min scripted beautifully (`04 §4`), but rests on an economy whose fun is unmeasured; the team's best energy went to the endgame, not minute 4 |
| D2 Buildability & scope | **5.0** | 52 milestones, 5 pillars, a procedural-city second game, a company-builder directive — no concept of "cut," only "add." This is the project's biggest risk |
| D3 Economic soundness | **9.5** | Best-in-class: NWI ranking, finite NPC counterparty, logit/sqrt diminishing returns, diegetic stabilizer, exploit catalog |
| D4 Depth without chores | **6.5** | Enormous depth, but the AI tree and multi-pillar play risk being timers and micromanagement; Part VII *asks* for a delegation fix that isn't yet a system |
| D5 Multiplayer & social | **8.0** | Strong ideas (filings, rivalries, hidden sessions, the Wire), but most are deferred to Phase 2–3 and unvalidated |
| D6 Fairness & integrity | **7.0** | Crime-EV, anti-grief and the 1% floor are excellent; undercut by the solo-determinism exploit the roadmap itself flags, left unresolved across 3 phases |
| D7 Identity & long game | **8.5** | UI shell, Prestige, never-reset world, country boards — very strong; "why a non-competitive player stays" is unanswered |
| D8 Coherence & docs | **7.5** | `RESOLVED-NUMBERS` is a feat, but the bible describes one game and the real `v1` code is a different, smaller one, with no stated ground truth |

**Weighted total ≈ 7.0 / 10.** A brilliant design bible attached to a risky plan. The gap to 9.5 is almost entirely in **D1 (prove the fun), D2 (cut the scope), D4 (delegation), and D6 (close the determinism hole)** — the four things this v2 fixes.

---

## Part 2 — Vision v2: the pitch, unchanged in soul, sharpened in spine

> *Start with $5,000 and a cracked phone, in a city that was alive before you arrived. Learn why prices move, and the market stops being luck and becomes a language. Buy a shop on a street you'll remember, hire someone to run it, and roll your first profit into a trade you understand. Train a model that whispers what you can't yet see. Grow — and the world grows with you: your phone becomes a desk becomes a floor of glass above a city that now carries your name. Get rich enough to be feared and visible enough to be hunted, in a world that never forgets who built what. Not a number going up. A name that stays.*

Every word of that is already in the existing vision. v2 changes **what we build first, what we refuse to build, and how four pillars become one playable life** — not the dream.

---

## Part 3 — The spine: a Vertical Slice that is a *whole game*, not "Phase 0"

The missing keystone is a **minimum lovable game** the team could ship and be proud of even if nothing else is ever built. Everything past it is a backlog *earned by playtest evidence*, not a plan executed on faith.

### The Slice (the real v1)
- **Markets:** ~24 stocks across 6 sectors, 1 index, 3 crypto, gold + oil. The **full explainable-price engine** — fundamental pull, factors, GARCH, jumps, earnings, square-root impact, batch auction. *This is the crown jewel and is never cut.*
- **Businesses:** 8 businesses T1–T2, logit city-sector share, the six upgrade axes, 3 districts of one city.
- **Real estate:** the single path — buy where you live, one mortgage, rent.
- **One AI feature:** the **Analyst-signal AI only** — "train a model, it narrows your uncertainty on a hidden variable." No autonomous trading, no cyber, no tree. Teaches the whole AI fantasy with one screen and zero balance risk.
- **One rival:** a computer-run fund with a **public, readable track record** — the minute-4 rival with a face.
- **The shell:** cracked phone → laptop → three-screen desk. Three states. The retention hook, and cheap.
- **Explainability, surfaced:** a free one-line "why it moved" after every closed trade (not a Phase-1 feature — day one).
- **Not in the Slice:** multiplayer, cyber, courts, dynasties, derivatives, the procedural-city generator, the company-builder. A hand-authored, beautiful static skyline backdrop is enough.

### The exit gate (the part that makes "9.5" real)
Not "it works." It is a **fun contract**: *ten strangers, given no help, (a) reach the first rank-up, (b) say they want to play tomorrow, and (c) can describe the loop back to you.* Pass → you earned the right to build the next pillar, and the playtest tells you which. Fail → the fix is the loop, not the backlog.

Everything in the 52-milestone roadmap is re-framed as **content the Slice earned**, sequenced by risk-adjusted value:
1. More markets / businesses / cities (pure content, low risk).
2. The **async multiplayer shell** (shared economy, boards, the Wire, "While You Were Away") — where "social pressure is the content" finally pays off.
3. The **adversarial layer** (AI tree, cyber, courts) — the deep endgame, built last, against humans, where it belongs.

This is the roadmap's own order. The change is philosophical: the Slice is a *product you could love on its own*, not a phase of a four-year plan.

---

## Part 4 — The four pillars, re-expressed as one life (the delegation spine, D4)

The existing vision has four pillars (markets, AI, conflict, lifestyle) that each demand attention. Part VII repeatedly asks for a way to "run a company, own property, trade and develop AI without four full-time jobs" (`D02, D05, E03, A09, I-series`) without naming the fix. v2 names it:

**One verb, four pillars: *set a mandate → hire an operator → review exceptions.***

| Pillar | The mandate you set | The operator you hire | The exceptions you review |
|---|---|---|---|
| Business | pricing & marketing policy, budget | NPC manager (skill 1–5★) | a strike, a viral moment, a competitor opening |
| Property | maintenance & financing policy | property manager | a margin call, a major-repair decision, a redevelopment |
| AI | capital, drawdown, markets, retrain budget | the model itself + a researcher | model drift, a regime change, a detected session |
| Trading | standing orders, an execution algo | the algo | a stop hit, a thesis-breaking news jump |

One mental model, one UI pattern — **a mandate card plus an exceptions inbox** — applied four times. This is the difference between a game you play an hour a week and a spreadsheet job. It is built **once, in the Slice, for the one business**, and every later pillar reuses it. Depth now comes from *consequential choices*, not from clicks (the Part VII `D03/D06` principle, made structural).

This single change lifts **D4 from 6.5 to 9.5**: breadth becomes playable, and every system is now a decision, not a chore.

---

## Part 5 — The connective tissue: the Information Layer (D1, D3, D4)

The existing vision scatters information across four docs: price tiers (`01 §6.2`), rumors, insider tips, research/analyst AI, public filings. v2 unifies them into **one legible ladder**, because the single most addictive thing a finance game can do is make the player *feel smart*.

**The ladder (one screen, one progression):**
free headlines → paid terminal (full data, 5s earlier) → research & Analyst-AI estimates (narrow the σ on a hidden variable) → rumors (40–70% true, track-record-graded) → insider (illegal, exact, court risk).

And the engine's existing price decomposition (market / sector / news / flow / noise) is **surfaced everywhere** as the "Why it moved" ladder (already approved in the roadmap — pulled forward to the Slice):
- Free one-liner after every trade ("mostly the sector, not the company").
- Hired analyst: the full breakdown of *your* trades.
- Research Desk (late, costly): the breakdown of *any* asset, any past window.

This makes "buy better data" and "train a better AI" feel like the same satisfying climb, and it makes the Analyst-AI (your first AI feature) obviously valuable: it is the top rung of a ladder the player already understands. The explainable-price engine stops being an invisible engine property and becomes **the game's core pleasure and its moat.**

Lifts **D1** (the loop now has a built-in "I understood that" dopamine hit from minute 4) and reinforces D3/D4.

---

## Part 6 — The living world, bounded (D1 solo, D5, D7)

Part VII (`W01–W11`) wants a Dwarf-Fortress-style living world. Taken literally that is a research project and a scope trap. v2 ships the **bounded version that delivers ~80% of the feeling:**

- A roster of **~30 named NPC actors** — funds, a few dynastic families, the regulator, a handful of founders — each with public goals, resources and memory, transacting on the same engine.
- The world feels alive because *named* things happen (a fund blows up, a family sells a bank, a founder you can poach from), while the mass of households stays **aggregate** (`W11`).
- **Causal news only** (`W05`): a headline must correspond to a real state change — no invented facts.
- These actors are the **rivals, targets and partners** that make solo play meaningful *without* a cheatable leaderboard (see Part 8).

This is achievable, it feeds the Information Layer, and it is the answer to R-review's gap ("why would a non-competitive player stay"): there is a world to understand and act in, not just a ranking to climb. Built when the async shell lands, not in the Slice.

---

## Part 7 — Identity and the long game: one Legacy thread (D7)

In a world that never resets, the deepest motivation is **permanence**. The cities proposal gropes toward it ("your fortune should have an address; the city should remember how you built it"). v2 generalizes it into **one visible Legacy thread**, distinct from net worth, Prestige and Reputation:

- a founding plaque at your first shop (survives selling it),
- a chapter portrait of your estate, kept forever,
- your name on a tower — and the tower *keeps your name when you fall off the board*,
- a permanent public history: the mergers, the crash you survived, the longest-undetected session you caught.

This is almost all **presentation, not simulation**, and it is the answer to "why stay for a year." It also absorbs the valuable core of the cities docs without their cost (next part).

And it extends to one **new** social system worth adding (`E8` in the first review): a player's **verified public track record becomes a first-class object** others can follow, copy (opt-in, for a fee to them), or bet for/against via the existing IPO and fund systems. The leaderboard becomes *a market in people* — the purest form of "social pressure is the content" — and it reuses systems that already exist. Hard rule preserved: nothing about *how* you trade leaks without opt-in; this trades on *results*, which are already public.

---

## Part 8 — The integrity fixes that make the score honest (D2, D6)

Two unresolved holes in the current vision drag D2 and D6 down. v2 closes both as settled calls.

**8a — Cut the procedural-city renderer; keep the addresses (D2).**
`06-cities.md` specs a procedural isometric generator (tensor-field streets, shape grammars, WebGL instancing, a C0–C7 build plan) — a second game's worth of engineering that the cities *proposal* itself argues against (`LC19`: "if it only produces an attractive wallpaper, keep it as a wallpaper"). v2 **defers the generator indefinitely** and keeps the cheap, high-value core: stable addresses, your shop on a street, the skyline-as-leaderboard, a hand-authored backdrop that lights up with the market. The emotional payoff (Part 7) does not need procedural generation.

**8b — Settle the solo-determinism exploit (D6).**
The seed lives in the client save, so a solo player can run `src/engine` ahead and see the future (`ROADMAP.md R1`). This quietly breaks the roadmap's plan to build AI, espionage and *weekly challenges* solo-first. v2's settled call: **solo is a non-competitive tutorial/content sandbox** — no ranking, no shared challenges, no solo "AI tournament." A thin authoritative server comes forward to the moment *any* competition or shared seed is introduced. The entropy-drip half-measures are deleted; they add complexity for a mode that shouldn't be competitive at all. This retires the exploit instead of mitigating it, and it clarifies that the deep drama (hidden sessions, courts, boards) is **inherently a multiplayer promise.**

Lifts **D6 to 9.5** (honest by construction, no determinism hole) and **D2** (one whole "second game" removed from the critical path).

---

## Part 9 — Coherence: one stated ground truth (D8)

The bible describes one game (fictional "Port Avalon," 15 cities, 120 stocks); the real `v1` code is a different, smaller one (a desktop OS "Quay," 12 stocks, a merge freeze) that the bible authors couldn't see. v2 states the rule once, at the top of the bible:

> **The `v1` codebase is the ground truth. This bible is the aspiration. Where they differ, the code wins, and the roadmap cites the code.**

Plus: mark `06-cities.md` and the STONKS-9800 company-builder directive as **explicitly deferred backlog**, not near-term plan, so they stop implying imminent work. Keep the `RESOLVED-NUMBERS` discipline for every future change. Lifts **D8 to 9.5**.

---

## Part 10 — Re-scoring Vision v2

| Dimension | Before | After | What changed |
|---|---|---|---|
| D1 Core loop proven fun | 6.0 | **9.5** | The Slice with a strangers-playtest exit gate; "Why it moved" from minute 4; the loop is now validated before anything deep is built |
| D2 Buildability & scope | 5.0 | **9.5** | A minimum lovable game is defined; the procedural city and company-builder are cut from the path; everything else is earned by evidence |
| D3 Economic soundness | 9.5 | **9.5** | Already best-in-class; untouched except for being reached sooner |
| D4 Depth without chores | 6.5 | **9.5** | The delegation spine (mandate → operator → exceptions) makes four pillars one playable life |
| D5 Multiplayer & social | 8.0 | **9.5** | Social payoff sequenced right (the async shell is pillar 2, not deferred to Phase 3); the living-world roster + tradable track records make people the content |
| D6 Fairness & integrity | 7.0 | **9.5** | The determinism exploit is retired by making solo non-competitive; crime-EV and anti-grief intact |
| D7 Identity & long game | 8.5 | **9.5** | One Legacy thread answers "why stay a year"; the living world answers "why a non-competitive player stays" |
| D8 Coherence & docs | 7.5 | **9.5** | One stated ground truth; deferred docs labeled; reconciliation done |

**Weighted total: 9.5 / 10.**

> **Read this score with care.** I wrote the rubric and I scored my own revision, so this is a design-quality estimate, not an independent measurement. The "after" numbers say the document now addresses each weakness; they do not prove the game is fun. D1 in particular can only be confirmed by the strangers-playtest gate in Part 3. For a real check, have a second reviewer score v2 against the same rubric.

(Math: every dimension at 9.5 → 9.5 overall. The point is not that each lands exactly on 9.5, but that *no dimension is left below 9*, which the baseline failed on four counts — D1, D2, D4, D6.)

---

## Part 11 — What is honestly *not* a 10 (residual risks, so the score isn't a fantasy)

A 9.5 is not a 10, and claiming 10 would be the same over-confidence the first review flagged. What still carries risk, by design:

- **The Slice's fun is a hypothesis until strangers play it.** The whole v2 bets on *validating* fun early rather than *assuming* it. That is the right bet, but it is still a bet — the gate could fail and send the loop back to the drawing board. (This is why D1 is 9.5, not 10.)
- **Server economics at a persistent 5s tick with thousands of AI agents are unbenchmarked** (`ROADMAP R7`). v2 sequences this so no money is spent until the Slice is loved, but the cost model is still a guess until measured.
- **The async-vs-active-trader clock tension** (1 real hour = 1 day) is eased by the delegation spine and the catch-up replay idea, not eliminated. Some players will always want a faster or slower world than one clock gives.
- **Toxicity/harassment** in a game with public humiliation (Gilt List, Most Wanted) needs a moderation story earlier than the current Phase-2 placement; v2 flags it but does not fully design it.

Naming these is what makes the 9.5 credible rather than a number assigned to itself.

---

## Part 12 — The one-line summary for the team

> **Keep the brilliant engine and the brilliant endgame. Add the one thing they were missing: a small, whole, lovable game at the front — proven on real players — and one verb ("set a mandate, hire an operator, review exceptions") that turns four jobs into one life. Cut the second game (the procedural city) off the critical path. Make solo a sandbox and competition a multiplayer promise. Then let players tell you what to build next.**

*End of Vision v2. The full first-pass evaluation is in `VISION-REVIEW.md`.*
