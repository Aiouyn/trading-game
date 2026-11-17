# Work order 83: Port Avalon at night

Read `AGENTS.md` (including the Next.js block), `docs/DESIGN.md` (Ink & Brass), `src/components/shell/TitleScreen.tsx` and `title.css`, and the `/title` data `sim/server.ts` sends. Look at `docs/design/quay-title.png`: the left column is right; the right side is a plain list ("North in 1", "North in 2", bare names) that means nothing to a new player.

You own `src/components/shell/TitleScreen.tsx`, `title.css`, and the `/title` response in `sim/server.ts` (add fields only).

## Build

The right side becomes a drawn scene of the city at night, made from the live world, in SVG, inside the palette (ink background, brass lights, muted lines; no photos, no gradients beyond the design rules):

1. **The skyline**: one building per listed firm along the harbour, height from its market value, its district from the simulation, lit windows in proportion to its staff; the exchange in the centre with today's index level.
2. **The harbour**: the ships in port and arriving (from the port module), small and still, a few moving slowly toward their berth.
3. **Voices**: one line at a time fades in under the scene, each a real, readable fact with context: "Northgrid Power closes at $3,439.67", "Isen Belverley, chief executive of Northgrid, is the city's third-richest", "Ships waiting: 3 at the north mouth", the latest headline.
4. Reduced motion: still scene, lines change without fading. Phone: the scene sits above the menu at a smaller height.
5. The scene draws in under a second and does not slow the menu.

## Done

`npx tsc --noEmit` has no errors in `src/`. Save over `docs/design/quay-title.png` and add `docs/design/quay-title-phone.png`. Commit after `git pull --rebase`, push to v1-build, reply with the paths and your cost. Then stop. No test suites, no docs.
