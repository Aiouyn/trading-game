"use client";
// Open orders (UI card 5, BRK-C OrdersTabs slice): `me.orders` for every asset. Card 6 adds an inline Cancel per row
// (CancelControl): one confirm open per list, one `mkt.order.cancel` per "Yes, cancel", and the outcome read from `me`
// only (the row leaves when the order leaves `me.orders`; ENGINE-TBD rules are in orderPolicy.ts). Every value is the
// server's string (decText regroups for the locale); the list only sorts by tick numbers and orderId, never by money.
import { useEffect, useRef, useState, type AnimationEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { decText } from "@/apps/portfolio/positions/format";
import type { IntentResult, MeTradingBody, OpenOrder } from "@/shell/contracts/channels";
import { cancelOrder, parseOrderId, type IntentId } from "@/shell/contracts/orders";
import { getFeed, type ChannelView } from "@/shell/contracts/useChannel";
import { CancelControl, CancelNote, type CancelPhase } from "./CancelControl";
import { termsText } from "./OrderType";
import { cancelRejectCopy, type BrStrings } from "./strings";
import "./openOrders.css";

/** placedTick desc, then orderId (code-unit order). Ticks are numbers; nothing here is money. */
export function byRecent(a: OpenOrder, b: OpenOrder): number {
  if (a.placedTick !== b.placedTick) return a.placedTick > b.placedTick ? -1 : 1;
  return a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0;
}

export function statusText(t: BrStrings, status: string): string {
  if (status === "QUEUED_AUCTION") return t.haltedQueued;
  return status in t.s ? t.s[status as keyof BrStrings["s"]] : status;
}

export interface OpenOrdersProps {
  t: BrStrings;
  locale: string;
  me: ChannelView<MeTradingBody>;
  /** The order our last Place rested, during the tick its ack arrived (1-tick highlight). */
  freshId: string | null;
}

/** One "Yes, cancel" for an order. `intentId` is null until the transport answers; `failed` if it never did. */
interface Sent { order: OpenOrder; atTick: number; intentId: IntentId | null; failed: boolean; seq: number }

/** The text a row shows: side word, amount ("18 / 40 filled" once filled), ticker, terms. */
function rowWords(t: BrStrings, locale: string, o: OpenOrder) {
  const qty = decText(o.qty, locale);
  return {
    side: o.side === "BUY" ? t.buy : t.sell,
    sideName: t.sideName[o.side],
    terms: termsText(t, locale, o),
    amount: o.filled !== "0" ? t.filledOf(decText(o.filled, locale), qty) : qty,
  };
}

const resultOf = (intents: readonly IntentResult[], id: IntentId | null): IntentResult | null =>
  id === null ? null : (intents.findLast((i) => i.intentId === id) ?? null);

const cancelSel = (id: string) => `[data-testid="br-oo-row-${id}"] [data-testid="br-oo-cancel"]`;

type FocusReq = { kind: "cancel" | "keep" | "row"; id: string } | { kind: "afterRemove"; id: string; prev: readonly string[] };

export function OpenOrders({ t, locale, me, freshId }: OpenOrdersProps) {
  const body = me.body;
  const orders = body ? Object.values(body.orders).sort(byRecent) : [];
  const intents = body?.intents ?? [];
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [sent, setSent] = useState<Readonly<Record<string, Sent>>>({});
  /** The status line shows the newest finished cancel whose order left the list, if its seq is above this. */
  const [lineFrom, setLineFrom] = useState(0);
  const [settledGhosts, setSettledGhosts] = useState<ReadonlySet<string>>(new Set());
  const seq = useRef(0);
  /** Orders with a cancel on the wire (17-AT-07): a second press before React re-renders sends nothing. */
  const inFlight = useRef(new Set<string>());
  const sectionRef = useRef<HTMLElement>(null);
  const focusReq = useRef<FocusReq | null>(null);
  const shownIds = useRef<readonly string[]>([]);
  const live = me.state === "live";
  const present = new Set(orders.map((o) => o.orderId));

  // Finished cancels whose order left the list: the newest gives the status line (accepted, or the race's outcome).
  const gone = Object.entries(sent).filter(([id]) => !present.has(id)).map(([, s]) => ({ s, r: resultOf(intents, s.intentId) }));
  const lastGone = gone.filter((g) => g.r !== null && g.s.seq > lineFrom).sort((a, b) => b.s.seq - a.s.seq)[0];
  const line = lastGone ? lineText(t, locale, lastGone.s.order, lastGone.r!) : null;
  // Rows collapsing out (height on --dur-base; instant under reduced motion): accepted this tick, not yet animated.
  const ghosts = gone.filter((g) => g.r?.status === "ACCEPTED" && g.r.tick === me.tick && !settledGhosts.has(g.s.order.orderId)).map((g) => g.s.order);

  useEffect(() => {
    const ids = orders.map((o) => o.orderId);
    const prev = shownIds.current;
    shownIds.current = ids;
    const removed = prev.find((id) => !ids.includes(id) && sent[id] !== undefined);
    const root = sectionRef.current;
    if (!root) return;
    const active = root.ownerDocument.activeElement;
    // The row that held focus is gone: next row's Cancel, else the previous, else the heading.
    if (removed && (active === null || active === root.ownerDocument.body || !root.contains(active) || active.closest("[data-leaving]"))) {
      focusReq.current = { kind: "afterRemove", id: removed, prev };
    }
    const req = focusReq.current;
    if (!req) return;
    focusReq.current = null;
    if (req.kind === "afterRemove") {
      const i = req.prev.indexOf(req.id);
      const after = req.prev.slice(i + 1).find((id) => ids.includes(id));
      const before = req.prev.slice(0, i).reverse().find((id) => ids.includes(id));
      const target = [after, before].flatMap((id) => (id === undefined ? [] : [root.querySelector<HTMLElement>(cancelSel(id)) ?? root.querySelector<HTMLElement>(`[data-testid="br-oo-row-${id}"]`)]))[0];
      (target ?? root.querySelector<HTMLElement>("#br-oo-title"))?.focus();
      return;
    }
    const sel = req.kind === "cancel" ? cancelSel(req.id) : req.kind === "keep" ? `[data-testid="br-oo-row-${req.id}"] [data-testid="br-oo-keep"]` : `[data-testid="br-oo-row-${req.id}"]`;
    root.querySelector<HTMLElement>(sel)?.focus();
  });

  const onCancel = (o: OpenOrder) => {
    if (!live) return;
    setSent((s) => { const { [o.orderId]: _old, ...rest } = s; void _old; return rest; }); // clears this row's note
    setConfirmId(o.orderId);
    focusReq.current = { kind: "keep", id: o.orderId };
  };
  const onKeep = (o: OpenOrder) => {
    setConfirmId(null);
    focusReq.current = { kind: "cancel", id: o.orderId };
  };
  const onYes = (o: OpenOrder) => {
    if (inFlight.current.has(o.orderId)) return;
    inFlight.current.add(o.orderId);
    const n = ++seq.current;
    const id = o.orderId;
    setConfirmId(null);
    setSent((s) => ({ ...s, [id]: { order: o, atTick: me.tick ?? 0, intentId: null, failed: false, seq: n } }));
    focusReq.current = { kind: "row", id };
    const settle = (patch: Partial<Sent>) => {
      inFlight.current.delete(id);
      setSent((s) => (s[id]?.seq === n ? { ...s, [id]: { ...s[id], ...patch } } : s));
    };
    const orderId = parseOrderId(id);
    if (!orderId) return settle({ failed: true });
    cancelOrder(orderId).then((r) => settle(r.ok ? { intentId: r.value } : { failed: true }), () => settle({ failed: true }));
  };
  // The next user action in the list clears the status line.
  const clearLine = () => { if (line !== null) setLineFrom(seq.current); };
  const onGhostEnd = (e: AnimationEvent<HTMLLIElement>, id: string) => {
    if (e.target === e.currentTarget) setSettledGhosts((g) => new Set(g).add(id));
  };

  const rows = [...orders.map((o) => ({ o, ghost: false })), ...ghosts.map((o) => ({ o, ghost: true }))].sort((a, b) => byRecent(a.o, b.o));
  return (
    <section ref={sectionRef} className="br-oo" data-testid="br-oo" data-oo="1" data-state={me.state} aria-labelledby="br-oo-title" aria-busy={me.state === "loading" || undefined}
      onKeyDownCapture={clearLine} onClickCapture={clearLine}>
      <h3 id="br-oo-title" className="br-oo-title" tabIndex={-1}>
        {t.openOrders}
        {body && <span className="br-oo-count num muted" data-testid="br-oo-count">{String(orders.length)}</span>}
      </h3>
      {me.state === "loading" && (
        <div className="br-oo-skel" data-testid="br-oo-loading" aria-label={t.loadingOrders}>
          <div className="br-skel br-oo-skel-row" />
          <div className="br-skel br-oo-skel-row" />
        </div>
      )}
      {(me.state === "denied" || me.state === "error") && (
        <div className="br-oo-error" data-testid="br-oo-error">
          <span>{t.couldntLoad}</span>
          <Button data-testid="br-oo-retry" onClick={() => getFeed().resync("me")}>{t.retry}</Button>
        </div>
      )}
      {me.state === "stale" && <p className="br-oo-updating muted" data-testid="br-oo-updating">{t.updating}</p>}
      <p className="br-oo-line" role="status" data-testid="br-oo-line">{line}</p>
      {body && orders.length === 0 && <p className="br-oo-empty muted" data-testid="br-oo-empty">{t.noOpenOrders}</p>}
      {rows.length > 0 && (
        <ul className="br-oo-list" data-testid="br-oo-list">
          {rows.map(({ o, ghost }) => {
            if (ghost) return <Ghost key={o.orderId} t={t} locale={locale} o={o} onEnd={(e) => onGhostEnd(e, o.orderId)} />;
            const s = sent[o.orderId];
            const r = s ? resultOf(intents, s.intentId) : null;
            const phase: CancelPhase = s && !s.failed && r === null ? { kind: "cancelling", atTick: s.atTick }
              : confirmId === o.orderId ? { kind: "confirm" } : { kind: "idle", disabled: !live };
            const note = s?.failed ? t.cancelSendFailed : r?.status === "REJECTED" ? cancelRejectCopy(t, r.rejectCode ?? "", r.rejectParams) : null;
            return (
              <Row key={o.orderId} t={t} locale={locale} o={o} fresh={o.orderId === freshId} phase={phase} note={note}
                onCancel={() => onCancel(o)} onKeep={() => onKeep(o)} onYes={() => onYes(o)} />
            );
          })}
        </ul>
      )}
    </section>
  );
}

function lineText(t: BrStrings, locale: string, o: OpenOrder, r: IntentResult): string {
  if (r.status === "REJECTED") return cancelRejectCopy(t, r.rejectCode ?? "", r.rejectParams);
  const w = rowWords(t, locale, o);
  return t.cancelled(w.sideName, w.amount, o.assetId, w.terms);
}

interface RowProps {
  t: BrStrings; locale: string; o: OpenOrder; fresh: boolean; phase: CancelPhase; note: string | null;
  onCancel: () => void; onKeep: () => void; onYes: () => void;
}

function Row({ t, locale, o, fresh, phase, note, onCancel, onKeep, onYes }: RowProps) {
  const w = rowWords(t, locale, o);
  const status = statusText(t, o.status);
  return (
    <li className={`br-oo-row${fresh ? " fresh" : ""}`} data-testid={`br-oo-row-${o.orderId}`} data-fresh={fresh ? "1" : undefined} data-status={o.status}
      data-cancel={phase.kind} aria-busy={phase.kind === "cancelling" || undefined}
      tabIndex={0} aria-label={t.rowAria(w.side, w.amount, o.assetId, w.terms, status)}>
      <Cells t={t} o={o} w={w} status={status} />
      <CancelControl t={t} phase={phase} label={t.cancelAria(w.sideName, w.amount, o.assetId, w.terms)} onCancel={onCancel} onKeep={onKeep} onYes={onYes} />
      {note !== null && <CancelNote text={note} />}
    </li>
  );
}

function Cells({ t, o, w, status }: { t: BrStrings; o: OpenOrder; w: ReturnType<typeof rowWords>; status: string }) {
  return (
    <>
      <span className="br-oo-side" data-testid="br-oo-side">{w.side}</span>
      <span className="br-oo-ticker" data-testid="br-oo-ticker">{o.assetId}</span>
      <span className="br-oo-terms num" data-testid="br-oo-terms">{w.terms}</span>
      <span className="br-oo-qty num" data-testid="br-oo-qty">{w.amount}</span>
      <Chip className="br-oo-chip" data-testid="br-oo-status">{status}</Chip>
      <span className="br-oo-meta muted" data-testid="br-oo-meta">{t.rowMeta(String(o.placedTick))}</span>
    </>
  );
}

/** A cancelled row collapsing out: hidden from assistive tech, no controls. */
function Ghost({ t, locale, o, onEnd }: { t: BrStrings; locale: string; o: OpenOrder; onEnd: (e: AnimationEvent<HTMLLIElement>) => void }) {
  return (
    <li className="br-oo-row br-oo-leaving" data-testid={`br-oo-leaving-${o.orderId}`} data-leaving="1" aria-hidden="true" onAnimationEnd={onEnd}>
      <Cells t={t} o={o} w={rowWords(t, locale, o)} status={statusText(t, o.status)} />
    </li>
  );
}
