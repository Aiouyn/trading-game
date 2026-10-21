"use client";
// Phone banner stack (17A T6, Producer 08:20): one in-flow stack under the status bar, ordered P0 alert → offline /
// error → world event. At most 2 banners show; the rest collapse into a "+N" count on the last visible banner,
// which opens the alerts sheet. Every banner pushes content down.
import { dispatchFeed, parseDeepLink, useFeedState } from "@/shell/feed";
import { openSheet, closeSheet } from "@/shell/sheetHost";
import { S } from "@/shell/strings";
import { ALERT_ICON, Banner, pickAlert, WorldEventBanner, worldEventText, type Alert, type WorldEvent } from "./Banner";
import { LoadState } from "./LoadState";
import { Glyph } from "./Glyph";
import { retryLoad } from "@/shell/loader";
import { useShell, useShellStore } from "./ShellContext";

export const MAX_PHONE_BANNERS = 2;
type Item = "alert" | "load" | "world";

/** Which banners show and how many collapse into "+N" (queued alerts count too). */
export function phoneStack(alerts: readonly Alert[], loadOpen: boolean, world: WorldEvent | null): { shown: Item[]; extra: number } {
  const { shown: a, queued } = pickAlert(alerts);
  const items: Item[] = [...(a ? ["alert" as const] : []), ...(loadOpen ? ["load" as const] : []), ...(world ? ["world" as const] : [])];
  return { shown: items.slice(0, MAX_PHONE_BANNERS), extra: Math.max(0, items.length - MAX_PHONE_BANNERS) + queued.length };
}

export type SheetRow =
  | { kind: "alert"; alert: Alert }
  | { kind: "load"; offline: boolean }
  | { kind: "world"; event: WorldEvent };

/**
 * Alerts-sheet rows in the stack's priority (Studio 08:31): P0 alerts, then offline / error, then the world event,
 * then everything else by time (arrival order).
 */
export function sheetRows(alerts: readonly Alert[], load: { offline: boolean } | null, world: WorldEvent | null): SheetRow[] {
  const p0 = alerts.filter((a) => a.priority === "P0").map((alert) => ({ kind: "alert" as const, alert }));
  const rest = alerts.filter((a) => a.priority !== "P0").map((alert) => ({ kind: "alert" as const, alert }));
  return [...p0, ...(load ? [{ kind: "load" as const, offline: load.offline }] : []), ...(world ? [{ kind: "world" as const, event: world }] : []), ...rest];
}


/** Leading glyph per sheet row (Studio 08:31 / 08:44): P0 'alert', other alerts 'bell', world 'world', load 'error'. */
export function rowGlyph(r: SheetRow): "alert" | "bell" | "world" | "error" {
  return r.kind === "alert" ? (r.alert.priority === "P0" ? ALERT_ICON : "bell") : r.kind === "world" ? "world" : "error";
}

export function AlertsSheetBody({ onNavigate }: { onNavigate: (href: string) => void }) {
  const feed = useFeedState();
  const sys = useShell((s) => s.channels.system);
  const loadOpen = sys.load !== "ok" || sys.offline;
  const loading = sys.load === "loading";
  const rows = sheetRows(feed.alerts, loadOpen ? { offline: sys.offline } : null, feed.world);
  return (
    <>
      <h2 className="label">{S.alerts}</h2>
      <ul className="alerts-list" data-testid="alerts-list">
        {rows.map((r) => (
          <li key={r.kind === "alert" ? r.alert.id : r.kind} data-testid="alerts-item" data-kind={r.kind} data-priority={r.kind === "alert" ? r.alert.priority : undefined}>
            <span className={`row-glyph ${r.kind === "alert" ? (r.alert.priority === "P0" ? "p0" : "p1") : r.kind}`} data-testid="row-glyph"
              data-glyph={rowGlyph(r)} aria-hidden="true"><Glyph name={rowGlyph(r)} size={16} /></span>
            {r.kind === "alert" && <>
              <span className="row-text">{r.alert.text}</span>
              <a className="alert-action" href={r.alert.action.href} onClick={(e) => { e.preventDefault(); closeSheet(); onNavigate(r.alert.action.href); }}>{r.alert.action.label}</a>
            </>}
            {r.kind === "load" && <>
              <span className="row-text" data-testid="sheet-load-message">{r.offline ? S.offline : S.couldntLoad}</span>
              <button className="load-retry alert-action" data-testid="sheet-retry" data-alt={loading ? S.retry : S.retrying} aria-disabled={loading} onClick={() => { if (!loading) retryLoad(); }}>
                <span className="load-retry-label">{loading ? S.retrying : S.retry}</span>
              </button>
            </>}
            {r.kind === "world" && <span className="row-text">{worldEventText(r.event).replace(/^● /, "")}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

export function useDeepLinkNavigate(): (href: string) => void {
  const store = useShellStore();
  return (href) => { const d = parseDeepLink(href); if (d) store.getState().open(d.app, d.context, { deepLink: true }); };
}

export function PhoneBannerStack() {
  const feed = useFeedState();
  const sys = useShell((s) => s.channels.system);
  const navigate = useDeepLinkNavigate();
  const loadOpen = sys.load !== "ok" || sys.offline;
  const { shown, extra } = phoneStack(feed.alerts, loadOpen, feed.world);
  const last = shown.at(-1);
  const onMore = () => openSheet({ side: "bottom", label: S.alerts, testId: "alerts-sheet",
    content: <AlertsSheetBody onNavigate={navigate} /> });
  return (
    <div className="phone-stack" data-testid="phone-stack" data-count={shown.length} data-last={last ?? ""}>
      {shown.includes("alert") && <Banner alerts={feed.alerts.filter((a) => a.id === pickAlert(feed.alerts).shown?.id)} onNavigate={navigate} extra={last === "alert" ? extra : 0} onMore={onMore} />}
      {/* LoadState keeps its own banner (44 px, Retry 44×44, 120 ms); it stays mounted so its height can ease. */}
      <LoadState variant="banner" extra={last === "load" ? extra : 0} onMore={onMore} />
      {shown.includes("world") && <WorldEventBanner event={feed.world} extra={last === "world" ? extra : 0} onMore={onMore} />}
    </div>
  );
}

// Test/mock helper re-export so e2e can push extra feed messages through the same boundary parser.
export { dispatchFeed };
