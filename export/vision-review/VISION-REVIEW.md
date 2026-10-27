# Trading Game — Vision Review and Elevated Vision

Prepared for Mathis, 2026-10-18. Read-only evaluation of `/vision` on `main` (18 files, ~650 KB), plus proposed improvements. Nothing here changes the repo; it is a design document to react to.

Source of truth read: `00-mathis-vision.md`, `MASTER-BIBLE.md`, `RESOLVED-NUMBERS.md`, `01`–`05`, `06-cities(+proposal)`, `ROADMAP.md`, and the `.forge` archives.

---

## Part 0 — One-paragraph summary of what the vision is

A persistent-world, multiplayer **wealth tycoon**. You start with $5,000 and a cracked phone and grow a fortune across every arena of money: ~150 businesses in 13 sectors, stocks, crypto, FX, bonds, commodities, derivatives, real estate, private markets and collectibles — all priced by one deterministic macro engine on a 5-second batch-auction tick. On top of that sits the signature loop: build your own **AI lab** (compute × data × algorithm → a Model Capability Score) to trade, and to run **cyber ops** against rivals, where a successful quiet hack plants a **hidden session** that distills their model over time until they notice and cut it. Courts, regulators, insurance and fourteen non-hacking ways to topple a whale keep crime priced like a business. A lifestyle/status layer (homes, cars, watches, the UI shell itself upgrading from cracked phone to island control room) turns wealth into identity, and an 11-board leaderboard plus seasonal ladders drive the climb. The world never resets.

---

## Part 1 — Verdict

**This is an exceptional design document and a genuinely weak game plan — and those are not a contradiction.**

The writing is the best I have seen from a game-design team: internally consistent, numerically reconciled across five authors (`RESOLVED-NUMBERS.md` is a real feat), honest about what is a target versus a measurement, and deeply self-aware about exploits. Pillar 1 (markets) and Pillar 3 (conflict/law) are close to production-grade specs.

The problem is **scope versus a loop that has not been proven fun yet**. The roadmap is 52 milestones for what reads as a one-to-few-agent team on a single PC, and the document's own status notes admit the fun of even the core loop ("a new player gets the loop in 10 minutes") has not been validated. The vision keeps *adding* (AI, cyber, courts, dynasties, procedural cities, insider trading, player funds) before the $5k→first-rank→"one more trade" core has shipped and been playtested. The biggest risk to this project is not that any system is wrong; it is that **the project drowns before the first delightful 30 minutes exists.**

So this review does two things:
1. **Evaluates** the vision honestly (strengths, the real risks, the gaps).
2. **Elevates** it — but elevation here means *sharpening and sequencing the fun*, plus a focused set of radical additions that multiply what is already there rather than widen the surface.

My single strongest recommendation: **declare a "Vertical Slice" as the real North Star** (Part 4), and treat everything past it as a backlog to be earned by playtest evidence, not a plan to be executed.

---

## Part 2 — What is genuinely strong (keep, protect)

1. **The explainable-price engine (`01 §0, §2`).** "Every price move traces to a cause a player could have seen" is the keystone. It is what makes information, data and AI *worth money* instead of being flavor. Almost every good multiplayer finance game dies because prices are noise; this one is built not to. Protect this above everything.

2. **Batch-auction fairness (`01 §7.1`, `02 §0.2`).** The 5-second uniform-price tick removes the latency race, so mobile = desktop and there is no twitch skill gate. This is the correct spine for an async, global, phone-first game and it is cheap and deterministic. Rare to get this right.

3. **The anti-inflation system (`01 §8, §14`).** The Net Worth *Index* (net worth ÷ money-supply index) as the ranking metric, finite NPC counterparty, logit diminishing returns, square-root impact, and a diegetic public Stabilizer — this is the make-or-break system for a never-reset economy, and it is thought through better than most shipped live-service economies.

4. **Crime-as-business with an EV (`03`).** Target ratio 0.8–1.2× honest at 2–4× variance, detection ≠ attribution as *separate rolls*, evidence that must be *discovered* and decays, fines as % of net worth with a hard floor so no one is ever wiped, and 14 non-cyber takedowns. This turns "griefing" into a legible risk/reward system with counterplay. The balance harness (`03 §16`) with 15+ gated metrics is the right way to ship it.

5. **Hidden sessions (`03 §4.6`, `05 §5.1`, `04 §10.5`).** Mathis's own call, and the best single mechanic in the game. A hack is not instant loot; it is a slow leak you have to *notice* in a noisy connections list (with decoy anomalies at 0.05/h so a clue is evidence, not proof). It converts hacking from a feel-bad mugging into a cat-and-mouse reading game with a ceiling (0.85) so theft is catch-up, never a win button. This is the most original thing in the vision and the design around it (decoys, the throughput gauge you can always watch, disconnect costs) is excellent.

6. **The UI shell as progression (`04 §9.3`).** Cracked phone → laptop → three-screen desk → glass trading floor → island control room, same muscle memory, different materials. This is the cheapest, most screenshot-able status reward in the whole design and it costs almost nothing to build incrementally. A signature idea; keep it near the front.

7. **Document discipline.** `RESOLVED-NUMBERS.md`, the Part-VII annotation keys (VISION vs PROPOSAL), and the roadmap's conflicts log are a model of how to keep a multi-author design coherent. Whatever else changes, keep this habit.

---

## Part 3 — The real risks (ranked by how likely they are to kill the project)

### R1 — Scope will outrun the fun. (Severity: critical)
52 milestones, five pillars, procedural cities, insider trading, player-run funds, dynasties, a company-builder "in the spirit of STONKS-9800" — all before the core loop has passed its own 10-minute fun gate (the roadmap admits onboarding "exists but none of it is built"). Every system in this doc is defensible in isolation; together they are a multi-year AAA scope on an indie engine. **The vision has no concept of "cut".** There is no "minimum lovable game" called out — only a maximum.

*Fix:* Part 4. Define the Vertical Slice, ship it, playtest it, and let evidence (not the backlog) choose what is built next.

### R2 — The core *solo* fun is unproven and under-specified relative to the adversarial layer. (Severity: critical)
The conflict/AI/legal layer (`03`, `05`) is ~190 KB of razor-sharp spec. The thing a brand-new player does in their first hour — buy a business, make a trade, feel a number go up and *want* to come back — gets a lovely minute-by-minute script (`04 §4`) but rests on an economy whose fun has never been measured. **The team has spent its best design energy on the endgame, not the first session.** A finance game lives or dies in minute 4, not in the distillation ceiling.

*Fix:* invert the energy. The Vertical Slice is about making *one business + one trade + one rival* delightful. Treat AI/cyber/courts as "the reason to stay," not "the reason to launch."

### R3 — Solo determinism makes any pre-server competition cheatable. (Severity: high, correctly identified)
The roadmap (`ROADMAP.md R1`) already flags this: the seed lives in the client save, so a player can run `src/engine` ahead and see the future. This quietly undermines the roadmap's own Phase-1/2 plan to build AI, espionage and *weekly challenges* solo-first, "because it's cheaper." Any leaderboard, challenge or "AI tournament" before servers is trivially broken, and much of the drama (hidden sessions, courts) only *means* anything against other humans.

*Fix:* see R-FIX in Part 5. In short: either bring a thin authoritative server forward, or accept that the solo phase is a *content/tutorial sandbox only* (no ranking, no shared challenges) and stop designing competitive solo systems.

### R4 — The AI layer risks making manual play pointless, or being too complex to be fun. (Severity: high)
`05 §12` lists eight balance levers to stop "AI wins everything," which is a sign the author knows the danger. But the deeper risk is the opposite one Part VII (`A01`) raises: an AI research pillar that is "longer timers and mandatory technical micromanagement" is a chore, not a fantasy. Training runs with failure odds, DU budgets, compute-optimal data ratios and MoE/RL nodes are a lot of simulation for a payoff the player may never *feel* as fun.

*Fix:* the AI pillar needs a "delegation spine" (Part 5, E2) so it is a set of **a few consequential choices** (what to specialize, build-vs-license, the mandate) with the simulation underneath, exactly as Part VII `D03/A04/A09` asks. Build the **Analyst-signal AI** (the low-risk "AI assists a human" bridge) *first*; build autonomous trading AI and the full tech tree last.

### R5 — Two different design regimes are fighting in the repo. (Severity: medium, but confusing)
The five bible sections describe one game (fictional city "Port Avalon," 15 cities, 120 stocks). The `06-cities` docs and the roadmap reference an *actually-existing codebase* on a `v1` branch (a desktop OS called "Quay," 12 stocks, a merge freeze, `src/engine/universe.ts`) that the bible authors could not see, and the cities proposal explicitly notes the SHA mismatch and "source-document claims, not verified facts." **There is a gap between the bible's imagined game and the code that exists.** New contributors will not know which is real.

*Fix:* one reconciliation pass (Part 6) that states plainly what is built, what is specced, and that the bible is the *aspiration* while the `v1` code is the *ground truth*; make the roadmap cite the code, not the other way round.

### R6 — The 1-hour = 1-day clock punishes the async player the game claims to serve. (Severity: medium)
`02 §0.3` says "most players play 15–60 min/day." At 1 real hour = 1 trading day, a 20-minute session is a third of a trading day; earnings seasons (3 real days) and league weeks (7 real days) assume near-daily presence. The offline cap (8–16 h) and "While You Were Away" help, but the fantasy of *trading* (reacting to the open, the close, a news jump) is largely unavailable to someone who plays twice a week. The game is really two games — an active trader's game and an idle tycoon's game — on one clock.

*Fix:* lean into the split. Make the **business/property/AI-mandate layer fully async and forgiving** (it already mostly is) and treat **active trading as the "deep session" opt-in** it already is in `04 §11.1`. Consider a personal "catch-up replay" (see F3) so a returning player can *experience* the day they missed, not just read a summary.

### Gaps worth noting (not fatal, but unaddressed)
- **No new-player social safety / toxicity model for chat** beyond profanity filters; a finance game with hacking and public humiliation (the Gilt List, Most Wanted) needs a harassment story earlier than Phase 2.
- **No "why would a non-competitive player stay" answer.** Everything is ranked, hunted or optimized. There is no "cozy landlord" or "build a beautiful city" mode for the large audience that bounces off PvP. (The cities layer is the seed of this — see F1.)
- **Monetization is cosmetics-only (good) but the cost model is hand-waved** (`02 §12.4`: "under ~$50/month"). A persistent 5s-tick world with AI agents for thousands of players is not obviously cheap; the roadmap's R7 flags this. Worth a real benchmark before Phase 3 is committed.
- **Accessibility/colorblind is handled for gain/loss but the whole game is numbers-dense**; a "simple mode" that survives past onboarding (not just the first trade) isn't specified.

---

## Part 4 — The elevation, part 1: the North Star the vision is missing

The single most valuable thing I can add is not a new mechanic. It is a **spine the whole vision can hang on**, so that "radically improve" doesn't mean "add more."

### The Vertical Slice (the real v1)
> **One city. One of each thing. Made delightful. Shipped. Playtested before anything else is built.**

- **Markets:** 20–30 stocks across ~6 sectors, 1 index, 3 crypto, gold + oil. The full explainable price engine (this is the crown jewel; do not cut it). Batch auction, square-root impact, news, earnings.
- **Businesses:** 8–10 businesses T1–T2 with the logit-share model and the six upgrade axes, in 3 districts of one city.
- **Real estate:** the one simple path (buy where you live, a mortgage, rent).
- **The one AI thing:** the **Analyst-signal AI only** — "train a model, it narrows your uncertainty on a hidden variable." No autonomous trading, no cyber, no tree. This teaches the whole AI fantasy with one screen and zero balance risk.
- **One rival:** the minute-4 rival (`04 §4.2`) as a *computer-run fund with a public, readable track record*, not a hollow name.
- **The shell:** cracked phone → laptop → desk. Three states. This is the retention hook and it is cheap.
- **No multiplayer, no cyber, no court, no dynasties, no procedural city.** A static, beautiful, hand-placed skyline backdrop is enough.

**The exit gate is not "it works." It is: do 10 strangers, given no help, (a) reach the first rank-up, (b) say they want to play tomorrow, and (c) describe the loop back to you?** If no, the fix is the loop, not the backlog. If yes, you have *earned the right* to build the next pillar, and the playtest will tell you which one.

Everything in the 52-milestone roadmap is then re-framed as **"content the slice earned,"** sequenced by what players ask for, in this rough order of risk-adjusted value:
1. More markets/businesses/cities (pure content, low risk, high satisfaction).
2. The **async multiplayer shell** (shared economy, leaderboards, the Wire, "While You Were Away") — this is where the vision's "social pressure is the content" finally pays off, and it needs real players.
3. The **adversarial layer** (AI tree, cyber, courts) — the deep endgame, built last, against humans, where it belongs.

This is almost exactly the roadmap's own phase order. The change is *philosophical*: the Vertical Slice is a **product you could ship and love on its own**, not "Phase 0 of 4." If the team never gets past it, it should still be a good game.

---

## Part 5 — The elevation, part 2: radical improvements that multiply, not widen

These are chosen to make what already exists *deeper or more fun*, not to add a sixth pillar. Each has a stable ID so you can react per-item.

### E1 — Make "explainable prices" a visible, teachable feature, not just an engine property.
The engine already decomposes every move into market/sector/news/flow/noise. **Surface it everywhere** (the roadmap's N3 "explain-this-candle" and the approved "Why it moved" ladder are exactly right — pull them *forward* into the Vertical Slice). The single most addictive thing a finance game can do is make the player feel *smart* — "I understood why that moved." This is your whole moat. A free one-line "mostly the sector, not the company" after every trade should exist from day one, not Phase 1.

### E2 — A unified "Delegation" spine across all four pillars (the depth-without-chores fix).
Part VII (`D02, D05, E03, A09, I-series`) keeps circling this without naming it as one system. Name it. **Every pillar gets the same verb: set a mandate, hire an operator, review exceptions.**
- Business → hire a manager (budget, pricing policy).
- Property → hire a property manager (maintenance/financing policy).
- AI → set a model mandate (capital, drawdown, markets, retrain budget).
- Even trading → standing orders / an execution algo.

One mental model, one UI pattern (a mandate card + an exceptions inbox), applied four times. This is what lets a player "run a company, own property, trade and develop AI without four full-time jobs" (`D02`). It is the difference between a game you can play for an hour a week and a spreadsheet job. **Build the mandate pattern once, in the Vertical Slice, for the one business.**

### E3 — Turn the NPC world into a *reactive* world, cheaply (the "living world" ask, bounded).
Part VII section 2 (`W01–W11`) wants a Dwarf-Fortress-style living world. That is a research project and a scope trap if taken literally. The **bounded version that delivers 80% of the feeling**: a small roster of ~20–40 *named* NPC actors (funds, families, a regulator, a few founders) with public goals, resources and memory, who transact on the same engine. The world feels alive because *named* things happen (a fund blows up, a family sells a bank, a founder you can poach from), while the mass of households stays aggregate (`W11`). **Causal news only** (`W05`): a headline must correspond to a real state change. This is achievable, it feeds the explainable-price engine, and it gives solo play a reason to exist that isn't a cheatable leaderboard (R3). *Do this when the async shell lands, not before.*

### E4 — "Information markets" as the connective tissue between all pillars.
The vision has information tiers (`01 §6.2`), rumors, insider tips, research AI, and public filings — but they are scattered across four docs. Unify them into one **Information layer** that is the economic bridge: free headlines → paid terminal → research/AI estimates → rumors (noisy) → insider (illegal). This is *already the design*; making it one legible system (one screen, one progression) is what makes "train a better AI" and "buy better data" feel like the same satisfying ladder. It also makes the Analyst-signal AI (your first AI feature) obviously valuable: it is the top rung of a ladder the player already understands.

### E5 — The hidden-session mechanic deserves a *defensive* power fantasy, not just an attacker one.
Right now defense is mostly "spend money, watch a list." The **Defender board** exists but defense is reactive. Give the defender active, *fun* counterplay that the Vertical Slice's Analyst AI foreshadows: honeypot models that poison thieves (already in `05 §5.2` — make it a *celebrated* play, a "you got robbed and the thief's model now loses money" moment), canary data that names the thief, and a "counter-intelligence" mini-loop. The best version of this game has people who are *proud of being hard to crack* and who set traps. This is almost free (the mechanics exist) and it doubles the audience for the cyber layer.

### E6 — A single "Legacy" number that makes a never-reset world *feel* like it remembers you.
The cities proposal (`LC01–LC03`) gropes toward this: "your fortune should have an address; the city should remember how you built it." Generalize it. In a world that never resets, the deepest motivation is **permanence**: a founding plaque at your first shop, a chapter portrait of your estate, your name on a tower, a tower that keeps your name when you fall off the board. Make this one tracked, visible **Legacy** thread (distinct from net worth, from Prestige, from Reputation) — the story of what you built that outlives your current balance. This is the answer to "why stay for a year," and it is mostly presentation, not simulation.

### E7 — Cut or defer the procedural-city renderer; keep the *addresses*.
`06-cities.md` proposes a procedural isometric city generator (tensor-field streets, shape grammars, WebGL instancing, a C0–C7 build plan). It is beautifully specified and it is a **second game's worth of engineering** that the cities *proposal* document (`LC19`) itself argues against ("a focused Port Avalon release first; if it only produces an attractive wallpaper, keep it as a wallpaper"). The reviewer-proposal is right and the original over-builds. **Keep the cheap, high-value core — stable addresses, your shop on a street, the skyline-as-leaderboard, a hand-authored backdrop that lights up with the market — and defer the generator indefinitely.** The emotional payoff (E6) does not need procedural generation.

### E8 — One genuinely new system worth adding: *public, tradable reputation of other players' track records.*
The vision has player IPOs (bet on a player's *company*) and player funds (invest in a player's *trading*). The natural, novel extension that multiplies the social layer: **a player's verified public track record becomes a first-class object others can act on** — follow, copy (with the player's opt-in and a fee to them), bet for or against via the fund/IPO systems, or short their credibility. This turns the leaderboard from a static ranking into a *market in people*, which is the purest expression of "social pressure is the content." It reuses the IPO, fund, filings and no-auto-leak systems that already exist, so it is combinatorial value, not new surface. (Respect the hard rule: nothing about *how* someone trades leaks without their opt-in; this trades on *results*, which are already public.)

---

## Part 6 — Recommended reconciliation and doc hygiene (quick wins)

1. **State the ground truth once, at the top of the bible:** "The `v1` codebase is what exists; this bible is the aspiration; where they differ, the code wins and the roadmap cites the code." Resolves R5 for every future contributor.
2. **Add a "Vertical Slice" section to `MASTER-BIBLE.md` PART IV** as the real v1, with the strangers-playtest exit gate. Re-label Phases 0–4 as "post-slice content, sequenced by playtest evidence."
3. **Mark the two "second-game" documents (`06-cities.md`, the STONKS-9800 company-builder directive) as explicitly deferred** backlog, not near-term plan, so they stop implying imminent work.
4. **Move the solo-determinism decision (R3) to a settled call**, because three roadmap phases depend on it. My recommendation (R-FIX): accept solo as a *non-competitive tutorial/content sandbox* (no ranking, no shared challenges, no solo "AI tournament"), and bring a thin authoritative server forward to the moment any competition or shared seed is introduced. Delete the entropy-drip half-measures; they add complexity for a mode that shouldn't be competitive anyway.

---

## Part 7 — The elevated one-paragraph pitch (for reference)

> *Start with $5,000 and a cracked phone in a city that was already alive before you arrived. Learn why prices move, and the market starts to feel less like luck and more like a language you can read. Buy a shop on a street you'll remember, hire someone to run it, and put your first profit into a trade you understand. Train a model that whispers what you can't see yet. Grow — and the world grows with you: your phone becomes a desk becomes a floor of glass above a city that now has your name on it. Get rich enough to be feared, and visible enough to be hunted, in a world that never forgets who built what. Not a number going up. A name that stays.*

The vision already contains every word of that. The work is not to invent more — it is to **make the first thirty minutes of it true, prove people love it, and let them tell you what to build next.**

---

*End of review. Companion summary is in the thread.*
