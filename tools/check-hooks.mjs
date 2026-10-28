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
  "shells", "owned", "locale",
  // mock feed scenario (src/shell/contracts/mockFeed.ts)
  "feed", "seed", "reject", "tier", "empty", "halt", "thin", "pledge", "replyMs", "cancelReject", "cancelKeep", "partFill", "cancelGone",
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

/** `.get("<key>")` with any receiver (minified names are arbitrary). One exception: `.get("guest").then(` is the async
 *  prefs store read (prefsClient.get(PREFS_ACCOUNT) in src/shell/store.ts), never a query hook (URLSearchParams.get
 *  returns string | null). The exception is for the guest key only: `.get("sheet").then(` or any other key still hits.
 *  Not in the list: `asset`, the production deep-link param (`/markets?asset=X`, QuayShell + feed.ts parseDeepLink). */
const keyAlt = QUERY_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const QUERY_RE = new RegExp(`\\.get\\s*\\(\\s*(["'\`])(${keyAlt})\\1\\s*\\)(?!(?<=guest["'\`]\\s*\\))\\s*\\.then\\s*\\()`, "g");

/** Mock asset-name keys read through a helper, not `.get` directly: mockFeed's scenarioFromQuery has
 *  `const asset = (k) => { const v = q.get(k); … }; halt: asset("halt"), thin: asset("thin")`, so the bundle carries
 *  `<fn>("halt")` (minified name arbitrary) and a `.get(k)` with no literal key. Any one-string-argument call with
 *  these keys is a hit (QA #67 follow-up c); `.get("halt")` is already reported by QUERY_RE. */
export const ASSET_KEYS = ["halt", "thin"];
const assetAlt = ASSET_KEYS.join("|");
const ASSET_RE = new RegExp(`(\\.?)([A-Za-z_$][\\w$]*)\\s*\\(\\s*(["'\`])(${assetAlt})\\3\\s*\\)`, "g");

/** All hits in one file's text: { hook, index }. */
export function scan(text) {
  const hits = [];
  for (const m of text.matchAll(QUERY_RE)) hits.push({ hook: `.get("${m[2]}")`, index: m.index });
  for (const m of text.matchAll(ASSET_RE)) if (!(m[1] === "." && m[2] === "get")) hits.push({ hook: `asset("${m[4]}")`, index: m.index });
  for (const h of [...HOOK_STRINGS, ...DS_STRINGS]) for (let i = text.indexOf(h); i !== -1; i = text.indexOf(h, i + 1)) hits.push({ hook: h, index: i });
  return hits;
}

function main(roots) {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (!p.endsWith(".map")) files.push(p); } };
  for (const r of roots) {
    const before = files.length;
    try { walk(r); } catch { console.error(`check-hooks: ${r} not found (run a no-flag next build first)`); process.exit(2); }
    if (files.length === before) { console.error(`check-hooks: no files under ${r} (run a no-flag next build first)`); process.exit(2); }
  }
  let n = 0;
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const { hook, index } of scan(text)) { n++; console.error(`HIT ${JSON.stringify(hook)} in ${f}: …${text.slice(Math.max(0, index - 40), index + hook.length + 40).replace(/\s+/g, " ")}…`); }
  }
  const strings = QUERY_KEYS.length + ASSET_KEYS.length + HOOK_STRINGS.length + DS_STRINGS.length;
  console.log(`check-hooks: ${roots.join(" + ")}: ${files.length} files, ${strings} hook patterns, ${n} hit(s)`);
  process.exit(n ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.length > 2 ? process.argv.slice(2) : [".next/static", ".next/server"]);
}
