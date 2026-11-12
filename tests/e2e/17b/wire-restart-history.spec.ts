// b3 (gatekeeper 20c3bb69 REVIEW.md:37/:47): the Wire must keep the stories published before a server restart.
// This spec owns its own production server (the already built .next, `next start`) on a private port with fresh data
// dirs, so it can SIGKILL and restart it without touching the suite's shared webServer. Same data dirs across the restart
// (auth store, storm-world store, telemetry). Kill is by the pid this spec spawned (REVIEW-LESSONS 13), never by name.
// Signed-in: /api/wire and the /wire rows still list every pre-restart story (same id, tick, headline), also after a
// reload. Guest: /wire shows the live world's day (not the day-39 example shell) and the pre-restart stories.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

const PORT = Number(process.env.WIRE_RESTART_PORT ?? 3411);
const BASE = `http://127.0.0.1:${PORT}`;
const TICKS_PER_DAY = 720;
const MIN_CATALOG = 3; // one catalog story every 6 ticks (30 s); 3 is ~90 s after boot
interface Item { id: string; tick: number; headlineKey: string; kind: string }
interface Wire { epoch: string; tick: number; items: Item[] }
const isCatalog = (i: Item) => /^w-\d+$/.test(i.id);

let dataRoot = "";
let server: ChildProcess | null = null;
let before: Wire | null = null;
let signedState: Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>> | null = null;

function startServer(): ChildProcess {
  const env = {
    ...process.env,
    QUAY_PUBLIC_HOST: `127.0.0.1:${PORT}`, // without it signup is refused on a non-default host
    QUAY_AUTH_DATA_DIR: path.join(dataRoot, "auth"),
    QUAY_STORM_DATA_DIR: path.join(dataRoot, "market"),
    QUAY_TELEMETRY_DIR: path.join(dataRoot, "telemetry"),
  };
  const child = spawn(process.execPath, [path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], { env, detached: true, stdio: "ignore" });
  return child;
}
function killServer(): void {
  const pid = server?.pid;
  if (pid) { try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ } }
  server = null;
}
async function waitUp(r: APIRequestContext) {
  await expect.poll(async () => (await r.get(`${BASE}/api/market`).catch(() => null))?.status() ?? 0, { timeout: 60_000, intervals: [500] }).toBe(200);
}
const wire = async (r: APIRequestContext) => (await (await r.get(`${BASE}/api/wire`)).json()) as Wire;
const rowIds = (page: Page) => page.locator('[data-testid="wire-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
const dayOf = (tick: number) => Math.floor(tick / TICKS_PER_DAY) + 1;

// Not serial: a red signed-in check must not skip the guest check (a failed test re-runs beforeAll on a new worker).
test.describe("b3: Wire history survives a production server restart", () => {
  test.beforeAll(async ({ browser, playwright }, info) => {
    test.skip(info.project.name !== "desktop", "one server lifecycle; desktop only");
    test.setTimeout(300_000);
    dataRoot = mkdtempSync(path.join(tmpdir(), "wire-restart-"));
    server = startServer();
    const r = await playwright.request.newContext();
    await waitUp(r);
    const ctx = await browser.newContext();
    const handle = `WrH${Date.now().toString(36)}`.slice(0, 20);
    const reg = await ctx.request.post(`${BASE}/api/auth/register`, { headers: { origin: BASE }, data: { handle, password: "local-wire-restart" } });
    expect(reg.status(), await reg.text()).toBe(201);
    let w = await wire(r);
    for (let i = 0; i < 240 && w.items.filter(isCatalog).length < MIN_CATALOG; i++) { await new Promise((ok) => setTimeout(ok, 1000)); w = await wire(r); }
    expect(w.items.filter(isCatalog).length, JSON.stringify(w)).toBeGreaterThanOrEqual(MIN_CATALOG);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/wire`);
    await expect(page.getByTestId("wire").first()).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    await expect.poll(async () => { const ids = await rowIds(page); return w.items.every((x) => ids.includes(x.id)); }, { timeout: 20_000 }).toBe(true);
    before = w;
    signedState = await ctx.storageState();
    await ctx.close();
    killServer(); // SIGKILL: no shutdown hook runs
    await new Promise((ok) => setTimeout(ok, 1500));
    server = startServer();
    await waitUp(r);
    await r.dispose();
  });
  test.afterAll(() => {
    killServer();
    if (dataRoot) rmSync(dataRoot, { recursive: true, force: true });
  });

  test("signed-in: /api/wire and /wire still list every pre-restart story, also after a reload", async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ storageState: signedState! });
    try {
      const after = await wire(ctx.request);
      expect(after.tick).toBeGreaterThanOrEqual(before!.tick); // the clock resumed, it did not restart from day 39
      const lost = before!.items.filter((x) => !after.items.some((y) => y.id === x.id && y.tick === x.tick && y.headlineKey === x.headlineKey));
      expect(lost.map((x) => `${x.id}@${x.tick} ${x.headlineKey}`), "stories lost by the restart (api)").toEqual([]);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/wire`);
      await expect(page.getByTestId("wire").first()).toHaveAttribute("data-state", "live", { timeout: 20_000 });
      await expect(page.getByTestId("wire-demo")).toHaveCount(0);
      const want = before!.items.map((x) => x.id);
      await expect.poll(async () => { const ids = await rowIds(page); return want.filter((id) => !ids.includes(id)); }, { timeout: 20_000, message: "rows lost by the restart (ui)" }).toEqual([]);
      await page.reload();
      await expect(page.getByTestId("wire").first()).toHaveAttribute("data-state", "live", { timeout: 20_000 });
      await expect.poll(async () => { const ids = await rowIds(page); return want.filter((id) => !ids.includes(id)); }, { timeout: 20_000, message: "rows lost by the restart (ui, after reload)" }).toEqual([]);
    } finally { await ctx.close(); }
  });

  test("guest: /wire shows the live day and the pre-restart stories, not the day-39 example shell", async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext();
    try {
      const live = await wire(ctx.request);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/wire`);
      await expect(page.getByTestId("wire").first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("clock").first()).toContainText(`Day ${dayOf(live.tick)}`, { timeout: 20_000 });
      // A fresh world is still on day 39, so the day alone cannot tell the example shell (frozen at START_TICK 27700)
      // from the live clock: the shown tick must be the live world's tick (within one 5 s step of the read).
      await expect.poll(async () => {
        const shownTick = Number(await page.getByTestId("clock").first().getAttribute("data-tick"));
        const now = (await wire(ctx.request)).tick;
        return Math.abs(now - shownTick) <= 1 ? "live" : `guest clock tick ${shownTick} vs live ${now}`;
      }, { timeout: 20_000, message: "guest clock is not the live world clock" }).toBe("live");
      const want = before!.items.map((x) => x.id);
      await expect.poll(async () => { const ids = await rowIds(page); return want.filter((id) => !ids.includes(id)); }, { timeout: 20_000, message: "guest rows missing pre-restart stories" }).toEqual([]);
    } finally { await ctx.close(); }
  });
});
