// M2-01/02: a new player sees the grow-$10k goal and the first-trade guide; the guide's buttons only open Wire/Broker;
// an unfilled order says it is waiting; only a real server fill turns the guide into "First trade done" with that fill's
// words; Positions hold it. Hide is per account on this device and survives a reload; another account still has its
// guide; a guest gets the sign-in sentence and no guide. Phone 390 home names the goal and opens the guide; a 520
// Portfolio window fits. Real timers against the production build. Repo CI evidence only, not the desktop played gate.
import { mkdirSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const SHOTS = process.env.GUIDE_SHOTS_DIR ?? "";
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}
type Ledger = { cashCents: number; positions: Record<string, { qty: string }>; orders: Record<string, unknown>; fills: { fillId: string; tick: number; side: string; qty: string; price: string; fee: string; assetId: string }[] };
async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-guide-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
const ledger = async (r: APIRequestContext) => (await (await r.get("/api/broker/me")).json()) as Ledger;
const goal = (page: Page) => page.getByTestId("pf-goal").first();
const br = (page: Page) => page.getByTestId("win-broker").getByTestId("broker").first();

async function place(page: Page, qty: string, limit?: string) {
  const b = br(page);
  await expect(b).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  await b.getByTestId("br-side-buy").click();
  await b.getByTestId(limit ? "br-type-limit" : "br-type-market").click();
  if (limit) await b.getByTestId("br-price-limit").fill(limit);
  await b.getByTestId("br-qty").fill(qty);
  await expect(b.getByTestId("br-review")).toBeEnabled({ timeout: 10_000 });
  await b.getByTestId("br-review").click();
  await expect(page.getByTestId("br-place").first()).toBeEnabled({ timeout: 12_000 });
  await page.getByTestId("br-place").first().click();
  await expect(b.getByTestId("br-ack")).toBeVisible({ timeout: 10_000 });
}

test("desktop: goal + guide → Open Broker → waiting order is not done → a real fill is done → Positions; hide survives reload; B; guest", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop journey");
  test.setTimeout(150_000);
  const stamp = Date.now().toString(36);
  const a = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const b = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const g = await guest.newPage();
    await g.goto("/");
    await expect(g.getByTestId("pf-goal-guest")).toHaveText("Sign in to start with $10,000 in game money and a goal of $20,000.", { timeout: 20_000 });
    await expect(g.getByTestId("pf-goal")).toHaveCount(0);

    await register(a.request, baseURL!, `GdA${stamp}`);
    const page = await a.newPage();
    const t0 = Date.now();
    await page.goto("/");
    await expect(goal(page)).toHaveAttribute("data-stage", "start", { timeout: 20_000 });
    await expect(page.getByTestId("pf-guide-steps")).toBeVisible();
    const seenMs = Date.now() - t0;
    expect(seenMs).toBeLessThan(30_000);
    await expect(page.getByTestId("pf-goal-line")).toHaveText("Grow your $10,000 to $20,000 (Hustler).");
    await expect(page.getByTestId("pf-goal-now")).toHaveText("Saved net worth now $10,000.00 of $20,000.00");
    await expect(page.getByTestId("pf-goal-bar")).toHaveAttribute("aria-valuenow", "0");
    await shot(page, "g01-desktop-fresh");

    // Keyboard: the guide's Open Broker is a real button reached by focus, and Enter opens Broker (nothing is placed).
    await page.getByTestId("pf-guide-open-broker").focus();
    await page.keyboard.press("Enter");
    await expect(br(page)).toBeVisible();
    await expect(page.getByTestId("win-broker")).toHaveCount(1); // the Trade layout's Broker came to the front, no second one
    expect((await ledger(a.request)).fills).toEqual([]);
    await br(page).getByTestId("br-asset-select").selectOption("HALC");

    // A resting limit far under the mark: placed, not filled → "waiting", not done.
    await place(page, "1", "1.00");
    await expect(goal(page)).toHaveAttribute("data-stage", "waiting", { timeout: 15_000 });
    await expect(page.getByTestId("pf-guide-waiting")).toHaveText("You have an open order. It counts once it fills.");
    const [orderId] = Object.keys((await ledger(a.request)).orders);
    expect((await a.request.post("/api/broker/orders/cancel", { headers: { origin: baseURL! }, data: { idempotencyKey: `gd-cx-${stamp}`, orderId } })).status()).toBe(200);
    await expect(goal(page)).toHaveAttribute("data-stage", "start", { timeout: 15_000 });
    await br(page).getByTestId("br-new").click();

    // The real fill: done, with that fill's words.
    await place(page, "3");
    const f = (await ledger(a.request)).fills.at(-1)!;
    await expect(goal(page)).toHaveAttribute("data-stage", "done", { timeout: 15_000 });
    await expect(page.getByTestId("pf-guide-fill")).toHaveText(`Bought 3 HALC at ${f.price} · fee ${f.fee} FDL.`);
    await shot(page, "g02-desktop-done");
    await page.getByTestId("portfolio").first().getByTestId("pf-tab-positions").click();
    await expect(page.locator('[data-testid="pos-row"][data-asset="HALC"]').first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("portfolio").first().getByTestId("pf-tab-overview").click();

    // Hide survives a reload (this device, this account); the goal stays.
    await page.getByTestId("pf-guide-hide").click();
    await page.reload();
    await expect(goal(page)).toHaveAttribute("data-stage", "done", { timeout: 20_000 });
    await expect(page.getByTestId("pf-guide")).toHaveCount(0);
    await expect(page.getByTestId("pf-guide-show")).toBeVisible();
    await expect(page.getByTestId("pf-goal-line")).toBeVisible();

    // Another account: its own fresh guide (not A's hide, not A's fill).
    await register(b.request, baseURL!, `GdB${stamp}`);
    const pb = await b.newPage();
    await pb.goto("/");
    await expect(goal(pb)).toHaveAttribute("data-stage", "start", { timeout: 20_000 });
    await expect(pb.getByTestId("pf-guide-steps")).toBeVisible();
    await expect(pb.getByTestId("pf-goal-now")).toHaveText("Saved net worth now $10,000.00 of $20,000.00");
  } finally {
    await a.close(); await b.close(); await guest.close();
  }
});

test("phone 390 home names the goal and opens the guide; a 520 Portfolio window fits", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone project runs both layouts once");
  test.setTimeout(90_000);
  const stamp = Date.now().toString(36);
  const P = `GdP${stamp}`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await register(ctx.request, baseURL!, P);
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByTestId("phone-goal")).toHaveText("Goal: grow $10,000 to $20,000.", { timeout: 20_000 });
    const btn = page.getByTestId("phone-first-trade-guide");
    expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await btn.click();
    await expect(goal(page)).toHaveAttribute("data-stage", "start", { timeout: 20_000 });
    for (const id of ["pf-guide-open-wire", "pf-guide-open-broker", "pf-guide-hide"]) {
      await page.getByTestId(id).scrollIntoViewIfNeeded();
      const bx = (await page.getByTestId(id).boundingBox())!;
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-testid]")?.getAttribute("data-testid"), [bx.x + bx.width / 2, bx.y + bx.height / 2]);
      expect(hit, id).toBe(id); // not under the tab bar or another layer
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await shot(page, "g03-phone-390-guide");

    expect((await desk.request.post("/api/auth/login", { headers: { origin: baseURL! }, data: { handle: P, password: "local-guide-test" } })).status()).toBe(200);
    const d = await desk.newPage();
    await d.goto("/");
    const win = d.getByTestId("win-portfolio").first();
    await expect(win.getByTestId("pf-goal")).toBeVisible({ timeout: 20_000 });
    const h = (await win.getByTestId("resize-handle").boundingBox())!, box = (await win.boundingBox())!;
    await d.mouse.move(h.x + 5, h.y + 5); await d.mouse.down(); await d.mouse.move(h.x + 5 - (box.width - 520), h.y + 5, { steps: 5 }); await d.mouse.up();
    await expect.poll(async () => Math.round((await win.boundingBox())!.width)).toBe(520);
    expect(await win.evaluate((el) => [...el.querySelectorAll('[data-testid="pf-goal"] *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible").length)).toBe(0);
    await shot(d, "g04-window-520");
  } finally {
    await ctx.close(); await desk.close();
  }
});
