"use client";
// The firm dossier: accounts that reconcile, unit economics, who it deals with, what it owes, who owns it, how it compares,
// what it is exposed to, what is coming, and where every fact came from. Public or filed facts only.
import { useEffect, useState } from "react";
import { gameDate, presentNote } from "@/components/ui/format";
import { moneyTitle } from "@/apps/businesses/sheet";
import { moveWords, splitDrivers } from "./drivers";

interface Line { label: string; cents: number; note?: string }
interface Peer { id: string; name: string; self: boolean; good: string; px: number; day: number; month: number | null; pe: number | null; priceToSales: number; margin: number; staff: number }
interface Rev { name: string; headline: string; weight: number; profitRate: number; horizonDays: number; exposure: string; insideDay: number; publicDay: number; source: string; mark?: number; next?: { day: number; pct: number; traded: boolean } }
interface Dossier {
  asOf: number; id: string; name: string; sector: string; goodName: string; ceo: string | null; staff: number;
  price: { px: number; cap: number; shares: number; executable: boolean; rule: string | null } | null;
  income: { basis: string; label: string; day: number; audited: boolean; lines: Line[]; eps: number; check: string };
  balance: Line[]; cashFlow: Line[];
  units: {
    price: number; unitCost: number; perUnit: number; markup: number; soldPerDay: number; madePerDay: number; workers: number;
    outputPerWorker: number; recipeOutput: number; productivity: number; priceSinceMonthStart: number; costSinceMonthStart: number;
    volumeVsNorm: number; machinery: number; operations: string | null; tilt: number;
  };
  inventory: { units: number; daysOfSales: number | null };
  counterparties: { suppliers: { good: string; name: string; shareOfPrice: number; suppliers: { id: string; name: string }[] }[]; buyers: { id: string; name: string; good: string }[]; households: number; government: number };
  debt: { loan: number; charter: number; rate: number; interestMonth: number; maturity: string; cover: number | null };
  ownership: { shares: number; holders: { id: string; name: string; shares: number; pct: number }[]; ipoPx: number; dilution: { day: number; note: string } | null };
  comparables: Peer[];
  exposures: {
    commodities: { good: string; name: string; shareOfPrice: number; future: number }[];
    sells: { name: string; future: number } | null;
    rates: { beta: number; debt: number; oneHundredBp: number; note: string };
    fx: string;
  };
  upcoming: { nextPrint: number; daysAway: number; forecast: { profit: number; low: number; high: number; analysts: number; lagDays: number } | null; bankMeeting: number | null; shocks: { text: string; daysLeft: number }[] };
  revisions: Rev[];
  sources: { fact: string; source: string; day: number; confidence: string; how: string }[];
  privacy: string;
}

const pct = (x: number, d = 1): string => `${x >= 0 ? "+" : "−"}${(Math.abs(x) * 100).toFixed(d)}%`;
const mult = (x: number | null): string => (x === null ? "no profit" : `${x.toFixed(1)}×`);

function Statement({ title, lines, foot }: { title: string; lines: Line[]; foot?: string }) {
  return (
    <div className="rs-stmt">
      <h3 className="rs-sub">{title}</h3>
      <table className="rs-table">
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} data-total={/^(Total|Profit|Equity)/.test(l.label) ? "1" : "0"}>
              <th scope="row">{l.label}{l.note ? <span className="qa-muted rs-note"> {l.note}</span> : null}</th>
              <td className="num" title={moneyTitle(l.cents)}>{moneyTitle(l.cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {foot ? <p className="qa-muted rs-foot">{foot}</p> : null}
    </div>
  );
}

export function Dossier({ firm, day }: { firm: string; day: number }) {
  const [d, setD] = useState<Dossier | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!firm) return;
    const ac = new AbortController();
    setBad(false);
    void fetch(`/api/sim/dossier/${encodeURIComponent(firm)}`, { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Dossier>) : null))
      .then((j) => { if (j) { setD(j); setBad(false); } else setBad(true); })
      .catch(() => { if (!ac.signal.aborted) setBad(true); });
    return () => ac.abort();
  }, [firm, day]);
  if (!d) return <div className="qa-block" data-testid="research-dossier"><h2 className="qa-title">Dossier</h2><p className="qa-muted">{bad ? "No dossier for this name: it is not a listed firm." : "Opening the books…"}</p></div>;
  const u = d.units;
  return (
    <div className="qa-block rs-dossier" data-testid="research-dossier">
      <h2 className="qa-title">Dossier</h2>
      <p className="qa-muted">As of {gameDate(d.asOf)}. {d.goodName ? `Makes ${d.goodName}. ` : ""}{d.staff} on the payroll{d.ceo ? `, led by ${d.ceo}` : ""}.</p>

      <section data-testid="dossier-accounts" className="rs-grid">
        <Statement title={d.income.label + (d.income.audited ? ` (filed ${gameDate(d.income.day)})` : "")} lines={d.income.lines} foot={`${d.income.check} EPS ${moneyTitle(d.income.eps)}.`} />
        <Statement title="Balance sheet today" lines={d.balance} />
        <Statement title="Cash and debt" lines={d.cashFlow} />
      </section>

      <section data-testid="dossier-units">
        <h3 className="rs-sub">Unit economics</h3>
        <table className="rs-table">
          <tbody>
            <tr><th scope="row">Price and cost per unit</th><td className="num">{moneyTitle(u.price)} and {moneyTitle(u.unitCost)}: {moneyTitle(u.perUnit)} a unit ({((u.markup - 1) * 100).toFixed(0)}% markup)</td></tr>
            <tr><th scope="row">Volume and price against the month start</th><td className="num">sold {u.soldPerDay.toLocaleString("en-US")} a day, {pct(u.volumeVsNorm)} on its norm; price {pct(u.priceSinceMonthStart)}, cost {pct(u.costSinceMonthStart)}</td></tr>
            <tr><th scope="row">Output per worker</th><td className="num">{u.outputPerWorker.toFixed(1)} against {u.recipeOutput} in the plan ({u.workers} workers, {u.machinery.toLocaleString("en-US")} units of plant)</td></tr>
            <tr><th scope="row">Inventory</th><td className="num">{d.inventory.units.toLocaleString("en-US")} units{d.inventory.daysOfSales !== null ? `, ${d.inventory.daysOfSales.toFixed(1)} days of sales` : ""}</td></tr>
            {u.operations ? <tr><th scope="row">What operations say today</th><td>{u.operations} (tilt on the value {pct(u.tilt)})</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section data-testid="dossier-counterparties">
        <h3 className="rs-sub">Counterparties</h3>
        <p><strong>Buys from</strong>: {d.counterparties.suppliers.length ? d.counterparties.suppliers.map((s) => `${s.suppliers.map((x) => x.name).join(", ") || "no maker"} (${s.name}, ${(s.shareOfPrice * 100).toFixed(0)}% of its price)`).join("; ") : "nothing but labour"}.</p>
        <p><strong>Sells to</strong>: households ({(d.counterparties.households * 100).toFixed(1)}% of their budget), the government ({(d.counterparties.government * 100).toFixed(1)}% of its budget){d.counterparties.buyers.length ? `, and firms that use it: ${d.counterparties.buyers.slice(0, 5).map((b) => b.name).join(", ")}` : ""}.</p>
      </section>

      <section data-testid="dossier-debt">
        <h3 className="rs-sub">Debt and maturities</h3>
        <p>{moneyTitle(d.debt.loan + d.debt.charter)} owed at {(d.debt.rate * 100).toFixed(2)}%, {moneyTitle(d.debt.interestMonth)} interest a month{d.debt.cover !== null ? `, covered ${d.debt.cover.toFixed(1)} times by last month's profit` : ""}.</p>
        <p className="qa-muted">{d.debt.maturity}</p>
      </section>

      <section data-testid="dossier-ownership">
        <h3 className="rs-sub">Ownership</h3>
        <p>{d.ownership.shares.toLocaleString("en-US")} shares; {d.ownership.dilution ? `last split ${gameDate(d.ownership.dilution.day)}.` : "no split or new issue on record."}</p>
        <table className="rs-table"><tbody>
          {d.ownership.holders.map((h) => <tr key={h.id}><th scope="row">{h.name}</th><td className="num">{h.shares.toLocaleString("en-US")} shares, {(h.pct * 100).toFixed(1)}%</td></tr>)}
        </tbody></table>
      </section>

      <section data-testid="dossier-comparables">
        <h3 className="rs-sub">Comparables in {d.sector.toLowerCase()}</h3>
        <table className="rs-table rs-wide">
          <thead><tr><th scope="col">Firm</th><th scope="col">Price</th><th scope="col">Day</th><th scope="col">Month</th><th scope="col">P/E</th><th scope="col">P/Sales</th><th scope="col">Margin</th></tr></thead>
          <tbody>
            {d.comparables.map((p) => (
              <tr key={p.id} data-self={p.self ? "1" : "0"}>
                <th scope="row">{p.name}{p.self ? " (this firm)" : ""}</th>
                <td className="num">{moneyTitle(p.px)}</td><td className="num">{pct(p.day)}</td><td className="num">{p.month === null ? "–" : pct(p.month)}</td>
                <td className="num">{mult(p.pe)}</td><td className="num">{p.priceToSales.toFixed(2)}{"×"}</td><td className="num">{(p.margin * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section data-testid="dossier-exposures">
        <h3 className="rs-sub">Exposures</h3>
        <p><strong>Commodities</strong>: {d.exposures.commodities.length ? d.exposures.commodities.map((c) => `${c.name} is ${(c.shareOfPrice * 100).toFixed(0)}% of what it charges (front future ${moneyTitle(c.future)})`).join("; ") : "none that trade as futures"}{d.exposures.sells ? `; it sells ${d.exposures.sells.name} (front future ${moneyTitle(d.exposures.sells.future)})` : ""}.</p>
        <p><strong>Rates</strong>: price follows the policy rate at {d.exposures.rates.beta.toFixed(1)}{"×"} the market; each point on the rate adds {moneyTitle(d.exposures.rates.oneHundredBp)} of interest a year.</p>
        <p><strong>Currency</strong>: {d.exposures.fx}</p>
      </section>

      <section data-testid="dossier-upcoming">
        <h3 className="rs-sub">What is coming</h3>
        <p>Next quarter closes {gameDate(d.upcoming.nextPrint)}, in {d.upcoming.daysAway} day{d.upcoming.daysAway === 1 ? "" : "s"}.{" "}
          {d.upcoming.forecast ? `The street expects ${moneyTitle(d.upcoming.forecast.profit)}, between ${moneyTitle(d.upcoming.forecast.low)} and ${moneyTitle(d.upcoming.forecast.high)} (${d.upcoming.forecast.analysts} analysts, books ${d.upcoming.forecast.lagDays} days old).` : "The street has not published a forecast range yet; it comes a few days before the print."}
          {d.upcoming.bankMeeting !== null ? ` The central bank meets ${gameDate(d.upcoming.bankMeeting)}.` : ""}</p>
        {d.upcoming.shocks.map((s) => <p key={s.text} className="rs-warn">Live: {s.text.replace(/:(\S)/g, ": $1")}. {s.daysLeft} days to run.</p>)}
        {d.revisions.length ? (
          <div data-testid="dossier-revisions">
            <p className="qa-muted">News that changed the forecast:</p>
            {d.revisions.map((r) => (
              <p key={`${r.headline}-${r.publicDay}`}>
                {gameDate(r.publicDay)}: {r.headline}. {r.exposure}. Forecast earnings {pct(r.weight)} ({pct(r.profitRate, 0)} profit rate for about {r.horizonDays} days).
                {r.mark === undefined ? " Too small to reprice the shares." : ""}
                {r.next ? ` Next close ${pct(r.next.pct / 100)}, ${r.next.traded ? "on trades" : "a mark with no trade"}.` : ""}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section data-testid="dossier-sources">
        <h3 className="rs-sub">Sources and how sure to be</h3>
        <table className="rs-table rs-wide">
          <thead><tr><th scope="col">Fact</th><th scope="col">Source</th><th scope="col">Disclosed</th><th scope="col">Confidence</th></tr></thead>
          <tbody>
            {d.sources.map((s, i) => (
              <tr key={i}><th scope="row">{presentNote(s.fact)}</th><td>{s.source}</td><td>{gameDate(s.day)}</td><td>{s.confidence}<span className="qa-muted rs-note"> {s.how}</span></td></tr>
            ))}
          </tbody>
        </table>
        <p className="qa-muted">{d.privacy}</p>
      </section>
    </div>
  );
}

/** Why? lines for the price: a move line reads as its inputs, so the chain names what changed the quote. */
export function WhyList({ id, lines }: { id: number | null; lines: { id: number; depth: number; day: number; msg: string; kind?: string; name?: string; missing?: boolean }[] | null }) {
  if (id === null) return null;
  return (
    <div className="qa-because" data-testid="qa-why">
      {lines && lines.length ? lines.map((line) => {
        const sp = splitDrivers(line.msg);
        const pad = { paddingLeft: line.depth * 12 };
        if (sp.drivers.length) {
          const at = sp.head.search(/(close|mark) \d/);
          const name = at > 0 ? sp.head.slice(0, at).replace(/^eq:frm_/, "").trim() : "";
          return (
            <div key={`${line.id}-${line.depth}`} style={pad} data-testid="qa-why-drivers">
              <p><span className="label">{gameDate(line.day)}</span> {name ? `${name.replace(/_/g, " ")} ` : ""}{moveWords(at >= 0 ? sp.head.slice(at) : sp.head)}. What moved it:</p>
              <ul className="rs-drivers">{sp.drivers.map((x, i) => <li key={i}>{presentNote(x)}</li>)}</ul>
            </div>
          );
        }
        if (line.kind === "mkt.who" || line.kind === "mkt.open") return null;
        return (
          <p key={`${line.id}-${line.depth}`} style={pad}>
            <span className="label">{gameDate(line.day)}</span>{" "}
            {line.missing ? presentNote(line.msg) : `${line.name ? `${line.name}: ` : ""}${presentNote(line.msg)}`}
          </p>
        );
      }) : <p className="qa-muted">{lines ? "No cause on record." : "Reading the cause…"}</p>}
    </div>
  );
}
