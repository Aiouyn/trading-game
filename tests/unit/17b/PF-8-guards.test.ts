// UI card 8: source guards. PF-8-02 one Open orders list (Broker's), no copy in Portfolio; PF-8-05 no parsing or
// arithmetic on fill / order fields; PF-8-08 no brass / gain / loss in the tab's own styles; the 3 ENGINE-TBD markers;
// PF-8-12 EN/FR keys for every new string.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FILL_COLS, PF_STRINGS } from "@/apps/portfolio/strings";

const DIR = "src/apps/portfolio";
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const strip = (s: string) => s.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
const raw = (f: string) => readFileSync(f, "utf8");
const CARD8 = ["Orders.tsx", "Fills.tsx"].map((f) => ({ f, src: strip(raw(join(DIR, f))) }));
const css = strip(raw(join(DIR, "orders.css")));

describe("PF-8-02 the Broker list, not a copy", () => {
  it("Orders.tsx imports OpenOrders from the Broker and renders it", () => {
    const src = CARD8[0]!.src;
    expect(src).toContain('import { OpenOrders } from "@/apps/broker/OpenOrders";');
    expect(src).toMatch(/<OpenOrders t=\{br\} locale=\{locale\} me=\{me\} freshId=\{null\} \/>/);
  });
  it("no second CancelControl / byRecent / open-orders row markup anywhere in Portfolio", () => {
    for (const f of walk(DIR)) {
      const src = strip(raw(f));
      expect([f, src.match(/CancelControl|byRecent|statusText|br-oo-(row|cancel|yes|keep)|mkt\.order\.cancel|cancelOrder/g)]).toEqual([f, null]);
    }
  });
});

describe("PF-8-05 no client maths on fill or order fields", () => {
  const FIELD = String.raw`\.(qty|price|fee|filled|avgPrice|limit|stop)\b`;
  it("no Number( / parseFloat / parseInt / BigInt( / Math. / toFixed / unary +", () => {
    for (const { f, src } of CARD8) expect([f, src.match(/\bNumber\(|parseFloat|parseInt|BigInt\(|Math\.|toFixed|[=(,]\s*\+\s*\w+\.\w/g)]).toEqual([f, null]);
  });
  it("no + - * / % next to a money or quantity field", () => {
    const re = new RegExp(String.raw`\w${FIELD}\s*[-+*/%]|[-+*/%]\s*\w+${FIELD}`, "g");
    for (const { f, src } of CARD8) expect([f, src.match(re)]).toEqual([f, null]);
  });
  it("the guard bites: it flags a notional", () => {
    const re = new RegExp(String.raw`\w${FIELD}\s*[-+*/%]|[-+*/%]\s*\w+${FIELD}`, "g");
    expect("const n = f.qty * f.price;".match(re)).not.toBeNull();
    expect("const n = Number(f.fee);".match(/\bNumber\(/)).not.toBeNull();
  });
});

describe("PF-8-08 neutral styles", () => {
  it("orders.css never references --acc, --gain or --loss (the --loss confirm stays in the Broker's openOrders.css)", () => {
    expect(css).not.toMatch(/--acc|--gain|--loss/);
  });
  it("liquidity chip: --steel outline, --fg text; hc row borders; 44 px phone rows", () => {
    expect(css).toMatch(/\.pf-fills \.chip\.pf-fill-liq \{ border-color: var\(--steel\); color: var\(--fg\); \}/);
    expect(css).toMatch(/html\[data-hc="1"\] \.pf-fill, html\[data-hc="1"\] \.pf-fills-table thead th \{ border-bottom-color: var\(--fg-muted\); \}/);
    expect(css).toMatch(/\.pf-orders-phone \.pf-fills-list \.pf-fill \{ min-height: var\(--hit-touch\); \}/);
    expect(css).toMatch(/\.pf-fills-table tr\.pf-fill \{ height: 36px;/);
  });
  it("Orders code asks for no tone (chips neutral) and no primary", () => {
    for (const { src } of CARD8) expect(src).not.toMatch(/tone=|variant="primary"|ctx="wealth"/);
  });
});

describe("ENGINE-TBD markers (card 8)", () => {
  it("the 3 open questions are named in the code", () => {
    const all = raw(join(DIR, "Fills.tsx")) + raw(join(DIR, "Orders.tsx"));
    expect(all).toMatch(/ENGINE-TBD: fills aging out of the 50 ring/);
    expect(all).toMatch(/ENGINE-TBD: `counterpartyKind` \(Player \/ NPC\) is not displayed/);
    expect(all).toMatch(/ENGINE-TBD: whether a halted market order's reopen fill reports AUCTION liquidity/);
    expect(strip(all)).not.toMatch(/counterpartyKind/);
  });
});

describe("PF-8-12 strings", () => {
  const { en, fr } = PF_STRINGS;
  it("EN and FR carry every card 8 key, the column and liquidity maps complete", () => {
    for (const k of ["orders", "recentFills", "fillsHelp", "noFills", "col", "liq", "fillTick", "fillAria", "fillsCaption"] as const) {
      expect([k, k in en, k in fr]).toEqual([k, true, true]);
    }
    expect(Object.keys(fr.col)).toEqual([...FILL_COLS]);
    expect(Object.keys(en.col)).toEqual([...FILL_COLS]);
    expect(Object.keys(fr.liq).sort()).toEqual(["AUCTION", "MAKER", "TAKER"]);
    expect(Object.values({ ...en.col, ...en.liq, ...fr.col, ...fr.liq }).every((v) => v.length > 0)).toBe(true);
  });
  it("FR copy: typographic apostrophes, NNBSP before ':'", () => {
    expect(fr.noFills).toBe("Aucune transaction pour l’instant.");
    expect([fr.fillsHelp, fr.noFills].join("")).not.toContain("'");
    const a = fr.fillAria({ side: "Achat", qty: "1", ticker: "HALC", price: "2", fee: "3", ccy: "FDL", liquidity: "Preneur", tick: "4" });
    expect(a).toBe("Achat 1 HALC à 2, frais\u202F: 3 FDL, Preneur, tick 4");
    expect(fr.fillTick("27700")).toBe("tick 27700");
  });
});
