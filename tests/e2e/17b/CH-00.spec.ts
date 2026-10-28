// 17B CH-00 CH-07: Portfolio and Wire are built:true and lazy-loaded. Wire renders its feed since UI card 1 (WIR-A);
// Portfolio has real UI since card 2 (PF-A.spec), so the APPS loop covers Wire only. Broker is built:false until BRK-A
// (Producer follow-up to #67): ComingLater straight away, no chunk, no loading state. No screenshots (spec: no UI).
// The Broker ≤ 200 KB first-load check is S1-20.
import { expect, test } from "@playwright/test";
import { REGISTRY } from "../../../src/shell/registry";
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
  const desktop = info.project.name === "desktop";
  // Record any loading state (skeleton, aria-busy) that ever appears in a Broker window (desktop) or the Broker screen
  // (phone), from the first paint on: on desktop the default layout's Broker window mounts at boot, before the tile
  // click. Scoped to Broker, so the Portfolio window's own chunk skeleton (#67) cannot affect it.
  await page.addInitScript(() => {
    const w = window as Window & { __brokerLoading?: string[] };
    w.__brokerLoading = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('[data-testid="app-skeleton"], [aria-busy="true"]')) {
        if (el.closest('[data-testid="win-broker"], [data-testid="phone-appview"][data-app="broker"]')) w.__brokerLoading!.push(el.outerHTML.slice(0, 80));
      }
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
  await boot(page);
  // Let the default layout's Portfolio and Wire chunks settle, so only what opening Broker does is held below.
  if (desktop) await expect(page.getByTestId("wire")).toHaveAttribute("data-state", /^(?!loading$)/);
  await expect(page.getByTestId("app-skeleton")).toHaveCount(0);
  // Desktop: the default layout already has a Broker window, so the tile opens a new instance; capture it by instance.
  const before = desktop ? await page.getByTestId("win-broker").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.instance ?? "")) : [];
  // Hold every JS chunk requested from here on: a lazy body could never arrive, so whatever shows is synchronous.
  const held: string[] = [];
  await page.route("**/_next/static/chunks/**", (route) => { held.push(route.request().url()); });
  await page.getByTestId(desktop ? "tile-broker" : "icon-broker").click();
  const scope = desktop
    ? page.locator(`[data-testid="win-broker"]${before.map((n) => `:not([data-instance="${n}"])`).join("")}`)
    : page.locator('[data-testid="phone-appview"][data-app="broker"]');
  await expect(scope).toHaveCount(1);
  const body = scope.getByTestId("coming-later");
  await expect(body).toHaveText(/Broker\s*Coming later/);
  await expect(body.getByRole("button")).toHaveCount(0);
  await expect(scope.getByTestId("app-skeleton")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __brokerLoading?: string[] }).__brokerLoading)).toEqual([]);
  expect(held).toEqual([]); // opening Broker requests no chunk at all
});

test("CH-07 Broker deep link opens the Broker window (desktop) or screen (phone) with ComingLater", async ({ page }, info) => {
  await boot(page, "/broker");
  // A deep link skips the default layout, so on desktop the Broker window is the only window.
  const scope = info.project.name === "desktop" ? page.getByTestId("win-broker") : page.locator('[data-testid="phone-appview"][data-app="broker"]');
  await expect(scope).toHaveCount(1);
  if (info.project.name === "desktop") await expect(page.locator(".win")).toHaveCount(1);
  await expect(scope.getByTestId("coming-later")).toHaveText(/Broker\s*Coming later/);
  await expect(scope.getByTestId("app-skeleton")).toHaveCount(0);
  await expect(page).toHaveURL(/\/broker$/);
});

// QA #71 follow-up: `built` is derived from src/shell/appModules.ts, the same record AppBody renders from. Every app the
// registry calls built must open its real body (its root carries data-testid=<id>): not ComingLater, no stuck skeleton.
const BUILT = REGISTRY.filter((a) => a.built).map((a) => a.id);

test("CH-08 every built app deep-links to its real body, never ComingLater or a stuck skeleton", async ({ page }, info) => {
  expect(BUILT.length).toBeGreaterThan(0); // the exact list is pinned by tests/unit/shell/app-modules.test.tsx
  for (const id of BUILT) {
    await boot(page, `/${id}`);
    const scope = info.project.name === "desktop" ? page.getByTestId(`win-${id}`) : page.locator(`[data-testid="phone-appview"][data-app="${id}"]`);
    await expect(scope, id).toHaveCount(1);
    await expect(scope.getByTestId(id), id).toBeVisible();
    await expect(scope.getByTestId("coming-later"), id).toHaveCount(0);
    await expect(scope.getByTestId("app-skeleton"), id).toHaveCount(0);
  }
});
