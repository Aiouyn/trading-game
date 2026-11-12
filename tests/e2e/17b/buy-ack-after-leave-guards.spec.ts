// Card 41 guards (Gatekeeper on the plan, docs/v1/units/buy-ack-after-leave.md):
// - desktop: closing a Broker window mid-Place gives one toast; closing two gives two; the toast never covers an open
//   ticket (elementFromPoint at the ticket's controls) and Esc dismisses it;
// - phone: the outcome copy of a rejected intent (never "Bought"); the toast never covers the Home dock or the Wire Post
//   button; sign-out mid-Place never shows A's toast to the next session.
// 17 §3.10.2 (17-UX:581), 17-AT-40 (17-UX:1305). Guest cases use the QUAY_HOOKS mock door (`replyMs`, `reject`);
// signed-in cases hold the POST /api/broker/orders reply after the server answered.
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { boot } from "../shell/helpers";

const toasts = (page: Page) => page.getByTestId("fill-ack");
const ticketOf = (page: Page, asset: string) =>
  page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker").filter({ hasText: asset }) });
const phoneTicket = (page: Page) => page.getByTestId("phone-appview").getByTestId("broker");

async function enabled(loc: Locator, ms = 15_000) {
  await expect.poll(async () => (await loc.getAttribute("aria-disabled")) !== "true" && !(await loc.isDisabled()), { timeout: ms }).toBe(true);
}
/** The element at `loc`'s centre is `loc` or inside it (nothing painted over it). */
async function hitsItself(loc: Locator): Promise<boolean> {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top !== null && (top === el || el.contains(top));
  });
}
type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Bring a Broker window to the front (windows overlap at 1280), as a click on its frame does. */
async function front(win: Locator) {
  await win.dispatchEvent("pointerdown");
  await win.dispatchEvent("mousedown");
  await expect(win).toHaveClass(/\bactive\b/);
}
async function desktopPlace(page: Page, win: Locator) {
  await front(win);
  await enabled(win.getByTestId("br-review"));
  await win.getByTestId("br-review").click();
  const place = win.getByTestId("br-review-block").getByTestId("br-place");
  await enabled(place);
  await place.click();
  await expect(win.getByTestId("broker")).toHaveAttribute("data-phase", "submitting");
}

/** Leave the phone ticket while its Place is in flight. The review sheet's scrim covers app-back and the edge bar until
 *  the reply lands (a click on app-back only lands after it, when the ticket has already shown the outcome), so a player
 *  leaves mid-Place with the system Back (Android back, iOS swipe back): popstate takes the shell to Home. */
async function leaveMidPlace(page: Page) {
  await expect(phoneTicket(page)).toHaveAttribute("data-phase", "submitting");
  await page.goBack();
  await expect(phoneTicket(page)).toHaveCount(0);
  await expect(page.getByTestId("fill-ack"), "left before the reply: no outcome yet").toHaveCount(0);
}

/** Desktop guest: MRDN Broker (buy 4) plus a HALC Broker opened by Positions Close (sell 1200), replies held 6 s. */
async function twoBrokers(page: Page) {
  await boot(page, "/broker?asset=MRDN&replyMs=6000");
  const mrdn = ticketOf(page, "MRDN");
  await expect(mrdn.getByTestId("broker")).toHaveAttribute("data-state", "live");
  await mrdn.getByTestId("br-qty").fill("4");
  await page.getByTestId("tile-portfolio").click();
  await page.getByTestId("win-portfolio").first().getByTestId("pf-tab-positions").click();
  await expect(page.getByTestId("pf-positions").first()).toHaveAttribute("data-state", "live");
  await page.locator('[data-testid="pos-row"][data-asset="HALC"]').getByTestId("pos-close").click();
  const halc = ticketOf(page, "HALC");
  await expect(halc.getByTestId("br-qty")).toHaveValue("1200");
  return { mrdn, halc };
}

test("desktop: closing the Broker window mid-Place gives one toast that covers no open ticket; Esc dismisses it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop windows");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const { mrdn, halc } = await twoBrokers(page);
  await desktopPlace(page, mrdn);
  await front(mrdn);
  await mrdn.getByTestId("win-close").click();
  await expect(mrdn).toHaveCount(0);
  await expect(toasts(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(toasts(page).first()).toContainText(/Bought 4 MRDN at \d/);
  // the open HALC ticket is not covered: its controls are hit-testable and no toast box overlaps the ticket
  const t = (await toasts(page).first().boundingBox())!;
  const h = (await halc.getByTestId("broker").boundingBox())!;
  expect(overlaps(t, h), JSON.stringify({ toast: t, ticket: h })).toBe(false);
  for (const id of ["br-qty", "br-review", "br-side-sell"]) expect(await hitsItself(halc.getByTestId(id)), id).toBe(true);
  await page.screenshot({ path: info.outputPath("desktop-one-toast.png") });
  await page.waitForTimeout(1_500);
  await expect(toasts(page)).toHaveCount(1); // one per intent, not one per poll
  await page.keyboard.press("Escape");
  await expect(toasts(page)).toHaveCount(0);
});

test("desktop: two Brokers closed mid-Place give two toasts", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop windows");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const { mrdn, halc } = await twoBrokers(page);
  await desktopPlace(page, mrdn);
  await desktopPlace(page, halc);
  await front(mrdn);
  await mrdn.getByTestId("win-close").click();
  await front(halc);
  await halc.getByTestId("win-close").click();
  await expect(page.getByTestId("win-broker")).toHaveCount(0);
  await expect(toasts(page)).toHaveCount(2, { timeout: 15_000 });
  await expect(toasts(page).filter({ hasText: /Bought 4 MRDN at \d/ })).toHaveCount(1);
  await expect(toasts(page).filter({ hasText: /Sold 1,?200 HALC at \d/ })).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("desktop-two-toasts.png") });
});

test("phone guest: a rejected intent left mid-Place shows the reject copy, never 'Bought'", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone shell");
  test.setTimeout(90_000);
  await boot(page, "/broker?asset=HALC&replyMs=4000&reject=MKT_INSUFFICIENT_BP");
  await expect(phoneTicket(page)).toHaveAttribute("data-state", "live");
  await phoneTicket(page).getByTestId("br-qty").fill("5");
  await enabled(phoneTicket(page).getByTestId("br-review"));
  await phoneTicket(page).getByTestId("br-review").click();
  const place = page.getByTestId("br-sheet").getByTestId("br-place");
  await enabled(place);
  await place.click();
  await leaveMidPlace(page); // Home: the ticket unmounts mid-Place
  await expect(toasts(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(toasts(page).first()).toContainText("Order rejected");
  await expect(toasts(page).first()).toContainText("Not enough cash for this order.");
  await expect(page.getByText(/Bought 5 HALC/)).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("phone-reject-toast.png") });
});

type Ledger = { positions: Record<string, { qty: string }>; fills: { side: string; qty: string }[] };
async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-order-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
async function holdReplies(page: Page, ms: number) {
  await page.route("**/api/broker/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const resp = await route.fetch();
    const body = await resp.body();
    await new Promise((r) => setTimeout(r, ms));
    await route.fulfill({ response: resp, body });
  });
}
async function phonePlace(page: Page, qty: string) {
  await page.goto("/broker?asset=HALC");
  await expect(phoneTicket(page)).toHaveAttribute("data-state", "live", { timeout: 30_000 });
  await phoneTicket(page).getByTestId("br-side-buy").click();
  await phoneTicket(page).getByTestId("br-qty").fill(qty);
  await enabled(phoneTicket(page).getByTestId("br-review"));
  await phoneTicket(page).getByTestId("br-review").click();
  const place = page.getByTestId("br-sheet").getByTestId("br-place");
  await enabled(place);
  await place.click();
  await expect(phoneTicket(page)).toHaveAttribute("data-phase", "submitting");
}

test("phone signed-in: the toast never covers the Home dock or the Wire Post button", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone shell");
  test.setTimeout(150_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await register(ctx.request, baseURL!, `AckP${Date.now().toString(36)}`);
    const page = await ctx.newPage();
    await holdReplies(page, 6_000);
    // 1) leave to Home: the dock icons stay hit-testable while the toast shows
    await phonePlace(page, "2");
    await leaveMidPlace(page);
    await expect(toasts(page)).toHaveCount(1, { timeout: 20_000 });
    const t1 = (await toasts(page).first().boundingBox())!;
    for (const id of ["icon-broker", "icon-portfolio", "icon-wire"]) {
      const icon = page.getByTestId("bottom-row").getByTestId(id);
      expect(await hitsItself(icon), id).toBe(true);
      expect(overlaps(t1, (await icon.boundingBox())!), id).toBe(false);
    }
    await page.screenshot({ path: info.outputPath("phone-toast-home-dock.png") });
    // 2) leave to Wire with the composer open: Post stays hit-testable while the toast shows
    await phonePlace(page, "3");
    await leaveMidPlace(page);
    await page.getByTestId("icon-wire").click();
    await page.getByTestId("wire-composer-toggle").click();
    const post = page.getByTestId("wire-composer-submit");
    await expect(post).toBeVisible();
    await expect(toasts(page).filter({ hasText: /Bought 3 HALC at \d/ })).toHaveCount(1, { timeout: 20_000 });
    expect(await hitsItself(post), "wire-composer-submit").toBe(true);
    expect(overlaps((await toasts(page).first().boundingBox())!, (await post.boundingBox())!)).toBe(false);
    await page.screenshot({ path: info.outputPath("phone-toast-wire-post.png") });
  } finally {
    await ctx.close();
  }
});

test("phone signed-in: sign-out mid-Place never shows A's toast to the next session", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone shell");
  test.setTimeout(150_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const stamp = Date.now().toString(36);
  try {
    await register(ctx.request, baseURL!, `AckA${stamp}`);
    const page = await ctx.newPage();
    await holdReplies(page, 6_000);
    await phonePlace(page, "5");
    await leaveMidPlace(page);
    await page.getByTestId("account-chip-home").click();
    await page.getByTestId("account-logout").click();
    await expect(page.getByTestId("account-logout")).toHaveCount(0, { timeout: 15_000 });
    // A's buy went through on the server, but the guest session after sign-out never hears of it
    await page.waitForTimeout(10_000);
    await expect(page.getByText(/Bought 5 HALC/)).toHaveCount(0);
    await expect(toasts(page)).toHaveCount(0);
    // B signs up in the same browser: still nothing of A's
    await register(ctx.request, baseURL!, `AckB${stamp}`);
    await page.reload();
    await expect(page.getByTestId("quay-ready")).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_000);
    await expect(page.getByText(/Bought 5 HALC/)).toHaveCount(0);
    const lb = (await (await ctx.request.get("/api/broker/me")).json()) as Ledger;
    expect(lb.fills).toEqual([]);
    // and A's buy did go through on the server
    const a = await browser.newContext();
    try {
      const login = await a.request.post("/api/auth/login", { headers: { origin: baseURL! }, data: { handle: `AckA${stamp}`, password: "local-order-test" } });
      expect(login.status(), await login.text()).toBeLessThan(300);
      const la = (await (await a.request.get("/api/broker/me")).json()) as Ledger;
      expect(la.fills.map((f) => `${f.side} ${f.qty}`)).toEqual(["BUY 5"]);
    } finally {
      await a.close();
    }
  } finally {
    await ctx.close();
  }
});
