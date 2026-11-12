// Card 28: Broker footer “Simulated market. Not financial advice.”
import { expect, test, type Page } from "@playwright/test";
import { boot } from "../shell/helpers";

const EN = "Simulated market. Not financial advice.";

function twoFrames(page: Page) {
  return page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test("live Broker ticket shows the simulated-market footer", async ({ page }, info) => {
  await boot(page, "/broker?asset=HALC");
  const ticket = info.project.name === "phone"
    ? page.getByTestId("phone-appview").getByTestId("broker")
    : page.getByTestId("win-broker").getByTestId("broker");
  await expect(ticket).toBeVisible();
  await expect(ticket).toHaveAttribute("data-state", /^(?!loading$)/);
  await expect(ticket.getByTestId("br-disclaimer")).toHaveText(EN);
});

test("holding /api/auth/me: the footer, if present, is the static sentence with no invented number", async ({ page }, info) => {
  await page.route("**/api/auth/me", () => { /* hold */ });
  await boot(page, "/broker?asset=HALC");
  await twoFrames(page);
  const ticket = info.project.name === "phone"
    ? page.getByTestId("phone-appview").getByTestId("broker")
    : page.getByTestId("win-broker").getByTestId("broker");
  if (await ticket.getAttribute("data-state") === "loading") {
    const disc = ticket.getByTestId("br-disclaimer");
    if (await disc.count()) {
      await expect(disc).toHaveText(EN);
      await expect(disc).not.toHaveText(/\$|\d+\.\d{2}/);
    }
    return;
  }
  await expect(ticket.getByTestId("br-disclaimer")).toHaveText(EN);
  await expect(ticket.getByTestId("br-disclaimer")).not.toHaveText(/\$|\d+\.\d{2}/);
});
