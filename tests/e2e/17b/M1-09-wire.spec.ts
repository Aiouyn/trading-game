// M1-09: Wire stories that moved the shared server quotes. Against the production build and its real clock: a signed-in
// player's Wire lists exactly the server's stories (GET /api/wire), a realized story's detail shows the cause and the
// effect the server applied (from → to, %), Open in Broker lands on that asset, whose News tab shows the effect, and the
// server's own tick bar for that asset closes at the story's "to" price at the story's tick. Repeated reads and a reload
// change nothing (no duplicate story, same prices at the same tick). A failed first read says so with Retry; another
// account sees the same stories; a guest sees the labelled example feed. Phone 390 and a 520 window fit.
// Repo CI evidence only, not the desktop played gate.
import { mkdirSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const SHOTS = process.env.WIRE_SHOTS_DIR ?? "";
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}
interface Effect { assetId: string; from: string; to: string; pct: string }
interface Item { id: string; tick: number; phase?: string; effects?: Effect[]; entities: { id: string; label: string }[] }
interface Wire { worldId: string; epoch: string; tick: number; items: Item[] }
const wire = async (r: APIRequestContext) => (await (await r.get("/api/wire")).json()) as Wire;
async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-wire-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
/** Wait for the clock to publish a realized story (one every 30 s; the first 30 s after the server starts). */
async function realized(r: APIRequestContext): Promise<{ w: Wire; item: Item }> {
  let w = await wire(r);
  for (let i = 0; i < 90 && !w.items.some((x) => x.effects?.length); i++) { await new Promise((ok) => setTimeout(ok, 1000)); w = await wire(r); }
  const item = [...w.items].reverse().find((x) => x.effects?.length);
  expect(item, JSON.stringify(w)).toBeTruthy();
  return { w, item: item! };
}
const pctText = (p: string) => (p.startsWith("-") ? `−${p.slice(1)}%` : `+${p}%`);
const rowIds = (page: Page) => page.locator('[data-testid="wire-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
async function openWire(page: Page) {
  await page.goto("/wire");
  await expect(page.getByTestId("wire").first()).toHaveAttribute("data-state", "live", { timeout: 20_000 });
}
/** The DOM rows are exactly the server's stories, newest first (polled: a new story may land between reads). */
async function rowsMatch(page: Page, r: APIRequestContext) {
  await expect.poll(async () => {
    const [ids, w] = await Promise.all([rowIds(page), wire(r)]);
    const want = [...w.items].sort((a, b) => b.tick - a.tick).map((x) => x.id);
    return JSON.stringify(ids) === JSON.stringify(want) && new Set(ids).size === ids.length ? "ok" : JSON.stringify({ ids, want });
  }, { timeout: 20_000 }).toBe("ok");
}

test("desktop: story → cause and applied effect → Broker → the server's tick bar; repeat reads, reload, Retry, other account, guest", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop journey");
  test.setTimeout(180_000);
  const stamp = Date.now().toString(36);
  const a = await browser.newContext(), b = await browser.newContext(), guest = await browser.newContext();
  try {
    await register(a.request, baseURL!, `WiA${stamp}`);
    await register(b.request, baseURL!, `WiB${stamp}`);
    const { w, item } = await realized(a.request);
    expect(w.worldId).toBe("world_port_avalon");
    const page = await a.newPage();
    await openWire(page);
    await expect(page.getByTestId("wire-demo")).toHaveCount(0);
    await rowsMatch(page, a.request);
    expect((await rowIds(page)).some((id) => /^n-/.test(id ?? ""))).toBe(false);
    await shot(page, "w01-signed-in-feed");

    // The realized story: cause, and each effect exactly as the server logged it.
    await page.locator(`[data-testid="wire-row"][data-id="${item.id}"] [data-testid="wire-open"]`).click();
    const detail = page.getByTestId("wire-detail");
    await expect(detail).toHaveAttribute("data-id", item.id);
    await expect(detail.getByTestId("wire-detail-cause")).toBeVisible();
    const lines = detail.getByTestId("wire-effect-line");
    await expect(lines).toHaveCount(item.effects!.length);
    for (const [i, e] of item.effects!.entries()) {
      const label = item.entities.find((x) => x.id === e.assetId)!.label;
      await expect(lines.nth(i)).toHaveText(`${label} ${e.from} → ${e.to} (${pctText(e.pct)})`);
    }
    await expect(detail.getByTestId("wire-effect-applied")).toContainText("Applied once by the Port Avalon market at");
    await shot(page, "w02-realized-detail");

    // The server's own record of that tick: the tick bar of the first effect's asset closes at "to".
    const e0 = item.effects![0]!;
    const bars = (await (await a.request.get(`/api/market/candles?assetId=${e0.assetId}&res=tick&from=${item.tick}&to=${item.tick}`)).json()) as { bars: { t: number; c: string }[] };
    expect(bars.bars.find((x) => x.t === item.tick)?.c, JSON.stringify(bars)).toBe(e0.to);

    // Open in Broker: the asset; its News tab names the story with the effect on that asset.
    await detail.locator(`[data-testid="wire-asset"][data-id="${e0.assetId}"] [data-testid="wire-open-broker"]`).click();
    const br = page.getByTestId("win-broker").first();
    await expect(br.getByTestId("br-ticker")).toHaveText(e0.assetId, { timeout: 15_000 });
    await br.getByTestId("br-view-about").click();
    await br.getByTestId("br-about-tabs-news").click();
    const story = br.locator(`[data-testid="ap-story"][data-id="${item.id}"]`);
    await expect(story.getByTestId("ap-story-effect")).toHaveText(pctText(e0.pct));
    await shot(page, "w03-broker-news-effect");

    // Repeated reads at one tick: same stories, same quotes; never a second copy of a story.
    const m0 = await (await a.request.get("/api/market")).json() as { tick: number };
    const reads = await Promise.all(Array.from({ length: 6 }, () => wire(a.request)));
    const m1 = await (await a.request.get("/api/market")).json() as { tick: number };
    if (m0.tick === m1.tick) for (const r of reads) expect(r.items).toEqual(reads[0]!.items);
    for (const r of reads) expect(new Set(r.items.map((x) => x.id)).size).toBe(r.items.length);
    const again = (await wire(a.request)).items.find((x) => x.id === item.id);
    expect(again).toEqual(item); // a story never changes or re-applies after it is published

    // Reload: the same server list.
    await openWire(page);
    await rowsMatch(page, a.request);

    // INJECTED: the first Wire read fails -> error + Retry, no rows; Retry reads again.
    await page.route("**/api/wire", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    await page.goto("/wire");
    await expect(page.getByTestId("wire-error")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("wire-row")).toHaveCount(0);
    await shot(page, "w04-injected-500");
    await page.unroute("**/api/wire");
    await page.getByTestId("wire-retry").click();
    await expect(page.getByTestId("wire").first()).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    await rowsMatch(page, a.request);

    // Another account: the same world, the same stories.
    const pb = await b.newPage();
    await openWire(pb);
    await rowsMatch(pb, b.request);
    expect((await wire(b.request)).epoch).toBe((await wire(a.request)).epoch);

    // Guest: the labelled example feed (fixtures), none of the server's stories.
    const g = await guest.newPage();
    await g.goto("/wire");
    await expect(g.getByTestId("wire-demo")).toContainText("Example stories");
    const gIds = await rowIds(g);
    expect(gIds.length).toBeGreaterThan(0);
    expect(gIds.every((id) => /^n-/.test(id ?? ""))).toBe(true);
    await shot(g, "w05-guest-demo");
  } finally {
    await a.close(); await b.close(); await guest.close();
  }
});

test("phone 390 and a 520 window: the story and its effect fit", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone project runs both layouts once");
  test.setTimeout(150_000);
  const stamp = Date.now().toString(36);
  const P = `WiP${stamp}`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await register(ctx.request, baseURL!, P);
    const { item } = await realized(ctx.request);
    const page = await ctx.newPage();
    await openWire(page);
    await rowsMatch(page, ctx.request);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.locator(`[data-testid="wire-row"][data-id="${item.id}"] [data-testid="wire-open"]`).click();
    await expect(page.getByTestId("wire-effect-line")).toHaveCount(item.effects!.length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await shot(page, "w06-phone-390-detail");

    expect((await desk.request.post("/api/auth/login", { headers: { origin: baseURL! }, data: { handle: P, password: "local-wire-test" } })).status()).toBe(200);
    const d = await desk.newPage();
    await openWire(d);
    const win = d.getByTestId("win-wire").first();
    const h = (await win.getByTestId("resize-handle").boundingBox())!, box = (await win.boundingBox())!;
    await d.mouse.move(h.x + 5, h.y + 5); await d.mouse.down(); await d.mouse.move(h.x + 5 - (box.width - 520), h.y + 5, { steps: 5 }); await d.mouse.up();
    await expect.poll(async () => Math.round((await win.boundingBox())!.width)).toBe(520);
    await d.locator(`[data-testid="wire-row"][data-id="${item.id}"] [data-testid="wire-open"]`).click();
    await expect(win.getByTestId("wire-effect-line")).toHaveCount(item.effects!.length);
    expect(await win.evaluate((el) => [...el.querySelectorAll('[data-testid="wire-detail"] *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible").length)).toBe(0);
    await shot(d, "w07-window-520-detail");
  } finally {
    await ctx.close(); await desk.close();
  }
});
