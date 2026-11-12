// Card 27: Positions Close opens the existing Broker ticket pre-filled (Sell + qty). Nothing is submitted.
import { expect, test, type Page } from "@playwright/test";
import { boot, intents } from "../shell/helpers";

const isPhone = (n: string) => n === "phone";

async function openPositions(page: Page, phone: boolean) {
  await boot(page, "/portfolio");
  if (phone) await page.getByTestId("pf-open-positions").click();
  else await page.getByTestId("win-portfolio").first().getByTestId("pf-tab-positions").click();
  await expect(page.getByTestId("pf-positions").first()).toHaveAttribute("data-state", "live");
}

function twoFrames(page: Page) {
  return page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test("Close on HALC pre-fills a sell of 1200 and does not place", async ({ page }, info) => {
  await openPositions(page, isPhone(info.project.name));
  const before = await intents(page);
  const row = page.getByTestId("pos-row").filter({ has: page.locator('[data-asset="HALC"]') });
  // data-asset is on the row itself
  const halc = page.locator('[data-testid="pos-row"][data-asset="HALC"]');
  await expect(halc.getByTestId("pos-close")).toBeVisible();
  await halc.getByTestId("pos-close").click();

  const ticket = isPhone(info.project.name)
    ? page.getByTestId("phone-appview").getByTestId("broker")
    : page.getByTestId("win-broker").last().getByTestId("broker");
  await expect(ticket).toBeVisible();
  await expect(ticket).toHaveAttribute("data-phase", "edit");
  await expect(ticket.getByTestId("br-side-sell")).toHaveAttribute("aria-pressed", "true");
  await expect(ticket.getByTestId("br-qty")).toHaveValue("1200");
  expect(await intents(page)).toBe(before);
});

test("holding /api/auth/me: a loading positions skeleton has no Close", async ({ page }, info) => {
  await page.route("**/api/auth/me", () => { /* hold */ });
  await boot(page, "/portfolio");
  if (isPhone(info.project.name)) {
    const open = page.getByTestId("pf-open-positions");
    if (await open.isVisible().catch(() => false)) await open.click();
  } else {
    const tab = page.getByTestId("win-portfolio").first().getByTestId("pf-tab-positions");
    if (await tab.isVisible().catch(() => false)) await tab.click();
  }
  await twoFrames(page);
  const skel = page.getByTestId("pos-skel");
  if (await skel.count()) {
    await expect(page.getByTestId("pos-close")).toHaveCount(0);
  }
});

test("empty book has no Close", async ({ page }, info) => {
  test.skip(!process.env.QUAY_HOOKS, "empty=1 is a hooks-only mock flag");
  await boot(page, "/portfolio?empty=1");
  if (isPhone(info.project.name)) await page.getByTestId("pf-open-positions").click();
  else await page.getByTestId("win-portfolio").first().getByTestId("pf-tab-positions").click();
  await expect(page.getByTestId("pf-positions").first()).toHaveAttribute("data-state", "live");
  await expect(page.getByTestId("pos-empty")).toBeVisible();
  await expect(page.getByTestId("pos-close")).toHaveCount(0);
});


const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop project only");

const ticketOf = (page: Page, asset: string) =>
  page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker").filter({ hasText: asset }) }).getByTestId("broker");

async function waitEnabled(loc: ReturnType<Page["getByTestId"]>, ms = 10_000) {
  await expect.poll(async () => (await loc.getAttribute("aria-disabled")) !== "true" && !(await loc.isDisabled()), { timeout: ms }).toBe(true);
}

async function reviewPlace(page: Page, tkt: ReturnType<typeof ticketOf>) {
  await expect(tkt.getByTestId("br-est")).toBeVisible({ timeout: 10_000 });
  await waitEnabled(tkt.getByTestId("br-review"));
  await tkt.getByTestId("br-review").click();
  const place = page.getByTestId("br-review-block").getByTestId("br-place");
  await expect(place).toBeVisible();
  await waitEnabled(place);
  const before = await page.getByTestId("br-ack-title").count();
  await place.click();
  await expect.poll(async () => page.getByTestId("br-ack-title").count(), { timeout: 15_000 }).toBe(before + 1);
  return before + 1;
}

test("desktop: after a buy, Close then Place gives exactly 1 new ack", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/broker?asset=HALC");
  const tkt = ticketOf(page, "HALC");
  await expect(tkt).toHaveAttribute("data-state", "live");
  await tkt.getByTestId("br-qty").fill("7");
  const afterBuy = await reviewPlace(page, tkt);
  expect(afterBuy).toBe(1);

  await page.getByTestId("tile-portfolio").click();
  await page.getByTestId("win-portfolio").first().getByTestId("pf-tab-positions").click();
  await expect(page.getByTestId("pf-positions").first()).toHaveAttribute("data-state", "live");
  const halc = page.locator('[data-testid="pos-row"][data-asset="HALC"]');
  await expect(halc.getByTestId("pos-close")).toBeVisible();
  const acksBeforeClose = await page.getByTestId("br-ack-title").count();
  await halc.getByTestId("pos-close").click();

  await expect(tkt).toHaveAttribute("data-phase", "edit");
  await expect(tkt.getByTestId("br-side-sell")).toHaveAttribute("aria-pressed", "true");
  await expect(tkt.getByTestId("br-qty")).not.toHaveValue("");
  expect(await page.getByTestId("br-ack-title").count()).toBe(acksBeforeClose);

  const afterSell = await reviewPlace(page, tkt);
  expect(afterSell).toBe(acksBeforeClose + 1);
});

test("desktop: Close on HALC while a NRON ticket is open pre-fills HALC and leaves the NRON draft", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/broker?asset=NRON");
  const nron = ticketOf(page, "NRON");
  await expect(nron).toHaveAttribute("data-state", "live");
  await nron.getByTestId("br-qty").fill("4");
  await expect(nron.getByTestId("br-qty")).toHaveValue("4");
  await expect(nron.getByTestId("br-side-buy")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("tile-portfolio").click();
  await page.getByTestId("win-portfolio").first().getByTestId("pf-tab-positions").click();
  await expect(page.getByTestId("pf-positions").first()).toHaveAttribute("data-state", "live");
  await page.locator('[data-testid="pos-row"][data-asset="HALC"]').getByTestId("pos-close").click();

  const halc = ticketOf(page, "HALC");
  await expect(halc).toBeVisible();
  await expect(halc).toHaveAttribute("data-phase", "edit");
  await expect(halc.getByTestId("br-side-sell")).toHaveAttribute("aria-pressed", "true");
  await expect(halc.getByTestId("br-qty")).toHaveValue("1200");

  await expect(nron.getByTestId("br-qty")).toHaveValue("4");
  await expect(nron.getByTestId("br-side-buy")).toHaveAttribute("aria-pressed", "true");
});
