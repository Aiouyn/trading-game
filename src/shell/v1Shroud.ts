// M1-11 flag shroud. Out-of-scope systems stay in the registry; with no me.flags they are hidden and their
// routes 404. The flag names ride the existing me.flags channel (mock `?flags=` when QUAY_HOOKS is on).
// A production build inlines QUAY_HOOKS as "0", so the query read below is compiled out (same gate as mockChannels).
import type { AppId } from "./registry";

export interface ShroudEntry {
  /** Stable id for the inventory. */
  id: string;
  /** Absent from me.flags by default. Present: the 17 unlock rule applies again. */
  flag: string;
  /** Registry apps this flag reveals. Empty when the system has no app body (Whale Watch). */
  apps: readonly AppId[];
  /** First URL segment that 404s unless `flag` is set. */
  paths: readonly string[];
}

export const SHROUD = [
  { id: "banks", flag: "v1.banks", apps: ["bank", "funds", "insurance", "institutions"], paths: ["bank", "funds", "insurance", "institutions"] },
  { id: "ailab", flag: "v1.ailab", apps: ["ailab"], paths: ["ailab"] },
  { id: "politics", flag: "v1.politics", apps: ["civic"], paths: ["civic"] },
  { id: "businesses", flag: "v1.businesses", apps: ["businesses", "company"], paths: ["businesses", "company"] },
  { id: "property", flag: "v1.property", apps: ["property", "estate"], paths: ["property", "estate"] },
  { id: "terminal", flag: "v1.terminal", apps: ["quantlab", "research", "risk"], paths: ["quantlab", "research", "risk"] },
  { id: "whale", flag: "v1.whale", apps: [], paths: ["whale", "whale-watch"] },
  { id: "adversarial", flag: "v1.adversarial", apps: ["security", "legal"], paths: ["security", "legal"] },
  { id: "monetization", flag: "v1.monetization", apps: ["atelier"], paths: ["atelier"] },
] as const satisfies readonly ShroudEntry[];

export const SHROUD_FLAGS: readonly string[] = SHROUD.map((e) => e.flag);

/** API path prefixes with no handler today. A new route.ts under one of these must call `refuseShroudedApi` first. */
export const SHROUDED_API: readonly { path: string; flag: string }[] = [
  { path: "/api/bank", flag: "v1.banks" },
  { path: "/api/credit", flag: "v1.banks" },
  { path: "/api/funds", flag: "v1.banks" },
  { path: "/api/insurance", flag: "v1.banks" },
  { path: "/api/institutions", flag: "v1.banks" },
  { path: "/api/ailab", flag: "v1.ailab" },
  { path: "/api/civic", flag: "v1.politics" },
  { path: "/api/politics", flag: "v1.politics" },
  { path: "/api/businesses", flag: "v1.businesses" },
  { path: "/api/company", flag: "v1.businesses" },
  { path: "/api/property", flag: "v1.property" },
  { path: "/api/estate", flag: "v1.property" },
  { path: "/api/quantlab", flag: "v1.terminal" },
  { path: "/api/research", flag: "v1.terminal" },
  { path: "/api/risk", flag: "v1.terminal" },
  { path: "/api/whale", flag: "v1.whale" },
  { path: "/api/security", flag: "v1.adversarial" },
  { path: "/api/legal", flag: "v1.adversarial" },
  { path: "/api/atelier", flag: "v1.monetization" },
  { path: "/api/billing", flag: "v1.monetization" },
];

/**
 * Player API routes that exist and stay on with default flags. A new file under src/app/api must be added here
 * or under SHROUDED_API (and call refuseShroudedApi). The route test compares this list to the tree.
 */
export const IN_SCOPE_API_ROUTES = [
  "api/auth/login",
  "api/auth/logout",
  "api/auth/me",
  "api/auth/register",
  "api/broker/me",
  "api/broker/orders",
  "api/broker/orders/cancel",
  "api/broker/preview",
  "api/launchpad",
  "api/launchpad/history",
  "api/launchpad/launch",
  "api/launchpad/trade",
  "api/leaderboard",
  "api/market",
  "api/market/candles",
  "api/telemetry/consent",
  "api/telemetry/error",
  "api/telemetry/event",
  "api/telemetry/feedback",
  "api/telemetry/optout",
  "api/wire",
  "api/world",
] as const;

/** Non-API route handlers that are in scope (PWA). */
export const IN_SCOPE_OTHER_ROUTES = ["sw.js"] as const;

/**
 * Every page.tsx under src/app. The catch-all is the only player page and calls routeShrouded.
 * `__ds` pages 404 themselves outside a design-system build. A new page.tsx has to be added here
 * on purpose (the route test compares the tree to this list).
 */
export const ALLOWED_PAGES = [
  "src/app/[[...route]]/page.tsx",
  "src/app/%5F_ds/page.tsx",
  "src/app/%5F_ds/notices/page.tsx",
] as const;

const FLAG_BY_APP = new Map<AppId, string>(SHROUD.flatMap((e) => e.apps.map((id) => [id, e.flag] as const)));

export function shroudFlag(id: AppId): string | undefined {
  return FLAG_BY_APP.get(id);
}

export function shroudedAppIds(): AppId[] {
  return [...FLAG_BY_APP.keys()];
}

/** True when this app is out of scope and its flag is not in the set. */
export function isShrouded(id: AppId, flags: readonly string[]): boolean {
  const flag = FLAG_BY_APP.get(id);
  return flag !== undefined && !flags.includes(flag);
}

const DECODE_ROUNDS = 4;

/**
 * Path compared to the shroud list, or null when the path cannot be trusted.
 * Case, `%2F`, `%5C` / backslash, a trailing `.rsc` or `.json`, and a locale prefix
 * (`/en/bank`) do not reach the shell. At most four decode rounds; a `%` escape or a
 * NUL that is still there afterwards fails closed.
 */
export function normalizeShroudPath(pathname: string): string | null {
  let path = pathname.trim();
  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  const hash = path.indexOf("#");
  if (hash >= 0) path = path.slice(0, hash);
  for (let i = 0; i < DECODE_ROUNDS; i++) {
    let decoded: string;
    try { decoded = decodeURIComponent(path); } catch { break; }
    if (decoded === path) break;
    path = decoded;
  }
  // A leftover escape (or a `%` the decoder refused) is not a path we will guess.
  if (path.includes("%") || path.includes("\0")) return null;
  path = path.toLowerCase().replace(/\\/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  while (path.endsWith(".rsc") || path.endsWith(".json")) path = path.slice(0, path.endsWith(".rsc") ? -4 : -5);
  if (path === "" || !path.startsWith("/")) path = `/${path}`;
  return path === "" ? "/" : path;
}

/** True when `/{segments}` must 404. In-scope apps (and unknown paths) are false.
 *  `/api/bank` is not an API handler: the catch-all would otherwise render the `api` app.
 *  Any segment may name a shrouded app (`/en/bank`), not only the first. */
export function routeShrouded(segments: readonly string[], flags: readonly string[]): boolean {
  const path = normalizeShroudPath(`/${segments.join("/")}`);
  if (path === null) return true;
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  if (parts[0] === "api") {
    const flag = shroudedApiFlag(path);
    if (flag !== null && !flags.includes(flag)) return true;
  }
  for (const seg of parts) {
    const entry = SHROUD.find((e) => (e.paths as readonly string[]).includes(seg));
    if (entry && !flags.includes(entry.flag)) return true;
  }
  return false;
}

/**
 * Flags from the page query. Compiled out of a no-flag production build: QUAY_HOOKS is always "0" or "1"
 * (next.config env), so the `.get("flags")` branch does not ship. The e2e server sets QUAY_HOOKS=1.
 */
const HOOKS = process.env.QUAY_HOOKS === "1";
export function flagsFromSearch(sp: { get(name: string): string | null }): readonly string[] {
  if (!HOOKS) return [];
  return (sp.get("flags") ?? "").split(",").filter(Boolean);
}

/** The shroud flag for an API pathname, or null when this unit does not own the path.
 *  A path normalizeShroudPath rejects is not given a flag here; refuseShroudedApi 404s it. */
export function shroudedApiFlag(pathname: string): string | null {
  const path = normalizeShroudPath(pathname);
  if (path === null) return null;
  return SHROUDED_API.find((g) => path === g.path || path.startsWith(`${g.path}/`))?.flag ?? null;
}

/** 404 before any write when `pathname` is a shrouded API prefix and the flag is off, or when the
 *  path still has a `%` escape or a NUL after the decode budget. Null = not this unit's concern. */
export function refuseShroudedApi(pathname: string, flags: readonly string[]): Response | null {
  if (normalizeShroudPath(pathname) === null) return new Response(null, { status: 404 });
  const flag = shroudedApiFlag(pathname);
  if (!flag || flags.includes(flag)) return null;
  return new Response(null, { status: 404 });
}
