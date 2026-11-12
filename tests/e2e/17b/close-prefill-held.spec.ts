// Card 34: Close at the Broker window cap leaves nothing held; a later ticket is not a leftover Sell.
import { expect, test, type Page } from "@playwright/test";
import { boot } from "../shell/helpers";

const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop project only");

const ticketOf = (page: Page, asset: string) =>
  page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker").filter({ hasText: asset }) }).getByTestId("broker");

async function openBroker(page: Page, asset: string) {
  await boot(page, `/broker?asset=${asset}`);
  await expect(ticketOf(page, asset)).toHaveAttribute("data-state", "live");
}

test("desktop: Close HALC at the 4-Broker cap tells the player and leaves nothing held", async ({ page }, info) => {
  desktopOnly(info.project.name);
  // Card 15: repeated /broker?asset= links reuse one Broker, so open the other three from the shelf (no asset, picker shown).
  await openBroker(page, "NRON");
  for (let i = 0; i < 3; i++) await page.getByTestId("tile-broker").click();
  await expect(page.getByTestId("win-broker")).toHaveCount(4);

  await page.getByTestId("tile-portfolio").click();
  await page.getByTestId("win-portfolio").first().getByTestId("pf-tab-positions").click();
  await expect(page.getByTestId("pf-positions").first()).toHaveAttribute("data-state", "live");
  await page.locator('[data-testid="pos-row"][data-asset="HALC"]').getByTestId("pos-close").click();

  await expect(page.getByTestId("pos-close-cap")).toBeVisible();
  await expect(ticketOf(page, "HALC")).toHaveCount(0);

  // Deep-link at the cap focuses an existing Broker and does not open HALC (17a-T4).
  // Free one slot, then open HALC: it must not be a leftover Sell.
  await page.getByTestId("win-broker").last().getByTestId("win-close").click();
  await expect(page.getByTestId("win-broker")).toHaveCount(3);
  await boot(page, "/broker?asset=HALC");
  const halc = ticketOf(page, "HALC");
  await expect(halc).toBeVisible();
  await expect(halc).toHaveAttribute("data-phase", "edit");
  await expect(halc.getByTestId("br-side-sell")).not.toHaveAttribute("aria-pressed", "true");
  await expect(halc.getByTestId("br-qty")).toHaveValue("");
});

test("desktop: after a fresh sign-in, Positions open, a new HALC fill's Close is enabled and prefills Sell 7", async ({ page, baseURL }, info) => {
  desktopOnly(info.project.name);
  const handle = `C34b1${Date.now().toString(36)}`;
  const res = await page.request.post("/api/auth/register", {
    headers: { origin: baseURL! },
    data: { handle, password: "card34-b1-local" },
  });
  expect(res.status(), await res.text()).toBe(201);

  await boot(page, "/broker?asset=HALC");
  const tkt = ticketOf(page, "HALC");
  await expect(tkt).toHaveAttribute("data-state", "live");

  await page.getByTestId("tile-portfolio").click();
  await page.getByTestId("win-portfolio").first().getByTestId("pf-tab-positions").click();
  await expect(page.getByTestId("pf-positions").first()).toHaveAttribute("data-state", "live");
  await expect(page.locator('[data-testid="pos-row"][data-asset="HALC"]')).toHaveCount(0);

  // Positions stays mounted (the B1 case); raise Broker so Portfolio does not intercept Review / Place.
  const brokerWin = page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker").filter({ hasText: "HALC" }) });
  await brokerWin.locator(".tb-name").click();
  await tkt.getByTestId("br-qty").fill("7");
  await expect(tkt.getByTestId("br-est")).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => {
    const r = tkt.getByTestId("br-review");
    return (await r.getAttribute("aria-disabled")) !== "true" && !(await r.isDisabled());
  }, { timeout: 10_000 }).toBe(true);
  await tkt.getByTestId("br-review").click();
  const place = page.getByTestId("br-review-block").getByTestId("br-place");
  await expect(place).toBeVisible();
  await expect.poll(async () => (await place.getAttribute("aria-disabled")) !== "true" && !(await place.isDisabled()), { timeout: 10_000 }).toBe(true);
  await place.click();
  await expect(tkt.getByTestId("br-ack-title")).toBeVisible({ timeout: 15_000 });

  const halc = page.locator('[data-testid="pos-row"][data-asset="HALC"]');
  await expect(halc).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("tile-portfolio").click();
  const close = halc.getByTestId("pos-close");
  await expect.poll(async () => (await close.getAttribute("aria-disabled")) !== "true" && !(await close.isDisabled()), { timeout: 5_000 }).toBe(true);
  await close.click();

  await expect(tkt).toHaveAttribute("data-phase", "edit");
  await expect(tkt.getByTestId("br-side-sell")).toHaveAttribute("aria-pressed", "true");
  await expect(tkt.getByTestId("br-qty")).toHaveValue("7");
});
