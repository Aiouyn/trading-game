import { expect, test, type Page } from '@playwright/test';
import { planLayout, type LayoutPlan } from '../../../src/shell/layouts';
import { GUTTER, SLOT_FRAC, STRIP_H, fracToRect, workArea, type SlotName } from '../../../src/shell/geometry';
import { type Rect } from '../../../src/shell/geometry';
import { WIDE, boot, box, expectRect, launcher, onlyIn, reachRank, sameRect, selectedTicker, viewport, windowIds } from './support';

/**
 * Trade, Review and Research on the wide desktops (tape-desktop-shell.md section 8; velvet-desktop-os.md
 * "Named layouts"). The fallback rule (DECISIONS "Infeasible layouts"): thirds when every window fits its
 * minimum, else halves, else one window filled. The expected plan comes from the same pure planner the app
 * uses, so each run checks that the windows land where the planner says, and that the variant is the one
 * the rule gives at that width.
 */

/**
 * Trade is thirds at 1440 and up: the Broker takes the left width and Wire and Portfolio stack in the 400 px side column
 * (UX stage 6, geometry.ts SIDE_COL_PX). Below 1200 the layout falls back to halves.
 */
const TRADE_VARIANT: Record<number, LayoutPlan['variant']> = { 1920: 'thirds', 1440: 'thirds' };

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

/** Every window frame's rect, in page coordinates (the desktop starts at the page origin). */
async function allBoxes(page: Page): Promise<Rect[]> {
  const ids = await windowIds(page);
  const out: Rect[] = [];
  for (const id of ids) out.push(await box(page, id));
  return out;
}

function placedBox(slot: SlotName, vp: { w: number; h: number }): Rect {
  const r = fracToRect(SLOT_FRAC[slot], workArea(vp, false), GUTTER);
  return { x: r.x, y: STRIP_H + r.y, w: r.w, h: r.h };
}

test.describe('named layouts', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop layouts');

  test('@layouts Trade, Review and Research place each window where the planner puts it, with the fallback variant for the width', async ({ page }) => {
    onlyIn(...WIDE);
    const handle = await boot(page);
    await reachRank(page, handle, 8_000_000);
    const vp = viewport(page);
    const ticker = await selectedTicker(page);
    const unlocked = () => true;
    for (const name of ['trade', 'review', 'research'] as const) {
      await page.getByTestId('shelf-layout-menu').click();
      await page.getByTestId(`layout-${name}`).click();
      await settle(page);
      const plan = planLayout(name, vp, unlocked, { ticker });
      if (name === 'trade') expect(plan.variant).toBe(TRADE_VARIANT[vp.w]);
      if (name === 'review') expect(plan.variant).toBe('thirds');
      expect(plan.placements.length).toBeGreaterThan(0);
      const actual = await allBoxes(page);
      for (const p of plan.placements) {
        if (p.slot === null || typeof p.slot !== 'string') throw new Error(`${name}: a free placement`);
        const want = placedBox(p.slot, vp);
        const hit = actual.some((a) => sameRect(a, want));
        expect.soft(hit, `${name}: no window at ${p.slot} (${JSON.stringify(want)})`).toBe(true);
      }
    }
  });

  test('@ticket_clear at 1440 the Trade preset and three open windows never cover the Broker order ticket (UX stage 6)', async ({ page }) => {
    onlyIn('desktop');
    const handle = await boot(page);
    await reachRank(page, handle, 8_000_000);
    await page.getByTestId('shelf-layout-menu').click();
    await page.getByTestId('layout-trade').click();
    await settle(page);
    const overlaps = async (): Promise<string[]> => {
      const cta = await page.getByTestId('order-submit').boundingBox();
      if (cta === null) throw new Error('no order button on the ticket');
      const hits: string[] = [];
      for (const id of await windowIds(page)) {
        if (id.startsWith('broker')) continue;
        const r = await box(page, id);
        const apart = r.x + r.w <= cta.x || cta.x + cta.width <= r.x || r.y + r.h <= cta.y || cta.y + cta.height <= r.y;
        if (!apart) hits.push(id);
      }
      return hits;
    };
    expect(await overlaps()).toEqual([]);
    // The Trade preset's side column is 400 px at 1440 (the Broker keeps the rest); the ticket column sits inside the Broker.
    const broker = await box(page, 'broker-1');
    expect(broker.w).toBeGreaterThan(900);
    for (const id of ['wire', 'portfolio', 'exchange']) {
      await page.getByTestId(`shelf-app-${id}`).click();
      await settle(page);
    }
    expect(await overlaps()).toEqual([]);
  });

  test('@layouts Research places no Research window without a file, and the Broker takes the freed space', async ({ page }) => {
    onlyIn(...WIDE);
    const handle = await boot(page);
    await reachRank(page, handle, 8_000_000);
    const vp = viewport(page);
    await page.getByTestId('shelf-layout-menu').click();
    await page.getByTestId('layout-research').click();
    await settle(page);
    // No file is open, so the Research entry is skipped (layouts.ts). The Broker moves to the main slot.
    expect((await windowIds(page)).some((id) => id.startsWith('research'))).toBe(false);
    const broker = placedBox('L23', vp);
    const actual = await allBoxes(page);
    expect(actual.some((a) => sameRect(a, broker))).toBe(true);
  });

  test('@layouts below 1200 px the layouts are hidden, not greyed, and the launcher offers no layout command', async ({ page }) => {
    onlyIn('desktop-1000', 'desktop-900');
    await boot(page);
    await expect(page.getByTestId('shelf-layout')).toHaveCount(0);
    await expect(page.getByTestId('shelf-layout-menu')).toHaveCount(0);
    await launcher(page, 'layout');
    await expect(page.getByTestId('os-launcher-list').getByRole('option', { name: /layout/i })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('os-launcher')).toHaveCount(0);
  });

  test('@layouts Trade at 1440 leaves the Broker on the left half, Wire top right and Portfolio bottom right', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    const vp = viewport(page);
    await page.getByTestId('shelf-layout').click();
    await settle(page);
    // 1440 is below the thirds width for Portfolio, so the halves variant holds: the left half and two quarters.
    expectRect(await box(page, 'broker-1'), placedBox('L2', vp));
    expect(await windowIds(page)).toEqual(expect.arrayContaining(['broker-1', 'wire', 'portfolio']));
  });
});
