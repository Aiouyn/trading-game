import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { boot } from "./helpers";

// 17A T5: notices and sheets (pill, phone banner, alert + world-event banners, Sheet, system overlays).
const SHOTS = "tests/e2e/shell/__screenshots__/17a/T5";
const PALETTES = ["ink-brass", "broadsheet", "phosphor", "riviera"] as const;
const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop only");
const phoneOnly = (n: string) => test.skip(n !== "phone", "phone only");
async function shot(page: Page, name: string) {
  const vp = page.viewportSize()!;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${vp.width}x${vp.height}.png` });
}
const ds = async (page: Page, show: string, palette = "ink-brass") => {
  await page.goto(`/__ds/notices?show=${show}&palette=${palette}`);
  await expect(page.getByTestId("ds-notices")).toBeVisible();
};
const axe = async (page: Page, label: string) => {
  const r = await new AxeBuilder({ page }).analyze();
  expect([label, r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)]).toEqual([label, []]);
};
const width = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().width);

test("T5-01 desktop pills: error 191, offline 282, Retry slot 70; Retry doesn't change the width", async ({ page, context }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/?load=fail");
  await expect(page.getByTestId("load-error")).toBeVisible();
  const err = await width(page, ".load-state");
  const slot = await width(page, ".load-retry");
  expect(Math.abs(err - 191)).toBeLessThanOrEqual(1);
  expect(Math.abs(slot - 70)).toBeLessThanOrEqual(1);
  await shot(page, "pill-error");
  await axe(page, "pill-error");
  await page.getByTestId("load-retry").click();
  await expect(page.getByTestId("load-retry")).toHaveText("Retrying…");
  expect(Math.abs((await width(page, ".load-state")) - err)).toBeLessThanOrEqual(0.5);
  await shot(page, "pill-retrying");
  await expect(page.getByTestId("load-retry")).toHaveText("Retry");
  await context.setOffline(true);
  await expect(page.getByTestId("offline-state")).toBeVisible();
  expect(Math.abs((await width(page, ".load-state")) - 282)).toBeLessThanOrEqual(1);
  await shot(page, "pill-offline");
  await axe(page, "pill-offline");
  await context.setOffline(false);
  await page.evaluate(() => { document.documentElement.dataset.palette = "broadsheet"; });
  await context.setOffline(false);
  await boot(page, "/?load=fail");
  await page.evaluate(() => { document.documentElement.dataset.palette = "broadsheet"; });
  await shot(page, "pill-error-broadsheet");
});

test("T5-02 phone banner: ≥ 44 px, Retry 44×44 inside, gap ≥ 8, content moves by banner + gap, 120 ms / 0 reduced", async ({ page, context }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/");
  const before = (await page.getByTestId("widget").boundingBox())!.y;
  await boot(page, "/?load=fail");
  await expect(page.getByTestId("load-error")).toBeVisible();
  await page.waitForTimeout(200);
  const b = (await page.getByTestId("phone-banner").boundingBox())!;
  const r = (await page.getByTestId("load-retry").boundingBox())!;
  const w = (await page.getByTestId("widget").boundingBox())!;
  const gap = await page.getByTestId("phone-banner").evaluate((e) => parseFloat(getComputedStyle(e).marginBottom));
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect([r.width >= 44, r.height >= 44, r.y >= b.y - 0.5, r.y + r.height <= b.y + b.height + 0.5]).toEqual([true, true, true, true]);
  expect(gap).toBeGreaterThanOrEqual(8);
  expect(Math.abs(w.y - before - (b.height + gap))).toBeLessThanOrEqual(1);
  expect(await page.getByTestId("phone-banner").evaluate((e) => getComputedStyle(e).transitionDuration)).toMatch(/^0\.12s/);
  await shot(page, "banner-error");
  await axe(page, "banner-error");
  await page.getByTestId("load-retry").click();
  await shot(page, "banner-retrying");
  await context.setOffline(true);
  await expect(page.getByTestId("offline-state")).toBeVisible();
  await shot(page, "banner-offline");
  await context.setOffline(false);
  await boot(page, "/?load=fail");
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; });
  expect(await page.getByTestId("phone-banner").evaluate((e) => getComputedStyle(e).transitionDuration)).toMatch(/^0s/);
  await shot(page, "banner-error-reduced");
  await page.evaluate(() => { delete document.documentElement.dataset.motion; document.documentElement.style.setProperty("--text-scale", "2"); });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await shot(page, "banner-error-scale2");
});

test("T5-03 one alert banner for two P0s; banners never intersect the OrderPad", async ({ page }, info) => {
  await ds(page, "two-p0,world,orderpad");
  await expect(page.getByTestId("alert-banner")).toHaveCount(1);
  await expect(page.getByTestId("alert-slot")).toHaveAttribute("data-queued", "1");
  const pad = (await page.getByTestId("mock-orderpad").boundingBox())!;
  for (const id of ["alert-banner", "world-banner"]) {
    const x = (await page.getByTestId(id).boundingBox())!;
    const hit = x.x < pad.x + pad.width && pad.x < x.x + x.width && x.y < pad.y + pad.height && pad.y < x.y + x.height;
    expect([id, hit]).toEqual([id, false]);
  }
  expect(info.project.name === "desktop" || info.project.name === "phone").toBe(true);
});

test("T5-04 world-event banner shows elapsed only", async ({ page }) => {
  await ds(page, "world");
  const t = await page.getByTestId("world-banner").getAttribute("aria-label");
  expect(t).toBe("● CRASH · DAY 3 · GX \u221218.40% since it began · Today \u22122.10%");
  expect(t).not.toMatch(/left|remain|until|ends/i);
});

test("T5-05 Sheet: focus trap, Esc closes, focus returns; radius 20, --elev-sheet; no backdrop-filter", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await ds(page, phone ? "phone" : "");
  await page.getByTestId("open-sheet").focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByTestId("sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("role", "dialog");
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[data-testid=sheet]"))).toBe(true);
  }
  const s = await sheet.evaluate((e) => {
    const cs = getComputedStyle(e); const probe = document.createElement("i"); probe.style.boxShadow = "var(--elev-sheet)"; document.body.append(probe);
    const want = getComputedStyle(probe).boxShadow; probe.remove();
    return { tl: cs.borderTopLeftRadius, tr: cs.borderTopRightRadius, sh: cs.boxShadow, want };
  });
  if (phone) expect([s.tl, s.tr]).toEqual(["20px", "20px"]); else expect(s.tl).toBe("20px");
  expect(s.sh).toBe(s.want);
  await page.waitForTimeout(300);
  await shot(page, phone ? "sheet-bottom" : "sheet-right");
  await axe(page, "sheet");
  await page.evaluate(() => { document.documentElement.dataset.transparency = "reduce"; });
  for (const id of ["sheet", "sheet-scrim"]) expect(await page.getByTestId(id).evaluate((e) => getComputedStyle(e).backdropFilter)).toBe("none");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("open-sheet")).toBeFocused();
  // Scrim tap closes too.
  await page.getByTestId("open-sheet").click();
  await page.getByTestId("sheet-scrim").click({ position: { x: 10, y: 10 } });
  await expect(sheet).toHaveCount(0);
});

test("T5-06 banner text contrast ≥ 4.5:1 in all 4 palettes; P0 has an icon and text", async ({ page }) => {
  await ds(page, "both");
  await expect(page.getByTestId("alert-icon").locator("svg")).toHaveCount(1);
  await expect(page.getByTestId("alert-banner")).toContainText(/\w/);
  for (const p of PALETTES) {
    await page.evaluate((v) => { document.documentElement.dataset.palette = v; }, p);
    const ratios = await page.evaluate(() => {
      const rgb = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
      const cr = (a: string, b: string) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05); };
      return [".alert-text", ".alert-action", ".world-name", ".world-banner"].map((s) => {
        const e = document.querySelector<HTMLElement>(s)!; const bg = getComputedStyle(e.closest(".alert-banner, .world-banner")!).backgroundColor;
        return [s, Math.round(cr(getComputedStyle(e).color, bg) * 100) / 100] as const;
      });
    });
    for (const [s, r] of ratios) expect([p, s, r >= 4.5]).toEqual([p, s, true]);
  }
});

test("T5-07 halt overlay within one mock tick; the read-only window behind stays scrollable", async ({ page }) => {
  const t0 = Date.now();
  await page.goto("/?halted=1");
  await expect(page.getByTestId("overlay-halted")).toBeVisible({ timeout: 5000 });
  expect(Date.now() - t0).toBeLessThan(5000 + 3000); // ≤ one 5 s tick after boot (+ page load slack)
  await expect(page.getByTestId("overlay-halted").locator(".sys-title")).toHaveCSS("font-family", /Serif|serif/);
  await shot(page, "halt");
  await axe(page, "halt");
  await ds(page, "halted");
  const ro = page.getByTestId("readonly-window");
  const box = (await ro.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => ro.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
});

test("T5-08 C3/C5/C7: DOM identical across palettes; targets ≥ 44 / 28; reduced motion + transparency", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await ds(page, `both,${phone ? "phone" : ""}`);
  await page.getByTestId("open-sheet").click();
  await page.waitForTimeout(300);
  const doms: string[] = [];
  for (const p of PALETTES) { await page.evaluate((v) => { document.documentElement.dataset.palette = v; }, p); doms.push(await page.getByTestId("ds-notices").evaluate((e) => e.outerHTML)); }
  for (const d of doms) expect(d).toBe(doms[0]);
  // The alert banner is a desktop slot under the strip; its phone placement is an open Studio question.
  const min = phone ? 44 : 28;
  const small = await page.evaluate((m) => [...document.querySelectorAll<HTMLElement>((m === 28 ? ".alert-banner a, " : "") + ".qsheet button, .qsheet a, .qsheet [role=button]")].filter((e) => {
    const r = e.getBoundingClientRect(); const b = getComputedStyle(e, "::before"); const pr = b.content !== "none" ? { w: r.width + 12, h: r.height + 16 } : { w: r.width, h: r.height };
    return pr.w < m || pr.h < m;
  }).map((e) => e.textContent), min);
  expect(small).toEqual([]);
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; document.documentElement.dataset.transparency = "reduce"; });
  const bad = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid=ds-notices] *")].filter((e) => {
    const cs = getComputedStyle(e);
    const dur = (v: string) => v.split(",").some((x) => parseFloat(x) > 0);
    return (!e.classList.contains("tickring-sweep") && (dur(cs.transitionDuration) || dur(cs.animationDuration))) || (cs.backdropFilter && cs.backdropFilter !== "none");
  }).map((e) => e.className));
  expect(bad).toEqual([]);
});

test("T5 screenshots: P0 banner, world banner, both stacked (1440)", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await ds(page, "alert");
  await shot(page, "banner-p0");
  await axe(page, "banner-p0");
  await ds(page, "world");
  await shot(page, "banner-world");
  await ds(page, "both");
  await shot(page, "banners-stacked");
  await axe(page, "banners-stacked");
});
