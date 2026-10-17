import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Win } from '@/shell/wm';

const mocks = vi.hoisted(() => ({ desktop: vi.fn(), phone: vi.fn(), select: vi.fn(), state: vi.fn() }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: vi.fn(), useRef: (current: unknown) => ({ current }),
  useState: (value: unknown) => [value, vi.fn()],
}));
vi.mock('@/components/os/shellStore', () => ({ retargetBroker: mocks.desktop }));
vi.mock('@/components/os/phoneStore', () => ({ retargetPhoneBroker: mocks.phone }));
vi.mock('@/game/store', async (original) => ({
  ...await original<typeof import('@/game/store')>(),
  useGame: Object.assign((select: (s: unknown) => unknown) => select(mocks.state()), { getState: () => mocks.state() }),
}));
vi.mock('@/engine', async (original) => ({
  ...await original<typeof import('@/engine')>(), commission: () => 0,
  portfolio: () => ({ cash: 100, unrealizedPnl: 2, positions: [{ assetId: 'GX', qty: 2, avgCost: 9, price: 10, marketValue: 20, unrealizedPnl: 2, unrealizedPct: 0.1, weight: 0.2 }] }),
}));
import { useGame } from '@/game/store';
import { Positions } from '@/components/Holdings';
import { AppBody } from '@/components/os/appViews';
import { BrokerApp } from './BrokerApp';
import { BrokerDock } from './BrokerDock';
import { TerminalLayout, TerminalNarrow } from './TerminalLayout';
import { Universe } from './Universe';

type Node = ReactElement<Record<string, unknown>>;
function find(tree: unknown, predicate: (node: Node) => boolean): Node | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) { const found = find(child, predicate); if (found) return found; }
    return;
  }
  if (tree === null || typeof tree !== 'object' || !('props' in tree)) return;
  const node = tree as Node;
  return predicate(node) ? node : find(node.props.children, predicate);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Keep the real live-universe definitions; the fixture only replaces UI state and trading data.
  const config = useGame.getState().config;
  mocks.state.mockReturnValue({ config, selected: 'HLCN', tradeSheetOpen: false, setTradeSheet: vi.fn(),
    world: {}, me: { orders: [], account: { options: {} }, trading: { fills: [] }, player: { stats: { trades: 1 }, rankId: 'R0' } },
    playerId: 'me', select: mocks.select, act: vi.fn(), history: {} });
});

describe('Broker symbol navigation wiring', () => {
  it.each([false, true])('AppBody passes the exact window identity and phone=%s', (phone) => {
    const win: Win = { id: 'broker-7', app: 'broker', props: { ticker: 'HLCN' }, ws: 0, rect: { x: 0, y: 0, w: 1200, h: 800 }, slot: null, filled: false, state: 'open' };
    const body = AppBody({ win, size: win.rect, phone }) as ReactElement<Parameters<typeof BrokerApp>[0]>;
    expect(body.type).toBe(BrokerApp);
    expect(body.props).toMatchObject({ winId: 'broker-7', ticker: 'HLCN', phone });
  });

  it('the terminal watchlist retargets its own Broker', () => {
    const tree = BrokerApp({ ticker: 'HLCN', size: { w: 1200, h: 800 }, winId: 'broker-7' });
    const layout = find(tree, (n) => n.type === TerminalLayout)!;
    const watchlist = layout.props.watchlist as ReactElement<Parameters<typeof Universe>[0]>;
    watchlist.props.onPick('GX');
    expect(mocks.desktop).toHaveBeenCalledExactlyOnceWith('broker-7', 'GX');
    expect(mocks.phone).not.toHaveBeenCalled();
  });

  it.each([false, true])('narrow Markets and dock position picks route to phone=%s', (phone) => {
    const tree = BrokerApp({ ticker: 'HLCN', size: { w: 600, h: 800 }, winId: 'broker-7', phone });
    const layout = find(tree, (n) => n.type === TerminalNarrow)!;
    const dock = layout.props.dock as ReactElement<Parameters<typeof BrokerDock>[0]>;
    const markets = BrokerDock({ ...dock.props, tab: 'markets' });
    const universe = find(markets, (n) => n.type === Universe)! as ReactElement<Parameters<typeof Universe>[0]>;
    universe.props.onPick('GX');
    const positions = BrokerDock({ ...dock.props, tab: 'positions' });
    const holdings = find(positions, (n) => n.type === Positions)! as ReactElement<Parameters<typeof Positions>[0]>;
    const table = Positions(holdings.props);
    const row = find(table, (n) => n.props['data-testid'] === 'position-GX')!;
    const symbol = find(row, (n) => n.type === 'button' && n.props.className === 'text-left')!;
    (symbol.props.onClick as () => void)();
    if (phone) {
      expect(mocks.phone.mock.calls).toEqual([['GX'], ['GX']]);
      expect(mocks.desktop).not.toHaveBeenCalled();
    } else {
      expect(mocks.desktop.mock.calls).toEqual([['broker-7', 'GX'], ['broker-7', 'GX']]);
      expect(mocks.phone).not.toHaveBeenCalled();
    }
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('the short-layout list keeps the owning Broker identity', () => {
    const tree = BrokerApp({ ticker: 'HLCN', size: { w: 600, h: 500 }, winId: 'broker-7' });
    const universe = find(tree, (n) => n.type === Universe)! as ReactElement<Parameters<typeof Universe>[0]>;
    universe.props.onPick('GX');
    expect(mocks.desktop).toHaveBeenCalledExactlyOnceWith('broker-7', 'GX');
  });

  it('standalone Portfolio positions retain the selection fallback', () => {
    const tree = Positions({ bare: true });
    const row = find(tree, (n) => n.props['data-testid'] === 'position-GX')!;
    const symbol = find(row, (n) => n.type === 'button' && n.props.className === 'text-left')!;
    (symbol.props.onClick as () => void)();
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith('GX');
    expect(mocks.desktop).not.toHaveBeenCalled();
    expect(mocks.phone).not.toHaveBeenCalled();
  });
});
