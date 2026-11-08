"use client";
// A coin's recorded price/volume history (lazy: its own chunk, loaded when a coin panel opens). Reads
// GET /api/launchpad/history (public curve points only) when the coin opens and again whenever the board shows that the
// coin's curve or tape changed; the latest request wins and a reply for another coin is dropped (the panel is keyed by
// coin and the board by account, so a switch remounts this with nothing from the last one). One step per executed trade,
// the price held until the next trade. A failed refresh keeps the last history, dimmed and labelled "not updated".
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/Button";
import { LPS } from "./strings";
import { PH, VH, W, barH, modelOf, parseHistory, priceStr, stepPath, xOf, type HistoryData, type Step } from "./history";

type St = { status: "loading" } | { status: "error" } | { status: "ok"; data: HistoryData; stale: boolean };

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n: number) => n.toLocaleString("en-US");
const when = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const kindText = (s: Step) => (s.kind === "launch" ? LPS.hLaunch : s.kind === "buy" ? LPS.buy : LPS.sell);

/** The readout of one step: trades are numbered from 1 (step 0 is the launch when the history starts there). */
export function readout(s: Step, trades: number, fromLaunch: boolean): string {
  const head = `${s.kind === "launch" ? LPS.hLaunch : LPS.hTrade(fromLaunch ? s.n : s.n + 1, trades)} · ${when(s.atMs)}`;
  const trade = s.kind === "launch" ? LPS.hNoVolume : `${kindText(s)} ${qty(s.tokens)} · ${LPS.hVolume} ${usd(s.cents)}`;
  return `${head} · ${LPS.hPriceAfter} ${priceStr(s.price)} · ${trade}`;
}

export default function History({ ticker, version }: { ticker: string; version: string }) {
  const [st, setSt] = useState<St>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    const ctl = new AbortController();
    (async () => {
      let data: HistoryData | null = null;
      try {
        const res = await fetch(`/api/launchpad/history?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" }, signal: ctl.signal });
        data = res.ok ? parseHistory(await res.json(), ticker) : (await res.body?.cancel().catch(() => {}), null);
      } catch { data = null; }
      if (mine !== seq.current) return; // superseded (a newer version, a Retry or unmount)
      setSt((s) => (data ? { status: "ok", data, stale: false } : s.status === "ok" ? { ...s, stale: true } : { status: "error" }));
    })();
    const reads = seq;
    return () => { ctl.abort(); reads.current++; };
  }, [ticker, version, retry]);

  if (st.status === "loading") return <div className="lpad-skel lpad-hist-skel" aria-busy="true" aria-label={LPS.hLoading} data-testid="lp-hist-loading" />;
  if (st.status === "error") {
    return <div className="lpad-row2" data-testid="lp-hist-error"><span role="alert">{LPS.hCouldnt}</span><Button size="sm" data-testid="lp-hist-retry" onClick={() => { setSt({ status: "loading" }); setRetry((r) => r + 1); }}>{LPS.retry}</Button></div>;
  }
  return <Chart data={st.data} stale={st.stale} onRetry={() => setRetry((r) => r + 1)} />;
}

function Chart({ data, stale, onRetry }: { data: HistoryData; stale: boolean; onRetry: () => void }) {
  const m = useMemo(() => modelOf(data), [data]);
  const n = m.steps.length;
  const [pick, setPick] = useState<number | null>(null);
  const i = pick === null || pick >= n ? n - 1 : pick; // follows the newest trade until the player picks one
  const desc = useId();
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowRight" ? i + 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (to === null) return;
    e.preventDefault();
    setPick(Math.max(0, Math.min(n - 1, to)));
  };
  const hover = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (n > 1 && r.width > 0) setPick(Math.round(((((e.clientX - r.left) / r.width) * W - 8) / (W - 16)) * (n - 1)));
  };
  const s = m.steps[i];
  const bw = Math.max(1, Math.min(14, (W - 16) / Math.max(n, 1) * 0.6));
  return (
    <section className="lpad-hist" data-testid="lp-history" data-points={data.pts.length} data-stale={stale ? "true" : undefined} aria-label={LPS.hTitle}>
      <h3>{LPS.hTitle}</h3>
      <p className="lpad-sub" id={desc}>{LPS.hDefs}</p>
      {m.gap?.kind === "legacy" && <p className="lpad-sub" data-testid="lp-hist-legacy">{LPS.hLegacy}</p>}
      {m.gap?.kind === "since" && <p className="lpad-sub" data-testid="lp-hist-legacy">{LPS.hSince(when(m.gap.atMs))}</p>}
      {m.dropped > 0 && <p className="lpad-sub" data-testid="lp-hist-dropped">{LPS.hDropped(data.pts.length, m.dropped)}</p>}
      {stale && <div className="lpad-row2" role="status" data-testid="lp-hist-stale"><span>{offline ? LPS.hOffline : LPS.hStale}</span><Button size="sm" onClick={onRetry}>{LPS.retry}</Button></div>}
      {n === 0 ? <p className="lpad-sub" data-testid="lp-hist-empty">{LPS.hEmptyLegacy}</p> : (
        <>
          {data.pts.length === 0 && <p className="lpad-sub" data-testid="lp-hist-empty">{LPS.hEmpty}</p>}
          <div className="lpad-hist-grid">
            <div className="lpad-hist-plot" tabIndex={0} role="group" aria-roledescription={LPS.hChart} aria-label={LPS.hKeys} aria-describedby={desc}
              data-testid="lp-hist-plot" onKeyDown={move} onPointerMove={hover}>
              <svg viewBox={`0 0 ${W} ${PH}`} preserveAspectRatio="none" className="lpad-hist-price" aria-hidden="true">
                <path d={stepPath(m)} className="lpad-hist-line" vectorEffect="non-scaling-stroke" />
                {n > 1 && <line x1={xOf(i, n)} x2={xOf(i, n)} y1={0} y2={PH} className="lpad-hist-cursor" vectorEffect="non-scaling-stroke" />}
              </svg>
              <svg viewBox={`0 0 ${W} ${VH}`} preserveAspectRatio="none" className="lpad-hist-vol" aria-hidden="true">
                {m.steps.map((st, k) => st.cents > 0 && (
                  <rect key={k} data-side={st.kind} x={xOf(k, n) - bw / 2} width={bw} y={VH - barH(st.cents, m)} height={barH(st.cents, m)} className={k === i ? "on" : undefined} />
                ))}
              </svg>
            </div>
            <div className="lpad-hist-axis num" aria-hidden="true">
              <span data-testid="lp-hist-pmax">{priceStr(m.price.max)}</span>
              <span className="lpad-hist-axname">{LPS.price}</span>
              <span data-testid="lp-hist-pmin">{priceStr(m.price.min)}</span>
              <span data-testid="lp-hist-vmax">{usd(m.volMax)}</span>
              <span className="lpad-hist-axname">{LPS.hVolume}</span>
              <span>{usd(0)}</span>
            </div>
          </div>
          {s && <p className="lpad-sub num lpad-hist-readout" aria-live="polite" data-testid="lp-hist-readout" data-step={i}>{readout(s, data.pts.length, m.fromLaunch)}</p>}
          <details className="lpad-hist-table">
            <summary data-testid="lp-hist-table-toggle">{LPS.hTable}</summary>
            <table data-testid="lp-hist-table">
              <caption className="lpad-sub">{LPS.hDefs}</caption>
              <thead><tr><th scope="col">{LPS.hNo}</th><th scope="col">{LPS.hTime}</th><th scope="col">{LPS.hSide}</th><th scope="col">{LPS.hTokens}</th><th scope="col">{LPS.hVolume}</th><th scope="col">{LPS.hPriceAfter}</th></tr></thead>
              <tbody>
                {m.steps.map((st) => (
                  <tr key={st.n} data-kind={st.kind}>
                    <td className="num">{m.fromLaunch ? st.n : st.n + 1}</td><td>{when(st.atMs)}</td><td>{kindText(st)}</td>
                    <td className="num">{st.kind === "launch" ? "—" : qty(st.tokens)}</td><td className="num">{st.kind === "launch" ? "—" : usd(st.cents)}</td><td className="num">{priceStr(st.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
