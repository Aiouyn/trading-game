"use client";
// Portfolio on the simulation: positions, day P&L, loans, the net-worth line, and fills.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoneyText } from "@/components/shell/MoneyText";
import { useShellStore } from "@/components/shell/ShellContext";
import { act, dollars, explain, symbolOf, useSimSnap, type ExplainLine, type SimView } from "@/shell/simSession";
import { gameDate, moneyFromCents, presentNote } from "@/components/ui/format";
import { LiveNum } from "@/components/ui/LiveNum";
import { LineChart, tone } from "@/apps/markets/why";
import "@/apps/markets/why.css";
import "./portfolio.css";
import { accountOf, type Account } from "@/components/market/facts";

const LOT = 16000;

/** One "Why?": a title, the sentences that explain the figure from the books, and the sim's own recorded reasons (an event id). */
interface Why { title: string; plain: string[]; id?: number }
type OpenWhy = Why & { lines: ExplainLine[] | null };

function usePfWhy() {
  const [why, setWhy] = useState<OpenWhy | null>(null);
  const req = useRef(0);
  const open = (w: Why) => {
    const n = ++req.current;
    const asks = w.id !== undefined && w.id >= 0;
    setWhy({ ...w, lines: asks ? null : [] });
    if (asks) void explain(w.id!).then((lines) => { if (req.current === n) setWhy({ ...w, lines }); });
  };
  return { why, open, close: () => { req.current++; setWhy(null); } };
}

/** The explanation sits at the top of the window, where the player is looking, and scrolls into view when it opens. */
function WhyPanel({ why, onClose }: { why: OpenWhy | null; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const key = why ? `${why.title}|${why.plain.join("|")}` : "";
  useEffect(() => { if (key) ref.current?.scrollIntoView({ block: "nearest" }); }, [key]);
  if (!why) return null;
  const reasons = (why.lines ?? [])
    .filter((l) => l.kind !== "genesis" && !l.missing)
    .map((l) => ({ id: l.id, depth: l.depth, text: presentNote(`${l.name ? `${l.name}: ` : ""}${l.msg}`), day: l.day }))
    .filter((l) => l.text)
    .slice(0, 5);
  return (
    <aside className="cause" data-testid="why-panel" ref={ref}>
      <div className="cause-bar">
        <p className="cause-title">{why.title}</p>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {why.plain.map((t, i) => <p key={i} className="cause-line">{t}</p>)}
      {why.lines === null ? <p className="muted">Reading what the books recorded…</p> : reasons.length ? (
        <>
          <p className="cause-line muted">What led to this, newest first: each line happened because of the line under it.</p>
          {reasons.map((r) => <p key={r.id} className="cause-line" style={{ paddingLeft: r.depth * 12 }}><span className="label">{gameDate(r.day)}</span> {r.text}</p>)}
        </>
      ) : null}
    </aside>
  );
}

/** A figure that opens its explanation. The explanation is built from the books, so it is never empty. */
function Num({ w, ask, children }: { w: Why; ask: (w: Why) => void; children: ReactNode }) {
  return (
    <button type="button" className="num-btn" title="Why?" onClick={() => ask(w)}>
      {children}
      <span className="num-why"> Why?</span>
    </button>
  );
}

/** The price the chart shows: the live minute price when the sim sends one, else the books' mark. */
const liveOf = (view: SimView, instr: string, fallback: number): number => {
  const v = view.live?.px?.[instr];
  return typeof v === "number" && v > 0 ? v : fallback;
};
const sign = (cents: number): string => (cents > 0 ? "+" : "") + moneyFromCents(cents);
const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** Open profit or loss in words: "+$12.00 (+3.4%)". */
const openWord = (pnl: number, pct: number): string => `${pnl >= 0 ? "+" : "-"}${moneyFromCents(Math.abs(pnl))} (${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%)`;

export default function PortfolioApp({ context }: { context?: string }) {
  const { view } = useSimSnap();
  const [coverNote, setCoverNote] = useState("");
  const { why, open: ask, close } = usePfWhy();
  const store = useShellStore();
  if (!view) return <div className="pf" data-testid="portfolio"><p className="muted">The books are not open.</p></div>;
  const open = (ctx: string) => store.getState().open("broker", ctx);
  const acct = accountOf(view);
  if (context === "Journal") {
    // The second window of the Review layout is the journal: the cash statement and every fill, not a copy of the portfolio.
    return (
      <div className="pf sim-pf" data-testid="portfolio-journal">
        <h2 className="label">Journal: your cash statement and every fill</h2>
        <WhyPanel why={why} onClose={close} />
        {view.live?.book ? <Statement book={view.live.book} cash={acct?.cash ?? view.cash} today={view.date.abs} /> : null}
        <section>
          <h2 className="label">Fills</h2>
          <p className="muted">Choose a fill to see what the books recorded about it.</p>
          {(view.fills ?? []).length ? [...(view.fills ?? [])].reverse().map((f, i) => (
            <div key={`${f.day}-${i}`} className="sim-pf-row" data-testid="pf-fill">
              <button type="button" className="pf-link" onClick={() => ask({ title: "That trade", plain: [cap(presentNote(f.text))], id: f.eventId })}>
                <span className="label">{gameDate(f.day)} · {f.kind}</span> {f.text}
              </button>
            </div>
          )) : <p className="muted">No fills yet.</p>}
        </section>
      </div>
    );
  }
  const points = netPoints(view);
  const up = points.length > 1 ? points[points.length - 1].worth >= points[0].worth : (view.nwChange ?? 0) >= 0;
  const stat = (id: string) => view.stats?.find((x) => x.id === id)?.eventId;

  const entryOf = (instr: string): number => view.positions?.find((p) => p.instr === instr && p.kind !== "future" && p.qty > 0)?.entry ?? 0;
  const shareRows = view.shares.map((h) => {
    const q = view.quotes.find((x) => x.instr === h.instr);
    const px = liveOf(view, h.instr, h.px);
    const prev = q?.prev ?? h.px;
    const entry = entryOf(h.instr);
    const open = entry > 0 ? Math.round(h.qty * (px - entry)) : null;
    return { h, px, prev, entry, open, value: px * h.qty, day: (px - prev) * h.qty };
  });
  // A short is a position of its own: the shares you owe back, marked live, with what you sold them at and what the loan has cost.
  const shortRows = (view.stockLoans ?? []).map((l) => {
    const px = liveOf(view, l.instr, l.px ?? 0);
    const q = view.quotes.find((x) => x.instr === l.instr);
    const prev = q?.prev ?? px;
    const entry = l.entry ?? (l.qty > 0 ? l.face / l.qty : 0);
    const fees = l.fees ?? 0;
    return { l, px, entry, fees, pnl: Math.round(l.qty * (entry - px) - fees), value: -l.qty * px, day: -l.qty * (px - prev) };
  });
  const coinRows = view.coins.map((c) => {
    const board = view.coinBoard?.find((x) => x.id === c.id);
    const prev = board?.prev ?? c.px;
    const entry = entryOf(c.id);
    const dead = c.px <= 0;
    return { c, entry, open: !dead && entry > 0 ? Math.round(c.qty * (c.px - entry)) : null, value: Math.round(c.px * c.qty), day: dead ? 0 : Math.round((c.px - prev) * c.qty) };
  });
  const bondRows = view.bonds.map((b) => {
    const px = b.px ?? 0;
    const prev = b.prev ?? px;
    const lots = px > 0 ? b.face / LOT : 0;
    return { b, value: Math.round(lots * px), day: Math.round(lots * (px - prev)) };
  });

  // Today is one figure with one meaning: net worth now less net worth at the last close, both from the same books.
  const nw = acct?.netWorth ?? view.netWorth;
  const today = Math.round(acct?.today.dollars ?? view.nwChange ?? 0);
  const atClose = acct?.today.base ?? Math.round(nw) - today;
  const sum = (a: { value: number }[]) => a.reduce((t, r) => t + r.value, 0);
  const moved = Math.round([...shareRows, ...shortRows, ...coinRows, ...bondRows].reduce((t, r) => t + r.day, 0));
  const loansOwed = view.loans.reduce((t, l) => t + l.owed, 0);
  const deposits = (view.deposits ?? []).reduce((t, d) => t + d.cents, 0);
  const homesWorth = view.homes.filter((h) => h.mine).reduce((t, h) => t + h.price - (h.mortgage ?? 0), 0);
  // The sim sends net worth line by line, valued exactly as the figure itself: the parts always add up to it.
  const parts = view.live?.worth;
  const bits: string[] = [];
  if (parts) {
    bits.push(`cash ${moneyFromCents(parts.cash)}`);
    if (parts.deposits) bits.push(`deposits ${moneyFromCents(parts.deposits)}`);
    if (parts.shares) bits.push(`shares ${moneyFromCents(parts.shares)}`);
    if (parts.shorts) bits.push(`shorts ${moneyFromCents(parts.shorts)} (the shares you owe back, at today's price, less what you sold them for)`);
    if (parts.coins || coinRows.length) bits.push(`coins ${moneyFromCents(parts.coins)}`);
    if (parts.bonds) bits.push(`bonds ${moneyFromCents(parts.bonds)}`);
    if (parts.business) bits.push(`your business ${moneyFromCents(parts.business)}`);
    if (parts.goods) bits.push(`goods and property ${moneyFromCents(parts.goods)}`);
    if (parts.owedToYou) bits.push(`money owed to you ${moneyFromCents(parts.owedToYou)}`);
    if (parts.debts) bits.push(`less what you owe ${moneyFromCents(parts.debts)}`);
  } else {
    bits.push(`cash ${moneyFromCents(view.cash)}`);
    if (deposits) bits.push(`deposits ${moneyFromCents(deposits)}`);
    if (shareRows.length || shortRows.length) bits.push(`shares ${moneyFromCents(sum(shareRows) + sum(shortRows))}`);
    if (coinRows.length) bits.push(`coins ${moneyFromCents(sum(coinRows))}`);
    if (bondRows.length) bits.push(`bonds ${moneyFromCents(sum(bondRows))}`);
    if (homesWorth) bits.push(`property ${moneyFromCents(homesWorth)}`);
    if (loansOwed) bits.push(`less loans ${moneyFromCents(loansOwed)}`);
  }
  const deadCoins = coinRows.filter((r) => r.c.px <= 0).map((r) => r.c.name);
  const worthWhy: Why = {
    title: "Net worth",
    plain: [
      `Your net worth is ${moneyFromCents(nw)}: your cash plus what everything you hold would bring if you sold it now, less what you owe.`,
      `${cap(bits.join(", "))}. Those add up to ${moneyFromCents(nw)}.`,
      ...(deadCoins.length ? [`${deadCoins.join(", ")} ${deadCoins.length === 1 ? "is a dead coin" : "are dead coins"}: nobody trades ${deadCoins.length === 1 ? "it" : "them"} any more, so ${deadCoins.length === 1 ? "it counts" : "they count"} as $0.`] : []),
      ...(points.length > 1 && points[0].worth > 0 ? [`You began at ${moneyFromCents(points[0].worth)}, so you are ${view.netWorth >= points[0].worth ? "up" : "down"} ${moneyFromCents(Math.abs(view.netWorth - points[0].worth))} since then.`] : []),
    ],
    id: stat("worth"),
  };
  const book = view.live?.book;
  const cashToday = book && book.day === view.date.abs ? book.today.net : null;
  const other = cashToday === null ? today - moved : today - cashToday;
  const todayWhy: Why = {
    title: "Today",
    plain: [
      `Today is your net worth now (${moneyFromCents(view.netWorth)}) less what it was at midnight (${moneyFromCents(atClose)}): ${sign(today)}.`,
      ...(cashToday === null
        ? [
          moved ? `Your holdings moved ${sign(moved)} since midnight.` : "Your holdings have not moved since midnight.",
          Math.abs(other) >= 1 ? `The other ${sign(other)} is what you spent, paid in fees or interest, or earned since then.` : "Nothing else changed.",
        ]
        : [
          `Your cash changed ${sign(cashToday)} today, line by line in the statement below${book && book.today.rows.length ? ` (${book.today.rows.slice(0, 3).map((r) => `${r.label.toLowerCase()} ${sign(r.cents)}`).join(", ")})` : ""}.`,
          Math.abs(other) >= 1 ? `The other ${sign(other)} is the change in what you hold and owe: prices moving, and what that cash bought or sold.` : "What you hold did not change in value.",
        ]),
    ],
    id: stat("worth"),
  };

  return (
    <div className="pf sim-pf" data-testid="portfolio">
      <div className="pf-hero">
        <span className="pf-label">Net worth</span>
        <div className="pf-hero-nw">
          <Num w={worthWhy} ask={ask}><LiveNum value={nw}><MoneyText amount={dollars(nw)} ctx="hero" /></LiveNum></Num>
        </div>
        <span className="today" data-testid="pf-today">Today <Num w={todayWhy} ask={ask}><MoneyText amount={dollars(today)} ctx="delta" /></Num> <small className="muted" data-testid="pf-today-base">{acct ? `${today >= 0 ? "+" : ""}${(acct.today.pct * 100).toFixed(2)}% of ${moneyFromCents(acct.today.base)}, ${acct.today.baseLabel}` : "since midnight"}</small></span>
      </div>
      <WhyPanel why={why} onClose={close} />
      {acct ? <Reconcile a={acct} /> : null}
      {view.stats?.length ? (
        <ul className="sim-life" data-testid="pf-life">
          {view.stats.map((s) => (
            <li key={s.id} title={s.hover}>
              <span className="label">{s.label}</span>
              <Num w={{ title: cap(s.label), plain: s.why?.length ? s.why : [`${cap(s.label)}: ${s.word}${s.hover && s.hover !== s.word ? ` (${s.hover})` : ""}.`], id: s.eventId }} ask={ask}>
                <span>{s.word}</span>
                {s.hover && s.hover !== s.word ? <span className="num">{s.hover}</span> : null}
              </Num>
            </li>
          ))}
        </ul>
      ) : null}
      {book ? <Statement book={book} cash={view.cash} today={view.date.abs} /> : null}
      <section>
        <h2 className="label">Net worth</h2>
        {points.length < 2 ? (
          <p className="muted">The line starts after the next day. Let a day pass, and it will draw.</p>
        ) : (
          <LineChart points={points.map((p) => p.worth)} days={points.map((p) => p.day)} up={up} label="Net worth over time" format={moneyFromCents} />
        )}
      </section>
      <section>
        <h2 className="label">Shares</h2>
        {shareRows.length || shortRows.length ? (
          <>
            {shareRows.map(({ h, px, prev, entry, open: openPnl, value, day }) => (
              <Pos key={h.instr} testid="pf-share" name={`${symbolOf(h.instr)} · ${h.qty}`} onOpen={() => open(h.instr)}
                sub={entry > 0 && openPnl !== null ? <span data-testid="pf-share-cost">avg cost {moneyFromCents(Math.round(entry))} · open <span className={tone(openPnl)}>{openWord(openPnl, entry > 0 ? (px - entry) / entry : 0)}</span></span> : null}
                value={value} day={day} id={h.eventId} ask={ask}
                says={`You hold ${h.qty.toLocaleString("en-US")} ${symbolOf(h.instr)}. The price is ${moneyFromCents(px)} now and was ${moneyFromCents(prev)} at the last close, so the holding is worth ${moneyFromCents(value)} and moved ${sign(Math.round(day))} today.`} />
            ))}
            {shortRows.map(({ l, px, entry, fees, pnl, value, day }) => (
              <Pos key={`short-${l.instr}`} testid="pf-short" name={`${symbolOf(l.instr)} · short ${l.qty}`} onOpen={() => open(l.instr)}
                sub={(
                  <span data-testid="pf-short-detail">
                    sold at {moneyFromCents(Math.round(entry))} · now {moneyFromCents(Math.round(px))} · open <span className={tone(pnl)} data-testid="pf-short-pnl">{openWord(pnl, entry > 0 ? (entry - px) / entry : 0)}</span>
                    {" "}· borrow fee so far {moneyFromCents(fees)}{l.feeRate ? ` (${(l.feeRate * 100).toFixed(1)}% a year)` : ""}
                  </span>
                )}
                action={<button type="button" className="pf-link" data-testid="pf-cover" onClick={() => void act({ kind: "order", side: "buy", instr: l.instr, qty: l.qty }).then((n) => setCoverNote(n.text))}>Cover at market</button>}
                value={value} day={day} id={l.eventId} ask={ask}
                says={`You are short ${l.qty.toLocaleString("en-US")} ${symbolOf(l.instr)}: you borrowed the shares and sold them at ${moneyFromCents(Math.round(entry))} and owe them back. At ${moneyFromCents(Math.round(px))} buying them back costs ${moneyFromCents(Math.abs(Math.round(value)))}. Open profit or loss is ${sign(pnl)}, after ${moneyFromCents(fees)} of borrow fees so far.`} />
            ))}
            {coverNote ? <p className="muted" data-testid="pf-cover-note">{presentNote(coverNote)}</p> : null}
          </>
        ) : <p className="muted">No shares yet. <button type="button" className="pf-link" onClick={() => open("")}>Open the broker</button> and buy one.</p>}
      </section>
      <Block title="Bonds" empty="No bonds." show={view.bonds.length > 0}>
        {bondRows.map(({ b, value, day }) => (
          <Pos key={b.instr} name={`${b.tenor || b.instr} · face $${dollars(b.face)}`} onOpen={() => open(`bond:${b.tenor || b.instr}`)}
            value={value} day={day} id={b.eventId} ask={ask}
            says={`A ${b.tenor || b.instr} bond with $${dollars(b.face)} face value. It is worth ${moneyFromCents(value)} at today's price, and moved ${sign(day)} today.`} />
        ))}
      </Block>
      <Block title="Futures" empty="" show={view.futures.length > 0}>
        {view.futures.map((f) => {
          const board = view.futuresBoard?.find((b) => b.good === f.good);
          const prev = board?.tenors.find((t) => t.monthsAhead === f.monthsAhead)?.prev;
          const lot = board?.lot ?? 1;
          const day = prev == null ? undefined : f.net * (f.px - prev) * lot;
          const lotRow = view.positions?.find((p) => p.kind === "future" && p.instr === `fut:${f.good}` && p.month === Math.floor(view.date.abs / 30) + f.monthsAhead);
          const openPnl = lotRow ? Math.round(f.net * (f.px - lotRow.entry) * lot) : null;
          return (
            <Pos key={`${f.good}-${f.monthsAhead}`} name={`${board?.name || f.good} · ${f.monthsAhead}m · ${f.net}`} onOpen={() => open(`fut:${f.good}`)}
              sub={lotRow && openPnl !== null ? <span>entry {moneyFromCents(Math.round(lotRow.entry))} · open <span className={tone(openPnl)}>{openWord(openPnl, lotRow.entry > 0 ? (f.net > 0 ? 1 : -1) * (f.px - lotRow.entry) / lotRow.entry : 0)}</span></span> : null}
              value={f.net * f.px * lot} day={day} id={f.eventId} ask={ask}
              says={`${f.net > 0 ? "Long" : "Short"} ${Math.abs(f.net)} ${board?.name || f.good} contract${Math.abs(f.net) === 1 ? "" : "s"}, ${f.monthsAhead} months out. The position is marked at ${moneyFromCents(f.net * f.px * lot)}${day == null ? "." : `, and moved ${sign(Math.round(day))} today.`}`} />
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
        {coinRows.map(({ c, entry, open: openPnl, value, day }) => (
          <Pos key={c.id} name={`${c.name} · ${c.qty.toLocaleString("en-US")}`}
            sub={c.px <= 0 ? <span>dead coin, worth $0</span> : entry > 0 && openPnl !== null ? <span>avg cost {c.id.startsWith("coin:me:") ? `$${(entry / 100).toFixed(6)}` : moneyFromCents(Math.round(entry))} · open <span className={tone(openPnl)}>{openWord(openPnl, c.px > 0 && entry > 0 ? (c.px - entry) / entry : 0)}</span></span> : null} onOpen={() => open(c.id.startsWith("coin:") ? c.id : `coin:${c.id}`)}
            value={value} day={day} id={c.eventId} ask={ask}
            says={c.px <= 0 ? `You hold ${c.qty.toLocaleString("en-US")} ${c.name}. It is a dead coin, so it counts as $0.` : `You hold ${c.qty.toLocaleString("en-US")} ${c.name}. At the price now that is ${moneyFromCents(value)}, and it moved ${sign(day)} today.`} />
        ))}
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
        <Pos name="Cash" value={view.cash} id={stat("cash")} ask={ask} says={`Cash in hand: ${moneyFromCents(view.cash)}. It is what you can spend or put into a trade right now.`} />
        {(view.deposits ?? []).map((d) => <Pos key={`${d.bank}-${d.eventId}`} name={d.bank} value={d.cents} id={d.eventId} ask={ask} />)}
        {view.loans.map((l) => (
          <Pos key={`${l.kind}-${l.eventId}`} name={`${l.kind} · ${(l.rate * 100).toFixed(2)}%`} value={-l.owed} id={l.eventId} ask={ask}
            says={`You owe ${moneyFromCents(l.owed)} on a ${l.kind} at ${(l.rate * 100).toFixed(2)}% a year. It is taken off your net worth.`} />
        ))}
        {view.risk?.open ? (
          <>
            {view.loans.some((l) => l.kind === "margin") ? null : <Pos name="Margin loan" value={-(view.risk.loanOwed ?? 0)} id={view.risk.eventId} ask={ask} />}
            <Pos name="Loan limit" value={view.risk.limit ?? 0} id={view.risk.eventId} ask={ask} says={`The bank will lend you up to ${moneyFromCents(view.risk.limit ?? 0)} against your shares. Past it, you are asked to sell.`} />
            <Pos name="Futures margin posted" value={view.risk.futPosted ?? 0} id={view.risk.eventId} ask={ask} />
            <Pos name="Option margin posted" value={view.risk.optPosted ?? 0} id={view.risk.eventId} ask={ask} />
          </>
        ) : view.marginPosted ? <Pos name="Margin posted" value={view.marginPosted} id={view.risk?.eventId} ask={ask} /> : <p className="muted">No margin account.</p>}
      </section>
      <section>
        <h2 className="label">Fills</h2>
        <p className="muted">Choose a fill to see what the books recorded about it.</p>
        {(view.fills ?? []).length ? [...(view.fills ?? [])].reverse().map((f, i) => (
          <div key={`${f.day}-${i}`} className="sim-pf-row" data-testid="pf-fill">
            <button type="button" className="pf-link" onClick={() => ask({ title: "That trade", plain: [cap(presentNote(f.text))], id: f.eventId })}>
              <span className="label">{gameDate(f.day)} · {f.kind}</span> {f.text}
            </button>
          </div>
        )) : <p className="muted">No fills yet.</p>}
      </section>
    </div>
  );
}

/**
 * The cash statement for yesterday and today: what the account held at the start of the day, every line in and out,
 * and what it held at the end. Today ends at the cash in hand now, so the two columns always add up.
 */
function Statement({ book, cash, today }: { book: NonNullable<NonNullable<SimView["live"]>["book"]>; cash: number; today: number }) {
  const fresh = book.day === today;
  const todayDay = fresh ? book.today : { day: today, in: 0, out: 0, net: 0, rows: [] };
  const yDay = fresh ? book.yesterday : book.today;
  const todayOpen = cash - todayDay.net;
  const yOpen = todayOpen - yDay.net;
  const col = (title: string, day: typeof todayDay, open: number, close: number, closeWord: string, testid: string) => (
    <div className="pf-stmt-day" data-testid={testid}>
      <p className="label">{title} <small className="muted">{gameDate(day.day).split(", year ")[0]}</small></p>
      <div className="sim-pf-row"><span>Cash at midnight</span><span className="num"><MoneyText amount={dollars(Math.round(open))} ctx="table" /></span></div>
      {day.rows.length ? day.rows.map((r) => (
        <div key={r.label} className="sim-pf-row pf-stmt-line" title={r.why} data-testid="pf-stmt-line">
          <span>{r.label}{r.count > 1 ? <small className="muted"> ×{r.count}</small> : null}</span>
          <span className={`num ${tone(r.cents)}`}><MoneyText amount={dollars(r.cents)} ctx="delta" /></span>
        </div>
      )) : <p className="muted">No money came in or went out.</p>}
      <div className="sim-pf-row pf-stmt-total"><span>{closeWord}</span><span className="num"><MoneyText amount={dollars(Math.round(close))} ctx="table" /></span></div>
    </div>
  );
  return (
    <section className="pf-stmt" data-testid="pf-statement">
      <h2 className="label">Statement</h2>
      <div className="pf-stmt-cols">
        {col("Yesterday", yDay, yOpen, todayOpen, "Cash at the end of the day", "pf-stmt-yesterday")}
        {col("Today", todayDay, todayOpen, cash, "Cash now", "pf-stmt-today")}
      </div>
    </section>
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

function Pos({ name, value, day, id, ask, onOpen, testid, says, sub, action }: {
  /** A second line under the name: what you paid and the open profit or loss. */
  sub?: ReactNode;
  /** A button on that line, such as covering a short. */
  action?: ReactNode;
  name: string;
  value: number;
  day?: number | null;
  id?: number;
  ask: (w: Why) => void;
  onOpen?: () => void;
  testid?: string;
  /** The sentence that explains this line; without one the line says what it is and what it is worth. */
  says?: string;
}) {
  const worth = Math.round(value);
  const plain = [says ?? `${name}: ${moneyFromCents(worth)}.`];
  if (day != null && !says) plain.push(`It moved ${sign(Math.round(day))} today.`);
  return (
    <div className="sim-pf-row" data-testid={testid}>
      <span className="pf-name">
        {onOpen ? <button type="button" className="pf-link" onClick={onOpen}>{name}</button> : <span>{name}</span>}
        {sub ? <small className="pf-sub muted">{sub}</small> : null}
        {action}
      </span>
      <span className="pf-nums">
        <Num w={{ title: name, plain, id }} ask={ask}><MoneyText amount={dollars(worth)} ctx="table" /></Num>
        {day == null ? null : (
          <Num w={{ title: `${name}, today`, plain, id }} ask={ask}><span className={tone(day)}> <MoneyText amount={dollars(Math.round(day))} ctx="delta" /></span></Num>
        )}
      </span>
    </div>
  );
}

/** One revision of the books: the parts that make net worth, to the cent, and what changed since the last close and why. */
function Reconcile({ a }: { a: Account }) {
  const rows: [string, number][] = [
    ["Cash", a.cash], ["Deposits", a.deposits], ["Shares", a.shares], ["Shorts, at today's price less what you sold them for", a.shorts],
    ["Coins", a.coins], ["Bonds", a.bonds], ["Your business", a.business], ["Goods and property", a.goods], ["Owed to you", a.owed], ["Less what you owe", -a.debts],
  ];
  const shown = rows.filter(([, v]) => v !== 0 || false);
  const sum = rows.reduce((t, [, v]) => t + v, 0);
  const signed = (c: number) => `${c > 0 ? "+" : c < 0 ? "-" : ""}${moneyFromCents(Math.abs(c))}`;
  return (
    <section className="pf-recon" data-testid="pf-reconcile" aria-label="What your net worth is made of">
      <dl>
        {shown.map(([k, v]) => <div key={k} className="sim-pf-row"><dt>{k}</dt><dd className="num">{moneyFromCents(v)}</dd></div>)}
        <div className="sim-pf-row pf-stmt-total"><dt>Net worth, from these parts</dt><dd className="num" data-testid="pf-recon-sum">{moneyFromCents(sum)}</dd></div>
      </dl>
      <p className="muted" data-testid="pf-recon-note">{a.residual === 0 && sum === a.netWorth ? "These parts add to your net worth to the cent, from one reading of the books." : `The parts differ from net worth by ${moneyFromCents(Math.abs(sum - a.netWorth))}.`}</p>
      <p className="label">Since {a.today.baseLabel}: {signed(a.today.dollars)}</p>
      <dl>
        <div className="sim-pf-row"><dt>Investment return: prices and fills</dt><dd className={`num ${tone(a.investment)}`} data-testid="pf-recon-invest">{signed(a.investment)}</dd></div>
        <div className="sim-pf-row"><dt>Money in: wages, gifts, inheritance</dt><dd className="num">{signed(a.flows)}</dd></div>
        <div className="sim-pf-row"><dt>Spending: living costs and fees to others</dt><dd className="num">{signed(-a.spending)}</dd></div>
      </dl>
      <p className="muted">{a.basis > 0 ? `What you hold cost ${moneyFromCents(a.basis)}. ` : ""}{a.fees > 0 ? `Fees and taxes so far today: ${moneyFromCents(a.fees)}.` : ""}</p>
    </section>
  );
}
