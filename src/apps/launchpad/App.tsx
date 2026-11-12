"use client";
// Launchpad app (owner-restored meme-coin Launchpad). Reads GET /api/launchpad (public coins and curves, plus only the
// caller's own cash and holdings) and sends reviewed launches and trades to the server, which decides and saves them
// (src/server/launchpad). Every money action is two steps, Review then Confirm; the review is computed with the server's
// own curve rules, and the server refuses a fill worse than the reviewed one by more than 5%. Nothing completes locally: a
// result is shown only from the server's reply, then the board is read again. Keyed by account, so an account switch
// starts a fresh board with that account's reads only.
// Look and layout: the owner's first version board (origin/p10/integration launchpad/{LaunchpadApp,FeedTab,Board,
// TokenPage}.tsx): live trades bar, King of the Hill, New / Trending / Graduated / Holdings / Create, picture cards with
// the market cap first, and a coin page with candles (CoinCandles.tsx), the curve, the tape and the ticket beside it.
// L4: a coin whose curve sold its last token has graduated: it shows under Graduated with its Broker price and opens in
// the Broker, where it trades from then on (it is no longer traded here).
import { useCallback, useEffect, useRef, useState } from "react";
import { retryableLazy } from "@/components/shell/retryableLazy";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { isSignedIn, openAccountSettings, useAuthChrome } from "@/shell/authChrome";
import { viewportOf } from "@/shell/wm";
import {
  LP, TAGLINES, curveLeft, feeOf, graduationOf, impactBp, liquidationCents, marketCapCents, minAfterSlip, nameOk, priceText, quoteBuy, quoteSell, tickerOk,
  type Book, type Curve, type TaglineId,
} from "@/launchpad/rules";
import { DEFAULT_SORT, GRAD_CAP_CENTS, capOf, ago, barOf, feedOf, kingOf, progressOf, raisedOf, volOf, type BoardSort, type Feed } from "./boardModel";
import { BoardCard, KingBanner, StatusChip, TokenIcon, TradesBar } from "./Board";
import { LPS } from "./strings";
import "./launchpad.css";

// The charts are their own chunks, loaded when a coin page opens (the candles) or its step history is expanded.
const RetryableHistory = retryableLazy(() => import("./HistoryChart"));
const RetryableCandles = retryableLazy(() => import("./CoinCandles"));
const histFallback = (label: string) => (
  <div className="lpad-skel lpad-hist-skel" aria-busy="true" aria-label={label} data-testid="lp-hist-loading" />
);
const candleFallback = (label: string) => <div className="lpad-skel lpad-cc-skel" aria-busy="true" aria-label={label} data-testid="lp-candles-loading" />;

export const LAUNCHPAD_POLL_MS = 5_000;

interface Print { atMs: number; tick: number; side: "buy" | "sell"; tokens: number; cents: number; creator: boolean }
interface NpcAcct { cash: number; tokens: number; debt?: number }
interface NpcWorld { rg: string; f: number; att: number; ns: number; m: number; b?: number }
interface Npc {
  h: number; funded: number; vol: number; pools: Record<"retail" | "value" | "degen", NpcAcct>; tape: { tick: number; pool: string; side: "BUY" | "SELL"; qty: number; px: number; liq?: true }[];
  w?: NpcWorld | null; liq?: { st: string; t: number } | null; path?: { hypeVol: number; regimeVol: number | null; drift: number };
}
interface Grad { atMs: number; raise: number; fee: number; price: number; book: Book; mark: number | null; npc?: Npc | null }
interface Coin extends Curve { ticker: string; name: string; tagline: TaglineId; creator: string | null; mine: boolean; createdAtMs: number; holders: number; tape: Print[]; grad?: Grad | null }
interface Self { cashCents: number; spendableCents: number; holdings: Record<string, number>; live: number; nextLaunchAtMs: number | null }
interface View { coins: Coin[]; self: Self | null }
type Reply = { status: "accepted"; [k: string]: unknown } | { status: "refused"; code: string; message: string };

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n: number) => n.toLocaleString("en-US");
const pct = (bp: number) => `${(bp / 100).toFixed(2)}%`;
/** A listed coin's price (1e-8 $) with four significant digits, like the curve's price. */
const px8 = (m: number) => `$${(m / 1e8).toPrecision(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}`;
const key = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");

function parseView(v: unknown): View | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { coins?: unknown; self?: unknown };
  if (!Array.isArray(o.coins)) return null;
  const int = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
  const gradOk = (g: Grad | null | undefined) => !g || (int(g.atMs) && int(g.raise) && int(g.fee) && int(g.price) && !!g.book && int(g.book.cash) && int(g.book.tokens) && (g.mark === null || int(g.mark)) && npcOk(g.npc));
  const npcOk = (n: Npc | null | undefined) => !n || (typeof n.h === "number" && int(n.funded) && int(n.vol) && !!n.pools && (["retail", "value", "degen"] as const).every((k) => !!n.pools[k] && int(n.pools[k].cash) && int(n.pools[k].tokens)) && Array.isArray(n.tape));
  const coins = o.coins.filter((c): c is Coin => !!c && typeof c === "object" && typeof (c as Coin).ticker === "string" && Number.isSafeInteger((c as Coin).x) && Number.isSafeInteger((c as Coin).sold) && Array.isArray((c as Coin).tape) && gradOk((c as Coin).grad));
  return { coins, self: o.self && typeof o.self === "object" ? (o.self as Self) : null };
}

async function readView(): Promise<View | null> {
  const res = await fetch("/api/launchpad", { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" } });
  if (!res.ok) { await res.body?.cancel().catch(() => {}); return null; }
  return parseView(await res.json());
}

async function post(path: string, body: Record<string, unknown>): Promise<Reply | null> {
  try {
    const res = await fetch(path, { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => null)) as Reply | { error?: { message?: string; code?: string } } | null;
    if (j && "status" in j) return j;
    if (j && "error" in j && j.error) return { status: "refused", code: j.error.code ?? "ERROR", message: j.error.message ?? LPS.unknown };
    return null;
  } catch {
    return null; // the outcome is unknown; the next board read settles it
  }
}

export default function LaunchpadApp() {
  const auth = useAuthChrome();
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const id = isSignedIn(auth) ? auth.account.accountId : auth.status === "loading" ? null : "guest";
  return (
    <div className={`lpad${phone ? " lpad-phone" : ""}`} data-testid="launchpad">
      <div className="lpad-note" data-testid="lp-game-only">
        <p>{LPS.gameOnly}</p>
        <details className="lpad-how"><summary>{LPS.howItWorks}</summary><p>{LPS.risk}</p><p>{LPS.notCounted}</p></details>
      </div>
      {id === null ? <div className="lpad-skel" aria-busy="true" aria-label={LPS.loading} /> : <Board key={id} signedIn={id !== "guest"} />}
    </div>
  );
}

type Tab = Feed | "create";
const FEEDS: readonly { id: Feed; label: string }[] = [
  { id: "new", label: LPS.tabNew }, { id: "trending", label: LPS.tabTrending }, { id: "graduated", label: LPS.tabGraduated }, { id: "holdings", label: LPS.tabHoldings },
];
const SORTS: readonly { id: BoardSort; label: string }[] = [
  { id: "bump", label: LPS.sortBump }, { id: "cap", label: LPS.mcap }, { id: "created", label: LPS.sortCreated }, { id: "vol", label: LPS.sortVol }, { id: "curve", label: LPS.sortCurve },
];

function Board({ signedIn }: { signedIn: boolean }) {
  const store = useShellStore();
  const [{ view, state, now }, setBoard] = useState<{ view: View | null; state: "loading" | "error" | "live" | "stale"; now: number }>({ view: null, state: "loading", now: 0 });
  const [tab, setTab] = useState<Tab>("new");
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sortPick, setSortPick] = useState<Partial<Record<Feed, BoardSort>>>({});
  // The buy that graduated the selected coin: its result stays on screen in the coin's Graduated panel.
  const [gradNote, setGradNote] = useState<{ ticker: string; text: string } | null>(null);
  const seq = useRef(0);
  const top = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    let v: View | null = null;
    try { v = await readView(); } catch { v = null; }
    if (mine !== seq.current) return;
    const at = Date.now();
    setBoard((b) => (v ? { view: v, state: "live", now: at } : b.view ? { ...b, state: "stale", now: at } : { view: null, state: "error", now: at }));
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, LAUNCHPAD_POLL_MS);
    const reads = seq;
    return () => { clearInterval(t); reads.current++; };
  }, [load]);
  const open = (t: string) => { setSel(t); top.current?.scrollIntoView?.({ block: "start" }); };

  if (state === "loading") return <div className="lpad-skel" aria-busy="true" aria-label={LPS.loading} data-testid="lp-loading" />;
  if (state === "error" || !view) {
    return <div className="lpad-row2" data-testid="lp-error"><span role="alert">{LPS.couldntLoad}</span><Button onClick={() => { setBoard({ view: null, state: "loading", now: 0 }); void load(); }}>{LPS.retry}</Button></div>;
  }
  const holdings = view.self?.holdings ?? {};
  const coin = sel === null ? null : view.coins.find((c) => c.ticker === sel) ?? null;
  const banner = (
    <>
      {state === "stale" && <p className="lpad-msg" role="status" data-testid="lp-stale">{LPS.couldntUpdate}</p>}
      {!signedIn && (
        <div className="lpad-row2" data-testid="lp-signed-out"><span>{LPS.signedOut}</span><Button size="sm" onClick={() => openAccountSettings(store)}>{LPS.signIn}</Button></div>
      )}
      {signedIn && !view.self && <p className="lpad-msg" data-testid="lp-no-ledger">{LPS.unavailable}</p>}
    </>
  );
  if (sel !== null) {
    return (
      <div className="lpad-pagewrap" ref={top}>
        <div className="lpad-row2"><Button size="sm" variant="ghost" data-testid="lp-board-back" onClick={() => setSel(null)}>{LPS.backToBoard}</Button></div>
        {banner}
        {!coin ? <p className="lpad-sub" data-testid="lp-missing">{LPS.missing(sel)}</p>
          : coin.grad ? <GradPanel key={coin.ticker} coin={coin} grad={coin.grad} now={now} note={gradNote?.ticker === coin.ticker ? gradNote.text : null} />
            : <CoinPanel key={coin.ticker} coin={coin} self={view.self} now={now} onDone={load} onGraduated={(text) => setGradNote({ ticker: coin.ticker, text })} />}
      </div>
    );
  }
  const feed: Feed = tab === "create" ? "new" : tab;
  const sort = sortPick[feed] ?? DEFAULT_SORT[feed];
  const list = feedOf(view.coins, feed, holdings, q, sort);
  const self = view.self;
  const heldValue = self ? view.coins.reduce((s, c) => s + (c.grad ? 0 : liquidationCents(c, holdings[c.ticker] ?? 0)), 0) : 0;
  return (
    <div className="lpad-boardwrap" ref={top}>
      {banner}
      {self && (
        <div className="lpad-stats" data-testid="lp-stats">
          <div><span className="lpad-kicker">{LPS.statCash}</span><span className="num" data-testid="lp-spendable">{usd(self.spendableCents)}</span></div>
          <div><span className="lpad-kicker">{LPS.statLive}</span><span className="num">{`${self.live} / ${LP.MAX_LIVE}`}</span></div>
          <div><span className="lpad-kicker">{LPS.statHeld}</span><span className="num" data-testid="lp-held-value">{usd(heldValue)}</span></div>
        </div>
      )}
      {tab !== "holdings" && tab !== "create" && <TradesBar rows={barOf(view.coins)} now={now} onOpen={open} />}
      {tab === "new" && <KingBanner king={kingOf(view.coins)} now={now} onOpen={open} />}
      <div className="lpad-tabbar" role="tablist" aria-label={LPS.title}>
        {FEEDS.map((f) => (
          <button key={f.id} type="button" role="tab" className="lpad-tab" aria-selected={tab === f.id} data-testid={`lp-tab-${f.id}`} onClick={() => setTab(f.id)}>
            {f.label}{f.id === "holdings" && self ? <span className="lpad-badge num">{Object.values(holdings).filter((n) => n > 0).length}</span> : null}
          </button>
        ))}
        {self && <button type="button" role="tab" className="lpad-tab" aria-selected={tab === "create"} data-testid="lp-tab-create" onClick={() => setTab("create")}>{LPS.tabCreate}</button>}
      </div>
      {tab === "create" && self ? (
        <Create self={self} onDone={(t) => { void load(); setTab("new"); setSel(t); }} />
      ) : (
        <>
          <div className="lpad-filter">
            <input type="search" className="lpad-search" placeholder={LPS.search} aria-label={LPS.search} value={q} onChange={(e) => setQ(e.target.value)} data-testid="lp-search" />
            <select aria-label={LPS.sortLabel} value={sort} onChange={(e) => setSortPick((p) => ({ ...p, [feed]: e.target.value as BoardSort }))} data-testid="lp-sort">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <span className="lpad-faint">{LPS.count(list.length)}</span>
          </div>
          {list.length === 0 ? (
            <p className="lpad-sub lpad-empty" data-testid="lp-empty">{q.trim() ? LPS.noMatch : LPS.emptyFeed[feed]}</p>
          ) : (
            <div className="lpad-grid" data-testid={`lp-feed-${feed}`}>
              {list.map((c) => <BoardCard key={c.ticker} c={c} held={holdings[c.ticker] ?? 0} now={now} onOpen={open} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The coin's header (p10 TokenPage): icon, name, ticker, status, tagline, creator and age, then the key figures. */
function CoinHeader({ coin, now, children }: { coin: Coin; now: number; children?: React.ReactNode }) {
  return (
    <header className="lpad-panel lpad-head">
      <div className="lpad-head-id">
        <TokenIcon ticker={coin.ticker} size={96} />
        <div className="lpad-head-text">
          <h3 className="lpad-title" data-testid="lp-page-name">{coin.name}</h3>
          <span className="lpad-chips"><span className="lpad-tick" data-testid="lp-page-ticker">{coin.ticker}</span><StatusChip c={coin} />{coin.mine && <Chip outline>{LPS.yours}</Chip>}</span>
          <p className="lpad-sub">{TAGLINES[coin.tagline] ?? ""}</p>
          <p className="lpad-faint">{`${LPS.by(coin.creator)} · ${LPS.launchedAgo(ago(coin.createdAtMs, now))}`}</p>
        </div>
      </div>
      {children}
    </header>
  );
}

const Fact = ({ label, value, testId }: { label: string; value: string; testId?: string }) => (
  <div className="lpad-fact"><span className="lpad-kicker">{label}</span><span className="num" data-testid={testId}>{value}</span></div>
);

const QUICK_BUYS = [10, 50, 100, 500] as const;

function CoinPanel({ coin, self, now, onDone, onGraduated }: { coin: Coin; self: Self | null; now: number; onDone: () => Promise<void>; onGraduated: (text: string) => void }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<null | { key: string; amount: number; min: number }>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<null | { kind: "ok" | "refused" | "unknown"; text: string }>(null);
  const [steps, setSteps] = useState(false);
  const held = self?.holdings[coin.ticker] ?? 0;
  const progress = progressOf(coin);
  const n = side === "buy" ? Math.round(Number(amount) * 100) : Math.floor(Number(amount));
  const q = !Number.isFinite(n) || n <= 0 ? null : side === "buy" ? quoteBuy(coin, n) : quoteSell(coin, n);
  const why = !q ? null : !q.ok ? (q.why === "CURVE_FULL" ? `At most ${qty(curveLeft(coin))} tokens are left on this curve.` : q.why === "MIN" ? "The smallest buy is $1.00." : "Too small to fill.")
    : side === "buy" && self && n > self.spendableCents ? "More than your spendable cash." : side === "sell" && n > held ? "More than you hold." : null;
  const send = async () => {
    if (!review || busy) return;
    setBusy(true);
    const r = await post("/api/launchpad/trade", { idempotencyKey: review.key, ticker: coin.ticker, side, amount: review.amount, min: review.min });
    setBusy(false);
    if (!r) { setMsg({ kind: "unknown", text: LPS.unknown }); return; }
    if (r.status === "refused") setMsg({ kind: "refused", text: r.message });
    else {
      const text = (side === "buy" ? LPS.bought : LPS.soldMsg)(qty(r.tokens as number), coin.ticker, usd(r.cents as number)) + (r.graduated ? ` ${LPS.justGraduated(coin.ticker)}` : "");
      setMsg({ kind: "ok", text });
      if (r.graduated) onGraduated(text); // this panel gives way to the Graduated one on the reload below
    }
    setReview(null);
    setAmount("");
    await onDone();
  };
  const version = `${coin.x}/${coin.sold}/${coin.tape.length}/${coin.tape[0]?.atMs ?? 0}`;
  return (
    <section className="lpad-page" data-testid="lp-coin-panel" data-ticker={coin.ticker} aria-label={`${coin.ticker} ${coin.name}`}>
      <CoinHeader coin={coin} now={now}>
        <div className="lpad-facts">
          <Fact label={LPS.mcap} value={usd(marketCapCents(coin))} testId="lp-mcap" />
          <Fact label={LPS.price} value={priceText(coin)} testId="lp-price" />
          <Fact label={LPS.raised} value={usd(raisedOf(coin))} />
          <Fact label={LPS.volRecent} value={usd(volOf(coin))} />
          <Fact label={LPS.holdersLabel} value={qty(coin.holders)} testId="lp-holders" />
        </div>
      </CoinHeader>
      <div className="lpad-cols">
        <div className="lpad-panel lpad-area-chart">
          <RetryableCandles ticker={coin.ticker} version={version}
            fallback={candleFallback(LPS.hLoading)} errorMessage={LPS.couldntLoad} retryLabel={LPS.retry}
            errorTestId="lp-candles-chunk-error" retryTestId="lp-candles-chunk-retry" />
        </div>
        <aside className="lpad-panel lpad-area-ticket" data-testid="lp-ticket" aria-label={LPS.trade}>
          <span className="lpad-kicker">{LPS.trade}</span>
          {!self ? <p className="lpad-sub">{LPS.signedOut}</p> : <p data-testid="lp-held" data-qty={held}>{LPS.youHold(`${qty(held)} ${coin.ticker}`)}</p>}
          {self && !review && (
            <form className="lpad-ticket" onSubmit={(e) => { e.preventDefault(); if (q?.ok && !why) setReview({ key: key(), amount: n, min: minAfterSlip(q.ok && "tokens" in q ? q.tokens : (q as { pay: number }).pay) }); }}>
              <div className="lpad-sides" role="radiogroup" aria-label="Side">
                <button type="button" className="lpad-side" role="radio" aria-checked={side === "buy"} data-side="buy" data-testid="lp-side-buy" onClick={() => { setSide("buy"); setAmount(""); }}>{LPS.buy}</button>
                <button type="button" className="lpad-side" role="radio" aria-checked={side === "sell"} data-side="sell" data-testid="lp-side-sell" disabled={held === 0} onClick={() => { setSide("sell"); setAmount(""); }}>{LPS.sell}</button>
              </div>
              <label>{side === "buy" ? LPS.amountBuy : LPS.amountSell}
                <input data-testid="lp-amount" inputMode={side === "buy" ? "decimal" : "numeric"} value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" />
              </label>
              <div className="lpad-quick" data-testid="lp-quick">
                {side === "buy" ? (
                  <>
                    {QUICK_BUYS.map((d) => <button key={d} type="button" className="lpad-chipbtn" data-testid={`lp-quick-${d}`} onClick={() => setAmount(String(d))}>{`$${d}`}</button>)}
                    <button type="button" className="lpad-chipbtn" data-testid="lp-quick-max" onClick={() => setAmount((Math.floor(self.spendableCents) / 100).toFixed(2))}>{LPS.max}</button>
                  </>
                ) : (
                  <>
                    {[0.25, 0.5, 0.75].map((f) => <button key={f} type="button" className="lpad-chipbtn" data-testid={`lp-sell-${f * 100}`} onClick={() => setAmount(String(Math.floor(held * f)))}>{`${f * 100}%`}</button>)}
                    <button type="button" className="lpad-chipbtn" data-testid="lp-all" onClick={() => setAmount(String(held))}>{LPS.all}</button>
                  </>
                )}
              </div>
              {why && <p className="lpad-msg" data-kind="refused" data-testid="lp-why">{why}</p>}
              <Button type="submit" data-testid="lp-review" disabled={!q?.ok || !!why}>{side === "buy" ? LPS.reviewBuy : LPS.reviewSell}</Button>
              <p className="lpad-faint">{LPS.ticketNote}</p>
            </form>
          )}
          {self && review && q?.ok && <TradeReview coin={coin} side={side} self={self} q={q} asked={review.amount} min={review.min} busy={busy} onBack={() => setReview(null)} onConfirm={() => void send()} />}
          {msg && <p className="lpad-msg" role="status" data-kind={msg.kind} data-testid="lp-result">{msg.text}</p>}
        </aside>
        <div className="lpad-panel lpad-area-curve" data-testid="lp-status">
          <span className="lpad-kicker">{LPS.curveTitle}</span>
          <div className="lpad-curve">
            <progress className="lpad-progress" data-testid="lp-progress" max={LP.Y0 - LP.GRAD_Y} value={coin.sold} aria-label={LPS.progressLabel} aria-valuetext={LPS.progress(qty(coin.sold), qty(LP.Y0 - LP.GRAD_Y))} />
            <span className="num">{`${(progress * 100).toFixed(2)}%`}</span>
          </div>
          <p className="lpad-sub">{LPS.curveNote(usd(raisedOf(coin)), usd(GRAD_CAP_CENTS))}</p>
          <p className="lpad-faint">{LPS.gradRule(usd(coin.x - LP.X0), qty(curveLeft(coin)))}</p>
        </div>
        <div className="lpad-panel lpad-area-tape">
          <span className="lpad-kicker">{LPS.tape}</span>
          {coin.tape.length === 0 ? <p className="lpad-sub">{LPS.noTape}</p> : (
            <table className="lpad-trades" data-testid="lp-tape">
              <thead><tr><th>{LPS.colTime}</th><th>{LPS.colTrader}</th><th>{LPS.colSide}</th><th className="num">{LPS.colUsd}</th><th className="num lpad-wide">{LPS.colTokens}</th><th className="num lpad-wide">{LPS.avg}</th></tr></thead>
              <tbody>
                {coin.tape.slice(0, 20).map((p, i) => (
                  <tr key={`${p.atMs}-${i}`} data-side={p.side}>
                    <td className="lpad-faint">{ago(p.atMs, now) === "now" ? LPS.now : LPS.agoText(ago(p.atMs, now))}</td>
                    <td>{p.creator ? <Chip tone="steel" outline>{LPS.creatorFlag}</Chip> : <span className="lpad-faint">{LPS.barTrader}</span>}</td>
                    <td data-side={p.side}>{p.side === "buy" ? LPS.buy : LPS.sell}</td>
                    <td className="num">{usd(p.cents)}</td>
                    <td className="num lpad-wide">{qty(p.tokens)}</td>
                    <td className="num lpad-wide">{`$${(p.cents / 100 / p.tokens).toPrecision(4)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <details className="lpad-steps" onToggle={(e) => setSteps((e.currentTarget as HTMLDetailsElement).open)}>
            <summary data-testid="lp-steps-toggle">{LPS.stepsTitle}</summary>
            {steps && (
              <RetryableHistory ticker={coin.ticker} version={version}
                fallback={histFallback(LPS.hLoading)} errorMessage={LPS.couldntLoad} retryLabel={LPS.retry}
                errorTestId="lp-hist-error" retryTestId="lp-hist-retry" />
            )}
          </details>
        </div>
      </div>
    </section>
  );
}

function TradeReview({ coin, side, self, q, asked, min, busy, onBack, onConfirm }: {
  coin: Coin; side: "buy" | "sell"; self: Self; q: Extract<ReturnType<typeof quoteBuy> | ReturnType<typeof quoteSell>, { ok: true }>;
  asked: number; min: number; busy: boolean; onBack: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const buy = "tokens" in q;
  const tokens = buy ? q.tokens : coin.sold - q.next.sold;
  const cents = buy ? q.net + q.fee : q.pay;
  return (
    <div className="lpad-panel" data-testid="lp-review-panel" tabIndex={-1} ref={ref} aria-label={side === "buy" ? LPS.reviewBuy : LPS.reviewSell}>
      <dl className="lpad-dl">
        {buy ? <><dt>{LPS.youPay}</dt><dd className="num">{usd(cents)}</dd><dt>{LPS.youGet}</dt><dd className="num" data-testid="lp-est">{`${qty(tokens)} ${coin.ticker}`}</dd></>
          : <><dt>{LPS.sell}</dt><dd className="num">{`${qty(tokens)} ${coin.ticker}`}</dd><dt>{LPS.youReceive}</dt><dd className="num" data-testid="lp-est">{usd(cents)}</dd></>}
        <dt>{LPS.fee}</dt><dd className="num">{usd(q.fee)}</dd>
        <dt>{LPS.avg}</dt><dd className="num">{`$${((buy ? cents : q.gross) / 100 / tokens).toPrecision(4)}`}</dd>
        <dt>{LPS.impact}</dt><dd className="num">{pct(impactBp(coin, q.next))}</dd>
        <dt>{LPS.minAccepted}</dt><dd className="num">{buy ? `${qty(min)} ${coin.ticker}` : usd(min)}</dd>
        <dt>{LPS.cashAfter}</dt><dd className="num" data-testid="lp-cash-after">{usd(self.cashCents + (buy ? -cents : cents))}</dd>
      </dl>
      {"graduates" in q && q.graduates && (() => {
        const g = graduationOf(q.next);
        return (
          <div className="lpad-msg" data-testid="lp-review-graduates" role="note">
            <p>{LPS.clipped(qty(q.tokens), usd(cents), usd(asked))}</p>
            <p>{LPS.willGraduate(usd(g.raise), usd(g.fee), usd(g.book.cash))}</p>
          </div>
        );
      })()}
      <p className="lpad-sub">{LPS.risk}</p>
      <div className="lpad-actions">
        <Button variant="primary" data-testid="lp-confirm" disabled={busy} onClick={onConfirm}>{busy ? LPS.working : buy ? LPS.confirmBuy : LPS.confirmSell}</Button>
        <Button data-testid="lp-back" disabled={busy} onClick={onBack}>{LPS.back}</Button>
      </div>
    </div>
  );
}

/** A graduated coin: its graduation, its listing and Broker price now, its book, and the way to the Broker. */
function GradPanel({ coin, grad, now, note }: { coin: Coin; grad: Grad; now: number; note: string | null }) {
  const store = useShellStore();
  const noteRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { noteRef.current?.scrollIntoView?.({ block: "nearest" }); }, [note]); // the curve panel it replaced may have been scrolled
  return (
    <section className="lpad-page" data-testid="lp-grad-panel" data-ticker={coin.ticker} aria-label={`${coin.ticker} ${coin.name}`}>
      <CoinHeader coin={coin} now={now}>
        <div className="lpad-facts">
          <Fact label={LPS.mcap} value={usd(capOf(coin))} />
          <Fact label={LPS.markNow} value={grad.mark === null ? "—" : px8(grad.mark)} />
          <Fact label={LPS.raised} value={usd(grad.raise)} />
          <Fact label={LPS.holdersLabel} value={qty(coin.holders)} />
        </div>
      </CoinHeader>
      {note && <p className="lpad-msg" role="status" data-kind="ok" data-testid="lp-result" ref={noteRef}>{note}</p>}
      <div className="lpad-panel">
        <RetryableCandles ticker={coin.ticker} version={`grad/${grad.atMs}`}
          fallback={candleFallback(LPS.hLoading)} errorMessage={LPS.couldntLoad} retryLabel={LPS.retry}
          errorTestId="lp-candles-chunk-error" retryTestId="lp-candles-chunk-retry" />
      </div>
      <div className="lpad-panel">
      <p><b>{LPS.graduatedOn(new Date(grad.atMs).toLocaleString())}</b></p>
      <dl className="lpad-dl">
        <dt>{LPS.markNow}</dt><dd className="num" data-testid="lp-mark">{grad.mark === null ? "—" : px8(grad.mark)}</dd>
      </dl>
      <p className="lpad-sub" data-testid="lp-grad-detail">{LPS.gradDetail(usd(grad.raise), usd(grad.fee), usd(grad.raise - grad.fee))}</p>
      <p className="lpad-sub" data-testid="lp-listed-at">{LPS.listedAt(px8(grad.price))}</p>
      <p className="lpad-sub" data-testid="lp-book">{LPS.bookNow(usd(grad.book.cash), qty(grad.book.tokens))}</p>
      <p className="lpad-sub">{LPS.brokerOnly}</p>
      <h3>{LPS.npcTitle}</h3>
      <p className="lpad-sub">{LPS.npcRule}</p>
      {!grad.npc ? <p className="lpad-sub" data-testid="lp-npc-waiting">{LPS.npcWaiting}</p> : (
        <div data-testid="lp-npc">
          <ul className="lpad-tape" data-testid="lp-npc-pools">
            {(["retail", "value", "degen"] as const).map((k) => <li key={k} data-testid={`lp-npc-${k}`}><span>{LPS.npcPool(LPS.npcPools[k]!, qty(grad.npc!.pools[k].tokens), usd(grad.npc!.pools[k].cash))}</span></li>)}
          </ul>
          <p className="lpad-sub" data-testid="lp-npc-funded">{LPS.npcFunded(usd(grad.npc.funded), grad.npc.h.toFixed(2), qty(grad.npc.vol))}</p>
          {grad.npc.w && grad.npc.path && typeof grad.npc.w.f === "number" && typeof grad.npc.w.att === "number" && typeof grad.npc.w.m === "number" ? (
            <p className="lpad-sub" data-testid="lp-npc-inputs">{LPS.npcInputs(LPS.regimes[grad.npc.w.rg] ?? grad.npc.w.rg, grad.npc.w.f.toFixed(0), grad.npc.w.att.toFixed(2), LPS.newsSign(grad.npc.w.ns), grad.npc.w.m.toFixed(2), grad.npc.path.hypeVol.toFixed(2), grad.npc.path.drift.toFixed(2), (typeof grad.npc.w.b === "number" ? grad.npc.w.b : 0).toFixed(3))}</p>
          ) : null}
          {(() => {
            const d = grad.npc!.pools.degen;
            const debt = d.debt ?? 0;
            const st = grad.npc!.liq?.st;
            if (!st && debt <= 0) return null;
            const mark = grad.mark ?? grad.price;
            const notional = mark > 0 ? d.tokens * mark / 1e6 : 0; // cents approx at 8dp mark
            const eq = d.cash + notional - debt;
            const lev = eq > 0 ? (notional / eq) : 0;
            return <p className="lpad-sub" data-testid="lp-npc-degen-liq">{LPS.npcDegenLiq(LPS.npcLiqStatuses[st ?? "OK"] ?? (st ?? "OK"), lev.toFixed(2), usd(debt))}</p>;
          })()}
          {grad.npc.tape.length === 0 ? <p className="lpad-sub" data-testid="lp-npc-none">{LPS.npcNone}</p> : (
            <ul className="lpad-tape" data-testid="lp-npc-tape">
              {[...grad.npc.tape].reverse().slice(0, 8).map((t) => <li key={`${t.tick}-${t.pool}-${t.liq ? "liq" : "n"}`}><span>{LPS.npcPrint(LPS.npcPools[t.pool] ?? t.pool, t.side, qty(t.qty), px8(t.px), t.liq)}</span><span className="num">{`#${t.tick}`}</span></li>)}
            </ul>
          )}
        </div>
      )}
      </div>
      <div className="lpad-actions"><Button variant="primary" data-testid="lp-open-broker" onClick={() => store.getState().open("broker", coin.ticker)}>{LPS.openBroker}</Button></div>
    </section>
  );
}

function Create({ self, onDone }: { self: Self; onDone: (ticker: string) => void }) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [tagline, setTagline] = useState<TaglineId>("tg1");
  const [review, setReview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<null | { kind: "refused" | "unknown"; text: string }>(null);
  const cooling = self.nextLaunchAtMs !== null; // the server sends it only while the cooldown runs
  const ok = nameOk(name) && tickerOk(ticker) && !cooling && self.live < LP.MAX_LIVE && self.spendableCents >= LP.LAUNCH_FEE;
  const send = async () => {
    if (!review || busy) return;
    setBusy(true);
    const r = await post("/api/launchpad/launch", { idempotencyKey: review, name, ticker, tagline, fee: LP.LAUNCH_FEE });
    setBusy(false);
    if (!r) { setMsg({ kind: "unknown", text: LPS.unknown }); setReview(null); return; }
    if (r.status === "refused") { setMsg({ kind: "refused", text: r.message }); setReview(null); return; }
    onDone(ticker);
  };
  return (
    <section className="lpad-panel" data-testid="lp-create" aria-label={LPS.tabCreate}>
      <p className="lpad-sub">{LPS.createIntro}</p>
      <p className="lpad-sub">{LPS.limits}</p>
      {self.spendableCents < LP.LAUNCH_FEE && <p className="lpad-msg" data-testid="lp-launch-cash">{LPS.launchCash(usd(self.spendableCents))}</p>}
      {cooling && <p className="lpad-msg" data-testid="lp-cooldown">{LPS.nextLaunch(new Date(self.nextLaunchAtMs!).toLocaleString())}</p>}
      {!review ? (
        <form className="lpad-panel" onSubmit={(e) => { e.preventDefault(); if (ok) { setMsg(null); setReview(key()); } }}>
          <label>{LPS.name}<input data-testid="lp-name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} autoComplete="off" /><span>{LPS.nameHint}</span></label>
          <label>{LPS.ticker}<input data-testid="lp-ticker" value={ticker} maxLength={5} onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} autoComplete="off" /><span>{LPS.tickerHint}</span></label>
          <label>{LPS.tagline}
            <select data-testid="lp-tagline" value={tagline} onChange={(e) => setTagline(e.target.value as TaglineId)}>
              {Object.entries(TAGLINES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
          <div className="lpad-actions"><Button type="submit" data-testid="lp-review-launch" disabled={!ok}>{LPS.reviewLaunch}</Button></div>
        </form>
      ) : (
        <ReviewLaunch name={name} ticker={ticker} tagline={tagline} self={self} busy={busy} onBack={() => setReview(null)} onConfirm={() => void send()} />
      )}
      {msg && <p className="lpad-msg" role="status" data-kind={msg.kind} data-testid="lp-result">{msg.text}</p>}
    </section>
  );
}

function ReviewLaunch({ name, ticker, tagline, self, busy, onBack, onConfirm }: { name: string; ticker: string; tagline: TaglineId; self: Self; busy: boolean; onBack: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="lpad-panel" data-testid="lp-review-launch-panel" tabIndex={-1} ref={ref} aria-label={LPS.reviewLaunch}>
      <dl className="lpad-dl">
        <dt>{LPS.ticker}</dt><dd>{ticker}</dd>
        <dt>{LPS.name}</dt><dd>{name.trim()}</dd>
        <dt>{LPS.tagline}</dt><dd>{TAGLINES[tagline]}</dd>
        <dt>{LPS.launchFee}</dt><dd className="num" data-testid="lp-launch-fee">{usd(LP.LAUNCH_FEE)}</dd>
        <dt>{LPS.cashAfter}</dt><dd className="num" data-testid="lp-cash-after">{usd(self.cashCents - LP.LAUNCH_FEE)}</dd>
        <dt>{LPS.startPrice}</dt><dd className="num">{priceText({ x: LP.X0, sold: 0 })}</dd>
        <dt>{LPS.fee}</dt><dd className="num">{`${usd(feeOf(10_000).fee)} per $100 traded`}</dd>
      </dl>
      <p className="lpad-sub">{LPS.creatorShare}</p>
      <p className="lpad-sub">{LPS.gameOnly}</p>
      <div className="lpad-actions">
        <Button variant="primary" data-testid="lp-confirm-launch" disabled={busy} onClick={onConfirm}>{busy ? LPS.working : LPS.confirmLaunch}</Button>
        <Button data-testid="lp-back" disabled={busy} onClick={onBack}>{LPS.back}</Button>
      </div>
    </div>
  );
}
