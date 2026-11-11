// Card 8: on phone, Back to trade keeps the player's place in Trade and leaves focus visible.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { boot } from "../shell/helpers";

const broker = (page: Page) => page.getByTestId("broker").first();
async function shot(page: Page, name: string) {
  if (!process.env.RETURN_SHOTS_DIR) return;
  mkdirSync(process.env.RETURN_SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: `${process.env.RETURN_SHOTS_DIR}/${name}.png`, animations: "disabled", caret: "hide" });
}
async function phoneBroker(page: Page, width: number, locale: "en" | "fr", scale: 1 | 2, baseURL?: string) {
  if (baseURL) { // signed in: the real ledger Broker (provenance, cash) is the longer Trade a new player scrolls
    const r = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle: `Ret${width}${Date.now().toString(36)}`, password: "local-return-test" } });
    expect(r.status(), await r.text()).toBe(201);
  }
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot(page, `/settings?locale=${locale}`);
  if (scale === 2) { await page.getByTestId("set-nav-SET-02").click(); await page.getByTestId("text-scale").fill("2"); await page.getByTestId("text-scale").blur(); await page.getByTestId("app-back").click(); }
  await page.getByTestId("app-back").click(); await page.getByTestId("icon-broker").click();
  await expect(broker(page)).toHaveAttribute("data-state", "live");
  await broker(page).getByTestId("br-asset-select").selectOption("HALC");
}
const scrollTop = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>(".phone-appbody")!.scrollTop);
/** The focused element is fully on screen inside the app body and above the Trade bar. */
const focusVisible = (page: Page) => page.evaluate(() => {
  const a = document.activeElement as HTMLElement | null, sc = document.querySelector<HTMLElement>(".phone-appbody")!;
  if (!a || a === document.body) return { ok: false, id: "BODY" };
  const r = a.getBoundingClientRect(), box = sc.getBoundingClientRect(), bar = document.querySelector('[data-testid="br-trade-bar"]')?.getBoundingClientRect();
  const bottom = bar ? Math.min(box.bottom, bar.top) : box.bottom;
  // A control must be fully inside the band; the Trade region (taller than the screen) must cover part of it.
  const ok = a.dataset.testid === "br-trade-region" ? r.top < bottom && r.bottom > box.top : r.top >= box.top - 0.5 && r.bottom <= bottom + 0.5;
  return { ok: ok && r.height > 0, id: a.dataset.testid ?? a.tagName };
});

for (const [width, locale, scale] of [[390, "en", 1], [320, "fr", 2]] as const) test(`phone ${locale} x${scale} ${width}: Back to trade keeps the scrolled place; focus stays visible`, async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone Back to trade");
  let orders = 0;
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/broker/orders") orders++; });
  await phoneBroker(page, width, locale, scale, baseURL);
  const heading = broker(page).getByTestId("br-oo-count");
  await page.evaluate(() => { const s = document.querySelector<HTMLElement>(".phone-appbody")!; s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(300);
  await shot(page, `${locale}${scale}-${width}-1-trade-scrolled`);
  // Read the offset at the moment About opens, and click without Playwright's own scroll-into-view.
  const place = () => page.evaluate(() => Math.round(document.querySelector('[data-testid="br-oo-count"]')!.getBoundingClientRect().top));
  const before = await broker(page).getByTestId("br-view-about").evaluate((e) => {
    const v = document.querySelector<HTMLElement>(".phone-appbody")!.scrollTop, top = Math.round(document.querySelector('[data-testid="br-oo-count"]')!.getBoundingClientRect().top);
    (e as HTMLElement).click(); return { v, top };
  });
  const saved = before.v;
  expect(saved).toBeGreaterThan(50);
  await expect(page.getByTestId("br-about-title")).toBeFocused();
  await shot(page, `${locale}${scale}-${width}-2-about`);
  await page.getByTestId("app-back").click();
  await expect(broker(page)).toHaveAttribute("data-view", "trade");
  // Focus lands (after the layout settles) on the Trade region, named "Trade", not on the off-screen select.
  const region = broker(page).getByTestId("br-trade-region");
  await expect(region).toBeFocused();
  await expect(region).toHaveAccessibleName(locale === "fr" ? "Trader" : "Trade");
  // Same place: the Open orders heading sits exactly where it was when About opened.
  expect(Math.abs((await place()) - before.top), "Open orders heading moved").toBeLessThanOrEqual(2);
  expect(Math.abs((await scrollTop(page)) - saved)).toBeLessThanOrEqual(1);
  if (before.top < 700) await expect(heading).toBeInViewport();
  const f = await focusVisible(page);
  expect(f.ok, `focus ${f.id} intersects the visible band`).toBe(true);
  const b = await broker(page).getByTestId("br-view-about").boundingBox();
  expect(b!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => { const s = document.querySelector<HTMLElement>(".phone-appbody")!; return s.scrollWidth <= s.clientWidth && document.documentElement.scrollWidth <= innerWidth; })).toBe(true);
  const axe = await new AxeBuilder({ page }).include('[data-testid="broker"]').analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  expect(orders).toBe(0);
  await shot(page, `${locale}${scale}-${width}-3-back-same-place`);
});

test("phone: unscrolled Trade keeps the asset-select focus contract on Back", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone Back to trade");
  await phoneBroker(page, 390, "en", 1);
  expect(await scrollTop(page)).toBe(0);
  await broker(page).getByTestId("br-view-about").evaluate((e) => (e as HTMLElement).click());
  await page.getByTestId("app-back").click();
  await expect(page.getByTestId("br-asset-select")).toBeFocused();
  expect(await scrollTop(page)).toBe(0);
});

test("desktop: Trade | About unchanged, Trade focuses the ticker", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop contract");
  await boot(page, "/broker?asset=HALC");
  await expect(broker(page)).toHaveAttribute("data-state", "live");
  await broker(page).getByTestId("br-view-about").click();
  await expect(page.getByTestId("br-about-title")).toBeFocused();
  await broker(page).getByTestId("br-view-trade").click();
  await expect(page.getByTestId("br-ticker")).toBeFocused();
  await shot(page, "desktop-trade-after-about");
});
