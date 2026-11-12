// Shared comparison for the M1-08 status-bar net-worth chip (MoneyText ctx="chip").
// Visible text uses compactMoneyText (abbreviates from $10,000.00). The full value is
// on the .money node's title when abbreviated, otherwise in the visible text.
import { compactMoneyText, fullDigits, isZero, MINUS, parseAmount } from "@/components/ui/money";

export type ChipMoneyDom = { text: string | null; title: string | null };

export function fullMoneyText(amount: string): string {
  const p = parseAmount(amount);
  if (isZero(p)) return "$0.00";
  return `${p.negative ? MINUS : ""}$${fullDigits(p)}`;
}

/** Visible chip text and the exact full value MoneyText exposes for a server decimal amount. */
export function expectedChipMoney(amount: string): { visible: string; full: string } {
  return { visible: compactMoneyText(amount), full: fullMoneyText(amount) };
}

/** Full value the chip exposes: title when abbreviated, otherwise the visible text. */
export function actualChipFull(chip: ChipMoneyDom): string | null {
  return chip.title ?? chip.text;
}

export function chipMatchesAmount(chip: ChipMoneyDom, amount: string): boolean {
  const exp = expectedChipMoney(amount);
  return chip.text === exp.visible && actualChipFull(chip) === exp.full;
}
