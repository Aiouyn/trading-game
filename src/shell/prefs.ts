// Account UI prefs (17 §2.1) through a stub REST client. Defaults per 17 §2.1.
import { APP_IDS, APPS, GROUPS, type AppId } from "./registry";
import type { AccountUiPrefs, NotifyCategory } from "./types";

const CATEGORIES: NotifyCategory[] = [
  "security_flag", "attack_detected", "margin", "liquidation", "contract_signature", "lawsuit", "verdict",
  "league_result", "rival_moved", "goal_reached", "auction_outbid", "auction_won", "fund_gate", "bank_run",
  "world_event", "chapter", "message", "alliance", "held", "system",
];

export function defaultPrefs(accountId: string): AccountUiPrefs {
  return {
    accountId, shell: "r0", locale: "en", numberLocale: "en-US", timeDisplay: "game",
    detailMode: Object.fromEntries(APP_IDS.map((id) => [id, "simple"])) as Record<AppId, "simple">,
    sound: { master: 1, music: 0.6, ui: 0.8, enabledOnPhone: false },
    haptics: true, reducedMotion: "system", reducedTransparency: "system",
    highContrast: false, colorBlindPair: false, textScale: 1,
    notifications: {
      push: Object.fromEntries(CATEGORIES.map((c) => [c, false])) as Record<NotifyCategory, boolean>,
      email: "off", quietHours: { start: "22:00", end: "08:00", tz: "UTC" }, lastPermissionAskRealMs: null,
    },
    privacy: { showHomeInCity: false, showEstateToVisitors: true, crownTowerName: "handle", showNotorietyOnProfile: false, shareDefaults: "pnl_only" },
    layouts: [], shelfOrder: [...APP_IDS], watchlists: [], dismissed: {},
  };
}

/** Stub REST client: keeps prefs in memory until module 19's endpoint exists. */
export const prefsClient = {
  memo: new Map<string, AccountUiPrefs>(),
  async get(accountId: string): Promise<AccountUiPrefs> {
    return this.memo.get(accountId) ?? defaultPrefs(accountId);
  },
  async put(p: AccountUiPrefs): Promise<void> {
    this.memo.set(p.accountId, p);
  },
};

/** Broker is always first; apps keep the player's order within each group, groups in trade→me order. */
export function shelfOrder(order: readonly AppId[]): AppId[] {
  const g = (id: AppId) => GROUPS.indexOf(APPS[id].group);
  const rest = order.filter((id) => id !== "broker");
  return ["broker", ...GROUPS.flatMap((_, gi) => rest.filter((id) => g(id) === gi))];
}
