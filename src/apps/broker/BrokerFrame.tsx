"use client";
// Broker frame (UI card 4, BRK-A): one asset, one side, one whole quantity, market/day. The server previews, the
// server validates, the server acks; this file only schedules requests and picks which server string to show.
// Phases: edit -> review -> placed (pending until our IntentResult is on `me`, then the acked panel).
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { Sheet } from "@/components/shell/Sheet";
import { Button } from "@/components/ui/Button";
import type { PreviewRes, Side } from "@/shell/contracts/channels";
import { marketDayDraft, parseAssetId, parseQtyInput, placeOrder, previewOrder, type IntentId, type MarketDayDraft } from "@/shell/contracts/orders";
import { getFeed, useChannel } from "@/shell/contracts/useChannel";
import { viewportOf } from "@/shell/wm";
import { AssetHeader } from "./AssetHeader";
import { SimpleTicket } from "./SimpleTicket";
import { AckPanel, ReviewBlock, fillOf, orderIdOf } from "./TicketReview";
import { BR_STACK_SCALE, brStrings, reasonCopy } from "./strings";
import "./broker.css";

/** 19 Rule 3.8.5: never more than 5 preview requests per tick. */
export const MAX_PREVIEWS_PER_TICK = 5;
/** BRK spec: preview 300 ms after the last keystroke. */
export const PREVIEW_DEBOUNCE_MS = 300;

type Phase =
  | { kind: "edit" }
  | { kind: "review" }
  | { kind: "placed"; atTick: number; intentId: IntentId | null; failed: boolean };

interface Draft { assetId: string; side: Side; qtyText: string }
const draftKey = (d: MarketDayDraft): string => `${d.assetId}|${d.side}|${d.qty}`;
/** The asset select keeps its own letter keys (type-to-find). */
const isSelect = (el: EventTarget): boolean => el instanceof HTMLSelectElement;

export function BrokerFrame({ context }: { context?: string }) {
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const locale = useShell((s) => s.prefs.locale);
  const stacked = useShell((s) => s.prefs.textScale >= BR_STACK_SCALE);
  const t = brStrings(locale);
  const ticker = useChannel("ticker:wl_default");
  const me = useChannel("me");

  const choices = useMemo(() => (ticker.body ? Object.keys(ticker.body.rows).sort() : []), [ticker.body]);
  const fixedAsset = context ? parseAssetId(context) : null;
  const [draft, setDraft] = useState<Draft>({ assetId: fixedAsset ?? "", side: "BUY", qtyText: "" });
  const assetId = fixedAsset ?? (draft.assetId || choices[0] || "");
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "edit" });
  const [est, setEst] = useState<{ key: string; res: PreviewRes } | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const placing = useRef(false);

  const qty = parseQtyInput(draft.qtyText);
  const order = useMemo(() => {
    const a = parseAssetId(assetId);
    const q = parseQtyInput(draft.qtyText);
    return a && q.kind === "whole" ? marketDayDraft(a, draft.side, q.qty) : null;
  }, [assetId, draft.side, draft.qtyText]);
  const key = order ? draftKey(order) : null;
  const preview = est && est.key === key ? est.res : null;
  const tickerTick = ticker.tick;
  const frozen = ticker.state === "stale" || me.state === "stale";

  // Preview scheduling: one request 300 ms after the last edit, then one per new ticker tick while shown; a per-tick
  // budget caps both (19 Rule 3.8.5) and a sequence number drops replies to an older draft.
  const seq = useRef(0);
  const budget = useRef({ tick: -1, n: 0 });
  const tickRef = useRef(tickerTick);
  useEffect(() => { tickRef.current = tickerTick; });
  const request = useCallback((d: MarketDayDraft) => {
    const tk = tickRef.current ?? -1;
    if (budget.current.tick !== tk) budget.current = { tick: tk, n: 0 };
    if (budget.current.n >= MAX_PREVIEWS_PER_TICK) return;
    budget.current.n += 1;
    const mine = ++seq.current;
    void previewOrder(d).then((r) => { if (mine === seq.current && r.ok) setEst({ key: draftKey(d), res: r.value }); });
  }, []);
  const settled = phase.kind === "placed";
  useEffect(() => {
    if (!order || settled) return;
    const id = setTimeout(() => request(order), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [order, settled, request]);
  const shownRef = useRef<MarketDayDraft | null>(null);
  useEffect(() => { shownRef.current = preview && order && !settled ? order : null; });
  useEffect(() => {
    if (shownRef.current) request(shownRef.current);
  }, [tickerTick, request]);

  // Our IntentResult, once `me` carries it.
  const placed = phase.kind === "placed" ? phase : null;
  const result = placed?.intentId && me.body ? me.body.intents.find((i) => i.intentId === placed.intentId) ?? null : null;

  const row = ticker.body?.rows[assetId];
  const halted = row?.halted === true;
  const action = order ? (order.side === "BUY" ? t.actionBuy : t.actionSell)(order.qty, assetId) : "";
  const reviewStale = preview !== null && tickerTick !== null && preview.computedAtTick < tickerTick;
  const canReview = phase.kind === "edit" && preview !== null && preview.valid && !frozen;
  const canPlace = phase.kind === "review" && preview !== null && preview.valid && !reviewStale && !frozen;

  const setSide = (side: Side) => { if (phase.kind === "edit") setDraft((d) => ({ ...d, side })); };
  const toReview = () => { if (canReview) setPhase({ kind: "review" }); };
  /** Edit / Esc / scrim: back to the ticket, except while our intent is in flight. */
  const toEdit = () => { if (phase.kind === "review" || placed?.failed) { placing.current = false; setPhase({ kind: "edit" }); } };
  const place = () => {
    if (!canPlace || !order || placing.current) return;
    placing.current = true; // one placeOrder per Place, whatever clicks or Enters follow (17-AT-07)
    const atTick = me.tick ?? 0;
    setPhase({ kind: "placed", atTick, intentId: null, failed: false });
    void placeOrder(order).then((r) => {
      setPhase(r.ok ? { kind: "placed", atTick, intentId: r.value, failed: false } : { kind: "placed", atTick, intentId: null, failed: true });
    });
  };
  // The ack panel replaces the ticket, so focus moves to the quantity once the ticket is back in the DOM.
  const focusQty = useRef(false);
  useEffect(() => { if (focusQty.current && qtyRef.current) { focusQty.current = false; qtyRef.current.focus(); } });
  const newOrder = () => { placing.current = false; focusQty.current = true; setTouched(false); setDraft((d) => ({ ...d, qtyText: "" })); setPhase({ kind: "edit" }); };
  const editAfterReject = () => { placing.current = false; focusQty.current = true; setPhase({ kind: "edit" }); };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || isSelect(e.target)) return;
    const k = e.key.toLowerCase();
    if ((k === "b" || k === "s") && phase.kind === "edit") { e.preventDefault(); setSide(k === "b" ? "BUY" : "SELL"); return; }
    if (e.key !== "Enter" || e.target instanceof HTMLButtonElement) return; // a focused button activates itself
    if (phase.kind === "edit") { e.preventDefault(); toReview(); }
    else if (phase.kind === "review") { e.preventDefault(); place(); }
  };

  const retry = () => { getFeed().resync("ticker:wl_default"); getFeed().resync("me"); };
  const cls = ["br", phone && "br-phone", stacked && "br-stacked"].filter(Boolean).join(" ");

  if (ticker.state === "loading" || me.state === "loading") {
    return (
      <div className={cls} data-testid="broker" data-state="loading" aria-busy="true" aria-label={t.loading}>
        <div className="br-grid">
          <div className="br-col br-col-head"><div className="br-skel br-skel-head" data-testid="br-loading" /></div>
          <div className="br-col br-col-ticket"><div className="br-skel br-skel-ticket" /></div>
        </div>
      </div>
    );
  }
  if (ticker.body === null || me.body === null) {
    return (
      <div className={cls} data-testid="broker" data-state={ticker.body === null ? ticker.state : me.state}>
        <div className="br-error" data-testid="br-error">
          <span role="alert">{t.couldntLoad}</span>
          <Button data-testid="br-retry" onClick={retry}>{t.retry}</Button>
        </div>
      </div>
    );
  }

  const body = me.body;
  const holdQty = body.positions[assetId]?.qty ?? null;
  const qtyMessage = qty.kind === "notDigits" ? { text: t.qtyDigits, tone: "warn" as const }
    : qty.kind === "empty" && touched ? { text: t.qtyEmpty, tone: "muted" as const }
    : preview && !preview.valid ? { text: reasonCopy(t, preview.reasonCode ?? ""), tone: "warn" as const }
    : null;

  const reviewing = phase.kind === "review" || (placed !== null && result === null);
  const review = reviewing && (
    <ReviewBlock t={t} locale={locale} action={action} preview={preview} stale={reviewStale && phase.kind === "review"} halted={halted} canPlace={canPlace}
      pendingTick={placed && !placed.failed ? placed.atTick : null} failed={placed?.failed ?? false} onEdit={toEdit} onPlace={place} />
  );
  const ack = result && (
    <AckPanel t={t} locale={locale} ticker={assetId} result={result} fill={fillOf(result, body.fills)}
      queued={(() => { const id = orderIdOf(result); return id !== null && body.orders[id]?.status === "QUEUED_AUCTION"; })()}
      onNew={newOrder} onEdit={editAfterReject} />
  );
  const ticket = (
    <SimpleTicket t={t} locale={locale} side={draft.side} qtyText={draft.qtyText} qtyRef={qtyRef}
      onSide={setSide} onQty={(q) => { setTouched(true); setDraft((d) => ({ ...d, qtyText: q })); }} onQtyBlur={() => setTouched(true)}
      message={qtyMessage} preview={preview} reviewDisabled={!canReview} onReview={toReview} readOnly={phase.kind !== "edit"} />
  );

  return (
    <div className={cls} data-testid="broker" data-state={frozen ? "stale" : "live"} data-phase={result ? "acked" : phase.kind === "placed" ? "submitting" : phase.kind} onKeyDown={onKey}>
      <div className="br-grid">
        <div className="br-col br-col-head">
          <AssetHeader t={t} locale={locale} assetId={assetId} row={row} choices={fixedAsset ? null : choices}
            onPick={(a) => { if (phase.kind === "edit") setDraft((d) => ({ ...d, assetId: a })); }} holdQty={holdQty} cash={body.balances.FDL} />
          {frozen && <p className="br-updating muted" data-testid="br-updating">{t.updating}</p>}
        </div>
        <div className="br-col br-col-ticket">
          {ack || (phone ? ticket : review || ticket)}
          {phone && review && <Sheet side="bottom" label={action} onClose={toEdit} testId="br-sheet">{review}</Sheet>}
        </div>
      </div>
    </div>
  );
}
