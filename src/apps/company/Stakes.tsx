"use client";
// Your stakes: the firms you bought into, the choices you can make from the chair, and who remembers them.
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { presentNote } from "@/components/ui/format";
import type { ActNote } from "@/shell/simSession";
import { Field, Fig, centsOf, moneyTitle } from "@/apps/businesses/sheet";
import { saleReason, type StakeRemember, type StakeView } from "@/apps/research/edge";

type Run = (cmd: unknown) => Promise<ActNote>;
type Input = "count" | "person" | "percent" | "dollars" | "none";

interface Choice {
  op: string;
  label: string;
  /** One line: what it does, and who it reaches. */
  line: string;
  input: Input;
  fallback: string;
  deal?: "deal" | "refuse";
}

const CHOICES: Choice[] = [
  { op: "cut", label: "Cut jobs", line: "Lays off the least-skilled staff. Saves wages; the people let go and the press remember it.", input: "count", fallback: "1" },
  { op: "protect", label: "Protect jobs", line: "Pays every worker a week's wages now and promises no cuts for a year. Costs cash.", input: "none", fallback: "" },
  { op: "promote", label: "Promote", line: "Puts a worker in charge. They remember it, and the chief you pass over does too.", input: "person", fallback: "best" },
  { op: "sell-division", label: "Sell a division", line: "Sells part of the plant and its staff to a rival to cover payroll. The workers who move remember it.", input: "percent", fallback: "20" },
  { op: "refinance", label: "Borrow for the firm", line: "The firm borrows. With your guarantee the bank lends twice as much, and half your family's cash stands behind it.", input: "dollars", fallback: "" },
  { op: "payout", label: "Pay a dividend", line: "Pays every holder a special dividend. People laid off this year will not forget it.", input: "dollars", fallback: "" },
  { op: "union", label: "Meet the union", line: "Concedes a premium at the plant. The union leader and the workers remember it kindly.", input: "none", fallback: "", deal: "deal" },
  { op: "union", label: "Break with the union", line: "Refuses the union's terms. The union leader and the workers remember it as a betrayal.", input: "none", fallback: "", deal: "refuse" },
];

const SAYS: Record<string, string> = {
  "laid off": "you laid them off",
  protected: "you protected their jobs",
  promoted: "you promoted them",
  betrayed: "you broke a promise to them",
  "partnered with": "they partnered with you",
  "sold on": "you sold them along with a division",
  "paid fairly": "you paid them fairly",
  "left holding the bill": "you left them holding the bill",
};

/** The stored `how` of a stake: savings, loan (margin or line), partners, or mbo (a buyout). */
const HOW: Record<string, string> = {
  savings: "with savings",
  loan: "with a loan against your shares",
  partners: "with partners' money",
  mbo: "in a buyout",
};

function rememberLine(r: StakeRemember): string {
  const said = SAYS[r.what] ?? r.what;
  return `${r.name}, ${r.role}: ${said}. ${r.warm ? "They are still on your side." : "They hold it against you."}`;
}

function ChoiceRow({ c, firm, run, busy }: { c: Choice; firm: string; run: Run; busy: boolean }) {
  const [val, setVal] = useState(c.fallback);
  const [guarantee, setGuarantee] = useState(false);
  const submit = () => {
    const cmd: Record<string, unknown> = { kind: "owner", op: c.op, firm };
    // The sim checks every amount and says why in one line, so a bad figure goes through as typed.
    if (c.op === "cut") cmd.n = Number(val);
    if (c.op === "promote") cmd.person = val.trim() || "best";
    if (c.op === "sell-division") cmd.fraction = Number(val) / 100;
    if (c.op === "refinance" || c.op === "payout") {
      cmd.cents = centsOf(val) ?? 0;
      if (c.op === "refinance" && guarantee) cmd.guarantee = true;
    }
    if (c.op === "union") cmd.deal = c.deal;
    void run(cmd);
  };
  const inputLabel = c.input === "count" ? "Jobs" : c.input === "person" ? "Who, or best" : c.input === "percent" ? "Percent of the firm" : "Dollars";
  return (
    <div className="qa-block co-choice" data-testid={`owner-${c.op}${c.deal ? `-${c.deal}` : ""}`}>
      {c.input !== "none" ? (
        <Field label={inputLabel}>
          <input className="qa-input" value={val} onChange={(e) => setVal(e.target.value)} inputMode={c.input === "person" ? "text" : "decimal"} placeholder={c.fallback} />
        </Field>
      ) : null}
      {c.op === "refinance" ? (
        <label className="qa-check"><input type="checkbox" checked={guarantee} onChange={(e) => setGuarantee(e.target.checked)} /> Put my guarantee behind it</label>
      ) : null}
      <div className="qa-actions">
        <Button variant="secondary" disabled={busy} onClick={submit}>{c.label}</Button>
      </div>
      <p className="qa-muted">{c.line}</p>
    </div>
  );
}

/** Market value and what a sale would fetch, side by side, with one line on why they differ. */
function StakeWorth({ stake: s }: { stake: StakeView }) {
  const market = s.marketValue ?? s.value;
  const sale = s.saleValue ?? 0;
  return (
    <div className="qa-block" data-testid="stake-worth">
      <div className="qa-kv">
        <p><span className="label">Market value</span><span className="num" data-testid="stake-market">{moneyTitle(market)}</span></p>
        <p><span className="label">A sale would fetch</span><span className="num" data-testid="stake-sale">{moneyTitle(sale)}</span></p>
      </div>
      <p className="qa-muted">{saleReason(market, sale, s.saleWhy)}</p>
    </div>
  );
}

function StakeBlock({ stake: s, run, busy, onWhy }: { stake: StakeView; run: Run; busy: boolean; onWhy: (id: number) => void }) {
  const how = HOW[s.how] ?? "";
  return (
    <div className="qa-block" data-testid="company-stake">
      <h2 className="qa-title">{s.name}</h2>
      <p>
        <Fig word={s.controls ? "You chair it" : "You hold a block"} title={`${s.percent.toFixed(1)}% · ${s.shares.toLocaleString("en-US")} of ${s.issued.toLocaleString("en-US")} shares`} onWhy={onWhy} />
        {how ? <span className="qa-muted"> Bought {how}.</span> : null}
      </p>
      {typeof s.saleValue === "number" ? <StakeWorth stake={s} /> : null}
      {s.choices.length ? (
        <div className="qa-block" data-testid="stake-choices">
          <span className="label">What you have done</span>
          {s.choices.map((c, i) => (
            <p key={`${c.eventId}-${i}`}><Fig word={presentNote(c.text)} title="" eventId={c.eventId} onWhy={onWhy} /></p>
          ))}
        </div>
      ) : null}
      {s.controls ? (
        <div className="qa-block" data-testid="stake-owner">
          <span className="label">From the chair</span>
          {CHOICES.map((c) => (
            <ChoiceRow key={`${c.op}-${c.deal ?? ""}`} c={c} firm={s.firm} run={run} busy={busy} />
          ))}
        </div>
      ) : (
        <p className="qa-muted">The chair of {s.name} makes these choices, not you.</p>
      )}
      {s.remembers.length ? (
        <div className="qa-block" data-testid="stake-remembers">
          <span className="label">Who remembers</span>
          {s.remembers.map((r) => (
            <p key={`${r.name}-${r.what}`}><Fig word={rememberLine(r)} title="" eventId={r.eventId} onWhy={onWhy} /></p>
          ))}
        </div>
      ) : null}
      {s.city.length ? (
        <div className="qa-block" data-testid="stake-city">
          <span className="label">In the city</span>
          {s.city.map((line, i) => <p key={i} className="qa-muted">{presentNote(line)}</p>)}
        </div>
      ) : null}
    </div>
  );
}

/** The stakes section: nothing when the player holds no stake. */
export function Stakes({ stakes, run, busy, onWhy }: { stakes: StakeView[]; run: Run; busy: boolean; onWhy: (id: number) => void }) {
  if (!stakes.length) return null;
  return (
    <div className="qa-list" data-testid="company-stakes">
      <div className="qa-head"><h2 className="qa-title">Your stakes</h2></div>
      {stakes.map((s) => (
        <StakeBlock key={s.firm} stake={s} run={run} busy={busy} onWhy={onWhy} />
      ))}
    </div>
  );
}
