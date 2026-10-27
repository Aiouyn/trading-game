import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { boot } from "./helpers";

// Recent on the shared T5 <Sheet>: same content, Sheet spec chrome (radius 20, handle, --elev-sheet, focus trap).
const SHOTS = "tests/e2e/shell/__screenshots__/17a/recent-sheet";
async function shot(page: Page, name: string) {
  const vp = page.viewportSize()!;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${vp.width}x${vp.height}.png` });
}
async function openRecent(page: Page) {
  for (const a of ["wire", "portfolio"]) { await page.getByTestId(`icon-${a}`).click(); await page.getByTestId("app-back").click(); }
  const mark = page.getByTestId("quay-mark");
  await mark.focus();
  await mark.dispatchEvent("pointerdown");
  await page.waitForTimeout(450);
  await mark.dispatchEvent("pointerup");
  await expect(page.getByTestId("recent")).toBeVisible();
}

test("Recent sheet: Sheet chrome, focus trap, Esc returns focus, scrim closes, items open apps", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "Recent is the phone long-press sheet");
  await boot(page, "/");
  await openRecent(page);
  const r = page.getByTestId("recent");
  await expect(r).toHaveAttribute("role", "dialog");
  await expect(r).toHaveAttribute("aria-modal", "true");
  await expect(r).toHaveAccessibleName("Recent");
  await expect(r).toHaveClass(/qs-bottom/);
  await expect(r.locator(".qs-handle")).toHaveCount(1);
  const css = await r.evaluate((e) => { const c = getComputedStyle(e); const p = document.createElement("i"); p.style.boxShadow = "var(--elev-sheet)"; document.body.append(p); const want = getComputedStyle(p).boxShadow; p.remove(); return { tl: c.borderTopLeftRadius, tr: c.borderTopRightRadius, sh: c.boxShadow, want, bf: c.backdropFilter }; });
  expect([css.tl, css.tr, css.sh === css.want, css.bf]).toEqual(["20px", "20px", true, "none"]);
  const n = await page.getByTestId("recent-item").count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(6);
  for (const it of await page.getByTestId("recent-item").all()) expect((await it.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (let i = 0; i < n + 2; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[data-testid=recent]"))).toBe(true);
  }
  await page.waitForTimeout(300);
  await shot(page, "recent-sheet");
  const ax = await new AxeBuilder({ page }).analyze();
  expect(ax.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(r).toHaveCount(0);
  await expect(page.getByTestId("quay-mark")).toBeFocused();
  await openRecent(page);
  await page.getByTestId("recent-scrim").click({ position: { x: 20, y: 20 } });
  await expect(r).toHaveCount(0);
  await openRecent(page);
  await page.getByTestId("recent-item").first().click();
  await expect(page.getByTestId("phone-appview")).toBeVisible();
});

test("Recent sheet under reduced motion + transparency: no animation, no backdrop-filter", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  await boot(page, "/");
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; document.documentElement.dataset.transparency = "reduce"; });
  await openRecent(page);
  const v = await page.getByTestId("recent-layer").evaluate((l: HTMLElement) => [l, ...l.querySelectorAll<HTMLElement>("*")].filter((e) => {
    const c = getComputedStyle(e); return parseFloat(c.animationDuration) > 0 || parseFloat(c.transitionDuration) > 0 || (c.backdropFilter && c.backdropFilter !== "none");
  }).length);
  expect(v).toBe(0);
});
