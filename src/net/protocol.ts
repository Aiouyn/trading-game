import type { Bar } from '@/game/history';
import type { ChatMessage, Command, InboxItem, WireItem } from '@/world/types';
import type { AssetDef } from '@/engine';
import type { DirectoryRow, MarketFrame, PlayerView, PublicState } from '@/world/view';
import type { LpPage } from '@/world/launchpad/view';
import type { CollectionView, HomeView } from '@/world/home';

/** A visitor's view of another player (home.ts visitView). */
export interface VisitPayload {
  home: HomeView | null;
  collection: CollectionView | null;
}

/** Messages from the browser to the world server. */
export type ClientMsg =
  | { t: 'hello'; token: string }
  | { t: 'cmd'; id: number; cmd: Command }
  | { t: 'history'; id: number; series: string }
  | { t: 'nw-history'; id: number }
  /** one Launchpad token page, read on demand (the view carries none) */
  | { t: 'lp-page'; id: number; ticker: string }
  /** another player's home room and collection, each only when its owner has opened it (home.ts visitView) */
  | { t: 'visit'; id: number; playerId: string }
  | { t: 'ping' };

export interface HistoryPayload {
  series: string;
  /** daily bars, oldest first */
  daily: Bar[];
  /** recent tick prices (last few game days), oldest first, and the tick of the last one */
  ticks: number[];
  lastTick: number;
  /** cumulative volume at each recent tick (assets only) */
  cums?: number[];
}

export interface NwHistoryPayload {
  /** net worth every 12 ticks, oldest first, and the tick of the last sample */
  samples: number[];
  lastTick: number;
  every: number;
  /** daily closes */
  daily: { day: number; value: number }[];
  /** the owner's equity and the three benchmark ghosts at each kept closed day, oldest first (private to the owner) */
  ghosts: { day: number; player: number; basket: number; random: number; momentum: number }[];
}

/** Messages from the world server to the browser. */
export type ServerMsg =
  | {
    t: 'welcome';
    playerId: string;
    tickMs: number;
    frame: MarketFrame;
    /** the full asset list as the server has it now (runtime listings included), in config order */
    defs: AssetDef[];
    me: PlayerView;
    pub: PublicState;
    directory: DirectoryRow[];
    chat: Record<string, ChatMessage[]>;
    serverTime: number;
  }
  | {
    t: 'tick';
    frame: MarketFrame;
    me: PlayerView;
    wire: WireItem[];
    inbox: InboxItem[];
    chat: (ChatMessage & { channel: string })[];
    rankUps: { playerId: string; rankId: string }[];
    /** public state and directory, every few ticks */
    pub?: PublicState;
    directory?: DirectoryRow[];
    serverTime: number;
  }
  | { t: 'ack'; id: number; ok: boolean; error?: string; data?: unknown; me?: PlayerView }
  | { t: 'history'; id: number; data: HistoryPayload | null }
  | { t: 'nw-history'; id: number; data: NwHistoryPayload }
  | { t: 'lp-page'; id: number; data: LpPage | null }
  | { t: 'visit'; id: number; data: VisitPayload | null }
  | { t: 'chat'; chat: (ChatMessage & { channel: string })[] }
  | { t: 'error'; message: string }
  | { t: 'pong' };

/** HTTP API (same origin as the WebSocket). */
export interface RegisterReq { handle: string; country: string }
export interface AuthRes { ok: boolean; token?: string; playerId?: string; handle?: string; error?: string }
export interface LoginReq { handle: string; password: string }
export interface SetPasswordReq { token: string; password: string }

export const DEFAULT_WORLD_PORT = 8787;
