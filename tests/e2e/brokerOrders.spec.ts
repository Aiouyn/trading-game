import { expect, test, type Locator, type Page } from '@playwright/test';
import { skipTips } from './helpers';
import { boot, onlyIn } from './shell/support';

/**
 * Positions and orders on the Broker chart (UX redesign, spec 1.3) and the ticket (spec 1.4), on the desktop terminal: buy,
 * add a take-profit and a stop-loss from the position line, drag them (the orders are modified, and the Open orders list
 * shows the new price), place a buy limit from the chart menu and cancel it from its line, and set an alert. The shots go to
 * BROKER_SHOTS (or test-results/broker-orders) as chart-<viewport>-<state>.png for the layout review.
 */

const SHOTS = process.env.BROKER_SHOTS ?? 'test-results/broker-orders';

const VIEWPORTS = [
  { w: 1280, h: 720 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
] as const;

type TgOrder = { id: string; type: string; side: string; status: string; qty: number; filledQty: number; limitPrice?: number; stopPrice?: number; reduceOnly?: boolean };
type TgState = { me: { orders: TgOrder[]; account: { canShort?: boolean; positions: Record<string, { qty: number; avgCost: number }> } | null } | null };
type TgWindow = { __tg: { state: () => TgState } };

async function orders(page: Page): Promise<TgOrder[]> {
  return page.evaluate(() => (window as unknown as TgWindow).__tg.state().me?.orders ?? []);
}

async function account(page: Page): Promise<TgState['me']> {
  return page.evaluate(() => (window as unknown as TgWindow).__tg.state().me ?? null);
}

/** The first open reduce-only limit (the take-profit) or stop (the stop-loss) of the position. */
async function leg(page: Page, type: 'limit' | 'stop'): Promise<TgOrder | undefined> {
  return (await orders(page)).find((o) => o.status === 'open' && o.reduceOnly && o.type === type);
}

/** The rectangle of a test id's first match, or fails when it is not drawn. */
async function rect(loc: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await loc.boundingBox();
  if (!b) throw new Error('not drawn');
  return b;
}

/** Drags a pill by its left part (the label, away from the buttons): down, a few steps, up. */
async function dragPill(page: Page, loc: Locator, dy: number): Promise<void> {
  const b = await rect(loc);
  const x = b.x + 14;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy / 2, { steps: 4 });
  await page.mouse.move(x, y + dy, { steps: 4 });
  await page.mouse.up();
}

/** A price as the quote shows it (two decimals from a dollar up), for the Open orders rows. */
function quote(p: number): string {
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

test.describe('Broker chart lines and ticket (specs 1.3, 1.4)', () => {
  for (const vp of VIEWPORTS) {
    test(`buy, drag the take-profit and stop-loss, cancel a chart limit at ${vp.w}x${vp.h}`, async ({ page }) => {
      onlyIn('desktop');
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await boot(page);
      await expect(page.getByTestId('broker-terminal')).toBeVisible();
      const label = `${vp.w}x${vp.h}`;

      // the ticket before a trade: the CTA says what is missing, the Long and Short tabs, the cost summary is there
      await expect(page.getByTestId('order-submit')).toHaveText('Enter a size');
      await expect(page.getByTestId('side-sell')).toHaveText(/Short/);
      await expect(page.getByTestId('order-tp')).toBeVisible();
      await expect(page.getByTestId('order-sl')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/chart-${label}-ticket-empty.png` });

      // a market buy fills at the next tick: the position line (average cost and the P&L if closed now) appears
      await page.getByTestId('order-qty').fill('1');
      await expect(page.getByTestId('order-roundtrip')).toContainText('$');
      await expect(page.getByTestId('order-breakeven')).toBeVisible();
      await expect(page.getByTestId('order-spread')).toContainText('%');
      await page.getByTestId('order-submit').click();
      await expect(page.getByTestId('level-avg')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('level-avg')).toContainText('if closed now');
      // the first trade opens the coach tip over the ticket: it is dismissed before the ticket is used again
      await skipTips(page);
      await page.screenshot({ path: `${SHOTS}/chart-${label}-position.png` });

      // +TP and +SL on the position line place the reduce-only legs, drawn as lines with their $ and % move
      await page.getByTestId('level-add-tp').click();
      await expect(page.locator('[data-testid^="level-tp-"]')).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('level-add-sl').click();
      await expect(page.locator('[data-testid^="level-sl-"]')).toBeVisible({ timeout: 15_000 });
      const tpBefore = await leg(page, 'limit');
      const slBefore = await leg(page, 'stop');
      expect(tpBefore?.limitPrice, 'the take-profit is an order at a price').toBeGreaterThan(0);
      expect(slBefore?.stopPrice, 'the stop-loss is an order at a price').toBeGreaterThan(0);
      await page.screenshot({ path: `${SHOTS}/chart-${label}-tp-sl.png` });

      // drag the take-profit up and the stop-loss down: the orders are modified (the Open orders list shows the new prices).
      // A leg past the visible range is pinned to its edge with an arrow, so its pill does not move there; the price is read
      // from the engine. Up is the safe way for a sell limit (it cannot reach the mid by moving away from it).
      const tpPill = page.locator('[data-testid^="level-tp-"]').first();
      const slPill = page.locator('[data-testid^="level-sl-"]').first();
      const pinned = async (pill: Locator) => /[▲▼]/.test((await pill.textContent()) ?? '');
      await dragPill(page, tpPill, -24);
      await expect.poll(async () => (await leg(page, 'limit'))?.limitPrice ?? 0).toBeGreaterThan(tpBefore!.limitPrice!);

      // the stop-loss, when it is on the scale: the pill moves down with the pointer, and the stop price goes down
      const slY0 = (await rect(slPill)).y;
      const sb = await rect(slPill);
      await page.mouse.move(sb.x + 14, sb.y + sb.height / 2);
      await page.mouse.down();
      await page.mouse.move(sb.x + 14, sb.y + sb.height / 2 + 12, { steps: 4 });
      await page.screenshot({ path: `${SHOTS}/chart-${label}-dragging.png` });
      await page.mouse.move(sb.x + 14, sb.y + sb.height / 2 + 24, { steps: 4 });
      await page.mouse.up();
      await expect.poll(async () => (await leg(page, 'stop'))?.stopPrice ?? Infinity).toBeLessThan(slBefore!.stopPrice!);
      if (!(await pinned(slPill))) expect((await rect(slPill)).y, 'the stop-loss line moved down').toBeGreaterThan(slY0);

      // the Open orders list shows the modified prices
      await page.getByTestId('dock-tab-orders').click();
      const tpAfter = await leg(page, 'limit');
      const slAfter = await leg(page, 'stop');
      await expect(page.getByTestId(`order-${tpAfter!.id}`)).toContainText(quote(tpAfter!.limitPrice!));
      await expect(page.getByTestId(`order-${slAfter!.id}`)).toContainText(quote(slAfter!.stopPrice!));
      await page.screenshot({ path: `${SHOTS}/chart-${label}-orders.png` });
      await page.getByTestId('dock-tab-positions').click();

      // the chart menu: a right-click below the mid opens it at that price; a buy limit fills the ticket (never sends itself)
      const chart = page.getByTestId('price-chart');
      const cb = await rect(chart);
      await chart.click({ button: 'right', position: { x: cb.width / 2, y: cb.height * 0.8 } });
      await expect(page.getByTestId('chart-menu')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/chart-${label}-menu.png` });
      await page.getByTestId('menu-buyLimit').click();
      await expect(page.getByTestId('order-type')).toHaveValue('limit');
      await expect(page.getByTestId('order-limit')).not.toHaveValue('');
      await page.getByTestId('order-qty').fill('1');
      const before = (await orders(page)).length;
      await page.getByTestId('order-submit').click();
      await expect.poll(async () => (await orders(page)).length).toBe(before + 1);
      const working = (await orders(page)).find((o) => o.status === 'open' && o.type === 'limit' && !o.reduceOnly);
      expect(working, 'a working buy limit').toBeTruthy();
      const line = page.locator('[data-testid^="level-order-"]').first();
      await expect(line).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/chart-${label}-order-line.png` });
      await page.locator('[data-testid^="level-cancel-order-"]').first().click();
      await expect.poll(async () => (await orders(page)).find((o) => o.id === working!.id)?.status).toBe('cancelled');
      await expect(page.locator('[data-testid^="level-order-"]')).toHaveCount(0);

      // an alert from the menu: a line on the chart, cancelled from it
      await chart.click({ button: 'right', position: { x: cb.width / 2, y: cb.height * 0.25 } });
      await page.getByTestId('menu-alert').click();
      await expect(page.locator('[data-testid^="level-alert-"]')).toBeVisible();
      await page.locator('[data-testid^="level-cancel-alert-"]').first().click();
      await expect(page.locator('[data-testid^="level-alert-"]')).toHaveCount(0);

      // the ticket in its other states: dollars for the size, and the Short tab (the engine decides the short)
      await page.getByTestId('unit-usd').click();
      await page.getByTestId('order-qty').fill('2000');
      await expect(page.getByTestId('order-usd-shares')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/chart-${label}-ticket-usd.png` });
      await page.getByTestId('unit-shares').click();
      await skipTips(page);
      await page.getByTestId('side-sell').click();
      await page.getByTestId('order-qty').fill('1000');
      await page.getByTestId('order-submit').click();
      const me = await account(page);
      if (me?.account && !me.account.canShort) {
        // at Rookie the engine refuses a short sale: the refusal shows under the size, not as a toast
        await expect(page.getByTestId('order-invalid')).toBeVisible({ timeout: 15_000 });
      }
      await page.screenshot({ path: `${SHOTS}/chart-${label}-ticket-short.png` });
    });
  }
});
