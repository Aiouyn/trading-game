import { test, expect, type Page } from "@playwright/test";

// Tape: layout regressions from Forge's 14cc4fc fix batch (phone geometry, sheet-on-fill, credits).
type Box = { x: number; y: number; width: number; height: number };
const box = async (page: Page, id: string): Promise<Box> => {
  const b = await page.getByTestId(id).first().boundingBox();
  expect(b, `${id} should have a box`).not.toBeNull();
  return b!;
};

async function freshGame(page: Page, seed: string) {
  await page.goto(`/?seed=${seed}&fresh`);
  await expect(page.locator("html")).toHaveAttribute("data-game", "ready", { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { __tg: { pause(): void } }).__tg.pause());
}
const advance = (page: Page, n: number) =>
  page.evaluate((k) => (window as unknown as { __tg: { advance(n: number): void } }).__tg.advance(k), n);

test.describe("phone layout", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "phone", "phone-only geometry"));

  test("fill: sheet closes, toast docks above Trade, Trade clears the tab bar", async ({ page }) => {
    await freshGame(page, "alpha");
    await page.getByTestId("watch-HLCN").click();
    await page.getByTestId("open-trade").click();
    await page.getByTestId("order-qty").fill("1");
    await page.getByTestId("order-submit").click();
    await advance(page, 3);
    await expect(page.getByTestId("toast").first()).toBeVisible();
    await expect(page.getByTestId("order-submit"), "sheet should close on a fill").toBeHidden();
    const toast = await box(page, "toast"), trade = await box(page, "open-trade");
    const nav = (await page.getByRole("navigation", { name: "Main" }).boundingBox())!;
    const toastGap = trade.y - (toast.y + toast.height);
    const navGap = nav.y - (trade.y + trade.height);
    expect(toastGap, "toast bottom above Trade (spec 8px)").toBeGreaterThanOrEqual(4);
    expect(toastGap).toBeLessThanOrEqual(16);
    expect(navGap, "Trade above tab bar (spec 16px)").toBeGreaterThanOrEqual(8);
    await expect(page.getByTestId("trade-fade")).toHaveCount(1);
    await page.screenshot({ path: "test-results/proof/phone-after-fill-docked.png" });
  });

  test("scrolled to the bottom, the last row clears the Trade button", async ({ page }) => {
    await freshGame(page, "alpha");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    const lastBottom = await page.getByTestId("phone-main").evaluate((m) => {
      const kids = [...m.children].filter((c) => (c as HTMLElement).offsetHeight > 0);
      return kids[kids.length - 1]!.getBoundingClientRect().bottom;
    });
    const trade = await box(page, "open-trade");
    expect(trade.y - lastBottom, "last child of phone-main above Trade (spec 24px)").toBeGreaterThanOrEqual(8);
    await page.screenshot({ path: "test-results/proof/phone-scrolled-bottom.png" });
  });
});

test("credits: reachable from More and lists TradingView", async ({ page }, info) => {
  await freshGame(page, "alpha");
  await page.getByTestId(info.project.name === "phone" ? "tab-more" : "nav-more").click();
  await expect(page).toHaveURL(/\/credits$/);
  await expect(page.getByTestId("credits")).toContainText("TradingView");
  await expect(page.locator("a[href*='tradingview.com']").first()).toBeVisible();
});

test("chart: no TradingView logo overlay", async ({ page }) => {
  await freshGame(page, "alpha");
  await expect(page.getByTestId("chart-price")).toBeVisible();
  await expect(page.getByTestId("chart-price").locator("a[href*='tradingview.com']")).toHaveCount(0);
});
