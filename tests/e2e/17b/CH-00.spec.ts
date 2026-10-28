// 17B CH-00 CH-07: Portfolio and Wire are built:true and lazy-loaded. Wire renders its feed since UI card 1 (WIR-A);
// Portfolio has real UI since card 2 (PF-A.spec), so the APPS loop covers Wire only. Broker is built:false until BRK-A
// (Producer follow-up to #67): ComingLater straight away, no chunk, no loading state. No screenshots (spec: no UI).
// The Broker ≤ 200 KB first-load check is S1-20.
import { expect, test } from "@playwright/test";
import { boot } from "../shell/helpers";

const APPS = [["wire", "Wire"]] as const;

for (const [id, name] of APPS) {
  test(`CH-07 ${id} opens (deep link) and renders ComingLater from its own lazy chunk`, async ({ page }) => {
    const chunks: string[] = [];
    page.on("response", (r) => { if (r.url().includes("/_next/static/chunks/")) chunks.push(r.url()); });
    await boot(page, `/${id}`);
    if (id === "wire") await expect(page.getByTestId("wire")).toBeVisible();
    else {
      const body = page.getByTestId("coming-later");
      await expect(body).toHaveText(new RegExp(`${name}\\s*Coming later`));
      await expect(body.getByRole("button")).toHaveCount(0);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });
}

test("CH-07 desktop: tiles open each 17B app as a window", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop project only");
  await boot(page);
  for (const [id, name] of APPS) {
    await page.getByTestId(`tile-${id}`).click();
    const win = page.getByTestId(`win-${id}`).first();
    if (id === "wire") await expect(win.getByTestId("wire")).toBeVisible();
    else await expect(win.getByTestId("coming-later")).toHaveText(new RegExp(`${name}\\s*Coming later`));
    await win.getByTestId("win-close").click();
  }
});

test("CH-07 Broker is built:false: ComingLater straight away, even with every new chunk request held", async ({ page }, info) => {
  await boot(page);
  // Hold every JS chunk requested from here on: a lazy body could never arrive, so whatever shows is synchronous.
  const held: string[] = [];
  await page.route("**/_next/static/chunks/**", (route) => { held.push(route.request().url()); });
  // Record any loading state that appears before ComingLater (skeleton, aria-busy, status text).
  await page.evaluate(() => {
    const w = window as Window & { __brokerLoading?: string[] };
    w.__brokerLoading = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('[data-testid="app-skeleton"], [aria-busy="true"]')) w.__brokerLoading!.push(el.outerHTML.slice(0, 80));
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  if (info.project.name === "phone") await page.getByTestId("icon-broker").click();
  else await page.getByTestId("tile-broker").click();
  const scope = info.project.name === "phone" ? page : page.getByTestId("win-broker").first();
  const body = scope.getByTestId("coming-later");
  await expect(body).toHaveText(/Broker\s*Coming later/);
  await expect(body.getByRole("button")).toHaveCount(0);
  await expect(scope.getByTestId("app-skeleton")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __brokerLoading?: string[] }).__brokerLoading)).toEqual([]);
  expect(held).toEqual([]); // opening Broker requests no chunk at all
});

test("CH-07 Broker deep link renders ComingLater", async ({ page }) => {
  await boot(page, "/broker");
  await expect(page.getByTestId("coming-later")).toHaveText(/Broker\s*Coming later/);
});
