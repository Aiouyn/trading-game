// M1-05: two signed-in accounts on world_port_avalon see one server clock.
// Real timers. The preview process owns the cadence; this spec only reads it.
import { existsSync, mkdirSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { bookAtUiTick } from "./tickBound";

const ARTIFACTS = "/opt/cursor/artifacts";

type MarketBody = {
  worldId: string;
  marketSeed: number;
  tick: number;
  tickMs: number;
  quotes: { listId: string; rows: Record<string, { assetId: string; last: string }> };
};

async function shot(page: Page, name: string) {
  const buf = await page.screenshot({ fullPage: false });
  await test.info().attach(name, { body: buf, contentType: "image/png" });
  if (existsSync(ARTIFACTS)) {
    mkdirSync(ARTIFACTS, { recursive: true });
    await page.screenshot({ path: `${ARTIFACTS}/${name}.png` });
  }
}

async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", {
    headers: { origin: baseURL },
    data: { handle, password: "local-tick-test" },
  });
  expect(res.status(), await res.text()).toBe(201);
}

async function market(request: APIRequestContext): Promise<MarketBody> {
  const res = await request.get("/api/market");
  expect(res.status()).toBe(200);
  return res.json() as Promise<MarketBody>;
}

function liveBroker(page: Page) {
  // The trade layout can mount more than one broker window. The signed-in one shows the server tick.
  return page.getByTestId("broker").filter({ has: page.getByTestId("market-tick") }).first();
}

async function uiQuotes(page: Page): Promise<{ tick: string; world: string; clock: string; lasts: Record<string, string> }> {
  const broker = liveBroker(page);
  await expect(broker).toBeVisible({ timeout: 20_000 });
  await expect(broker).toHaveAttribute("data-state", "live");
  const tickEl = broker.getByTestId("market-tick");
  for (let attempt = 0; attempt < 4; attempt++) {
    const before = (await tickEl.getAttribute("data-tick")) ?? "";
    const world = (await tickEl.getAttribute("data-world-id")) ?? "";
    const clock = (await page.getByTestId("clock").getAttribute("data-tick")) ?? "";
    const select = broker.getByTestId("br-asset-select");
    const ids = await select.locator("option").evaluateAll((options) => options.map((o) => o.getAttribute("value") ?? ""));
    const lasts: Record<string, string> = {};
    for (const id of ids) {
      await select.selectOption(id);
      lasts[id] = (await broker.getByTestId("br-last").innerText()).replace(/,/g, "");
    }
    const after = (await tickEl.getAttribute("data-tick")) ?? "";
    if (before !== "" && before === after) return { tick: after, world, clock, lasts };
  }
  throw new Error("server tick changed while reading the ten quotes");
}

/** Both browsers and GET /api/market on one tick. Retries when the 5s clock steps mid-read. */
async function sameBook(pageA: Page, pageB: Page, request: APIRequestContext) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const left = await uiQuotes(pageA);
      const right = await uiQuotes(pageB);
      const book = await market(request);
      last = `A ${left.tick} B ${right.tick} server ${book.tick}`;
      if (left.tick !== right.tick || left.tick !== String(book.tick)) continue;
      if (left.clock !== left.tick || right.clock !== right.tick) continue;
      if (left.world !== book.worldId || right.world !== book.worldId) continue;
      expect(left.lasts).toEqual(right.lasts);
      for (const [id, row] of Object.entries(book.quotes.rows)) expect(left.lasts[id], id).toBe(row.last);
      return left;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(`the two accounts did not settle on one server book (${last})`);
}

test("two accounts share server quotes across refresh and reconnect; cash stays private", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop quote proof; the phone shell uses the same feed");
  test.setTimeout(150_000);
  const stamp = Date.now().toString(36);
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    await register(a.request, baseURL!, `TickA${stamp}`);
    await register(b.request, baseURL!, `TickB${stamp}`);
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await pageA.goto("/broker");
    await pageB.goto("/broker");

    const metaA = await market(a.request);
    const metaB = await market(b.request);
    expect(metaA).toEqual(metaB);
    expect(metaA.worldId).toBe("world_port_avalon");
    expect(metaA.marketSeed).toBe(17);
    expect(metaA.tickMs).toBe(5000);
    expect(Object.keys(metaA.quotes.rows)).toHaveLength(10);
    const first = await sameBook(pageA, pageB, a.request);
    expect(first.world).toBe("world_port_avalon");
    expect(Object.keys(first.lasts)).toHaveLength(10);
    await shot(pageA, "m1-05-a-broker");
    await shot(pageB, "m1-05-b-broker");

    await expect.poll(async () => (await market(a.request)).tick, { timeout: 15_000, intervals: [250] }).toBeGreaterThan(Number(first.tick));
    const mid = await sameBook(pageA, pageB, a.request);
    expect(Number(mid.tick)).toBeGreaterThan(Number(first.tick));
    expect(mid.lasts).not.toEqual(first.lasts);
    await shot(pageA, "m1-05-a-after-tick");

    await pageA.reload();
    const refreshed = await sameBook(pageA, pageB, a.request);
    expect(Number(refreshed.tick)).toBeGreaterThanOrEqual(Number(mid.tick));
    await shot(pageA, "m1-05-a-refresh");

    const beforeOutage = Number(refreshed.tick);
    await pageA.context().setOffline(true);
    await pageA.waitForTimeout(6_500);
    await pageA.context().setOffline(false);
    await expect.poll(async () => (await market(a.request)).tick, { timeout: 12_000, intervals: [250] }).toBeGreaterThan(beforeOutage);
    const reconnected = await sameBook(pageA, pageB, a.request);
    expect(Number(reconnected.tick)).toBeGreaterThan(beforeOutage);
    await shot(pageA, "m1-05-a-reconnect");

    const meA = await (await a.request.get("/api/auth/me")).json();
    const meB = await (await b.request.get("/api/auth/me")).json();
    expect(meA.account.accountId).not.toBe(meB.account.accountId);
    expect(meA.player.cashCents).toBe(1_000_000);
    expect(meB.player.cashCents).toBe(1_000_000);
    expect(meA.player.accountId).toBe(meA.account.accountId);
    expect(meB.player.accountId).toBe(meB.account.accountId);
    const posted = await a.request.post("/api/market", { data: { cashCents: 1 } });
    expect(posted.status()).toBe(405);
    expect((await (await a.request.get("/api/auth/me")).json()).player.cashCents).toBe(1_000_000);

    await pageA.goto("/settings/SET-01");
    await expect(pageA.getByTestId("account-disclaimer")).toContainText(/demo/i);
    await expect(pageA.getByTestId("account-disclaimer")).toContainText(/not saved/i);
    await expect(pageA.getByTestId("account-handle")).toHaveText(`TickA${stamp}`);
    await shot(pageA, "m1-05-a-disclaimer");
  } finally {
    await a.close();
    await b.close();
  }
});

test("a held and failed first market read stays unlabeled, then matches the other account", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop quote proof; the phone shell uses the same feed");
  test.setTimeout(90_000);
  const stamp = Date.now().toString(36);
  const ready = await browser.newContext();
  const late = await browser.newContext();
  try {
    await register(ready.request, baseURL!, `Ready${stamp}`);
    await register(late.request, baseURL!, `Late${stamp}`);
    const pageB = await ready.newPage();
    await pageB.goto("/broker");
    // One bracketed observation (tickBound.ts): GET, the UI caught up to that served tick within its poll (one server
    // tick at most), the UI read, GET again. The UI must equal, exactly, the book at whichever bracketing tick it shows.
    await expect(liveBroker(pageB)).toBeVisible({ timeout: 20_000 }); // the page's own first load, as uiQuotes allows
    const pre = await market(ready.request);
    await expect.poll(async () => Number(await liveBroker(pageB).getByTestId("market-tick").getAttribute("data-tick")), { timeout: pre.tickMs, intervals: [100] }).toBeGreaterThanOrEqual(pre.tick);
    const liveB = await uiQuotes(pageB);
    const post = await market(ready.request);
    const seen = bookAtUiTick(pre, liveB, post);
    expect(seen, `pre ${pre.tick}, UI ${liveB.tick}, post ${post.tick}`).toHaveProperty("book");
    const book = (seen as { book: MarketBody }).book;
    expect(liveB.world).toBe("world_port_avalon");

    const pageA = await late.newPage();
    let hits = 0;
    let releaseFirst: () => void = () => {};
    const held = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let markFirst: () => void = () => {};
    const firstSeen = new Promise<void>((resolve) => { markFirst = resolve; });
    await pageA.route("**/api/market", async (route) => {
      hits += 1;
      if (hits === 1) {
        markFirst();
        await held;
        await route.fulfill({ status: 503, contentType: "text/plain", body: "unavailable" });
        return;
      }
      await route.continue();
    });
    await pageA.goto("/broker");
    await firstSeen;
    await pageA.waitForTimeout(80);
    await expect(pageA.getByTestId("market-tick")).toHaveCount(0);
    await expect(pageA.getByTestId("br-loading").first()).toBeVisible();
    const during = await market(ready.request);
    expect(during.worldId).toBe("world_port_avalon");
    expect(during.tick).toBeGreaterThanOrEqual(book.tick);
    await shot(pageA, "m1-05-delay-loading");
    await shot(pageB, "m1-05-delay-other");

    releaseFirst();
    await expect.poll(async () => {
      const tick = await pageA.getByTestId("market-tick").first().getAttribute("data-tick");
      const serverTick = String((await market(ready.request)).tick);
      return tick !== null && tick === serverTick;
    }, { timeout: 12_000, intervals: [200] }).toBe(true);
    const recovered = await sameBook(pageA, pageB, ready.request);
    expect(Number(recovered.tick)).toBeGreaterThanOrEqual(book.tick);
    await shot(pageA, "m1-05-delay-recovered");
  } finally {
    await ready.close();
    await late.close();
  }
});
