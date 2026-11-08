"use client";
// Launchpad app (owner-restored meme-coin Launchpad, first playable loop). Reads GET /api/launchpad (public coins and
// curves, plus only the caller's own cash and holdings) and sends reviewed launches and trades to the server, which
// decides and saves them (src/server/launchpad). Every money action is two steps, Review then Confirm; the review is
// computed with the server's own curve rules, and the server refuses a fill worse than the reviewed one by more than
// 5%. Nothing completes locally: a result is shown only from the server's reply, then the board is read again. Keyed by
// account, so an account switch starts a fresh board with that account's reads only.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { isSignedIn, openAccountSettings, useAuthChrome } from "@/shell/authChrome";
import { viewportOf } from "@/shell/wm";
import {
  LP, TAGLINES, curveLeft, feeOf, impactBp, marketCapCents, minAfterSlip, nameOk, priceText, quoteBuy, quoteSell, tickerOk,
  type Curve, type TaglineId,
} from "@/launchpad/rules";
import { LPS } from "./strings";
import "./launchpad.css";

export const LAUNCHPAD_POLL_MS = 5_000;

interface Print { atMs: number; tick: number; side: "buy" | "sell"; tokens: number; cents: number; creator: boolean }
interface Coin extends Curve { ticker: string; name: string; tagline: TaglineId; creator: string | null; mine: boolean; createdAtMs: number; holders: number; tape: Print[] }
interface Self { cashCents: number; spendableCents: number; holdings: Record<string, number>; live: number; nextLaunchAtMs: number | null }
interface View { coins: Coin[]; self: Self | null }
type Reply = { status: "accepted"; [k: string]: unknown } | { status: "refused"; code: string; message: string };

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n: number) => n.toLocaleString("en-US");
const pct = (bp: number) => `${(bp / 100).toFixed(2)}%`;
const key = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");

function parseView(v: unknown): View | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { coins?: unknown; self?: unknown };
  if (!Array.isArray(o.coins)) return null;
  const coins = o.coins.filter((c): c is Coin => !!c && typeof c === "object" && typeof (c as Coin).ticker === "string" && Number.isSafeInteger((c as Coin).x) && Number.isSafeInteger((c as Coin).sold) && Array.isArray((c as Coin).tape));
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
      <h2>{LPS.title}</h2>
      <div className="lpad-note" data-testid="lp-game-only"><p>{LPS.gameOnly}</p><p>{LPS.risk}</p><p>{LPS.notCounted}</p></div>
      {id === null ? <div className="lpad-skel" aria-busy="true" aria-label={LPS.loading} /> : <Board key={id} signedIn={id !== "guest"} />}
    </div>
  );
}

function Board({ signedIn }: { signedIn: boolean }) {
  const store = useShellStore();
  const [{ view, state }, setBoard] = useState<{ view: View | null; state: "loading" | "error" | "live" | "stale" }>({ view: null, state: "loading" });
  const [tab, setTab] = useState<"coins" | "create">("coins");
  const [sel, setSel] = useState<string | null>(null);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    let v: View | null = null;
    try { v = await readView(); } catch { v = null; }
    if (mine !== seq.current) return;
    setBoard((b) => (v ? { view: v, state: "live" } : b.view ? { ...b, state: "stale" } : { view: null, state: "error" }));
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, LAUNCHPAD_POLL_MS);
    const reads = seq;
    return () => { clearInterval(t); reads.current++; };
  }, [load]);

  if (state === "loading") return <div className="lpad-skel" aria-busy="true" aria-label={LPS.loading} data-testid="lp-loading" />;
  if (state === "error" || !view) {
    return <div className="lpad-row2" data-testid="lp-error"><span role="alert">{LPS.couldntLoad}</span><Button onClick={() => { setBoard({ view: null, state: "loading" }); void load(); }}>{LPS.retry}</Button></div>;
  }
  const coin = view.coins.find((c) => c.ticker === sel) ?? null;
  return (
    <>
      {state === "stale" && <p className="lpad-msg" role="status" data-testid="lp-stale">{LPS.couldntUpdate}</p>}
      {!signedIn && (
        <div className="lpad-row2" data-testid="lp-signed-out"><span>{LPS.signedOut}</span><Button size="sm" onClick={() => openAccountSettings(store)}>{LPS.signIn}</Button></div>
      )}
      {signedIn && !view.self && <p className="lpad-msg" data-testid="lp-no-ledger">{LPS.unavailable}</p>}
      {view.self && <p className="lpad-sub" data-testid="lp-spendable">{LPS.spendable(usd(view.self.spendableCents))}</p>}
      <div className="lpad-tabs" role="tablist" aria-label={LPS.title}>
        <Button size="sm" role="tab" aria-selected={tab === "coins"} data-testid="lp-tab-coins" onClick={() => setTab("coins")}>{LPS.tabCoins}</Button>
        {view.self && <Button size="sm" role="tab" aria-selected={tab === "create"} data-testid="lp-tab-create" onClick={() => setTab("create")}>{LPS.tabCreate}</Button>}
      </div>
      {tab === "create" && view.self ? (
        <Create self={view.self} onDone={(t) => { void load(); setTab("coins"); setSel(t); }} />
      ) : (
        <div className="lpad-body">
          {view.coins.length === 0 ? <p className="lpad-sub" data-testid="lp-empty">{LPS.empty}</p> : (
            <ul className="lpad-list" data-testid="lp-coins" aria-label={LPS.tabCoins}>
              {view.coins.map((c) => (
                <li key={c.ticker}>
                  <button type="button" className="lpad-coin" data-testid="lp-coin" data-ticker={c.ticker} aria-current={c.ticker === sel ? "true" : undefined} onClick={() => setSel(c.ticker)}>
                    <span><b>{c.ticker}</b> {c.name} {c.mine && <Chip>{LPS.yours}</Chip>}</span>
                    <span className="num">{priceText(c)}</span>
                    <span className="lpad-sub">{`${LPS.by(c.creator)} · ${LPS.holders(c.holders)}`}</span>
                    <span className="lpad-sub num">{`${LPS.mcap} ${usd(marketCapCents(c))}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {coin && <CoinPanel key={coin.ticker} coin={coin} self={view.self} onDone={load} />}
        </div>
      )}
    </>
  );
}

function CoinPanel({ coin, self, onDone }: { coin: Coin; self: Self | null; onDone: () => Promise<void> }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<null | { key: string; amount: number; min: number }>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<null | { kind: "ok" | "refused" | "unknown"; text: string }>(null);
  const held = self?.holdings[coin.ticker] ?? 0;
  const sold = ((coin.sold / (LP.Y0 - LP.GRAD_Y)) * 100).toFixed(1) + "%";
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
    else setMsg({ kind: "ok", text: (side === "buy" ? LPS.bought : LPS.soldMsg)(qty(r.tokens as number), coin.ticker, usd(r.cents as number)) });
    setReview(null);
    setAmount("");
    await onDone();
  };
  return (
    <section className="lpad-panel" data-testid="lp-coin-panel" data-ticker={coin.ticker} aria-label={`${coin.ticker} ${coin.name}`}>
      <h3>{`${coin.ticker} · ${coin.name}`}</h3>
      <p className="lpad-sub">{`“${TAGLINES[coin.tagline] ?? ""}” ${LPS.by(coin.creator)}`}</p>
      <dl className="lpad-dl">
        <dt>{LPS.price}</dt><dd className="num" data-testid="lp-price">{priceText(coin)}</dd>
        <dt>{LPS.mcap}</dt><dd className="num">{usd(marketCapCents(coin))}</dd>
        <dt>{LPS.sold(sold)}</dt><dd className="num">{LPS.holders(coin.holders)}</dd>
      </dl>
      {self && <p data-testid="lp-held" data-qty={held}>{LPS.youHold(`${qty(held)} ${coin.ticker}`)}</p>}
      {self && !review && (
        <form className="lpad-panel" onSubmit={(e) => { e.preventDefault(); if (q?.ok && !why) setReview({ key: key(), amount: n, min: minAfterSlip(q.ok && "tokens" in q ? q.tokens : (q as { pay: number }).pay) }); }}>
          <div className="lpad-tabs" role="radiogroup" aria-label="Side">
            <Button size="sm" role="radio" aria-checked={side === "buy"} data-testid="lp-side-buy" onClick={() => { setSide("buy"); setAmount(""); }}>{LPS.buy}</Button>
            <Button size="sm" role="radio" aria-checked={side === "sell"} data-testid="lp-side-sell" disabled={held === 0} onClick={() => { setSide("sell"); setAmount(""); }}>{LPS.sell}</Button>
          </div>
          <label>{side === "buy" ? LPS.amountBuy : LPS.amountSell}
            <span className="lpad-row2">
              <input data-testid="lp-amount" inputMode={side === "buy" ? "decimal" : "numeric"} value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" />
              {side === "sell" && <Button size="sm" data-testid="lp-all" onClick={() => setAmount(String(held))}>{LPS.all}</Button>}
            </span>
          </label>
          {why && <p className="lpad-msg" data-kind="refused" data-testid="lp-why">{why}</p>}
          <div className="lpad-actions"><Button type="submit" data-testid="lp-review" disabled={!q?.ok || !!why}>{side === "buy" ? LPS.reviewBuy : LPS.reviewSell}</Button></div>
        </form>
      )}
      {self && review && q?.ok && <TradeReview coin={coin} side={side} self={self} q={q} min={review.min} busy={busy} onBack={() => setReview(null)} onConfirm={() => void send()} />}
      {msg && <p className="lpad-msg" role="status" data-kind={msg.kind} data-testid="lp-result">{msg.text}</p>}
      <h3>{LPS.tape}</h3>
      {coin.tape.length === 0 ? <p className="lpad-sub">{LPS.noTape}</p> : (
        <ul className="lpad-tape" data-testid="lp-tape">
          {coin.tape.slice(0, 10).map((p, i) => (
            <li key={`${p.atMs}-${i}`} data-side={p.side}>
              <span>{`${p.side === "buy" ? LPS.buy : LPS.sell}${p.creator ? ` · ${LPS.creatorFlag}` : ""}`}</span>
              <span className="num">{`${qty(p.tokens)} · ${usd(p.cents)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TradeReview({ coin, side, self, q, min, busy, onBack, onConfirm }: {
  coin: Coin; side: "buy" | "sell"; self: Self; q: Extract<ReturnType<typeof quoteBuy> | ReturnType<typeof quoteSell>, { ok: true }>;
  min: number; busy: boolean; onBack: () => void; onConfirm: () => void;
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
      <p className="lpad-sub">{LPS.risk}</p>
      <div className="lpad-actions">
        <Button variant="primary" data-testid="lp-confirm" disabled={busy} onClick={onConfirm}>{busy ? LPS.working : buy ? LPS.confirmBuy : LPS.confirmSell}</Button>
        <Button data-testid="lp-back" disabled={busy} onClick={onBack}>{LPS.back}</Button>
      </div>
    </div>
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
