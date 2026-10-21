import { mkdirSync, copyFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { SPEC_TABLE } from "../../unit/shell/paletteTable";

// 17A T1 computed-style ACs on the /__ds primitives sheet (T1-02, T1-04, T1-05, T1-07, C3–C9).
const PALETTES = ["ink-brass", "broadsheet", "phosphor", "riviera"] as const;
const SHOTS = "tests/e2e/shell/__screenshots__/17a/T1";
const EXTRA = process.env.SHOTS_COPY_DIR; // also drop copies here (PR evidence)

/**
 * Open /__ds in a palette and wait until it is settled. The palette is applied in an effect after the first paint
 * (ink-brass until then), and .btn animates `color` over --dur-fast (120 ms), so right after the switch a Broadsheet
 * ghost button can still paint Ink & Brass's --fg-muted (#9AA0A8) on Broadsheet's white: the 2.63:1 C4 flake (#25).
 * So: wait for the attribute, park the mouse (no stray :hover), then wait for every running transition to finish.
 */
async function ds(page: Page, palette: string = "ink-brass") {
  await page.goto(`/__ds?palette=${palette}`);
  await expect(page.getByTestId("ds-ready")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.palette)).toBe(palette);
  await settle(page);
}
async function settle(page: Page) {
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // style recalc after the switch
    await Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => undefined)));
  });
}

/** Resolve a CSS expression to its computed value through a probe element. */
const resolve = (page: Page, prop: string, value: string, inShadow = false) =>
  page.evaluate(([p, v, sh]) => {
    const el = document.createElement("div");
    el.style.setProperty(p, v);
    (sh ? document.querySelector("[data-subpalette=shadow]")! : document.body).appendChild(el);
    const out = getComputedStyle(el).getPropertyValue(p);
    el.remove();
    return out;
  }, [prop, value, inShadow] as const);

const style = (page: Page, testId: string, prop: string) =>
  page.getByTestId(testId).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

async function shot(page: Page, name: string, fullPage = true) {
  const vp = page.viewportSize()!;
  mkdirSync(SHOTS, { recursive: true });
  // The sheet scrolls inside a fixed-height body; let it grow so fullPage captures everything.
  if (fullPage) await page.evaluate(() => { document.body.style.overflow = "visible"; document.body.style.height = "auto"; document.documentElement.style.height = "auto"; (document.querySelector(".ds") as HTMLElement).style.height = "auto"; });
  const path = `${SHOTS}/${name}-${vp.width}x${vp.height}.png`;
  await page.screenshot({ path, fullPage });
  if (EXTRA) { mkdirSync(EXTRA, { recursive: true }); copyFileSync(path, `${EXTRA}/${name}-${vp.width}x${vp.height}.png`); }
}

test("T1-02 per-palette computed tokens equal 17 §3.3.1 (incl. steel/signal)", async ({ page }) => {
  for (const [i, p] of PALETTES.entries()) {
    await ds(page, p);
    // Compare resolved colours (the minifier may shorten #FFFFFF to #FFF in the built CSS).
    const got = await page.evaluate((names) => names.map((n) => {
      const el = document.createElement("i");
      el.style.color = `var(--${n})`;
      document.body.appendChild(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    }), SPEC_TABLE.map((r) => r[0]));
    const rgb = (hex: string) => `rgb(${[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)).join(", ")})`;
    expect(got).toEqual(SPEC_TABLE.map((r) => rgb(r[i + 1])));
  }
});

test("T1-04 primary is flat --acc; inside Shadow transparent with --steel border", async ({ page }) => {
  await ds(page);
  const id = "ds-btn-base-primary-md";
  expect(await style(page, id, "background-color")).toBe(await resolve(page, "background-color", "var(--acc)"));
  expect(await style(page, id, "background-image")).toBe("none");
  expect(await style(page, id, "box-shadow")).toBe("none");
  const sid = "ds-btn-shadow-primary-md";
  expect(await style(page, sid, "background-color")).toBe("rgba(0, 0, 0, 0)");
  expect(await style(page, sid, "border-top-color")).toBe(await resolve(page, "color", "var(--steel)"));
  expect(await style(page, sid, "box-shadow")).toBe("none");
});

test("T1-05 focus-visible on every variant shows --focus-ring", async ({ page }) => {
  await ds(page);
  const ring = await resolve(page, "box-shadow", "var(--focus-ring)");
  expect(ring).toContain("2px");
  for (const v of ["primary", "secondary", "ghost", "icon"]) {
    const b = page.getByTestId(`ds-btn-base-${v}-md`);
    await b.focus();
    expect(await b.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    expect([v, await b.evaluate((el) => getComputedStyle(el).boxShadow)]).toEqual([v, ring]);
  }
  await page.getByTestId("ds-btn-base-primary-md").focus();
  await shot(page, "button-focus", false);
});

test("T1-07 hero cents are 65% of the integer and --fg-muted", async ({ page }) => {
  await ds(page);
  const hero = page.getByTestId("ds-money-hero-1284.10");
  const [int, cents, color] = await hero.evaluate((el) => {
    const i = el.querySelector("[data-testid=money-int]")!, c = el.querySelector("[data-testid=money-cents]")!;
    return [parseFloat(getComputedStyle(i).fontSize), parseFloat(getComputedStyle(c).fontSize), getComputedStyle(c).color];
  });
  expect(cents / int).toBeGreaterThanOrEqual(0.64);
  expect(cents / int).toBeLessThanOrEqual(0.66);
  expect(color).toBe(await resolve(page, "color", "var(--fg-muted)"));
});

test("C3 DOM identical across the 4 palettes", async ({ page }) => {
  const doms: string[] = [];
  for (const p of PALETTES) { await ds(page, p); doms.push(await page.getByTestId("ds-ready").innerHTML()); }
  for (const d of doms) expect(d).toBe(doms[0]);
});

test("C4 axe: 0 serious/critical on /__ds (Ink & Brass, Broadsheet)", async ({ page }) => {
  for (const p of ["ink-brass", "broadsheet"]) {
    await ds(page, p);
    const r = await new AxeBuilder({ page }).include("[data-testid=ds-ready]").analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").flatMap((v) => v.nodes.map((n) => `${p}: ${v.id} ${n.target.join(" ")} ${n.any[0]?.message ?? ""}`))).toEqual([]);
  }
});

// Every ghost button state in every palette, read after transitions finish (computed colour vs the effective
// background behind the transparent button). Disabled is reported but exempt from 1.4.3 (inactive control).
const GHOST_PALETTES = ["ink-brass", "broadsheet", "phosphor", "riviera"] as const;
test("C4 ghost button contrast ≥ 4.5:1 at rest, hover, focus and active in all 4 palettes (deterministic)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "pointer states: desktop project");
  const ratio = (id: string) => page.getByTestId(id).evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined)));
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => [r!, g!, b!].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    let bgEl: Element | null = el, bg = "rgba(0, 0, 0, 0)";
    while (bgEl) { bg = getComputedStyle(bgEl).backgroundColor; if (rgb(bg)[3] !== 0 && bg !== "transparent") break; bgEl = bgEl.parentElement; }
    if (!bgEl) bg = getComputedStyle(document.documentElement).backgroundColor;
    const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(rgb(bg))];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  const low: string[] = [];
  for (const p of GHOST_PALETTES) {
    await ds(page, p);
    for (const scope of ["base", "shadow"]) {
      for (const size of ["md", "sm"]) {
        const id = `ds-btn-${scope}-ghost-${size}`;
        expect(await page.getByTestId(id).count(), `${p}: ${id} must render`).toBeGreaterThanOrEqual(1);
        const btn = page.getByTestId(id);
        const check = async (state: string) => { const r = await ratio(id); if (r < 4.5) low.push(`${p} ${id} ${state} ${r.toFixed(2)}`); };
        await settle(page); await check("rest");
        await btn.hover(); await check("hover");
        await page.mouse.down(); await check("active"); await page.mouse.up();
        await settle(page);
        await btn.focus(); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab"); await check("focus");
        await btn.blur();
      }
    }
  }
  expect(low).toEqual([]);
});

test("C5 hit targets: ≥44 touch, ≥28 pointer", async ({ page }, info) => {
  await ds(page);
  const min = info.project.name === "phone" ? 44 : 28;
  const small = await page.locator("[data-testid=ds-ready]").evaluate((root, m) =>
    [...root.querySelectorAll("button, a, [role=button], input")].map((el) => ({ id: el.getAttribute("data-testid"), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width < m || r.height < m).map(({ id, r }) => `${id} ${r.width}x${r.height}`), min);
  expect(small).toEqual([]);
});

test("C7 reduced motion → 0 ms; reduced transparency → no backdrop-filter", async ({ page }) => {
  await ds(page);
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; document.documentElement.dataset.transparency = "reduce"; });
  const bad = await page.locator("[data-testid=ds-ready]").evaluate((root) =>
    [root, ...root.querySelectorAll("*")].flatMap((el) => {
      const s = getComputedStyle(el);
      const durs = [...s.transitionDuration.split(","), ...s.animationDuration.split(",")].map((d) => parseFloat(d));
      return [...(durs.some((d) => d > 0) ? [`${el.className} duration`] : []), ...(s.backdropFilter !== "none" ? [`${el.className} backdrop`] : [])];
    }));
  expect(bad).toEqual([]);
});

test("C8 text scale 2.0: no horizontal scroll, no truncated number", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "390×844 only");
  await ds(page);
  await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "2")); // what QuayShell does for prefs.textScale
  const r = await page.evaluate(() => {
    const ds = document.querySelector("[data-testid=ds-ready]")!;
    const clipped = [...ds.querySelectorAll(".money")].filter((m) => m.scrollWidth > m.clientWidth + 1 || m.getBoundingClientRect().right > innerWidth + 1).length;
    return { scroll: ds.scrollWidth - ds.clientWidth, page: document.documentElement.scrollWidth - innerWidth, clipped };
  });
  expect(r).toEqual({ scroll: 0, page: 0, clipped: 0 });
  await shot(page, "ds-scale2");
});

test("C9 screenshots: /__ds Ink & Brass, Broadsheet, Shadow", async ({ page }) => {
  await ds(page);
  await shot(page, "ds");
  await page.getByTestId("ds-shadow").screenshot({ path: `${SHOTS}/ds-shadow-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png` });
  if (EXTRA) copyFileSync(`${SHOTS}/ds-shadow-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png`, `${EXTRA}/ds-shadow-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png`);
  await ds(page, "broadsheet");
  await shot(page, "ds-broadsheet");
});
