// 17B S1 (Settings frame + SET-02 Appearance) and S1-14 (SET-08 About in-app). Run by path:
//   E2E_PORT=… npx playwright test tests/e2e/settings --output=/tmp/…
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PALETTE_IDS, PALETTES } from "../../../src/styles/tokens";
import { boot } from "../shell/helpers";

const SHOTS = "tests/e2e/settings/__screenshots__/S1";
const isPhone = (info: { project: { name: string } }) => info.project.name === "phone";
const html = (page: Page, k: string) => page.evaluate((key) => document.documentElement.dataset[key] ?? null, k);
const cssVar = (page: Page, v: string, sel = "html") => page.evaluate(([s, name]) => getComputedStyle(document.querySelector(s)!).getPropertyValue(name).trim(), [sel, v]);
/** Computed colour of any CSS colour value (normalises #FFF vs #FFFFFF). */
const rgb = (page: Page, value: string, sel = "body") => page.evaluate(([v, s]) => {
  const d = document.createElement("i"); d.style.color = v; document.querySelector(s)!.append(d); const c = getComputedStyle(d).color; d.remove(); return c;
}, [value, sel]);
const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth
  && [...document.querySelectorAll(".settings *")].every((e) => e.getBoundingClientRect().right <= window.innerWidth + 0.5));

async function openAppearance(page: Page, info: { project: { name: string } }, q = "") {
  await boot(page, `/settings${q}`);
  if (isPhone(info)) await page.getByTestId("set-nav-SET-02").click();
  await expect(page.getByTestId("appearance")).toBeVisible();
}

test("S1-01: frame — 8 sections; desktop selects Appearance; phone pushes with Back to Settings", async ({ page }, info) => {
  await boot(page, "/settings");
  await expect(page.locator(".set-nav-item")).toHaveCount(8);
  if (isPhone(info)) {
    await expect(page.getByTestId("appearance")).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/root-390x844.png` });
    await page.getByTestId("set-nav-SET-02").click();
    await expect(page.locator("#phone-app-title")).toHaveText("Appearance");
    await expect(page.locator(".appbar .icon-btn")).toHaveAttribute("aria-label", "Back to Settings");
    await page.locator(".appbar .icon-btn").click();
    await expect(page.locator(".set-nav-item")).toHaveCount(8);
    await expect(page.locator("#phone-app-title")).toHaveText("Settings");
  } else {
    await expect(page.getByTestId("set-nav-SET-02")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("appearance")).toBeVisible();
  }
});

test("S1-02: /settings/SET-08 focuses the open window and selects About; SET-03 is ComingLater", async ({ page }, info) => {
  test.skip(isPhone(info));
  await boot(page, "/settings");
  const n = await page.locator("[data-testid^=win-]").count();
  await boot(page, "/settings/SET-08");
  await expect(page.getByTestId("settings-about")).toBeVisible();
  expect(await page.locator("[data-testid^=win-]").count()).toBe(n);
  await page.getByTestId("set-nav-SET-03").click();
  await expect(page.getByTestId("win-settings").getByTestId("coming-later")).toBeVisible();
});

test("S1-03/04/13: swatches set the palette; tokens match; DOM identical; ring is --fg; no brass", async ({ page }, info) => {
  await openAppearance(page, info);
  const doms: string[] = [];
  for (const p of PALETTE_IDS) {
    await page.getByTestId(`swatch-${p}`).click();
    expect(await html(page, "palette")).toBe(p);
    await page.waitForTimeout(400); // palette transitions
    for (const k of ["bg0", "win", "acc", "fg", "line", "gain", "loss"]) expect(await rgb(page, `var(--${k})`), `${p} ${k}`).toBe(await rgb(page, PALETTES[p][k]));
    // Scoped previews draw with their own palette.
    for (const q of PALETTE_IDS) {
      for (const k of ["acc", "bg0"]) expect(await rgb(page, `var(--${k})`, `[data-testid=swatch-mini-${q}]`)).toBe(await rgb(page, PALETTES[q][k]));
    }
    const ring = await page.getByTestId(`swatch-mini-${p}`).evaluate((e) => getComputedStyle(e).outlineColor);
    const fg = await page.evaluate(() => { const d = document.createElement("i"); d.style.color = "var(--fg)"; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    expect(ring).toBe(fg);
    const brass = await page.evaluate(() => {
      const d = document.createElement("i"); d.style.color = "var(--acc)"; document.body.append(d); const acc = getComputedStyle(d).color; d.remove();
      return [...document.querySelectorAll(".settings *")].filter((e) => !e.closest(".swatch-mini")).filter((e) => {
        const cs = getComputedStyle(e);
        return [cs.color, cs.backgroundColor, cs.borderTopColor].includes(acc) && cs.borderTopWidth !== "0px" || cs.backgroundColor === acc || cs.color === acc;
      }).length;
    });
    expect(brass).toBe(0);
    doms.push(await page.getByTestId("settings").evaluate((e) => e.outerHTML.replace(/aria-checked="(true|false)"/g, "").replace(/tabindex="-?\d"/g, "")));
  }
  expect(new Set(doms).size).toBe(1);
});

test("S1-05: palette persists from device storage; prefs memo has no palette", async ({ page }, info) => {
  await openAppearance(page, info);
  await page.getByTestId("swatch-riviera").click();
  await page.evaluate(() => (window as Window & { __quayFlush?: () => Promise<void> }).__quayFlush?.());
  await page.waitForTimeout(800);
  await page.goto("/");
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  await expect.poll(() => html(page, "palette")).toBe("riviera");
});

test("S1-06: shell list, Purchased chip, selection applies shell-r1", async ({ page }, info) => {
  await openAppearance(page, info, "?rank=R3&shells=r0,r1,r2,r3,cosmetic_glass&owned=cosmetic_glass");
  await expect(page.locator(".shell-row")).toHaveCount(5);
  await expect(page.getByTestId("shell-cosmetic_glass").getByTestId("purchased")).toHaveText("Purchased");
  expect(await page.evaluate(() => document.documentElement.classList.contains("shell-r3"))).toBe(true);
  await page.getByTestId("shell-r1").click();
  const cls = await page.evaluate(() => [...document.documentElement.classList]);
  expect(cls).toContain("shell-r1");
  expect(cls).not.toContain("shell-r3");
  if (!isPhone(info)) await page.getByTestId("shell-list").screenshot({ path: `${SHOTS}/shells-purchased-1440x900.png` });
});

test("S1-07: slider 1.5 → --text-scale 1.5, --fs-14 = 21px; arrows step 0.25; valuetext", async ({ page }, info) => {
  await openAppearance(page, info);
  const s = page.getByTestId("text-scale");
  await s.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(s).toHaveAttribute("aria-valuetext", "150 percent");
  expect(await cssVar(page, "--text-scale")).toBe("1.5");
  expect(await page.evaluate(() => { const d = document.createElement("i"); d.style.fontSize = "var(--fs-14)"; document.body.append(d); const v = getComputedStyle(d).fontSize; d.remove(); return v; })).toBe("21px");
  await page.keyboard.press("ArrowLeft");
  await expect(s).toHaveAttribute("aria-valuetext", "125 percent");
  await page.keyboard.press("End");
  await expect(s).toHaveAttribute("aria-valuetext", "200 percent");
  await page.keyboard.press("Home");
  await expect(s).toHaveAttribute("aria-valuetext", "100 percent");
  if (!isPhone(info)) {
    await s.fill("1.5"); await s.blur();
    await page.getByTestId("scale-preview").screenshot({ path: `${SHOTS}/preview-scale1.5-1440x900.png` });
  }
});

test("S1-08: text scale 2.0 at phone — no horizontal scroll, no truncation", async ({ page }, info) => {
  test.skip(!isPhone(info));
  await openAppearance(page, info);
  const s = page.getByTestId("text-scale");
  await s.fill("2"); await s.blur();
  expect(await noHScroll(page)).toBe(true);
  const clipped = await page.evaluate(() => [...document.querySelectorAll(".settings .num, .settings .set-row-label, .settings .shell-name")]
    .filter((e) => e.scrollWidth > e.clientWidth + 1).length);
  expect(clipped).toBe(0);
  await page.screenshot({ path: `${SHOTS}/appearance-scale2-390x844.png`, fullPage: true });
});

test("S1-09: high contrast and colour-blind switches", async ({ page }, info) => {
  await openAppearance(page, info);
  await page.getByTestId("switch-hc").click();
  await expect(page.getByTestId("switch-hc")).toHaveAttribute("aria-checked", "true");
  expect(await html(page, "hc")).toBe("1");
  expect(await cssVar(page, "--line")).toBe(await cssVar(page, "--fg-disabled"));
  if (!isPhone(info)) await page.screenshot({ path: `${SHOTS}/appearance-hc-1440x900.png` });
  await page.getByTestId("switch-hc").click();
  await page.getByTestId("swatch-broadsheet").click();
  await page.getByTestId("switch-cb").click();
  expect(await html(page, "cb")).toBe("1");
  expect((await cssVar(page, "--gain")).toUpperCase()).toBe("#08657A");
  expect((await cssVar(page, "--loss")).toUpperCase()).toBe("#A8235A");
  if (!isPhone(info)) await page.screenshot({ path: `${SHOTS}/appearance-cb-broadsheet-1440x900.png` });
});

test("S1-10: reduce motion / transparency segments; System follows the OS", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openAppearance(page, info);
  await expect(page.getByTestId("os-reducedMotion")).toHaveText("System: on");
  expect(await html(page, "motion")).toBe("reduce");
  if (isPhone(info)) await page.getByTestId("seg-reducedMotion").screenshot({ path: `${SHOTS}/motion-system-on-390x844.png` });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByTestId("seg-reducedMotion").getByRole("radio", { name: "On", exact: true }).click();
  expect(await html(page, "motion")).toBe("reduce");
  const durs = await page.evaluate(() => [...document.querySelectorAll("*")].filter((e) => !e.closest(".tickring, [class*=tickring]"))
    .filter((e) => { const cs = getComputedStyle(e); return [cs.transitionDuration, cs.animationDuration].some((d) => d.split(",").some((x) => parseFloat(x) > 0)); }).length);
  expect(durs).toBe(0);
  await page.getByTestId("seg-reducedTransparency").getByRole("radio", { name: "On", exact: true }).click();
  expect(await html(page, "transparency")).toBe("reduce");
  expect(await page.evaluate(() => [...document.querySelectorAll("*")].filter((e) => { const b = getComputedStyle(e).backdropFilter; return b && b !== "none"; }).length)).toBe(0);
});

test("S1-11: roles, hit areas, axe 0 serious", async ({ page }, info) => {
  await openAppearance(page, info);
  await expect(page.locator(".settings [role=switch]")).toHaveCount(2);
  await expect(page.locator(".settings [role=slider], .settings input[type=range]")).toHaveCount(1);
  await expect(page.locator(".settings [role=radiogroup]")).toHaveCount(4);
  const min = isPhone(info) ? 44 : 28;
  const small = await page.evaluate((m) => [...document.querySelectorAll(".settings button, .settings input, .settings a")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && Math.min(r.height, r.width) < m; }).map((e) => `${e.className || e.tagName} ${e.textContent}`), min);
  expect(small).toEqual([]);
  const res = await new AxeBuilder({ page }).include(".settings").analyze();
  expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

test("Screenshots: Appearance per palette / scale", async ({ page }, info) => {
  await openAppearance(page, info);
  if (isPhone(info)) {
    await page.screenshot({ path: `${SHOTS}/appearance-scale1-390x844.png`, fullPage: true });
    await page.getByTestId("swatch-broadsheet").click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/appearance-broadsheet-390x844.png`, fullPage: true });
    return;
  }
  for (const p of PALETTE_IDS) {
    await page.getByTestId(`swatch-${p}`).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/appearance-${p}-1440x900.png` });
  }
});

test("S1-14: About in-app (S2-01..07)", async ({ page, context }, info) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await boot(page, "/settings/SET-08");
  const about = page.getByTestId("settings-about");
  await expect(about).toBeVisible();
  if (isPhone(info)) await expect(page.locator("#phone-app-title")).toHaveText("About");
  const version = (await page.getByTestId("about-version").textContent())!;
  expect(version).toMatch(/^Quay .+ · build .+$/);
  await expect(about.getByTestId("about-licence-row")).toHaveCount(5);
  await expect(about.getByRole("link", { name: /Charts by TradingView/ })).toHaveAttribute("href", "https://www.tradingview.com");
  for (const a of await about.locator("a[target]").all()) {
    await expect(a).toHaveAttribute("target", "_blank");
    expect(await a.getAttribute("rel")).toContain("noopener");
    expect(await a.evaluate((e) => e.textContent)).toContain("opens in a new tab");
  }
  const accBg = await page.evaluate(() => {
    const d = document.createElement("i"); d.style.color = "var(--acc)"; document.body.append(d); const acc = getComputedStyle(d).color; d.remove();
    return [...document.querySelectorAll("[data-testid=settings-about] *")].filter((e) => getComputedStyle(e).backgroundColor === acc).length;
  });
  expect(accBg).toBe(0);
  await page.getByTestId("about-copy").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(version);
  if (isPhone(info)) {
    await page.screenshot({ path: `${SHOTS}/about-scale1-390x844.png`, fullPage: true });
    await page.locator(".appbar .icon-btn").click();
    await page.getByTestId("set-nav-SET-02").click();
    const s = page.getByTestId("text-scale"); await s.fill("2"); await s.blur();
    await page.locator(".appbar .icon-btn").click();
    await page.getByTestId("set-nav-SET-08").click();
    expect(await noHScroll(page)).toBe(true);
    expect(await page.locator(".about-licences thead").evaluate((e) => getComputedStyle(e).position)).toBe("absolute");
    await page.screenshot({ path: `${SHOTS}/about-scale2-390x844.png`, fullPage: true });
  } else {
    await page.screenshot({ path: `${SHOTS}/about-ink-brass-1440x900.png` });
    await page.getByTestId("set-nav-SET-02").click();
    await page.getByTestId("swatch-broadsheet").click();
    await page.getByTestId("set-nav-SET-08").click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/about-broadsheet-1440x900.png` });
  }
  // S2-04: integrity report opens the Markets ComingLater window, no navigation error.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByTestId("about-integrity").click();
  await expect(page).toHaveURL(/\/markets\/MKT-08/);
  await expect(page.getByTestId("coming-later").filter({ hasText: "Markets" })).toBeVisible();
  expect(errors).toEqual([]);
});
