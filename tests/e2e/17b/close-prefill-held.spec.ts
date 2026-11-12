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
  for (const asset of ["NRON", "VOLT", "AVB", "GX"]) await openBroker(page, asset);
  await expect(page.getByTestId("win-broker")).toHaveCount(4);

  await page.getByTestId("tile-portfolio").click();
  await page.getByTestId("win-portfolio").first().getByTestId("pf-tab-positions").click();
  await expect(page.getByTestId("pf-positions").first()).toHaveAttribute("data-state", "live");
  await page.locator('[data-testid="pos-row"][data-asset="HALC"]').getByTestId("pos-close").click();

  await expect(page.getByTestId("pos-close-cap")).toBeVisible();
  await expect(ticketOf(page, "HALC")).toHaveCount(0);

  // Deep-link at the cap focuses an existing Broker and does not open HALC (17a-T4).
  // Free one slot, then open HALC: it must not be a leftover Sell.
  const gx = page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker").filter({ hasText: "GX" }) });
  await gx.getByTestId("win-close").click();
  await expect(page.getByTestId("win-broker")).toHaveCount(3);
  await boot(page, "/broker?asset=HALC");
  const halc = ticketOf(page, "HALC");
  await expect(halc).toBeVisible();
  await expect(halc).toHaveAttribute("data-phase", "edit");
  await expect(halc.getByTestId("br-side-sell")).not.toHaveAttribute("aria-pressed", "true");
  await expect(halc.getByTestId("br-qty")).toHaveValue("");
});
