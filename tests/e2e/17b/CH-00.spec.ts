// 17B CH-00 CH-07: Broker, Portfolio and Wire are built:true and lazy-loaded. Wire renders its feed since UI card 1
// (WIR-A) and Broker its ticket since UI card 4 (BRK-A, which undoes #71's built:false); Portfolio has real UI since
// card 2 (PF-A.spec), so the APPS loop covers Broker and Wire. No screenshots here (BR-4.spec and WIR-A take them).
// The Broker ≤ 200 KB first-load check is S1-20.
import { expect, test, type Locator } from "@playwright/test";
import { REGISTRY } from "../../../src/shell/registry";
import { boot } from "../shell/helpers";

const APPS = [["broker", "Broker"], ["wire", "Wire"]] as const;

for (const [id] of APPS) {
  test(`CH-07 ${id} opens (deep link) and renders its body from its own lazy chunk`, async ({ page }) => {
    const chunks: string[] = [];
    page.on("response", (r) => { if (r.url().includes("/_next/static/chunks/")) chunks.push(r.url()); });
    await boot(page, `/${id}`);
    await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId("coming-later")).toHaveCount(0);
    expect(chunks.length).toBeGreaterThan(0);
  });
}

test("CH-07 desktop: tiles open each 17B app as a window", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop project only");
  await boot(page);
  for (const [id] of APPS) {
    // The default layout may already hold a window of this app; the tile opens or focuses one, either way it shows the body.
    await page.getByTestId(`tile-${id}`).click();
    const win = page.getByTestId(`win-${id}`).last();
    await expect(win.getByTestId(id)).toBeVisible();
    await expect(win.getByTestId("coming-later")).toHaveCount(0);
  }
});

// QA #71 follow-up: `built` is derived from src/shell/appModules.ts, the same record AppBody renders from. Every app the
// registry calls built must open its real body (its root carries data-testid=<id>): not ComingLater, no stuck skeleton.
// Since UI card 4 that list is broker, portfolio, settings, wire.
const BUILT = REGISTRY.filter((a) => a.built).map((a) => a.id);
// QA #78 follow-up: the root testid alone does not prove the body rendered, so each built app must also show copy that
// only its real body draws (EN, the boot locale). A new built app fails here until it names its own.
const LOCATE = (scope: Locator): Record<string, Locator> => ({
  broker: scope.getByRole("button", { name: "Review order" }),
  portfolio: scope.getByText("Net worth", { exact: true }).first(),
  settings: scope.getByText("Appearance", { exact: true }).first(),
  wire: scope.getByRole("radiogroup", { name: "Wire filters" }).getByRole("radio", { name: "All" }),
});

test("CH-08 every built app deep-links to its real body and shows its own copy, never ComingLater or a stuck skeleton", async ({ page }, info) => {
  expect([...BUILT].sort()).toEqual(["broker", "portfolio", "settings", "wire"]); // also pinned by tests/unit/shell/app-modules.test.tsx
  for (const id of BUILT) {
    await boot(page, `/${id}`);
    const scope = info.project.name === "desktop" ? page.getByTestId(`win-${id}`) : page.locator(`[data-testid="phone-appview"][data-app="${id}"]`);
    await expect(scope, id).toHaveCount(1);
    await expect(scope.getByTestId(id), id).toBeVisible();
    const content = LOCATE(scope)[id];
    if (!content) throw new Error(`CH-08: ${id} is built; name the rendered copy that proves its body`);
    await expect(content, id).toBeVisible();
    await expect(scope.getByTestId("coming-later"), id).toHaveCount(0);
    await expect(scope.getByTestId("app-skeleton"), id).toHaveCount(0);
  }
});
