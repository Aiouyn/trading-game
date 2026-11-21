// A price move's "because" text from the sim: "<move> | because: <input>; <input>; ...". The screens show the inputs
// as a list and the move in words, so Why? names what changed the quote instead of repeating the move.

const dollars = (cents: number): string =>
  "$" + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });

/** Whole-cent figures inside a driver sentence, written as dollars. */
function money(text: string): string {
  return text
    .replace(/(\d{3,}) cents a month/g, (_, n: string) => `${dollars(Number(n))} a month`)
    .replace(/(dividend anchor) (\d{3,})/g, (_, k: string, n: string) => `${k} ${dollars(Number(n))}`)
    .replace(/stakes (\d+) cents a share/g, (_, n: string) => `stakes ${dollars(Number(n))} a share`)
    .replace(/\beq:frm_(\w+)/g, (_, id: string) => id.replace(/_/g, " "));
}

export interface Drivers { head: string; drivers: string[] }

export function splitDrivers(msg: string): Drivers {
  const i = msg.indexOf(" | because: ");
  if (i < 0) return { head: msg, drivers: [] };
  const drivers = msg.slice(i + 12).split("; ").map((s) => money(s.trim())).filter(Boolean);
  return { head: msg.slice(0, i), drivers };
}

/** "eq:frm_x close 691 -> 656 (-5.1%) session Monday 7 May" as "closed $6.91 to $6.56 (−5.1%)". */
export function moveWords(head: string): string {
  const m = /close (\d+) -> (\d+) \(([+-]?[\d.]+)%\)/.exec(head);
  if (m) return `closed ${dollars(Number(m[1]))} to ${dollars(Number(m[2]))} (${m[3].replace("-", "\u2212")}%)`;
  const k = /mark (\d+) -> (\d+) \(([+-]?[\d.]+)%\)/.exec(head);
  if (k) return `indicative mark ${dollars(Number(k[1]))} to ${dollars(Number(k[2]))} (${k[3].replace("-", "\u2212")}%), no execution`;
  return head;
}
