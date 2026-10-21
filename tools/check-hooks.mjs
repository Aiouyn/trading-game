#!/usr/bin/env node
// AC-HOOKS-PROD: a production build made WITHOUT the e2e flags must not contain any test/mock hook.
// Run after a no-flag `next build`. Greps .next/static (excluding .map files) for every hook string in HOOKS
// and exits 1 on any hit. Add new hooks to this single list.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const QUERY_KEYS = [
  // mock channels (src/shell/mockChannels.ts)
  "rank", "flags", "tick", "conn", "halted", "held", "nw", "pct", "chg", "lic", "charters", "onb", "onbDone", "places", "guest", "prot",
  // other URL hooks
  "phase", "load", "retryMs", "city", "alerts", "world",
];
const HOOKS = [
  ...QUERY_KEYS.map((k) => `.get("${k}")`),
  "forced city load failure",
  "NEXT_PUBLIC_QUAY_MOCK_", "QUAY_HOOKS",
  "Place order (mock)", "Toggle halt (mock)",
];

const root = process.argv[2] ?? ".next/static";
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (!p.endsWith(".map")) files.push(p); } };
try { walk(root); } catch { console.error(`check-hooks: ${root} not found (run a no-flag next build first)`); process.exit(2); }

let hits = 0;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const h of HOOKS) {
    let i = text.indexOf(h);
    while (i !== -1) { hits++; console.error(`HIT ${JSON.stringify(h)} in ${f}: …${text.slice(Math.max(0, i - 40), i + h.length + 40).replace(/\s+/g, " ")}…`); i = text.indexOf(h, i + 1); }
  }
}
console.log(`check-hooks: ${files.length} files, ${HOOKS.length} hook strings, ${hits} hit(s)`);
process.exit(hits ? 1 : 0);
