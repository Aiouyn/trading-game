# Living Cities prototype

Built in an isolated worktree on `codex/living-cities`, starting from `ux/overhaul` at `ac4fc06`.
This is an executable first implementation of the supplied `06-cities.md`, not a production rollout of all its phases.

**2026-10-13 terrain update:** [Research and screenshot review](LIVING-CITIES-TERRAIN.md) documents the second visual pass:
continuous grass and hills, lakes, forest/avenue planting, curved roads, sidewalks, crossings, bridges, static lights,
restricted zoom/pan, free camera orbit and temporary building reveal. No void or terrain edge is exposed within the bounded camera.

## Run and try it

```powershell
npm install
npm run cities
```

- Atlas without signing in: http://localhost:3237/city-preview
- Isolated playable game: http://localhost:3237
- Separate world port: 8857.
- Its saves/backups live in this worktree's ignored `world-data/cities-prototype`.
- Override `PLAY_WEB_PORT`, `PLAY_WORLD_PORT` and `DATA_DIR` for another local instance.
- Stop the launcher with Ctrl+C. The existing game launcher saves the world before stopping.

In Quay, open **Living Cities** from the shelf or phone app grid. Buy an ordinary business through Businesses,
then select **Show on map** in its owned row. Your own address is highlighted. Headquarters link back to Broker.
Existing property cards also have a map link, and the map opens the correct owned-property management tab.

Drag or use arrow keys to pan; wheel/pinch or the buttons zoom. Right-drag or Shift-drag freely orbits and tilts;
two-finger twist rotates on touchscreens. Quarter-turn buttons remain available. Use **Reveal this building** when towers obscure an address.
Use the directory to find companies and landmarks. Day/night and district colors are visual controls.
**Construction & growth** and **Vacancy & decline** are explicit visual scenarios; they do not change the economy.

## Implemented

- Pure seeded city generation on the Next server, using the game's existing xoshiro streams.
- Five different city geographies and architecture settings, plus the fixed Isla Serena vignette.
- Stable parcel identities and addresses; static listed-company HQs bound to actual universe definitions.
- Instanced three.js prisms, facade windows, roof silhouettes, terrain terraces, parks, curbs and Kaiyo's rail loop.
- Default 2:1 ground projection at 30° elevation; continuous orbit/tilt, quarter turns, bounded pan/zoom, building-volume selection.
- Lazy City app integration into the existing desktop and phone shell. The desktop opens a map-sized window.
- Real public district indices and published day returns when connected; no fabricated quotes while offline.
- Client-only owned asset markers. Other players' private account objects are never inputs to the public city route.
- Broker links, owned-business/property links, and ephemeral private navigation excluded from saved routes.
- Render on demand, intersection/page visibility handling, suspension when another shell window/app is active, cleanup on unmount.
- Static SVG terrain image and usable directory when WebGL cannot initialize or its context is lost.
- English/French UI strings. No sound and no autonomous animation.

## Deliberately not represented as finished

- Street generation is a constrained tile/block prototype, not the document's full tensor-field/straight-skeleton pipeline.
- Static geometry is cached in the web process; there are no persisted chunk files, region migrations or CDN impostor atlases yet.
- HQ identities/sites come from the static launch universe; later player IPOs/relocations are not yet assigned persistent city sites.
- Business/property units are deterministic owner-only visual mappings, not server-issued new deeds or economic locations.
- Preview development states are not a new demand model or automatic world-server construction scheduler.
- No crown leaderboard, public owner/home disclosure, money sinks, paid placements, historical archive, or wallpaper integration.
- No 50,000-building/physical-phone performance claim, thermal measurement or 4,000-client city-load sign-off.
- Market prices and district quotes reuse the existing published frame; this change adds no market-tick payload.
- The prototype uses a fixed city plan seed, independent of the sandbox world's market seed.

## Validation

- Production build and TypeScript passed.
- Full unit run: 282 files passed, 2 skipped; 2,621 tests passed, 4 expected failures, 70 skipped and 20 todo.
- After the final shell integration, 49 affected generator, registry, route and owned-business checks passed.
- All 8 focused Playwright tests passed, covering desktop and phone atlas controls, all six scenes, address links, Broker routing,
  public artifacts, idle behavior and WebGL fallback. Results and snapshots are under `test-results/cities`
  and `proof/living-cities`.
- Lint has no errors; the inherited unused-variable warning in `tests/e2e/uxS6.spec.ts` remains.

The original working checkout, its existing changes and other worktrees were not modified by this implementation.

