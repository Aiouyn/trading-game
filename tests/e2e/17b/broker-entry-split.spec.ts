import { expect, test, type Page } from "@playwright/test";
import { closePhoneTicket, openPhoneTicket } from "./ticketSheet";

function scripts(page: Page) {
  const pending: Promise<string>[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.endsWith(".js")) pending.push(response.text());
  });
  return async () => (await Promise.all(pending)).join("\n");
}

async function openBroker(page: Page) {
  await page.goto("/broker?asset=HALC");
  await expect(page.getByTestId("br-chart").first()).toHaveAttribute("data-state", "plot");
  await page.waitForLoadState("networkidle");
}

test("Broker does not fetch Settings; the cold Account entry still opens a usable form", async ({ page }, info) => {
  const loaded = scripts(page);
  await openBroker(page);
  expect(await loaded()).not.toContain('"settings-account"');
  if (info.project.name === "phone") await page.getByTestId("app-back").click();
  await page.getByTestId("sign-in-entry").click();
  await expect(page.getByTestId("settings-account")).toBeVisible();
  await page.getByTestId("account-handle-input").fill("entry_probe");
  await expect(page.getByTestId("account-handle-input")).toHaveValue("entry_probe");
  expect(await loaded()).toContain('"settings-account"');
});

test("Broker keeps Overview synchronous and defers News without losing entry focus or the trade draft", async ({ page }, info) => {
  const loaded = scripts(page);
  await openBroker(page);
  // PR105 already loads AssetPage (and therefore Overview) as a retryable lazy chunk only when About opens,
  // so first-load Trade JS does not contain Overview. News stays out until the News tab.
  expect(await loaded()).not.toContain('"ap-overview"');
  expect(await loaded()).not.toContain('"ap-news"');
  await openPhoneTicket(page.getByTestId("broker").first());
  const qty = page.getByTestId("br-qty").first();
  await qty.fill("7");
  await closePhoneTicket(page);
  await page.getByTestId("br-view-about").first().click();
  await expect(page.getByTestId("br-about-title")).toBeFocused();
  await expect(page.getByTestId("ap-overview")).toBeVisible();
  await expect(page.getByTestId("ap-news-loading")).toHaveCount(0);
  expect(await loaded()).toContain('"ap-overview"');
  expect(await loaded()).not.toContain('"ap-news"');
  await page.getByTestId("br-about-tabs-news").click();
  await expect(page.getByTestId("ap-news")).toBeVisible();
  expect(await loaded()).toContain('"ap-news"');
  if (info.project.name === "phone") await page.getByTestId("app-back").click();
  else await page.getByTestId("br-view-trade").first().click();
  await openPhoneTicket(page.getByTestId("broker").first());
  await expect(qty).toHaveValue("7");
});
