// ShellLocalState (17 §2.2) and AccountUiPrefs (17 §2.1), verbatim, with AppId from the registry.
import type { AppId } from "./registry";
import type { PaletteId } from "@/styles/tokens";

export type { PaletteId };
export type Tick = number;
export type ShellId = "r0" | "r1" | "r2" | "r3" | "r4" | "r5" | "r6" | `cos_shell_${string}`;
export type Locale = "en" | "fr";
export type DetailMode = "simple" | "pro";
export type NotifyCategory =
  | "security_flag" | "attack_detected" | "margin" | "liquidation" | "contract_signature" | "lawsuit"
  | "verdict" | "league_result" | "rival_moved" | "goal_reached" | "auction_outbid" | "auction_won"
  | "fund_gate" | "bank_run" | "world_event" | "chapter" | "message" | "alliance" | "held" | "system";

export interface AccountUiPrefs {
  accountId: string;
  shell: ShellId;
  locale: Locale;
  numberLocale: string;
  timeDisplay: "game" | "game+real";
  detailMode: Record<AppId, DetailMode>;
  sound: { master: number; music: number; ui: number; enabledOnPhone: boolean };
  haptics: boolean;
  reducedMotion: "system" | "on" | "off";
  reducedTransparency: "system" | "on" | "off";
  highContrast: boolean;
  colorBlindPair: boolean;
  textScale: number;
  notifications: NotificationPrefs;
  privacy: PresentationPrivacy;
  layouts: SavedLayout[];
  shelfOrder: AppId[];
  watchlists: Watchlist[];
  dismissed: Record<string, Tick>;
}
export interface NotificationPrefs {
  push: Record<NotifyCategory, boolean>;
  email: "off" | "daily" | "weekly";
  quietHours: { start: string; end: string; tz: string };
  lastPermissionAskRealMs: number | null;
}
export interface PresentationPrivacy {
  showHomeInCity: boolean;
  showEstateToVisitors: boolean;
  crownTowerName: "handle" | "private";
  showNotorietyOnProfile: boolean;
  shareDefaults: "pnl_only";
}
export interface SavedLayout { id: string; name: string; viewportClass: "desktop"; windows: WindowRect[] }
export interface Watchlist { id: string; name: string; assetIds: string[] }

export interface WindowRect {
  app: AppId; instance: number; x: number; y: number; w: number; h: number;
  snap: SnapSlot | null; workspace: 1 | 2 | 3; collapsed: boolean; context?: string;
}
export type SnapSlot = "L1/2" | "R1/2" | "L1/3" | "C1/3" | "R1/3" | "L2/3" | "R2/3" | "TL" | "TR" | "BL" | "BR" | "FILL";

export interface ShellLocalState {
  palette: PaletteId;
  windows: WindowRect[];
  compact: { visible: AppId | null; halves: [AppId, AppId] | null };
  focusMode: boolean;
  activeWorkspace: 1 | 2 | 3;
  ticketDrafts: Record<string, OrderDraft>;
  lastSeenTick: Tick;
  renderTierOverride: "auto" | "T0" | "T1" | "T2";
  myCityOverlay: boolean;
  connectionNotes: Record<string, { tag: "trusted" | "watch" | null; note: string }>;
}
export interface OrderDraft { assetId: string; side: "buy" | "sell"; type: string; qty: string; limit?: string; stop?: string; tif?: string; algo?: AlgoDraft }
export interface AlgoDraft { kind: "twap" | "vwap" | "pov" | "iceberg"; params: Record<string, string> }
