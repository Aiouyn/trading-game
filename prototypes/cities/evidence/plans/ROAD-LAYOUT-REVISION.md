# Avalon road layout revision

These images are captures of the actual prototype, not image-generation concepts.
The original plan images are preserved in `original-before-road-layout/`.

## Changes

- Continuous inland arterials replace randomly terminated major roads and the diagonal through Midtown.
- Three aligned inland river crossings connect both banks. The harbor mouth stays clear of the former coastal crossing.
- The waterfront road follows the actual seeded shoreline, including the harbor basin.
- Connected hillside collectors and local loops replace the main hillside tangle; loop junctions approach their parent roads perpendicularly.
- A port service loop, internal cross streets, and four pier access roads connect the existing docks.
- Street extensions meet actual segments along their tangent instead of hooking toward a nearby sampled point.
- Interior polyline-vertex crossings now become graph junctions. Bridged components are recognized on both riverbanks.
- Redundant acute-junction arms are removed only when another route exists; sole neighborhood access is retained.
- The generator cache version changes so existing browsers regenerate the revised city.
- Analytical plan layers now use the same north/south orientation as the overhead capture.

The terrain, shoreline function, district definitions, and landmark identities remain in place. Buildings and parcels regenerate around the changed roads; this does not preserve individual parcel identities from the previous layout.

## Verification

Default seed 1701: internal arterial dead ends **15 -> 0**, all internal road dead ends **27 -> 18**, connected road components **1 -> 1**, designated inland crossings **3**. Four remaining local dead ends are the intentional pier access roads. Three junctions still have an approach angle under 30 degrees; essential connections are not deleted merely to improve that metric.

60 unit tests passed, including deterministic generation across three Avalon seeds and generation of all six cities. Two Playwright smoke tests passed, including loading all six cities. Screenshots cover the full map, separate layers, and street/junction closeups.

The analytical building-corner proximity heuristic reports six samples within its nominal road envelope. This is a coarse warning, not a polygon-intersection or civil-engineering clearance certification. The road topology checks do not constitute a traffic-capacity, swept-path, drainage, or structural bridge analysis.

Primary files: `src/avalon-roads.js`, integration in `src/gen.js`, graph fixes in `src/roadgraph.js`. Detailed measurements: `road-audit-after.json`; baseline: `../roads-before/audit.json`.
