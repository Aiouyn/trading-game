// M1-11: default flags hide out-of-scope systems, and a new route or app folder cannot ship unclassified.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { APP_IDS, type AppId } from "@/shell/registry";
import { APP_MODULES } from "@/shell/appModules";
import { defaultChannels } from "@/shell/mockChannels";
import { evaluate } from "@/shell/unlock";
import {
  ALLOWED_PAGES, IN_SCOPE_API_ROUTES, IN_SCOPE_OTHER_ROUTES, SHROUD, SHROUDED_API,
  refuseShroudedApi, routeShrouded, shroudFlag, shroudedAppIds,
} from "@/shell/v1Shroud";

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p.slice(ROOT.length + 1));
  }
  return out;
}

describe("M1-11 flag map", () => {
  it("paths and apps are unique and every shrouded app is a real AppId", () => {
    const paths = SHROUD.flatMap((e) => [...e.paths]);
    expect(new Set(paths).size).toBe(paths.length);
    const apps = shroudedAppIds();
    expect(new Set(apps).size).toBe(apps.length);
    for (const id of apps) expect(APP_IDS).toContain(id);
    for (const id of APP_IDS) {
      const flag = shroudFlag(id);
      if (flag) expect(SHROUD.some((e) => e.flag === flag && (e.apps as readonly string[]).includes(id))).toBe(true);
    }
  });

  it("no in-scope API route sits under a shrouded prefix", () => {
    for (const id of IN_SCOPE_API_ROUTES) {
      const path = `/${id}`;
      expect(SHROUDED_API.some((g) => path === g.path || path.startsWith(`${g.path}/`)), id).toBe(false);
    }
  });

  it("default flags hide every shrouded app and leave the V1 apps unlocked", () => {
    const { vis } = evaluate(defaultChannels(), new Set());
    for (const id of shroudedAppIds()) expect([id, vis[id]]).toEqual([id, "hidden"]);
    for (const id of ["broker", "portfolio", "wire", "launchpad", "city", "boards", "settings", "messages", "markets"] as const) {
      expect([id, vis[id]]).toEqual([id, "unlocked"]);
    }
  });

  it("one flag reveals only that system; the 17 rule still applies underneath", () => {
    const base = defaultChannels();
    const at = (flags: string[], nw = base.me.nw) =>
      evaluate({ ...base, me: { ...base.me, flags, nw } }, new Set()).vis;
    const banks = at(["v1.banks"]);
    expect(banks.bank).toBe("unlocked");
    expect(banks.funds).toBe("unlocked");
    expect(banks.ailab).toBe("hidden");
    expect(banks.institutions).toBe("hidden"); // rank R2, teaser from R3, no charter
    const lab = at(["v1.ailab"], "200000");
    expect(lab.ailab).toBe("unlocked");
    expect(lab.bank).toBe("hidden");
    const term = at(["v1.terminal"]);
    expect(term.quantlab).toBe("unlocked"); // R2
    expect(term.research).toBe("locked"); // teaser at R2, opens at R3
    expect(term.risk).toBe("locked"); // LIC1, opens at LIC2
  });

  it("routes 404 until the matching flag is set", () => {
    expect(routeShrouded(["bank"], [])).toBe(true);
    expect(routeShrouded(["bank", "desk"], [])).toBe(true);
    expect(routeShrouded(["bank"], ["v1.banks"])).toBe(false);
    expect(routeShrouded(["bank"], ["v1.ailab"])).toBe(true);
    expect(routeShrouded(["whale"], [])).toBe(true);
    expect(routeShrouded(["whale-watch"], ["v1.whale"])).toBe(false);
    expect(routeShrouded(["broker"], [])).toBe(false);
    expect(routeShrouded(["markets", "MKT-08"], [])).toBe(false);
    expect(routeShrouded([], [])).toBe(false);
    expect(routeShrouded(["settings", "SET-08"], [])).toBe(false);
    expect(routeShrouded(["api", "bank"], [])).toBe(true);
    expect(routeShrouded(["api", "credit", "draw"], [])).toBe(true);
    expect(routeShrouded(["api", "bank"], ["v1.banks"])).toBe(false);
    expect(routeShrouded(["api", "broker", "orders"], [])).toBe(false);
    expect(routeShrouded(["api", "world"], [])).toBe(false);
    expect(routeShrouded(["api", "wire"], [])).toBe(false);
  });

  it("the query is read only when QUAY_HOOKS is on", async () => {
    vi.resetModules();
    vi.stubEnv("QUAY_HOOKS", "0");
    const off = await import("@/shell/v1Shroud");
    expect(off.flagsFromSearch(new URLSearchParams("flags=v1.banks"))).toEqual([]);
    vi.resetModules();
    vi.stubEnv("QUAY_HOOKS", "1");
    const on = await import("@/shell/v1Shroud");
    expect(on.flagsFromSearch(new URLSearchParams("flags=v1.banks,v1.ailab"))).toEqual(["v1.banks", "v1.ailab"]);
    vi.unstubAllEnvs();
  });

  it("shrouded API prefixes 404 and do not describe a mutation; in-scope paths are left alone", () => {
    const denied = refuseShroudedApi("/api/bank", []);
    expect(denied?.status).toBe(404);
    expect(refuseShroudedApi("/api/bank/", [])?.status).toBe(404);
    expect(refuseShroudedApi("/api/credit/draw", [])?.status).toBe(404);
    expect(refuseShroudedApi("/api/bank", ["v1.banks"])).toBeNull();
    expect(refuseShroudedApi("/api/broker/orders", [])).toBeNull();
    expect(refuseShroudedApi("/api/world", [])).toBeNull();
    expect(refuseShroudedApi("/api/wire", [])).toBeNull();
  });
});

describe("M1-11 route list stays classified", () => {
  const files = walk(join(ROOT, "src/app"));
  const routes = files.filter((f) => f.endsWith("/route.ts"));
  const pages = files.filter((f) => f.endsWith("/page.tsx"));

  it("page.tsx files are exactly the allowlist, and the catch-all calls the shroud", () => {
    expect([...pages].sort()).toEqual([...ALLOWED_PAGES].sort());
    const catchAll = readFileSync(join(ROOT, "src/app/[[...route]]/page.tsx"), "utf8");
    expect(catchAll).toContain("routeShrouded");
    expect(catchAll).toContain("notFound");
  });

  it("every route.ts is in-scope, or a shrouded prefix that calls refuseShroudedApi", () => {
    const ids = routes.map((f) => f.slice("src/app/".length, -"/route.ts".length));
    const api = ids.filter((id) => id.startsWith("api/"));
    const other = ids.filter((id) => !id.startsWith("api/"));
    expect(other.sort()).toEqual([...IN_SCOPE_OTHER_ROUTES].sort());
    const inScope = new Set<string>(IN_SCOPE_API_ROUTES);
    const extras = api.filter((id) => !inScope.has(id));
    for (const id of extras) {
      const path = `/${id}`;
      expect(SHROUDED_API.some((g) => path === g.path || path.startsWith(`${g.path}/`)), `${id} is unclassified`).toBe(true);
      expect(readFileSync(join(ROOT, "src/app", id, "route.ts"), "utf8")).toContain("refuseShroudedApi");
    }
    expect(api.filter((id) => inScope.has(id)).sort()).toEqual([...IN_SCOPE_API_ROUTES].sort());
  });

  it("shrouded apps have no body module and no src/apps directory", () => {
    const built = new Set(Object.keys(APP_MODULES));
    for (const id of shroudedAppIds()) {
      expect(built.has(id), id).toBe(false);
      expect(readFileSync(join(ROOT, "src/shell/appModules.ts"), "utf8")).not.toContain(`@/apps/${id}`);
    }
    const dirs = readdirSync(join(ROOT, "src/apps"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    expect(dirs).toEqual(["boards", "broker", "city", "launchpad", "portfolio", "settings", "wire"]);
    for (const id of built) expect(shroudedAppIds()).not.toContain(id as AppId);
  });

  it("the read-only district does not import the 3D city window", () => {
    const src = readFileSync(join(ROOT, "src/apps/city/DistrictView.tsx"), "utf8");
    expect(src).not.toMatch(/import\s+.*CityWindow/);
    expect(src).not.toContain("createShellCityRenderer");
  });
});
