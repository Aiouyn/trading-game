// M1-08: a signed-in player buys and sells in the Broker; Portfolio shows THEIR cash, holdings, cost basis, value,
// unrealized P&L and net worth from the saved server ledger at server quotes (checked against /api/broker/me and
// /api/market, valued here independently). Working limits neither hide nor double holdings or cash; a full sell clears
// the rows; refresh, a second account and the first again keep each ledger apart; a failed account read says so with
// Retry (no demo values); signed out, Portfolio is the labelled example. Phone 390 and the 520 window fit.
// Real timers against the production build. Repo CI evidence only, not the desktop played gate.
import { mkdirSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const SHOTS = process.env.PF_SHOTS_DIR ?? "";
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}
type Ledger = { tick: number; cashCents: number; reservedCashCents: number; positions: Record<string, { assetId: string; qty: string; avgCost: string }>; orders: Record<string, { orderId: string; side: string; status: string }>; fills: { side: string; qty: string; price: string; fee: string }[] };
async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-portfolio-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
async function ledger(request: APIRequestContext): Promise<Ledger> {
  const res = await request.get("/api/broker/me");
  expect(res.status()).toBe(200);
  return res.json() as Promise<Ledger>;
}
async function marks(request: APIRequestContext): Promise<Record<string, string>> {
  const m = await (await request.get("/api/market")).json() as { quotes: { rows: Record<string, { last: string }> } };
  return Object.fromEntries(Object.entries(m.quotes.rows).map(([k, v]) => [k, v.last]));
}
const cents = (s: string) => Math.round(Number(s) * 100);
const usd = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Independent valuation of the saved ledger at the server marks. */
async function valuation(request: APIRequestContext) {
  const [l, m] = await Promise.all([ledger(request), marks(request)]);
  let held = 0;
  const rows: Record<string, { qty: string; avg: string; value: string; pnl: number }> = {};
  for (const p of Object.values(l.positions)) {
    const q = Number(p.qty), mk = cents(m[p.assetId]!);
    held += q * mk;
    rows[p.assetId] = { qty: p.qty, avg: p.avgCost, value: usd(q * mk), pnl: (mk - cents(p.avgCost)) * q };
  }
  return { l, cash: usd(l.cashCents), nw: usd(l.cashCents + held), rows };
}

const br = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"]):has([data-testid="market-tick"])').first();
const pf = (page: Page) => page.getByTestId("portfolio").first();
async function trade(page: Page, side: "buy" | "sell", qty: string, limit?: string) {
  await page.goto("/broker?asset=HALC");
  const b = br(page);
  await expect(b).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  await b.getByTestId(`br-side-${side}`).click();
  await b.getByTestId(limit ? "br-type-limit" : "br-type-market").click();
  if (limit) await b.getByTestId("br-price-limit").fill(limit);
  await b.getByTestId("br-qty").fill(qty);
  await expect(b.getByTestId("br-review")).toBeEnabled({ timeout: 10_000 });
  await b.getByTestId("br-review").click();
  await expect(page.getByTestId("br-place").first()).toBeEnabled({ timeout: 12_000 });
  await page.getByTestId("br-place").first().click();
  await expect(b.getByTestId("br-ack")).toBeVisible({ timeout: 10_000 });
}
async function openPortfolio(page: Page, phone = false) {
  await page.goto("/portfolio");
  await expect(pf(page).getByTestId("pf-overview")).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  if (!phone) return;
}
const overviewText = (page: Page) => pf(page).evaluate((el) => ({
  hero: el.querySelector('[data-testid="pf-hero-nw"]')?.textContent ?? null,
  cash: el.querySelector('[data-testid="pf-balance-FDL"] td')?.textContent ?? null,
  balances: el.querySelectorAll('[data-testid^="pf-balance-"]').length,
  guest: !!el.querySelector('[data-testid="pf-guest-example"]'),
}));
/** Overview equals the server valuation (polled: the server mark moves every tick). */
async function overviewMatches(page: Page, request: APIRequestContext) {
  await expect.poll(async () => {
    const [o, v] = await Promise.all([overviewText(page), valuation(request)]);
    return o.hero === v.nw && o.cash === v.cash && o.balances === 1 && !o.guest ? "ok" : JSON.stringify({ o, nw: v.nw, cash: v.cash });
  }, { timeout: 20_000 }).toBe("ok");
}
async function positionsTab(page: Page, phone: boolean) {
  if (phone) await pf(page).getByTestId("pf-open-positions").click();
  else await pf(page).getByTestId("pf-tab-positions").click();
  await expect(page.getByTestId("pf-positions").first()).toHaveAttribute("data-state", "live", { timeout: 20_000 });
}
const rowsText = (page: Page) => page.getByTestId("pf-positions").first().evaluate((el) => [...el.querySelectorAll('[data-testid="pos-row"]')].map((r) => ({
  asset: r.getAttribute("data-asset"),
  qty: r.querySelector('[data-testid="pos-qty"]')?.textContent ?? null,
  avg: r.querySelector('[data-testid="pos-avg"]')?.textContent ?? null,
  qtyat: r.querySelector('[data-testid="pos-qtyat"]')?.textContent ?? null,
  value: r.querySelector('[data-testid="pos-value"]')?.textContent ?? null,
  pnl: r.querySelector('[data-testid="pos-pnl"]')?.textContent ?? null,
})));
const pnlText = (c: number) => `${c > 0 ? "▲+" : c < 0 ? "▼−" : ""}${usd(Math.abs(c))}`;
/** Positions rows equal the server valuation: qty, cost basis, value and unrealized P&L per asset (polled). */
async function positionsMatch(page: Page, request: APIRequestContext, phone: boolean) {
  await expect.poll(async () => {
    const [r, v] = await Promise.all([rowsText(page), valuation(request)]);
    const want = Object.entries(v.rows).sort(([a], [b]) => (a < b ? -1 : 1)).map(([asset, x]) => ({
      asset, value: x.value, pnl: x.pnl === 0 ? usd(0) : pnlText(x.pnl),
      ...(phone ? { qtyat: `${Number(x.qty).toLocaleString("en-US")} @ ${x.avg}` } : { qty: Number(x.qty).toLocaleString("en-US"), avg: x.avg }),
    }));
    const got = r.map((x) => ({ asset: x.asset, value: x.value, pnl: x.pnl, ...(phone ? { qtyat: x.qtyat } : { qty: x.qty, avg: x.avg }) }));
    return JSON.stringify(got) === JSON.stringify(want) ? "ok" : JSON.stringify({ got, want });
  }, { timeout: 20_000 }).toBe("ok");
}

test("desktop: buy → Portfolio = server ledger at server quotes; quote moves; partial sell; working limits; refresh; B; A again; read failure; sell all; sign out", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop journey");
  test.setTimeout(240_000);
  const stamp = Date.now().toString(36);
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    await register(a.request, baseURL!, `PfA${stamp}`);
    await register(b.request, baseURL!, `PfB${stamp}`);
    const page = await a.newPage();

    // Before any trade: $10,000.00 cash, NW = cash, no rows; not the example.
    await openPortfolio(page);
    await overviewMatches(page, a.request);
    await expect(pf(page).getByTestId("pf-hero-nw")).toHaveText("$10,000.00");
    await expect(pf(page).getByTestId("pf-guest-example")).toHaveCount(0);

    await trade(page, "buy", "5");
    const buy = (await ledger(a.request)).fills.at(-1)!;
    await openPortfolio(page);
    await overviewMatches(page, a.request);
    await shot(page, "pf-01-after-buy-overview");
    await positionsTab(page, false);
    await positionsMatch(page, a.request, false);
    // Cost basis is the fill price; the fee came out of cash.
    expect((await rowsText(page))[0]!.avg).toBe(buy.price);
    expect((await ledger(a.request)).cashCents).toBe(1_000_000 - 5 * cents(buy.price) - cents(buy.fee));
    await shot(page, "pf-02-after-buy-positions");

    // A server quote change moves value and P&L (the row follows; cash and cost do not).
    const t0 = (await ledger(a.request)).tick;
    await expect.poll(async () => (await ledger(a.request)).tick, { timeout: 20_000 }).toBeGreaterThan(t0);
    await positionsMatch(page, a.request, false);

    // Partial sell: 3 left at the same cost basis.
    await trade(page, "sell", "2");
    await openPortfolio(page);
    await overviewMatches(page, a.request);
    await positionsTab(page, false);
    await positionsMatch(page, a.request, false);
    expect((await rowsText(page))[0]).toMatchObject({ qty: "3", avg: buy.price });

    // Working limits: a buy far under the mark and a sell far over it rest. Cash shown = saved cash (the held part is
    // still the player's), NW counted once, the 2 offered units still in the row.
    await trade(page, "buy", "1", "1.00");
    await trade(page, "sell", "2", "9999.00");
    const lw = await ledger(a.request);
    expect(Object.values(lw.orders).map((o) => [o.side, o.status]).sort()).toEqual([["BUY", "WORKING"], ["SELL", "WORKING"]]);
    expect(lw.reservedCashCents).toBeGreaterThan(0);
    await openPortfolio(page);
    await overviewMatches(page, a.request);
    await positionsTab(page, false);
    await positionsMatch(page, a.request, false);
    expect((await rowsText(page))[0]!.qty).toBe("3");
    await pf(page).getByTestId("pf-tab-orders").click();
    await expect(pf(page).getByTestId("pf-orders")).toBeVisible();
    await shot(page, "pf-03-working-limits-orders");

    // Refresh: the saved ledger again.
    await page.reload();
    await expect(pf(page).getByTestId("pf-overview")).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    await overviewMatches(page, a.request);

    // Second account: its own $10,000.00, no rows, none of A's orders.
    const pageB = await b.newPage();
    await openPortfolio(pageB);
    await overviewMatches(pageB, b.request);
    await expect(pf(pageB).getByTestId("pf-hero-nw")).toHaveText("$10,000.00");
    await positionsTab(pageB, false);
    await expect(pageB.getByTestId("pos-empty")).toBeVisible();
    // A again (a fresh page): A's holdings.
    const pageA2 = await a.newPage();
    await openPortfolio(pageA2);
    await overviewMatches(pageA2, a.request);
    await positionsTab(pageA2, false);
    await positionsMatch(pageA2, a.request, false);
    await pageA2.close();

    // A failed account read: an error with Retry, no skeleton forever and no demo values; Retry reads it again.
    await page.route("**/api/broker/me", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    await page.reload();
    await expect(pf(page).getByTestId("pf-error")).toBeVisible({ timeout: 15_000 });
    await expect(pf(page).getByTestId("pf-hero-nw")).toHaveCount(0);
    await expect(pf(page).getByTestId("pf-guest-example")).toHaveCount(0);
    await shot(page, "pf-04-read-failed");
    await page.unroute("**/api/broker/me");
    await pf(page).getByTestId("pf-retry").click();
    await expect(pf(page).getByTestId("pf-overview")).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    await overviewMatches(page, a.request);

    // Cancel the sell limit, then sell all 3: the rows clear and NW = cash (the buy limit still holds its cash).
    const sellOrder = Object.values(lw.orders).find((o) => o.side === "SELL")!;
    const cx = await a.request.post("/api/broker/orders/cancel", { headers: { origin: baseURL! }, data: { idempotencyKey: `pf-cx-${stamp}`, orderId: sellOrder.orderId } });
    expect(cx.status()).toBe(200);
    await trade(page, "sell", "3");
    await openPortfolio(page);
    await overviewMatches(page, a.request);
    await positionsTab(page, false);
    await expect(page.getByTestId("pos-empty")).toBeVisible();
    await shot(page, "pf-05-sold-all");

    // Signed out in the page: the labelled example, not A's ledger.
    await page.getByTestId("account-chip").first().click();
    await page.getByTestId("account-logout").click();
    await page.goto("/portfolio");
    await expect(pf(page).getByTestId("pf-guest-example")).toBeVisible({ timeout: 20_000 });
  } finally {
    await a.close();
    await b.close();
  }
});

test("phone 390 and the 520 window: signed-in Portfolio after a buy fits and matches the server", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone project runs both layouts once");
  test.setTimeout(150_000);
  const stamp = Date.now().toString(36);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await register(ctx.request, baseURL!, `PfP${stamp}`);
    await ctx.request.post("/api/broker/orders", { headers: { origin: baseURL! }, data: { idempotencyKey: `pf-p-${stamp}-1`, draft: { assetId: "HALC", side: "BUY", type: "market", qty: "7", tif: "day" } } });
    await ctx.request.post("/api/broker/orders", { headers: { origin: baseURL! }, data: { idempotencyKey: `pf-p-${stamp}-2`, draft: { assetId: "MRDN", side: "BUY", type: "market", qty: "3", tif: "day" } } });
    const page = await ctx.newPage();
    await openPortfolio(page, true);
    await overviewMatches(page, ctx.request);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await shot(page, "pf-06-phone-390-overview");
    await positionsTab(page, true);
    await positionsMatch(page, ctx.request, true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await shot(page, "pf-07-phone-390-positions");

    // The same account in a 520 px desktop window.
    const login = await desk.request.post("/api/auth/login", { headers: { origin: baseURL! }, data: { handle: `PfP${stamp}`, password: "local-portfolio-test" } });
    expect(login.status()).toBe(200);
    const d = await desk.newPage();
    await openPortfolio(d);
    const win = d.getByTestId("win-portfolio").first();
    const h = (await win.getByTestId("resize-handle").boundingBox())!;
    await d.mouse.move(h.x + 5, h.y + 5); await d.mouse.down(); await d.mouse.move(50, h.y + 5, { steps: 5 }); await d.mouse.up();
    await expect.poll(async () => Math.round((await win.boundingBox())!.width)).toBe(520);
    await overviewMatches(d, desk.request);
    await positionsTab(d, false);
    await positionsMatch(d, desk.request, false);
    expect(await win.evaluate((el) => [...el.querySelectorAll<HTMLElement>('[data-testid="pf-positions"] *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible").length)).toBe(0);
    await shot(d, "pf-08-window-520-positions");
  } finally {
    await ctx.close();
    await desk.close();
  }
});
