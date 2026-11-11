import { expect, type Locator, type Page } from "@playwright/test";

export async function openPhoneTicket(broker: Locator) {
  const trade = broker.getByTestId("br-trade");
  if (await trade.count() && await trade.getAttribute("aria-expanded") === "false") {
    await trade.click();
    await expect(broker.getByTestId("br-sheet")).toBeVisible();
  }
}

export async function closePhoneTicket(page: Page) {
  const close = page.getByTestId("br-sheet-close");
  if (await close.count()) {
    await close.click();
    await expect(page.getByTestId("br-sheet")).toHaveCount(0);
    await expect(page.getByTestId("br-trade")).toBeFocused();
  }
}
