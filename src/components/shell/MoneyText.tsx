// MoneyText stub (17 §3.4.1): formats a server decimal string; never computes money.
export type MoneyCtx = "hero" | "table" | "list" | "chip" | "sentence" | "wealth";

export function groupMoney(v: string, cents = true): string {
  const neg = v.startsWith("-");
  const [i, f = ""] = v.replace(/^[-+]/, "").split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "\u2212" : ""}$${grouped}${cents ? `.${f.padEnd(2, "0").slice(0, 2)}` : ""}`;
}

export function compactMoney(v: string): string {
  const i = v.replace(/^[-+]/, "").split(".")[0];
  const units: [number, string][] = [[12, "T"], [9, "B"], [6, "M"], [3, "k"]];
  for (const [d, u] of units) {
    if (i.length > d) {
      const head = i.slice(0, i.length - d);
      const dec = i.slice(i.length - d, i.length - d + 1);
      return `${v.startsWith("-") ? "\u2212" : ""}$${head}${head.length < 3 && dec !== "0" ? `.${dec}` : ""}${u}`;
    }
  }
  return `$${i}`;
}

export function MoneyText({ value, ctx = "list", compact = false }: { value: string; ctx?: MoneyCtx; compact?: boolean }) {
  return <span className={`num money money-${ctx}`}>{compact ? compactMoney(value) : groupMoney(value)}</span>;
}

export function PctText({ value }: { value: string }) {
  const neg = value.startsWith("-");
  const text = `${neg ? "\u2212" : value.startsWith("+") ? "+" : "+"}${value.replace(/^[-+]/, "")}%`;
  return <span className={`num ${neg ? "loss" : "gain"}`}>{text}</span>;
}
