# Port Avalon (working title "Tycoon")

A multiplayer finance tycoon in one persistent world. Start with $5,000 and a cracked phone; trade 155 fictional assets with real tools, build businesses across 13 sectors, buy property in six cities, flex your wealth, train AI models, fight rivals in the shadows and in court, and climb from Broke to Dynasty. One game day is one real hour; the world never stops.

All companies, cities, currencies and people are fictional. No real money, no financial advice.

## Run it

```bash
npm install
npm run dev:all        # world server on :8787 + web app on :3000
```

Open http://localhost:3000, press **Start**, pick a handle. Other players on your network can join at `http://<your-ip>:3000`.

Separately: `npm run world` (world server only) and `npm run dev` (web app only). The world lives in `./world-data` (SQLite); delete that folder for a brand-new world.

World server settings (environment variables): `PORT` (8787), `DATA_DIR` (`./world-data`), `SEED` (unset: a random seed drawn at the world's first boot and kept in `world.db`; set it to pin a world), `TICK_MS` (5000 = one game day per real hour), `WARMUP_DAYS` (63 days of history before the world opens), `ADMIN_TOKEN` (enables the dev-only `/api/admin/grant` and `/api/admin/advance`). The web app finds the world on the same host, port 8787; override with `NEXT_PUBLIC_WORLD_URL`.

## Checks

```bash
npm run typecheck && npm run lint && npm test   # 119 unit tests: engine, world, replay
npm run e2e                                     # Playwright against a fresh world + production build
npx tsx scripts/balance/wealth.ts seed 21       # wealth-curve balance sim (3 weeks of play)
npm run balance                                 # engine calibration bands
node scripts/tour.mjs http://localhost:3000     # screenshot tour of every screen
```

## How it is built

| Layer | Where | What |
|---|---|---|
| Market engine | `src/engine` | Pure, seeded, deterministic: factor-correlated prices with fat tails, GARCH, jumps, regimes, circuit breakers, volume, quarterly earnings, a Taylor-rule central bank with CPI/jobs releases and a yield curve, order execution (market/limit/stop/stop-limit/trailing, brackets), shorting, margin and liquidation, listed options. See `docs/ENGINE.md`. |
| Game world | `src/world` | Everything around the market, also deterministic: players, ranks and licenses, businesses, property, lifestyle and Prestige, news, analyst notes, contracts, achievements, leaderboards, chapters, the economy stabilizer, chat, alliances, loans, the AI Lab, Security Ops, courts and 24 NPC rivals. Every player action is a `Command`; `stepGame` advances one tick. |
| Content | `src/content` | The catalogs: 156 businesses, 49 lifestyle items, 13 property types, 120+ headline templates, 19 research projects, 51 achievements, 15 contract types, 24 rival personas. The asset universe is `src/engine/universe.ts`. |
| World server | `server/` | One Node process owns the world: a drift-corrected 5 s tick, WebSocket sync, guest accounts with hashed tokens and optional passwords, SQLite snapshots plus a command log (a restart replays commands for an exact recovery). |
| Client | `src/components`, `src/game`, `src/net` | Next.js app in the Ink & Brass design system (`docs/DESIGN.md`). The server sends a public market frame and your private view every tick; a client-side mirror of the engine powers ticket previews without ever seeing hidden values. |

Design documents: `docs/TYCOON.md` (what was built and the numbers), `docs/DESIGN.md` (visual system), `docs/ENGINE.md` (market model). The design bible this implements is `docs/MASTER-BIBLE.md` (Ledger, Quant, Forge, Tape, Velvet).
