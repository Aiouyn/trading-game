import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from '@/game/store';
import { MAX_BROKERS } from '@/shell/apps';
import { makeWmCtx } from '@/shell/ctx';
import { readPrefs } from '@/shell/prefs';
import { initialShell, project, type Win } from '@/shell/wm';
import { retargetPhoneBroker, usePhone } from './phoneStore';
import { bindShell, browserKv, retargetBroker, runCommand, useFocusHint, useRecent, useShell } from './shellStore';

const ctx = makeWmCtx('R3');
const vp = { w: 1920, h: 1080 };
const tickers = useGame.getState().config.assets.slice(0, MAX_BROKERS + 1).map((a) => a.id);
const [first, second, third] = tickers;
const index = useGame.getState().config.indices[0]!.id;
const select = vi.fn((selected: string) => useGame.setState({ selected }));
const replaceState = vi.fn();
const pushState = vi.fn();

function broker(id: string, ticker: string): Win {
  return { id, app: 'broker', ws: 0, rect: { x: 17, y: 31, w: 950, h: 700 },
    slot: { custom: { x: 0, y: 0, w: 0.5, h: 1 } }, state: 'open', filled: false, props: { ticker } };
}

beforeEach(() => {
  vi.clearAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) },
    location: { search: '?e2e&seed=7&t=' + first },
    history: { state: { tgPhone: { app: 'broker', props: { ticker: first } }, depth: 2 }, replaceState, pushState },
  });
  vi.spyOn(useGame.getState(), 'select').mockImplementation(select);
  useGame.setState({ selected: first });
  bindShell('broker-retarget-test', 'R3', vp, first);
  useShell.getState().replace({ ...initialShell(vp, ctx, first), wins: [broker('broker-1', first), broker('broker-2', second),
    { id: 'wire', app: 'wire', ws: 0, rect: { x: 1100, y: 0, w: 500, h: 600 }, slot: null, state: 'open', filled: false, props: {} }] });
  useRecent.setState({ items: [] });
  useFocusHint.setState({ id: 'wire' });
  usePhone.setState({ stack: [{ app: 'broker', props: { ticker: first }, tick: 10 }, { app: 'wire', props: {}, tick: 9 }], current: 'broker', recentOpen: false });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Broker picks in the desktop shell', () => {
  it('retargets the exact Broker even when another already shows that ticker, preserving placement and z-order', () => {
    const before = useShell.getState().shell;
    const projection = project(before);
    expect(retargetBroker('broker-1', second)).toBe(true);
    const after = useShell.getState().shell;
    expect(after.wins.map((w) => w.id)).toEqual(before.wins.map((w) => w.id));
    expect(after.wins[0]).toEqual({ ...before.wins[0], props: { ticker: second } });
    expect(after.wins[0]!.rect).toBe(before.wins[0]!.rect);
    expect(after.wins[0]!.slot).toBe(before.wins[0]!.slot);
    expect(after.wins[1]).toBe(before.wins[1]);
    expect(after.wins[2]).toBe(before.wins[2]);
    expect(project(after)).toEqual(projection);
    expect({ ...after, wins: [] }).toEqual({ ...before, wins: [] });
    expect(useFocusHint.getState().id).toBe('wire');
    expect(select).toHaveBeenCalledExactlyOnceWith(second);
    expect(useRecent.getState().items).toEqual([{ app: 'broker', ticker: second }]);
    expect(readPrefs(browserKv()).shells['broker-retarget-test']).toEqual(after);
  });

  it('retargets at the Broker cap, including a collapsed Broker on another workspace', () => {
    const store = useShell.getState();
    const wins = tickers.slice(0, MAX_BROKERS).map((ticker, i) => broker(`broker-${i + 1}`, ticker));
    wins[0] = { ...wins[0]!, ws: 1, state: 'collapsed', filled: true };
    store.replace({ ...store.shell, wins });
    const before = useShell.getState().shell;
    expect(retargetBroker('broker-1', tickers[MAX_BROKERS]!)).toBe(true);
    const after = useShell.getState().shell;
    expect(after.wins).toHaveLength(MAX_BROKERS);
    expect(after.wins[0]).toEqual({ ...wins[0], props: { ticker: tickers[MAX_BROKERS] } });
    after.wins.slice(1).forEach((w, i) => expect(w).toBe(before.wins[i + 1]));
    expect(after.activeWs).toBe(before.activeWs);
  });

  it('accepts an index ticker', () => {
    expect(retargetBroker('broker-1', index)).toBe(true);
    expect(useShell.getState().shell.wins[0]!.props.ticker).toBe(index);
  });

  it.each([['missing', second], ['wire', second], ['broker-1', 'UNKNOWN!'], ['broker-1', ''], ['broker-1', first]])(
    'rejects or leaves unchanged %s -> %s without selection, focus, recent or persistence effects', (id, ticker) => {
      const before = useShell.getState().shell;
      const prefs = readPrefs(browserKv());
      expect(retargetBroker(id, ticker)).toBe(false);
      expect(useShell.getState().shell).toBe(before);
      expect(select).not.toHaveBeenCalled();
      expect(useFocusHint.getState().id).toBe('wire');
      expect(useRecent.getState().items).toEqual([]);
      expect(readPrefs(browserKv())).toEqual(prefs);
    },
  );

  it('keeps explicit New Broker fresh even for a ticker already open', () => {
    const before = useShell.getState().shell;
    runCommand('new-broker', first);
    const after = useShell.getState().shell;
    expect(after.wins.filter((w) => w.app === 'broker')).toHaveLength(3);
    expect(after.wins.filter((w) => w.props.ticker === first)).toHaveLength(2);
    expect(after.wins.some((w) => !before.wins.some((old) => old.id === w.id))).toBe(true);
    expect(after.wins.find((w) => w.id === 'broker-2')!.props.ticker).toBe(second);
  });
});

describe('Broker picks on the phone', () => {
  it('replaces only the current Broker entry and history ticker, preserving Back depth and desktop windows', () => {
    const desktop = useShell.getState().shell;
    const before = usePhone.getState();
    expect(retargetPhoneBroker(second)).toBe(true);
    const after = usePhone.getState();
    expect(after.stack).toHaveLength(2);
    expect(after.stack[0]).toEqual({ ...before.stack[0], props: { ticker: second } });
    expect(after.stack[1]).toBe(before.stack[1]);
    expect(after.current).toBe('broker');
    expect(useShell.getState().shell).toBe(desktop);
    expect(replaceState).toHaveBeenCalledExactlyOnceWith({ tgPhone: { app: 'broker', props: { ticker: second } }, depth: 2 }, '', `/broker?e2e=&seed=7&t=${second}`);
    expect(pushState).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledExactlyOnceWith(second);
  });

  it.each(['UNKNOWN!', '', first])('does not change an invalid or unchanged phone ticker: %s', (ticker) => {
    const before = usePhone.getState();
    expect(retargetPhoneBroker(ticker)).toBe(false);
    expect(usePhone.getState()).toBe(before);
    expect(replaceState).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('refuses a pick from a hidden or missing Broker instead of opening an app', () => {
    usePhone.setState({ current: 'wire' });
    const hidden = usePhone.getState();
    expect(retargetPhoneBroker(third)).toBe(false);
    expect(usePhone.getState()).toBe(hidden);
    usePhone.setState({ current: 'broker', stack: [] });
    const missing = usePhone.getState();
    expect(retargetPhoneBroker(third)).toBe(false);
    expect(usePhone.getState()).toBe(missing);
    expect(replaceState).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });
});
