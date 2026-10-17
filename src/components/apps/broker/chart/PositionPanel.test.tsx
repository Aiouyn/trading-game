import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartDrawing } from '@/world/drawings';

const mocks = vi.hoisted(() => ({
  entry: 'market', busy: false, act: vi.fn(), toast: vi.fn(), commit: vi.fn(),
  state: vi.fn(), drawingState: vi.fn(), setBusy: vi.fn(), buyingPower: 1000,
}));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => initial === 'market' ? [mocks.entry, vi.fn()] : initial === false ? [mocks.busy, mocks.setBusy] : [null, vi.fn()],
}));
vi.mock('@/engine', async (original) => ({
  ...await original<typeof import('@/engine')>(),
  buyingPower: () => mocks.buyingPower, estimateFill: () => ({ fee: 1 }),
}));
vi.mock('../seriesInfo', () => ({ seriesInfo: () => ({ price: 200 }) }));
vi.mock('@/game/store', () => ({ useGame: Object.assign((select: (s: unknown) => unknown) => select(mocks.state()), { getState: () => mocks.state() }) }));
vi.mock('./drawingStore', () => ({ useDrawings: { getState: () => mocks.drawingState() } }));
import { PositionPanel } from './PositionPanel';

type Node = ReactElement<{ children?: Node | Node[]; 'data-testid'?: string; disabled?: boolean; onClick?: () => Promise<void> }>;
function find(node: Node, id: string): Node | undefined {
  if (!node || typeof node !== 'object') return;
  if (node.props?.['data-testid'] === id) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children.flat(Infinity) as Node[] : [children]) {
    if (!child) continue;
    const result = find(child, id);
    if (result) return result;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.entry = 'market'; mocks.busy = false; mocks.buyingPower = 1000;
  mocks.act.mockResolvedValue({ ok: true });
  mocks.state.mockReturnValue({
    world: {}, config: { assets: [{ id: 'X', assetClass: 'stock', spreadBps: 0, qtyStep: 0.0001 }] },
    me: { account: { canShort: true }, player: { netWorth: 10_000, rankId: 'R0' } },
    playerId: 'u1', act: mocks.act, toast: mocks.toast,
  });
});

describe('position panel order commands', () => {
  for (const spec of [
    // 925 FX units cost $1000.13775: $1000 buys only 924, even though the engine allows arbitrary fractions.
    { assetClass: 'forex', entry: 1.08123, target: 1.08567, stop: 1.07912, riskUsd: 100, buyingPower: 1000, quantity: '924', capped: true, reason: 'buying-power cap' },
    { assetClass: 'forex', entry: 1.08123, target: 1.08567, stop: 1.07912, riskUsd: 100, buyingPower: 1000.13774, quantity: '924', capped: true, reason: 'just below the next whole unit' },
    { assetClass: 'forex', entry: 1.08123, target: 1.08567, stop: 1.07912, riskUsd: 100, buyingPower: 1000.13775, quantity: '925', capped: true, reason: 'exact whole-unit budget' },
    { assetClass: 'forex', entry: 1.08123, target: 1.08567, stop: 1.07912, riskUsd: 1, buyingPower: 1000, quantity: '473', capped: false, reason: 'risk cap before buying power' },
    { assetClass: 'crypto', entry: 0.5, target: 0.51, stop: 0.49, riskUsd: 1.23e-8, buyingPower: 1000, quantity: '0.00000123', capped: false, reason: 'eight-decimal risk size' },
  ] as const) {
    it(`${spec.assetClass} with an unrestricted engine step places its displayed ticket size: ${spec.reason}`, async () => {
      mocks.entry = 'limit';
      mocks.buyingPower = spec.buyingPower;
      const state = mocks.state();
      mocks.state.mockReturnValue({ ...state, config: { assets: [{ id: 'X', assetClass: spec.assetClass, spreadBps: 0, qtyStep: 0 }] } });
      const drawing: ChartDrawing = {
        id: 'grid', kind: 'long',
        points: [{ t: 10, p: spec.entry }, { t: 20, p: spec.target }, { t: 10, p: spec.stop }],
        position: { riskUsd: spec.riskUsd, riskPct: 0 },
      };
      mocks.drawingState.mockReturnValue({ byAsset: { X: [drawing] }, commit: mocks.commit });
      const tree = PositionPanel({ assetId: 'X', drawing }) as Node;
      expect(find(tree, 'position-qty')?.props.children).toBe(spec.quantity);
      expect(!!find(tree, 'position-capped')).toBe(spec.capped);
      if (spec.assetClass === 'forex') {
        const qty = Number(spec.quantity);
        const distance = spec.entry - spec.stop;
        // Independent budget/risk bounds catch rounding up, losing FX price precision, or dropping either cap.
        expect(qty * spec.entry).toBeLessThanOrEqual(spec.buyingPower);
        expect(qty * distance).toBeLessThanOrEqual(spec.riskUsd);
        if (spec.capped) expect((qty + 1) * spec.entry).toBeGreaterThan(spec.buyingPower);
        else expect((qty + 1) * distance).toBeGreaterThan(spec.riskUsd);
      }
      const button = find(tree, 'position-place')!;
      expect(button.props.disabled).toBe(false);
      await button.props.onClick!();
      await Promise.resolve();
      expect(mocks.act).toHaveBeenCalledWith({ type: 'order.place', order: {
        assetId: 'X', side: 'buy', type: 'limit', qty: Number(spec.quantity.replaceAll(',', '')), tif: 'gtc',
        limitPrice: spec.entry, takeProfit: spec.target, stopLoss: spec.stop,
      } }, { silent: true });
    });
  }

  for (const kind of ['long', 'short'] as const) {
    for (const type of ['market', 'limit', 'stop'] as const) {
      it(`${kind} ${type} sends the displayed size and both bracket prices`, async () => {
        mocks.entry = type;
        const points = [{ t: 10, p: 100 }, { t: 20, p: kind === 'long' ? 104 : 96 }, { t: 10, p: kind === 'long' ? 98 : 102 }];
        const drawing: ChartDrawing = { id: 'd1', kind, points };
        mocks.drawingState.mockReturnValue({ byAsset: { X: [drawing] }, commit: mocks.commit });
        const tree = PositionPanel({ assetId: 'X', drawing }) as Node;
        const qty = type === 'market' ? 5 : 10;
        expect(find(tree, 'position-qty')?.props.children).toBe(String(qty));
        const button = find(tree, 'position-place')!;
        expect(button.props.disabled).toBe(false);
        await button.props.onClick!();
        // The JSX click launches place() without awaiting it; drain its acknowledgement continuation.
        await Promise.resolve();
        const shift = type === 'market' ? 100 : 0;
        expect(mocks.act).toHaveBeenCalledWith({ type: 'order.place', order: {
          assetId: 'X', side: kind === 'long' ? 'buy' : 'sell', type, qty, tif: 'gtc',
          ...(type === 'limit' ? { limitPrice: 100 } : type === 'stop' ? { stopPrice: 100 } : {}),
          takeProfit: points[1]!.p + shift, stopLoss: points[2]!.p + shift,
        } }, { silent: true });
        if (type === 'market') {
          expect(mocks.commit.mock.calls[0]![1][0].points).toEqual(points.map((p) => ({ ...p, p: p.p + shift })));
        } else expect(mocks.commit).not.toHaveBeenCalled();
        expect(mocks.setBusy).toHaveBeenLastCalledWith(false);
      });
    }
  }

  it('a rejected placement keeps the drawing and releases busy state', async () => {
    const drawing: ChartDrawing = { id: 'd1', kind: 'long', points: [{ t: 10, p: 100 }, { t: 20, p: 104 }, { t: 10, p: 98 }] };
    mocks.drawingState.mockReturnValue({ byAsset: { X: [drawing] }, commit: mocks.commit });
    mocks.act.mockRejectedValueOnce(new Error('disconnected'));
    const tree = PositionPanel({ assetId: 'X', drawing }) as Node;
    await find(tree, 'position-place')!.props.onClick!();
    await Promise.resolve();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.setBusy).toHaveBeenLastCalledWith(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'loss' }));
  });
});
