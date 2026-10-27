#!/usr/bin/env node
// AC-HOOKS-PROD: a production build made WITHOUT the e2e flags (QUAY_HOOKS, QUAY_DS, NEXT_PUBLIC_QUAY_MOCK_*) must
// contain no test/mock hook and no dev-only /__ds design-system code. Run after a no-flag `next build`: scans every
// non-.map file under .next/static AND .next/server (or the roots given as arguments) and exits 1 on any hit.
// Add new hooks to the lists below; tests/unit/shell/check-hooks.test.ts covers the matcher.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Every URL query key read by a mock channel or test hook (URLSearchParams `.get("<key>")`). */
export const QUERY_KEYS = [
  // mock channels (src/shell/mockChannels.ts)
  "rank", "flags", "tick", "conn", "halted", "held", "nw", "pct", "chg", "lic", "charters", "onb", "onbDone", "places", "guest", "prot",
  "shells", "owned",
  // mock feed scenario (src/shell/contracts/mockFeed.ts)
  "feed", "seed", "reject", "tier", "empty",
  // other URL hooks: phase, load failure, city failure, alert/world banners (feed.ts), the demo sheet (QuayShell), /__ds palette
  "phase", "load", "retryMs", "city", "alerts", "world", "sheet", "palette",
];

/** Literal strings that only gated hook code contains. */
export const HOOK_STRINGS = [
  "forced city load failure", "__quayFeed",
  "NEXT_PUBLIC_QUAY_MOCK_", "QUAY_HOOKS",
  "Place order (mock)", "Toggle halt (mock)",
];

/** Dev-only /__ds routes (QUAY_DS): markers of DesignSystemSheet (/__ds) and NoticesSheet (/__ds/notices), plus the
 *  flag name itself (a runtime `process.env.QUAY_DS` read means the gate was not inlined). Markers are JS strings (a
 *  testid, demo copy), not CSS class names: the global stylesheets keep their .ds-* layout rules. */
export const DS_STRINGS = ["QUAY_DS", "ds-ready", "Label on win2", "mock-orderpad", "OrderPad (mock)"];

/** `.get("<key>")` with any receiver (minified names are arbitrary), unless the call's result is used as a promise:
 *  URLSearchParams.get returns string | null, so `.get("guest").then(` is an async store read (prefsClient.get(PREFS_ACCOUNT)
 *  in src/shell/store.ts), never a query hook. */
const keyAlt = QUERY_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const QUERY_RE = new RegExp(`\\.get\\((["'\`])(${keyAlt})\\1\\)(?!\\s*\\.then\\s*\\()`, "g");

/** All hits in one file's text: { hook, index }. */
export function scan(text) {
  const hits = [];
  for (const m of text.matchAll(QUERY_RE)) hits.push({ hook: `.get("${m[2]}")`, index: m.index });
  for (const h of [...HOOK_STRINGS, ...DS_STRINGS]) for (let i = text.indexOf(h); i !== -1; i = text.indexOf(h, i + 1)) hits.push({ hook: h, index: i });
  return hits;
}

function main(roots) {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (!p.endsWith(".map")) files.push(p); } };
  for (const r of roots) { try { walk(r); } catch { console.error(`check-hooks: ${r} not found (run a no-flag next build first)`); process.exit(2); } }
  if (!files.length) { console.error(`check-hooks: no files under ${roots.join(" + ")} (run a no-flag next build first)`); process.exit(2); }
  let n = 0;
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const { hook, index } of scan(text)) { n++; console.error(`HIT ${JSON.stringify(hook)} in ${f}: …${text.slice(Math.max(0, index - 40), index + hook.length + 40).replace(/\s+/g, " ")}…`); }
  }
  const strings = QUERY_KEYS.length + HOOK_STRINGS.length + DS_STRINGS.length;
  console.log(`check-hooks: ${roots.join(" + ")}: ${files.length} files, ${strings} hook patterns, ${n} hit(s)`);
  process.exit(n ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.length > 2 ? process.argv.slice(2) : [".next/static", ".next/server"]);
}
