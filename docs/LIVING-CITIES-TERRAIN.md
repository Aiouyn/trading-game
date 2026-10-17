# Landscape and camera iteration — 2026-10-13

Requested direction: keep the restrained, simple aesthetic; make the city occupy actual land; add grass, lakes, believable streets and roadside detail; prevent visible terrain edges; give the player a way to see an address behind towers. All work stays in the existing living-cities worktree.

## Research applied

These are design adaptations, not claims that the cited games prove this prototype's performance or retention.

| Primary source | What it establishes | Adaptation here |
|---|---|---|
| [Cities: Skylines II — Maps & Themes](https://www.paradoxinteractive.com/games/cities-skylines-ii/features/maps-themes) | Map identities use coastlines, lakes, forests, hills, river valleys and transport connections | Continuous terrain around settlements, a lake and woodland fringe, region-specific shore shapes |
| [Cities: Skylines II — Road Tools](https://www.paradoxinteractive.com/games/cities-skylines-ii/features/road-tools) | Separate road categories, sidewalks, pedestrian paths, bridges and roadside planting | Narrow local streets, wider avenues, continuous curb ribbons, crossings, static lights, lake trail and raised crossings |
| [Cities: Skylines II — Detailer's Patch #2](https://www.paradoxinteractive.com/games/cities-skylines-ii/news/detailers-patch-2) | Roadside trees, pocket parks and road variation support detailed environments | Planted street rows and an open green fringe; no traffic simulation introduced |
| [Manor Lords — official site](https://manorlords.com/) | Settlement shape responds to landscape and major routes rather than only a rigid grid | Curved woodland approach and landscape paths around the settled city; launch parcel identities remain stable |
| [Townscaper — publisher](https://rawfury.com/games/townscaper/) | Palette choice, an irregular grid and coherent procedural architectural details form its visual identity | Bounded material families, differing window patterns, roof forms and setbacks while retaining the game's sober palette |
| [Tiny Glade — developer's Steam page](https://store.steampowered.com/app/2198150/Tiny_Glade) | Paths and buildings receive contextual procedural details, with a landscape-first building setting | Continuous grass, forecourts, shore paths, tree groups and details at junctions rather than floating buildings |

No art, game code or proprietary meshes were copied. Official text, screenshot references and developer descriptions were used to inform composition.

## Screenshot review log

Captures are saved under `proof/living-cities/`; `node scripts/city-capture.mjs` can repeat the same daylight, selected building, rotation, night and phone views.

1. **baseline/** — confirmed the exposed-water background, city-as-a-diorama appearance, repeated materials and lack of street hierarchy.
2. **terrain-pass/** — verified continuous grass and tighter framing. Found that road ribbons were back-facing: markings showed, but asphalt did not. Corrected triangle winding.
3. **streets-orbit/** — verified sidewalks and lane/crossing details. Found an approach road passing through the lake and solid, overly dark tower crowns. Rerouted the approach around the lake; changed upper tower parts to the facade shader.
4. **shore-review/** — checked the shoreline route and new tower silhouettes before final interaction testing.
5. **final/** — final desktop/phone, lake orbit and selected-building reveal captures, plus final scene review.

The six-city review caught a Serena-only water-height clamp; the cays now remain separated by water, with a regression check for that case.

Validation: production build and lint passed (one inherited lint warning), 52 affected unit checks passed, and all 10 desktop/phone browser tests passed. The final Serena correction was also exercised by the six-city capture and repeat all-personality browser check. Physical-phone performance and retention are not established by these checks.

## Implementation details and boundaries

- Version 2 extends the server-produced plan with a continuous 4.8 km square height field, roads, trees, lake metadata and viewpoints.
- The settled city's building IDs and addresses are retained. Heights, materials and visual forms are refined; these remain reference architecture, not new economic allocations.
- Camera zoom cannot go below 1. Panning is bounded. The view frame has a bounded world footprint at every aspect ratio; an invariant checks all orbit angles, minimum elevation and extreme pan positions against the terrain envelope.
- Right-drag or Shift-drag controls continuous yaw and bounded elevation. Two-finger twist rotates while pinching zooms. Existing quarter-turn buttons remain.
- **Reveal this building** temporarily lowers nearby tall structures. A player's own map link enables it on arrival; it never changes world buildings, valuations or ownership.
- Streets have pavement, sidewalks, lane marks, crossings, poles and static signal heads. Greenery and water have no autonomous animation. Lights update only with day/night view changes.
- The fallback consumes the shipped height field and shows continuous land rather than the old isolated city silhouette.
- Stage controls remain visual scenarios. No new economy, landscaping editor, vehicle movement or household simulation is added.
- More engaging exploration is a design hypothesis. Retention and enjoyment still need human playtests.

