'use client';

import { create } from 'zustand';
import { type KeyValueStore, migrateLegacy, readPrefs as readPrefsFrom, updatePrefs } from '@/shell/prefs';
import { universeConfig, type WorldConfig, type WorldState } from '@/engine';
import { api, getToken, setToken, WorldClient, type Ack } from '@/net/client';
import type { HistoryPayload, NwHistoryPayload, ServerMsg } from '@/net/protocol';
import { mirrorWorld, type DirectoryRow, type MarketFrame, type PlayerView, type PublicState } from '@/world/view';
import type { ChatMessage, Command, InboxItem, WireItem } from '@/world/types';
import { createHistory, loadSeries, type History, type RangeId } from './history';
import type { IndicatorId } from './indicators';
import { absorbFrame, delistedRefusal, type MirrorMe } from './universe';

export type Screen = 'market' | 'portfolio' | 'empire' | 'estate' | 'lab' | 'security' | 'court' | 'social' | 'wire' | 'profile';

export interface Toast {
  id: string;
  tone: 'gain' | 'loss' | 'warn' | 'info' | 'brass';
  text: string;
}

export const WIRE_KEEP = 300;
/** The static universe, the starting point until the server's welcome sends its current asset list. */
const BASE_CONFIG: WorldConfig = universeConfig();

/** Kinds of private notices that pop up as toasts (the rest stay in the inbox). */
const TOAST_KINDS = new Set<InboxItem['kind']>(['fill', 'order', 'margin', 'rank', 'achievement', 'contract', 'court', 'security', 'deal', 'lab', 'alert', 'biz']);

export interface GameStore {
  status: 'boot' | 'welcome' | 'connecting' | 'ready' | 'offline';
  authError: string | null;
  playerId: string | null;
  tickMs: number;
  /** wall-clock time the latest tick arrived (drives the tick ring) */
  lastTickAt: number;
  frame: MarketFrame | null;
  /** client-side engine mirror for previews (estimateFill, buyingPower, optionChain…) */
  world: WorldState | null;
  /** the live universe: the server's asset list (listings and delistings included) */
  config: WorldConfig;
  /** the asset list version `config` matches (MarketFrame.cfgSeq) */
  cfgSeq: number;
  me: PlayerView | null;
  pub: PublicState | null;
  directory: DirectoryRow[];
  chat: Record<string, ChatMessage[]>;
  chatUnread: number;
  wire: WireItem[];
  history: History;
  historyRev: number;
  loaded: Record<string, true>;
  nw: { samples: number[]; lastTick: number; every: number; daily: { day: number; value: number }[] } | null;
  toasts: Toast[];
  screen: Screen;
  selected: string;
  range: RangeId;
  chartMode: 'candles' | 'line';
  indicators: Partial<Record<IndicatorId, boolean>>;
  tradeSheetOpen: boolean;
  moreOpen: boolean;
  inboxOpen: boolean;
  chatOpen: boolean;
  rankUp: string | null;
  digestOpen: boolean;
  /** a prefilled ticket (from the stop-loss explainer, a note, the option chain…) */
  ticketPreset: { side: 'buy' | 'sell'; type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing'; qty?: number; stopPrice?: number; limitPrice?: number; nonce: number } | null;
  profileId: string | null;
  /** chat channel to open (a DM from a profile) */
  dmTarget: string | null;

  boot: () => void;
  register: (handle: string, country: string) => Promise<string | null>;
  login: (handle: string, password: string) => Promise<string | null>;
  logout: () => void;
  act: (cmd: Command, opts?: { silent?: boolean; success?: string }) => Promise<Ack>;
  ensureHistory: (series: string) => Promise<void>;
  loadNw: () => Promise<void>;
  select: (assetId: string) => void;
  setScreen: (s: Screen) => void;
  setRange: (r: RangeId) => void;
  setChartMode: (m: 'candles' | 'line') => void;
  toggleIndicator: (id: IndicatorId) => void;
  setTradeSheet: (open: boolean) => void;
  setMore: (open: boolean) => void;
  setInbox: (open: boolean) => void;
  setChat: (open: boolean) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  closeRankUp: () => void;
  closeDigest: () => void;
  presetTicket: (p: Omit<NonNullable<GameStore['ticketPreset']>, 'nonce'>) => void;
  openProfile: (id: string | null) => void;
  openDm: (channel: string) => void;
}

let client: WorldClient | null = null;
let toastSeq = 0;

function freshHistory(config: WorldConfig): History {
  const assets = config.assets.map((a) => a.id);
  return createHistory([...config.indices.map((i) => i.id), ...assets], config.ticksPerDay, assets);
}

/** localStorage as a KeyValueStore, or null when storage is blocked (private mode). */
function prefsStore(): KeyValueStore | null {
  try { return window.localStorage; } catch { return null; }
}

/** Chart prefs live in tg-prefs (DECISIONS "Local storage"); the legacy tycoon.prefs key is migrated on boot. */
function readPrefs(): Partial<Pick<GameStore, 'indicators' | 'range' | 'chartMode' | 'selected'>> {
  const kv = prefsStore();
  if (!kv) return {};
  const p = readPrefsFrom(kv);
  const out: Partial<Pick<GameStore, 'indicators' | 'range' | 'chartMode' | 'selected'>> = {};
  if (p.chart.indicators) out.indicators = Object.fromEntries(p.chart.indicators.map((id) => [id, true])) as GameStore['indicators'];
  if (p.chart.range) out.range = p.chart.range as RangeId;
  if (p.chart.chartMode === 'candles' || p.chart.chartMode === 'line') out.chartMode = p.chart.chartMode;
  if (p.lastTicker) out.selected = p.lastTicker;
  return out;
}

function writePrefs(s: GameStore): void {
  const kv = prefsStore();
  if (!kv) return;
  const indicators = Object.keys(s.indicators).filter((id) => s.indicators[id as IndicatorId]);
  updatePrefs(kv, (p) => ({ ...p, lastTicker: s.selected, chart: { indicators, range: s.range, chartMode: s.chartMode } }));
}

export const useGame = create<GameStore>((set, get) => {
  /** The mirror's identity for this player (the engine's read-only helpers key on it). */
  const mirrorMe = (pid: string | null, me: PlayerView | null): MirrorMe => ({ id: pid ?? 'me', account: me?.account ?? null, orders: me?.orders ?? [] });

  /** Reconnect for a fresh welcome (and with it the current asset list). */
  const resync = () => {
    const token = getToken();
    if (token) connect(token);
  };

  const onMsg = (msg: ServerMsg) => {
    switch (msg.t) {
      case 'welcome': {
        // the server's asset list replaces the static one: listings made since the static universe are in it
        const config: WorldConfig = { ...get().config, assets: msg.defs };
        const h = freshHistory(config);
        const r = absorbFrame({ config, cfgSeq: msg.frame.cfgSeq }, h, null, msg.frame, mirrorMe(msg.playerId, msg.me));
        // one set: the universe, its history and the frame never show up apart
        set({
          status: 'ready', playerId: msg.playerId, tickMs: msg.tickMs, lastTickAt: Date.now(), frame: msg.frame, world: r.world, me: msg.me,
          config, cfgSeq: msg.frame.cfgSeq, history: h, loaded: {},
          pub: msg.pub, directory: msg.directory, chat: msg.chat, wire: msg.pub.wire, historyRev: get().historyRev + 1,
          digestOpen: !!msg.me.digest && msg.me.digest.items.length > 0,
        });
        void get().ensureHistory(get().selected);
        for (const id of ['GX', ...msg.me.player.watchlist]) void get().ensureHistory(id);
        break;
      }
      case 'tick': {
        const absorbed = absorbFrame({ config: get().config, cfgSeq: get().cfgSeq }, get().history, get().world, msg.frame, mirrorMe(get().playerId, msg.me));
        // rank-ups can come from a tick or from a command (a sale, a grant): compare ranks
        const prevRank = get().me?.rank.id;
        const mine = prevRank && msg.me.rank.id > prevRank ? { rankId: msg.me.rank.id } : msg.rankUps.find((r) => r.playerId === get().playerId);
        const toasts = msg.inbox.filter((n) => TOAST_KINDS.has(n.kind)).map((n) => ({ id: `t${++toastSeq}`, tone: n.tone, text: n.text }));
        const chat = { ...get().chat };
        let unread = get().chatUnread;
        for (const m of msg.chat) {
          const arr = (chat[m.channel] = [...(chat[m.channel] ?? []), m].slice(-120));
          void arr;
          if (m.playerId !== get().playerId) unread++;
        }
        // the mirror and history follow the universe even when the frame's list is missing (its extra entries are
        // skipped); a behind client reconnects below for the current list
        set({
          config: absorbed.universe.config, cfgSeq: absorbed.universe.cfgSeq,
          frame: msg.frame, world: absorbed.world, me: msg.me, lastTickAt: Date.now(), historyRev: get().historyRev + 1,
          wire: msg.wire.length ? [...[...msg.wire].reverse(), ...get().wire].slice(0, WIRE_KEEP) : get().wire,
          ...(msg.pub ? { pub: msg.pub } : {}), ...(msg.directory ? { directory: msg.directory } : {}),
          ...(toasts.length ? { toasts: [...get().toasts, ...toasts].slice(-5) } : {}),
          ...(msg.chat.length ? { chat, chatUnread: get().chatOpen ? 0 : unread } : {}),
          ...(mine ? { rankUp: mine.rankId } : {}),
          ...(msg.inbox.some((n) => n.kind === 'fill') ? { tradeSheetOpen: false } : {}),
        });
        if (absorbed.behind) resync();
        const nw = get().nw;
        if (nw && msg.frame.tick % nw.every === 0) {
          nw.samples.push(msg.me.netWorth.total);
          if (nw.samples.length > 600) nw.samples.shift();
          nw.lastTick = msg.frame.tick;
        }
        break;
      }
      case 'chat': {
        const chat = { ...get().chat };
        let unread = get().chatUnread;
        for (const m of msg.chat) {
          chat[m.channel] = [...(chat[m.channel] ?? []), m].slice(-120);
          if (m.playerId !== get().playerId) unread++;
        }
        set({ chat, chatUnread: get().chatOpen ? 0 : unread });
        break;
      }
      case 'ack':
        if (msg.me && get().me && msg.me.rank.id > get().me!.rank.id) set({ rankUp: msg.me.rank.id });
        if (msg.me) set({ me: msg.me, world: get().frame ? mirrorWorld(get().config, get().frame!, mirrorMe(get().playerId, msg.me), get().world ?? undefined) : get().world });
        break;
      default:
        break;
    }
  };

  const connect = (token: string) => {
    client?.close();
    set({ status: 'connecting' });
    client = new WorldClient(token, onMsg, (s) => {
      if (s === 'closed') set({ status: get().status === 'ready' ? 'offline' : get().status });
      if (s === 'auth-failed') { setToken(null); set({ status: 'welcome', authError: null }); }
    });
    client.connect();
  };

  return {
    status: 'boot',
    authError: null,
    playerId: null,
    tickMs: 5000,
    lastTickAt: 0,
    frame: null,
    world: null,
    config: BASE_CONFIG,
    cfgSeq: 0,
    me: null,
    pub: null,
    directory: [],
    chat: {},
    chatUnread: 0,
    wire: [],
    history: freshHistory(BASE_CONFIG),
    historyRev: 0,
    loaded: {},
    nw: null,
    toasts: [],
    screen: 'market',
    selected: 'HLCN',
    range: '1D',
    chartMode: 'candles',
    indicators: {},
    tradeSheetOpen: false,
    moreOpen: false,
    inboxOpen: false,
    chatOpen: false,
    rankUp: null,
    digestOpen: false,
    ticketPreset: null,
    profileId: null,
    dmTarget: null,

    boot() {
      if (get().status !== 'boot') return;
      const kv = prefsStore();
      if (kv) migrateLegacy(kv);
      const prefs = readPrefs();
      set({ ...prefs });
      const token = getToken();
      if (token) connect(token);
      else set({ status: 'welcome' });
    },

    async register(handle, country) {
      try {
        const r = await api.register(handle, country);
        if (!r.ok || !r.token) return r.error ?? 'Could not create the account';
        setToken(r.token);
        connect(r.token);
        return null;
      } catch {
        return 'The world server is not reachable. Is it running (npm run world)?';
      }
    },

    async login(handle, password) {
      try {
        const r = await api.login(handle, password);
        if (!r.ok || !r.token) return r.error ?? 'Could not sign in';
        setToken(r.token);
        connect(r.token);
        return null;
      } catch {
        return 'The world server is not reachable.';
      }
    },

    logout() {
      client?.close();
      client = null;
      setToken(null);
      set({ status: 'welcome', me: null, playerId: null, frame: null, world: null });
    },

    async act(cmd, opts) {
      if (!client) return { ok: false, error: 'offline' };
      // a delisted name (or an option on one) is refused here, before it is sent (the order pad and chain hide it too)
      const refused = delistedRefusal(get().config, cmd);
      if (refused) {
        const r = { ok: false, error: refused };
        if (!opts?.silent) get().toast({ tone: 'loss', text: r.error });
        return r;
      }
      const r = await client.command(cmd);
      if (!r.ok && !opts?.silent) get().toast({ tone: 'loss', text: capitalize(r.error ?? 'That did not work') });
      if (r.ok && opts?.success) get().toast({ tone: 'gain', text: opts.success });
      return r;
    },

    async ensureHistory(series) {
      if (!client || get().loaded[series]) return;
      set({ loaded: { ...get().loaded, [series]: true } });
      const p = await client.history(series);
      if (!p || !(p as HistoryPayload).daily) { const l = { ...get().loaded }; delete l[series]; set({ loaded: l }); return; }
      loadSeries(get().history, series, p as HistoryPayload);
      set({ historyRev: get().historyRev + 1 });
    },

    async loadNw() {
      if (!client) return;
      const p = (await client.nwHistory()) as NwHistoryPayload;
      if (p && Array.isArray(p.samples)) set({ nw: { ...p, samples: p.samples.slice() } });
    },

    select(selected) {
      set({ selected });
      void get().ensureHistory(selected);
      writePrefs(get());
    },
    setScreen(screen) { set({ screen, tradeSheetOpen: false, moreOpen: false }); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); },
    setRange(range) { set({ range }); writePrefs(get()); },
    setChartMode(chartMode) { set({ chartMode }); writePrefs(get()); },
    toggleIndicator(id) { set({ indicators: { ...get().indicators, [id]: !get().indicators[id] } }); writePrefs(get()); },
    setTradeSheet(tradeSheetOpen) { set({ tradeSheetOpen }); },
    setMore(moreOpen) { set({ moreOpen }); },
    setInbox(inboxOpen) {
      set({ inboxOpen });
      if (inboxOpen && (get().me?.player.inboxUnread ?? 0) > 0) void get().act({ type: 'inbox.read' }, { silent: true });
    },
    setChat(chatOpen) { set({ chatOpen, ...(chatOpen ? { chatUnread: 0 } : {}) }); },
    toast(t) { set({ toasts: [...get().toasts, { ...t, id: `t${++toastSeq}` }].slice(-5) }); },
    dismissToast(id) { set({ toasts: get().toasts.filter((t) => t.id !== id) }); },
    closeRankUp() { set({ rankUp: null }); },
    closeDigest() {
      set({ digestOpen: false });
      void get().act({ type: 'digest.seen' }, { silent: true });
    },
    presetTicket(p) { set({ ticketPreset: { ...p, nonce: Date.now() }, screen: 'market', tradeSheetOpen: true }); },
    openProfile(profileId) { set({ profileId }); },
    openDm(channel) { set({ dmTarget: channel, profileId: null, chatOpen: true, chatUnread: 0 }); },
  };
});

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Convenience selectors, read from the live universe. Components that render from them should also subscribe to `config`. */
export const PLAYER_FALLBACK = 'me';
export function assetDefOf(id: string) {
  return useGame.getState().config.assets.find((a) => a.id === id);
}
export function isIndex(id: string) {
  return useGame.getState().config.indices.some((i) => i.id === id);
}
