import { expect, test, type Page } from '@playwright/test';
import { NPCS } from '../../src/content/progression';
import { goTo, grant, isPhone, register, skipRankUp, skipTips, watchErrors } from './helpers';

// Tape's Research Desk hunts in the browser (docs/team/specs/tape-research-desk.md, sections 1 to 4), each with its hunt id.
// The desk opens at Operator: a grant lifts the rank, as the admin route does.

/** the displayed move, formatted the way the desk formats a move (signedPct): the same string the API total gives */
const signedPct = (x: number) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;

async function openDesk(page: Page, handle: string): Promise<void> {
  await skipTips(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'research');
  await expect(page.getByTestId('desk-unlock')).toBeVisible();
  await page.getByTestId('desk-unlock-run').click();
  await page.getByTestId('desk-unlock-confirm').click();
  await expect(page.getByTestId('desk-query-asset')).toBeVisible();
}

test('desk_picker_blocks_today: the picker refuses today and the day after the last close; the session is open', async ({ page }) => {
  test.skip(isPhone(page), 'the desk query bar is checked on the desktop shell; the phone layout is the same component');
  const errors = watchErrors(page);
  const handle = await register(page);
  await openDesk(page, handle);
  const max = Number(await page.getByTestId('desk-to').getAttribute('max'));
  expect(Number.isFinite(max)).toBe(true);
  const session = (await page.getByTestId('desk-session').textContent()) ?? '';
  const today = Number(session.match(/Day (\d+)/)?.[1]);
  expect(session).toContain('Session open');
  expect(today).toBe(max + 1);

  // today: refused, the picker shows the last closed day
  await page.getByTestId('desk-to').fill(String(today));
  expect(Number(await page.getByTestId('desk-to').inputValue())).toBe(max);
  // the day after today: refused as well
  await page.getByTestId('desk-to').fill(String(today + 1));
  expect(Number(await page.getByTestId('desk-to').inputValue())).toBe(max);
  // the from day never passes the to day, even when typed as today
  await page.getByTestId('desk-from').fill(String(today));
  expect(Number(await page.getByTestId('desk-from').inputValue())).toBeLessThanOrEqual(max);

  await page.getByTestId('desk-run').click();
  await expect(page.getByTestId('desk-dossier')).toBeVisible();
  await expect(page.getByTestId('desk-header')).toContainText(`to Day ${max}`);
  expect(errors).toEqual([]);
});

test('dom_no_trader_names: the desk dossier and the analyst view name no rival, no persona and no account id', async ({ page }) => {
  test.skip(isPhone(page), 'the dossier and the analyst are the desktop check; the phone shows the same components');
  const errors = watchErrors(page);
  const handle = await register(page);
  await openDesk(page, handle);
  await page.getByTestId('desk-run').click();
  await expect(page.getByTestId('desk-dossier')).toBeVisible();
  const names = [
    'Hale & Ward', 'Pinn Partners', 'Vetch',
    ...NPCS.map((n) => n.handle),
    ...NPCS.map((n) => n.id),
  ];
  const desk = (await page.getByTestId('research').innerText()) + (await page.getByTestId('research').innerHTML());
  for (const n of names) expect(desk.includes(n), `desk shows ${n}`).toBe(false);
  // the analyst view: hire a junior analyst (grant covers the first week), then read its DOM
  await goTo(page, 'portfolio');
  await page.getByTestId('portfolio-tab-analyst').click();
  await page.getByTestId('analyst-tier-junior').click();
  await page.getByTestId('analyst-hire').click();
  await page.getByTestId('analyst-hire-confirm').click();
  await expect(page.getByTestId('analyst-status')).toContainText('analyst');
  const analyst = (await page.getByTestId('analyst').innerText()) + (await page.getByTestId('analyst').innerHTML());
  for (const n of names) expect(analyst.includes(n), `analyst shows ${n}`).toBe(false);
  expect(errors).toEqual([]);
});

test('ui_no_own_arithmetic: the total the desk shows is the API total, string for string', async ({ page }) => {
  test.skip(isPhone(page), 'checked once on the desktop shell');
  const errors = watchErrors(page);
  const apiMoves: number[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (e) => {
      try {
        const m = JSON.parse(String(e.payload)) as { t?: string; data?: { move?: unknown; rows?: unknown } };
        if (m.t === 'ack' && m.data && typeof m.data.move === 'number' && Array.isArray(m.data.rows)) apiMoves.push(m.data.move);
      } catch { /* not JSON: not an ack */ }
    });
  });
  const handle = await register(page);
  await openDesk(page, handle);
  await page.getByTestId('desk-run').click();
  await expect(page.getByTestId('desk-dossier')).toBeVisible();
  await expect.poll(() => apiMoves.length).toBeGreaterThan(0);
  const api = apiMoves[apiMoves.length - 1]!;
  await expect(page.getByTestId('desk-total')).toHaveText(signedPct(api));
  await expect(page.getByTestId('desk-move')).toHaveText(signedPct(api));
  expect(errors).toEqual([]);
});

test('desk_below_r3_absent: a player below Operator has no query control in the DOM and a disabled shelf tile', async ({ page }) => {
  test.skip(isPhone(page), 'the shelf tile is the desktop check; the phone check is in systemApps.spec');
  await register(page);
  await skipTips(page);
  await expect(page.getByTestId('shelf-app-research')).toHaveAttribute('aria-disabled', 'true');
  await page.goto('/research');
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  for (const id of ['desk-query', 'desk-query-asset', 'desk-from', 'desk-to', 'desk-run', 'desk-unlock', 'desk-file']) {
    await expect(page.getByTestId(id), id).toHaveCount(0);
  }
});
