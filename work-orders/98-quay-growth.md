# Work order 98: a city you can see growing

Read `AGENTS.md` (including the Next.js block), `docs/DIRECTION.md`, `sim/modules/economy/` (the new stats from work order 95: realGdp_M, prod_idx, realWage, sector productivity in `sim/content/productivity.txt`), `sim/modules/media/` (press stances from work order 94), and `src/apps/city/`, `src/apps/markets/`, `src/apps/wire/`.

You own `src/apps/city/`, `src/apps/markets/` and `src/apps/wire/`. You may add read-only fields to the `/view` payload in `sim/server.ts`. Run Quay with `next dev --webpack`.

## Do

1. **City**: show the economy's long story: real GDP, productivity, real wages, unemployment, inflation and the policy rate, as small charts over the years, with a one-line plain reading ("Wages are rising faster than prices for the third year running.").
2. **Markets**: per sector, show productivity growth next to returns and P/E, so a player can see why tech trades at a higher multiple than utilities. The broad index shows its total return as well as its price.
3. **Wire**: when a journalist asks for comment, the four stances (explain, deny, no comment, attack) are clear buttons, each with one line on what it risks. After answering, the follow-up story links back to the request.
4. Use the Quay look (Ink & Brass tokens, existing components). It must work at phone width.

## Done

Screenshots of City, Markets and a press request in Wire, desktop and phone, saved to `docs/design/quay-growth*.png`. `npx tsc --noEmit` has no new errors in `src/`. Commit after `git pull --rebase`, push to v1-build, and reply with that. Then stop.
