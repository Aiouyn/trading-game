# Living Cities — prototype

Five procedural isometric cities (plus Isla Serena) for Port Avalon, generated from a seed and drawn with three.js.
Plan: `vision/06-cities.md` in the main checkout.

```bash
node prototypes/cities/serve.mjs 3610
```

Then open http://localhost:3610 (add `?city=kaiyo&t=21` to jump to a city and an hour).

## What it shows

- **Generation** (`src/gen.js`, about 1 s per city): terrain and water, districts and land value, a tensor field
  per personality, streets traced as hyperstreamlines (canals, arterials, collectors, locals, bridges), blocks from the
  road raster, parcels (rows along streets, scattered villas), a small shape grammar of building archetypes
  (`src/archetypes.js`), landmarks, trees, ports, ships, cranes and boats.
- **The urban edge**: land value plus correlated noise decides where the city stops; beyond it, fields and forest.
- **Growth**: every building, street and lot has a development order. The growth slider (and "Watch it grow") raises
  the city from its core outwards, with construction scaffolds.
- **The market**: listed companies of each region sit in their home city's tallest towers. The market slider lights
  headquarters on a rally and darkens them in a sell-off. Three crown towers per city stand for top players.
- **Time of day**, traffic, streetlights, a train on Kaiyo's loop line.
- **Map lenses** (the "Map lens" chips, or `V` to cycle): Mine, Market, Sectors, Owners, Land value, Districts and Use. One
  is on at a time: it tints the emphasised buildings and the ground, fades the rest, and lists a legend. `/` searches
  companies and tickers, owners, named buildings, districts and buildings for sale.

## Files

| File | What |
|---|---|
| `src/personalities.js` | The six places: terrain functions, districts, street fields, palettes, landmarks |
| `src/gen.js` | The generator pipeline |
| `src/archetypes.js` | Building archetypes, landmarks, trees, cranes, ships |
| `src/outskirts.js` | The land and sea beyond the square: coarse ring grid, woods, highways to the horizon |
| `src/render.js`, `src/shaders.js`, `src/geoms.js` | Orthographic dimetric renderer, instanced parts, ground, roads |
| `src/lenses.js` | Map lenses: palettes, the eight lenses, their legends, and `applyLens` (writes the state texture) |
| `src/search.js` | Search index and ranking |
| `src/main.js`, `index.html` | The Quay-style interface |
| `src/companies.js` | Listed companies by home city (from `src/engine/universe.ts`) |
