# Living Cities — A Place in the World

Update proposal for Mathis · 2026-10-13 · **PROPOSAL, pending review**

Companion to [06-cities.md](06-cities.md). All `LC` identifiers below are stable review IDs. Every recommendation, parameter, feature and release boundary in this document is proposed, not an approved change to the game. The source document and existing canon remain unchanged.

## The proposal in one page

**Your fortune should have an address, and the city should remember how you built it.**

Keep the original document's central idea: the economy appears as a real, explorable city. Strengthen it with three experiences:

1. **Belonging:** your first small business has a recognizable storefront on a street you can revisit, long before you qualify for a skyline tower.
2. **Consequence:** public expansions, closures and district redevelopment visibly change that street. A falling share price changes the market overlay; it does not magically remove floors from an office.
3. **Legacy:** the city records permitted public milestones. Years later, you can still find where your story began, even if you sold the business and another owner occupies it.

The daily loop is **notice a change → understand the public cause → open the relevant existing game action → see the eventual consequence**. City view becomes a useful entry into your empire, and a place you want to visit. Trading, business and property systems remain authoritative.

My recommendation is to develop a focused Port Avalon release first: a beautiful harbor city, permanent addresses, company and asset links, restrained public change summaries, and visible construction. Expand to the other cities after this experience proves worthwhile. Crown towers and the larger growth model follow separately.

## Evidence and boundaries

- The supplied Downloads document and this checkout's `vision/06-cities.md` have the same SHA-256: `640ABC82FDFA3A9D45113D869A642E5760333829E41CBE8B54FE67324F419F1C`.
- This checkout is on `main`. The source's `src/engine/universe.ts`, `src/world/`, and `docs/V1-PRIVACY.md` are absent here. Its assertions about branch `v1`, six defined places, live district indices, public holdings, and the 4,000-client gate are **source-document claims, not independently verified implementation facts**.
- Local `vision/00-mathis-vision.md` confirms the multiplayer finance/AI/lifestyle direction. `vision/MASTER-BIBLE.md` Part VII establishes reviewable proposals, public causal history, progressive disclosure and privacy. `RESUME.md` distinguishes playable code from specifications and staged work; that file describes an older project snapshot.
- Older local documents and the supplied document differ on disclosures and release state. The implementation team must reconcile these against the actual target branch. This proposal uses the narrower rule: publish only fields and associations explicitly permitted by the current disclosure contract.
- This is a design deliverable. No renderer, gameplay change, benchmark or load test was performed. Technical sources support the available techniques, not the proposed game's performance or enjoyment.
- The source document describes a merge freeze. Its branch instructions are context for planning; this review neither executes them nor modifies branches. If implementation is later authorized, verify the actual branch and freeze state first.

## LC01 — The first address matters more than the first skyscraper

After an existing business purchase succeeds, offer **“Visit your business.”** Open the City app at the assigned storefront. Show its existing name, district, address, permitted operating status and ordinary management link. Give the player one modest facade choice from a free starter set. Do not insert a mandatory city visit into the purchase flow.

A beginner can recognize their awning among ordinary buildings. A wealthy player can recognize their headquarters from the harbor. These are successive expressions of the same progression.

Keep an owner-only **My beginnings** bookmark to the original address. It survives a sale, but gives no continuing control or ownership. A public founding plaque requires a permitted record and voluntary publication. If the business occupied a shop inside a larger building, the bookmark remembers the storefront, not ownership of the whole building.

**Why this belongs in the update:** the city's emotional reward starts with a small fortune. Most players need an attainable reason to care about the map.

## LC02 — A quiet, useful reason to return

The City app opens with a small **City brief**, with at most three relevant changes since the player's last visit:

- “A permitted public expansion completed near your Old Harbor shop.”
- “Two properties in a district you follow are now listed.”
- “A new public development has opened on the eastern waterfront.”

Each item links to its source record and map position. Show publication time and snapshot freshness. The brief selects from actual authorized events; it invents no demand, profit opportunity or causal connection.

At the start, offer only **My places**, **Districts**, and **For sale**. Add Companies, sectors, auctions and change history progressively. Search and the accessible list reach the same entities without navigating the map.

No daily reward, lost streak, check-in requirement or popup for routine construction. City activity continues while the player is away, and the existing return summary can link into meaningful changes.

## LC03 — The city remembers, without becoming a second simulation

Attach a compact **Then / now** view to a selected place: the currently visible building and one retained public milestone state. A former warehouse might retain its brick podium after a permitted conversion; a newer tower might preserve a small old frontage.

Start with event records and two visual states, rather than a rewindable simulation of every day. Retain bounded chapter summaries and aggregate older transitions. Any public archive must have its own disclosure and retention policy; being visible today does not automatically authorize indefinite publication.

Selected landmarks can contain short histories assembled from approved facts. An interesting address earns a story through what happened there. Generated prose, if used later, may describe those records but cannot invent an owner, deal, cause or economic benefit.

## LC04 — Five cities need five recognizable compositions

Geography and skyline silhouette should identify each city even in greyscale. Color, weather and signage reinforce identity. Author a small set of composition constraints per city; generate the ordinary streets and buildings around them.

The following ranges are **art-direction starting points**, not economy parameters or measured optimal settings.

| City | Recognizable image | Streets and massing | Signature place | How its history appears |
|---|---|---|---|---|
| **Port Avalon** | Crescent harbor; brick foreground; one concentrated skyline; an inhabited hill behind it | Old port basin and radial lanes, a diagonal avenue into a downtown grid, warehouse frontage along the east docks | **Exchange Steps**, looking toward the Customs House and harbor cranes | Preserved warehouse shells, new commercial infill, a waterfront converted in stages |
| **Nordhaven** | A deep dark fjord between inhabited terraces; large areas of visible hillside | Long contour streets joined by short climbs; most ordinary buildings 2–6 floors, selected landmarks taller | **Fjord Forum**, a low copper-roofed hall at the water | Small terrace infill, restored timber buildings, discreet new glass structures |
| **Meridia** | A broad S-shaped canal, low roofscape and bell towers; a separate modern skyline across water | Heritage parcels mostly 2–5 floors; lanes, courts and pedestrian bridges; regular mainland blocks | **Canal Loggia**, a stone arcade framing the distant business district | Historic fabric remains; new business construction accumulates on the mainland |
| **Sundara** | Long beach, one coastal boulevard, scattered towers rather than a single CBD | Long narrow coastal blocks; hotels, villas and low commercial frontage; uneven heights | **Palm Bay Marina**, whose curved breakwater is visible at city scale | Booms leave cranes; authorized stalled projects leave unfinished shells |
| **Kaiyo** | A visible elevated rail loop, dense station clusters, rectangular reclaimed shore | Fine-grained old wards against disciplined reclamation grids; tall structures cluster around stations | **Loop Gate**, where rail passes through a low commercial podium | Densification keeps old narrow frontages beneath newer towers |

Keep Ink & Brass consistent: restrained facade materials, thin ink edges, warm light. Sundara and Kaiyo can have localized colored signs without turning the whole scene into a neon arcade. No bouncing money icons, collectible confetti or skyline crowns floating above buildings.

Isla Serena remains a small, scarce estate vignette as proposed in the source. Its ownership, boats and interiors require explicit disclosure eligibility. Do not imply it is geographically visible from Avalon's horizon unless the world map supports that relationship.

Future cities should receive a distinct geographic constraint and settlement history. Mixing existing palettes alone will not create a recognizable new place.

## LC05 — Buildings have addresses, occupants and histories

Separate **parcel**, **building**, **unit**, and **occupant**. A tower can contain many storefronts. A shop can change owner. A business may occupy space without owning the property. Redevelopment may replace the structure while preserving the parcel and address.

| Binding | What stays stable | What may change | Public display condition |
|---|---|---|---|
| Listed-company HQ | Parcel and address | Sign, facade, approved expansion | Company and HQ association are public |
| Small business | Building/unit identity | Tenant, owner, shop name, permitted upgrades | Each displayed association is authorized |
| Owned property | Property-to-parcel/unit mapping | Ownership or structure, under existing rules | Show ownership only where explicitly permitted |
| Personal home | Underlying property identity | Owner-only furnishings and collections | Public exterior association is voluntary where required; interiors default private |
| Crown landmark | Physical parcel and structure | Recognized participant and cosmetic signage | LC10 rules |

Do not relocate an HQ merely because its market-cap rank changes. Rank determines an initial suitable site, if needed; later movement requires an actual relocation event. A delisted company is not automatically bankrupt, and a rights issue is not automatically a construction project.

Give every ordinary structure a base-economy source, district and use. That does not require a separately simulated household or company for every building. NPC population and capacity can support aggregated urban fabric; named actors receive explicit bindings.

## LC06 — Separate financial signals from physical change

Use three different timescales:

| Layer | What it communicates | Update source |
|---|---|---|
| **Market overlay** | Public share-price performance | The same authorized published quotes available elsewhere |
| **Occupancy and signs** | Public opening, closure, vacancy or tenancy | Permitted operating events and published district summaries |
| **Structure** | Completed expansion, conversion, redevelopment | Explicit development lifecycle |

Default architecture should look occupied and believable. In an optional **Market lights** overlay, company window illumination can encode public performance, with a legend and the numerical return on selection. A dim tower means negative price performance in that view, not proven empty offices or layoffs.

Suggested overlay mapping for experimentation:

`r = clamp(publishedDayReturn / 0.05, -1, 1)`

`litRatio = 0.50 + 0.30 × r`

This maps ±5% returns to 20%–80% lit windows. It is an illustrative visual scale, not a financial model. Do not silently volatility-normalize companies into incomparable colors. Show the same return reference and timestamp as the existing market view; missing quotes display an unavailable state rather than inferred prices.

A city-wide sell-off changes the overlay quickly. Its physical effects appear only if later public events justify them. Cosmetic cues must never manufacture news about private hiring, revenues, bankruptcy or investment.

## LC07 — Growth follows capacity and sustained demand

Replace the source's single score summing GDP, capital invested, property valuations, market cap and active accounts. That combines different units, can count the same financing repeatedly, and risks building towers merely because assets became expensive.

**First release:** project existing public district indices and actual public asset/development events. Maintain a seeded NPC base city. Do not introduce an invisible new demand simulator to decorate an update.

**Later, if the engine supports authorized capacity data:** use normalized public district demand separately for residential, commercial and industrial uses. Public company expansion can contribute to commercial capacity needs; actual property units contribute to supply. Cosmetic spending, resale payments and raw account signups contribute zero new productive capacity.

One candidate district/use rule is:

`demandRatio[t] = publishedRequiredCapacity[t] / max(existingUsableCapacity[t], capacityFloor)`

`pressure[t] = 0.90 × pressure[t−1] + 0.10 × clamp(demandRatio[t], 0.5, 1.5)`

Initially test growth eligibility after pressure exceeds **1.10 for 7 game days**. Test vacancy response after it remains below **0.85 for 14 game days**. These are tuning candidates. Development also requires access, eligible land, public authorization and construction capacity; crossing a ratio alone grants no asset or profit.

An NPC recovery floor keeps a quiet city inhabited. Offline players do not have their existing business performance secretly penalized. Account presence alone never boards up their shop.

The source's urban-scaling paper motivates considering infrastructure economies of scale; it does not validate mapping this game's mixed financial score to parcel counts with exponent 0.8. Choose game parameters through simulated histories and playtests. [Bettencourt et al., 2007](https://pmc.ncbi.nlm.nih.gov/articles/PMC1852329/).

## LC08 — Preserve geography; let development history matter

Use a **fixed geographic plan with several feasible development corridors**, not a fixed final building on every future parcel. Terrain, major crossings, heritage areas and landmark sites remain stable. Public history determines which eligible corridor develops first and which building type occupies a site.

A candidate priority among eligible projects:

`priority = 0.35 × access + 0.30 × adjacency + 0.20 × publicDemandFit + 0.15 × planSuitability`

All four scores are normalized to [0,1]. Break ties with a stable parcel hash, not fresh randomness. Do not repeatedly add adjacency bonuses into a permanent accumulated score.

Prefer infill and reuse before extending into unserved land. Apply heritage, access, flood/slope and industrial-use exclusions before ranking. Restrict development to a connected serviced frontier; no isolated tower appears because a noisy land-value field had a local peak.

At first, limit city-wide construction starts to **0.5% of developed parcels per game day**, with a small-city minimum and an absolute work cap. This is a visual pacing experiment. Eligible projects wait; owned assets are not deleted or economically revalued to enforce it.

Physical lifecycle: **planned → serviced → building → occupied → vacant → derelict → reuse**. Construction cancellation leaves a persistent site. Recovery fills or reuses buildings before automatically erecting more. Never demolish or move a bound player asset under a purely visual decline rule.

Use a bounded first envelope with explicitly reserved future corridors. Expanding beyond it adds a reviewed adjacent plan; it never regenerates an existing neighborhood. History changes the path through the plan, while the same seed, published events and generator package reproduce that path.

## LC09 — Cosmetic spending should reinforce identity

Offer a few understandable categories with previews and explicit fixed prices in game money:

| Purchase | What the player gets | Boundary |
|---|---|---|
| Shop facade | Awning, lettering, shutters and modest exterior details | No demand or revenue multiplier |
| Company architectural identity | Approved facade kit and sign treatment | No extra capacity unless separately purchased through the economy |
| Personal skyline portrait | Framed image of existing public landmarks and permitted personal places | No fabricated ownership or rank |
| Public-space sponsorship | Time-limited permitted plaque on an existing civic space | No control of access, allocation or local rents |
| Crown style | A selected roof/sign treatment within its visual envelope | No rank, height entitlement or commercial advantage |
| Optional legacy plaque | Eligible public founding milestone at an address | No ongoing ownership after a sale |

Keep basic personalization available to small businesses. Expensive materials and larger commissioned treatments provide richer expression later. Use moderated bounded lettering; do not display arbitrary images or URLs on the city.

Separate a better-looking storefront location from a genuinely more profitable location. A cosmetic placement fee cannot buy hidden demand, superior customer access or better order allocation. If location will affect profit, it needs an explicit economy specification and is outside this cosmetic update.

Likewise, sponsorship does not automatically add Prestige, heat, political influence or Legacy score. Any such coupling is a separate reviewed rule. A weekly money auction rewards spending; do not present it as recognition of community contribution.

## LC10 — Status towers should celebrate a public achievement

Keep company towers and player status structures visually distinct. I favor **one fixed Hall of Patrons with up to 12 recognition positions per city** before 12 independently resizing wealth towers.

- Membership comes from a specified already-public board snapshot. Rank bands, not newly calculated net-worth buckets, control small visual distinctions.
- Recognition is **opt-in**. Public association with a city is a separate choice; it must not reveal a private residence or presumed sign-up home city.
- Freeze recognition for a chapter, showing the board's snapshot date. A daily leaderboard can remain available in its existing panel. Chapter recognition avoids perpetual physical rebranding while preserving ongoing competition.
- Players outside the top 12 still have their public businesses, permitted plaques and personal places. Their presence must not depend on winning the richest-player contest.
- Opted-out players do not get an anonymous rank-specific tower. Rank plus location plus a “Private” label can still identify someone. An unassigned position uses a neutral civic treatment without encoding that person's finances.

If the original tallest-player tower remains preferred, use a **fixed rank-band silhouette** from the same public snapshot, with no extra wealth thresholds. Mark it clearly as symbolic recognition. Do not imply it is an owned rental property.

Once-per-chapter representation, or another declared eligibility rule, prevents instant city-switching for a recognition spot. This is a proposed status rule, not a change to where the player may own assets. Rank recognition and paid customization remain separate.

## LC11 — Rendering: retain orthographic instancing, begin with three.js

Recommend a small direct three.js renderer behind `CityRenderer`, loaded only on opening the City app. Instancing reduces draw calls for shared geometry and materials, and orthographic projection provides the consistent illustrated scale. These capabilities are documented; the required phone performance still needs measurement. [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html), [OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html).

Do not start by writing a custom graphics engine. Compare a small representative instanced scene against a baked image/Canvas baseline. Implement a raw WebGL competitor only if the evidence identifies a library overhead problem worth solving. A scene full of randomly distributed boxes is insufficient: include the actual waterfront, tall occluders, signs, shop picking, roads and window shader.

**Correct the camera math.** For an orthographic camera with a 45° horizontal rotation and elevation `α` above the ground, a square ground tile has diamond width/height ratio `1 / sin(α)`. Therefore a 2:1 diamond needs **α = 30°**, not `atan(1/2) ≈ 26.565°`. The latter is the screen-space edge slope angle for a 2:1 diamond. This is a projection derivation, not a benchmark or a source quotation.

Retain four quarter-turn views. Let continuous camera zoom settle naturally; forcing it to an integer magnification can visibly jump the player's framing. Crispness comes from consistent antialiasing and stable line widths, not pixel snapping every camera.

First rendering tier: simple lit prisms and roofs, shader windows, no bloom, real-time shadows or full-screen edge pass. Use inexpensive facade borders and selected silhouette edges; suppress fine lines at distant zoom. A quality tier may add depth/normal outlines if measured benefits justify it.

Use a spatial index and ray tests against visible building volumes for picking. Ground-parcel hit tests alone can select the wrong structure behind a tall tower. The image fallback uses baked frontmost ID masks for the same camera, or explicit pins/list selection; an ID mask and image must share a version.

## LC12 — Scale visible detail, not loaded world size

A 50,000-building city does not require 50,000 fully detailed buildings resident on the phone. Stream the visible neighborhood, one small prefetch ring, and a coarse city representation.

- **Near:** full simple parts, shop signs and selected details; labels have a bounded count.
- **Middle:** one simplified building envelope, minimal windows and no tiny props.
- **Far:** coarse district geometry first. Depth-aware baked representations may follow if measurement justifies their complexity.
- **Wallpaper:** a static public skyline image with no city animation loop. Personal highlights are a private local overlay.

Flat chunk images can overlap incorrectly with tall geometry. If used, include consistent depth and adequate image padding, or replace whole coherent far regions rather than alternating sprites and nearby towers arbitrarily. Four rotations, day/night palettes and changing buildings multiply atlas storage; this is not free memory.

Prototype with a bounded working set, initially **at most 12,000 visible building parts** and **two million canvas pixels**. These are starting quality limits, not validated device capacities. Adjust resolution and detail before eliminating useful buildings. Benchmark window shader aliasing at distant zoom as well as triangle count.

Use typed buffers rather than one large JavaScript object tree per building. Evict decoded detail and GPU resources under measured memory pressure; distinguish a tiny market-attribute update from rebuilding geometry. A default three.js instance matrix alone stores 16 float32 values, so the source's 32–48-byte custom attributes are not a complete per-instance memory estimate.

Batch by spatial cluster and part/material family. Chunk culling and accurate bounds matter; ten draw calls for a whole city is not an assumption we should promise. Measure total render targets, atlas/depth storage, decoder buffers and temporary upload allocations. MDN recommends explicit resource management, batching and smaller back buffers. [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

Redraw on camera, selection and visible published-state changes. Disable ambient animation by default on phones; a desktop quality setting can animate restrained water or traffic. Hidden, minimized and fully occluded views draw zero frames. Broker focus stops city ambience. Reduced motion stops autonomous movement. [Rendering on demand](https://threejs.org/manual/pages/rendering-on-demand.html).

Choose quality from sustained frame behavior, not a two-second device guess. Use hysteresis so detail does not oscillate; respect an explicit user override. Handle WebGL context loss with a cached image and usable list.

## LC13 — Streets: designed skeleton, procedural neighborhoods

Tensor fields are a suitable direction guide, not proof of the uniquely best generator. The original research combines field guidance with graph editing and constraints; that supports a constrained hybrid for this project. [Chen et al., 2008](https://www.sci.utah.edu/~chengu/street_sig08/street_project.htm).

1. Establish the coast, port basin, hills, protected land, major crossings and landmark axes as the city's recognizable skeleton.
2. Create a historic core from short connected extensions around old centers, quays and squares. Prefer winding routes and small uneven blocks within explicit access constraints.
3. Trace planned extensions along tensor-field grid, boundary and contour directions. Preserve the old network rather than smoothing it into the new grid.
4. Add graph-level constraints: crossings, connected arterial routes, maximum unserved block size, intersection angle limits and transit frontage.
5. Subdivide ordinary blocks with frontage-preserving oriented splits. Use a robust irregular-block fallback with courts and pedestrian access before attempting a comprehensive straight-skeleton implementation.

The parcel research provides both OBB and skeleton-based approaches; it does not require every irregular parcel algorithm on day one. [Vanegas et al., 2012](https://www.cs.purdue.edu/cgvlab/www/resources/papers/Vanegas-Eurographics-2012-Procedural_Generation_of_Parcels_in_Urban_Modeling.pdf).

Walkable access counts where a city is intentionally pedestrian. Meridia should not need a car street at every shop. Model legal road, footpath and canal access separately. Real rivers require basin-scale planning; independent per-chunk flow accumulation will not reliably produce matching water networks.

Keep Wave Function Collapse out of road topology and parcel ownership. Later it could help bounded roof-detail combinations if a simpler seeded grammar proves insufficient.

## LC14 — Generation regions and render chunks are different

The proposed 128 m tile is useful for streaming, but too small to own every road face or long waterfront parcel. Generate topology over coherent **district regions**, initially roughly 512–2,048 m across depending on morphology. Partition the completed output into small render/transport chunks afterwards.

Canonical region boundaries reserve crossing coordinates, street class, width, elevation and water edges. Adjacent generation consumes those contracts. A block or building crossing a transport boundary has one authoritative owner and references from other chunks; never independently regenerate its two halves.

Use a separate seeded stream per city, region, stage and persistent feature. Sort candidate work and event inputs canonically. Persist feature IDs at creation; IDs based on mutable array positions will not remain stable when another street is inserted.

Fixed-point positions and robust intersection predicates control topology. Pin the generator package, dependency versions, coordinate conventions and runtime. A pinned Node version by itself does not establish determinism across every library, architecture or event ordering.

Client-only previews may consume a sandbox fixture or server-generated plan. They cannot create persistent parcel identities or bypass assignments. Pure generator unit tests may run elsewhere; production authoritative topology is persisted on the server.

## LC15 — Version the world without changing its addresses

| Record | Minimal fields / responsibility |
|---|---|
| **City manifest** | World ID, city ID, macro-plan version, state version, public snapshot time, chunk references, schema and generator package IDs |
| **Static region/chunk** | Content hash, persistent feature IDs, geometry, public district/use labels and cross-boundary references |
| **Public state** | Permitted lifecycle/appearance overrides and public binding IDs, revision and effective publication time |
| **Private overlay** | Own eligible asset references and highlights; isolated from public city state and exports |
| **Transition** | Stable event ID, affected feature, allowed public cause, old/new visual state, published time |

Persistent parcel IDs do **not** contain the generator version. The generator and schema versions belong to the manifest/artifact. Rebuilding a file must not break an address, bookmark, ownership mapping or public link.

Persist generated topology rather than depending on replay to recreate it forever. New generator packages apply only through reviewed new-region boundary contracts or explicit migrations. A migration is dry-run, preserves bindings, validates access and records changes; it is not “serve the new chunk and hope.”

Publish static artifacts first, then atomically advance the public manifest/state that references them. Retain the prior snapshot for interrupted clients. Deltas identify their base version; a missed or evicted base requests a snapshot. Bound history and delta sizes. Snapshots and updates are idempotent and recoverable after a worker crash.

Store a per-chunk record of generator provenance when versions coexist. Do not assume a single city-level generator number accurately describes all historical regions.

## LC16 — Privacy is a publication contract

Build the public city payload from an allowlist, not by removing suspicious fields from internal world objects. A new owner-to-building association can reveal information even when owner and building records were separately public.

Require explicit publication permission for **each field, association, derived appearance and retained history**. Crown shape, lit windows, labels, vacancy, traffic, construction and archives all count as disclosures. “Public data only” must apply to the input and to what the transformation enables people to infer.

- No positions, orders, trading style, private balance, private company operating data, login patterns or inferred last-seen time.
- No building darkness caused by one player going offline or changing a private position.
- No automatic bankruptcy name or failure explanation beyond the permitted public event.
- No fine-grained district activity from a small private cohort. Begin with already-public signals; any later aggregate needs an approved release policy and inference testing, not just a minimum-count claim.
- Personal homes/collections and public city representation have separate consent controls. Disabling future display anonymizes the relevant current presentation; it cannot retract screenshots or establish that previous public disclosures never occurred.
- My City uses the player's authorized private data in a separate local overlay. It never enters public artifacts, shared caches, telemetry labels or a default skyline export. Exports strip it unless the player deliberately chooses otherwise.

Privacy tests compare two internal worlds with **identical authorized public records but different private trades, orders and activity**. Their public city artifacts must be identical. Also probe historical differences, low-population districts, repeated snapshots, opt-out inference and CDN/manifest access.

Daily-close wealth buckets alone are insufficient: repeated bucket crossings and rank/location associations can add information. LC10 avoids adding a second financial measurement and still requires review of the underlying board disclosure.

## LC17 — Public versions reduce traffic; they do not eliminate cost

Retain the source's version-stamp approach if the target branch supports it. A new stamp adds some bytes and fan-out work, and new panel requests add load. Report that overhead honestly rather than claiming “nothing to the tick.”

Publish a cacheable public city snapshot once, then serve it to viewers. Prefer public HTTP snapshot/delta delivery through the existing supported cache layer; if the actual platform requires WebSocket requests, reuse its proven panel protocol. Send no private overlay through the public path.

Coalesce changes and avoid fetching hidden views. Refresh a wallpaper only when needed, with versioned assets and randomized request staggering. A simultaneous close can otherwise make thousands of clients request the same state and bake.

Bound daily work with dirty-region queues, generation quotas and batched publication. Workers never block market ticks. Cosmetic appearances may lag the authoritative event; the card links to the current game data and clearly marks a pending city update.

Keep emergency storefront capacity in already-serviced buildings. If no eligible slot exists, reserve the purchased business for placement and expose a deterministic pending-location state; do not block an authorized purchase on synchronous city generation. Sale, rollback and redeployment cancel or reuse that reservation without duplicate assignments.

Use a cached static image for fallback and a list for interaction. Bake one updated skyline per dirty city first, not every rotation of every chunk after each version. Full headless baking is a separate measured operating cost.

Total world storage cannot stay flat while unique cities and history grow. The achievable target is bounded **per-client resident detail**, incremental work per dirty region, and predictable retention/storage growth.

## LC18 — Test coherence rather than maximum randomness

The source's orientation entropy and adjacent-building uniqueness metrics are useful diagnostics, but should not be unconditional pass criteria. Historic terraces often repeat facades; a planned grid has deliberately low orientation entropy. Randomizing both can make a city worse.

**Structural invariants:** no unintended overlap; valid frontage/access for the permitted transport mode; no unsupported buildings; legal slopes; stable bindings; region seams; connected serviced land; and preserved owned assets through decline/recovery.

**Morphology checks, per district personality:** distributions of block area, frontage, setbacks, floor heights and void space; arterial connectivity; excessive tiny slivers; unjustified dead ends; waterfront access; transitions between industrial, historic and tower zones. Protect intentional parks, courtyard blocks and narrow lanes with explicit tags.

**Visual checks:** silhouette and landmark visibility from approved cameras; skyline peak locations; height continuity; excessive repeated large footprints; occluded signs; illegible small windows; intersection noise; scenery after all four rotations. Compare against a small curated reference family for each city rather than a single universal “realism score.”

Run determinism and invariants over at least 100 seeds per personality as an initial test batch, plus adversarial coastlines and saved failing seeds. A seed count is coverage, not proof.

Human review remains a release gate. Show unlabeled greyscale shots to testers, with the five identities available, and target 80% identification as an initial art-direction goal. Ask beginners to find their shop and explain what one visible change means. A visually credible city must also be understandable.

## LC19 — A focused release, followed by evidence

| Step | Concrete deliverable | Gate before continuing |
|---|---|---|
| **A — Art direction** | Three fixed Port Avalon compositions: harbor/skyline, first-shop street, redeveloped docks | Mathis accepts the look and scale; addresses and readability work |
| **B — Representative prototype** | One district scene with tall occluders, real selection, public fixtures, facade variation, and image fallback | Physical Android/iPhone/laptop measurements and usable picking; correct 2:1 projection |
| **C — First playable slice** | Port Avalon City app, first address, My places, companies/assets, district cards and public context links | Beginners find an asset and reach its ordinary action; no forced tutorial or Broker interference |
| **D — Published change** | Public events, pending placement, construction, closures, brief and bounded then/now history | Publication contract, restart/replay and concurrency checks; target branch load gate passes |
| **E — Wider world** | Other city personalities, sustained growth, recognition and selected cosmetic sinks | Recognizable cities; long histories, recovery and economic isolation validated |

The first update candidate is **A–D in Port Avalon**, with a small free facade set. It can ship without a full global growth equation, a paid sponsorship marketplace, advanced weather, a road-building editor, a household simulation or a custom WebGL engine. These larger systems should earn their scope through evidence.

No calendar estimate is defensible until the target branch, disclosure rules, art workload and prototype costs are known. This sequence complements the source's phases; it does not silently replace the existing roadmap.

## LC20 — What would justify putting this in the game?

Proposed acceptance evidence:

- **Player value:** in a small formative test, at least 8 of 10 beginners find their business and reach management without assistance; returning players can name a meaningful public change and its source. Report observations, not statistical certainty from ten people.
- **Trading isolation:** instrument existing Broker interactions with City closed, visible and streaming. Investigate any regression beyond a proposed 5% p95 interaction-time margin; no long task over 50 ms attributable to city decoding or upload. Repeat under constrained network and rapid window switching.
- **Performance:** retain the source's 60 fps target on a specified mid-range phone. Measure p95 frame intervals around the 16.7 ms target during representative panning, plus sustained ten-minute thermal behavior. If it fails, reduce detail/resolution or use a declared 30 fps tier. Desktop CPU throttling is a regression aid, not phone proof.
- **Idle and recovery:** zero city frames while hidden/fully occluded; no ongoing ambient work under reduced motion; graceful context loss, cold cache, interrupted downloads and memory pressure.
- **Memory and payload:** measure incremental City heap/GPU allocations against the source's proposed 40/80 MB budgets. Record bundles, transfer, first useful frame and request bursts with an explicit cache/network state. Do not repeat estimated library size, browser support percentage or payload ranges as facts.
- **Server:** rerun the actual 4,000-client gate if it exists on the target branch, including synchronized city publication, wallpaper refresh, retries and new-region jobs. Compare against the same world without City enabled.
- **Privacy:** LC16 paired-world tests plus specialist inference review. Verify entity links and all four views, not just visible JSON keys.
- **Persistence and economy:** simulate a 365-game-day public history with growth, crashes, recovery, transfers, opt-out, worker restart and generator upgrade. Cosmetic purchases must preserve balances under existing accounting and must not alter demand, yield, rank calculation or trade outcomes.

**The decisive product test:** does the player voluntarily return because this place tells them something useful and represents something they built? If it only produces an attractive wallpaper, keep it as a wallpaper feature and reconsider the larger simulation cost.

## Replies to the source document's ten review questions

| Question | Recommendation | Detail |
|---|---|---|
| 1. Rendering | Start with direct three.js, orthographic instancing, cheap facade edges; correct the elevation to 30° | LC11–LC12 |
| 2. Street networks | Constrained macro skeleton + historic connected growth + tensor-guided planned extensions | LC13–LC14 |
| 3. Personalities | Distinct coastline, skyline silhouette, transport pattern and settlement history | LC04 |
| 4. Growth | Fixed geography, adaptive eligible developments, separate demand/capacity, persistent decline/reuse | LC07–LC08 |
| 5. Economy binding | Stable parcel/building/unit identities; public events determine physical change; map links to existing actions | LC05–LC06, LC16–LC17 |
| 6. Status and spending | Attainable shop identity, optional legacy, fixed public-snapshot recognition and cosmetic-only purchases | LC01, LC09–LC10 |
| 7. Scale | Bound visible detail and pixels, stream/evict, cache public snapshots and cap worker work | LC12, LC17 |
| 8. Determinism/versioning | Persist authoritative topology, canonical seams, stable feature IDs, versioned artifacts and explicit migrations | LC14–LC15 |
| 9. Real-city quality | Personality-specific morphology checks, silhouettes, coherent history and human recognition tests | LC18, LC20 |
| 10. What's missing | Belonging before riches, lasting addresses, permitted then/now history and quiet relevant changes | LC01–LC03 |

## A sample player story

You open a small shop in Old Harbor. Its awning is modest, but its address is yours to remember. The City app becomes one way to reach the business you already own.

Later, a published waterfront project completes. You inspect its public announcement, visit the new frontage, and open the existing property panel. Whether buying there is worthwhile depends on the actual economy, not a fabricated map bonus.

You eventually sell the shop. The building stays. A new sign appears under the allowed disclosure rules. Your private My beginnings bookmark still takes you to the same doorway.

Years later, a headquarters carries your company name across the harbor. At its base, an optional eligible plaque points back to your first address. You have not just accumulated a number: you have built a recognizable presence in a world that kept going around you.
