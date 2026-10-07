'use client';

import { create } from 'zustand';
import {
  cancelOrder, createWorld, defaultConfig, indexLevel, openAccount, placeOrder, prices, step,
} from '@/engine';
import type { Order, OrderRequest, WorldState } from '@/engine';
import { tickMs, type Speed } from './clock';
import { createHistory, record, type History, type RangeId } from './history';
import { clearSave, loadGame, saveGame } from './save';
import { firstTradeCap, previewTicket } from './ticket';
import { WIRE_KEEP, wireFromEvents, type WireItem } from './wire';
import { money, price, qty } from './format';

export const PLAYER = 'you';
export const INDEX_ID = 'GX';
/** History the world has before the player arrives, so 1Q and 1Y charts have bars. */
export const WARMUP_DAYS = 63;
const AUTOSAVE_EVERY = 12;
const CHUNK = 1500;

export interface Toast {
  id: string;
  /** side bar color (DESIGN.md §6a): gain for buys, loss for sells and rejections */
  tone: 'gain' | 'loss';
  text: string;
}

export interface GameStore {
  status: 'idle' | 'loading' | 'ready';
  loadProgress: number;
  world: WorldState | null;
  /** mutable, bumped through historyRev so components re-read it */
  history: History | null;
  historyRev: number;
  speed: Speed;
  paused: boolean;
  selected: string;
  range: RangeId;
  chartMode: 'candles' | 'line';
  wire: WireItem[];
  toasts: Toast[];
  tradeSheetOpen: boolean;

  boot: (opts?: { seed?: string; fresh?: boolean }) => Promise<void>;
  newGame: (seed?: string) => Promise<void>;
  tick: (n?: number) => void;
  setSpeed: (s: Speed) => void;
  togglePause: () => void;
  select: (assetId: string) => void;
  setRange: (r: RangeId) => void;
  setChartMode: (m: 'candles' | 'line') => void;
  setTradeSheet: (open: boolean) => void;
  submitOrder: (req: Omit<OrderRequest, 'playerId'>) => Order | null;
  cancel: (orderId: string) => void;
  dismissToast: (id: string) => void;
  persist: () => void;
}

function snapshot(w: WorldState): Record<string, number> {
  const p = prices(w);
  for (const idx of w.config.indices) p[idx.id] = indexLevel(w, idx.id);
  return p;
}

function seriesIds(w: WorldState): string[] {
  return [...w.config.indices.map((i) => i.id), ...w.config.assets.map((a) => a.id)];
}

function randomSeed(): string {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return `${a[0]!.toString(36)}${a[1]!.toString(36)}`;
}

/** Quant's reject reasons, in plain words for the toast. */
const REASONS: Record<string, string> = {
  'insufficient cash': 'not enough cash',
  'insufficient position': 'you don\'t hold that many',
  'whole units only': 'whole shares only',
  'qty must be > 0': 'enter a quantity',
  'limit price required': 'set a limit price',
  'stop price required': 'set a stop price',
};

export function closedText(o: Order): string {
  const what = `${o.side === 'buy' ? 'Buy' : 'Sell'} ${qty(o.qty)} ${o.assetId}`;
  if (o.status === 'expired') return `${what} expired at the close`;
  const why = o.rejectReason ? REASONS[o.rejectReason] ?? o.rejectReason : 'the market refused it';
  if (o.filledQty > 0) return `${qty(o.filledQty)} of ${qty(o.qty)} ${o.assetId} filled; the rest was cancelled: ${why}`;
  return `${what} rejected: ${why}`;
}

const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0));

let ticksSinceSave = 0;

export const useGame = create<GameStore>((set, get) => ({
  status: 'idle',
  loadProgress: 0,
  world: null,
  history: null,
  historyRev: 0,
  speed: 1,
  paused: false,
  selected: 'HLCN',
  range: '1D',
  chartMode: 'candles',
  wire: [],
  toasts: [],
  tradeSheetOpen: false,

  async boot(opts) {
    if (get().status !== 'idle') return;
    set({ status: 'loading', loadProgress: 0 });
    if (!opts?.fresh && !opts?.seed) {
      const saved = await loadGame();
      if (saved && saved.world.accounts[PLAYER]) {
        set({ world: saved.world, history: saved.history, wire: saved.wire ?? [], status: 'ready', loadProgress: 1, historyRev: 1 });
        return;
      }
    }
    await get().newGame(opts?.seed);
  },

  async newGame(seed) {
    set({ status: 'loading', loadProgress: 0, toasts: [], wire: [], tradeSheetOpen: false });
    let w = createWorld(seed ?? randomSeed(), defaultConfig());
    const h = createHistory(seriesIds(w), w.config.ticksPerDay);
    record(h, w.tick, snapshot(w));
    const total = WARMUP_DAYS * w.config.ticksPerDay;
    let wire: WireItem[] = [];
    for (let done = 0; done < total; ) {
      const n = Math.min(CHUNK, total - done);
      for (let k = 0; k < n; k++) {
        const r = step(w);
        w = r.state;
        record(h, w.tick, snapshot(w));
        if (r.events.length) wire = [...wireFromEvents(w, r.events, []).reverse(), ...wire].slice(0, WIRE_KEEP);
      }
      done += n;
      set({ loadProgress: done / total });
      await yieldToBrowser();
    }
    w = openAccount(w, PLAYER);
    await clearSave();
    set({ world: w, history: h, historyRev: get().historyRev + 1, wire, status: 'ready', loadProgress: 1, paused: false });
    get().persist();
  },

  tick(n = 1) {
    const { world, history } = get();
    if (!world || !history) return;
    let w = world;
    let wire = get().wire;
    const toasts: Toast[] = [];
    for (let k = 0; k < n; k++) {
      const r = step(w);
      w = r.state;
      record(history, w.tick, snapshot(w));
      if (r.events.length || r.fills.length) {
        wire = [...wireFromEvents(w, r.events, r.fills).reverse(), ...wire].slice(0, WIRE_KEEP);
      }
      for (const f of r.fills) {
        if (f.playerId !== PLAYER) continue;
        toasts.push({
          id: `${f.orderId}-${f.tick}`,
          tone: f.side === 'buy' ? 'gain' : 'loss',
          text: `${f.side === 'buy' ? 'Bought' : 'Sold'} ${qty(f.qty)} ${f.assetId} at ${price(f.price)} \u00b7 fee ${money(f.fee)}`,
        });
      }
      // orders the engine closed this tick without filling all of it (cash ran out, day order expired)
      for (const o of w.orders) {
        if (o.playerId !== PLAYER || o.closedTick !== w.tick || o.status === 'filled') continue;
        if (o.status === 'cancelled' && !o.rejectReason) continue; // the player's own cancel
        toasts.push({ id: `${o.id}-closed`, tone: 'loss', text: closedText(o) });
      }
    }
    set({ world: w, wire, historyRev: get().historyRev + 1, toasts: toasts.length ? [...get().toasts, ...toasts].slice(-4) : get().toasts });
    ticksSinceSave += n;
    if (ticksSinceSave >= AUTOSAVE_EVERY) get().persist();
  },

  setSpeed(speed) { set({ speed, paused: false }); },
  togglePause() { set({ paused: !get().paused }); },
  select(selected) { set({ selected }); },
  setRange(range) { set({ range }); },
  setChartMode(chartMode) { set({ chartMode }); },
  setTradeSheet(tradeSheetOpen) { set({ tradeSheetOpen }); },

  submitOrder(req) {
    const w = get().world;
    if (!w) return null;
    // app-side Simple-mode rule: the engine does not know about the first-trade cap
    if (req.side === 'buy') {
      const p = previewTicket(w, PLAYER, req);
      if (p.total > firstTradeCap(w, PLAYER) + 1e-9) {
        set({ toasts: [...get().toasts, { id: `cap-${w.tick}`, tone: 'loss' as const, text: 'First trade is capped at 20% of cash.' }].slice(-4) });
        return null;
      }
    }
    const { state, order } = placeOrder(w, { ...req, playerId: PLAYER });
    set({ world: state });
    if (order.status === 'rejected') {
      set({ toasts: [...get().toasts, { id: `${order.id}-rej`, tone: 'loss' as const, text: closedText(order) }].slice(-4) });
    }
    get().persist();
    return order;
  },

  cancel(orderId) {
    const w = get().world;
    if (!w) return;
    set({ world: cancelOrder(w, PLAYER, orderId) });
    get().persist();
  },

  dismissToast(id) { set({ toasts: get().toasts.filter((t) => t.id !== id) }); },

  persist() {
    const { world, history, wire } = get();
    if (!world || !history) return;
    ticksSinceSave = 0;
    void saveGame({ saveVersion: 1, savedAt: Date.now(), world, history: structuredClone(history), wire });
  },
}));

export { tickMs };
