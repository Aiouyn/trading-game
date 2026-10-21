"use client";
// Phone banner stack (17A T6, Producer 08:20): one in-flow stack under the status bar, ordered P0 alert → offline /
// error → world event. At most 2 banners show; the rest collapse into a "+N" count on the last visible banner,
// which opens the alerts sheet. Every banner pushes content down.
import { dispatchFeed, parseDeepLink, useFeedState } from "@/shell/feed";
import { openSheet, closeSheet } from "@/shell/sheetHost";
import { S } from "@/shell/strings";
import { Banner, pickAlert, WorldEventBanner, worldEventText, type Alert, type WorldEvent } from "./Banner";
import { LoadState } from "./LoadState";
import { useShell, useShellStore } from "./ShellContext";

export const MAX_PHONE_BANNERS = 2;
type Item = "alert" | "load" | "world";

/** Which banners show and how many collapse into "+N" (queued alerts count too). */
export function phoneStack(alerts: readonly Alert[], loadOpen: boolean, world: WorldEvent | null): { shown: Item[]; extra: number } {
  const { shown: a, queued } = pickAlert(alerts);
  const items: Item[] = [...(a ? ["alert" as const] : []), ...(loadOpen ? ["load" as const] : []), ...(world ? ["world" as const] : [])];
  return { shown: items.slice(0, MAX_PHONE_BANNERS), extra: Math.max(0, items.length - MAX_PHONE_BANNERS) + queued.length };
}

export function AlertsSheetBody({ alerts, world, load, onNavigate }: { alerts: readonly Alert[]; world: WorldEvent | null; load: string | null; onNavigate: (href: string) => void }) {
  return (
    <>
      <h2 className="label">{S.alerts}</h2>
      <ul className="alerts-list" data-testid="alerts-list">
        {pickAlert(alerts).shown && [pickAlert(alerts).shown!, ...pickAlert(alerts).queued].map((a) => (
          <li key={a.id} data-testid="alerts-item"><span>{a.text}</span>{" "}
            <a className="alert-action" href={a.action.href} onClick={(e) => { e.preventDefault(); closeSheet(); onNavigate(a.action.href); }}>{a.action.label}</a></li>
        ))}
        {load && <li data-testid="alerts-item">{load}</li>}
        {world && <li data-testid="alerts-item">{worldEventText(world)}</li>}
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
    content: <AlertsSheetBody alerts={feed.alerts} world={feed.world} load={loadOpen ? (sys.offline ? S.offline : S.couldntLoad) : null} onNavigate={navigate} /> });
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
