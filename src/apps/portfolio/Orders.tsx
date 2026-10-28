"use client";
// Orders tab (UI card 8, 17B PF-C slice): section 1 is Broker's Open orders list as is (rows, status chips and the
// card 6 cancel flow: one list, one cancel, card 6's tests cover both apps); section 2 is Recent fills from `me.fills`.
// States follow the card: loading = 3 skeleton rows per section; stale = rows stay and the Open orders list says
// "Updating…" once for the tab; denied / error = one "Couldn't load" + Retry for the tab, so neither section renders.
// ENGINE-TBD: whether a halted market order's reopen fill reports AUCTION liquidity. The mock never fills a halted
//   order (it stays in Open orders as "Waits for reopen"); a fill that says AUCTION shows the Auction chip.
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { OpenOrders } from "@/apps/broker/OpenOrders";
import { brStrings } from "@/apps/broker/strings";
import { Button } from "@/components/ui/Button";
import { useShell } from "@/components/shell/ShellContext";
import type { MeTradingBody } from "@/shell/contracts/channels";
import { getFeed, useChannel, type ChannelView } from "@/shell/contracts/useChannel";
import { Fills, type FillsLayout } from "./Fills";
import { STACK_SCALE, pfStrings } from "./strings";
import "./orders.css";

const SKELETON_ROWS = 3;
/** The fills table needs a window this wide (card 8: desktop >= 640). */
export const FILLS_TABLE_MIN = 640;

export interface OrdersViewProps {
  me: ChannelView<MeTradingBody>;
  locale: string;
  phone: boolean;
  /** Text scale >= STACK_SCALE. */
  big: boolean;
  /** The Portfolio window is at least FILLS_TABLE_MIN wide (desktop). */
  wide: boolean;
  onRetry: () => void;
}

export function fillsLayout(phone: boolean, big: boolean, wide: boolean): FillsLayout {
  if (big) return { kind: "rows", lines: 3 };
  return !phone && wide ? { kind: "table" } : { kind: "rows", lines: 2 };
}

export function OrdersView({ me, locale, phone, big, wide, onRetry }: OrdersViewProps) {
  const t = pfStrings(locale);
  const br = brStrings(locale);
  const cls = `pf-orders${phone ? " pf-orders-phone" : ""}`;
  if (me.state === "loading") {
    return (
      <div className={cls} data-testid="pf-orders" data-state="loading" aria-busy="true">
        <Skeleton title={br.openOrders} testId="pf-oo-skel" />
        <Skeleton title={t.recentFills} testId="pf-fills-skel" />
      </div>
    );
  }
  if (me.body === null) {
    return (
      <div className={cls} data-testid="pf-orders" data-state={me.state}>
        <div className="pf-error" data-testid="pf-orders-error">
          <span role="alert">{t.couldntLoad}</span>
          <Button className="pf-retry" data-testid="pf-orders-retry" onClick={onRetry}>{t.retry}</Button>
        </div>
      </div>
    );
  }
  // The Broker list keys its layout on Broker's frame classes (openOrders.css): the same classes here give the same
  // rows, 44 px controls on phone and stacking at text scale >= 1.5.
  const host = ["br", "pf-oo-host", phone && "br-phone", big && "br-stacked"].filter(Boolean).join(" ");
  return (
    <div className={cls} data-testid="pf-orders" data-state={me.state}>
      <div className={host}>
        <div className="br-col-orders">
          <OpenOrders t={br} locale={locale} me={me} freshId={null} />
        </div>
      </div>
      <Fills locale={locale} fills={me.body.fills} layout={fillsLayout(phone, big, wide)} />
    </div>
  );
}

function Skeleton({ title, testId }: { title: string; testId: string }) {
  return (
    <section className="pf-orders-skel" data-testid={testId} aria-label={title}>
      <h3 className="pf-fills-title">{title}</h3>
      {Array.from({ length: SKELETON_ROWS }, (_, i) => <div key={i} className="pf-orders-skel-row" data-testid="pf-orders-skel-row" />)}
    </section>
  );
}

/** True while the Portfolio content box (`.pf`, the Positions container) is at least `min` px wide. */
function useWide(ref: RefObject<HTMLElement | null>, min: number): boolean {
  const [wide, setWide] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const box = el.closest(".pf") ?? el;
    const check = () => setWide(box.clientWidth >= min);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(box);
    return () => ro.disconnect();
  }, [ref, min]);
  return wide;
}

export function Orders({ phone }: { phone: boolean }) {
  const me = useChannel("me");
  const locale = useShell((s) => s.prefs.locale);
  const big = useShell((s) => s.prefs.textScale >= STACK_SCALE);
  const ref = useRef<HTMLDivElement>(null);
  const wide = useWide(ref, FILLS_TABLE_MIN);
  return (
    <div ref={ref} className="pf-orders-box">
      <OrdersView me={me} locale={locale} phone={phone} big={big} wide={wide} onRetry={() => getFeed().resync("me")} />
    </div>
  );
}
