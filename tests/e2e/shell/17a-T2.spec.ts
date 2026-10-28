import { mkdirSync, copyFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { boot, settled } from "./helpers";

// 17A T2: window chrome, strip, shelf, tiles, glyphs (T2-01..T2-04, T2-06, T2-07, C3–C9).
const PALETTES = ["ink-brass", "broadsheet", "phosphor", "riviera"] as const;
const SHOTS = "tests/e2e/shell/__screenshots__/17a/T2";
const EXTRA = process.env.SHOTS_COPY_DIR;
const desktopOnly = (name: string) => test.skip(name !== "desktop", "1440×900 desktop only");
const phoneOnly = (name: string) => test.skip(name !== "phone", "390×844 phone only");

async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  const vp = page.viewportSize()!;
  mkdirSync(SHOTS, { recursive: true });
  const file = `${name}-${vp.width}x${vp.height}.png`;
  await page.waitForTimeout(250); // let 120 ms hover/banner transitions settle
  await page.screenshot({ path: `${SHOTS}/${file}`, fullPage: opts.fullPage });
  if (EXTRA) { mkdirSync(EXTRA, { recursive: true }); copyFileSync(`${SHOTS}/${file}`, `${EXTRA}/${file}`); }
}

/** Resolve `var(--x)` to a computed colour. */
const token = (page: Page, name: string) => page.evaluate((n) => {
  const el = document.createElement("i");
  el.style.color = `var(--${n})`;
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c;
}, name);

async function setPalette(page: Page, p: string) {
  await page.evaluate((v) => { document.documentElement.dataset.palette = v; }, p);
  await page.waitForTimeout(200); // colour transitions are 120 ms
}

test("T2-01 strip 34 / shelf 52; Quay mark --fg; no brass in strip or shelf except rank chip and fresh dot", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/?rank=R2");
  expect((await page.getByTestId("strip").boundingBox())!.height).toBe(34);
  expect((await page.getByTestId("shelf").boundingBox())!.height).toBe(52);
  const fg = await token(page, "fg");
  expect(await page.locator(".strip .brand > .fg").evaluate((el) => getComputedStyle(el).color)).toBe(fg);
  for (const p of PALETTES) {
    await setPalette(page, p);
    const acc = await token(page, "acc");
    const brass = await page.evaluate((a) => [...document.querySelectorAll(".strip *, .shelf *")]
      .filter((el) => !el.closest(".chip-acc") && !el.classList.contains("fresh-dot"))
      .filter((el) => { const s = getComputedStyle(el); return [s.color, s.backgroundColor, s.borderTopColor, s.borderBottomColor].includes(a); })
      .map((el) => el.className.toString()), acc);
    expect([p, brass]).toEqual([p, []]);
  }
  await shot(page, "home-r2");
});

test("T2-02 active window: no brass edge, title bar 32, controls ≥28 pointer", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/wire");
  await page.getByTestId("tile-portfolio").click();
  const win = page.getByTestId("win-portfolio");
  await expect(win).toHaveClass(/active/);
  const acc = await token(page, "acc");
  const r = await win.evaluate((el) => {
    const s = getComputedStyle(el), b = getComputedStyle(el, "::before"), a = getComputedStyle(el, "::after");
    return { top: s.borderTopColor, before: b.content, after: a.content, bar: el.querySelector(".titlebar")!.getBoundingClientRect().height,
      controls: [...el.querySelectorAll(".tb-controls button")].map((c) => [c.getBoundingClientRect().width, c.getBoundingClientRect().height]) };
  });
  expect(r.top).not.toBe(acc);
  expect([r.before, r.after]).toEqual(["none", "none"]);
  expect(r.bar).toBe(32);
  for (const [w, h] of r.controls) { expect(w).toBeGreaterThanOrEqual(28); expect(h).toBeGreaterThanOrEqual(28); }
  await shot(page, "windows-active-inactive");
});

test("T2-02 window controls are 44×44 under hasTouch", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const page = await ctx.newPage();
  await boot(page, "/wire");
  const sizes = await page.locator(".tb-controls button").evaluateAll((bs) => bs.map((b) => [b.getBoundingClientRect().width, b.getBoundingClientRect().height]));
  expect(sizes.length).toBe(3);
  for (const [w, h] of sizes) expect([w, h]).toEqual([44, 44]);
  await ctx.close();
});

test("T2-03 locked shelf tile: 40 tall, Label-style --fg-muted tag, --fg-disabled glyph, tag ≥4.5:1 on --chrome", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/?rank=R1&nw=30000");
  const tile = page.locator(".shelf .tile.locked").first();
  expect((await tile.boundingBox())!.height).toBe(40);
  for (const p of PALETTES) {
    await setPalette(page, p);
    const [muted, disabled, chrome] = [await token(page, "fg-muted"), await token(page, "fg-disabled"), await token(page, "chrome")];
    const t = await tile.evaluate((el) => {
      const tag = getComputedStyle(el.querySelector(".lock-tag")!);
      return { size: parseFloat(tag.fontSize), upper: tag.textTransform, ls: parseFloat(tag.letterSpacing) / parseFloat(tag.fontSize), color: tag.color, glyph: getComputedStyle(el).color };
    });
    expect(t.size).toBeCloseTo(10.5, 1);
    expect(t.upper).toBe("uppercase");
    expect(t.ls).toBeCloseTo(0.14, 2);
    expect(t.color).toBe(muted);
    expect(t.glyph).toBe(disabled);
    const ratio = await page.evaluate(([a, b]) => {
      const lum = (c: string) => { const v = c.match(/\d+/g)!.slice(0, 3).map((x) => Number(x) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    }, [t.color, chrome]);
    expect([p, ratio >= 4.5]).toEqual([p, true]);
  }
  await setPalette(page, "ink-brass");
  await shot(page, "home-r1-locked");
});

test("T2-04 shelf tiles never intersect the tools at 1280, 1440, 1920", async ({ page }, info) => {
  desktopOnly(info.project.name);
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await boot(page, "/?rank=R6&nw=100000000");
    const hits = await page.evaluate(() => {
      const tools = document.querySelector(".shelf-tools")!.getBoundingClientRect();
      const row = document.querySelector(".shelf-tiles")!.getBoundingClientRect();
      return [...document.querySelectorAll(".shelf .tile")].map((t) => t.getBoundingClientRect())
        .filter((r) => r.right > row.left && r.left < row.right) // visible part of the clipped row
        .filter((r) => Math.min(r.right, row.right) > tools.left && r.left < tools.right).length;
    });
    expect([width, hits]).toEqual([width, 0]);
    if (width === 1280) await shot(page, "home-shelf-clip");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page, "/?rank=R6&nw=100000000");
  await page.getByTestId("shelf-tiles").evaluate((el) => { el.scrollLeft = el.scrollWidth; el.dispatchEvent(new Event("scroll")); });
  await shot(page, "shelf-scrolled-end");
});

test("T2-06 phone tile glyphs are never brass (all apps)", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/?rank=R6&nw=100000000");
  for (const p of PALETTES) {
    await setPalette(page, p);
    const acc = await token(page, "acc");
    const colours = await page.locator(".phone-app .icon").evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
    expect(colours.length).toBeGreaterThanOrEqual(30);
    expect(colours.filter((c) => c === acc)).toEqual([]);
  }
  const ds = await page.goto("/__ds");
  expect(ds!.ok()).toBe(true);
  const acc = await token(page, "acc");
  const sheet = await page.locator(".ds-glyph .tile-phone").evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
  expect(sheet).toHaveLength(32);
  expect(sheet.filter((c) => c === acc)).toEqual([]);
});

test("T2-07 focus mode: 24 px strip with exactly clock, tick ring and NW", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  await page.getByTestId("focus-btn").click();
  const strip = page.getByTestId("strip");
  expect((await strip.boundingBox())!.height).toBe(24);
  const kids = await strip.evaluate((el) => [...el.children].map((c) => (c.classList.contains("clock") ? "clock" : c.classList.contains("tickring") ? "tickring" : c.getAttribute("data-testid"))));
  expect(kids).toEqual(["clock", "tickring", "strip-nw"]);
  await shot(page, "focus-mode");
});

test("C3 home DOM identical across palettes", async ({ page }, info) => {
  await boot(page, "/?rank=R2");
  // Studio Q3: built apps show a skeleton until their chunk lands, and Portfolio's hero loads after it; compare settled
  // DOMs. The default layout's windows open after the saved state loads: wait for them (Wire's feed) before settling.
  if (info.project.name === "desktop") await expect(page.getByTestId("wire")).toHaveAttribute("data-state", /^(?!loading$)/);
  await settled(page);
  const doms: string[] = [];
  for (const p of PALETTES) { await setPalette(page, p); doms.push(await page.locator(".quay").evaluate((el) => el.outerHTML)); }
  for (const d of doms) expect(d).toBe(doms[0]);
});

test("C4 axe: home, R1 home, focus mode, Shadow window, ComingLater", async ({ page }, info) => {
  const routes = info.project.name === "phone" ? ["/?rank=R2", "/?rank=R1&nw=30000", "/markets"] : ["/?rank=R2", "/?rank=R1&nw=30000", "/ailab?nw=200000", "/markets"];
  for (const r of routes) {
    await boot(page, r);
    const res = await new AxeBuilder({ page }).analyze();
    expect([r, res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)]).toEqual([r, []]);
  }
});

async function hitAreas(page: Page, min: number) {
  return page.evaluate((m) => {
    const els = [...document.querySelectorAll(".strip button, .shelf button, .win button, .statusbar button, .bottom-row button, .phone-app")];
    const rects = els.map((el) => ({ id: el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.className, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0);
    const small = rects.filter(({ r }) => r.width < m - 0.5 || r.height < m - 0.5).map(({ id, r }) => `${id} ${Math.round(r.width)}x${Math.round(r.height)}`);
    // Hit areas of the workspace slots and the launcher field must not overlap their neighbours.
    const watched = [...document.querySelectorAll(".ws button, .launch-field, .strip .icon-btn, .tool")];
    const overlaps: string[] = [];
    for (const w of watched) {
      const a = w.getBoundingClientRect();
      for (const o of els) {
        if (o === w || o.contains(w) || w.contains(o)) continue;
        const raw = o.getBoundingClientRect();
        // Tiles scrolled out of the shelf's scroller are clipped and not hittable: clip to the scroller.
        const clip = o.closest(".shelf-tiles")?.getBoundingClientRect();
        const b = clip ? { left: Math.max(raw.left, clip.left), right: Math.min(raw.right, clip.right), top: raw.top, bottom: raw.bottom } : raw;
        if (b.right - b.left <= 0) continue;
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(`${w.getAttribute("data-testid") ?? w.className} × ${o.getAttribute("data-testid") ?? o.className}`);
      }
    }
    return { small, overlaps };
  }, min);
}

test("C5 hit targets in strip, shelf and windows: pointer ≥28, touch ≥44, no exemptions, no overlaps", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await boot(page, phone ? "/?rank=R2" : "/wire");
  expect(await hitAreas(page, phone ? 44 : 28)).toEqual({ small: [], overlaps: [] });
});

test("C5 desktop under touch: workspace slots and launcher field ≥44 with no overlaps", async ({ browser }, info) => {
  desktopOnly(info.project.name);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const page = await ctx.newPage();
  await boot(page, "/wire");
  const r = await hitAreas(page, 44);
  // Studio T2 ruling 1 + condition 3: workspace slots, launcher field, Notifications, layout and focus.
  expect({ small: r.small.filter((s) => /^ws-|launch|Notifications|layout-btn|focus-btn/.test(s)), overlaps: r.overlaps }).toEqual({ small: [], overlaps: [] });
  await shot(page, "hit-areas-touch");
  await ctx.close();
});

test("Condition 3: Notifications, layout and focus keep their visible size; touch hit areas are 44", async ({ browser }, info) => {
  desktopOnly(info.project.name);
  const sizes = async (touch: boolean) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: touch });
    const page = await ctx.newPage();
    await boot(page, "/");
    const v = await page.evaluate(() => [".strip .icon-btn svg", "[data-testid=layout-btn]", "[data-testid=focus-btn]"].map((sel) => {
      const n = document.querySelector(sel)!, r = n.getBoundingClientRect(), b = sel.endsWith("svg") ? null : getComputedStyle(n, "::before");
      // x is excluded: on touch the approved edge-to-edge workspace slots shift the shelf tools left.
      const vis = b ? { y: Math.round(r.top + parseFloat(b.top)), w: Math.round(r.width), h: Math.round(r.height - parseFloat(b.top) - parseFloat(b.bottom)) }
        : { y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      return vis;
    }));
    await ctx.close();
    return v;
  };
  expect(await sizes(true)).toEqual(await sizes(false));
});

test("Condition 2: the strip's hit layer sits above window title bars; drags never put a title bar in the band", async ({ browser }, info) => {
  desktopOnly(info.project.name);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const page = await ctx.newPage();
  await boot(page, "/wire");
  const win = page.getByTestId("win-wire");
  // Force a title bar under the band (as a stale persisted rect might) to prove stacking, not just placement.
  await win.evaluate((n) => { (n as HTMLElement).style.top = "34px"; (n as HTMLElement).style.left = "300px"; });
  const lf = await page.locator(".launch-field").boundingBox();
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest(".launch-field, .titlebar")?.className, [lf!.x + 100, 34 + 3]);
  expect(hit).toBe("launch-field");
  // A drag starting in the band does not move the window underneath; a tap there opens the launcher.
  await page.mouse.move(lf!.x + 100, 37); await page.mouse.down(); await page.mouse.move(lf!.x + 300, 400, { steps: 5 }); await page.mouse.up();
  expect(await win.evaluate((n) => (n as HTMLElement).style.top)).toBe("34px");
  await page.mouse.click(lf!.x + 100, 37);
  await expect(page.getByTestId("launcher")).toBeVisible();
  await page.keyboard.press("Escape");
  // Drag the real title bar far up: it stops at clampTop = strip bottom (or the banner stack bottom, when one shows)
  // + 8 (AC-WM-SHELF-CLAMP, Studio 09:10; ruled again for #28), measured from the live rects.
  await page.reload(); await boot(page, "/wire");
  const tb = await page.getByTestId("win-wire").locator(".titlebar").boundingBox();
  await page.mouse.move(tb!.x + 200, tb!.y + 10); await page.mouse.down(); await page.mouse.move(tb!.x + 200, -50, { steps: 5 }); await page.mouse.up();
  const clampTop = await page.evaluate(() => {
    const strip = document.querySelector("[data-testid=strip]")!.getBoundingClientRect().bottom;
    const banners = [...document.querySelectorAll("[data-testid=alert-slot][data-open=true], [data-testid=world-slot][data-open=true]")].map((e) => e.getBoundingClientRect().bottom);
    return Math.round(Math.max(strip, ...banners) + 8);
  });
  expect(Math.round((await page.getByTestId("win-wire").boundingBox())!.y)).toBe(clampTop);
  await ctx.close();
});

test("Ruling 1: visible workspace slot and launcher field keep their size; focus ring follows the visible shape", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/");
  const ring = await page.evaluate(() => { const e = document.createElement("i"); e.style.boxShadow = "var(--focus-ring)"; document.body.append(e); const v = getComputedStyle(e).boxShadow; e.remove(); return v; });
  for (const id of ["ws-1", "launch"]) {
    const el = id === "launch" ? page.locator(".launch-field") : page.getByTestId(id);
    await el.focus();
    const v = await el.evaluate((n) => {
      const r = n.getBoundingClientRect(), b = getComputedStyle(n, "::before");
      return { h: r.height - parseFloat(b.top) - parseFloat(b.bottom), w: r.width - parseFloat(b.left) - parseFloat(b.right),
        ownRing: getComputedStyle(n).boxShadow, ownOutline: getComputedStyle(n).outlineStyle, ring: b.boxShadow, visible: n.matches(":focus-visible") };
    });
    expect(v.visible).toBe(true);
    expect([id, v.ownRing, v.ownOutline, v.ring]).toEqual([id, "none", "none", ring]);
    expect([id, v.w, v.h]).toEqual(id === "launch" ? [id, 312, 24] : [id, 30, 20]);
  }
  // Debug shot: hit areas outlined.
  await page.addStyleTag({ content: ".ws button, .launch-field { outline: 1px dashed var(--warn) !important; }" });
  await page.getByTestId("shelf").screenshot({ path: `${SHOTS}/hit-areas-debug-shelf-1440x900.png` });
  await page.getByTestId("strip").screenshot({ path: `${SHOTS}/hit-areas-debug-strip-1440x900.png` });
  if (EXTRA) for (const n of ["shelf", "strip"]) copyFileSync(`${SHOTS}/hit-areas-debug-${n}-1440x900.png`, `${EXTRA}/hit-areas-debug-${n}-1440x900.png`);
});

/** Words split across lines in the matched labels (Range rects per word). */
const brokenWords = (page: Page, selector: string) => page.evaluate((sel) => [...document.querySelectorAll(sel)].flatMap((el) => {
  const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
  if (!node || !node.textContent) return [];
  const out: string[] = [];
  for (const m of node.textContent.matchAll(/\S+/g)) {
    const r = document.createRange();
    r.setStart(node, m.index!); r.setEnd(node, m.index! + m[0].length);
    const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
    if (lines.size > 1) out.push(m[0]);
  }
  return out;
}), selector);

test("Ruling 2: app labels (INSTITUTIONS included) never break mid-word, at text scale 1.0 and 2.0", async ({ page }) => {
  for (const scale of ["1", "2"]) {
    await page.goto("/__ds");
    await page.evaluate((s) => document.documentElement.style.setProperty("--text-scale", s), scale);
    expect([scale, await brokenWords(page, ".ds-glyph figcaption")]).toEqual([scale, []]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  }
  const caption = page.getByTestId("ds-glyph-institutions").locator("figcaption");
  expect(await caption.evaluate((e) => getComputedStyle(e).hyphens)).not.toBe("auto");
});

test("C7 reduced motion → 0 ms in chrome; reduced transparency → opaque strip, no backdrop-filter", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/wire");
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; document.documentElement.dataset.transparency = "reduce"; });
  const bad = await page.evaluate(() => [...document.querySelectorAll(".strip, .strip *, .shelf, .shelf *, .win, .win *")]
    .filter((el) => !el.classList.contains("tickring-sweep"))
    .flatMap((el) => {
      const s = getComputedStyle(el);
      const d = [...s.transitionDuration.split(","), ...s.animationDuration.split(",")].some((x) => parseFloat(x) > 0);
      return [...(d ? [`${el.className} duration`] : []), ...(s.backdropFilter !== "none" ? [`${el.className} backdrop`] : [])];
    }));
  expect(bad).toEqual([]);
  expect(await page.getByTestId("strip").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await token(page, "chrome"));
});

test("C8 text scale 2.0 at 390: no horizontal scroll, NW not truncated", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/?rank=R2");
  await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "2"));
  const r = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - innerWidth,
    clipped: [...document.querySelectorAll(".money")].filter((m) => m.scrollWidth > m.clientWidth + 1).length,
  }));
  expect(r).toEqual({ page: 0, clipped: 0 });
});

test("C9 screenshots: Broadsheet home, AI Lab (Shadow), ComingLater, glyph sheet", async ({ page }, info) => {
  if (info.project.name === "desktop") {
    await boot(page, "/?rank=R2");
    await setPalette(page, "broadsheet");
    await shot(page, "home-broadsheet");
    await boot(page, "/ailab?nw=200000");
    await shot(page, "ailab-shadow");
  } else {
    await boot(page, "/?rank=R2");
    await shot(page, "phone-home-r2");
    await boot(page, "/?rank=R1&nw=30000");
    await shot(page, "phone-home-r1-locked");
    await boot(page, "/markets");
    await shot(page, "coming-later");
    await page.goto("/__ds");
    await page.evaluate(() => { document.body.style.overflow = "visible"; document.body.style.height = "auto"; document.documentElement.style.height = "auto"; (document.querySelector(".ds") as HTMLElement).style.height = "auto"; });
    await page.getByTestId("ds-glyphs").scrollIntoViewIfNeeded();
    const file = `glyphs-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png`;
    mkdirSync(SHOTS, { recursive: true });
    await page.getByTestId("ds-glyphs").screenshot({ path: `${SHOTS}/${file}` });
    if (EXTRA) copyFileSync(`${SHOTS}/${file}`, `${EXTRA}/${file}`);
  }
});

test("C9 glyph sheet at 1440", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await page.goto("/__ds");
  const file = `glyphs-1440x900.png`;
  mkdirSync(SHOTS, { recursive: true });
  await page.getByTestId("ds-glyphs").screenshot({ path: `${SHOTS}/${file}` });
  if (EXTRA) copyFileSync(`${SHOTS}/${file}`, `${EXTRA}/${file}`);
});
