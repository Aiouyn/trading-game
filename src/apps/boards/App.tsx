"use client";
// Boards app, M2-03: the shared world's net-worth leaderboard from GET /api/leaderboard (saved accounts valued at one
// server quote tick, src/market/valuation.ts, the same definition as Portfolio). Signed in only: a signed-out viewer
// gets a sign-in prompt, never demo rows. Loading / error + Retry / empty are stated; a failed refresh keeps the last
// board and says so. Each read belongs to one account: the boundary remounts the app on an account switch, and a
// read started for another account (or an older read) is dropped, so no previous account's board or row is shown.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MoneyText } from "@/components/shell/MoneyText";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { parseLeaderboard, type LeaderboardRow, type LeaderboardView } from "@/market/leaderboard";
import { isSignedIn, openAccountSettings, useAuthChrome } from "@/shell/authChrome";
import { clockAt, clockLabel } from "@/shell/mockChannels";
import { viewportOf } from "@/shell/wm";
import { LB } from "./strings";
import "./boards.css";

/** Re-read cadence while open: the server quote tick (MockFeed FEED_TICK_MS). */
export const BOARD_POLL_MS = 5_000;

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "live"; view: LeaderboardView; refreshFailed: boolean };

async function readBoard(signal: AbortSignal): Promise<LeaderboardView | null> {
  const res = await fetch("/api/leaderboard", { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" }, signal });
  if (!res.ok) { await res.body?.cancel().catch(() => {}); return null; }
  return parseLeaderboard(await res.json());
}

/** Built-app root contract (17B CH-08): the body's root carries data-testid=<app id>. `display: contents` (boards.css),
 *  so the leaderboard below keeps its own box, layout and semantics, and its `leaderboard` test id. */
export default function BoardsApp() {
  return <div className="boards" data-testid="boards"><BoardsBody /></div>;
}

function BoardsBody() {
  const auth = useAuthChrome();
  const store = useShellStore();
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  if (auth.status === "loading") return <div className="lb" data-testid="leaderboard" data-state="loading" aria-busy="true"><Skeleton /></div>;
  if (!isSignedIn(auth)) {
    return (
      <div className="lb" data-testid="leaderboard" data-state="signed-out">
        <p data-testid="lb-signed-out">{LB.signedOut}</p>
        <Button data-testid="lb-sign-in" onClick={() => openAccountSettings(store)}>{LB.signIn}</Button>
      </div>
    );
  }
  // Keyed by account: a new account starts from loading with its own reads.
  return <Board key={auth.account.accountId} phone={phone} />;
}

function Board({ phone }: { phone: boolean }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const seq = useRef(0);
  const ctl = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    let view: LeaderboardView | null = null;
    try { view = await readBoard(c.signal); } catch { view = null; }
    if (c.signal.aborted || mine !== seq.current) return; // an older read, or this board is gone
    setState((prev) => (view ? { kind: "live", view, refreshFailed: false } : prev.kind === "live" ? { ...prev, refreshFailed: true } : { kind: "error" }));
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, BOARD_POLL_MS);
    const reads = seq, inFlight = ctl;
    return () => { clearInterval(t); reads.current++; inFlight.current?.abort(); };
  }, [load]);
  const retry = () => { setState((s) => (s.kind === "error" ? { kind: "loading" } : s)); void load(); };

  if (state.kind === "loading") return <div className="lb" data-testid="leaderboard" data-state="loading" aria-busy="true"><Skeleton /></div>;
  if (state.kind === "error") {
    return (
      <div className="lb" data-testid="leaderboard" data-state="error">
        <div className="lb-error" data-testid="lb-error">
          <span role="alert">{LB.couldntLoad}</span>
          <Button data-testid="lb-retry" onClick={retry}>{LB.retry}</Button>
        </div>
      </div>
    );
  }
  return <BoardView view={state.view} refreshFailed={state.refreshFailed} phone={phone} onRetry={retry} />;
}

function BoardView({ view, refreshFailed, phone, onRetry }: { view: LeaderboardView; refreshFailed: boolean; phone: boolean; onRetry: () => void }) {
  const { day, hhmm } = clockLabel(clockAt(view.tick));
  const selfInTop = view.rows.some((r) => r.self);
  const findMe = () => {
    const el = document.querySelector<HTMLElement>('[data-testid="leaderboard"] [data-self="true"]');
    el?.scrollIntoView({ block: "nearest" });
    el?.focus();
  };
  return (
    <div className={`lb${phone ? " lb-phone" : ""}`} data-testid="leaderboard" data-state="live" data-tick={view.tick}>
      <header className="lb-head">
        <h2 className="lb-title">{LB.title}<span className="muted">{` · ${LB.world}`}</span></h2>
        <p className="lb-meta muted" data-testid="lb-valued-at">{`${LB.valuedAt(day, hhmm, view.tick)} · ${LB.players(view.players)}`}</p>
        {view.self ? (
          <p className="lb-you" data-testid="lb-your-rank">
            <span>{LB.yourRank(view.self.rank, view.players)}</span>
            <Button size="sm" data-testid="lb-find-me" onClick={findMe}>{LB.findMe}</Button>
          </p>
        ) : <p className="muted" data-testid="lb-self-unvalued">{LB.selfUnvalued}</p>}
        {refreshFailed && (
          <p className="lb-stale" role="status" data-testid="lb-refresh-failed">
            <span>{LB.couldntUpdate}</span>
            <Button size="sm" data-testid="lb-retry" onClick={onRetry}>{LB.retry}</Button>
          </p>
        )}
      </header>
      {view.rows.length === 0 ? <p className="muted" data-testid="lb-empty">{LB.empty}</p> : (
        <table className="lb-table" data-testid="lb-table">
          <thead><tr><th scope="col" className="lb-col-rank">{LB.colRank}</th><th scope="col">{LB.colPlayer}</th><th scope="col" className="lb-col-nw">{LB.colNw}</th></tr></thead>
          <tbody>
            {view.rows.map((r) => <Row key={r.handle} r={r} />)}
            {!selfInTop && view.self && (
              <>
                <tr className="lb-gap" aria-hidden="true"><td colSpan={3}>{"⋯"}</td></tr>
                <Row r={view.self} />
              </>
            )}
          </tbody>
        </table>
      )}
      <p className="lb-foot muted">{view.players > view.rows.length ? `${LB.topOnly(view.rows.length)} · ${LB.howRanked}` : LB.howRanked}</p>
    </div>
  );
}

function Row({ r }: { r: LeaderboardRow }) {
  return (
    <tr className={`lb-row${r.self ? " lb-self" : ""}`} data-testid="lb-row" data-rank={r.rank} data-handle={r.handle} data-self={r.self ? "true" : undefined}
      aria-current={r.self ? "true" : undefined} tabIndex={r.self ? 0 : -1}>
      <td className="lb-col-rank num" data-testid="lb-rank">{String(r.rank)}</td>
      <td className="lb-player"><span className="lb-handle" data-testid="lb-handle">{r.handle}</span>{r.self && <Chip className="lb-you-chip" data-testid="lb-you">{LB.you}</Chip>}</td>
      <td className="lb-col-nw num" data-testid="lb-nw"><MoneyText amount={r.nw} ctx="table" /></td>
    </tr>
  );
}

function Skeleton() {
  return (
    <section className="lb-skel" aria-label={LB.loading} data-testid="lb-loading">
      {Array.from({ length: 5 }, (_, i) => <div key={i} className="lb-skel-row" />)}
    </section>
  );
}
