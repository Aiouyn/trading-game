// M1-06: a signed-in player buys then sells through the Broker at server prices; the saved ledger (cash, position cost,
// working limit) survives a refresh; a second account sees none of it. The server decides every price and fill.
// Real timers against the production build. Repo CI evidence only, not the desktop played gate.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Ledger = {
  tick: number; cashCents: number; reservedCashCents: number;
  positions: Record<string, { assetId: string; qty: string; avgCost: string }>;
  orders: Record<string, { orderId: string; status: string; limit?: string }>;
  fills: { fillId: string; side: string; qty: string; price: string; fee: string }[];
  intents: { intentId: string; status: string }[];
};

async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-order-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
async function ledger(request: APIRequestContext): Promise<Ledger> {
  const res = await request.get("/api/broker/me");
  expect(res.status()).toBe(200);
  return res.json() as Promise<Ledger>;
}
/** The deep-linked Broker window on HALC, signed in (shows the server tick). */
const br = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"]):has([data-testid="market-tick"])').first();
const money = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });

async function trade(page: Page, side: "buy" | "sell", qty: string, limit?: string) {
  const b = br(page);
  await expect(b).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  await b.getByTestId(`br-side-${side}`).click();
  await b.getByTestId(limit ? "br-type-limit" : "br-type-market").click();
  if (limit) await b.getByTestId("br-price-limit").fill(limit);
  await b.getByTestId("br-qty").fill(qty);
  await expect(b.getByTestId("br-review")).toBeEnabled({ timeout: 10_000 });
  await b.getByTestId("br-review").click();
  // The estimate can go stale on a server tick; Place enables again with the fresh one.
  await expect(page.getByTestId("br-place").first()).toBeEnabled({ timeout: 12_000 });
  await page.getByTestId("br-place").first().click();
  await expect(b.getByTestId("br-ack")).toBeVisible({ timeout: 10_000 });
}

test("signed-in buy then sell at server prices; saved across refresh; second account isolated", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop order proof; the phone shell uses the same door");
  test.setTimeout(150_000);
  const stamp = Date.now().toString(36);
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    await register(a.request, baseURL!, `OrdA${stamp}`);
    await register(b.request, baseURL!, `OrdB${stamp}`);
    const page = await a.newPage();
    await page.goto("/broker?asset=HALC");

    await trade(page, "buy", "5");
    let l = await ledger(a.request);
    const buy = l.fills.at(-1)!;
    expect(buy).toMatchObject({ side: "BUY", qty: "5" });
    await expect(br(page).getByTestId("br-ack-title")).toHaveText(`Bought 5 HALC at ${buy.price}`);
    await expect(br(page).getByTestId("br-ack-fee")).toHaveText(`Fee ${buy.fee}`);
    expect(l.positions.HALC).toEqual({ assetId: "HALC", qty: "5", avgCost: buy.price });
    const afterBuy = 1_000_000 - Math.round(Number(buy.price) * 100) * 5 - Math.round(Number(buy.fee) * 100);
    expect(l.cashCents).toBe(afterBuy);
    await br(page).getByTestId("br-new").click();

    await trade(page, "sell", "2");
    l = await ledger(a.request);
    const sell = l.fills.at(-1)!;
    await expect(br(page).getByTestId("br-ack-title")).toHaveText(`Sold 2 HALC at ${sell.price}`);
    expect(l.positions.HALC).toEqual({ assetId: "HALC", qty: "3", avgCost: buy.price });
    expect(l.cashCents).toBe(afterBuy + Math.round(Number(sell.price) * 100) * 2 - Math.round(Number(sell.fee) * 100));
    await br(page).getByTestId("br-new").click();

    // A working buy limit far under the mark rests and holds cash.
    await trade(page, "buy", "1", "1.00");
    await expect(br(page).getByTestId("br-ack-title")).toHaveText("Order placed. It's in Open orders.");
    l = await ledger(a.request);
    const [orderId] = Object.keys(l.orders);
    expect(l.orders[orderId!]).toMatchObject({ status: "WORKING", limit: "1.00" });
    expect(l.reservedCashCents).toBeGreaterThan(0);
    await expect(page.getByTestId(`br-oo-row-${orderId}`).first()).toBeVisible();

    // Refresh: the same saved ledger comes back (not a demo reset).
    const saved = await ledger(a.request);
    await page.reload();
    await expect(br(page)).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    await expect(br(page).getByTestId("br-you-hold")).toHaveText("You hold 3");
    await expect(page.getByTestId(`br-oo-row-${orderId}`).first()).toBeVisible();
    await expect(br(page).getByTestId("br-hold")).toContainText(money(saved.cashCents));
    expect({ ...(await ledger(a.request)), tick: 0 }).toEqual({ ...saved, tick: 0 });

    // Duplicate / reconnect: the same key twice executes once.
    const key = `e2e-dup-${stamp}`;
    const send = () => a.request.post("/api/broker/orders", { headers: { origin: baseURL! }, data: { idempotencyKey: key, draft: { assetId: "HALC", side: "BUY", type: "market", qty: "1", tif: "day" } } });
    const [r1, r2] = await Promise.all([send(), send()]);
    expect((await r1.json()).intentId).toBe((await r2.json()).intentId);
    expect((await ledger(a.request)).positions.HALC!.qty).toBe("4");

    // Second account: none of A's state, and cannot cancel A's order.
    const lb = await ledger(b.request);
    expect(lb).toMatchObject({ cashCents: 1_000_000, positions: {}, orders: {}, fills: [], intents: [] });
    const cx = await b.request.post("/api/broker/orders/cancel", { headers: { origin: baseURL! }, data: { idempotencyKey: `e2e-cx-${stamp}`, orderId } });
    expect(cx.status()).toBe(200);
    expect(Object.keys((await ledger(a.request)).orders)).toEqual([orderId]);
    const pageB = await b.newPage();
    await pageB.goto("/broker?asset=HALC");
    await expect(br(pageB)).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    await expect(br(pageB).getByTestId("br-you-hold")).toHaveCount(0);
    await expect(pageB.getByTestId("br-oo-empty").first()).toBeVisible();

    // Cross-site and client-priced requests are refused.
    expect((await a.request.post("/api/broker/orders", { headers: { origin: "https://evil.example" }, data: { idempotencyKey: `e2e-x-${stamp}`, draft: { assetId: "HALC", side: "BUY", type: "market", qty: "1", tif: "day" } } })).status()).toBe(403);
    expect((await a.request.post("/api/broker/orders", { headers: { origin: baseURL! }, data: { idempotencyKey: `e2e-p-${stamp}`, draft: { assetId: "HALC", side: "BUY", type: "market", qty: "1", tif: "day", price: "0.01" } } })).status()).toBe(400);
  } finally {
    await a.close();
    await b.close();
  }
});
