import { describe, expect, it } from 'vitest';
import type { AppId } from './apps';
import { type LauncherSource, LIMITS, flatItems, resultId, searchLauncher } from './launcher';

const src: LauncherSource = {
  apps: [
    { app: 'broker', name: 'Broker', locked: false },
    { app: 'portfolio', name: 'Portfolio', locked: false },
    { app: 'research', name: 'Research Desk', locked: true, sub: 'opens at Operator' },
    { app: 'wire', name: 'Wire', locked: false },
  ],
  tickers: [
    { id: 'HLCN', name: 'Halcyon Naval', price: 84.62, changePct: 0.012 },
    { id: 'PAVR', name: 'Port Avalon Rail', price: 12.1, changePct: -0.004 },
    { id: 'MERI', name: 'Meridian Oil' },
  ],
  commands: [
    { cmd: 'trade', label: 'Trade layout' },
    { cmd: 'focus', label: 'Focus mode' },
    { cmd: 'new-broker', label: 'New Broker window' },
  ],
  recent: [{ app: 'broker', ticker: 'HLCN', label: 'HLCN' }],
};

const kinds = (groups: ReturnType<typeof searchLauncher>) => groups.map((g) => g.kind);

describe('launcher search (P2-075..P2-080)', () => {
  it('an empty query shows every group in spec order, each short', () => {
    const groups = searchLauncher('', src);
    expect(kinds(groups)).toEqual(['app', 'ticker', 'command', 'recent']);
    expect(groups[0]!.items.map((i) => i.label)).toEqual(['Broker', 'Portfolio', 'Research Desk', 'Wire']);
    expect(groups[1]!.items.map((i) => i.label)).toEqual(['HLCN', 'PAVR', 'MERI']);
  });

  it('matches case-insensitively on the label, the id and the name', () => {
    expect(searchLauncher('port', src)[0]!.items.map((i) => i.label)).toEqual(['Portfolio']);
    const tickers = searchLauncher('halc', src).find((g) => g.kind === 'ticker')!;
    expect(tickers.items.map((i) => i.label)).toEqual(['HLCN']);
    expect(searchLauncher('PAV', src).find((g) => g.kind === 'ticker')!.items.map((i) => i.label)).toEqual(['PAVR']);
  });

  it('ranks a prefix match above an inner match', () => {
    const rows = [
      { app: 'wire' as AppId, name: 'Newswire', locked: false },
      { app: 'broker' as AppId, name: 'Broker', locked: false },
    ];
    const groups = searchLauncher('wi', { ...src, apps: rows });
    expect(groups[0]!.items.map((i) => i.label)).toEqual(['Newswire']);
    const r2 = searchLauncher('re', { ...src, apps: [{ app: 'wire', name: 'Wire', locked: false }, { app: 'research', name: 'Research Desk', locked: false }] });
    // "Wire" holds "re" inside, so it follows the prefix match.
    expect(r2[0]!.items.map((i) => i.label)).toEqual(['Research Desk', 'Wire']);
  });

  it('keeps the caps per group, and numbers each group from 1', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `T${i}`, name: `Stock ${i}` }));
    const groups = searchLauncher('stock', { ...src, tickers: many });
    const t = groups.find((g) => g.kind === 'ticker')!;
    expect(t.items).toHaveLength(LIMITS.ticker);
    expect(t.items.map((i) => i.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(resultId(t.items[0]!)).toBe('os-launcher-result-ticker-1');
  });

  it('an empty query lists every app and command, and a query caps them', () => {
    const apps = Array.from({ length: 12 }, (_, i) => ({ app: 'wire' as AppId, name: `App ${i}`, locked: false }));
    const all = searchLauncher('', { ...src, apps });
    expect(all[0]!.items).toHaveLength(12);
    const some = searchLauncher('app', { ...src, apps });
    expect(some[0]!.items).toHaveLength(LIMITS.app);
  });

  it('drops empty groups, so a query that matches one thing shows one group', () => {
    const groups = searchLauncher('oil', src);
    expect(kinds(groups)).toEqual(['ticker']);
    expect(groups[0]!.items[0]!.action).toEqual({ type: 'ticker', ticker: 'MERI' });
  });

  it('a query with no match gives no rows at all', () => {
    expect(searchLauncher('zzzz', src)).toEqual([]);
    expect(flatItems(searchLauncher('zzzz', src))).toEqual([]);
  });

  it('a locked app stays in the list, flagged, with the unlock line in its sub-label', () => {
    const row = searchLauncher('research', src)[0]!.items[0]!;
    expect(row.locked).toBe(true);
    expect(row.sub).toBe('opens at Operator');
  });

  it('the keyboard order is group order, top to bottom', () => {
    const items = flatItems(searchLauncher('', src));
    expect(items.map((i) => i.kind)).toEqual(['app', 'app', 'app', 'app', 'ticker', 'ticker', 'ticker', 'command', 'command', 'command', 'recent']);
  });

  it('a recent row points at its app or its ticker', () => {
    const recent = searchLauncher('', src).find((g) => g.kind === 'recent')!;
    expect(recent.items[0]!.action).toEqual({ type: 'recent', app: 'broker', ticker: 'HLCN' });
  });
});
