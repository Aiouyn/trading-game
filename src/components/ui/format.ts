// Player-facing figures. Presentation only: the digits stay the simulation's.

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** Game day (360-day years, 30-day months) as "Year 2, March 14". */
export function gameDate(abs: number): string {
  if (!Number.isFinite(abs)) return "";
  const day = Math.floor(abs);
  const doy = ((day % 360) + 360) % 360;
  const year = Math.floor(day / 360) + 1;
  const month = MONTHS[Math.floor(doy / 30)] ?? "January";
  return `Year ${year}, ${month} ${(doy % 30) + 1}`;
}

/** Integer cents as "$1,394.45". A loss uses U+2212. Zero has no sign. */
export function moneyFromCents(cents: number): string {
  const rounded = Math.round(cents);
  const body = (Math.abs(rounded) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (rounded === 0) return "$0.00";
  return (rounded < 0 ? "\u2212$" : "$") + body;
}

/** A percent that is already in percent points ("11.2" -> "11.2%"). Negatives take U+2212. Zero has no sign. */
export function levelPct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "—";
  const body = Math.abs(v).toFixed(digits);
  if (v < 0) return `\u2212${body}%`;
  return `${body}%`;
}

/** A share count or position. Longs take a plus, shorts U+2212, zero is "0". */
export function signedQty(n: number): string {
  const body = Math.abs(Math.round(n)).toLocaleString("en-US");
  if (n > 0) return `+${body}`;
  if (n < 0) return `\u2212${body}`;
  return "0";
}

export function titleWord(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Drop ledger ids the player should never read. */
export function scrubIds(text: string): string {
  return text
    .replace(/\s*\((?:eq:)?frm_[A-Za-z0-9_]+\)/g, "")
    .replace(/\beq:frm_[A-Za-z0-9_]+\b/gi, "")
    .replace(/\bfrm_[A-Za-z0-9_]+\b/gi, "")
    .replace(/\bcoin:[A-Za-z0-9_:-]+\b/g, (id) => {
      const slug = id.slice(5).replace(/^me:/, "");
      return slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "a coin";
    })
    .replace(/\bbank_\d+\b/g, "the bank")
    .replace(/\bp_\d+\b/g, "someone")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

function dollarsIn(n: string): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return n;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** The genesis line is a debug stamp. The player should never read it. */
export function seedDebug(text: string): boolean {
  return /world (?:was |being )?created from seed/i.test(text);
}

/** A server note, in the same voice as the rest of the desk. */
export function presentNote(text: string): string {
  if (seedDebug(text)) return "";
  let s = text
    .replace(/\s*This followed from the world (?:was |being )?created from seed[^.]*\.?/gi, "")
    .trim()
    .replace(/^wait (\d+)d$/i, (_, n: string) => {
      const d = Number(n);
      if (d === 1) return "A day passed.";
      if (d === 7) return "A week passed.";
      if (d === 30) return "A month passed.";
      return `${d} days passed.`;
    })
    .replace(/^(buy|sell|short) (\d+) eq:frm_[A-Za-z0-9_]+/i, (_, side: string, n: string) => {
      const word = side.toLowerCase() === "buy" ? "Buy order in" : side.toLowerCase() === "sell" ? "Sell order in" : "Short order in";
      return `${word} for ${n}. It prints after the next day.`;
    });
  s = scrubIds(s);
  s = s.replace(/\bY(\d+) M(\d+) D(\d+)\b/g, (_, y: string, m: string, d: string) => {
    const abs = (Number(y) - 1) * 360 + (Number(m) - 1) * 30 + (Number(d) - 1);
    return gameDate(abs);
  });
  s = s.replace(/\$(\d{4,}(?:\.\d+)?)/g, (_, n: string) => {
    const v = Number(n);
    return Number.isFinite(v)
      ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: n.includes(".") ? 2 : 0, maximumFractionDigits: 2 })
      : "$" + n;
  });
  s = s.replace(/\bborrowed (\d+(?:\.\d+)?) at (\d+(?:\.\d+)?)%/gi, (_, n: string, r: string) => `Borrowed ${dollarsIn(n)} at ${levelPct(Number(r), 2)}`);
  s = s.replace(/\bborrowed (\d+(?:\.\d+)?) against #\d+(?: wait (\d+)d)?/gi, (_, n: string, d?: string) => {
    const money = dollarsIn(n);
    return d ? `Borrowed ${money}. The loan waits ${d} ${d === "1" ? "day" : "days"}.` : `Borrowed ${money}.`;
  });
  s = s.replace(/\bLimit (\d{4,}(?:\.\d+)?)/g, (_, n: string) => `Limit ${dollarsIn(n)}`);
  s = s.replace(/\b(\d+(?:\.\d+)?) dollars\b/gi, (_, n: string) => dollarsIn(n));
  s = s.replace(/\bprofit of (\d+)\b/gi, (_, n: string) => `profit of ${dollarsIn(n)}`);
  s = s.replace(/,:/g, ":");
  s = s.replace(/(^|[\s(])-(\$|\d)/g, (_, lead: string, d: string) => `${lead}\u2212${d}`);
  s = s.replace(/(^|[.]\s+)([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase());
  return s;
}
