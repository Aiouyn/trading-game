import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store's public panels (R-9-12): the welcome and each public tick stamp the boards and the directory, and a panel reads its
// data on demand. The client is replaced by a stub that records the handler the store passes in and answers panel reads.
const net = vi.hoisted(() => {
  const state = {
    handler: null as null | ((msg: unknown) => void),
    panelReplies: [] as Array<{ v?: number; data?: unknown; ok?: boolean; error?: string } | null>,
    panelCalls: [] as string[],
    token: 'tok' as string | null,
  };
  return state;
});

vi.mock('@/net/client', () => {
  class WorldClient {
    constructor(_token: string, handler: (msg: unknown) => void) { net.handler = handler; }
    connect(): void { /* the stub connects nothing */ }
    close(): void { /* nothing to close */ }
    history(): Promise<null> { return Promise.resolve(null); }
    panel(panel: string): Promise<{ v?: number; data?: unknown; ok?: boolean; error?: string }> {
      net.panelCalls.push(panel);
      const next = net.panelReplies.shift();
      return Promise.resolve(next ?? { ok: false, error: 'offline' });
    }
  }
  return {
    WorldClient,
    api: {},
    getToken: () => net.token,
    setToken: () => undefined,
    deviceId: () => '',
  };
});

// the universe mirror is the engine's business: the store only needs the config and the cfgSeq back
vi.mock('@/game/universe', async (orig) => {
  const real = await orig<typeof import('@/game/universe')>();
  return {
    ...real,
    absorbFrame: (cur: { config: unknown; cfgSeq: number }, _h: unknown, prev: unknown, frame: { cfgSeq: number }) => ({
      universe: { config: cur.config, cfgSeq: frame.cfgSeq }, world: prev ?? null, behind: false,
    }),
  };
});

import { useGame } from '@/game/store';

const me = {
  player: { id: 'u_1', watchlist: [] as string[], inboxUnread: 0 },
  rank: { id: 'r0', name: 'Broke', next: null, progress: 0 },
  netWorth: { total: 1000 },
  arrival: { external: 0 },
  trading: { closeSeenDay: null },
  digest: null,
  deals: [],
  country: 'FR',
};

const welcome = (tick: number, directory: unknown[]) => ({
  t: 'welcome', playerId: 'u_1', tickMs: 5000,
  frame: { tick, regime: 'calm', cfgSeq: 0, assets: [], rates: null, worldEvent: null },
  defs: [], me, pub: { boards: { nwRank: { u_1: 4 } }, wire: [], alliances: [], economy: {}, chapter: {}, hallOfFame: [], collectibles: 0, cityDemand: {}, players: 2, online: 1 },
  directory, chat: {}, serverTime: 0,
});

const tick = (t: number, extra: Record<string, unknown> = {}) => ({
  t: 'tick', frame: { tick: t, regime: 'calm', cfgSeq: 0, assets: [], rates: null, worldEvent: null }, me,
  wire: [], inbox: [], chat: [], rankUps: [], serverTime: 0, ...extra,
});

const rowA = { id: 'u_2', handle: 'ada' } as never;

beforeEach(() => {
  net.panelReplies.length = 0;
  net.panelCalls.length = 0;
  net.handler = null;
  net.token = 'tok';
  useGame.setState({ status: 'boot', panelStamp: { boards: -1, directory: -1 }, panelLoaded: { boards: -1, directory: -1 }, pub: null, directory: [] });
  useGame.getState().boot();
});

describe('the public panels on the store (R-9-12)', () => {
  it('the welcome stamps both panels with its tick and keeps the boards and the directory it carries', () => {
    net.handler!(welcome(780, [rowA]));
    const s = useGame.getState();
    expect(s.panelStamp).toEqual({ boards: 780, directory: 780 });
    expect(s.panelLoaded).toEqual({ boards: 780, directory: 780 });
    expect(s.directory).toEqual([rowA]);
    expect(s.pub!.boards).toEqual({ nwRank: { u_1: 4 } });
  });

  it('a public tick carries no boards and no directory: it keeps both and moves the stamps', () => {
    net.handler!(welcome(781, [rowA]));
    net.handler!(tick(840, {
      pub: { wire: [], alliances: [], economy: {}, chapter: {}, hallOfFame: [], collectibles: 3, cityDemand: {}, players: 2, online: 1 },
      panels: { boards: 840, directory: 840 },
    }));
    const s = useGame.getState();
    expect(s.pub!.boards).toEqual({ nwRank: { u_1: 4 } });
    expect(s.pub!.collectibles).toBe(3);
    expect(s.directory).toEqual([rowA]);
    expect(s.panelStamp).toEqual({ boards: 840, directory: 840 });
    expect(s.panelLoaded).toEqual({ boards: 781, directory: 781 });
  });

  it('an ordinary tick leaves the stamps and the panels alone', () => {
    net.handler!(welcome(781, [rowA]));
    net.handler!(tick(782));
    expect(useGame.getState().panelStamp).toEqual({ boards: 781, directory: 781 });
  });

  it('loadPanel reads the directory and records the tick it was taken at', async () => {
    net.handler!(welcome(781, []));
    net.handler!(tick(840, { panels: { boards: 840, directory: 840 } }));
    net.panelReplies.push({ v: 842, data: [rowA] });
    await useGame.getState().loadPanel('directory');
    expect(net.panelCalls).toEqual(['directory']);
    expect(useGame.getState().directory).toEqual([rowA]);
    expect(useGame.getState().panelLoaded.directory).toBe(842);
  });

  it('loadPanel reads the boards into the public state and keeps the rest of it', async () => {
    net.handler!(welcome(781, []));
    net.handler!(tick(840, { pub: { wire: [], alliances: [], economy: {}, chapter: {}, hallOfFame: [], collectibles: 9, cityDemand: {}, players: 2, online: 1 }, panels: { boards: 840, directory: 840 } }));
    net.panelReplies.push({ v: 841, data: { nwRank: { u_1: 1 } } });
    await useGame.getState().loadPanel('boards');
    const pub = useGame.getState().pub!;
    expect(pub.boards).toEqual({ nwRank: { u_1: 1 } });
    expect(pub.collectibles).toBe(9);
    expect(useGame.getState().panelLoaded.boards).toBe(841);
  });

  it('an offline or timed-out read changes nothing', async () => {
    net.handler!(welcome(781, [rowA]));
    net.panelReplies.push({ ok: false, error: 'timed out' });
    await useGame.getState().loadPanel('directory');
    expect(useGame.getState().directory).toEqual([rowA]);
    expect(useGame.getState().panelLoaded.directory).toBe(781);
  });

  it('a read asked for the same stamp while one is in flight is not doubled', async () => {
    net.handler!(welcome(781, []));
    net.panelReplies.push({ v: 790, data: [rowA] });
    const first = useGame.getState().loadPanel('directory');
    void useGame.getState().loadPanel('directory');
    void useGame.getState().loadPanel('directory');
    await first;
    expect(net.panelCalls).toEqual(['directory']);
    expect(useGame.getState().directory).toEqual([rowA]);
  });

  it('a stamp that moves during a read is read at once, not after the old read settles', async () => {
    net.handler!(welcome(781, []));
    // the read for 781 is still in flight (its reply is held) when the public tick 840 arrives: the new read goes out now
    let releaseOld: (v: unknown) => void = () => undefined;
    net.panelReplies.push(new Promise((r) => { releaseOld = r; }) as never);
    const first = useGame.getState().loadPanel('directory');
    net.handler!(tick(840, { panels: { boards: 840, directory: 840 } }));
    net.panelReplies.push({ v: 841, data: [rowA] });
    void useGame.getState().loadPanel('directory');
    expect(net.panelCalls).toEqual(['directory', 'directory']);
    await new Promise((r) => setTimeout(r, 0));
    expect(useGame.getState().directory).toEqual([rowA]);
    expect(useGame.getState().panelLoaded.directory).toBe(841);
    // the old read's reply lands last, at an older tick: it is not applied (the panel never goes back in time)
    releaseOld({ v: 790, data: [] });
    await first;
    expect(useGame.getState().directory).toEqual([rowA]);
    expect(useGame.getState().panelLoaded.directory).toBe(841);
  });
});
