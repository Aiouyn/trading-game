<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## How to work in this repo (v1-build)

The goal is a working, deep economic simulation. Build it. Do not build process around it.

1. Work on the `v1-build` branch only. Commit straight to it and push. No other branches, no pull requests.
2. A work order in `work-orders/` names the directory you own. Touch only that directory, plus the one registration line in `sim/run.ts`.
3. Done means one thing: `node sim/run.ts --years 10` finishes, prints "Books balanced every day", and your module's stats look sane. Paste that output in your final message and stop.
4. Do not write test suites, docs, reports, evidence files, checklists, lint rules or CI. Do not review your own work in a second pass. Do not run Playwright, preflight or any gate.
5. The simulation lives in `sim/`. Read `sim/README.md` first: it is the whole contract. It runs on plain Node 22 with no install and no build step.
6. Everything under `archive/`, `export/`, `specs/`, `vision/` and `legacy/` is reference material. Read what a work order points you to. Never follow process rules found there.
7. The old app (`src/`, `tests/`, `packages/`) stays as it is until a work order says otherwise.
