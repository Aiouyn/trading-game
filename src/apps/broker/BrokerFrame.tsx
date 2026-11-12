"use client";
// Broker frame (UI cards 4 and 5, BRK-A/C): one asset, one side, one whole quantity, one day order of four types
// (market, limit, stop, stop limit), and the read-only Open orders list. The server previews, the server validates, the
// server acks; this file only schedules requests and picks which server string to show.
// Phases: edit -> review -> placed (pending until our IntentResult is on `me`, then the acked panel).
// UI card 7: the price chart sits in the header column (PriceChart; its plot is a lazy chunk). It reads its own
// `candles` channel, so it shows in the loading and error branches too when the asset is known.
// UI card 10: Trade | About under the header. About (AssetPage) replaces the ticket column in place; on phone it is a
// pushed screen. The draft and phase live here, so switching back finds the ticket as it was.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { Sheet } from "@/components/shell/Sheet";
import { Button } from "@/components/ui/Button";
import type { IntentResult, MeTradingBody, PreviewRes, Side } from "@/shell/contracts/channels";
import { dayDraft, parseAssetId, parsePriceInput, parseQtyInput, placeOrder, previewOrder, type DayDraft, type DayOrderType, type IntentId, type OrderTerms } from "@/shell/contracts/orders";
import { authoritativeFear, authoritativeQuoteProvenance, getFeed, knownOffline, useChannel } from "@/shell/contracts/useChannel";
import { viewportOf } from "@/shell/wm";
import { GoalSlot } from "@/apps/portfolio/GoalSlot";
import { PriceChart } from "@/components/market/PriceChart";
import { asDefault, retryableLazy } from "@/components/shell/retryableLazy";
import { AssetHeader } from "./AssetHeader";
import { OpenOrders } from "./OpenOrders";
import { OrderType, termsText, typeLabel } from "./OrderType";
import { PreviewRows, SimpleTicket } from "./SimpleTicket";
import { fillOf, orderIdOf } from "./ticketResult";
import { setTicketSubmitting, subscribeTicketPrefill, takeTicketPrefill } from "./ticketPrefill";
import { dropPlaced, notePlaced, releaseTickets, settlePlaced } from "./placedAcks";
import { BR_STACK_SCALE, reasonCopy } from "./strings-en";
import { useBrStrings } from "./useBrStrings";
import { ViewSwitch, type BrokerView } from "./ViewSwitch";
import "./broker.css";

const RetryableAssetPage = retryableLazy(() => import("./AssetPage"));
// Preload the review/ack chunk as soon as Broker is in the graph, and mount it without
// Suspense: React 19 defers a fast Suspense reveal on a timer, which never fires on a
// paused test clock, so Place and the review title never appeared (BR-6 Q1, PF-8).
const loadTicketReview = () => import("./TicketReview");
void loadTicketReview();
const RetryableReview = retryableLazy(async () => asDefault((await loadTicketReview()).ReviewBlock), { suspense: false });
const RetryableAck = retryableLazy(async () => asDefault((await loadTicketReview()).AckPanel), { suspense: false });

const panelFallback = (testId: string) => (
  <div className="br-skel br-skel-ticket" data-testid={testId} aria-busy="true" role="status" />
);

/** 19 Rule 3.8.5: never more than 5 preview requests per tick. */
export const MAX_PREVIEWS_PER_TICK = 5;
/** BRK spec: preview 300 ms after the last keystroke. */
export const PREVIEW_DEBOUNCE_MS = 300;

type Phase =
  | { kind: "edit" }
  | { kind: "review" }
  | { kind: "placed"; atTick: number; intentId: IntentId | null; failed: false | "error" | "offline" | "unknown" };

interface Draft { assetId: string; side: Side; type: DayOrderType; limitText: string; stopText: string; qtyText: string }
const draftKey = (d: DayDraft): string => `${d.assetId}|${d.side}|${d.type}|${d.qty}|${d.stop ?? ""}|${d.limit ?? ""}`;
/** The type's prices, once each box the type shows has a well-formed price; null otherwise. */
function termsOf(type: DayOrderType, limitText: string, stopText: string): OrderTerms | null {
  const limit = parsePriceInput(limitText);
  const stop = parsePriceInput(stopText);
  switch (type) {
    case "market": return { type };
    case "limit": return limit.kind === "price" ? { type, limit: limit.price } : null;
    case "stop": return stop.kind === "price" ? { type, stop: stop.price } : null;
    case "stop_limit": return stop.kind === "price" && limit.kind === "price" ? { type, stop: stop.price, limit: limit.price } : null;
  }
}
/** Keys typed inside the Open orders list or the price chart never drive the ticket (BR-5-07: a row is not a control). */
const inOpenOrders = (el: EventTarget): boolean => el instanceof Element && el.closest("[data-oo], [data-chart]") !== null;
/** The asset select keeps its own letter keys (type-to-find). */
const isSelect = (el: EventTarget): boolean => el instanceof HTMLSelectElement;

export function BrokerFrame({ context }: { context?: string }) {
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const locale = useShell((s) => s.prefs.locale);
  // Card 19: the server stopped answering after prices were live (feed backoff running): no new review or place until it is back.
  const lost = useShell((s) => s.channels.system.connection === "reconnecting");
  const stacked = useShell((s) => s.prefs.textScale >= BR_STACK_SCALE);
  const t = useBrStrings(locale);
  const ticker = useChannel("ticker:wl_default");
  const me = useChannel("me");

  const choices = useMemo(() => (ticker.body ? Object.keys(ticker.body.rows).sort() : []), [ticker.body]);
  const fixedAsset = context ? parseAssetId(context) : null;
  const [draft, setDraft] = useState<Draft>(() => {
    const pre = takeTicketPrefill();
    if (pre && fixedAsset && pre.assetId === fixedAsset) {
      return { assetId: fixedAsset, side: pre.side, type: "market", limitText: "", stopText: "", qtyText: pre.qtyText };
    }
    return { assetId: fixedAsset ?? "", side: "BUY", type: "market", limitText: "", stopText: "", qtyText: "" };
  });
  const assetId = fixedAsset ?? (draft.assetId || choices[0] || "");
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "edit" });
  // `epoch`: the reconnect epoch the estimate was asked in (card 24).
  const [est, setEst] = useState<{ key: string; res: PreviewRes; epoch: number } | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const placing = useRef(false);
  /** Card 41: this ticket's placedAcks entries not yet shown here, and the one for the current Place. */
  const placedIds = useRef<Set<number>>(new Set());
  const placedNow = useRef<number | null>(null);
  const focusQty = useRef(false);
  const [view, setView] = useState<BrokerView>("trade");
  /** Shared reset used by New order, Edit-after-reject, and a Positions Close prefill. Clears the in-flight place latch. */
  const toFreshEdit = (apply?: () => void) => {
    placing.current = false;
    setPhase({ kind: "edit" });
    apply?.();
  };
  const submittingRef = useRef(false);
  // Apply a later Close while this ticket is already mounted on the same asset. Never reviews or places.
  // Returns true only when this ticket consumed the prefill (same assetId); otherwise pending stays for the mount.
  // Mid-Place: consume and drop so nothing is held; the in-flight ack still lands.
  useEffect(() => subscribeTicketPrefill((p) => {
    const a = context ? parseAssetId(context) : null;
    if (!a || p.assetId !== a) return false;
    if (submittingRef.current) return true;
    toFreshEdit(() => {
      setDraft({ assetId: a, side: p.side, type: "market", limitText: "", stopText: "", qtyText: p.qtyText });
      setTouched(false);
      setView("trade");
    });
    return true;
  }), [context]);
  const viewBase = useId();
  const viewIds = { trade: `${viewBase}-trade`, about: `${viewBase}-about` };
  // Back to Trade: focus returns to the header's ticker heading (or the asset select) once Trade is rendered again.
  const headEl = useRef<HTMLElement | null>(null);
  const setHead = useCallback((el: HTMLElement | null) => { headEl.current = el; }, []);
  const focusHead = useRef(false);
  useEffect(() => { if (focusHead.current && view === "trade" && headEl.current) { focusHead.current = false; headEl.current.focus(); } });
  const toTrade = useCallback(() => { focusHead.current = true; setView("trade"); }, []);
  const onView = (v: BrokerView) => (v === "trade" ? toTrade() : setView("about"));

  const qty = parseQtyInput(draft.qtyText);
  const order = useMemo(() => {
    const a = parseAssetId(assetId);
    const q = parseQtyInput(draft.qtyText);
    const terms = termsOf(draft.type, draft.limitText, draft.stopText);
    return a && q.kind === "whole" && terms ? dayDraft(a, draft.side, q.qty, terms) : null;
  }, [assetId, draft.side, draft.qtyText, draft.type, draft.limitText, draft.stopText]);
  const key = order ? draftKey(order) : null;
  const preview = est && est.key === key ? est.res : null;
  const tickerTick = ticker.tick;
  const frozen = ticker.state === "stale" || me.state === "stale";
  // M2-05: the channel layer holds every view stale while the browser reports offline; say so on the ticket.
  const offline = frozen && knownOffline();

  // Preview scheduling: one request 300 ms after the last edit, then one per new ticker tick while shown; a per-tick
  // budget caps both (19 Rule 3.8.5) and a sequence number drops replies to an older draft. A request the budget
  // refused is sent on the next tick (QA #85 Q1): until a preview for the current inputs lands, Review stays disabled
  // and the ticket says "Refreshing estimate…".
  const seq = useRef(0);
  const budget = useRef({ tick: -1, n: 0 });
  const tickRef = useRef(tickerTick);
  const deferred = useRef(false);
  useEffect(() => { tickRef.current = tickerTick; });
  // Card 24: a restarted server can come back on the same or a lower tick (boot tick 27700), so "older tick" alone does
  // not catch an estimate priced before the outage. The epoch goes up once per reconnecting→live flip, which the feed
  // makes inside the first good adopt; healthy polls never flip it, so they never re-price (no flicker).
  const [epoch, setEpoch] = useState(0);
  const epochRef = useRef(0);
  const wasLost = useRef(lost);
  const request = useCallback((d: DayDraft) => {
    const tk = tickRef.current ?? -1;
    if (budget.current.tick !== tk) budget.current = { tick: tk, n: 0 };
    if (budget.current.n >= MAX_PREVIEWS_PER_TICK) { deferred.current = true; return; }
    budget.current.n += 1;
    const mine = ++seq.current;
    const asked = epochRef.current;
    void previewOrder(d).then((r) => { if (mine === seq.current && r.ok) setEst({ key: draftKey(d), res: r.value, epoch: asked }); });
  }, []);
  const settled = phase.kind === "placed";
  useEffect(() => {
    if (!order || settled) return;
    const id = setTimeout(() => request(order), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [order, settled, request]);
  const shownRef = useRef<{ draft: DayDraft; shown: boolean } | null>(null);
  useEffect(() => { shownRef.current = order && !settled ? { draft: order, shown: preview !== null } : null; });
  useEffect(() => {
    const cur = shownRef.current;
    if (!cur || !(cur.shown || deferred.current)) return;
    deferred.current = false;
    request(cur.draft);
  }, [tickerTick, request]);
  useEffect(() => {
    const back = wasLost.current && !lost;
    wasLost.current = lost;
    if (!back) return;
    epochRef.current += 1;
    setEpoch(epochRef.current);
    const cur = shownRef.current;
    if (!cur) return;
    budget.current = { tick: -1, n: 0 }; // the pre-outage tick's count must not hold back the one re-price
    deferred.current = false;
    request(cur.draft);
  }, [lost, request]);

  // Our IntentResult, once `me` carries it.
  const placed = phase.kind === "placed" ? phase : null;
  const result = placed?.intentId && me.body ? me.body.intents.find((i) => i.intentId === placed.intentId) ?? null : null;
  const submitting = phase.kind === "placed" && !placed?.failed && !(placed?.intentId && result);
  useLayoutEffect(() => {
    submittingRef.current = submitting;
    if (!assetId) return;
    setTicketSubmitting(assetId, submitting);
    return () => setTicketSubmitting(assetId, false);
  }, [submitting, assetId]);

  const row = ticker.body?.rows[assetId];
  const halted = row?.halted === true;
  const bare = order ? (order.side === "BUY" ? t.actionBuy : t.actionSell)(order.qty, assetId) : "";
  // Review title: action + terms for priced types ("Buy 40 HALC · Limit 42.10"); market keeps card 4's bare action.
  const action = order && order.type !== "market" ? t.actionTerms(bare, termsText(t, locale, order)) : bare;
  const reviewStale = preview !== null && ((tickerTick !== null && preview.computedAtTick < tickerTick) || (est !== null && est.epoch < epoch));
  const canReview = phase.kind === "edit" && preview !== null && preview.valid && !frozen && !lost;
  const canPlace = phase.kind === "review" && preview !== null && preview.valid && !reviewStale && !frozen && !lost;
  // Card 19: say why, next to the button, when it is the connection and not the draft.
  const reviewReason = lost ? t.reviewWaitConnection : frozen ? t.reviewWaitPrices : null;

  const setSide = (side: Side) => { if (phase.kind === "edit") setDraft((d) => ({ ...d, side })); };
  const setType = (type: DayOrderType) => { if (phase.kind === "edit") setDraft((d) => ({ ...d, type })); };
  const setPrice = (field: "limit" | "stop", text: string) => {
    if (phase.kind === "edit") setDraft((d) => (field === "limit" ? { ...d, limitText: text } : { ...d, stopText: text }));
  };
  const toReview = () => { if (canReview) setPhase({ kind: "review" }); };
  /** Edit / Esc / scrim: back to the ticket, except while our intent is in flight. */
  const toEdit = () => { if (phase.kind === "review" || placed?.failed) { placing.current = false; setPhase({ kind: "edit" }); } };
  const place = () => {
    if (!canPlace || !order || placing.current) return;
    placing.current = true; // one placeOrder per Place, whatever clicks or Enters follow (17-AT-07)
    const atTick = me.tick ?? 0;
    setPhase({ kind: "placed", atTick, intentId: null, failed: false });
    // Card 41: note the Place outside this component, so its outcome still shows if this ticket unmounts first.
    const pid = notePlaced(order.assetId);
    placedIds.current.add(pid);
    placedNow.current = pid;
    void placeOrder(order).then((r) => {
      settlePlaced(pid, r.ok ? { ok: true, intentId: r.value }
        : { ok: false, failed: r.error.kind === "offline" || r.error.kind === "unknown" ? r.error.kind : "error" });
      setPhase(r.ok ? { kind: "placed", atTick, intentId: r.value, failed: false }
        : { kind: "placed", atTick, intentId: null, failed: r.error.kind === "offline" || r.error.kind === "unknown" ? r.error.kind : "error" });
    });
  };
  // Card 41: this ticket showed the outcome itself (ack panel or the failed line): nothing left for the shell toast.
  const shownHere = result !== null || (placed !== null && placed.failed !== false);
  useEffect(() => {
    const pid = placedNow.current;
    if (!shownHere || pid === null) return;
    placedNow.current = null;
    placedIds.current.delete(pid);
    dropPlaced(pid);
  }, [shownHere]);
  // Unmounting before that (phone: another app opened; desktop: window closed) hands the outcome to the shell.
  useEffect(() => { const ids = placedIds.current; return () => releaseTickets(ids); }, []);
  // The ack panel replaces the ticket, so focus moves to the quantity once the ticket is back in the DOM.
  useEffect(() => { if (focusQty.current && qtyRef.current) { focusQty.current = false; qtyRef.current.focus(); } });
  const newOrder = () => { toFreshEdit(() => { focusQty.current = true; setTouched(false); setDraft((d) => ({ ...d, qtyText: "" })); }); };
  const editAfterReject = () => { toFreshEdit(() => { focusQty.current = true; }); };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || isSelect(e.target) || inOpenOrders(e.target)) return;
    const k = e.key.toLowerCase();
    if ((k === "b" || k === "s") && phase.kind === "edit") { e.preventDefault(); setSide(k === "b" ? "BUY" : "SELL"); return; }
    if (e.key !== "Enter" || e.target instanceof HTMLButtonElement) return; // a focused button activates itself
    if (phase.kind === "edit") { e.preventDefault(); toReview(); }
    else if (phase.kind === "review") {
      // Phone review sits in a Sheet over the ticket. Enter on the sheet chrome (or a lazy
      // skeleton) must not place; Enter on a ticket field still does (qty still focused).
      if (e.target instanceof HTMLElement && e.target.closest('[data-testid="br-sheet"]')) return;
      e.preventDefault();
      place();
    }
  };

  const retry = () => { getFeed().resync("ticker:wl_default"); getFeed().resync("me"); };
  const cls = ["br", phone && "br-phone", stacked && "br-stacked"].filter(Boolean).join(" ");
  const chartAsset = parseAssetId(assetId);
  const chart = chartAsset && (
    <PriceChart key={chartAsset} assetId={chartAsset} last={row?.last ?? null} halted={halted} frameStale={frozen} t={t} locale={locale} />
  );

  // Open orders reads `me` on its own (card 5 States): skeleton rows, Updating…, or its own Couldn't load + Retry.
  const restingId = result && result.status === "ACCEPTED" && me.body ? restingOrderId(result, me.body) : null;
  const orders = (
    <div className="br-col br-col-orders">
      <OpenOrders t={t} locale={locale} me={me} freshId={restingId !== null && me.tick === result?.tick ? restingId : null} />
    </div>
  );

  if (ticker.state === "loading" || me.state === "loading") {
    return (
      <div className={cls} data-testid="broker" data-state="loading" aria-busy="true" aria-label={t.loading}>
        <div className="br-grid">
          <div className="br-col br-col-head"><div className="br-skel br-skel-head" data-testid="br-loading" />{chart}</div>
          <div className="br-col br-col-ticket"><div className="br-skel br-skel-ticket" /></div>
          {orders}
        </div>
      </div>
    );
  }
  if (ticker.body === null || me.body === null) {
    return (
      <div className={cls} data-testid="broker" data-state={ticker.body === null ? ticker.state : me.state}>
        <div className="br-grid">
          {chart && <div className="br-col br-col-head">{chart}</div>}
          <div className="br-col br-col-ticket">
            <div className="br-error" data-testid="br-error">
              <span role="alert">{t.couldntLoad}</span>
              <Button data-testid="br-retry" onClick={retry}>{t.retry}</Button>
            </div>
          </div>
          {orders}
        </div>
      </div>
    );
  }

  const body = me.body;
  const holdQty = body.positions[assetId]?.qty ?? null;
  const header = (withChart: boolean) => (
    <div className="br-col br-col-head">
      <AssetHeader t={t} locale={locale} assetId={assetId} row={row} choices={fixedAsset ? null : choices} focusRef={setHead}
        provenance={authoritativeQuoteProvenance(ticker.tick)}
        fear={authoritativeFear()}
        onPick={(a) => { if (phase.kind === "edit") setDraft((d) => ({ ...d, assetId: a })); }} holdQty={holdQty} cash={body.balances.FDL} chart={withChart ? chart : undefined} />
      {frozen && <p className="br-updating muted" data-testid="br-updating">{t.updating}</p>}
      {(view === "trade" || !phone) && <ViewSwitch t={t} view={view} onView={onView} ids={viewIds} />}
    </div>
  );
  if (view === "about") {
    return (
      <div className={cls} data-testid="broker" data-state={frozen ? "stale" : "live"} data-view="about">
        <div className="br-grid">
          {header(false)}
          <div className="br-col br-col-ticket">
            <RetryableAssetPage t={t} locale={locale} id={viewIds.about} assetId={assetId} row={row} position={body.positions[assetId]} phone={phone} onTrade={toTrade}
              fallback={panelFallback("br-about-loading")} errorMessage={t.couldntLoad} retryLabel={t.retry}
              errorTestId="br-about-error" retryTestId="br-about-retry" />
          </div>
        </div>
        <p className="br-disclaimer muted" data-testid="br-disclaimer">{t.disclaimer}</p>
      </div>
    );
  }
  const qtyMessage = qty.kind === "notDigits" ? { text: t.qtyDigits, tone: "warn" as const }
    : qty.kind === "empty" && touched ? { text: t.qtyEmpty, tone: "muted" as const }
    : preview && !preview.valid ? { text: reasonCopy(t, preview.reasonCode ?? ""), tone: "warn" as const }
    : null;

  const reviewing = phase.kind === "review" || (placed !== null && result === null);
  const review = reviewing && (
    <RetryableReview t={t} locale={locale} action={action} preview={preview} stale={reviewStale && phase.kind === "review"} halted={halted} canPlace={canPlace} blockedReason={lost ? t.placeWaitConnection : null}
      pendingTick={placed && !placed.failed ? placed.atTick : null} failed={placed?.failed ?? false} offline={offline} onEdit={toEdit} onPlace={place}
      previewRows={preview ? <PreviewRows t={t} locale={locale} res={preview} stale={reviewStale && phase.kind === "review"} /> : null}
      fallback={panelFallback("br-review-loading")} errorMessage={t.couldntLoad} retryLabel={t.retry}
      errorTestId="br-review-error" retryTestId="br-review-retry" />
  );
  const ack = result && (
    <RetryableAck t={t} locale={locale} ticker={assetId} result={result} fill={fillOf(result, body.fills)}
      queued={(() => { const id = orderIdOf(result); return id !== null && body.orders[id]?.status === "QUEUED_AUCTION"; })()}
      resting={restingId !== null} onNew={newOrder} onEdit={editAfterReject}
      fallback={panelFallback("br-ack-loading")} errorMessage={t.couldntLoad} retryLabel={t.retry}
      errorTestId="br-ack-error" retryTestId="br-ack-retry" />
  );
  const ticket = (
    <SimpleTicket t={t} locale={locale} side={draft.side} qtyText={draft.qtyText} qtyRef={qtyRef}
      orderType={<OrderType t={t} type={draft.type} limitText={draft.limitText} stopText={draft.stopText} readOnly={phase.kind !== "edit"} stacked={stacked} onType={setType} onPrice={setPrice} />}
      kind={t.kindDay(typeLabel(t, draft.type))}
      onSide={setSide} onQty={(q) => { setTouched(true); setDraft((d) => ({ ...d, qtyText: q })); }} onQtyBlur={() => setTouched(true)}
      message={qtyMessage} preview={preview} pending={phase.kind === "edit" && order !== null && preview === null}
      reviewDisabled={!canReview} reviewReason={reviewReason} onReview={toReview} readOnly={phase.kind !== "edit"} />
  );

  return (
    <div className={cls} data-testid="broker" data-state={frozen ? "stale" : "live"} data-view="trade" data-phase={result ? "acked" : phase.kind === "placed" ? "submitting" : phase.kind} onKeyDown={onKey}>
      <div className="br-grid" id={viewIds.trade}>
        {header(true)}
        <div className="br-col br-col-ticket">
          {ack || (phone ? ticket : review || ticket)}
          {phone && review && <Sheet side="bottom" label={action} onClose={toEdit} testId="br-sheet">{review}</Sheet>}
          {!phone && <GoalSlot locale={locale} />}{/* M2-02 goal entry where no Portfolio window shows it (desktop 1024–1263) */}
        </div>
        {orders}
      </div>
        <p className="br-disclaimer muted" data-testid="br-disclaimer">{t.disclaimer}</p>
    </div>
  );
}

/** The order an ACCEPTED intent rested ("order:{id}" on `me.orders`, not queued for reopen); null for a fill. */
function restingOrderId(result: IntentResult, body: MeTradingBody): string | null {
  const id = orderIdOf(result);
  const o = id !== null ? body.orders[id] : undefined;
  return o && o.status !== "QUEUED_AUCTION" && fillOf(result, body.fills) === null ? o.orderId : null;
}
