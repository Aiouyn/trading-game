"use client";
// The options ticket's facts: the full listed chain (the view carries only your own contracts), the contract a pick resolves to,
// and the preview a first-time player needs before pressing Place: per-share premium, per-contract cost (one contract is 100 shares),
// total cash, break-even, delta and the most you can lose. Prices are the sim's quotes in cents a share.
import { useEffect, useState } from "react";
import { moneyFromCents } from "@/components/ui/format";
import { symbolOf, type SimView } from "@/shell/simSession";

type Row = NonNullable<SimView["chain"]>[number];
const MULT = 100;

/** The whole listed chain, read from the options panel when the desk is open (the view's own chain is only what you hold). */
export function useChain(enabled: boolean, watch: unknown): SimView["chain"] | null {
  const [chain, setChain] = useState<SimView["chain"] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    void fetch("/api/sim/panel?name=options", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { chain?: SimView["chain"] } | null) => { if (!stop && d?.chain) setChain(d.chain); })
      .catch(() => {});
    return () => { stop = true; };
  }, [enabled, watch]);
  return chain;
}

function underlying(view: SimView, key: string): string {
  if (view.quotes.some((q) => q.instr === key)) return key;
  return view.quotes[0]?.instr ?? "";
}

export function optionName(view: SimView, instr: string): string {
  const q = view.quotes.find((x) => x.instr === instr);
  return q?.symbol || q?.name || symbolOf(instr);
}

/** The listed contract a pick stands for: the picked name, the nearest listed expiry, and the strike (0 is at the money). */
export function resolveOption(view: SimView, key: string, right: "C" | "P", months: number, strike: number): { instr: string; month: number | undefined; row: Row | undefined } {
  const instr = underlying(view, key);
  const chain = (view.chain ?? []).filter((c) => c.instr === instr);
  const listed = [...new Set(chain.map((c) => c.months))].sort((a, b) => a - b);
  const month = listed.includes(months) ? months : listed[0];
  if (month === undefined) return { instr, month, row: undefined };
  const rows = chain.filter((c) => c.right === right && c.months === month);
  const spot = view.quotes.find((q) => q.instr === instr)?.px ?? 0;
  const row = strike > 0 ? rows.find((c) => c.strike === strike) : [...rows].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0];
  return { instr, month, row };
}

/** What to offer when the picked name has no listed contracts: the names that do, and their expiries. */
export function optionGuide(view: SimView, instr: string): { text: string; names: { instr: string; label: string; expiries: string }[] } {
  const by = new Map<string, Set<number>>();
  for (const c of view.chain ?? []) { const s = by.get(c.instr) ?? new Set<number>(); s.add(c.months); by.set(c.instr, s); }
  const names = [...by.entries()].map(([i, set]) => ({
    instr: i, label: optionName(view, i),
    expiries: [...set].sort((a, b) => a - b).map((m) => (m <= 0 ? "this month" : `${m} month${m === 1 ? "" : "s"}`)).join(", "),
  })).slice(0, 8);
  const who = optionName(view, instr);
  if (!names.length) return { text: `No options are listed for any name right now. Contracts list as the exchange runs: let a day pass and look again.`, names };
  return { text: `${who} has no listed contracts. Pick a name that does, with its expiries:`, names };
}

function cdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
/** A model delta at the sim's own 22% volatility, for a contract with this many months to run. */
function deltaOf(spot: number, strike: number, months: number, rate: number, call: boolean): number {
  const T = Math.max(1 / 360, months / 12);
  const sig = 0.22;
  const d1 = (Math.log(Math.max(1, spot) / Math.max(1, strike)) + (rate + sig * sig / 2) * T) / (sig * Math.sqrt(T));
  return call ? cdf(d1) : cdf(d1) - 1;
}

export function OptionPreview({ view, picked, side, qty, right, months, strike }: { view: SimView; picked: string; side: string; qty: number; right: "C" | "P"; months: number; strike: number }) {
  const { instr, month, row } = resolveOption(view, picked, right, months, strike);
  const quote = view.quotes.find((q) => q.instr === instr);
  const name = optionName(view, instr);
  if (!row || month === undefined || !quote) {
    return (
      <div className="br-est" data-testid="br-preview">
        <p className="br-est-title label">Preview</p>
        <p className="muted" data-testid="opt-no-preview">No listed contract to price for {name}. Pick another name or expiry in the chain.</p>
      </div>
    );
  }
  const n = Math.max(1, qty || 1);
  const closing = side === "close";
  const writing = side === "write";
  const perShare = closing ? (row.net >= 0 ? row.bid : row.ask) : writing ? row.bid : row.ask;
  const perContract = perShare * MULT;
  const total = perContract * n;
  const rate = view.fx?.homeRate ?? view.curve?.[0]?.yield ?? 0.04;
  const delta = deltaOf(quote.px, row.strike, row.months, rate, right === "C");
  const breakEven = right === "C" ? row.strike + perShare : Math.max(0, row.strike - perShare);
  const maxLoss = writing ? (right === "P" ? Math.max(0, row.strike * MULT * n - total) : null) : closing ? null : total;
  const word = right === "C" ? "call" : "put";
  const line = (k: string, v: string, t?: string) => <div key={k} className="br-row" title={t}><dt>{k}</dt><dd>{v}</dd></div>;
  return (
    <div className="br-est" data-testid="br-preview">
      <p className="br-est-title label">Preview: {n} {word} contract{n === 1 ? "" : "s"} on {name}, {moneyFromCents(row.strike)} strike, {row.months <= 0 ? "this month" : `${row.months} month${row.months === 1 ? "" : "s"}`}</p>
      <dl className="br-rows">
        {line(writing || closing ? "Premium a share, received" : "Premium a share", moneyFromCents(perShare), writing ? "The market maker's bid" : "The market maker's ask")}
        {line("Cost of one contract", `${moneyFromCents(perContract)} (premium × ${MULT} shares)`, "One contract is 100 shares")}
        {line(writing || closing ? "Total cash received" : "Total cash", moneyFromCents(total))}
        {closing ? null : line("Break-even at expiry", moneyFromCents(breakEven), right === "C" ? "Strike plus premium" : "Strike less premium")}
        {closing ? null : line("Delta (model, 22% volatility)", `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} a share`, "About how much the premium moves for a $1 move in the share")}
        {closing ? null : line("Maximum loss", maxLoss === null ? "unlimited" : moneyFromCents(maxLoss), writing ? (right === "P" ? "If the share went to zero" : "A written call has no ceiling") : "The premium, if it expires worthless")}
        {writing ? line("Margin held", moneyFromCents(writeMargin(quote.px, row.strike, right, row.bid, row.ask, n))) : null}
        {line("Cash after", moneyFromCents(view.cash + (writing || closing ? total : -total) - (writing ? writeMargin(quote.px, row.strike, right, row.bid, row.ask, n) : 0)))}
      </dl>
    </div>
  );
}

function writeMargin(spot: number, strike: number, right: "C" | "P", bid: number, ask: number, qty: number): number {
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : ask || bid;
  const k = strike > 0 ? strike : spot;
  const otm = right === "C" ? Math.max(0, k - spot) : Math.max(0, spot - k);
  const cushion = Math.max(0, spot * 100 * 0.1 - otm * 100 * 0.5);
  return qty * Math.max(100, Math.round(mid * 100 + cushion));
}
