import { expect, test, type Page, type WebSocket } from '@playwright/test';
import { goTo, grant, isPhone, register, skipRankUp, skipTips, WORLD, watchErrors } from './helpers';

// The no-reveal checks L1 to L6 (docs/team/specs/tape-acceptance.md section 12, as amended by docs/V1-PRIVACY.md section 4 and
// section 6). A player's market activity is private: positions, orders, P&L curves, style and bots never reach another client.

/** L1: the only localStorage keys (P6) and the only sessionStorage key. */
const LOCAL_KEYS = ['tg-prefs', 'tg-token', 'tg-device']; // tg-device: the random per-browser id (V1-PRIVACY.md section 4)
const SESSION_KEYS = ['tg-replay-intro'];

/** Keys that carry a market position, an order, a P&L curve, a trade or a style. None may reach another client. */
// Realized P&L on the Trader board is public by design (docs/V1-PRIVACY.md section 7, R4): it is an outcome, never a holding.
const PRIVATE_KEYS = new Set([
  'positions', 'orders', 'openOrders', 'fills', 'trips', 'tripLog', 'ghosts', 'plans', 'opt', 'pos',
  'pnlCurve', 'tradeHistory', 'journal', 'percentile', 'shorts', 'margin', 'cash', 'orderHistory',
  // a holding under another name: quantities, lots, cost basis and open P&L (no public view carries them; the L3 test checks
  // every frame type). 'realized' is not listed: the Trader board's realized P&L is public by design (R4).
  'qty', 'lots', 'units', 'avgCost', 'costBasis', 'unrealized', 'openPnl', 'entryPrice', 'liquidationPrice',
]);

/** every key (at any depth) of a parsed frame, skipping the viewer's own subtree (`me`), which is that viewer's to see */
function privateKeysIn(value: unknown, path = ''): string[] {
  if (value === null || typeof value !== 'object') return [];
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => found.push(...privateKeysIn(v, `${path}[${i}]`)));
    return found;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === 'me' || k === 'inbox') continue;
    if (PRIVATE_KEYS.has(k)) found.push(`${path}.${k}`);
    found.push(...privateKeysIn(v, `${path}.${k}`));
  }
  return found;
}

/** The frame as the viewer may read it: an nw-history reply's ghosts are the requester's own series (see the L3 and L4 test) */
function ownFrameView(f: unknown): unknown {
  const m = f as { t?: string; data?: Record<string, unknown> };
  if (m.t !== 'nw-history' || !m.data) return f;
  const data = { ...m.data };
  delete data.ghosts;
  return { ...m, data };
}

/** Records every frame a page receives from the world server, parsed. */
function recordFrames(page: Page): unknown[] {
  const frames: unknown[] = [];
  page.on('websocket', (ws: WebSocket) => {
    ws.on('framereceived', (e) => {
      try { frames.push(JSON.parse(String(e.payload))); } catch { /* binary or not JSON: nothing to inspect */ }
    });
  });
  return frames;
}

test('L1: localStorage holds only tg-prefs and tg-token, sessionStorage only the replay flag, and no database is written', async ({ page }) => {
  test.skip(isPhone(page), 'storage is the same on both layouts: checked once on the desktop');
  const errors = watchErrors(page);
  const handle = await register(page);
  await skipTips(page);
  await grant(handle, 30_000);
  await skipRankUp(page);
  await goTo(page, 'portfolio');
  await goTo(page, 'wire');
  await goTo(page, 'portfolio');
  const store = await page.evaluate(async () => {
    const dbs = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    return {
      local: Object.keys(localStorage),
      localValues: Object.values(localStorage),
      session: Object.keys(sessionStorage),
      dbs: dbs.map((d) => d.name ?? ''),
    };
  });
  for (const k of store.local) expect(LOCAL_KEYS, `localStorage key ${k}`).toContain(k);
  for (const k of store.session) expect(SESSION_KEYS, `sessionStorage key ${k}`).toContain(k);
  expect(store.dbs).toEqual([]);
  // no position, trade or replay value is written to any browser storage
  for (const v of store.localValues) expect(/"(positions|fills|trips|replay)"/.test(v), 'storage value').toBe(false);
  expect(errors).toEqual([]);
});

test('L2: the page talks only to the app origin and the world server; nothing is posted to a third party', async ({ page, baseURL }) => {
  test.skip(isPhone(page), 'network is the same on both layouts: checked once on the desktop');
  const app = new URL(baseURL ?? 'http://localhost:3200').origin;
  const world = new URL(WORLD).origin;
  const hosts: string[] = [];
  page.on('request', (r) => hosts.push(r.url()));
  page.on('websocket', (ws) => hosts.push(ws.url()));
  const handle = await register(page);
  await skipTips(page);
  await grant(handle, 30_000);
  await skipRankUp(page);
  await goTo(page, 'portfolio');
  await goTo(page, 'wire');
  await page.waitForTimeout(1_500);
  const foreign = hosts.filter((u) => {
    if (u.startsWith('data:') || u.startsWith('blob:')) return false;
    const origin = new URL(u.replace(/^ws(s?):/, 'http$1:')).origin;
    return origin !== app && origin !== world && origin.replace(/^http/, 'ws') !== world.replace(/^http/, 'ws');
  });
  expect(foreign).toEqual([]);
});

test('L3 and L4: no frame a rival or another player receives carries a position, an order, a P&L curve, a trade or a style', async ({ browser }) => {
  // two players: A trades, B watches. Every frame B receives is inspected (the world's welcome, tick, ack, history and chat).
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    const errorsB = watchErrors(b);
    const framesB = recordFrames(b);
    const framesA = recordFrames(a);
    const handleA = await register(a, 'lkA');
    await skipTips(a);
    await grant(handleA, 30_000);
    await skipRankUp(a);
    await goTo(a, 'broker');
    await a.getByTestId('order-qty').fill('3');
    await a.getByTestId('order-submit').click();
    await expect(a.getByTestId('position-HLCN')).toBeVisible({ timeout: 20_000 });
    await register(b, 'lkB');
    await skipTips(b);
    await goTo(b, 'wire');
    await goTo(b, 'portfolio');
    await b.waitForTimeout(3_000);
    expect(framesB.length).toBeGreaterThan(0);
    // every server message type B receives is checked in full (welcome, tick, ack, chat, history, nw-history, panel, pong, error,
    // daily). A reply (ack, history, nw-history) answers B's own request, so its own subtree (`me`, `inbox`) is B's to see,
    // and the rest of it is public. A panel reply is the public boards or directory (R-9-12), the same content the push carried.
    // The types seen are listed so a new type cannot slip past unexamined.
    const types = [...new Set(framesB.map((f) => (f as { t?: string }).t ?? '?'))].sort();
    expect(types).toEqual(expect.arrayContaining(['welcome', 'tick']));
    for (const t of types) expect(['welcome', 'tick', 'ack', 'chat', 'history', 'nw-history', 'panel', 'pong', 'error', 'daily'], `frame type ${t}`).toContain(t);
    // an nw-history reply goes only to the socket that asked (server/index.ts, nwHistoryFor(c.pid)), and its ghosts are the
    // requester's own equity and benchmark series (protocol.ts): B's own data, not a leak to B. Every other key is checked.
    const leaks = framesB.flatMap((f) => privateKeysIn(ownFrameView(f)));
    expect(leaks).toEqual([]);
    // the viewer's own player id is B's; A's id is never in a frame B receives unless it is inside a public record.
    // The public directory (every player's row, protocol.ts `directory`) and the public state (`pub`) are such records:
    // the world attaches them to some ticks only, so they are left out of the search, and every other part of a tick is checked.
    const aId = (framesA.find((f) => (f as { t?: string }).t === 'welcome') as { playerId?: string } | undefined)?.playerId;
    expect(aId, 'A received a welcome').toBeTruthy();
    // A panel reply (R-9-12) is a public record in its `data` (the boards, or the directory with B's rows), so its `data` is left out of
    // the id search exactly as `pub` and `directory` are on a tick. Its envelope (t, id, panel, v) is searched, and privateKeysIn above
    // still reads its `data` for private keys.
    const publicRecords = new Set(['pub', 'directory']);
    const withoutPublic = (f: unknown) => {
      const m = f as { t?: string };
      if (m.t === 'panel') return Object.fromEntries(Object.entries(f as object).filter(([k]) => k !== 'data'));
      return Object.fromEntries(Object.entries(f as object).filter(([k]) => !publicRecords.has(k)));
    };
    const aIdHits = framesB.filter((f) => (f as { t?: string }).t !== 'welcome' && JSON.stringify(withoutPublic(f)).includes(`"${aId}"`));
    expect(aIdHits.map((f) => (f as { t?: string }).t)).toEqual([]);
    expect(errorsB).toEqual([]);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('L5: after a run-file export there is exactly one download and nothing else is stored or sent', async ({ page, baseURL }) => {
  // The run file (M11) is a click on the practice Files tab: the export builds one JSON file in the browser and saves it.
  test.skip(isPhone(page), 'the export is the same component on both layouts: checked once on the desktop');
  const errors = watchErrors(page);
  const app = new URL(baseURL ?? 'http://localhost:3200').origin;
  const world = new URL(WORLD).origin;
  const handle = await register(page);
  await skipTips(page);
  await grant(handle, 30_000);
  await skipRankUp(page);
  await goTo(page, 'learn');
  await page.getByTestId('tab-practice').click();
  await page.getByTestId('practice-open').click();
  await expect(page.getByTestId('practice-desk')).toBeVisible();
  await page.getByTestId('tab-files').click();

  const storage = () => page.evaluate(async () => {
    const dbs = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    return { local: { ...localStorage }, session: { ...sessionStorage }, dbs: dbs.map((d) => d.name ?? '') };
  });
  const before = await storage();
  const downloads: string[] = [];
  const requests: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  page.on('request', (r) => requests.push(r.url()));
  // the export's own request mark: everything after the click
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('run-export').click()]);
  await page.waitForTimeout(1_500);

  expect(downloads, 'exactly one download').toHaveLength(1);
  expect(dl.suggestedFilename()).toMatch(/^practice-run-[a-z-]+-.+\.json$/);
  expect(await storage(), 'no storage change beyond the save').toEqual(before);
  const foreign = requests.filter((u) => {
    if (u.startsWith('data:') || u.startsWith('blob:')) return false;
    const origin = new URL(u.replace(/^ws(s?):/, 'http$1:')).origin;
    return origin !== app && origin !== world;
  });
  expect(foreign, 'no request to a third party').toEqual([]);
  expect(errors).toEqual([]);
});

test.skip('L6: a tournament autopsy appears only after the player opts in on that entry', () => {
  // N/A (tape-acceptance.md section 12, L6): there is no tournament in this release.
});
