// A signed-in stop-limit rests, then the server tick arms it. Desktop and phone use the same ticket.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-order-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
const br = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"]):has([data-testid="market-tick"])').first();

const EVIDENCE = "/workspace/avalon/evidence/stop-ticket-fit";

async function sizeWin(page: Page, wantW: number, wantH: number) {
  const win = page.getByTestId("win-broker").first();
  const box = (await win.boundingBox())!;
  if (Math.round(box.width) === wantW && Math.round(box.height) === wantH) return;
  const h = (await win.getByTestId("resize-handle").boundingBox())!;
  await page.mouse.move(h.x + 5, h.y + 5);
  await page.mouse.down();
  await page.mouse.move(h.x + 5 - (box.width - wantW), h.y + 5 - (box.height - wantH), { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => {
    const b = (await win.boundingBox())!;
    return [Math.round(b.width), Math.round(b.height)];
  }).toEqual([wantW, wantH]);
}

/** Review line + Place must sit inside the intersection of the ticket column and the window body. */
async function assertReviewInsideTicketBox(page: Page) {
  const trigger = page.getByTestId("br-trigger").first();
  const place = page.getByTestId("br-place").first();
  await expect(trigger).toBeVisible();
  await expect(place).toBeVisible();
  const seen = await page.evaluate(() => {
    const triggerEl = document.querySelector("[data-testid=br-trigger]");
    const placeEl = document.querySelector("[data-testid=br-place]");
    const ticket = triggerEl?.closest(".br-col-ticket") ?? triggerEl?.closest("[data-testid=br-review-block]");
    const winBody = triggerEl?.closest(".win-body") ?? triggerEl?.closest("[data-testid=br-sheet]") ?? triggerEl?.closest("[data-testid=phone-appview]");
    if (!(triggerEl instanceof HTMLElement) || !(placeEl instanceof HTMLElement) || !(ticket instanceof HTMLElement) || !(winBody instanceof HTMLElement)) {
      return { ok: false, why: "missing" as const };
    }
    const a = ticket.getBoundingClientRect();
    const b = winBody.getBoundingClientRect();
    const box = { top: Math.max(a.top, b.top), left: Math.max(a.left, b.left), bottom: Math.min(a.bottom, b.bottom), right: Math.min(a.right, b.right) };
    const inside = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const slop = 1;
      return r.width > 0 && r.height > 0 && r.top >= box.top - slop && r.bottom <= box.bottom + slop && r.left >= box.left - slop && r.right <= box.right + slop;
    };
    return { ok: inside(triggerEl) && inside(placeEl), box, trigger: triggerEl.getBoundingClientRect().toJSON(), place: placeEl.getBoundingClientRect().toJSON() };
  });
  expect(seen.ok, JSON.stringify(seen)).toBe(true);
}

test("a buy stop-limit shows the review line and triggers on the next server tick", async ({ page, baseURL }, info) => {
  test.setTimeout(90_000);
  const stamp = `${info.project.name === "phone" ? "p" : "d"}${Date.now().toString(36)}`;
  await register(page.request, baseURL!, `Stp${stamp}`);
  await page.goto("/broker?asset=HALC");
  const b = br(page);
  await expect(b).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  if (info.project.name !== "phone") await sizeWin(page, 840, 560);
  await b.getByTestId("br-type-stop_limit").click();
  await b.getByTestId("br-price-stop").fill("1.00");
  await b.getByTestId("br-price-limit").fill("1.00");
  await b.getByTestId("br-qty").fill("1");
  await expect(b.getByTestId("br-review")).toBeEnabled({ timeout: 10_000 });
  await b.getByTestId("br-review").click();
  await expect(page.getByTestId("br-trigger").first()).toHaveText("Buys if price rises to 1.00");
  await expect(page.getByTestId("br-place").first()).toBeEnabled({ timeout: 12_000 });
  if (info.project.name !== "phone") {
    await expect.poll(async () => {
      const box = await page.getByTestId("win-broker").first().boundingBox();
      return box ? [Math.round(box.width), Math.round(box.height)] : [0, 0];
    }).toEqual([840, 560]);
    await assertReviewInsideTicketBox(page);
    await page.screenshot({ path: `${EVIDENCE}/desktop-840x560-stop-review.png`, fullPage: false });
  } else {
    await expect(page.getByTestId("br-sheet")).toBeVisible();
    await expect(page.getByTestId("br-trigger").first()).toBeVisible();
    await expect(page.getByTestId("br-place").first()).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/phone-stop-review.png`, fullPage: false });
  }
  await page.getByTestId("br-place").first().click();
  await expect(b.getByTestId("br-ack")).toBeVisible({ timeout: 10_000 });

  const me = await page.request.get("/api/broker/me");
  expect(me.status()).toBe(200);
  const body = await me.json() as { orders: Record<string, { status: string; type: string }> };
  const [id] = Object.keys(body.orders);
  expect(body.orders[id!]).toMatchObject({ type: "stop_limit" });

  const row = page.getByTestId(`br-oo-row-${id}`);
  await expect(row).toHaveAttribute("data-status", "TRIGGERED", { timeout: 25_000 });
  await expect(row.getByTestId("br-oo-status")).toHaveText("Triggered");
  await expect(page.getByTestId(`br-hist-${id}-TRIGGERED`)).toHaveAttribute("data-status", "TRIGGERED");
});
