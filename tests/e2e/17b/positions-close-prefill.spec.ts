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
