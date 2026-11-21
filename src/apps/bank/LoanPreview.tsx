"use client";
// What a loan would do, before you ask for it: the collateral the bank would count, the haircut, what it would lend in all,
// the room left after this loan, the rate, the point where a call comes, and the cash you would hold. Every figure is the sim's
// (the sale value of your shares, the lender's haircut, the policy rate); the only arithmetic is the subtraction on the screen.
import { moneyTitle } from "@/apps/businesses/sheet";
import { edgeOf, haircutOf } from "@/apps/research/edge";
import type { SimView } from "@/shell/simSession";

export type Product = "margin" | "line" | "term";
const CREDIT_KEY: Record<Product, string> = { margin: "margin", line: "credit line", term: "term loan" };

export function LoanPreview({ view, product, cents }: { view: SimView; product: Product; cents: number | null }) {
  const credit = edgeOf(view).credit;
  const row = credit?.products.find((p) => p.product === CREDIT_KEY[product]);
  const haircut = haircutOf(product, credit?.tightness ?? 0, row?.haircut);
  const collateral = view.risk?.sale ?? 0;
  const lendable = Math.floor(collateral * (1 - haircut));
  const owed = (credit?.owed ?? 0) > 0 ? credit!.owed : view.risk?.loanOwed ?? 0;
  const room = Math.max(0, lendable - owed);
  const ask = cents && cents > 0 ? cents : 0;
  const after = room - ask;
  const policy = view.fx?.homeRate ?? view.curve?.[0]?.yield ?? 0;
  const rate = row && row.loans > 0 && row.rate > 0 ? row.rate : 0;
  const over = ask > room;
  return (
    <dl className="qa-preview" data-testid="loan-preview" aria-label="What this loan would do">
      <div><dt>Collateral the bank counts</dt><dd title="What your shares would fetch if sold now">{moneyTitle(collateral)}</dd></div>
      <div><dt>Haircut</dt><dd title="The share of the sale value the lender will not lend against">{Math.round(haircut * 100)}%</dd></div>
      <div><dt>It would lend at most</dt><dd>{moneyTitle(lendable)}</dd></div>
      <div><dt>Already owed on loans</dt><dd>{moneyTitle(owed)}</dd></div>
      <div><dt>Room before this loan</dt><dd>{moneyTitle(room)}</dd></div>
      {ask > 0 ? <div><dt>Room after borrowing {moneyTitle(ask)}</dt><dd className={over ? "loss" : undefined} data-testid="loan-after">{over ? `short by ${moneyTitle(-after)}: it will be refused` : moneyTitle(after)}</dd></div> : null}
      <div><dt>Rate</dt><dd>{rate > 0 ? `${(rate * 100).toFixed(2)}% on your open ${product === "line" ? "line" : product === "term" ? "term loan" : "margin loan"}` : product === "term" ? `fixed when you borrow; policy rate ${(policy * 100).toFixed(2)}% now` : `floats with the policy rate, ${(policy * 100).toFixed(2)}% now`}</dd></div>
      <div><dt>Maintenance</dt><dd>{product === "term" ? "not called while payments are made" : "a call comes when the loan passes what the shares support; you then have three trading days to repay or sell"}</dd></div>
      {ask > 0 ? <div><dt>Cash after the loan</dt><dd>{moneyTitle((view.cash ?? 0) + (over ? 0 : ask))}</dd></div> : null}
    </dl>
  );
}
