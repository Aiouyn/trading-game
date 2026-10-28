// 17B CH-00 CH-07: Broker, Portfolio and Wire are built:true and lazy-loaded. Broker and Portfolio still render
// ComingLater as windows (desktop) and screens (phone); Wire renders its feed since UI card 1 (WIR-A). No screenshots (spec: no UI). The Broker ≤ 200 KB first-load check is S1-20.
import { expect, test } from "@playwright/test";
import { boot } from "../shell/helpers";

const APPS = [["broker", "Broker"], ["wire", "Wire"]] as const; // portfolio has real UI since card 2 (PF-A.spec)

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
