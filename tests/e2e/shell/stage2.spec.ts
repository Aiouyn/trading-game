import { expect, test, type Locator, type Page } from '@playwright/test';
import { goTo, watchErrors } from '../helpers';
import { boot, isPhone, onlyIn, viewport, windowIds } from './support';

// Stage 2 of the UX redesign (docs/UX-REDESIGN.md): nothing blocks the trade surface, the ticket fits at 1280 x 720, and
// the phone sheet keeps its Buy/Sell call to action on screen.

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function boxOf(loc: Locator): Promise<Box> {
  const b = await loc.boundingBox();
  if (b === null) throw new Error('no box');
  return b;
}

/** Pushes n notices through the store hook, so the toast column has something to place. */
async function pushToasts(page: Page, n: number): Promise<void> {
  for (let i = 1; i <= n; i++) {
    await page.evaluate((k) => window.__tg!.state().toast({ tone: 'info', text: `stage 2 notice ${k}` }), i);
  }
}

test.describe('the trade surface is never blocked (stage 2)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop terminal');

  for (const [w, h] of [[1280, 720], [1440, 900]] as const) {
    test(`@toasts_ticket toasts never overlap the ticket at ${w}x${h}`, async ({ page }) => {
      onlyIn('desktop', 'desktop-1920', 'desktop-1000', 'desktop-900');
      await page.setViewportSize({ width: w, height: h });
      watchErrors(page);
      await boot(page);
      // two notices draw at once (UX stage 6)
      await pushToasts(page, 2);
      const col = page.getByTestId('os-toasts');
      await expect(page.locator('[data-testid^="os-toast-"][data-tone]')).toHaveCount(2);
      const colBox = await boxOf(col);
      const ticket = page.getByTestId('terminal-ticket');
      await expect(ticket).toBeVisible();
      const ticketBox = await boxOf(ticket);
      expect(overlaps(colBox, ticketBox), `toast column ${JSON.stringify(colBox)} over ticket ${JSON.stringify(ticketBox)}`).toBe(false);
      const cta = await boxOf(page.getByTestId('order-submit'));
      expect(overlaps(colBox, cta), 'toast column over the Buy/Sell button').toBe(false);
      // the column sits above the dock and inside the viewport
      expect(colBox.y + colBox.height).toBeLessThanOrEqual(h);
      expect(colBox.x + colBox.width).toBeLessThanOrEqual(w);
    });
  }

  test('@bell_1280 the bell opens the notification center at 1280 x 720 and lists the desk notices', async ({ page }) => {
    onlyIn('desktop', 'desktop-1920', 'desktop-1000', 'desktop-900');
    await page.setViewportSize({ width: 1280, height: 720 });
    watchErrors(page);
    await boot(page);
    await pushToasts(page, 1);
    await page.getByTestId('os-bell').click();
    const panel = page.getByTestId('bell-panel');
    await expect(panel).toBeVisible();
    const b = await boxOf(panel);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(1280);
    expect(b.y + b.height).toBeLessThanOrEqual(720);
    await expect(page.getByTestId('bell-desk-item').first()).toContainText('stage 2 notice 1');
    await page.getByTestId('bell-close').click();
    await expect(panel).toHaveCount(0);
  });

  test('@tp_pill_sl the take-profit pill never covers the +SL control on the position line', async ({ page }) => {
    onlyIn('desktop', 'desktop-1920');
    await page.setViewportSize({ width: 1280, height: 720 });
    watchErrors(page);
    await boot(page);
    const placed = await page.evaluate(async () => {
      const r = await window.__tg!.state().act({ type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 1 } } as never, { silent: true });
      return r.ok;
    });
    expect(placed).toBe(true);
    const addSl = page.getByTestId('level-add-sl').first();
    await expect(page.getByTestId('level-add-tp').first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('level-add-tp').first().click();
    await expect(addSl).toBeVisible();
    const sl = await boxOf(addSl);
    // every other level pill on the chart (a take-profit or stop-loss pill, not the position line's own buttons)
    const others = await page.locator('[data-testid^="level-"]').evaluateAll((els, slTestId) => els
      .filter((el) => {
        const id = el.getAttribute('data-testid') ?? '';
        if (id.startsWith('level-line-') || id.startsWith('level-cancel') || id.startsWith('level-add')) return false;
        return !el.contains(document.querySelector(`[data-testid="${slTestId}"]`));
      })
      .map((el) => { const r = el.getBoundingClientRect(); return { id: el.getAttribute('data-testid'), x: r.x, y: r.y, width: r.width, height: r.height }; }),
    'level-add-sl');
    for (const o of others) {
      expect(overlaps(sl, o), `+SL ${JSON.stringify(sl)} over ${o.id} ${JSON.stringify(o)}`).toBe(false);
    }
  });

  test('@ticket_fit_1280 the ticket fits 1280 x 720 without internal scroll for every order type, and its TP and SL fields do not overlap', async ({ page }) => {
    onlyIn('desktop', 'desktop-1920', 'desktop-1000', 'desktop-900');
    await page.setViewportSize({ width: 1280, height: 720 });
    watchErrors(page);
    await boot(page);
    const ticket = page.getByTestId('terminal-ticket');
    await expect(ticket).toBeVisible();
    // the order-type picker is hidden on a first trade (simple mode): one fill first, so every type is offered
    await page.evaluate(async () => {
      await window.__tg!.state().act({ type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 1 } } as never, { silent: true });
    });
    await expect(page.getByTestId('order-type')).toBeVisible({ timeout: 15_000 });
    const types = await page.getByTestId('order-type').locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(types.length).toBeGreaterThan(1);
    for (const type of types) {
      await page.getByTestId('order-type').selectOption(type);
      const scrolls = await ticket.evaluate((root) => {
        const out: string[] = [];
        for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
          const oy = getComputedStyle(el).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) out.push(el.tagName + '.' + el.className.toString().slice(0, 40));
        }
        return out;
      });
      expect(scrolls, `internal scroll for ${type}`).toEqual([]);
      const cta = await boxOf(page.getByTestId('order-submit'));
      expect(cta.y + cta.height, `Buy/Sell on screen for ${type}`).toBeLessThanOrEqual(720);
      const tp = page.getByTestId('order-tp');
      const sl = page.getByTestId('order-sl');
      if ((await tp.count()) > 0 && (await sl.count()) > 0) {
        expect(overlaps(await boxOf(tp), await boxOf(sl)), `TP over SL for ${type}`).toBe(false);
      }
    }
  });
});

test.describe('the Review layout and the desk (stage 2)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop layouts');

  test('@review_layout Review is one Portfolio and the Wire, side by side', async ({ page }) => {
    onlyIn('desktop', 'desktop-1920');
    watchErrors(page);
    await boot(page);
    await page.getByTestId('shelf-layout-menu').click();
    await page.getByTestId('layout-review').click();
    await expect.poll(async () => (await windowIds(page)).sort().join(',')).toBe('portfolio,wire');
  });
});

test.describe('the phone trade sheet keeps its call to action (stage 2)', () => {
  test('@phone_sheet_cta the sheet shows the total and a Buy button on screen while the chart stays visible', async ({ page }) => {
    onlyIn('phone');
    const v = viewport(page);
    watchErrors(page);
    await boot(page);
    await goTo(page, 'market');
    // the order-type picker shows after the first fill (simple mode hides it on a first trade)
    const filled = await page.evaluate(async () => {
      const r = await window.__tg!.state().act({ type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 1 } } as never, { silent: true });
      return { ok: r.ok, error: r.error ?? null, trades: window.__tg!.state().me?.player.stats.trades ?? -1 };
    });
    expect(filled, 'the first fill on the phone').toMatchObject({ ok: true });
    // the fill lands on the server a moment later; until it does the first-trade layout (no type picker) is shown
    await expect.poll(() => page.evaluate(() => window.__tg!.state().me?.player.stats.trades ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
    await page.getByTestId('bar-qty').fill('1');
    await page.getByTestId('bar-review').click();
    const sheet = page.getByTestId('trade-sheet');
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('order-total')).toBeVisible();
    const cta = await boxOf(page.getByTestId('order-submit'));
    expect(cta.y + cta.height).toBeLessThanOrEqual(v.h);
    expect(cta.y).toBeGreaterThanOrEqual(0);
    // the order-type picker is on the phone too (stage 2 polish)
    await expect(page.getByTestId('order-type')).toBeVisible();
    expect(isPhone(page)).toBe(true);
  });
});
