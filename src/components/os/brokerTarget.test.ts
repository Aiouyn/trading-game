import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from '@/game/store';
import { makeWmCtx } from '@/shell/ctx';
import { focusedId, initialShell } from '@/shell/wm';
import { MAX_BROKERS } from '@/shell/apps';
import { closeWindow, dispatchWm, openApp, pickBroker, retargetBroker, useShell, useFocusHint } from './shellStore';

// The Broker window rules (track A): a Broker that has the focus changes its ticker in place on a plain open, a pick or Alt N;
// a new window opens only for an explicit fresh open; a ticker another Broker shows focuses that Broker; and closing a window
// never issues an order.

// closeWindow keeps the window's ghost for its close animation (window.setTimeout): the node test has no window, so it is stubbed here.
vi.stubGlobal('window', globalThis);

const TICKERS = ['HLCN', 'NRON', 'GX', 'AVBK', 'ZETA', 'KRYO'];

function resetShell(): void {
  const ctx = makeWmCtx('R0', () => false);
  useShell.getState().setCtx(ctx);
  useShell.getState().replace(initialShell({ w: 1440, h: 900 }, ctx));
}

function brokers() {
  return useShell.getState().shell.wins.filter((w) => w.app === 'broker');
}

function focusedWin() {
  const id = focusedId(useShell.getState().shell);
  return useShell.getState().shell.wins.find((w) => w.id === id);
}

beforeEach(() => {
  useGame.setState({
    config: { ...useGame.getState().config, assets: TICKERS.map((id) => ({ id })) as never, indices: [] as never },
    selected: 'HLCN',
    toasts: [],
  });
  useFocusHint.setState({ id: null });
  resetShell();
});

describe('a plain Broker open changes the focused Broker in place', () => {
  it('a Broker in focus takes the new ticker and keeps its window, its place and its count', () => {
    openApp('broker', { ticker: 'HLCN' }, { focus: true });
    const win = focusedWin()!;
    const rect = { ...win.rect };
    openApp('broker', { ticker: 'NRON' }, { focus: true });
    expect(brokers()).toHaveLength(1);
    expect(brokers()[0]!.id).toBe(win.id);
    expect(brokers()[0]!.props.ticker).toBe('NRON');
    expect(brokers()[0]!.rect).toEqual(rect);
    expect(useGame.getState().selected).toBe('NRON');
  });

  it('a ticker another Broker already shows focuses that Broker, and no window changes its ticker', () => {
    openApp('broker', { ticker: 'HLCN' }, { focus: true });
    openApp('broker', { ticker: 'NRON' }, { focus: true, fresh: true });
    expect(brokers()).toHaveLength(2);
    const hlcn = brokers().find((w) => w.props.ticker === 'HLCN')!;
    // the focused Broker shows NRON; a plain open of HLCN focuses the Broker that holds it
    openApp('broker', { ticker: 'HLCN' }, { focus: true });
    expect(brokers()).toHaveLength(2);
    expect(focusedWin()?.id).toBe(hlcn.id);
    expect(brokers().map((w) => w.props.ticker).sort()).toEqual(['HLCN', 'NRON']);
  });

  it('a fresh open is the only way a second window of a ticker opens, even on a ticker already shown', () => {
    openApp('broker', { ticker: 'HLCN' }, { focus: true });
    openApp('broker', { ticker: 'HLCN' }, { focus: true, fresh: true });
    expect(brokers()).toHaveLength(2);
    expect(brokers().every((w) => w.props.ticker === 'HLCN')).toBe(true);
  });

  it('with no Broker in focus a plain open still opens a new Broker window', () => {
    openApp('broker', { ticker: 'HLCN' }, { focus: true });
    const wire = useShell.getState().shell.wins.find((w) => w.app === 'wire');
    if (wire) dispatchWm({ type: 'focus', id: wire.id });
    openApp('broker', { ticker: 'AVBK' }, { focus: true });
    expect(brokers()).toHaveLength(2);
    expect(brokers().map((w) => w.props.ticker).sort()).toEqual(['AVBK', 'HLCN']);
  });

  it('at the cap, a plain open with a Broker in focus changes that Broker in place and says nothing', () => {
    for (let i = 0; i < MAX_BROKERS; i++) openApp('broker', { ticker: TICKERS[i]! }, { focus: true, fresh: true });
    expect(brokers()).toHaveLength(MAX_BROKERS);
    const focus = focusedWin()!;
    openApp('broker', { ticker: 'ZETA' }, { focus: true });
    expect(brokers()).toHaveLength(MAX_BROKERS);
    expect(brokers().find((w) => w.id === focus.id)!.props.ticker).toBe('ZETA');
    expect(useGame.getState().toasts.some((t) => t.text.includes('least recently used'))).toBe(false);
  });

  it('a Broker picked from inside a window changes that window, and a pick of a shown ticker focuses its holder', () => {
    openApp('broker', { ticker: 'HLCN' }, { focus: true });
    const first = brokers()[0]!;
    openApp('broker', { ticker: 'NRON' }, { focus: true, fresh: true });
    pickBroker(first.id, 'GX');
    expect(brokers().find((w) => w.id === first.id)!.props.ticker).toBe('GX');
    pickBroker(first.id, 'NRON');
    expect(brokers()).toHaveLength(2);
    expect(focusedWin()?.props.ticker).toBe('NRON');
  });

  it('retargetBroker moves only a Broker window and leaves other windows alone', () => {
    openApp('broker', { ticker: 'HLCN' }, { focus: true });
    const wire = useShell.getState().shell.wins.find((w) => w.app === 'wire')!;
    expect(retargetBroker(wire.id, 'GX')).toBe(false);
    expect(useShell.getState().shell.wins.find((w) => w.id === wire.id)!.props).toEqual(wire.props);
  });
});

describe('closing a Broker window never touches the account', () => {
  it('a close issues no game command, so no order is cancelled and no position is sold', () => {
    openApp('broker', { ticker: 'HLCN' }, { focus: true });
    const act = vi.fn();
    const before = useGame.getState().me;
    useGame.setState({ act: act as never });
    const id = brokers()[0]!.id;
    closeWindow(id);
    expect(act).not.toHaveBeenCalled();
    expect(useShell.getState().shell.wins.some((w) => w.id === id)).toBe(false);
    expect(useGame.getState().me).toBe(before);
  });
});
