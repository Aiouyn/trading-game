"use client";
// The Launchpad: the first version's board and coin page (New, Bumped, Trending, Holdings, Rugged, Create), fed by the sim's
// memecoins. The whole screen is one read of the pools (/api/sim/coins) asked again every second, so launches, prices,
// market caps, bumps, the king of the hill and rugs move as the clock runs. A coin page adds its candles (the sim's live
// minute bars), its holders, its trades and what the people trading it say. Every launch and trade goes through act(); the
// sim decides every outcome and a result is shown only from the sim's reply.
import { useEffect, useMemo, useRef, useState } from "react";
import { retryableLazy } from "@/components/shell/retryableLazy";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { act, useSimSnap, type SimView } from "@/shell/simSession";
import { BoardCard, Change, KingBanner, RugAlert, Status, TokenIcon, TradesBar, useFlash } from "./Board";
import type { CoinTf } from "./CoinCandles";
import {
  DEFAULT_SORT, FEEDS, agoText, buyDetail, clockText, dateText, feedOf, kingOf, launchPreview, perToken, pctText, qty, quoteSell, sellDetail, tokensForCents, usd, usdWhole, whenText,
  type Coin, type CoinPage, type Feed, type LpData, type Post, type Sort,
} from "./model";
import { setLaunchpadOpen } from "./notes";
import { LPS } from "./strings";
import { readCoinsOnce, useLaunchpad, type LpRead } from "./store";
import "./launchpad.css";

// The candles are their own chunk, loaded when a coin page opens.
const RetryableCandles = retryableLazy(() => import("./CoinCandles"));
const candleFallback = <div className="lpad-skel lpad-cc-skel" aria-busy="true" aria-label={LPS.chartLoading} data-testid="lp-candles-loading" />;

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .'&-]{2,23}$/;
const TICKER_RE = /^[A-Za-z]{3,5}$/;
const SORTS: { id: Sort; label: string }[] = [
  { id: "created", label: LPS.sortCreated }, { id: "bumped", label: LPS.sortBumped }, { id: "cap", label: LPS.sortCap }, { id: "heat", label: LPS.sortHeat },
];
const FEED_LABEL: Record<Feed, string> = { new: LPS.tabNew, bumped: LPS.tabBumped, trending: LPS.tabTrending, holdings: LPS.tabHoldings, gone: LPS.tabGone };
const TFS: CoinTf[] = ["1m", "5m", "15m", "1h"];
const SEEDS = [25_000, 50_000, 100_000, 150_000];
const RAW_ID = /coin:me:\d+/g;

/** Whole cents from a dollar field: 0 when empty, null when it is not a non-negative amount. */
function centsOf(s: string): number | null {
  const t = s.trim().replace(/[$,\s]/g, "");
  if (t === "") return 0;
  const x = Number(t);
  if (!Number.isFinite(x) || x < 0) return null;
  return Math.round(x * 100);
}

/** Cents as the text of a dollar field: 12345 becomes "123.45", 10000 becomes "100". */
function fieldOf(cents: number): string {
  return String(Math.round(cents) / 100);
}

export default function LaunchpadApp() {
  const { view } = useSimSnap();
  const [sel, setSel] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const lp = useLaunchpad(view ? sel : null);
  useEffect(() => {
    setLaunchpadOpen(true);
    return () => setLaunchpadOpen(false);
  }, []);
  if (!view || !lp.data) {
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
      {lp.stale && <p className="lpad-msg" role="status" data-testid="lp-stale">{LPS.updating}</p>}
      {sel === null ? <Board view={view} lp={lp} data={lp.data} onOpen={open} /> : <CoinPageView view={view} lp={lp} data={lp.data} id={sel} onBack={() => setSel(null)} />}
    </div>
  );
}

/** The rules in one closed line: fictional money, how value is counted, how coins end. */
function Rules() {
  return (
    <details className="lpad-how" data-testid="lp-game-only">
      <summary>{LPS.howTitle}</summary>
      <p className="lpad-sub">{LPS.gameOnly}</p>
      <p className="lpad-sub">{LPS.risk}</p>
      <p className="lpad-sub">{LPS.valueRule}</p>
      <p className="lpad-sub" data-testid="lp-delist-rule">{LPS.delistRule}</p>
    </details>
  );
}

function Board({ view, lp, data, onOpen }: { view: SimView; lp: LpRead; data: LpData; onOpen: (id: string) => void }) {
  const [tab, setTab] = useState<Feed | "create">("new");
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT.new);
  const [q, setQ] = useState("");
  const coins = data.board;
  const held = data.held;
  const pick = (f: Feed) => { setTab(f); setSort(DEFAULT_SORT[f]); };
  // What the coins in hand would bring if sold now: the one value the Portfolio and net worth use too.
  // A dead or delisted coin counts as $0, the same rule as net worth. A live coin is what selling it into the pool would pay.
  const heldValue = coins.reduce((s, c) => (c.live && !c.rugged && held[c.id] ? s + quoteSell(c.cash, c.tokens, held[c.id]!) : s), 0);
  const heldCount = Object.keys(held).length;
  const list = tab === "create" ? [] : feedOf(coins, tab, held, q, sort);
  return (
    <div className="lpad-boardwrap">
      <div className="lpad-top">
        <h2>{LPS.title}</h2>
        <div className="lpad-stats" data-testid="lp-stats">
          <div><span className="lpad-kicker">Cash</span><span className="num" data-testid="lp-spendable">{usd(view.cash)}</span></div>
          <div><span className="lpad-kicker" title={LPS.liveHint}>{LPS.live}</span><span className="num" data-testid="lp-live-count">{String(data.live)}</span></div>
          <div><span className="lpad-kicker">Coins held</span><span className="num" data-testid="lp-held-value" title={LPS.valueRule}>{usd(heldValue)}</span></div>
          <div><span className="lpad-kicker">{LPS.gameClock}</span><span className="num" data-testid="lp-clock">{`${dateText(Math.floor(data.now / 1440))} ${clockText(data.now)}`}</span></div>
        </div>
      </div>
      <RugAlert rugs={data.rugs} now={data.now} onOpen={onOpen} />
      <KingBanner king={kingOf(coins)} now={data.now} onOpen={onOpen} />
      <TradesBar rows={data.tape} onOpen={onOpen} />
      <div className="lpad-tabbar" role="tablist" aria-label={LPS.title}>
        {FEEDS.map((f) => (
          <button key={f} type="button" role="tab" className="lpad-tab" aria-selected={tab === f} data-testid={`lp-tab-${f}`} onClick={() => pick(f)}>
            {FEED_LABEL[f]}
            {f === "holdings" && heldCount > 0 ? <span className="lpad-badge num">{heldCount}</span> : null}
          </button>
        ))}
        <button type="button" role="tab" className="lpad-tab" aria-selected={tab === "create"} data-testid="lp-tab-create" onClick={() => setTab("create")}>{LPS.tabCreate}</button>
        {tab !== "create" && (
          <span className="lpad-filter">
            <input type="search" className="lpad-search" placeholder={LPS.search} aria-label={LPS.search} value={q} onChange={(e) => setQ(e.target.value)} data-testid="lp-search" />
            <select aria-label={LPS.sort} value={sort} onChange={(e) => setSort(e.target.value as Sort)} data-testid="lp-sort">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <span className="lpad-faint">{LPS.count(list.length)}</span>
          </span>
        )}
      </div>
      {tab === "create" ? (
        <Create view={view} data={data} onDone={(id) => { lp.refresh(); if (id) onOpen(id); else pick("new"); }} />
      ) : list.length === 0 ? (
        <p className="lpad-empty lpad-sub" data-testid="lp-empty">{tab === "holdings" ? LPS.emptyHoldings : tab === "gone" ? LPS.emptyGone : LPS.empty}</p>
      ) : (
        <div className="lpad-grid" data-testid="lp-coins">
          {list.map((c) => <BoardCard key={c.id} c={c} held={held[c.id] ?? 0} now={data.now} onOpen={onOpen} />)}
        </div>
      )}
      <Rules />
    </div>
  );
}

/** Launch your own coin: a name, a ticker, a note, a pool seed from the range every launcher uses and a starting buy. The form says
 *  what it costs and what net worth will read just after; the sim takes the fee and the seed from cash. The player can always
 *  launch: the city's own cap of live coins never applies to them. */
function Create({ view, data, onDone }: { view: SimView; data: LpData; onDone: (coinId: string | null) => void }) {
  const { rules } = data;
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [desc, setDesc] = useState("");
  const [seed, setSeed] = useState(rules.seedMin);
  const [buy, setBuy] = useState("100");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cents = centsOf(buy);
  const nameOk = NAME_RE.test(name.trim());
  const tickerOk = TICKER_RE.test(ticker.trim());
  const buyOk = cents !== null && (cents === 0 || cents >= 100);
  const pv = launchPreview(rules, seed, buyOk ? cents ?? 0 : 0);
  const need = pv.cost;
  const can = nameOk && tickerOk && buyOk && view.cash >= need && !busy;
  const submit = async () => {
    if (!can || cents === null) return;
    setBusy(true);
    setErr(null);
    const t = ticker.trim().toUpperCase();
    const body: Record<string, unknown> = { kind: "launch", name: name.trim(), ticker: t, seed };
    if (cents > 0) body.buy = cents;
    if (desc.trim()) body.desc = desc.trim();
    const r = await act(body);
    if (r.ok) {
      // Find the new coin on the board by its name and ticker, mine: the page opens on it.
      const fresh = await readCoinsOnce();
      const mine = fresh?.board.filter((c) => c.mine && c.name === name.trim()).sort((a, b) => b.bornAbs - a.bornAbs)[0];
      setBusy(false);
      setName(""); setTicker(""); setDesc("");
      onDone(mine?.id ?? null);
    } else {
      setBusy(false);
      setErr(r.text.replace(RAW_ID, "that coin"));
    }
  };
  return (
    <section className="lpad-panel" data-testid="lp-create">
      <p className="lpad-sub">{LPS.createIntro}</p>
      <label>{LPS.name}<input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} data-testid="lp-name" /></label>
      <span className="lpad-faint">{LPS.nameHint}</span>
      <label>{LPS.ticker}<input value={ticker} maxLength={5} onChange={(e) => setTicker(e.target.value.toUpperCase())} data-testid="lp-ticker" /></label>
      <span className="lpad-faint">{LPS.tickerHint}</span>
      <label>{LPS.descLabel}<textarea value={desc} maxLength={160} rows={2} onChange={(e) => setDesc(e.target.value)} data-testid="lp-desc" /></label>
      <span className="lpad-faint">{LPS.descHint}</span>
      <div className="lpad-field">
        <span className="lpad-label">{LPS.seedTitle}</span>
        <div className="lpad-seg" role="group" aria-label={LPS.seedTitle}>
          {SEEDS.filter((s) => s >= rules.seedMin && s <= rules.seedMax).map((s) => (
            <button key={s} type="button" className="lpad-segbtn" aria-pressed={seed === s} data-testid={`lp-seed-${s / 100}`} onClick={() => setSeed(s)}>{usdWhole(s)}</button>
          ))}
        </div>
        <span className="lpad-faint">{LPS.seedHint}</span>
      </div>
      <label>{LPS.startBuy}
        <span className="lpad-money"><span aria-hidden="true">$</span><input inputMode="decimal" value={buy} placeholder="0" onChange={(e) => setBuy(e.target.value)} data-testid="lp-buy" /></span>
      </label>
      <div className="lpad-seg" role="group" aria-label={LPS.startBuy}>
        {[0, 5_000, 10_000, 25_000].map((c) => (
          <button key={c} type="button" className="lpad-segbtn" aria-pressed={cents === c} onClick={() => setBuy(c === 0 ? "" : fieldOf(c))}>{c === 0 ? "None" : usdWhole(c)}</button>
        ))}
      </div>
      <span className="lpad-faint">{LPS.startHint}</span>
      <div className="lpad-preview" data-testid="lp-preview" aria-live="polite">
        <b>{LPS.previewTitle}</b>
        <p className="lpad-sub" data-testid="lp-cost">{LPS.costLine(usd(rules.fee), usd(seed), usd(pv.cost - rules.fee - seed), usd(pv.cost))}</p>
        <p className="lpad-sub">{LPS.holdingLine(qty(pv.tokens), ticker.trim().toUpperCase() || "tokens", usd(pv.value))}</p>
        <p className="lpad-sub" data-testid="lp-networth">{LPS.netLine(usd(view.netWorth), usd(view.netWorth + pv.change), `${pv.change < 0 ? "-" : "+"}${usd(Math.abs(pv.change))}`)}</p>
        <p className="lpad-sub">{LPS.cashLine(usd(view.cash), usd(view.cash - need))}</p>
        <p className="lpad-faint">{LPS.feeNote}</p>
        <p className="lpad-faint">{LPS.yourCoinNote}</p>
      </div>
      {view.cash < need && <p className="lpad-msg" data-testid="lp-short">{LPS.needMore(usd(need))}</p>}
      {err && <p className="lpad-msg" role="alert" data-testid="lp-create-error">{err}</p>}
      <div className="lpad-row2">
        <Button variant="primary" disabled={!can} data-testid="lp-launch" onClick={() => void submit()}>{busy ? LPS.launching : LPS.launch}</Button>
      </div>
    </section>
  );
}

function CoinPageView({ view, lp, data, id, onBack }: { view: SimView; lp: LpRead; data: LpData; id: string; onBack: () => void }) {
  const coin = data.board.find((c) => c.id === id) ?? null;
  const page: CoinPage | null = data.detail && data.detail.id === id ? data.detail : null;
  const [tf, setTf] = useState<CoinTf>("5m");
  const dir = useFlash(coin?.cap ?? 0);
  const back = (
    <div className="lpad-row2"><Button size="sm" variant="ghost" data-testid="lp-board-back" onClick={onBack}>{LPS.back}</Button></div>
  );
  if (!coin) return <>{back}<p className="lpad-sub" data-testid="lp-missing">{LPS.missing}</p></>;
  const held = data.held[coin.id] ?? 0;
  const now = data.now;
  return (
    <div className="lpad-pagewrap" data-testid="lp-page" data-ticker={coin.ticker}>
      {back}
      <header className="lpad-panel lpad-head">
        <div className="lpad-head-id">
          <TokenIcon ticker={coin.ticker} size={56} />
          <div className="lpad-head-text">
            <span className="lpad-name-row"><b className="lpad-title">{coin.name}</b><span className="lpad-tick">{coin.ticker}</span></span>
            <Status c={coin} held={held} />
            <span className="lpad-sub">{`${LPS.by(coin.creatorName)}${page ? ` (${page.creatorHandle})` : ""} · launched ${whenText(coin.bornAbs, now)}`}</span>
            {page?.desc ? <p className="lpad-desc" data-testid="lp-desc-text">{page.desc}</p> : null}
          </div>
        </div>
        {coin.rugged ? (
          <p className="lpad-banner" data-kind="rug" data-testid="lp-page-rug">{`${LPS.ruggedLine(coin.mine ? LPS.barYou : coin.creatorName, usd(coin.rugCash))} ${agoText(coin.endAbs, now)}. Holders cannot sell.`}</p>
        ) : !coin.live ? (
          <p className="lpad-banner" data-kind="faded" data-testid="lp-page-faded">{`${LPS.fadedLine}. ${LPS.fadedSell} ${LPS.windLine(dateText(coin.windDay))}.`}</p>
        ) : null}
        <div className="lpad-facts">
          <div className="lpad-fact"><span className="lpad-kicker">{LPS.mcap}</span><span className="num" data-flash={dir} data-testid="lp-page-cap">{usdWhole(coin.cap)}</span></div>
          <div className="lpad-fact"><span className="lpad-kicker">{LPS.price}</span><span className="num" data-testid="lp-page-px">{perToken(coin.px)}</span></div>
          <div className="lpad-fact"><span className="lpad-kicker">{LPS.facts.hour}</span><Change ratio={coin.h1} testid="lp-page-h1" bare /></div>
          <div className="lpad-fact"><span className="lpad-kicker">{LPS.facts.bought}</span><span className="num" data-testid="lp-page-bought">{`${(coin.sold * 100).toFixed(1)}%`}</span></div>
          <div className="lpad-fact"><span className="lpad-kicker">{LPS.facts.raised}</span><span className="num" data-testid="lp-page-raised">{usd(coin.raised)}</span></div>
          <div className="lpad-fact"><span className="lpad-kicker">{LPS.facts.holders}</span><span className="num" data-testid="lp-page-holders">{coin.holders}</span></div>
          <div className="lpad-fact"><span className="lpad-kicker">{LPS.facts.trades}</span><span className="num" data-testid="lp-page-trades">{coin.trades}</span></div>
        </div>
      </header>
      <div className="lpad-cols">
        <section className="lpad-area-chart lpad-panel" data-testid="lp-chart-panel">
          <div className="lpad-row2">
            <h3>{LPS.chartTitle}</h3>
            <div className="lpad-seg" role="group" aria-label={LPS.chartTitle}>
              {TFS.map((t) => <button key={t} type="button" className="lpad-segbtn" aria-pressed={tf === t} data-testid={`lp-tf-${t}`} onClick={() => setTf(t)}>{t}</button>)}
            </div>
          </div>
          <RetryableCandles instr={coin.id} tf={tf} stamp={`${data.now}:${coin.cash}`} ended={!coin.live} fallback={candleFallback} errorMessage={LPS.chartCouldnt} retryLabel={LPS.retry} errorTestId="lp-chart-error" retryTestId="lp-chart-retry" />
        </section>
        <section className="lpad-area-ticket lpad-panel" data-testid="lp-ticket">
          <Ticket key={coin.id} coin={coin} cash={view.cash} held={held} onDone={lp.refresh} />
        </section>
        <section className="lpad-area-curve lpad-panel" data-testid="lp-holders">
          <h3 data-testid="lp-holders-title">{page ? LPS.topLine(page.top.length, coin.holders) : `${LPS.holderTitle} (${coin.holders})`}</h3>
          {!page ? <p className="lpad-sub">{LPS.chartLoading}</p> : page.top.length === 0 ? <p className="lpad-sub">{LPS.noTrade}</p> : (
            <ul className="lpad-tape">
              {page.top.map((h) => (
                <li key={h.index}>
                  <span>{h.mine ? LPS.barYou : h.name}{h.creator && <Chip outline>{LPS.creatorTag}</Chip>}</span>
                  <span className="num">{`${(h.share * 100).toFixed(1)}%`}</span><span className="num">{qty(h.qty)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="lpad-area-tape lpad-panel" data-testid="lp-tape">
          <h3>{LPS.tapeTitle}</h3>
          {!page || page.prints.length === 0 ? <p className="lpad-sub">{LPS.emptyTape}</p> : (
            <table className="lpad-trades" data-testid="lp-trades">
              <thead><tr><th>Time</th><th>Side</th><th>Who</th><th className="num">Amount</th><th className="num lpad-wide">Tokens</th><th className="num lpad-wide">Price</th></tr></thead>
              <tbody>
                {page.prints.slice(0, 24).map((p) => (
                  <tr key={p.seq} data-mine={p.mine ? "true" : undefined}>
                    <td className="lpad-time">{whenText(p.abs, now)}</td>
                    <td data-side={p.side}>{p.side === "buy" ? LPS.bought : LPS.sold}</td>
                    <td>{p.mine ? LPS.barYou : p.name}</td>
                    <td className="num">{usd(p.cents)}</td>
                    <td className="num lpad-wide">{qty(p.tokens)}</td>
                    <td className="num lpad-wide">{p.px > 0 ? perToken(p.px) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Voices coin={coin} page={page} now={now} onDone={lp.refresh} />
        </section>
      </div>
      <Rules />
    </div>
  );
}

/** What people say: the creator's note, the posts as threads, and a box to post or answer. The crowd answers in character. */
function Voices({ coin, page, now, onDone }: { coin: Coin; page: CoinPage | null; now: number; onDone: () => void }) {
  const [text, setText] = useState("");
  const [to, setTo] = useState<Post | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const posts = page?.posts ?? [];
  const { roots, kids } = useMemo(() => {
    const by = new Map(posts.map((p) => [p.id, p]));
    const kids = new Map<string, Post[]>();
    const roots: Post[] = [];
    // An answer to an answer sits in the same thread, under the post that started it.
    const headOf = (p: Post): Post | null => {
      let at: Post | undefined = p;
      for (let n = 0; n < 8 && at?.parent; n++) { const up = by.get(at.parent); if (!up) return n === 0 ? null : at; at = up; }
      return at && at !== p ? at : null;
    };
    for (const p of posts) {
      const head = headOf(p);
      if (head) kids.set(head.id, [...(kids.get(head.id) ?? []), p]);
      else roots.push(p);
    }
    for (const list of kids.values()) list.sort((a, b) => a.abs - b.abs);
    // The player's own conversations come first, then the rest; each group by its latest word.
    const last = (r: Post): number => Math.max(r.abs, ...(kids.get(r.id) ?? []).map((k) => k.abs));
    const yours = (r: Post): boolean => r.mine || (kids.get(r.id) ?? []).some((k) => k.mine);
    roots.sort((a, b) => Number(yours(b)) - Number(yours(a)) || last(b) - last(a));
    return { roots, kids };
  }, [posts]);
  const shown = more ? roots : roots.slice(0, 10);
  const send = async () => {
    const t = text.trim();
    if (t.length < 2 || busy) return;
    setBusy(true);
    setErr(null);
    const body: Record<string, unknown> = { kind: "post", coin: coin.id, text: t };
    if (to) body.parent = to.id;
    const r = await act(body);
    setBusy(false);
    if (r.ok) { setText(""); setTo(null); onDone(); } else setErr(r.text.replace(RAW_ID, coin.name) || LPS.postFail);
  };
  const row = (r: Post, child: boolean, head = "") => (
    <li key={r.id} data-act={r.act} data-testid={child ? "lp-voice-reply" : "lp-voice"} data-child={child ? "true" : undefined}>
      <span className="lpad-voice-head">
        <b className={r.mine ? "lpad-creator" : undefined}>{r.mine ? LPS.barYou : r.name}</b>
        {r.creator && <Chip outline>{LPS.creatorTag}</Chip>}
        <span className="lpad-faint">{voiceAct(r)}</span>
        <span className="lpad-faint num">{whenText(r.abs, now)}</span>
      </span>
      {r.parent && r.parent !== head && r.quote ? <span className="lpad-faint lpad-quote">{LPS.replyingTo(r.quoteName ?? "", r.quote)}</span> : null}
      <span className="lpad-voice-line">{r.text}</span>
      <button type="button" className="lpad-link" data-testid="lp-reply" onClick={() => setTo(r)}>{LPS.reply}</button>
    </li>
  );
  return (
    <>
      <h3>{LPS.voicesTitle}</h3>
      <div className="lpad-from" data-testid="lp-from-creator">
        <span className="lpad-kicker">{LPS.fromCreator}</span>
        <span className="lpad-voice-line">{page ? page.desc || LPS.noDesc : LPS.chartLoading}</span>
      </div>
      <div className="lpad-compose" data-testid="lp-compose">
        {to && (
          <p className="lpad-faint lpad-replying" data-testid="lp-replying">
            {LPS.replying(to.mine ? LPS.barYou : to.name)}
            <button type="button" className="lpad-link" onClick={() => setTo(null)}>{LPS.cancel}</button>
          </p>
        )}
        <textarea value={text} maxLength={220} rows={2} placeholder={LPS.postHere} aria-label={LPS.postHere} data-testid="lp-post-text"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} />
        <div className="lpad-row2">
          <Button size="sm" variant="secondary" disabled={busy || text.trim().length < 2} data-testid="lp-post-send" onClick={() => void send()}>{busy ? LPS.posting : LPS.postBtn}</Button>
          <span className="lpad-faint">{LPS.postHint}</span>
        </div>
        {err && <p className="lpad-msg" role="alert" data-kind="refused" data-testid="lp-post-error">{err}</p>}
      </div>
      {!page || posts.length === 0 ? <p className="lpad-sub">{LPS.noVoices}</p> : (
        <ul className="lpad-voices" data-testid="lp-voices">
          {shown.map((r) => (
            <li key={r.id} className="lpad-thread" data-testid="lp-thread">
              <ul className="lpad-voices lpad-voices-in">
                {row(r, false)}
                {(kids.get(r.id) ?? []).map((k) => row(k, true, r.id))}
              </ul>
            </li>
          ))}
          {!more && roots.length > shown.length && <li><button type="button" className="lpad-link" onClick={() => setMore(true)}>{LPS.moreVoices}</button></li>}
        </ul>
      )}
    </>
  );
}

function voiceAct(r: Post): string {
  switch (r.act) {
    case "buy": return LPS.postBought(usd(r.cents));
    case "sell": return LPS.postSold(usd(r.cents), r.gain === undefined ? undefined : pctText(1 + r.gain));
    case "launch": return LPS.postLaunch;
    case "pump": return LPS.postPump;
    case "dump": return LPS.postDump;
    case "post": return "";
    case "reply": return "replied";
    default: return LPS.postRug(usd(r.cents));
  }
}

/** Buy with dollars or sell for dollars. The preview comes from the pool now and says what the order will do: tokens, average
 *  price, cost or proceeds and the move in the pool's price. The pool is read again as the button is pressed; if it has moved
 *  more than two percent against the player, the new preview is shown and the press is held for a second one, so a fill is
 *  never a surprise. With the clock paused or slow the fill is exactly the preview. */
function Ticket({ coin, cash, held, onDone }: { coin: Coin; cash: number; held: number; onDone: () => void }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // The order the player has already seen re-quoted: a second press sends it at the pool's price, with no further hold.
  const [armed, setArmed] = useState<string | null>(null);
  const sellable = !coin.rugged;
  const open = coin.live;
  const dollars = centsOf(amt);
  const holdValue = coin.live && !coin.rugged ? quoteSell(coin.cash, coin.tokens, held) : 0;
  let spend = 0, tokens = 0;
  if (side === "buy") spend = dollars ?? 0;
  else tokens = pct !== null ? (pct >= 100 ? held : Math.floor(held * pct / 100)) : dollars && dollars >= 1 ? Math.min(held, tokensForCents(coin.cash, coin.tokens, dollars)) : 0;
  const bd = side === "buy" && open && spend >= 1 ? buyDetail(coin.cash, coin.tokens, spend) : null;
  const sd = side === "sell" && sellable && tokens >= 1 ? sellDetail(coin.cash, coin.tokens, tokens) : null;
  const can = !busy && (side === "buy" ? open && dollars !== null && spend >= 1 && spend <= cash && !!bd : sellable && dollars !== null && tokens >= 1 && tokens <= held && !!sd);
  const choose = (s: "buy" | "sell") => { setSide(s); setAmt(""); setPct(null); setNote(null); };
  const quickBuy = (c: number) => { setAmt(fieldOf(Math.min(c, cash))); setNote(null); };
  const quickSell = (p: number) => {
    setPct(p);
    const t = p >= 100 ? held : Math.floor(held * p / 100);
    setAmt(fieldOf(quoteSell(coin.cash, coin.tokens, t)));
    setNote(null);
  };
  const previewText = (b: typeof bd, s: typeof sd): string => (b ? `${LPS.youGet(qty(b.tokens), perToken(b.avg))}.` : s ? `${LPS.sellGets(usd(s.cents), perToken(s.avg))}.` : "");
  const submit = async () => {
    if (!can) return;
    setBusy(true);
    setNote(null);
    const key = `${side}:${spend}:${tokens}`;
    const second = armed === key;
    setArmed(null);
    // Read the pool now. If the figures moved against the player, show the new ones and wait for another press.
    const fresh = await readCoinsOnce();
    const now = fresh?.board.find((c) => c.id === coin.id);
    let expect = previewText(bd, sd);
    if (now) {
      const b2 = side === "buy" ? buyDetail(now.cash, now.tokens, spend) : null;
      const s2 = side === "sell" ? sellDetail(now.cash, now.tokens, Math.min(tokens, fresh?.held[coin.id] ?? tokens)) : null;
      const was = bd?.tokens ?? sd?.cents ?? 0;
      const is = b2?.tokens ?? s2?.cents ?? 0;
      if (!b2 && !s2) { setBusy(false); setNote({ ok: false, text: LPS.noPool }); return; }
      expect = previewText(b2, s2);
      // A move for the worse beyond two percent holds the press for a second look; anything else goes through at the pool's price.
      if (!second && is < was * 0.98) {
        setBusy(false);
        setArmed(key);
        setNote({ ok: false, text: LPS.moved(previewText(b2, s2)) });
        // The poll adopts the new pool a moment later; the held press then goes through at these figures.
        lpRefreshSoon(onDone);
        return;
      }
    }
    const r = await act({ kind: "coin", side, coin: coin.id, qty: side === "buy" ? spend : tokens });
    setBusy(false);
    const said = r.text.replace(RAW_ID, coin.name);
    setNote({ ok: r.ok, text: r.ok && expect ? `${said}. ${LPS.filledAs(expect.replace(/\.$/, ""))}` : said });
    if (r.ok) { setAmt(""); setPct(null); onDone(); }
  };
  return (
    <div className="lpad-ticket">
      <div className="lpad-sides" role="radiogroup" aria-label={LPS.buy}>
        <button type="button" role="radio" aria-checked={side === "buy"} data-side="buy" className="lpad-side" data-testid="lp-buy-side" onClick={() => choose("buy")}>{LPS.buy}</button>
        <button type="button" role="radio" aria-checked={side === "sell"} data-side="sell" className="lpad-side" data-testid="lp-sell-side" onClick={() => choose("sell")}>{LPS.sell}</button>
      </div>
      <label>{side === "buy" ? LPS.spend : LPS.sellFor}
        <span className="lpad-money"><span aria-hidden="true">$</span>
          <input inputMode="decimal" value={amt} placeholder="0.00" disabled={side === "buy" ? !open : !sellable} onChange={(e) => { setAmt(e.target.value); setPct(null); }} data-testid="lp-amount" />
        </span>
      </label>
      <div className="lpad-quick">
        {side === "buy"
          ? [1_000, 5_000, 10_000, 50_000].map((c) => <button key={c} type="button" className="lpad-chipbtn" disabled={!open || c > cash} onClick={() => quickBuy(c)}>{usdWhole(c)}</button>)
          : [25, 50, 75, 100].map((p) => <button key={p} type="button" className="lpad-chipbtn" disabled={!sellable || held < 1} onClick={() => quickSell(p)}>{p === 100 ? "Max" : `${p}%`}</button>)}
        {side === "buy" && <button type="button" className="lpad-chipbtn" disabled={!open || cash < 100} onClick={() => quickBuy(Math.floor(cash / 100) * 100)}>Max</button>}
      </div>
      <div className="lpad-quote-box" data-testid="lp-estimate" aria-live="polite">
        {side === "buy" ? (
          !open ? <p className="lpad-sub">{LPS.closed}</p>
            : bd ? (
              <>
                <p className="lpad-sub" data-testid="lp-est-main">{LPS.youGet(qty(bd.tokens), perToken(bd.avg))}</p>
                <p className="lpad-sub" data-testid="lp-est-cost">{LPS.buyCost(usd(spend))}</p>
                <p className="lpad-faint" data-testid="lp-est-impact">{LPS.impact(pctText(1 + bd.impact))}</p>
                <p className="lpad-faint" data-testid="lp-est-back">{LPS.backNow(usd(bd.back))}</p>
              </>
            ) : <p className="lpad-sub">{coin.tokens < 2 ? LPS.noPool : LPS.estimate}</p>
        ) : !sellable ? <p className="lpad-sub">{LPS.closed}</p>
          : sd ? (
            <>
              <p className="lpad-sub" data-testid="lp-est-main">{LPS.youSell(qty(sd.tokens), `${Math.round((sd.tokens / Math.max(1, held)) * 100)}%`)}</p>
              <p className="lpad-sub" data-testid="lp-est-cost">{LPS.sellGets(usd(sd.cents), perToken(sd.avg))}</p>
              <p className="lpad-faint" data-testid="lp-est-impact">{LPS.impact(pctText(1 + sd.impact))}</p>
            </>
          ) : <p className="lpad-sub">{LPS.estimate}</p>}
      </div>
      {!open && sellable && <p className="lpad-faint">{LPS.fadedSell}</p>}
      <p className="lpad-faint" data-testid="lp-holding">{LPS.holdLine(qty(held), coin.ticker, usd(holdValue))}</p>
      <Button variant="primary" disabled={!can} data-testid="lp-trade" onClick={() => void submit()}>
        {busy ? LPS.launching : side === "buy" ? LPS.buy : LPS.sell}
      </Button>
      {note && <p className="lpad-msg" role="status" data-testid="lp-trade-note" data-kind={note.ok ? "done" : "refused"}>{note.text}</p>}
    </div>
  );
}

/** Ask for a fresh read of the pools a moment after a quote moved, so the preview shows the new figures. */
function lpRefreshSoon(refresh: () => void): void {
  setTimeout(refresh, 50);
}
