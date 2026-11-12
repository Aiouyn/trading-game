// Card 41 (fail-first, docs/v1/units/buy-ack-after-leave.md; Gatekeeper 72d20d3f backlog b1 lesson): on phone, a
// signed-in player places a slow Buy and goes to Positions before the reply. The buy's ack must still be shown once;
// Close + Place then sells exactly the holding once, and the saved ledger is [BUY n, SELL held] once each.
// The reply of POST /api/broker/orders is held after the server answered (Gatekeeper's slowOrders pattern), so the
// fill is already on the server while the ticket is still "submitting". Real timers, production build.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Ledger = {
  positions: Record<string, { assetId: string; qty: string }>;
  orders: Record<string, unknown>;
  fills: { fillId: string; assetId?: string; side: string; qty: string; price: string }[];
  intents: { intentId: string; status: string }[];
};

const REPLY_DELAY_MS = 5_000;

async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-order-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
async function ledger(request: APIRequestContext): Promise<Ledger> {
  const res = await request.get("/api/broker/me");
  expect(res.status()).toBe(200);
  return res.json() as Promise<Ledger>;
}
const halcFills = (l: Ledger) => l.fills.filter((f) => (f.assetId ?? "HALC") === "HALC").map((f) => `${f.side} ${f.qty}`);
const ticket = (page: Page) => page.getByTestId("phone-appview").getByTestId("broker");

async function reviewPlace(page: Page) {
  const b = ticket(page);
  await expect(b.getByTestId("br-review")).toBeEnabled({ timeout: 15_000 });
  await b.getByTestId("br-review").click();
  const place = page.getByTestId("br-sheet").getByTestId("br-place");
  await expect(place).toBeEnabled({ timeout: 15_000 });
  await place.click();
}

/** Leave the phone ticket while its Place is in flight. The review sheet's scrim covers app-back and the edge bar until
 *  the reply lands (a click on app-back only lands after it, when the ticket has already shown the outcome), so a player
 *  leaves mid-Place with the system Back (Android back, iOS swipe back): popstate takes the shell to Home. */
async function leaveMidPlace(page: Page) {
  await expect(ticket(page)).toHaveAttribute("data-phase", "submitting");
  await page.goBack();
  await expect(ticket(page)).toHaveCount(0);
  await expect(page.getByTestId("fill-ack"), "left before the reply: no outcome yet").toHaveCount(0);
}

async function toPositions(page: Page, midPlace = false) {
  // Phone: back to Home (system Back mid-Place, else app-back), then Portfolio from the dock, then its Positions screen.
  if (midPlace) await leaveMidPlace(page);
  else await page.getByTestId("app-back").click();
  await page.getByTestId("icon-portfolio").click();
  await page.getByTestId("pf-open-positions").click();
  await expect(page.getByTestId("pf-positions").first()).toHaveAttribute("data-state", "live", { timeout: 20_000 });
}

test("phone: leave the ticket mid-Place, the buy's ack still shows once; Close + Place sells the holding once", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone shell: only one app is mounted, so leaving the ticket unmounts it");
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await register(ctx.request, baseURL!, `Ack${Date.now().toString(36)}`);
    const page = await ctx.newPage();
    await page.goto("/broker?asset=HALC");
    await expect(ticket(page)).toHaveAttribute("data-state", "live", { timeout: 30_000 });

    // Hold 7 HALC first (normal reply speed).
    await ticket(page).getByTestId("br-side-buy").click();
    await ticket(page).getByTestId("br-qty").fill("7");
    await reviewPlace(page);
    await expect(ticket(page).getByTestId("br-ack-title")).toHaveText(/^Bought 7 HALC at \d/, { timeout: 15_000 });
    const base = await ledger(ctx.request);
    expect(base.positions.HALC?.qty).toBe("7");
    const baseFills = halcFills(base).length;
    const baseIntents = base.intents.length;
    await ticket(page).getByTestId("br-new").click();

    // Slow reply: the server commits the buy at once, the browser sees the answer REPLY_DELAY_MS later.
    await page.route("**/api/broker/orders", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const resp = await route.fetch();
      const body = await resp.body();
      await new Promise((r) => setTimeout(r, REPLY_DELAY_MS));
      await route.fulfill({ response: resp, body });
    });

    await ticket(page).getByTestId("br-side-buy").click();
    await ticket(page).getByTestId("br-qty").fill("5");
    await reviewPlace(page);
    await toPositions(page, true); // the ticket unmounts mid-Place

    // [red on base] the buy's ack reaches the player anyway, exactly once, after the reply lands.
    await expect.soft(page.getByText(/Bought 5 HALC at \d/), "buy ack shown once after leaving the ticket").toHaveCount(1, { timeout: REPLY_DELAY_MS + 10_000 });

    // The order itself went through: the row shows 12 once the fill is on `me`.
    await expect.poll(async () => (await ledger(ctx.request)).positions.HALC?.qty, { timeout: 20_000 }).toBe("12");
    const halc = page.locator('[data-testid="pos-row"][data-asset="HALC"]');
    await expect(halc).toContainText("12", { timeout: 20_000 });

    // Close -> Sell 12 prefill -> Place: one sell ack.
    await expect(halc.getByTestId("pos-close")).toBeEnabled({ timeout: 20_000 });
    await halc.getByTestId("pos-close").click();
    await expect(ticket(page)).toHaveAttribute("data-phase", "edit");
    await expect(ticket(page).getByTestId("br-side-sell")).toHaveAttribute("aria-pressed", "true");
    await expect(ticket(page).getByTestId("br-qty")).toHaveValue("12");
    await reviewPlace(page);
    await expect(ticket(page).getByTestId("br-ack-title")).toHaveText(/^Sold 12 HALC at \d/, { timeout: REPLY_DELAY_MS + 15_000 });
    await page.waitForTimeout(1_500); // a late duplicate would show up here
    await expect(page.getByText(/Sold 12 HALC at \d/), "sell ack shown once").toHaveCount(1);
    await page.unroute("**/api/broker/orders");

    // Ledger: exactly [BUY 5, SELL 12] since the hold, each once; nothing working; two new intents.
    const after = await ledger(ctx.request);
    expect(halcFills(after).slice(baseFills), "fills since the hold").toEqual(["BUY 5", "SELL 12"]);
    expect(after.intents.length - baseIntents, "one intent per Place").toBe(2);
    expect(Object.keys(after.orders)).toEqual([]);
    expect(after.positions.HALC).toBeUndefined();

    // After reload Positions has no HALC row, and no stale buy ack is replayed.
    await page.reload();
    await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 60_000 });
    if (await ticket(page).count()) await toPositions(page);
    else {
      await page.getByTestId("icon-portfolio").click();
      await page.getByTestId("pf-open-positions").click();
      await expect(page.getByTestId("pf-positions").first()).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    }
    await expect(page.locator('[data-testid="pos-row"][data-asset="HALC"]')).toHaveCount(0);
    await expect.soft(page.getByText(/Bought 5 HALC at \d/), "no buy ack replayed after reload").toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
