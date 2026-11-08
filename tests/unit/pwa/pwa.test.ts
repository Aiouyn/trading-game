// M2-05: manifest, icon, offline screen and service worker rules (docs/v1/PWA.md). The real browser behaviour is
// proven against the plain production build (evidence journey); these pin the rules so a change cannot slip in.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "@/app/manifest";
import { GET } from "@/app/sw.js/route";
import { quay } from "@/components/shell/glyphs/ui";
import { registerServiceWorker } from "@/pwa/register";
import { SW_ALLOWLIST, SW_CACHE_PREFIX, swSource } from "@/pwa/swSource";

const ORIGIN = "https://quay.test";
const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
const token = (name: string) => read("src/styles/tokens.css").match(new RegExp(`--${name}: (#[0-9A-F]{6});`))![1];

describe("manifest + icon", () => {
  it("is installable-shaped: standalone at /, scope /, name, short name, theme from the --bg0 token, one SVG icon", () => {
    const m = manifest();
    expect(m).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone", name: "Quay · Port Avalon", short_name: "Quay" });
    expect(m.theme_color).toBe(token("bg0"));
    expect(m.background_color).toBe(token("bg0"));
    expect(m.icons).toEqual([{ src: "/quay-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]);
  });
  it("the icon is the existing quay glyph on the --bg0 / --fg tokens (no new art)", () => {
    const svg = read("public/quay-icon.svg");
    expect([...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1])).toEqual([...quay]);
    expect(svg).toContain(`fill="${token("bg0")}"`);
    expect(svg).toContain(`stroke="${token("fg")}"`);
  });
});

describe("offline screen", () => {
  const html = read("public/offline.html");
  it("is static and truthful: no figures in its markup, reads only the snapshot record, a status line and a keyboard button", () => {
    const text = html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>|<[^>]+>/g, " ");
    expect(text).not.toMatch(/\$|\d+\.\d|net worth|balance:/i);
    expect(text).toContain("You're offline");
    expect(text).toContain("Nothing is sent or queued while you're offline.");
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/<button type="button" id="reload"/);
    // Storage: it only READS the one sanitised `me` snapshot record (src/pwa/meSnapshot.ts); never writes, no other store,
    // no cookies, no Cache Storage; it renders with textContent only.
    expect(html.match(/localStorage/g)).toHaveLength(1);
    expect(html).toContain(`window.localStorage.getItem("quay.offline.me.v1")`);
    expect(html).not.toMatch(/XMLHttpRequest|setItem|removeItem|sessionStorage|indexedDB|caches\.|serviceWorker|document\.cookie|innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    // The one request: a reachability probe of the public manifest, uncached and without cookies.
    expect(html.match(/fetch\(/g)).toHaveLength(1);
    expect(html).toContain(`fetch("/manifest.webmanifest?reachable=" + Date.now(), { cache: "no-store", credentials: "omit" })`);
    expect(html).toMatch(/show\(false\);\n\s+probe\(\);/); // starts Offline, then asks
  });
  it("never reloads by itself: location.reload only runs from the button's click", () => {
    expect(html.match(/location\.reload/g)).toHaveLength(1);
    expect(html).toMatch(/btn\.addEventListener\("click", function \(\) \{ location\.reload\(\); \}\);/);
    expect(html).not.toMatch(/setTimeout|location\.(href|assign|replace)\s*[=(]/);
    expect(html.match(/setInterval\(([^)]*)\)/)![1]).toBe("probe, 10000"); // the only timer only probes
  });
});

type Handler = (e: FakeEvent) => void;
type FakeEvent = { request?: Request; respondWith: (p: Promise<Response>) => void; waitUntil: (p: Promise<unknown>) => void; responded?: Promise<Response>; waited?: Promise<unknown> };
function worker(version = "abc1234", net: (r: Request) => Promise<Response> = async () => new Response("net")) {
  const store = new Map<string, Map<string, Response>>();
  const added: string[] = [];
  const deleted: string[] = [];
  let puts = 0;
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const c = store.get(name)!;
      return {
        addAll: async (reqs: Request[]) => { for (const r of reqs) { const p = new URL(r.url, ORIGIN).pathname; added.push(p); c.set(p, new Response(`cached ${p}`)); } },
        put: async () => { puts += 1; },
      };
    },
    keys: async () => [...store.keys()],
    delete: async (k: string) => { deleted.push(k); return store.delete(k); },
    match: async (path: string, o?: { cacheName?: string }) => store.get(o?.cacheName ?? "")?.get(path),
  };
  const handlers: Record<string, Handler> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (t: string, h: Handler) => { handlers[t] = h; },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  };
  const fetch = vi.fn(net);
  const RequestAt = class extends Request { constructor(u: string, i?: RequestInit) { super(new URL(u, ORIGIN), i); } };
  new Function("self", "caches", "fetch", "Request", "Response", swSource(version))(self, caches, fetch, RequestAt, Response);
  const fire = async (type: string, request?: Request) => {
    const e: FakeEvent = { request, respondWith: (p) => { e.responded = p; }, waitUntil: (p) => { e.waited = p; } };
    handlers[type](e);
    await e.waited;
    return e;
  };
  return { store, added, deleted, puts: () => puts, self, fetch, fire };
}
const nav = (path: string) => { const r = new Request(ORIGIN + path); Object.defineProperty(r, "mode", { value: "navigate" }); return r; };

describe("service worker", () => {
  it("install precaches exactly the allowlist into quay-static-<version>; activate drops only older quay-static caches", async () => {
    const w = worker("v2");
    w.store.set(`${SW_CACHE_PREFIX}v1`, new Map());
    w.store.set("someone-else", new Map());
    await w.fire("install");
    expect(w.added).toEqual([...SW_ALLOWLIST]);
    expect(w.self.skipWaiting).toHaveBeenCalled();
    await w.fire("activate");
    expect(w.deleted).toEqual([`${SW_CACHE_PREFIX}v1`]);
    expect([...w.store.keys()].sort()).toEqual([`${SW_CACHE_PREFIX}v2`, "someone-else"]);
    expect(w.self.clients.claim).toHaveBeenCalled();
  });
  it("never handles writes, cross-origin, API, _next or RSC requests (they go straight to the network)", async () => {
    const w = worker();
    await w.fire("install");
    for (const r of [
      new Request(ORIGIN + "/api/broker/intents", { method: "POST", body: "{}" }),
      new Request(ORIGIN + "/api/auth/logout", { method: "POST" }),
      new Request("https://elsewhere.test/quay-icon.svg"),
      new Request(ORIGIN + "/api/broker/me"),
      new Request(ORIGIN + "/api/market"),
      new Request(ORIGIN + "/_next/static/chunks/app.js"),
      new Request(ORIGIN + "/broker?_rsc=1x2", { headers: { RSC: "1" } }),
      new Request(ORIGIN + "/quay-icon.svg?x=1"),
    ]) expect((await w.fire("fetch", r)).responded, `${r.method} ${r.url}`).toBeUndefined();
    expect(w.fetch).not.toHaveBeenCalled();
  });
  it("navigations are network-only and never stored; only a network failure shows the cached offline page", async () => {
    let online = true;
    const w = worker("v", async () => { if (!online) throw new TypeError("offline"); return new Response("<html>personal page</html>"); });
    await w.fire("install");
    expect(await (await (await w.fire("fetch", nav("/broker"))).responded!).text()).toBe("<html>personal page</html>");
    online = false;
    expect(await (await (await w.fire("fetch", nav("/portfolio"))).responded!).text()).toBe("cached /offline.html");
    expect(w.puts()).toBe(0);
    expect([...w.store.get(`${SW_CACHE_PREFIX}v`)!.keys()]).toEqual([...SW_ALLOWLIST]);
  });
  it("allowlisted assets are served from the cache; the source never stores anything at runtime", async () => {
    const w = worker();
    await w.fire("install");
    expect(await (await (await w.fire("fetch", new Request(ORIGIN + "/quay-icon.svg"))).responded!).text()).toBe("cached /quay-icon.svg");
    expect(swSource("x")).not.toMatch(/\.put\(|\.add\(|sync|postMessage|clients\.matchAll|navigate\(|\.reload\(/);
  });
  it("/sw.js is JavaScript, revalidated each load, versioned by the build SHA", async () => {
    const res = GET();
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toContain(JSON.stringify(SW_CACHE_PREFIX + (process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev")));
  });
});

describe("registration", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  const stubBrowser = () => {
    const register = vi.fn(async () => ({}));
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    vi.stubGlobal("document", { readyState: "complete" });
    vi.stubGlobal("window", { addEventListener: vi.fn() });
    return register;
  };
  it("registers /sw.js at scope / in a production build without hooks", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("QUAY_HOOKS", "0");
    const register = stubBrowser();
    registerServiceWorker();
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });
  it("never registers in dev/test or the e2e hooks build", () => {
    const register = stubBrowser();
    vi.stubEnv("NODE_ENV", "test"); registerServiceWorker();
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("QUAY_HOOKS", "1"); registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
  });
});
