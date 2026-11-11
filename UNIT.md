# Unit: statement resolution and broker first-load headroom

**Branch:** `eng/statement-resolve`  
**Base:** `a363065908fb136dbeabe473a3abf3746a8b9a68` (`eng/player-statements`, fast-forward from 9202e885; no unique pre-rebase commits, so no UNIT-DELTA)  
**Worktree:** `/workspace/avalon/statement-resolve`  
**When written:** 2026-11-11 21:28:36 Europe/Paris — before product-code edits.  
**Owner:** resume after the three player-statement / outlet / history deltas were sent to Gatekeeper. If Gatekeeper findings on 6cf908be, 50293cba, or a3630659 are forwarded through the parent, those come first. This unit does two things that were deferred from `soc.wire.post`: first-load budget headroom, and 5-game-day statement resolution recovered from 15:625 / 16:573.

The post **charge path is unchanged**: same `withLock`, same `$500` `cashCents` decrement, same 3/game-day cap, same `(accountId, key)` idempotency, same one persist, no `applyShock`. Resolution never charges, refunds, or moves marks.

## Player outcome

**(1) Budget.** `/broker` first-load is **214.7 / 215 KB** gz. The signed-in composer is split out of the Wire chunk so a guest first-load does not download it. The measured first-load must drop, and stay ≤ 215 KB. Evidence records before/after bytes.

**(2) Resolution.** A player statement about a tagged listed company is checked against engine marks after **5 game days** (`PARAM.statement_resolve_game_days = 5`, 15:625 §3.10.4). A factual up/down claim becomes **TRUE** or **FALSE**; a statement with no checkable claim is **OPINION** and never becomes TRUE/FALSE (15: “OPINION (no checkable claim) never resolves”). The row (and the detail) show a verdict badge. Each public handle has a public track record of `hits / resolved` (TRUE counts as a hit; OPINION is excluded), never the `acc_…` account id. Quotes and cash do not move when a statement resolves (16:573: statements are never `impactHint`ed; 05 applies no price effect). 05 surveillance and 13 manipulation on FALSE are **out**.

## Spec cites

- **15:625 §3.10.4** — factual claims about a tagged listed company are checked by 16 after `PARAM.statement_resolve_game_days = 5`; TRUE raises credibility (track record here); FALSE would go to 05/13 (not this unit); OPINION never resolves.
- **15:815** — `soc.statement.resolved` `{ statementId, verdict }` is PUBLIC. This unit persists the verdict on the public Wire item; a separate event bus is not required.
- **16:573 §3.6.10** — no `impactHint`, no price effect for statements. A false listed-company fact would trigger 13 (out).
- **23:951** — `statement_resolve_game_days = 5`.
- **17 / 19 Rule 3.17.3** — `/broker` first-load JS budget 215 KB gz (lazy plot chunk excluded, cap 60 KB).

## (1) Budget contract

- Today `Feed` statically imports `Composer`, so the composer rides in the lazy Wire chunk and is counted on `/broker` first-load (Wire is opened with the shell; the plot chunk is the only exclusion).
- Load `Composer` with `React.lazy` / a dynamic import, only when `canPost` is set. Guests and `?feed=` fixtures must not request that chunk.
- Measure with `node tools/ci/route-budget.mjs /broker` on a free `BUDGET_PORT` (never :3199 or :3102). Record baseline (this base, before the product commit) and the exact head. The head must be strictly below the baseline and ≤ 215 KB.

## (2) Resolution contract

**Window.** Due at `post.tick + 5 * TICKS_PER_DAY` (720 × 5 = 3600 ticks). Not before.

**Checkable claim (V1 lexicon).** After NFKC and case-fold, a closed word-boundary lexicon decides direction:

- UP: `up`, `rise`, `rises`, `rising`, `rose`, `gain`, `gains`, `rally`, `rallies`, `bull`, `bullish`, `higher`, `upside`, `moon`, `moons`, `pump`, `climb`, `climbs`, `hausse`, `haussier`, `monte`, `monter`, `progressera`
- DOWN: `down`, `fall`, `falls`, `falling`, `fell`, `drop`, `drops`, `dropped`, `decline`, `sink`, `sell`, `bear`, `bearish`, `lower`, `downside`, `dump`, `baisse`, `baissier`, `chute`, `chuter`

If both sides hit, or neither hits, the claim is not checkable → **OPINION**, assigned at post (no 5-day wait). V1 does not interpret general negation.

**Engine fact.** At post, snapshot each tagged asset's ticker `last` (decimal string). At due tick, compare the live `last` to that snapshot:

- UP is TRUE iff every tagged asset's last is strictly above the snapshot; else FALSE (flat or down).
- DOWN is TRUE iff every tagged asset's last is strictly below the snapshot; else FALSE.
- A new post always stores the snapshot. A legacy row without a snapshot cannot be fact-checked and is OPINION (not a guessed FALSE).
- Once TRUE/FALSE/OPINION is stored, it is frozen (later marks do not flip it).

**Who runs it.** `AuthService` resolves due rows under the same `withLock` as a post, with no cash or ledger write. `GET /api/wire` catch-up-resolves, and `LiveMarket.step` does the same so a verdict does not wait on a fetch. Persist only when a verdict (or a missing snapshot/claimDir) changes.

**Public shape.** `playerPostToWireItem` sets `slots.verdict` (`unresolved` / `true` / `false` / `opinion`) and never `authorId` or `acc_…`. Badge: `data-testid=wire-verdict`, EN “Open” / “True” / “False” / “Opinion”, FR “En cours” / “Vrai” / “Faux” / “Opinion”, on the row and in the detail (same chip pattern as Player / Earlier). When the public handle has at least one TRUE/FALSE, every of that handle's player items carries `sourceRecord: { hits, resolved }` (hits = TRUE count; resolved = TRUE+FALSE; OPINION excluded). Keyed only by `publicHandleId`.

**No money.** Resolving does not change `cashCents`, reserved cash, quotes, the digest, or call `applyShock`.

## Acceptance

1. Guest `/broker` first-load gz is strictly below this base's 214.7 KB and ≤ 215 KB; the composer is a separate chunk not requested on that guest first-load. Proof: before/after budget logs.
2. Opinion text (no lexicon hit, or both sides) is OPINION on the public item immediately; cash and quotes unchanged.
3. An UP (or DOWN) claim stays `unresolved` at `dueTick - 1` even if marks already moved; at `dueTick`, UP + every tag last strictly up → TRUE; flat or down → FALSE. Frozen after that.
4. FileAuthStore restart keeps the verdict, the snapshot, and cash; a second resolve does not rewrite a frozen verdict or charge.
5. Public GET JSON of player items has no `acc_…` / `authorId`. Track record is by `publicId` only; account B sees A's record and never A's cash. Two handles do not share a record.
6. Repo checks (lint, typecheck, build, check-hooks, route-budget /broker, ledger map-no-dup, npm test) on the exact head. If `launchpad-calibration` times out under the 160-worker official run, rerun that file isolated and disclose it. Affected e2e once on a clean temp tree, fresh `.data`: M2-01, M1-09, WIR-9, WIR-A, M1-10 (desktop + phone). Delete the temp tree. Preview :3199 stays 200; never bind :3199 or :3102. Pre-push stray-init check; normal push, no force, no PR. Evidence-only GK-HANDOFF.

## Not in this unit

05 belief / surveillance / 13 on FALSE. Voices, `reachWeight`, followers, evidence refs. 16:557 paid-analyst hire. 18:204 lookback scoring. POLICY/RECOVERY, 07/FX, meme-failure farm. No overall GO.

## Checklist

- [ ] UNIT.md written and committed before product-code edits.
- [ ] Baseline `/broker` budget recorded; composer lazy-loaded; after budget recorded and lower.
- [ ] Classifier, 5-day resolve, badge, public-handle track record, no money; tests (including an extension of the player-statements probe or a sibling).
- [ ] Checks on the exact head; affected e2e in a temp tree; delete the temp tree.
- [ ] Pre-push stray-init check; normal push; GK-HANDOFF under evidence only.
