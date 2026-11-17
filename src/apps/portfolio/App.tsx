"use client";
// Portfolio on the simulation: positions, day P&L, loans, the net-worth line, and fills.
import type { ReactNode } from "react";
import { MoneyText } from "@/components/shell/MoneyText";
import { useShellStore } from "@/components/shell/ShellContext";
import { dateLabel, dollars, symbolOf, useSimSnap, type SimView } from "@/shell/simSession";
import { Cause, LineChart, NumBtn, tone, useCause } from "@/apps/markets/why";
import "./portfolio.css";

const LOT = 16000;

export default function PortfolioApp() {
  const { view } = useSimSnap();
  const { cause, ask, close } = useCause();
  const store = useShellStore();
  if (!view) return <div className="pf" data-testid="portfolio"><p className="muted">The books are not open.</p></div>;
  const open = (ctx: string) => store.getState().open("broker", ctx);
  const shorts = view.quotes.filter((q) => (q.pos ?? 0) < 0 && !view.shares.some((s) => s.instr === q.instr));
  const book = view.risk?.eventId;
  const points = netPoints(view);
  const up = points.length > 1 ? points[points.length - 1].worth >= points[0].worth : (view.nwChange ?? 0) >= 0;

  return (
    <div className="pf sim-pf" data-testid="portfolio">
      <div className="pf-hero">
        <span className="pf-label">Net worth</span>
        <div className="pf-hero-nw">
          <NumBtn id={book} title="Net worth" ask={ask}><MoneyText amount={dollars(view.netWorth)} ctx="hero" /></NumBtn>
        </div>
        <span className="today"><NumBtn id={book} title="Change today" ask={ask}><MoneyText amount={dollars(view.nwChange ?? 0)} ctx="delta" /></NumBtn></span>
      </div>
      {view.stats?.length ? (
        <ul className="sim-life" data-testid="pf-life">
          {view.stats.map((s) => (
            <li key={s.id} title={s.hover}>
              <span className="label">{s.label}</span>
              <NumBtn id={s.eventId} title={s.label} ask={ask}><span>{s.word}</span></NumBtn>
            </li>
          ))}
        </ul>
      ) : null}
      <section>
        <h2 className="label">Net worth</h2>
        <LineChart points={points.map((p) => p.worth)} up={up} label="Net worth over time" />
      </section>
      <section>
        <h2 className="label">Shares</h2>
        {view.shares.length || shorts.length ? (
          <>
            {view.shares.map((h) => {
              const q = view.quotes.find((x) => x.instr === h.instr);
              const prev = q?.prev ?? h.px;
              return (
                <Pos key={h.instr} testid="pf-share" name={`${symbolOf(h.instr)} · ${h.qty}`} onOpen={() => open(h.instr)}
                  value={h.px * h.qty} day={(h.px - prev) * h.qty} id={h.eventId} ask={ask} />
              );
            })}
            {shorts.map((q) => (
              <Pos key={q.instr} testid="pf-share" name={`${symbolOf(q.instr)} · ${q.pos}`} onOpen={() => open(q.instr)}
                value={(q.pos ?? 0) * q.px} day={(q.pos ?? 0) * (q.px - q.prev)} id={q.eventId} ask={ask} />
            ))}
          </>
        ) : <p className="muted">No shares.</p>}
      </section>
      <Block title="Bonds" empty="No bonds." show={view.bonds.length > 0}>
        {view.bonds.map((b) => {
          const px = b.px ?? 0;
          const prev = b.prev ?? px;
          const lots = px > 0 ? b.face / LOT : 0;
          return (
            <Pos key={b.instr} name={`${b.tenor || b.instr} · face ${dollars(b.face)}`} onOpen={() => open(`bond:${b.tenor || b.instr}`)}
              value={Math.round(lots * px)} day={Math.round(lots * (px - prev))} id={b.eventId} ask={ask} />
          );
        })}
      </Block>
      <Block title="Futures" empty="" show={view.futures.length > 0}>
        {view.futures.map((f) => {
          const board = view.futuresBoard?.find((b) => b.good === f.good);
          const prev = board?.tenors.find((t) => t.monthsAhead === f.monthsAhead)?.prev;
          const lot = board?.lot ?? 1;
          const day = prev == null ? undefined : f.net * (f.px - prev) * lot;
          return (
            <Pos key={`${f.good}-${f.monthsAhead}`} name={`${board?.name || f.good} · ${f.monthsAhead}m · ${f.net}`} onOpen={() => open(`fut:${f.good}`)}
              value={f.net * f.px * lot} day={day} id={f.eventId} ask={ask} />
          );
        })}
      </Block>
      <Block title="Options" empty="" show={(view.chain ?? []).some((c) => c.net !== 0)}>
        {(view.chain ?? []).filter((c) => c.net !== 0).map((c) => {
          const mark = c.net > 0 ? c.bid : c.ask;
          return (
            <Pos key={c.id} name={`${symbolOf(c.instr)} ${c.right} ${dollars(c.strike)} · ${c.months}m · ${c.net}`} onOpen={() => open(`opt:${c.instr}`)}
              value={c.net * mark * 100} day={null} id={c.eventId} ask={ask} />
          );
        })}
      </Block>
      <Block title="Coins" empty="" show={view.coins.length > 0}>
        {view.coins.map((c) => {
          const board = view.coinBoard?.find((x) => x.id === c.id);
          const prev = board?.prev ?? c.px;
          return (
            <Pos key={c.id} name={`${c.name} · ${c.qty}`} onOpen={() => open(c.id.startsWith("coin:") ? c.id : `coin:${c.id}`)}
              value={Math.round(c.px * c.qty)} day={Math.round((c.px - prev) * c.qty)} id={c.eventId} ask={ask} />
          );
        })}
      </Block>
      {view.fx && (view.fx.held || view.fx.bonds) ? (
        <section>
          <h2 className="label">Foreign currency</h2>
          {view.fx.held ? (
            <Pos name={`${view.fx.currency || "Foreign"} cash`} onOpen={() => open("fx")}
              value={Math.round(view.fx.held * view.fx.mid)} id={view.fx.eventId} ask={ask} />
          ) : null}
          {view.fx.bonds ? (
            <Pos name="Foreign bonds" onOpen={() => open("fx")}
              value={Math.round(view.fx.bonds * view.fx.mid)} id={view.fx.eventId} ask={ask} />
          ) : null}
        </section>
      ) : null}
      <Block title="Property" empty="" show={view.homes.some((h) => h.mine)}>
        {view.homes.filter((h) => h.mine).map((h) => (
          <div key={h.id} className="sim-pf-row">
            <span>{h.neighbourhood}{h.live ? " · you live here" : ""}</span>
            <span className="num">{dollars(h.price)} · rent {dollars(h.rent)}</span>
          </div>
        ))}
      </Block>
      <section>
        <h2 className="label">Loans and margin</h2>
        <Pos name="Cash" value={view.cash} id={book} ask={ask} />
        {(view.deposits ?? []).map((d) => <Pos key={`${d.bank}-${d.eventId}`} name={d.bank} value={d.cents} id={d.eventId} ask={ask} />)}
        {view.loans.map((l) => (
          <Pos key={`${l.kind}-${l.eventId}`} name={`${l.kind} · ${(l.rate * 100).toFixed(2)}%`} value={-l.owed} id={l.eventId} ask={ask} />
        ))}
        {view.risk?.open ? (
          <>
            {view.loans.some((l) => l.kind === "margin") ? null : <Pos name="Margin loan" value={-(view.risk.loanOwed ?? 0)} id={view.risk.eventId} ask={ask} />}
            <Pos name="Loan limit" value={view.risk.limit ?? 0} id={view.risk.eventId} ask={ask} />
            <Pos name="Futures margin posted" value={view.risk.futPosted ?? 0} id={view.risk.eventId} ask={ask} />
            <Pos name="Option margin posted" value={view.risk.optPosted ?? 0} id={view.risk.eventId} ask={ask} />
          </>
        ) : view.marginPosted ? <Pos name="Margin posted" value={view.marginPosted} id={book} ask={ask} /> : <p className="muted">No margin account.</p>}
        {(view.stockLoans ?? []).map((s) => (
          <Pos key={`${s.instr}-${s.eventId}`} name={`Stock loan ${symbolOf(s.instr)} · ${s.qty}`} value={-s.face} id={s.eventId} ask={ask} />
        ))}
      </section>
      <section>
        <h2 className="label">Fills</h2>
        <p className="muted">Why on a fill opens the exchange, the cause kept for that book.</p>
        {(view.fills ?? []).length ? [...(view.fills ?? [])].reverse().map((f, i) => (
          <div key={`${f.day}-${i}`} className="sim-pf-row" data-testid="pf-fill">
            <button type="button" className="pf-link" onClick={() => ask(f.eventId, f.text)}>
              <span className="label">{dateLabel(f.day)} · {f.kind}</span> {f.text}
            </button>
          </div>
        )) : <p className="muted">No fills yet.</p>}
      </section>
      <Cause cause={cause} onClose={close} />
    </div>
  );
}

function netPoints(view: SimView): { day: number; worth: number }[] {
  const pts = [...(view.score ?? [])];
  const today = view.date.abs;
  if (!pts.length || pts[pts.length - 1].day !== today) pts.push({ day: today, worth: view.netWorth });
  return pts;
}

function Block({ title, empty, show, children }: { title: string; empty: string; show: boolean; children: ReactNode }) {
  if (!show) return empty ? <section><h2 className="label">{title}</h2><p className="muted">{empty}</p></section> : null;
  return <section><h2 className="label">{title}</h2>{children}</section>;
}

function Pos({ name, value, day, id, ask, onOpen, testid }: {
  name: string;
  value: number;
  day?: number | null;
  id?: number;
  ask: (id: number, title: string) => void;
  onOpen?: () => void;
  testid?: string;
}) {
  return (
    <div className="sim-pf-row" data-testid={testid}>
      {onOpen ? <button type="button" className="pf-link" onClick={onOpen}>{name}</button> : <span>{name}</span>}
      <span className="pf-nums">
        <NumBtn id={id} title={name} ask={ask}><MoneyText amount={dollars(Math.round(value))} ctx="table" /></NumBtn>
        {day == null ? (day === null ? <span className="muted num"> —</span> : null) : (
          <NumBtn id={id} title={`${name} today`} ask={ask}><span className={tone(day)}> <MoneyText amount={dollars(Math.round(day))} ctx="delta" /></span></NumBtn>
        )}
      </span>
    </div>
  );
}
