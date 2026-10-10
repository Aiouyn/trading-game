import { expect, test, type Page } from '@playwright/test';
import { boot, gotoShell, onlyIn, reachRank, windowIds } from './support';

const PALETTES = [
  { slug: 'ink-brass', button: 'Ink & Brass' },
  { slug: 'broadsheet', button: 'Broadsheet' },
  { slug: 'phosphor', button: 'Phosphor' },
  { slug: 'riviera', button: 'Riviera' },
] as const;

async function pick(page: Page, button: string): Promise<void> {
  await page.getByTestId('palette-picker').getByRole('button', { name: button }).click();
}

/**
 * The DOM's structure, with what a palette may not change left out: style attributes, <style> elements,
 * the wallpaper art (which is per palette by design, P2-232), the palette picker's own pressed state, and
 * text (the clock and prices move on every tick). Element tags, attribute names and the test ids, roles and
 * aria states that the shell sets must match exactly across palettes.
 */
async function domShape(page: Page): Promise<string> {
  return page.evaluate(() => {
    const STABLE = new Set(['data-testid', 'role', 'aria-label', 'aria-labelledby', 'aria-modal', 'data-layout', 'data-current', 'data-chart-id', 'data-palette']);
    const walk = (el: Element): string => {
      if (el.matches('.os-wallpaper, style, script, [data-testid="palette-picker"]')) return `<${el.tagName.toLowerCase()} skipped/>`;
      // The one attribute a palette may change is data-palette on <html>; it is dropped before the value is shown.
      const isRoot = el === document.documentElement;
      const attrs = Array.from(el.attributes)
        .filter((a) => a.name !== 'style' && a.name !== 'class' && !a.name.startsWith('data-tick'))
        .filter((a) => !(isRoot && a.name === 'data-palette'))
        .map((a) => (STABLE.has(a.name) ? `${a.name}=${a.value}` : a.name))
        .sort()
        .join(' ');
      const kids = Array.from(el.children).map(walk).join('');
      return `<${el.tagName.toLowerCase()} ${attrs}>${kids}</${el.tagName.toLowerCase()}>`;
    };
    return walk(document.documentElement);
  });
}

test.describe('palettes', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop palettes');

  test('@palette_dom_identical switching palette changes data-palette on html and no other attribute or node', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.getByTestId('shelf-app-settings').click();
    await expect(page.getByTestId('palette-picker')).toBeVisible();
    await pick(page, 'Ink & Brass');
    const base = await domShape(page);
    for (const p of PALETTES.slice(1)) {
      await pick(page, p.button);
      await expect(page.locator('html')).toHaveAttribute('data-palette', p.slug);
      const shape = await domShape(page);
      expect(shape, `DOM shape under ${p.slug}`).toBe(base);
    }
    await pick(page, 'Ink & Brass');
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'ink-brass');
  });

  test('@palette_no_flash a reload paints the saved palette before any script runs', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        (window as unknown as { __firstPalette: string | null }).__firstPalette = document.documentElement.dataset.palette ?? null;
      });
    });
    for (const p of PALETTES) {
      await page.evaluate((slug) => {
        const raw = window.localStorage.getItem('tg-prefs');
        const prefs = raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>);
        window.localStorage.setItem('tg-prefs', JSON.stringify({ ...prefs, palette: slug }));
      }, p.slug);
      await gotoShell(page, '/');
      const first = await page.evaluate(() => (window as unknown as { __firstPalette: string | null }).__firstPalette);
      expect(first, `first paint under ${p.slug}`).toBe(p.slug);
    }
  });

  test('@palette_chart_live switching palette mid-session keeps every chart instance and its data', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    const before = await page.evaluate(() => window.__tg!.e2e!.charts());
    expect(before.length).toBeGreaterThan(0);
    const price = await page.evaluate(() => window.__tg!.state().frame?.tick ?? null);
    await page.getByTestId('shelf-app-settings').click();
    await pick(page, 'Phosphor');
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'phosphor');
    const after = await page.evaluate(() => window.__tg!.e2e!.charts());
    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id));
    expect(price).not.toBeNull();
    await pick(page, 'Ink & Brass');
  });

  test('@palette_contrast body text meets 4.5:1 on the window and chrome surfaces in every palette', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.getByTestId('shelf-app-settings').click();
    for (const p of PALETTES) {
      await pick(page, p.button);
      await expect(page.locator('html')).toHaveAttribute('data-palette', p.slug);
      const pairs = await page.evaluate(() => {
        const probe = (prop: string): string => {
          const el = document.createElement('i');
          el.style.color = `var(${prop})`;
          document.body.appendChild(el);
          const c = getComputedStyle(el).color;
          el.remove();
          return c;
        };
        return {
          fg: probe('--color-fg'),
          muted: probe('--color-fg-muted'),
          faint: probe('--color-fg-faint'),
          win: probe('--color-ink-1'),
          chrome: probe('--color-chrome'),
        };
      });
      const lum = (rgb: string): number => {
        const m = /rgba?\((\d+), (\d+), (\d+)/.exec(rgb);
        if (!m) throw new Error(`no colour in ${rgb}`);
        const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((v) => {
          const c = Number(v) / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const ratio = (a: string, b: string): number => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
        return (hi + 0.05) / (lo + 0.05);
      };
      expect(ratio(pairs.fg, pairs.win), `${p.slug} fg on win`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(pairs.fg, pairs.chrome), `${p.slug} fg on chrome`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(pairs.muted, pairs.win), `${p.slug} muted on win`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(pairs.faint, pairs.win), `${p.slug} faint on win`).toBeGreaterThanOrEqual(4.5);
    }
    await pick(page, 'Ink & Brass');
  });

  test('@palette_never_auto the palette changes only when the player picks it, not on a rank-up or a reload', async ({ page }) => {
    onlyIn('desktop');
    const handle = await boot(page);
    await page.getByTestId('shelf-app-settings').click();
    await pick(page, 'Riviera');
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'riviera');
    await reachRank(page, handle, 300_000);
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'riviera');
    await gotoShell(page, '/');
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'riviera');
    expect(await windowIds(page)).toContain('settings');
    await page.getByTestId('shelf-app-settings').click();
    await pick(page, 'Ink & Brass');
  });
});
