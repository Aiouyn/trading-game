# 06 — Living Cities: procedural isometric cities that grow with the economy

Status: plan for review (2026-10-13). Author: Claude Opus 5.5 session "Player monetization and cosmetics", for Mathis.
Audience: Mathis, the V1 tech and UX sessions, and an outside reviewer (GPT 6.1 Sol) asked to make proposals.
Branch rule: nothing here is built until `ux/overhaul` has merged into `v1` (merge freeze, 2026-10-13).

---

## 0. How to read this (for the reviewer)

Port Avalon is a multiplayer trading and empire game that runs in the browser and later on phones (Next.js 16, React 19,
zustand, a Node world server over WebSocket, `lightweight-charts`). Players start with $5,000, trade about 120 fictional
listed companies, buy businesses and property in fictional cities, found companies, train AI, hack each other and climb a
global leaderboard. The interface is a fictional desktop OS called **Quay**, styled **Ink & Brass** (dark ink, brass
accent, mono numbers, serif headlines).

This document proposes the **Living Cities**: five procedural cities drawn in isometric projection. Each city is
generated from math, not placed by hand. It grows as players and companies arrive and shrinks when they leave, and its
buildings are the real companies, shops and players of the game. Every section ends with **open questions**, where
proposals are wanted most. Section 15 collects them.

Facts you can rely on (from the code on branch `v1`):

- `src/engine/universe.ts` `CITIES` already defines six places with districts and tiers (`working | mid | prime | trophy`):
  Port Avalon (Eastside Docks, Old Harbor, Midtown, Gilt Hill), Nordhaven City (Fjord Quarter, Gamla Town), Meridia (Grand
  Canal, Business District), Sundara Coast (Palm Bay, Sunset Strip), Kaiyo City (Shinbashi Heights, Neon Ward), Isla Serena
  (The Cays, trophy only). Cities unlock by rank (R0, R2, R2, R3, R3, R4).
- Each listed company has a `region` (avalon, nordhaven, meridian, sundara, kaiyo), so every company has a home city.
- Businesses (`src/world/assets.ts buyBusiness`) and properties (`buyProperty`) carry `cityId` (and `districtId`), and each
  district has a live **district index** (100 = par) that prices real estate.
- City demand multipliers already exist (`CITY_DEMAND`).
- The public Net Worth board is computed in `src/world/boards.ts` (top N, on the rank basis).
- Privacy is a locked rule (`docs/V1-PRIVACY.md`): market positions, orders, P&L curves and trading style are never shown.
  Business and property purchases are public records, and so are profile holdings.
- Load rule R-9-12: the per-tick push carries only small version stamps for public panels, and a client fetches a panel
  on demand when it is open and its version moved. The 4,000-client load gate (R-9-8b) must keep passing.
- Determinism: the engine uses a seeded xoshiro128** with one stream per asset. World state is reproducible.

---

## 1. The vision in one page

**You look out of your office window and the city is the market.**

- Every listed company has a headquarters tower in its home city. Its height comes from its market cap, and its windows
  light up on a good day and go dark in a sell-off. On a crash day the whole financial district dims at once, and anyone
  can see it.
- Every business a player buys is a real storefront on a real street, with the player's shop name on the sign.
- Districts get taller, newer and brighter as their district index rises, and shabbier as it falls.
- **The city grows with its population.** New players and new companies push roads and buildings out from the edge. A
  city where many players live becomes a megacity, and a city players leave gets empty windows and "To let" signs.
- **The skyline is the leaderboard.** In each city's crown district, reserved parcels hold the towers of the richest
  players of that city, and the tallest tower is the city's number one.
- **Five cities, five personalities.** A harbor capital, a fjord city, a canal city, a coastal boom strip and a neon
  megacity. They come from the same generator with different settings, so each feels designed, and none of them repeats
  itself.
- It runs on a cheap phone. The look is isometric 2.5D and flat-shaded, so no heavy 3D engine is needed. Heavy work happens
  once on the server, and the client only draws.

Why it matters: it turns abstract numbers into a place. Wealth becomes visible to others, which status needs. It gives a
reason to move cities ("Kaiyo is booming, the docks are cheap"), and it makes the server's activity something you can see
and want to be part of.

---

## 2. Design pillars (rules every proposal must respect)

1. **Readable as a city at a glance, never predictable.** Familiar structure (avenues, blocks, a downtown, a waterfront)
   with variation at every scale. No visible grid repetition and no "copy-pasted" buildings.
2. **Everything is real.** A building exists because something in the economy exists: a company, a business, a property,
   a population level, or the NPC base economy. No pure decoration taller than three floors without a game reason.
3. **Stable world.** A building never jumps to another place. Growth adds, decline darkens and decays, and redevelopment
   replaces in place. Players learn their city's geography and keep it.
4. **Deterministic and authoritative.** The same seed and the same history give the same city on every device. The server
   decides geometry and assignments; the client never invents them.
5. **Cheap to run.** No new per-tick traffic. On a mid-range phone the City view holds 60 fps while panning and costs
   nothing while idle. Generation cost is paid once per chunk, on the server.
6. **Privacy first.** The city shows only what is already public (section 10).
7. **Trading first (Quay rule 2).** The city never slows a trade. The Broker never waits on the city, and the city never
   gives a trading advantage (it shows public data only, no earlier than the Wire shows it).
8. **Ink & Brass.** Flat shading, thin ink outlines, a restrained palette, and brass is earned (lit windows, landmarks).
   No sound (Mathis locked it). Respect reduced motion (`src/components/os/motion.ts`).

---

## 3. What "isometric" means here, and the rendering decision

### 3.1 Projection

- **Dimetric 2:1** ("pixel isometric", as in SimCity 2000, Townscaper and most iso games): the camera is rotated 45° around
  the vertical and tilted down by atan(1/2) ≈ 26.565°, so a ground tile is a 2:1 diamond. It's crisp on screens, and lines
  snap to clean pixel steps at integer zooms.
- **Four view rotations** (north, east, south, west) in 90° steps, so players can see behind tall towers. Free rotation is
  not needed.
- **Zoom** between about 0.25× (whole city) and 4× (street level), in continuous steps, with snapping to integer
  pixel scales when the camera stops, so it stays crisp.

### 3.2 Rendering approach: recommendation

Three options were considered:

| Option | How | Pros | Cons |
|---|---|---|---|
| A. Baked sprites (classic 2D iso) | Each building is rendered once into a sprite atlas, then drawn back to front with depth sorting by tile | Pure 2D, very crisp, works with Canvas2D | Depth sorting of multi-tile buildings is a known pain; four rotations need four atlases; growing buildings need re-baking; big atlases eat phone memory |
| **B. Orthographic WebGL2 with instanced prisms (recommended)** | Real 3D boxes and simple roof shapes, drawn with an orthographic camera at the dimetric angle; one instanced draw per part type; windows, materials and lights done procedurally in the fragment shader | The depth buffer solves sorting; rotation and zoom are free; tens of thousands of buildings in a handful of draw calls; growth and lights are just per-instance attributes | Needs WebGL2 (about 97%+ of devices); custom shaders to write |
| C. Full 3D engine (Babylon, full three.js scene with lighting and shadows) | General 3D | Maximum freedom | Heavy bundle, heavy GPU, against pillar 5 |

**Recommendation: B.** It looks exactly like a 2D isometric illustration (orthographic, flat-shaded, outlined) but is
drawn by the GPU like a tiny 3D scene. The library choice is:

- **three.js**, lazily loaded only when the City app or the city wallpaper opens (dynamic `import()` inside a client-only
  component; check `node_modules/next/dist/docs/` for the Next 16 way of doing client-only dynamic imports). Use
  `InstancedMesh`/`InstancedBufferGeometry` plus a custom `ShaderMaterial`. Tree-shaken it costs roughly 150 kB gzipped.
- Or a hand-written WebGL2 renderer of about 1,500 lines if the bundle or the control matters more. The renderer must sit
  behind a small interface (`CityRenderer`) so it can be swapped.

### 3.3 Render tiers (automatic, with a setting to override)

| Tier | When | What it draws |
|---|---|---|
| T0 Picture | No WebGL2, "battery saver", or the desk wallpaper | A pre-rendered image of the city (rendered by the server-side bake, section 8.4) for the current state version, plus a lightweight Canvas2D overlay for taps and labels |
| T1 Light | Low-end phones (GPU tier detection, or under 45 fps measured in the first 2 s) | Boxes and roofs, procedural windows without per-window lighting, no outline pass, no water animation, impostors (section 3.5) beyond 1× zoom |
| T2 Full | Everything else | Outline pass, per-window lighting, animated water, construction cranes, traffic dots, day/night |

### 3.4 Drawing a building in the shader (the core trick)

A building is made of 1 to 4 **parts** (podium, shaft, setback, crown), each an instance of a few base meshes: box,
gabled roof, hipped roof, dome, cylinder, spire, cantilever. Per-instance attributes (packed into 32 to 48 bytes):

```
position (x, z), base y, size (w, d, h), rotation (quantized), styleId (u8), seed (u32),
floorHeight, bayWidth, litRatio (0..1, from the game), state flags (construction, vacant, derelict, owned-by-me, selected),
tint (u8 palette index)
```

The fragment shader computes, from the face's local coordinates:

- the **window grid** (floor height × bay width per style; curtain wall, punched windows, ribbon windows, shutters,
  shopfronts on the ground floor),
- **which windows are lit**: `hash(seed, floor, bay) < litRatio`, with smoothing so lights come on and off a few at a time
  rather than all at once,
- the material: brick, stone, glass, concrete, timber, painted plaster, using flat colours from the city palette plus a
  tiny procedural texture (courses, mullions),
- ink edges: a cheap screen-space pass on depth and face id (T2 only), or baked edge lines on part silhouettes (T1).

Benefits: one building costs one to four instances. A 30,000-building city is about 60,000 instances, which is roughly 10
draw calls. No textures per building, so memory stays flat.

### 3.5 Level of detail (LOD) and impostors

- **Chunks**: the city is cut into 128 m × 128 m chunks (section 8). Each chunk has three LODs: full parts; merged boxes
  (one box per building, no roof props); and an **impostor**, a pre-rendered image of the chunk for each of the 4
  rotations, used beyond a zoom threshold.
- Frustum culling per chunk. Roof props (water tanks, AC units, antennas, helipads, gardens) only render at zoom ≥ 1.5×.
- The far city (the desk wallpaper, the whole-city zoom) is mostly impostors, so the GPU load is flat however big the city
  gets.

### 3.6 Frame pacing

- **Render on demand.** Redraw only when the camera moves, when city state changes, or for a slow ambient loop (window
  flicker, water) at 10 fps or below in T2, never in T1.
- Pause entirely when the window is hidden, minimized or covered (Page Visibility, plus the Quay window manager's own focus
  state).
- Budgets on a reference mid-range Android phone (for example a 2021 Snapdragon 7-series device): ≤ 8 ms GPU and ≤ 4 ms
  JS per frame while panning, ≤ 1.5 s to the first city frame on 4G after the bundle is cached, ≤ 80 MB GPU memory, ≤ 40 MB
  JS heap for the City view.

**Open questions (3):** three.js or a hand-written renderer? True dimetric or another angle? Is the edge pass worth its
cost on phones, or should edges be baked into geometry? A better LOD scheme for very large cities?

---

## 4. The generator: from a seed to a city

The generator is a **pure TypeScript module** (`src/city/gen/`) with no DOM, no Math.random and no time calls. It takes a
city's **personality** (section 5), a seed, and a chunk coordinate, and returns data, never pixels. It runs on the server
(section 8). It must be deterministic on the server's Node version; the client never re-runs topology-changing steps (see
8.2 on floats).

The pipeline is hierarchical, like real cities: geography first, then the big roads, then blocks, parcels and buildings.

### 4.1 Stage 1 — Terrain and water

- **Height field**: domain-warped fractal noise (fBm with 4 to 6 octaves, warped once by another noise field). This gives
  ridges and valleys that look geological rather than bubbly. The personality sets amplitude and roughness: Nordhaven is
  steep, Sundara gently sloping to the sea, Kaiyo nearly flat with reclaimed land.
- **Coastline**: a signed-distance shape from the personality (a bay, a fjord, a lagoon, a long beach, a delta), perturbed
  by noise at two scales so it has coves and headlands without being random mush.
- **Rivers and canals**: rivers by flow accumulation on the height field (steepest descent from sources to the sea) with
  smoothing; canals (Meridia) as a separate network grown along the minor street field (Stage 2) and cut into the ground.
- **Protected land**: parks, cliffs, beaches, wetlands. Steep slopes (above a personality threshold) become parks or
  stairs, never towers.

Outputs: a height grid (2 m resolution), a water mask, and a slope mask, all per chunk with overlap so the edges match.

### 4.2 Stage 2 — Streets: tensor fields (the heart of "familiar but surprising")

The street network uses **tensor-field street modeling** (Chen, Esch, Wonka, Müller, Zhang, "Interactive Procedural
Street Modeling", SIGGRAPH 2008). It's the best known way to get a network that looks designed and organic at once.

- A **tensor field** gives two orthogonal directions at every point of the map (major and minor). Streets are
  **hyperstreamlines** traced along those directions.
- The field is the weighted sum of **basis fields**, each with a center and a decay:
  - **grid** fields (a direction θ): Manhattan-style blocks;
  - **radial** fields (a center): rings and spokes around a harbor, a plaza or a hill;
  - **boundary** fields: aligned with the coastline, rivers and contour lines, so streets follow the shore and climb hills
    along the slope;
  - **heightmap** fields: roads cross slopes at gentle angles.
- The personality chooses the basis fields, their weights and their decay radii. That one choice gives each city most of
  its character (section 5).
- Tracing order mirrors real cities: **arterials** first (seeded from the old center, the port, the bridges), with a long
  separation distance; then **collectors**; then **local streets** with a short separation distance. Each level stops at
  water, at steep slopes and at existing roads, with snapping to the nearest node within a tolerance (no tiny slivers or
  near-parallel duplicates).
- **Orientation quantization (the iso trick).** Isometric art looks best when buildings line up with the view axes. Each
  district has a quantization rule: strict (snap streets to 0°/90°, as in Midtown or Kaiyo's reclaimed land), soft (snap
  within ±8°, so slight bends remain, as in Old Harbor), or free (Gilt Hill's winding roads, Meridia's canals). Mixing
  strict and free districts is what makes a city look both orderly and alive.
- **Special elements** added as constraints before tracing: diagonal boulevards cutting the grid (one or two per city),
  bridges at narrow water crossings, an elevated rail loop (Kaiyo), a coastal highway spine (Sundara), quays along the
  water (Avalon, Meridia).

Outputs: a planar road graph with a class per edge (highway, arterial, collector, local, alley, pedestrian, canal, rail).

### 4.3 Stage 3 — Blocks and parcels

- **Blocks** are the faces of the planar road graph, minus the road widths (offset polygons). Blocks smaller than a
  threshold become plazas or pocket parks; very irregular leftovers become parks.
- **Parcels** subdivide each block with the method of Vanegas, Kelly, Weber, Halatsch, Aliaga, Müller ("Procedural
  Generation of Parcels in Urban Modeling", Eurographics 2012): **oriented-bounding-box splitting** for regular blocks
  (recursive split along the long axis until target width and depth are met, keeping street frontage) and
  **straight-skeleton parcels** for deep or irregular blocks (strips along each street edge, with interior lots as
  gardens or courtyards).
- The personality sets the target frontage width and depth per district tier (Kaiyo: 6 to 12 m frontages; Gilt Hill: 40 to
  80 m; Eastside Docks: long 60 to 150 m warehouse lots), with log-normal jitter.
- Every parcel must touch a street. Parcels get a stable id `cityId:chunk:block:index` (section 8.3).

### 4.4 Stage 4 — Land value and zoning (what goes where)

A continuous **land value field** decides heights and uses, like real cities:

```
V(p) = Σ_centers  A_c · exp(-d(p, c)² / (2 σ_c²))        # downtown peaks (CBD, old core, secondary centers)
     + w_water · view(p)                                 # water frontage and sea view (ray-cast over the height field)
     + w_hill  · elevation(p) · prestige(district)       # old money on the hill
     + w_transit · exp(-d(p, nearest station)/λ)         # transit and arterials
     + district_offset(district) + noise(p) · ε          # personality, plus correlated noise so it is not smooth
```

- **Districts** are the existing `CITIES[...].districts`, laid out by the personality's district plan (a seed point, a
  preferred terrain such as "waterfront", "hill" or "flat center", and a target area). District borders follow streets
  (a block belongs to one district), giving natural neighbourhoods rather than Voronoi cells.
- **Zoning** from V and the district: residential (houses → row houses → mid-rise → high-rise), commercial (shops →
  offices → towers), industrial (warehouses, plants, port), civic (stations, museum, city hall, stadium), green. The
  ground floors of commercial parcels are **storefront slots**: this is where player businesses go (section 6.2).
- **Live coupling**: the game's **district index** multiplies V for that district every game day. A district players invest
  in rises in value, and its buildings get taller and newer when they are redeveloped (section 7.4).

### 4.5 Stage 5 — Buildings: a small shape grammar

Each parcel gets a building from a **shape grammar** inspired by CGA (Müller, Wonka, Haegler, Ulmer, Van Gool, "Procedural
Modeling of Buildings", SIGGRAPH 2006), simplified to what the shader can draw:

```
Lot      → Podium(h_p) Shaft(h_s) Crown          (towers)
         | Body(h) Roof                           (houses, row houses, mid-rise)
         | Shed(h) SawRoof                        (warehouses, plants)
Podium   → fills the lot, setback 0, shops on the ground floor
Shaft    → inset 10–30%, optional setbacks every k floors (art-deco wedding cake), optional twist (Kaiyo)
Crown    → flat | spire | lantern | stepped | dome | helipad | antenna cluster | garden
Roof     → gable | hip | mansard | flat with props | sawtooth
```

- **Height** is drawn from a log-normal distribution whose median follows V (and the district index), clipped by the
  personality's height cap and slope rules. That gives the real-city pattern of a few very tall towers and many low
  buildings.
- Heights are **spatially correlated**: neighbours are similar (a low-frequency height noise on top of V), with
  occasional outliers (a lone tower in a low district, a church in the CBD).
- **Variation without repetition**: every parcel has its own seed. Floor height, bay width, window style, material,
  setback rhythm and roof props all vary within the district's style range. Each district has 6 to 10 archetypes, each
  with parameter ranges, and the same archetype appears with different parameters.
- **Landmarks**: one per district, chosen from that city's landmark set (section 5), placed on the best parcel of the
  district (highest V, frontage on a square or the water). Landmarks are partly handmade templates with procedural
  details, because recognisable landmarks are what make a city memorable.

### 4.6 Stage 6 — Life (cheap, T2 only)

- Trees along streets and in parks (instanced billboards or cones, by personality: palms, pines, plane trees, cherry
  trees, birches).
- Traffic: dots moving along arterials, density proportional to the city's activity (a simple flow along the graph, purely
  cosmetic, client-side, seeded).
- Boats in harbors and canals, trains on the Kaiyo loop. Paused under reduced motion.
- Weather and seasons later (snow in Nordhaven, rain in Avalon), as a palette and particles layer.

**Open questions (4):** better street algorithms than tensor fields for our case (for example agent-based growth, Parish
and Müller's L-systems, or space colonization)? How to make each city's core feel "historic" (grown earlier) and the edges
"planned later" in the same run? A better parcel method for very irregular blocks? Should we use Wave Function Collapse
for small-scale detail (rooftops, Meridia's lanes)?

---

## 5. The five cities and their personalities

All five use the generator above. A **personality** is a data file (`src/city/personalities/<cityId>.ts`) with:
terrain, coastline, basis fields, orientation rules, block and parcel sizes, height distribution and cap, district plan,
archetypes, landmarks, palette (day and night), trees, life, and growth behavior.

Summary:

| | Port Avalon | Nordhaven City | Meridia | Sundara Coast | Kaiyo City |
|---|---|---|---|---|---|
| Bloc / currency | Federal Union, FDL | Nordic Alliance, NKR | Euran Compact, EUN | Southern Coalition, SRL | Pacific League, PYN |
| Shape | Crescent bay with a harbor core | A fjord splitting the city, steep sides | A lagoon with islands and canals, a modern mainland edge | A long beach strip with a bay and hills behind | A dense flat bay city with reclaimed land |
| Street feel | Radial old core + a strict grid downtown + winding hill roads | Streets follow contours; few long straight streets | Organic lanes and canals on the islands; a strict grid across the water | One coastal spine, short grids behind it, curving bay roads | Tiny irregular blocks in the old wards; perfect grids on reclaimed land; an elevated rail loop |
| Height profile | One strong CBD peak, a medium wall of towers | Low everywhere, cap ~60 m except a few glass landmarks | Low historic core (cap ~25 m), a separate tall business cluster | Spiky: scattered towers, many cranes, low strip | Very tall and dense, many mega-towers, the highest cap |
| Mood | Brick, slate, brass lights, fog | Timber, painted facades, snow, long blue nights | Stone, terracotta, domes, golden hour | White concrete, glass, palms, neon after dark | Glass, steel, signage, rain, endless lit windows |
| Growth style | Steady, balanced | Slow, very stable (low vol) | Slow in the core, fast in the business district | Fast booms and busts (high vol) | Fast, upward rather than outward |

### 5.1 Port Avalon (the harbor capital, R0, where everyone starts)

- **Geography**: a crescent bay facing the sea, a river entering at the east, a hill (Gilt Hill) to the north-west.
- **Districts** (from `CITIES`):
  - *Eastside Docks* (working): long warehouses and cranes along piers, rail spurs, lofts being converted (the warehouse
    archetype has a "converted" variant that appears as the district index rises).
  - *Old Harbor* (mid): radial streets around the old port basin, soft orientation, brownstones and brick row houses,
    cobbled quays, a customs house landmark.
  - *Midtown* (mid, the CBD): strict grid, the stock exchange landmark, the tallest towers in the game's starting city.
    This is where most Avalon company HQs stand.
  - *Gilt Hill* (prime): free orientation, roads winding along contours, large lots with mansions and gardens, views over
    the bay.
- **Basis fields**: radial (center: the old basin), grid θ = 0° (Midtown), boundary (the bay shore), heightmap (the hill).
  One diagonal avenue ("the Broadway") from Old Harbor to Midtown.
- **Landmarks**: the exchange, the customs house, a lighthouse, a suspension bridge over the river, the Gilt Hill
  observatory.
- **Palette**: day brick red, slate and sandstone; night warm brass windows and sodium streetlights; frequent fog.
- **Why it works**: it's the familiar "generic great harbor city" (part New York, part Boston, part Liverpool) that new
  players grasp instantly.

### 5.2 Nordhaven City (fjords, design and quiet wealth, R2)

- **Geography**: a deep fjord splitting the city; steep valley walls; small islands at the mouth.
- **Districts**: *Fjord Quarter* (prime): glass houses cantilevered over the water, private jetties. *Gamla Town* (mid):
  steep lanes, painted gabled houses in ochre, red and teal, a cathedral landmark.
- **Basis fields**: boundary fields dominate (streets follow the shore and contours), weak grids on the few flat terraces.
  Stairs and funiculars on slopes too steep for streets.
- **Heights**: low (cap ~60 m), with three or four glass landmarks (an opera house on the water, an energy company HQ, a
  design museum). The low variance matches the bloc's low volatility.
- **Palette**: day timber, white, painted facades, snow on roofs in winter; night a long blue dusk, very warm windows.
- **Growth**: slow and steady; it fills the terraces before climbing.

### 5.3 Meridia (canals, banks and grand hotels, R2)

- **Geography**: a shallow lagoon with a cluster of islands (the old city) and a mainland shore facing it.
- **Districts**: *Grand Canal* (prime): palazzi along a main S-shaped canal, private moorings, piazzas, a domed basilica
  and a bell tower. *Business District* (mid): on the mainland, a strict grid of towers full of lawyers and bankers,
  linked to the islands by a long bridge.
- **Basis fields**: on the islands, a curving field that follows the main canal, with canals traced as streamlines
  first and lanes second (very short separation, many dead ends and small squares); on the mainland, a grid at an angle
  different from the islands' main axis, so the two halves contrast.
- **Heights**: the historic core is capped low (~25 m) except for domes and bell towers; the business district is tall.
  The city's skyline is literally old across the water and new behind it.
- **Palette**: day terracotta, cream stone and green water; night golden hour lingers, lanterns along canals.
- **Growth**: the islands barely change (heritage); new development lands on the mainland and on new reclaimed islands.

### 5.4 Sundara Coast (beaches, boom towns and villas, R3)

- **Geography**: a long straight beach with one big bay (Palm Bay) and hills rising behind the coast.
- **Districts**: *Palm Bay* (prime): villas curving around the bay, private piers, a marina, a hotel tower landmark.
  *Sunset Strip* (working): the beach strip, neon low-rise clubs, hostels and condo towers.
- **Basis fields**: a strong boundary field along the beach (the coastal highway spine runs the whole length), short grids
  perpendicular to the coast behind it, radial curves around the bay.
- **Heights**: spiky and uneven, with scattered condo towers, half-finished buildings and many cranes (the boom).
- **Palette**: day white concrete, turquoise water, palm greens; night magenta and cyan neon on the strip, warm villas.
- **Growth**: fast and volatile, matching the SRL bloc. Booms add many construction sites at once; busts leave
  half-finished towers (a distinctive "ghost tower" archetype) and dark condos.

### 5.5 Kaiyo City (neon, density and towers, R3)

- **Geography**: a flat bay city with a river delta; reclaimed land in the bay (perfect rectangles), mountains far behind.
- **Districts**: *Shinbashi Heights* (prime): mega-towers with sky gardens and penthouses, the tallest in the game.
  *Neon Ward* (mid): tiny irregular blocks, narrow alleys, micro-buildings stacked with signage, arcades.
- **Basis fields**: in the old wards, many small radial and grid fields with random angles at short decay (patchwork
  wards meeting at odd angles); on reclaimed land, one strict grid. An elevated rail loop is placed first as a constraint,
  and density peaks around its stations (the transit term in V is strongest here).
- **Heights**: the highest cap, a very dense distribution, with towers clustered around stations.
- **Palette**: day glass, steel and grey; night electric blue, signage colours, rain reflections on streets (T2 only).
- **Growth**: up rather than out. Redevelopment replaces mid-rises with towers more than the city expands its edge.

### 5.6 Isla Serena (the archipelago, R4): a vignette, not a city

Not a sixth growing city. A small hand-composed archipelago (6 to 12 islands, generated once from a seed and then fixed),
where each island is a **Unique** asset owned by one player (The Cays, trophy tier). Each island shows its owner's estate
(opt-in), helipad and yacht. It's seen from Port Avalon's sea horizon and opens as its own small scene. It's the top of
the status ladder, so its scarcity is the point: it never grows.

**Open questions (5):** stronger, more distinct personalities? Better landmark ideas? Should each city have its own
signature street pattern that players would recognise in a single screenshot? Should future cities (the bible plans 15)
come from new personalities or from mixing these five?

---

## 6. What the buildings are (binding the game to the map)

Every structure has a **source**:

| Source | What appears | Where | Driven by |
|---|---|---|---|
| NPC base economy | The ordinary city fabric: houses, offices, shops, factories | Everywhere, by zoning | City population and NPC GDP (section 7) |
| **Listed company (NPC)** | An HQ tower with its name on the crown | The city of its `region`, best CBD parcels by market cap rank | Height ∝ log(market cap); lit windows ∝ the day's return; scaffolding on a rights issue; dark when delisted |
| **Player company** (company building, Phase 4) | An office building with its name | A commercial parcel in the founder's chosen city | Floors grow with headcount or revenue; an IPO earns a tower in the CBD queue |
| **Player business** (shops, `buyBusiness`) | A **storefront** on a ground floor, with the shop name on the sign | A storefront slot in a district of that city | Sign lit while open; "Closed" when the shop fails; awning style by sector |
| **Property** (`buyProperty`) | An existing building of that type, flagged as owned | Parcels of the matching district and type | The owner's name is shown only where the profile already shows holdings (public record); otherwise anonymous |
| **Top players** (the Net Worth board) | **Crown towers** | Reserved crown parcels in each city's CBD | Section 6.3 |
| Lifestyle | Yachts in the marina, cars in the driveway of the player's home, a helipad | At the player's home property | Opt-in only (6D home room rule) |
| World events | Construction sites, dark districts, festivals, fires | As events happen | Market events, crises |

### 6.1 Company HQs

- Every listed company gets an **HQ slot** in its home city: the K best commercial parcels of the CBD, ranked by V,
  assigned in order of market cap rank. When ranks change, companies **don't move** (stability); instead the building
  grows or shrinks (redevelopment, with construction animation) towards its target height. A company that falls far
  enough relocates only when it moves to a smaller tier, once per game month at most, with a visible "moving" event.
- **Lights**: `litRatio = clamp(0.35 + 4 × dayReturn, 0.05, 0.95)`, eased over a few minutes. On a crash day the whole
  CBD dims at once. That's public data (prices are public) and adds no traffic: the client already has prices.
- Tapping an HQ opens its company card, with a link to its Broker chart. The city becomes another way to browse the
  market.

### 6.2 Player storefronts

- When a player buys a business, the server picks a **storefront slot** in that city: in the chosen district if the UI
  passes one, otherwise by a deterministic rule (hash of the business id over free slots weighted by the district demand).
  Later the player may be allowed to **choose the slot on the map** (a "place your shop" moment, with nicer slots costing
  more, which is a natural money sink).
- The sign shows the shop's name (already moderated by `sanitize`). The awning colour and style follow the sector. The
  storefront's look upgrades with the shop's upgrade axes.
- If no free slot exists, the district grows (section 7): the city literally expands because players opened businesses.

### 6.3 Crown towers: the skyline as the leaderboard

- Each city has **N crown parcels** (for example 12) on the best CBD land, reserved and never used for anything else.
- They hold the **top N players of that city's board**. A player's "city" is their home city (chosen at sign-up, changeable
  once per chapter for a fee). The board already exists globally; a per-city cut is needed.
- Height is a **bucket** of the player's rank-basis net worth (log scale, about 12 buckets from $10M to $100B), taken
  **at the daily close only**, so the tower never reveals intraday P&L (section 10).
- When someone leaves the top N, their tower is **rebranded** (the crown sign changes to the new owner) rather than
  demolished, and the building's height eases to the new owner's bucket over a game day. The skyline stays stable while
  the names change, like real cities.
- The crown sign shows the player's handle and title. A player can pay to choose a crown style (spire, lantern, garden,
  helipad): this is the first flex purchase built on the city.
- **Opt-out**: a player can hide their name ("quiet money"); the tower still stands, labelled "Private".

### 6.4 The player's own view

- **My City** overlay (client-only, never sent to others): highlight your own businesses, properties and home. This uses
  only data the player already has about themselves.
- Overlays: district index change (heat map), sector map (HQs coloured by sector, with a pattern so colour is not the
  only signal), properties for sale, auction lots, today's movers.

**Open questions (6):** Should HQs move when ranks change, or only grow and shrink? Better ways to make the city useful for
trading decisions without leaking anything? How should a player's home city be chosen and changed? Should crown towers be
per city, global, or both?

---

## 7. Growth: the more people, the bigger the city

### 7.1 Development points

Each city has a **development score** recomputed at the daily close (never per tick):

```
DP_c = a · NPC_GDP_c                          # the base world economy of the city's region
     + b · Σ invested in player businesses in c
     + c · Σ value of player properties in c
     + d · market cap of companies headquartered in c (NPC + player)
     + e · active residents of c (activity-weighted players, like N_a)
```

Weights are tuned so that a city with no players still has a believable base size (the NPC economy) and players visibly
push it beyond.

### 7.2 Target size (urban scaling)

Real cities scale sublinearly in area and superlinearly in activity (Bettencourt et al., "Growth, innovation, scaling, and
the pace of life in cities", PNAS 2007). We use:

```
targetParcels_c = P0_c · (DP_c / DP0_c) ^ 0.8                      # developed parcels (area grows slower than activity)
targetHeightMedian_c = H0_c · (DP_c / DP0_c) ^ 0.25 · personality   # cities also grow upward
```

`P0_c` and `H0_c` are the personality's launch size. Each city has a soft maximum (a generated area of potential land) and
a hard maximum in the generator (section 8.1), so even a runaway city stays renderable.

### 7.3 The frontier: how a city grows

- The generator creates the **potential city** chunk by chunk: the terrain, road skeleton, parcels and the building each
  parcel would get. Most of it starts **undeveloped**.
- Each parcel has a **development priority**: V plus adjacency to developed land plus a small seeded noise. The city
  develops parcels in priority order towards its target. The order is deterministic, so a city's future shape is fixed by
  its seed while its pace is set by the players. Two worlds with the same seed and the same history look identical.
- Roads appear before buildings: a new chunk first shows graded roads and lamp posts, then construction sites, then
  buildings. Each step is a visible event.
- A cap on new parcels per game day (for example 2% of the city) keeps growth smooth and readable, even after a big
  influx.

### 7.4 Redevelopment (densification)

- When a district's index stays above a threshold for N game days, its lowest-value buildings become **construction
  sites** and then taller buildings of a newer archetype (row houses → mid-rise → tower). Hysteresis (thresholds up and
  down differ) prevents flicker.
- This is how players investing in a district (bible 01, gentrification) becomes visible: the docks turn into lofts, then
  into glass towers.

### 7.5 Decline

- When `DP` falls below what's built, the city doesn't delete buildings. Vacancy rises (fewer lit windows, "To let"
  signs); after 30 game days without recovery, the least valuable vacant buildings become **derelict** (boarded, darker
  materials); after a long time, derelicts at the edge can return to wasteland. Recovery reverses this in the same order.
- Sundara's bust shows half-finished "ghost towers" (an archetype only used when construction stops before completion).

### 7.6 Balance between cities

- Rank unlocks (R0 Avalon; R2 Nordhaven, Meridia; R3 Sundara, Kaiyo) mean Port Avalon grows first and largest. That's
  intended: the capital is the busiest.
- A "frontier" incentive is possible (cheaper property or a demand boost in small cities), but that's an economy decision
  for the tech lead, not this plan.

**Open questions (7):** better growth formulas? Should the potential city be infinite (chunks generated on demand forever)
or bounded? How to make growth feel exciting (events, ribbon-cutting, a "new district opens" moment) without spamming the
Wire?

---

## 8. Architecture: generation on the server, drawing on the client

### 8.1 Chunks

- The city plane is divided into 128 m × 128 m **chunks**. The **macro plan** (terrain at low resolution, coastline,
  arterial roads, district plan, landmark positions) is generated once per city for its whole potential area (for example
  8 km × 8 km) and stored.
- **Detail** (local streets, parcels, buildings) is generated per chunk on demand, with the macro plan as boundary
  conditions so chunks match at their edges (streamlines that cross a chunk border are traced in a band with overlap and
  clipped deterministically).

### 8.2 Determinism and floats

- JavaScript's `Math.sin`, `Math.exp`, `Math.pow` and friends are **not guaranteed bit-identical** across engines or
  versions. So topology (which roads, which parcels, which ids) is computed **only on the server**, on one pinned Node
  version, and shipped as data. The client never recomputes topology; it only draws.
- Within the generator: seeded xoshiro128** (the engine's RNG) with a stream per (city, chunk, stage), integer or
  fixed-point coordinates for graph decisions, and snapping with explicit tolerances. Noise uses our own implementation
  (no library whose output may change).
- A **generator version** is part of every chunk id. Changing the generator never changes existing chunks of a live world;
  new versions apply only to new chunks or behind a migration.

### 8.3 Data formats

- **City static data** (per chunk, immutable once generated): road polylines, block and parcel polygons, parcel ids,
  district ids, zoning, the potential building of each parcel (parts and parameters), terrain tiles and water. Encoded as
  a compact binary (quantized coordinates, delta-encoded polylines, packed instance attributes), roughly 20 to 80 kB per
  chunk compressed. Served as immutable, cacheable files (`/city/<cityId>/<genVersion>/<chunk>.bin`) through the CDN.
- **City state** (changes daily, small): per chunk, which parcels are developed, under construction, vacant or derelict
  (a bitfield plus a few overrides), and the per-parcel height level after redevelopment. Plus the **bindings**: HQ
  parcels (company id → parcel), storefront slots (business id → slot), crown towers (rank slot → handle and bucket),
  and landmark names.
- **Live data the city reads but never fetches**: prices (already on the tick, for HQ lights).

### 8.4 Server side

- A `city` module in the world server, next to `boards.ts`: at the daily close it recomputes DP, advances development,
  updates bindings, and bumps the **city version stamp**.
- Generation of new chunks runs in a worker thread (or a job at the close), never inside the market tick.
- A small **bake job** renders T0 pictures (the whole city per rotation, and a skyline strip for the desk wallpaper) after
  each version, using headless WebGL (for example a headless Chromium in the job runner). Optional for V1 of this
  feature; T0 can fall back to a Canvas2D silhouette.

### 8.5 Network (R-9-12 compliant)

- The public tick gains **one** small stamp: `city: { [cityId]: version }`, a few bytes, the same pattern as `boards` and
  `directory`.
- A client fetches a city's state with a request such as `city-state { cityId, since }` only when the City app or the
  city wallpaper is visible and the stamp moved, through the existing per-socket rate limit. The reply is a delta when
  possible (expected 1 to 10 kB a day per city).
- Static chunks come over HTTP from the CDN, not the WebSocket. With 4,000 clients this adds nothing to the tick and
  little to the server: the static files are cached, and city state changes once a game day.

### 8.6 Client side

- `src/city/` (new): `render/` (CityRenderer, shaders, LOD, picking), `data/` (chunk loader and decoders, state store),
  `ui/` (the City app window, overlays, the building card, the wallpaper component).
- The City app is a **new Quay app** (a new window type), and the desk wallpaper hooks in through a new slot or prop on
  the wallpaper and Settings components, not by restructuring `src/components/os/*` (the UX session's request).
- Decoding and mesh building run in a **Web Worker** (transferable buffers), so the main thread never stalls while
  chunks stream in.
- **Picking**: an ID render target (T2) or a CPU ray test against parcel polygons using the known iso transform (T1,
  T0).

**Open questions (8):** better chunking or streaming designs? Should the generator also run in the client for previews
(for example the debug page) while the server stays authoritative? Is a headless bake for T0 worth it, or is a Canvas2D
silhouette enough?

---

## 9. Experience and interface

### 9.1 Where the city appears

1. **The desk wallpaper** (Quay, desktop): the skyline of your home city behind your windows, at the current game hour.
   T0 picture by default (zero GPU), so it never slows trading. Your crown tower (if any) is outlined in brass.
2. **The City app** (desktop window and phone full screen): pan, zoom, rotate, tap. Tabs per unlocked city, with locked
   cities shown greyed and labelled with their unlock rank.
3. **Context links**: "Show on map" from a company card, a business, a property, an auction lot, or a Wire item about a
   district.
4. **Phone home screen**: a small skyline widget in the home screen header (T0 picture), opening the City app.

### 9.2 Interactions

- Tap a building → a card (company, business, property type, landmark, crown tower) with the public facts and links.
- Long-press or right-click → "Show on map in other overlays", "Watch this company".
- Pinch or wheel to zoom, drag to pan, two-finger twist or a button to rotate 90°, double tap to zoom in.
- Keyboard (desktop): arrows pan, `+` and `-` zoom, `[` and `]` rotate, `Esc` closes the card. Keys don't clash with the
  Broker shortcuts (`B`, `S`, `1`–`4`, `Enter`, `Space`, `/`, `?`), because the City window only takes keys when focused.

### 9.3 Time of day

- Light follows the game clock (`src/world/calendar.ts`): pre-market dawn, market hours daylight, the close at golden hour,
  evening and night until the next open. At game speeds above 1×, the sky eases rather than strobes.

### 9.4 Accessibility

- Colour is never the only signal (lit or not lit plus small flags and labels).
- Reduced motion: no water animation, no traffic, no crane swings, instant camera moves.
- A list view of every tapped category (companies, my shops, crown towers) for screen readers; the map is a visual extra,
  never the only way to reach anything.
- French and English strings through the existing i18n files (append-only keys).

**Open questions (9):** a better "first time you see your city" moment? What makes the City app worth opening every day?

---

## 10. Privacy and fairness (locked rules)

- **Only public records drive the city**: company data (public), business and property purchases (public records, V1
  privacy §1), profile holdings (public), the Net Worth board (public). Never positions, orders, P&L or style.
- **Crown towers use daily-close buckets only**, so the skyline can't be used to rebuild anyone's intraday P&L curve. The
  bucket must be coarse enough that its day-to-day change doesn't reveal a single trade (Tape to verify with the no-leak
  hunts).
- **Bankruptcy**: a player's bankruptcy is shown only as `specs/velvet-bankruptcy.md` "Privacy" allows. By default a
  crown tower simply changes owner, and storefronts of a bankrupt player close like any failed shop, with no name
  attached to the failure.
- **Homes and lifestyle at home** are opt-in, like the 6D home room (off by default).
- **The "My City" overlay** is computed client-side from the player's own data and never sent anywhere.
- **No trading edge**: the city shows nothing earlier or more precisely than the Wire and the boards. HQ lights use the
  same prices the Broker shows.
- **Names on buildings** (crown signs, shop signs, later name rights) pass the moderation filter (the
  `src/world/launchpad/moderate.ts` pattern) and are display aliases only. They never rename asset ids or engine config.
- **No chance-based purchases** (store rule R6): crown styles and placements are bought, never rolled.

**Open questions (10):** anything here that could still leak? Should crown towers be opt-in rather than opt-out?

---

## 11. Monetization and sinks (in-game money only)

The city creates natural, cosmetic money sinks that fit the "flex" goal:

- **Storefront placement**: choose your slot (a corner on the main avenue costs more than a side street).
- **Crown styles** for crown-tower holders.
- **Name rights**: a landmark's name for one chapter, auctioned weekly (with the existing auction system,
  `src/world/auctions.ts`), moderated.
- **Facade upgrades** for a player company's building (materials, lighting, a rooftop logo).
- **Sponsoring a public space**: a park or a plaza named after a player, which also feeds the Legacy score planned in the
  wealth track.
- Later: **developer mode**: a player real-estate developer company (bible 01, T4) chooses what gets built on parcels it
  owns, within zoning.

All are cosmetic and never pay-to-win; none involves real money unless Mathis decides otherwise later.

---

## 12. Build plan (phases)

Each phase ends committed, green and reviewed, like the V1 phases. Work starts from `v1` **after** `ux/overhaul` merges.

| Phase | Goal | Deliverables | Gate |
|---|---|---|---|
| C0 Spike | Choose the renderer with data | Three throwaway prototypes drawing 30,000 random iso buildings (three.js instanced, hand-written WebGL2, Canvas2D baked sprites), measured on a low-end Android phone, an iPhone and a laptop | A written decision with fps, memory and bundle numbers |
| C1 Generator core | Port Avalon generated from a seed | `src/city/gen/` stages 1 to 5, a debug page under `src/app/concepts/` showing each stage as overlays, and Vitest invariant tests | Section 13 invariants pass; Mathis approves screenshots |
| C2 Renderer | Port Avalon drawn and explorable | `src/city/render/`, T1 and T2 tiers, LOD, picking, the City app (read-only, static, local data) | Performance budgets (section 3.6) on the reference phone |
| C3 Live binding | The city reflects the game | Server `city` module, version stamp, `city-state` read, HQ lights and heights, storefronts, district index coupling | R-9-8b load gate passes; no-leak hunts pass |
| C4 Growth | The city grows and declines | DP, targets, frontier, construction states, redevelopment, decline, chunk generation in a worker, CDN files | A 365-game-day simulated history renders correctly; growth matches targets within ±10% |
| C5 Four more cities | Nordhaven, Meridia, Sundara, Kaiyo, plus Isla Serena | Four personality files, their landmark templates, the Serena vignette | Each city is recognisable from one screenshot (blind test with 5 people); invariants hold for all |
| C6 Status layer | Crown towers, desk wallpaper, overlays, sinks | Crown parcels, per-city boards, T0 bake or silhouette, wallpaper slot, overlays, storefront placement, crown styles | Privacy review by the Tape checks; UX session review of the shell hooks |
| C7 Polish | Life and atmosphere | Trees, traffic, boats, trains, weather and seasons, construction animation | Budgets still hold in T2; reduced motion verified |

---

## 13. Tests and quality gates

**Generator invariants (Vitest, every city, many seeds):**

- The road graph is connected (one component per landmass, bridges included).
- Every parcel touches a street; no parcel overlaps another, a road, or water.
- No building exceeds its parcel, its height cap, or the slope rule; no building stands in water.
- Block area, parcel frontage and height distributions match the personality's targets (quantile checks with tolerance).
- Each district has exactly one landmark; all districts in `CITIES` exist on the map.
- Chunk edges match: roads crossing a chunk border meet within tolerance; no duplicated parcels across chunks.
- Determinism: the same seed and generator version give byte-identical chunk files (hash snapshots).
- "Unpredictability" metrics (the reviewer is invited to improve these): the entropy of street orientations per
  district, the spatial autocorrelation of heights (Moran's I) within a target band, and a no-repetition check (no two
  neighbouring buildings with identical parameters).

**Rendering (Playwright):**

- Visual snapshots of each city at fixed cameras, per rotation, in light and dark, T1 and T2.
- Performance: pan for 5 s with CPU throttling (4×) and assert frame times and long tasks under budget.
- Idle check: with the City window hidden, zero frames are drawn.

**Server and privacy:**

- The load gate R-9-8b with the city stamp on the tick.
- The no-leak suite extended: crown buckets never change intraday; city state never contains positions or orders; a
  bankrupt player's name never appears on a closed storefront.

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Procedural output looks like noise, not a city | Hierarchical generation (geography → arterials → streets → parcels), strong personalities, handmade landmarks, and Mathis's screenshot approval at C1 |
| Phones can't cope | Tiers, impostors, render-on-demand, T0 pictures, a spike before committing (C0) |
| Cross-device float differences change the map | Topology only on the server; the client only draws shipped data |
| A generator change breaks a live world | Versioned generator; existing chunks are immutable |
| The city reveals private data | Section 10 rules plus no-leak tests |
| Scope creep (it's a game inside the game) | Strict phases; C1 to C3 on Port Avalon only before any other city |
| Conflicts with the UX session's shell work | New components and slots only; the UX session reviews the hooks |
| The city becomes decoration nobody opens | Make it useful: company browsing, district investing, storefront placement, crown towers, context links from everywhere |

---

## 15. Questions for the reviewer (GPT 6.1 Sol)

Please answer with concrete proposals (algorithms, formulas, parameters, data structures, or alternatives with
trade-offs). Disagreeing with this plan is welcome when you explain why.

1. **Rendering**: is orthographic WebGL2 with instanced prisms and shader-drawn windows the best choice for a crisp
   isometric look on phones? Would you use three.js, PixiJS, a hand-written renderer, or something else? How would you do
   the ink outlines cheaply?
2. **Street networks**: is the tensor-field method the best fit for "familiar yet unpredictable"? What would you combine
   with it (agent-based growth, L-systems, space colonization, graph grammars) to get historic cores and planned
   extensions in one generator?
3. **Personalities**: how would you make five cities instantly recognisable from a single screenshot? Propose stronger
   signature features, parameter sets, or landmark ideas for Port Avalon, Nordhaven City, Meridia, Sundara Coast and Kaiyo
   City.
4. **Growth**: improve the development model (section 7). How should a city's shape evolve over months of play so it
   stays coherent and exciting? Is a fixed "potential city" with a development order the right idea, or should the plan
   itself change with history?
5. **Binding to the economy**: better ways for companies, shops, properties and players to appear in the city, and for
   the city to matter to gameplay, without breaking the privacy rules or giving a trading edge.
6. **Status and flex**: more ideas for spending in-game money on the city (cosmetic, non pay-to-win), and for making the
   skyline a leaderboard people care about.
7. **Scale**: how would you keep a city of 50,000+ buildings smooth on a mid-range phone, and keep the server cost flat
   as the world grows?
8. **Determinism and versioning**: is "topology on the server, drawing on the client" the right split? Any better scheme
   for chunk generation, edge matching and generator upgrades in a live persistent world?
9. **Measuring "looks like a real city"**: which metrics or tests would you use to catch ugly or unrealistic output
   automatically?
10. **What's missing**: anything that would make this feature far more memorable or more addictive in a healthy way.

---

## 16. References

- Chen, Esch, Wonka, Müller, Zhang, "Interactive Procedural Street Modeling", ACM SIGGRAPH 2008 (tensor fields).
- Parish, Müller, "Procedural Modeling of Cities", ACM SIGGRAPH 2001 (L-systems for road networks).
- Müller, Wonka, Haegler, Ulmer, Van Gool, "Procedural Modeling of Buildings", ACM SIGGRAPH 2006 (CGA shape grammar).
- Vanegas, Kelly, Weber, Halatsch, Aliaga, Müller, "Procedural Generation of Parcels in Urban Modeling", Eurographics 2012.
- Bettencourt, Lobo, Helbing, Kühnert, West, "Growth, innovation, scaling, and the pace of life in cities", PNAS 2007.
- Games to look at for feel: SimCity 2000 and 3000 (isometric readability), Townscaper (procedural charm), Islanders
  (minimal procedural placement), Mini Motorways (cities growing on their own), Cities: Skylines (growth and zoning),
  Pocket City (city building on phones).
- In this repo: `src/engine/universe.ts` (CITIES, companies and regions), `src/world/assets.ts` (businesses, properties,
  district index), `src/world/boards.ts` (boards), `docs/V1-PRIVACY.md`, `docs/team/specs/lead-phase9.md` (R-9-12),
  `vision/01-markets-economy.md` §3.8 and §14.1 (real estate, map growth), `vision/04-experience-lifestyle.md` (lifestyle,
  Ink & Brass), `specs/velvet-desktop-os.md` (Quay).
