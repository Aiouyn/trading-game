import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { boot } from "../shell/helpers";

const broker = (page: Page) => page.getByTestId("broker").first();
async function shot(page: Page, name: string) {
  if (!process.env.SHEET_SHOTS_DIR) return;
  mkdirSync(process.env.SHEET_SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: `${process.env.SHEET_SHOTS_DIR}/${name}.png`, animations: "disabled", caret: "hide" });
}
async function modalFocus(sheet: Locator, page: Page) {
  for (const key of ["Tab", "Tab", "Shift+Tab", "Shift+Tab", "Tab", "Tab", "Tab", "Tab", "Tab", "Tab", "Tab", "Tab"]) {
    await page.keyboard.press(key);
    expect(await sheet.evaluate((s) => s.contains(document.activeElement))).toBe(true);
  }
}
async function box(control: Locator) {
  const bounds = await control.boundingBox();
  if (!bounds) throw new Error("Expected a visible touch target");
  return bounds;
}
async function noOverflow(page: Page) {
  const sheet = page.getByTestId("br-sheet");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await sheet.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect(await sheet.locator(".qs-body").evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  for (const control of await sheet.locator("button, input").all()) {
    const b = await box(control);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
  }
}

test("phone: Trade only opens; focus trap, all dismissals, preserved draft, one real fill shown in Portfolio", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "real phone order flow");
  test.setTimeout(90_000);
  if (!baseURL) throw new Error("Expected the configured trusted app origin");
  const registered = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle: `Sheet${Date.now().toString(36)}`, password: "local-sheet-test" } });
  expect(registered.status(), await registered.text()).toBe(201);
  let orders = 0;
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/broker/orders") orders++; });
  await boot(page, "/broker?asset=HALC");
  await expect(broker(page)).toHaveAttribute("data-state", "live");
  const trade = broker(page).getByTestId("br-trade");
  await expect(trade).toHaveAccessibleName("Trade");
  await expect(broker(page).getByTestId("br-qty")).toHaveCount(0);
  const fab = await box(trade), edge = await box(page.getByTestId("edge-bar"));
  expect(fab.width).toBeGreaterThanOrEqual(44); expect(fab.height).toBeGreaterThanOrEqual(44);
  expect(fab.y + fab.height).toBeLessThanOrEqual(edge.y - 12);
  expect(await trade.evaluate((e) => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  await shot(page, "phone-01-floating-trade");
  await trade.focus(); await page.keyboard.press("Enter");
  const sheet = page.getByTestId("br-sheet"), qty = sheet.getByTestId("br-qty");
  await expect(qty).toBeFocused(); await expect(sheet).toHaveAccessibleName("Order ticket · HALC");
  await qty.fill("3"); await expect(sheet.getByTestId("br-review")).toBeEnabled();
  await noOverflow(page); await modalFocus(sheet, page);
  expect(orders).toBe(0);
  await shot(page, "phone-02-edit-ticket");
  await sheet.getByTestId("br-review").click();
  await expect(sheet.getByTestId("br-place")).toBeEnabled();
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(1);
  expect(await sheet.evaluate((s) => s.contains(document.activeElement))).toBe(true);
  await modalFocus(sheet, page); expect(orders).toBe(0);
  await shot(page, "phone-03-review");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0); await expect(trade).toBeFocused();
  await page.keyboard.press("Enter"); await expect(qty).toHaveValue("3"); await expect(qty).toBeFocused();
  await page.getByTestId("br-sheet-scrim").click({ position: { x: 5, y: 5 } });
  await expect(sheet).toHaveCount(0); await expect(trade).toBeFocused();
  await trade.tap(); await sheet.getByTestId("br-sheet-close").click();
  await expect(trade).toBeFocused(); expect(orders).toBe(0);
  await trade.tap(); await expect(qty).toHaveValue("3");
  await sheet.getByTestId("br-review").click();
  await expect(sheet.getByTestId("br-place")).toBeEnabled();
  await sheet.getByTestId("br-place").click();
  await expect(sheet.getByTestId("br-ack-title")).toHaveText(/^Bought 3 HALC at /, { timeout: 15_000 });
  expect(orders).toBe(1); expect(await sheet.evaluate((s) => s.contains(document.activeElement))).toBe(true);
  const saved: unknown = await (await page.request.get("/api/broker/me")).json();
  expect(saved).toMatchObject({ positions: { HALC: { qty: "3" } }, fills: [{ side: "BUY", qty: "3" }] });
  await shot(page, "phone-04-real-fill");
  await sheet.getByTestId("br-sheet-close").click(); await expect(trade).toBeFocused();
  await page.getByTestId("app-back").click();
  await page.getByTestId("icon-portfolio").click();
  await page.getByTestId("pf-open-positions").click();
  const position = page.locator('[data-testid="pos-row"][data-asset="HALC"]');
  await expect(position).toBeVisible(); await expect(position.getByTestId("pos-qtyat")).toHaveText(/^3 @ /);
  await expect(position.getByTestId("pos-pnl")).toBeVisible();
  await shot(page, "phone-05-portfolio-position");
});

for (const width of [390, 320]) test(`phone FR200% at ${width}: safe scrollable ticket and review, 44px controls, no overflow, axe`, async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "minimum phone widths");
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot(page, "/settings?locale=fr");
  await page.getByTestId("set-nav-SET-02").click();
  await page.getByTestId("text-scale").fill("2"); await page.getByTestId("text-scale").blur();
  await page.getByTestId("app-back").click(); await page.getByTestId("app-back").click();
  await page.getByTestId("icon-broker").click();
  await expect(broker(page)).toHaveAttribute("data-state", "live");
  await broker(page).getByTestId("br-asset-select").selectOption("HALC");
  const trade = page.getByTestId("br-trade"), sheet = page.getByTestId("br-sheet");
  await expect(trade).toHaveText("Trader"); await trade.tap();
  await expect(sheet.getByTestId("br-qty")).toBeFocused();
  await sheet.getByTestId("br-qty").fill("3");
  await expect(sheet.getByTestId("br-review")).toBeEnabled();
  await noOverflow(page); await shot(page, `phone-fr200-${width}-edit`);
  await sheet.getByTestId("br-review").click();
  await expect(sheet.getByTestId("br-action")).toHaveText("Acheter 3 HALC");
  await noOverflow(page); await modalFocus(sheet, page);
  const axe = await new AxeBuilder({ page }).include('[data-testid="br-sheet"]').analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await shot(page, `phone-fr200-${width}-review`);
  await sheet.getByTestId("br-sheet-close").click(); await expect(trade).toBeFocused();
  await page.getByTestId("br-view-about").click();
  await expect(trade).toHaveCount(0); await expect(sheet).toHaveCount(0);
});

test("desktop remains inline; crossing the shell breakpoint removes the phone modal", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop and responsive boundary");
  await boot(page, "/broker?asset=HALC"); await expect(broker(page)).toHaveAttribute("data-state", "live");
  await expect(page.getByTestId("br-trade")).toHaveCount(0); await expect(page.getByTestId("br-ticket").first()).toBeVisible();
  await shot(page, "desktop-unchanged-inline-ticket");
  await page.setViewportSize({ width: 767, height: 844 });
  await page.getByTestId("icon-broker").click();
  await page.getByTestId("br-trade").click(); await page.getByTestId("br-qty").fill("7");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId("br-sheet")).toHaveCount(0); await expect(page.getByTestId("br-trade")).toHaveCount(0);
  await expect(page.getByTestId("br-ticket").first()).toBeVisible();
});

async function signIn(page: Page, baseURL: string | undefined, tag: string) {
  if (!baseURL) throw new Error("Expected the configured trusted app origin");
  const r = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle: `${tag}${Date.now().toString(36)}`, password: "local-sheet-test" } });
  expect(r.status(), await r.text()).toBe(201);
}
async function phoneBroker(page: Page, width: number, locale: "en" | "fr", scale: 1 | 2, hook = "") {
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot(page, `/settings?locale=${locale}${hook ? `&${hook}` : ""}`);
  if (scale === 2) { await page.getByTestId("set-nav-SET-02").click(); await page.getByTestId("text-scale").fill("2"); await page.getByTestId("text-scale").blur(); await page.getByTestId("app-back").click(); }
  await page.getByTestId("app-back").click(); await page.getByTestId("icon-broker").click();
  await expect(broker(page)).toHaveAttribute("data-state", "live");
}
/** At one scroll offset: Broker text leaves under the Trade bar are covered by the opaque bar, never visible beside the button. */
async function barGeometry(page: Page, at: "top" | "middle" | "end") {
  return page.evaluate((where) => {
    const scroller = document.querySelector<HTMLElement>(".phone-appbody")!, bar = document.querySelector<HTMLElement>('[data-testid="br-trade-bar"]')!;
    const max = scroller.scrollHeight - scroller.clientHeight;
    scroller.scrollTop = where === "top" ? 0 : where === "middle" ? Math.floor(max / 2) : max;
    const b = bar.getBoundingClientRect(), edge = document.querySelector('[data-testid="edge-bar"]')!.getBoundingClientRect();
    const leaves = [...document.querySelectorAll<HTMLElement>(".br *")].filter((e) => e.children.length === 0 && e.textContent!.trim() && !bar.contains(e))
      .map((e) => ({ id: e.dataset.testid ?? e.className, r: e.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.height > 0);
    const under = leaves.filter(({ r }) => r.bottom > b.top && r.top < b.bottom).map(({ id, r }) => {
      const hit = document.elementFromPoint((Math.max(r.left, b.left) + Math.min(r.right, b.right)) / 2, (Math.max(r.top, b.top) + Math.min(r.bottom, b.bottom)) / 2);
      return { id, covered: !!hit && bar.contains(hit) };
    });
    const bg = getComputedStyle(bar).backgroundColor;
    return { scrolled: scroller.scrollTop, max, barTop: b.top, barBottom: b.bottom, barLeft: b.left, barRight: b.right, edgeTop: edge.top, vw: innerWidth,
      opaque: !/rgba\(.*,\s*0(\.\d+)?\)$|transparent/.test(bg), under, below: leaves.filter(({ r }) => r.bottom > b.top + 0.5).map(({ id }) => id),
      provenance: document.querySelector('[data-testid="br-chart-source"]')?.getBoundingClientRect().bottom ?? null, overflow: document.documentElement.scrollWidth > innerWidth };
  }, at);
}

for (const [width, locale, scale] of [[390, "en", 1], [320, "en", 1], [390, "fr", 2], [320, "fr", 2]] as const) test(`phone ${locale} x${scale} ${width}: nothing shows behind the Trade bar; provenance footnote clears it`, async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone Trade bar geometry");
  await signIn(page, baseURL, "Bar");
  await phoneBroker(page, width, locale, scale);
  await expect(broker(page).getByTestId("br-chart-source")).toBeVisible();
  const trade = await box(page.getByTestId("br-trade"));
  expect(trade.height).toBeGreaterThanOrEqual(44); expect(trade.width).toBeGreaterThanOrEqual(44);
  for (const at of ["top", "middle", "end"] as const) {
    const g = await barGeometry(page, at);
    expect(g.opaque, at).toBe(true); expect(g.overflow, at).toBe(false);
    expect(g.barLeft).toBe(0); expect(g.barRight).toBe(g.vw);
    expect(g.barBottom, `${at}: bar above the edge nav`).toBeLessThanOrEqual(g.edgeTop);
    expect(g.under.filter((u) => !u.covered), `${at}: text visible behind the Trade bar`).toEqual([]);
    if (at === "end") {
      expect(g.scrolled).toBe(g.max);
      expect(g.below, "end of scroll: every Broker text leaf ends above the Trade bar").toEqual([]);
      expect(g.provenance!).toBeLessThanOrEqual(g.barTop);
    }
  }
  await shot(page, `phone-bar-${locale}${scale}-${width}-end`);
});

for (const [width, locale, scale] of [[390, "en", 1], [320, "fr", 2]] as const) test(`phone ${locale} x${scale} ${width}: first-trade cap row renders in the reviewed sheet; the real null hides it`, async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone sheet cap row");
  let orders = 0;
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/broker/orders") orders++; });
  const review = async () => {
    await broker(page).getByTestId("br-asset-select").selectOption("HALC");
    await page.getByTestId("br-trade").click();
    const sheet = page.getByTestId("br-sheet");
    await sheet.getByTestId("br-qty").fill("3"); await sheet.getByTestId("br-review").click();
    await expect(sheet.getByTestId("br-action")).toBeVisible();
    return sheet;
  };
  await phoneBroker(page, width, locale, scale);
  await expect((await review()).getByTestId("br-row-capLeft")).toHaveCount(0);
  // QUAY_HOOKS e2e scenario: the advisory preview carries a cap (every real path answers null today).
  await phoneBroker(page, width, locale, scale, "firstTradeCap=500.00");
  const sheet = await review(), cap = sheet.getByTestId("br-row-capLeft");
  await expect(cap).toBeVisible();
  expect(await cap.evaluate((e) => e.closest('[data-testid="br-sheet"]') !== null)).toBe(true);
  await expect(cap.locator("dt")).toHaveText(locale === "fr" ? "Plafond premier ordre restant" : "First-trade cap left");
  await expect(cap.locator("dd")).toHaveText(/(^|\D)500[.,]00(\D|$)/);
  await cap.scrollIntoViewIfNeeded(); await noOverflow(page);
  expect(await cap.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  const r = await box(cap), body = await box(sheet.locator(".qs-body"));
  expect(r.x).toBeGreaterThanOrEqual(body.x); expect(r.x + r.width).toBeLessThanOrEqual(body.x + body.width + 0.5);
  expect(orders).toBe(0);
  await shot(page, `phone-cap-${locale}${scale}-${width}`);
});
