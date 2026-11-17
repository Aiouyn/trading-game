"use client";
// Portfolio on the simulation: the player's real balance sheet.
import { MoneyText } from "@/components/shell/MoneyText";
import { dollars, symbolOf, useSimSnap } from "@/shell/simSession";
import "./portfolio.css";

function coinPx(px: number): string {
  if (!Number.isFinite(px)) return "0.00";
  if (Number.isInteger(px)) return dollars(px);
  return px.toFixed(4);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="sim-pf-row">
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

export default function PortfolioApp() {
  const { view } = useSimSnap();
  if (!view) return <div className="pf" data-testid="portfolio"><p className="muted">The books are not open.</p></div>;
  const shares = view.shares ?? [];
  const bonds = view.bonds ?? [];
  const futures = view.futures ?? [];
  const options = (view.chain ?? []).filter((c) => c.net !== 0);
  const coins = view.coins ?? [];
  const homes = (view.homes ?? []).filter((h) => h.mine);
  const loans = view.loans ?? [];
  const deposits = view.deposits ?? [];
  const stockLoans = view.stockLoans ?? [];

  return (
    <div className="pf sim-pf" data-testid="portfolio">
      <div className="pf-hero">
        <span className="pf-label">Net worth</span>
        <div className="pf-hero-nw"><MoneyText amount={dollars(view.netWorth)} ctx="hero" /></div>
        <span className="today"><MoneyText amount={dollars(view.nwChange ?? 0)} ctx="delta" /></span>
      </div>
      {view.stats?.length ? (
        <ul className="sim-life" data-testid="pf-life">
          {view.stats.map((s) => (
            <li key={s.id} title={s.hover}><span className="label">{s.label}</span><span>{s.word}</span></li>
          ))}
        </ul>
      ) : null}
      <section>
        <h2 className="label">Shares</h2>
        {shares.length ? shares.map((h) => (
          <div key={h.instr} className="sim-pf-row" data-testid="pf-share">
            <span>{symbolOf(h.instr)} · {h.qty}</span>
            <MoneyText amount={dollars(h.px)} ctx="list" />
          </div>
        )) : <p className="muted">No shares.</p>}
      </section>
      {bonds.length ? (
        <section>
          <h2 className="label">Bonds</h2>
          {bonds.map((b) => <Row key={b.instr} label={b.instr} value={dollars(b.face)} />)}
        </section>
      ) : null}
      {futures.length ? (
        <section>
          <h2 className="label">Futures</h2>
          {futures.map((f) => (
            <Row key={`${f.good}-${f.monthsAhead}`} label={`${f.good} · ${f.monthsAhead}m · ${f.net}`} value={dollars(f.px)} />
          ))}
        </section>
      ) : null}
      {options.length ? (
        <section>
          <h2 className="label">Options</h2>
          {options.map((c) => (
            <Row key={c.id} label={`${symbolOf(c.instr)} ${c.right} ${dollars(c.strike)} · ${c.months}m · ${c.net}`} value={`${dollars(c.bid)} / ${dollars(c.ask)}`} />
          ))}
        </section>
      ) : null}
      {coins.length ? (
        <section>
          <h2 className="label">Coins</h2>
          {coins.map((c) => <Row key={c.id} label={`${c.name} · ${c.qty}`} value={coinPx(c.px)} />)}
        </section>
      ) : null}
      {homes.length ? (
        <section>
          <h2 className="label">Property</h2>
          {homes.map((h) => (
            <Row key={h.id} label={`${h.neighbourhood}${h.live ? " · you live here" : ""}`} value={`${dollars(h.price)} · rent ${dollars(h.rent)}`} />
          ))}
        </section>
      ) : null}
      {loans.length ? (
        <section>
          <h2 className="label">Loans</h2>
          {loans.map((l) => (
            <Row key={`${l.kind}-${l.eventId}`} label={`${l.kind} · ${(l.rate * 100).toFixed(2)}%`} value={dollars(l.owed)} />
          ))}
        </section>
      ) : null}
      <section>
        <h2 className="label">Cash</h2>
        <Row label="Cash" value={dollars(view.cash)} />
        {deposits.map((d) => <Row key={`${d.bank}-${d.eventId}`} label={d.bank} value={dollars(d.cents)} />)}
        {view.marginPosted ? <Row label="Margin posted" value={dollars(view.marginPosted)} /> : null}
        {stockLoans.map((s) => (
          <Row key={`${s.instr}-${s.eventId}`} label={`Stock loan ${symbolOf(s.instr)} · ${s.qty}`} value={dollars(s.face)} />
        ))}
      </section>
    </div>
  );
}
