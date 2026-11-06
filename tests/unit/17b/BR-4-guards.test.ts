// UI card 4 (17B BRK-A): source and copy guards. BR-4-01 Broker built through its lazy module; BR-4-03 no number
// parsing, no arithmetic on contract fields, no mockFeed import; BR-4-05/06/11 CSS colour rules; BR-4-16 FR copy.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BR_STRINGS, reasonCopy, rejectCopy } from "@/apps/broker/strings";
import { APP_MODULES } from "@/shell/appModules";
import { REGISTRY } from "@/shell/registry";

const DIR = "src/apps/broker";
const strip = (s: string) => s.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
const code = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ f, raw: readFileSync(join(DIR, f), "utf8"), src: strip(readFileSync(join(DIR, f), "utf8")) }));
const css = readFileSync(join(DIR, "broker.css"), "utf8");

describe("BR-4-01 Broker is built", () => {
  it("registry built list = broker, portfolio, settings, wire", () => {
    expect(REGISTRY.filter((a) => a.built).map((a) => a.id).sort()).toEqual(["broker", "portfolio", "settings", "wire"]);
  });
  it("its module is the lazy @/apps/broker/App chunk", async () => {
    expect(APP_MODULES.broker.kind).toBe("lazy");
    const mod = await APP_MODULES.broker.load();
    expect((await import("@/apps/broker/App")).default).toBe(mod.default);
  });
});

/** Contract string fields the Broker shows (TickerRow, PreviewRes, MyFill, me). */
const FIELD = String.raw`(?:last|chg|chgPct|qty|price|fee|total|estFill|impactBp|impactMoney|buyingPowerAfter|firstTradeCapRemaining|balances(?:\.\w+|\[[^\]]*\])?|qtyText)`;
const ARITH = [
  new RegExp(String.raw`\.${FIELD}\b\s*[-+*/%]\s*[\w($.]`), // x.field ± y
  new RegExp(String.raw`[\w)\]]\s*[-+*/%]\s*(?:\w+\.)+${FIELD}\b(?!\s*[:=(])`), // y ± x.field
  new RegExp(String.raw`(?:^|[=(,\s])[+-]\s*(?:\w+\.)+${FIELD}\b`), // unary +x.field
];
export function brokerMathHits(src: string): string[] {
  const hits: string[] = [];
  for (const raw of src.split("\n")) {
    const line = raw.replace(/`[^`]*`|"[^"]*"|'[^']*'/g, '""').replace(/<\/\w*>?|\/>/g, " ");
    if (/\bNumber\(|parseFloat|parseInt|BigInt\(/.test(line) || ARITH.some((r) => r.test(line))) hits.push(raw.trim());
  }
  return hits;
}

describe("BR-4-03 no client maths on server numbers", () => {
  it.each(code)("$f: no Number()/parseFloat/parseInt/BigInt or arithmetic on a contract field", ({ src }) => {
    expect(brokerMathHits(src)).toEqual([]);
  });
  it("the scanner catches the patterns it bans", () => {
    for (const bad of ["const n = Number(res.total);", "x = parseFloat(row.last);", "const b = BigInt(fill.qty);", "const s = res.fee + res.total;", "const v = 2 * row.last;", "const n = +preview.price;", "const c = body.balances.FDL - fee;"]) {
      expect(brokerMathHits(bad), bad).not.toEqual([]);
    }
    expect(brokerMathHits("const reviewStale = preview.computedAtTick < tickerTick;")).toEqual([]);
  });
  it.each(code)("$f: never imports mockFeed; data comes only via useChannel and contracts/orders", ({ raw }) => {
    expect(raw).not.toMatch(/mockFeed|mockChannels|fixtures\//);
    for (const m of raw.matchAll(/from "(@\/shell\/[^"]+)"/g)) expect(["@/shell/contracts/useChannel", "@/shell/contracts/orders", "@/shell/contracts/channels", "@/shell/contracts/assetDetail", "@/shell/wm"]).toContain(m[1]);
  });
});

describe("BR-4-05/06/11 colour rules (CSS source)", () => {
  it("only the review Place button may be brass: no --acc anywhere in broker.css", () => {
    expect(css).not.toMatch(/--acc\b/);
  });
  it("the side segment and the halted chip never use --gain/--loss", () => {
    const seg = css.split("\n").filter((l) => /\.br-seg|\.br-halted|\.br-queued/.test(l)).join("\n");
    expect(seg).not.toMatch(/--gain|--loss|--acc/);
    expect(css).toMatch(/\.br-halted\s*\{[^}]*color:\s*var\(--steel\)/);
  });
  it("stale estimate rows use --fg-disabled", () => {
    expect(css).toMatch(/\.br-est\.stale[^{]*\{[^}]*color:\s*var\(--fg-disabled\)/);
  });
  it("Place is the Broker's only primary Button in source", () => {
    const prim = code.flatMap(({ f, src }) => [...src.matchAll(/variant="primary"/g)].map(() => f));
    expect(prim).toEqual(["TicketReview.tsx"]);
  });
});

describe("BR-4-16 strings EN/FR", () => {
  const { en: EN, fr: FR } = BR_STRINGS;
  const NNBSP = "\u202F";
  it("same keys in both locales", () => {
    expect(Object.keys(FR).sort()).toEqual(Object.keys(EN).sort());
    expect(Object.keys(FR.r).sort()).toEqual(Object.keys(EN.r).sort());
  });
  it("FR column of the card's copy table", () => {
    expect([FR.asset, FR.side, FR.buy, FR.sell, FR.qty, FR.qtyEmpty, FR.qtyDigits, FR.orderKind, FR.youHold("40")]).toEqual(
      ["Actif", "Sens", "↑ Achat", "↓ Vente", "Quantité", "Saisissez une quantité.", "Chiffres uniquement.", "Au marché · Jour", "Vous détenez 40"]);
    expect([FR.review, FR.edit, FR.place, FR.actionBuy("40", "HALC"), FR.actionSell("40", "HALC"), FR.estimateAt("27700")]).toEqual(
      ["Vérifier l’ordre", "Modifier", "Passer l’ordre", "Acheter 40 HALC", "Vendre 40 HALC", "Estimation · au tick 27700"]);
    expect([FR.price, FR.estFill, FR.fee, FR.impact, FR.total, FR.bpAfter, FR.capLeft, FR.refreshing, FR.note]).toEqual(
      ["Cours", "Exécution est.", "Frais", "Impact est.", "Total est.", "Pouvoir d’achat après", "Plafond premier ordre restant", "Actualisation de l’estimation…", "Les cours peuvent baisser. C’est le jeu."]);
    expect([FR.pending("5"), FR.bought("40", "HALC", "12,34"), FR.sold("40", "HALC", "12,34"), FR.feeLine("0,49"), FR.received, FR.newOrder, FR.rejected]).toEqual(
      ["En attente · tick 5", "Achat de 40 HALC à 12,34", "Vente de 40 HALC à 12,34", "Frais 0,49", "Ordre reçu.", "Nouvel ordre", "Ordre refusé"]);
    expect([FR.r.MKT_INSUFFICIENT_BP, FR.r.MKT_HALTED, FR.r.MKT_UNKNOWN_ASSET, FR.r.MKT_BAD_QTY, FR.halted, FR.haltedHelp]).toEqual(
      ["Liquidités insuffisantes pour cet ordre.", "La cotation de cet actif est suspendue.", "Cet actif ne peut pas être négocié.", "Vérifiez la quantité.", "Suspendu", "Les ordres sont suspendus pendant l’arrêt de la cotation."]);
  });
  it("U+202F before \"pb\" and \":\"; the unknown-code line uses « » with U+202F inside", () => {
    expect(FR.bp("12")).toBe(`12${NNBSP}pb`);
    expect(FR.placeAria("Acheter 40 HALC")).toBe(`Passer l’ordre${NNBSP}: Acheter 40 HALC`);
    expect(FR.rejectedCode("ZZ_NEW")).toBe(`Ordre refusé (code «${NNBSP}ZZ_NEW${NNBSP}»)`);
    for (const s of Object.values(FR).filter((v): v is string => typeof v === "string")) expect(s, s).not.toMatch(/ [:;%!?»]|« /);
  });
  it("EN copy table", () => {
    expect([EN.rejectedCode("ZZ_NEW"), EN.placeAria("Buy 40 HALC"), EN.bp("12"), EN.haltedQueued]).toEqual(["Order rejected (ZZ_NEW)", "Place order: Buy 40 HALC", "12 bp", "Waits for reopen"]);
  });
  it("reject and reason copy: known code → its line, unknown → null / rejectedCode", () => {
    expect(rejectCopy(EN, "MKT_NO_LOCATE")).toBe(EN.r.MKT_NO_LOCATE);
    expect(rejectCopy(EN, "ZZ_NEW")).toBeNull();
    expect(reasonCopy(EN, "BAD_QTY")).toBe(EN.r.MKT_BAD_QTY);
    expect(reasonCopy(EN, "MKT_BAD_QTY")).toBe(EN.r.MKT_BAD_QTY);
    expect(reasonCopy(FR, "ZZ_NEW")).toBe(FR.rejectedCode("ZZ_NEW"));
  });
});
