import { expect, type Locator, type Page } from "@playwright/test";

export async function openPhoneTicket(broker: Locator) {
  const trade = broker.getByTestId("br-trade");
  if (await trade.count() && await trade.getAttribute("aria-expanded") === "false") {
    await trade.click();
    const sheet = broker.getByTestId("br-sheet");
    await expect(sheet).toBeVisible();
    await sheet.evaluate((el) => {
      for (const animation of el.getAnimations()) {
        if (animation instanceof CSSAnimation && animation.animationName === "sheet-up") animation.finish();
      }
    });
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
