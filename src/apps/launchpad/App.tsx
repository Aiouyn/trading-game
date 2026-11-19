"use client";
// The Launchpad: the first version's board and coin page (New, Bumped, Trending, Holdings, Create), fed by the sim's
// memecoins. The board is the view's coinBoard and coinTape; a coin page reads its candles and its detail from
// /api/sim/history?instr=coin:..., and every launch and trade goes through act(). The sim decides every outcome; a
// result is shown only from the sim's reply.
import { useEffect, useRef, useState } from "react";
import { retryableLazy } from "@/components/shell/retryableLazy";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { act, useSimSnap, type SimView } from "@/shell/simSession";
import { BoardCard, KingBanner, TokenIcon, TradesBar } from "./Board";
import {
  DEFAULT_SORT, FEEDS, LAUNCH_FEE, LAUNCH_SEED, MAX_LIVE, agoDays, coinsOf, dayLabel, feedOf, heldOf, kingOf, perToken, qty, quoteBuy, quoteSell,
  tapeOf, usd, type ChartRead, type Coin, type CoinPage, type Feed, type Sort,
} from "./model";
import { setLaunchpadOpen } from "./notes";
import { LPS } from "./strings";
import "./launchpad.css";

// The candles are their own chunk, loaded when a coin page opens.
const RetryableCandles = retryableLazy(() => import("./CoinCandles"));
const candleFallback = <div className="lpad-skel lpad-cc-skel" aria-busy="true" aria-label={LPS.chartLoading} data-testid="lp-candles-loading" />;

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .'&-]{2,23}$/;
const TICKER_RE = /^[A-Za-z]{3,5}$/;
const SORTS: { id: Sort; label: string }[] = [
  { id: "created", label: LPS.sortCreated }, { id: "bumped", label: LPS.sortBumped }, { id: "cap", label: LPS.sortCap }, { id: "vol", label: LPS.sortVol },
];
const FEED_LABEL: Record<Feed, string> = { new: LPS.tabNew, bumped: LPS.tabBumped, trending: LPS.tabTrending, holdings: LPS.tabHoldings };

/** Whole cents from a dollar field: 0 when empty, null when it is not a positive amount. */
function centsOf(s: string): number | null {
  const t = s.trim().replace(/[$,\s]/g, "");
  if (t === "") return 0;
  const x = Number(t);
  if (!Number.isFinite(x) || x < 0) return null;
  return Math.round(x * 100);
}

export default function LaunchpadApp() {
  const { view } = useSimSnap();
  const [sel, setSel] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setLaunchpadOpen(true);
    return () => setLaunchpadOpen(false);
  }, []);
  if (!view) {
    return (
      <div className="lpad" data-testid="launchpad">
        <h2>{LPS.title}</h2>
        <div className="lpad-skel" aria-busy="true" aria-label={LPS.loading} data-testid="lp-loading" />
      </div>
    );
  }
  const open = (id: string) => { setSel(id); top.current?.scrollIntoView?.({ block: "start" }); };
  return (
    <div className="lpad" data-testid="launchpad" ref={top}>
      <h2>{LPS.title}</h2>
      <div className="lpad-note" data-testid="lp-game-only"><p>{LPS.gameOnly}</p><p>{LPS.risk}</p></div>
      {sel === null ? <Board view={view} onOpen={open} /> : <CoinPageView view={view} id={sel} onBack={() => setSel(null)} />}
    </div>
  );
}

function Board({ view, onOpen }: { view: SimView; onOpen: (id: string) => void }) {
  const [tab, setTab] = useState<Feed | "create">("new");
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT.new);
  const [q, setQ] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const coins = coinsOf(view);
  const held = heldOf(view);
  const day = view.date.abs;
  const pick = (f: Feed) => { setTab(f); setSort(DEFAULT_SORT[f]); };
  const live = coins.filter((c) => c.live).length;
  const heldValue = coins.reduce((s, c) => (held[c.id] ? s + quoteSell(c.cash, c.tokens, held[c.id]!) : s), 0);
  const list = tab === "create" ? [] : feedOf(coins, tab, held, q, sort);
  return (
    <div className="lpad-boardwrap">
      <div className="lpad-stats" data-testid="lp-stats">
        <div><span className="lpad-kicker">Cash</span><span className="num" data-testid="lp-spendable">{usd(view.cash)}</span></div>
        <div><span className="lpad-kicker">Live</span><span className="num">{`${live} / ${MAX_LIVE}`}</span></div>
        <div><span className="lpad-kicker">Coins held</span><span className="num" data-testid="lp-held-value">{usd(heldValue)}</span></div>
      </div>
      {flash && <p className="lpad-msg" role="status" data-testid="lp-flash">{flash}</p>}
      <TradesBar rows={tapeOf(view)} day={day} onOpen={onOpen} />
      <KingBanner king={kingOf(coins)} day={day} onOpen={onOpen} />
      <div className="lpad-tabbar" role="tablist" aria-label={LPS.title}>
        {FEEDS.map((f) => (
          <button key={f} type="button" role="tab" className="lpad-tab" aria-selected={tab === f} data-testid={`lp-tab-${f}`} onClick={() => pick(f)}>
            {FEED_LABEL[f]}
            {f === "holdings" && Object.keys(held).length > 0 ? <span className="lpad-badge num">{Object.keys(held).length}</span> : null}
          </button>
        ))}
        <button type="button" role="tab" className="lpad-tab" aria-selected={tab === "create"} data-testid="lp-tab-create" onClick={() => setTab("create")}>{LPS.tabCreate}</button>
      </div>
      {tab === "create" ? (
        <Create view={view} live={live} onDone={(text) => { setFlash(text); pick("new"); }} />
      ) : (
        <>
          <div className="lpad-filter">
            <input type="search" className="lpad-search" placeholder={LPS.search} aria-label={LPS.search} value={q} onChange={(e) => setQ(e.target.value)} data-testid="lp-search" />
            <select aria-label={LPS.sort} value={sort} onChange={(e) => setSort(e.target.value as Sort)} data-testid="lp-sort">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <span className="lpad-faint">{LPS.count(list.length)}</span>
          </div>
          {list.length === 0 ? (
            <p className="lpad-empty lpad-sub" data-testid="lp-empty">{tab === "holdings" ? LPS.emptyHoldings : LPS.empty}</p>
          ) : (
            <div className="lpad-grid" data-testid="lp-coins">
              {list.map((c) => <BoardCard key={c.id} c={c} held={held[c.id] ?? 0} day={day} onOpen={onOpen} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Launch your own coin: a name, a ticker and an optional starting buy. The sim takes the fee and the seed from cash. */
function Create({ view, live, onDone }: { view: SimView; live: number; onDone: (text: string) => void }) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [buy, setBuy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cents = centsOf(buy);
  const nameOk = NAME_RE.test(name.trim());
  const tickerOk = TICKER_RE.test(ticker.trim());
  const need = LAUNCH_FEE + LAUNCH_SEED + (cents ?? 0);
  const full = live >= MAX_LIVE;
  const can = nameOk && tickerOk && cents !== null && view.cash >= need && !full && !busy;
  const submit = async () => {
    if (!can || cents === null) return;
    setBusy(true);
    setErr(null);
    const t = ticker.trim().toUpperCase();
    const body: Record<string, unknown> = { kind: "launch", name: name.trim(), ticker: t };
    if (cents > 0) body.buy = cents;
    const r = await act(body);
    setBusy(false);
    if (r.ok) { setName(""); setTicker(""); setBuy(""); onDone(LPS.launched(t)); }
    else setErr(r.text);
  };
  return (
    <section className="lpad-panel" data-testid="lp-create">
      <p className="lpad-sub">{LPS.createIntro}</p>
      <label>{LPS.name}<input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} data-testid="lp-name" /></label>
      <span className="lpad-faint">{LPS.nameHint}</span>
      <label>{LPS.ticker}<input value={ticker} maxLength={5} onChange={(e) => setTicker(e.target.value.toUpperCase())} data-testid="lp-ticker" /></label>
      <span className="lpad-faint">{LPS.tickerHint}</span>
      <label>{LPS.startBuy}<input inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value)} data-testid="lp-buy" /></label>
      <p className="lpad-sub">{LPS.costLine(usd(LAUNCH_FEE), usd(LAUNCH_SEED))}</p>
      <p className="lpad-sub">{LPS.cashLine(usd(view.cash))}{view.cash < need ? ` ${usd(need)} needed.` : ""}</p>
      {full && <p className="lpad-msg">{LPS.liveCap(live, MAX_LIVE)}</p>}
      {err && <p className="lpad-msg" role="alert" data-testid="lp-create-error">{err}</p>}
      <div className="lpad-row2">
        <Button variant="primary" disabled={!can} data-testid="lp-launch" onClick={() => void submit()}>{busy ? LPS.launching : LPS.launch}</Button>
      </div>
    </section>
  );
}

function CoinPageView({ view, id, onBack }: { view: SimView; id: string; onBack: () => void }) {
  const coin = coinsOf(view).find((c) => c.id === id) ?? null;
  const day = view.date.abs;
  const [tf, setTf] = useState<"d" | "i">("d");
  const [read, setRead] = useState<ChartRead | null>(null);
  const [failed, setFailed] = useState(false);
  // Re-read the page when the coin, the day or its trades move: the view says when, the chart is read on demand.
  const stamp = coin ? `${coin.px}:${coin.vol}:${coin.replies}:${coin.holders}:${coin.lastDay}:${day}` : "none";
  useEffect(() => {
    const ctl = new AbortController();
    setFailed(false);
    void (async () => {
      try {
        const res = await fetch(`/api/sim/history?instr=${encodeURIComponent(id)}&tf=${tf}&limit=300`, { cache: "no-store", signal: ctl.signal });
        if (!res.ok) { if (!ctl.signal.aborted) setFailed(true); return; }
        const j = (await res.json()) as { bars?: ChartRead["bars"]; ticks?: number; day?: number; coin?: CoinPage };
        if (ctl.signal.aborted) return;
        setRead({ bars: Array.isArray(j.bars) ? j.bars : [], ticks: j.ticks && j.ticks > 0 ? j.ticks : 1, day: j.day ?? day, coin: j.coin });
      } catch {
        if (!ctl.signal.aborted) setFailed(true);
      }
    })();
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tf, stamp]);

  const back = (
    <div className="lpad-row2"><Button size="sm" variant="ghost" data-testid="lp-board-back" onClick={onBack}>{LPS.back}</Button></div>
  );
  if (!coin) return <>{back}<p className="lpad-sub" data-testid="lp-missing">{LPS.missing}</p></>;
  const page = read?.coin ?? null;
  const held = heldOf(view)[coin.id] ?? 0;
  return (
    <div className="lpad-pagewrap" data-testid="lp-page">
      {back}
      <header className="lpad-panel lpad-head">
        <div className="lpad-head-id">
          <TokenIcon ticker={coin.ticker} size={64} />
          <div className="lpad-head-text">
            <span className="lpad-name-row"><b className="lpad-title">{coin.name}</b><span className="lpad-tick">{coin.ticker}</span>{coin.mine && <Chip outline>{LPS.yours}</Chip>}</span>
            <span className="lpad-sub">{`${LPS.by(coin.creatorName)} · launched ${dayLabel(coin.born)}`}</span>
          </div>
        </div>
        <div className="lpad-facts">
          <div className="lpad-fact"><span className="lpad-kicker">{LPS.mcap}</span><span className="num" data-testid="lp-page-cap">{usd(coin.cap)}</span></div>
          <div className="lpad-fact"><span className="lpad-kicker">{LPS.price}</span><span className="num" data-testid="lp-page-px">{perToken(coin.px)}</span></div>
          <div className="lpad-fact"><span className="lpad-kicker">Bought out</span><span className="num">{`${(coin.sold * 100).toFixed(1)}%`}</span></div>
          <div className="lpad-fact"><span className="lpad-kicker">Raised</span><span className="num">{usd(coin.raised)}</span></div>
          <div className="lpad-fact"><span className="lpad-kicker">Holders</span><span className="num">{coin.holders}</span></div>
        </div>
      </header>
      <div className="lpad-cols">
        <section className="lpad-area-chart lpad-panel" data-testid="lp-chart-panel">
          <div className="lpad-row2">
            <h3>{LPS.chartTitle}</h3>
            <Button size="sm" variant={tf === "d" ? "primary" : "secondary"} aria-pressed={tf === "d"} onClick={() => setTf("d")}>{LPS.chartDays}</Button>
            <Button size="sm" variant={tf === "i" ? "primary" : "secondary"} aria-pressed={tf === "i"} onClick={() => setTf("i")}>{LPS.chartTicks}</Button>
          </div>
          {read === null && !failed ? candleFallback
            : read === null ? <p className="lpad-sub" role="alert">{LPS.chartCouldnt}</p>
              : read.bars.length === 0 ? <p className="lpad-sub" data-testid="lp-chart-empty">{LPS.chartEmpty}</p>
                : <RetryableCandles bars={read.bars} ticks={read.ticks} fallback={candleFallback} errorMessage={LPS.chartCouldnt} retryLabel={LPS.retry} errorTestId="lp-chart-error" retryTestId="lp-chart-retry" />}
        </section>
        <section className="lpad-area-ticket lpad-panel" data-testid="lp-ticket">
          <Ticket coin={coin} cash={view.cash} held={held} />
        </section>
        <section className="lpad-area-curve lpad-panel" data-testid="lp-holders">
          <h3>{LPS.holderTitle}</h3>
          {!page ? <p className="lpad-sub">{LPS.chartLoading}</p> : page.top.length === 0 ? <p className="lpad-sub">{LPS.noTrade}</p> : (
            <ul className="lpad-tape">
              {page.top.map((h) => (
                <li key={h.index}><span>{h.mine ? LPS.barYou : h.name}</span><span className="num">{`${(h.share * 100).toFixed(1)}%`}</span><span className="num">{qty(h.qty)}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="lpad-area-tape lpad-panel" data-testid="lp-tape">
          <h3>{LPS.tapeTitle}</h3>
          {!page || page.prints.length === 0 ? <p className="lpad-sub">{LPS.emptyTape}</p> : (
            <ul className="lpad-tape">
              {page.prints.slice(0, 20).map((p) => (
                <li key={p.seq}>
                  <span data-side={p.side}>{p.side === "buy" ? LPS.bought : LPS.sold}</span>
                  <span>{p.mine ? LPS.barYou : p.name}</span>
                  <span className="num">{usd(p.cents)}</span>
                  <span className="num">{qty(p.tokens)}</span>
                  <span className="lpad-faint">{agoDays(p.day, day)}</span>
                </li>
              ))}
            </ul>
          )}
          <h3>{LPS.repliesTitle}</h3>
          {!page || page.talk.length === 0 ? <p className="lpad-sub">{LPS.noReplies}</p> : (
            <ul className="lpad-tape" data-testid="lp-replies">
              {page.talk.slice(0, 8).map((r) => (
                <li key={r.eventId}><span className="lpad-faint">{agoDays(r.day, day)}</span><span>{r.text}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Buy with cash or sell tokens. Estimates come from the pool now; the sim fills or refuses the order. */
function Ticket({ coin, cash, held }: { coin: Coin; cash: number; held: number }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const spend = side === "buy" ? centsOf(amt) : null;
  const tokens = side === "sell" ? Math.floor(Number(amt.replace(/[,\s]/g, "")) || 0) : 0;
  const est = side === "buy" ? (spend ? quoteBuy(coin.cash, coin.tokens, spend) : 0) : quoteSell(coin.cash, coin.tokens, tokens);
  const can = side === "buy"
    ? spend !== null && spend >= 1 && spend <= cash && est >= 1 && !busy
    : tokens >= 1 && tokens <= held && est >= 1 && !busy;
  const submit = async () => {
    if (!can) return;
    setBusy(true);
    const r = await act({ kind: "coin", side, coin: coin.id, qty: side === "buy" ? spend : tokens });
    setBusy(false);
    setNote({ ok: r.ok, text: r.text });
    if (r.ok) setAmt("");
  };
  return (
    <div className="lpad-ticket">
      <div className="lpad-row2" role="group" aria-label={LPS.buy}>
        <Button size="sm" variant={side === "buy" ? "primary" : "secondary"} aria-pressed={side === "buy"} data-testid="lp-buy-side" onClick={() => { setSide("buy"); setAmt(""); setNote(null); }}>{LPS.buy}</Button>
        <Button size="sm" variant={side === "sell" ? "primary" : "secondary"} aria-pressed={side === "sell"} data-testid="lp-sell-side" onClick={() => { setSide("sell"); setAmt(""); setNote(null); }}>{LPS.sell}</Button>
      </div>
      <label>{side === "buy" ? LPS.spend : LPS.tokens}
        <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} data-testid="lp-amount" />
      </label>
      <div className="lpad-row2">
        <Button size="sm" variant="ghost" onClick={() => setAmt(side === "buy" ? String(Math.floor(cash / 100)) : String(held))}>{LPS.all}</Button>
      </div>
      <p className="lpad-sub" data-testid="lp-estimate">
        {side === "buy"
          ? (est >= 1 ? LPS.youGet(qty(est)) : coin.tokens < 2 ? LPS.noPool : LPS.estimate)
          : (est >= 1 ? LPS.youSell(usd(est)) : LPS.estimate)}
      </p>
      <p className="lpad-faint">{`You hold ${qty(held)} ${coin.ticker}`}</p>
      <Button variant="primary" disabled={!can} data-testid="lp-trade" onClick={() => void submit()}>
        {busy ? LPS.launching : side === "buy" ? LPS.buy : LPS.sell}
      </Button>
      {note && <p className="lpad-msg" role="status" data-testid="lp-trade-note" data-kind={note.ok ? "done" : "refused"}>{note.text}</p>}
    </div>
  );
}
