import type { Bar } from '@/game/history';
import type { Msg } from '@/i18n';
import type { ChatMessage, Command, InboxItem, WireItem } from '@/world/types';
import type { AssetDef } from '@/engine';
import type { Boards } from '@/world/types';
import type { DirectoryRow, MarketFrame, PanelStamps, PlayerView, PublicCore, PublicPanel, PublicState } from '@/world/view';
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
  /** a public panel's data for this viewer (the boards, or the directory), read on demand (R-9-12) */
  | { t: 'panel'; id: number; panel: PublicPanel }
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

/**
 * The model text overlay (server/text): the item id to its line in each language. Presentation only: it never enters the
 * world state, a snapshot or the command log, and a client shows it in place of the template line when present.
 */
export type TextOverlayMap = Record<string, { en: string; fr: string }>;

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
    /** the model text overlay, all lines kept (absent when the text slot is off) */
    textOverlay?: TextOverlayMap;
  }
  | {
    t: 'tick';
    frame: MarketFrame;
    me: PlayerView;
    wire: WireItem[];
    inbox: InboxItem[];
    chat: (ChatMessage & { channel: string })[];
    rankUps: { playerId: string; rankId: string }[];
    /** the public state without the boards, every public tick (BOARD_EVERY); the boards and the directory come on demand */
    pub?: PublicCore;
    /** the version stamps of the public panels, on the public tick: a panel whose stamp moved is read again when it is open */
    panels?: PanelStamps;
    serverTime: number;
    /** the overlay lines that landed since the last tick (absent when none did) */
    textOverlay?: TextOverlayMap;
  }
  | { t: 'ack'; id: number; ok: boolean; error?: string; msg?: Msg; data?: unknown; me?: PlayerView }
  | { t: 'history'; id: number; data: HistoryPayload | null }
  | { t: 'nw-history'; id: number; data: NwHistoryPayload }
  | { t: 'lp-page'; id: number; data: LpPage | null }
  | { t: 'visit'; id: number; data: VisitPayload | null }
  /** a public panel: v is the tick the data was taken at; data is null when the viewer is not signed in */
  | { t: 'panel'; id: number; panel: PublicPanel; v: number; data: Boards | DirectoryRow[] | null }
  | { t: 'chat'; chat: (ChatMessage & { channel: string })[] }
  | { t: 'error'; message: string }
  | { t: 'pong' };

/** HTTP API (same origin as the WebSocket). */
export interface RegisterReq { handle: string; country: string }
export interface AuthRes { ok: boolean; token?: string; playerId?: string; handle?: string; error?: string }
export interface LoginReq { handle: string; password: string }
export interface SetPasswordReq { token: string; password: string }

export const DEFAULT_WORLD_PORT = 8787;
