import { expect, test } from '@playwright/test';
import { formatRoute, parseRoute } from '../../../src/shell/route';
import { APPS, type AppId } from '../../../src/shell/apps';
import { boot, dispatchKey, frame, gotoShell, onlyIn, orders, reachRank, selectedTicker, toastText, windowIds, brokerIds } from './support';
import { watchErrors } from '../helpers';

/** Every app path a link can name, with the window id it opens (routes.ts, F:74-82, P2-111). */
const APP_PATHS: { path: string; id: string }[] = [
  { path: 'portfolio', id: 'portfolio' },
  { path: 'portfolio/journal', id: 'portfolio' },
  { path: 'portfolio/analyst', id: 'portfolio' },
  { path: 'wire', id: 'wire' },
  { path: 'calendar', id: 'calendar' },
  { path: 'messages', id: 'messages' },
  { path: 'messages/chat', id: 'messages' },
  { path: 'businesses', id: 'businesses' },
  { path: 'boutique', id: 'boutique' },
  { path: 'legal', id: 'legal' },
  { path: 'bank', id: 'bank' },
  { path: 'security', id: 'security' },
  { path: 'ailab', id: 'ailab' },
  { path: 'learn', id: 'learn' },
  { path: 'settings', id: 'settings' },
  { path: 'settings/about', id: 'settings' },
  { path: 'company', id: 'company' },
  { path: 'research/tape-file-2', id: 'research-tape-file-2' },
];

test.describe('deep links', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop links (the phone has its own check)');

  test('@route_every_app each app and view path opens or focuses its window at R3', async ({ page }) => {
    test.setTimeout(240_000);
    onlyIn('desktop');
    const handle = await boot(page);
    await reachRank(page, handle, 8_000_000);
    for (const { path, id } of APP_PATHS) {
      await gotoShell(page, `/${path}`);
      await expect(frame(page, id), `/${path} opens win-${id}`).toBeVisible();
    }
    // Opening the same app again on a load focuses the window that is there: no second window.
    await gotoShell(page, '/portfolio');
    expect((await windowIds(page)).filter((x) => x === 'portfolio')).toHaveLength(1);
  });

  test('@route_locked_never_opens a locked app or file link at R0 opens no window and says why', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    for (const path of ['security', 'ailab', 'company', 'research/tape-locked']) {
      await gotoShell(page, `/${path}`);
      await expect(page.getByTestId('os-toasts')).toContainText('not unlocked yet');
      expect(await windowIds(page)).not.toContain(path.split('/')[0]);
      expect(await windowIds(page)).not.toContain(`research-tape-locked`);
    }
    await expect(page.getByTestId('shelf-app-security')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('shelf-app-company')).toHaveCount(0);
  });

  test('@route_hidden_apps Launchpad is not on the shelf, and a link to it lands on the desktop with a notice', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    for (const id of ['launchpad'] as const) {
      expect(APPS[id as AppId].available).toBe(false);
      await expect(page.getByTestId(`shelf-app-${id}`)).toHaveCount(0);
      await gotoShell(page, `/${id}`);
      await expect(page.getByTestId('os-toasts')).toContainText('Coming later');
      await expect(page.getByTestId('os-desktop')).toBeVisible();
      expect(await windowIds(page)).not.toContain(id);
    }
  });

  test('@route_unknown an unknown path lands on the desktop with a Not found notice', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await gotoShell(page, '/not-a-real-app');
    await expect(page.getByTestId('os-toasts')).toContainText('does not exist');
    await expect(page.getByTestId('os-desktop')).toBeVisible();
  });

  test('@route_credits /credits redirects to the About page of Settings', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await gotoShell(page, '/credits');
    await expect(page).toHaveURL(/\/settings\/about/);
    await expect(frame(page, 'settings')).toBeVisible();
  });

  test('@route_broker_ticker a Broker link to the ticker already on screen focuses that Broker, and an unknown ticker is refused', async ({ page }) => {
    onlyIn('desktop');
    const errors = watchErrors(page);
    await boot(page);
    const ticker = await selectedTicker(page);
    const before = await brokerIds(page);
    await gotoShell(page, `/broker?t=${ticker}`);
    expect(await brokerIds(page)).toEqual(before);
    const placed = await orders(page);
    await gotoShell(page, '/broker?t=NOPE1');
    await expect(page.getByTestId('os-toasts')).toContainText('not traded in this market');
    expect(await orders(page)).toBe(placed);
    expect(errors).toEqual([]);
  });

  test('@route_no_history_spam focus changes add no history entries', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await dispatchKey(page, { code: 'Digit2', key: 'é', alt: true });
    await dispatchKey(page, { code: 'Digit3', key: '"', alt: true });
    const before = await page.evaluate(() => window.history.length);
    for (let i = 0; i < 10; i++) await dispatchKey(page, { code: 'Backquote', key: '`', alt: true });
    expect(await page.evaluate(() => window.history.length)).toBe(before);
  });

  test('@route_flags_survive the e2e, seed and intro flags stay in the URL through window changes', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.goto('/broker?e2e&seed=tape-keep&intro=off');
    await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
    await dispatchKey(page, { code: 'Digit2', key: 'é', alt: true });
    await expect(frame(page, 'portfolio')).toBeVisible();
    await dispatchKey(page, { code: 'Backquote', key: '`', alt: true });
    const url = new URL(page.url());
    expect(url.searchParams.has('e2e')).toBe(true);
    expect(url.searchParams.get('seed')).toBe('tape-keep');
    expect(url.searchParams.get('intro')).toBe('off');
  });

  test('@route_static_export the route list is finite and tickers and file ids live in the query or path only', async () => {
    test.skip(true, 'static export is not built: the app is server-backed (C-18, DECISIONS "Routing")');
  });

  test('@no_leak a research file id that this save does not have shows the same empty desk as any other id', async ({ page }) => {
    onlyIn('desktop');
    const handle = await boot(page);
    await reachRank(page, handle, 8_000_000);
    await gotoShell(page, '/research/zz-tape-missing');
    const a = await frame(page, 'research-zz-tape-missing').getByTestId('research').innerText();
    await gotoShell(page, '/research/qq-tape-other');
    const b = await frame(page, 'research-qq-tape-other').getByTestId('research').innerText();
    expect(a).toBe(b);
    await expect(frame(page, 'research-qq-tape-other').getByTestId('research-files-empty')).toBeVisible();
    expect(a).not.toMatch(/zz-tape|qq-tape/);
  });

  test('@no_leak a ticker this market does not trade shows a notice, and the Broker keeps a listed ticker', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    const ticker = await selectedTicker(page);
    await gotoShell(page, '/broker?t=ZZQ');
    await expect(page.getByTestId('os-toasts')).toContainText('ZZQ is not traded');
    const brokers = page.locator('[role="dialog"][data-testid^="win-broker"]');
    for (const el of await brokers.all()) {
      const text = await el.innerText();
      expect(text).not.toContain('ZZQ');
      expect(text).toContain(ticker);
    }
  });

  test('@share_url_clean the URL carries only the app, the view, the ticker or file, and the flags', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await dispatchKey(page, { code: 'Digit2', key: 'é', alt: true });
    await dispatchKey(page, { code: 'Digit3', key: '"', alt: true });
    const url = new URL(page.url());
    expect(url.pathname).toMatch(/^\/(?:[a-z-]+(?:\/[A-Za-z0-9._-]+)?)?$/);
    for (const key of url.searchParams.keys()) {
      expect(['e2e', 'seed', 'fresh', 'intro', 'world', 't', 'file']).toContain(key);
    }
    expect(url.search).not.toMatch(/qty|price|side|pnl|position|player/i);
  });

  test('@title_meta_clean the page title and description show no holdings, P&L or net worth', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    const title = await page.title();
    expect(title).not.toMatch(/\$|%|P&L|net worth|holding/i);
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc ?? '').not.toMatch(/\$|%/);
  });

  test('@link_carries_no_state the route formats carry only the app, the view, the ticker, the file and the flags', () => {
    onlyIn('desktop');
    for (const app of Object.keys(APPS) as AppId[]) {
      const views = APPS[app].views;
      const out = formatRoute({ app, props: {}, flags: { e2e: true, seed: 's' } });
      expect(out).toMatch(/^\/[a-z-]+(\?.*)?$/);
      for (const v of views) expect(formatRoute({ app, view: v, props: {}, flags: {} })).toBe(`/${app}/${v}`);
    }
    // An extra query value (a quantity, a price, a side) is ignored on parse, so no state rides in a link.
    const parsed = parseRoute('/broker/HLCN?qty=5&price=10&side=buy&player=p1');
    expect(parsed).toMatchObject({ app: 'broker', props: { ticker: 'HLCN' } });
    expect(JSON.stringify(parsed)).not.toMatch(/qty|price|side|player/);
  });

  test('@link_carries_no_state a Broker ticker in the format is the only data a link can hold', () => {
    onlyIn('desktop');
    const out = formatRoute({ app: 'broker', props: { ticker: 'HLCN', qty: 9 } as unknown as { ticker: string }, flags: {} });
    expect(out).toBe('/broker/HLCN');
  });

  test('@toast_notice a notice from a refused link stays readable in the toast column', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await gotoShell(page, '/not-a-real-app');
    expect(await toastText(page)).toContain('does not exist');
  });
});
