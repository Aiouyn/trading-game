// UI card 9 guards: WIR-9-12 copy (EN/FR parity, spec-literal values, NNBSP before ":" and "%", ’ in FR),
// WIR-9-06 source scan (no number parsing in the new files), and the build-gated `?filings=` mock hook.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EN, FR, type WireStrings } from "@/apps/wire/strings";
import { FILINGS } from "@/shell/contracts/fixtures/news";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";

const NNBSP = "\u202F";
const NEW_KEYS = ["openItem", "backToWire", "noSelection", "assets", "openInBroker", "openInBrokerAria", "source", "recordLine",
  "pricedInTitle", "filing", "filedBy", "subject", "field", "pctValue", "side", "filingType", "filingMissing", "notInFeed"] as const;
const leaves = (o: unknown, path = ""): [string, string][] =>
  typeof o === "string" ? [[path, o]] : Object.entries(o as object).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));

describe("WIR-9-12 copy", () => {
  it("every new key has EN and FR, same shape, non-empty, distinct where the languages differ", () => {
    for (const k of NEW_KEYS) {
      const en = leaves(EN[k], k), fr = leaves(FR[k], k);
      expect(fr.map(([p]) => p), k).toEqual(en.map(([p]) => p));
      for (const [p, v] of [...en, ...fr]) expect(v.trim(), p).not.toBe("");
    }
  });
  it("spec-literal EN", () => {
    const pick = (t: WireStrings) => ({ openItem: t.openItem, backToWire: t.backToWire, noSelection: t.noSelection, openInBroker: t.openInBroker,
      openInBrokerAria: t.openInBrokerAria, pricedInTitle: t.pricedInTitle, filing: t.filing, filedBy: t.filedBy, subject: t.subject,
      field: t.field, side: t.side, filingType: t.filingType, filingMissing: t.filingMissing, notInFeed: t.notInFeed, recordLine: t.recordLine });
    expect(pick(EN)).toEqual({
      openItem: "Open: {headline}", backToWire: "Back to Wire", noSelection: "Select a story to read it here.", openInBroker: "Open in Broker",
      openInBrokerAria: "Open {ticker} in Broker", pricedInTitle: "Priced in", filing: "Filing", filedBy: "Filed by", subject: "Company",
      field: { pct: "Stake", qty: "Quantity", price: "Price", side: "Side" }, side: { BUY: "↑ Buy", SELL: "↓ Sell" },
      filingType: { ownership_5pct: "Major stake", insider: "Insider trade", quarterly_holdings: "Quarterly holdings", company_statement: "Company statement", fund_disclosure: "Fund disclosure", regulatory: "Regulatory" },
      filingMissing: "Filing details aren't available.", notInFeed: "This story is no longer in your feed.", recordLine: "{hits} of {resolved} past claims held up",
    });
    expect([EN.assets, EN.source]).toEqual(["Assets", "Source"]);
  });
  it("FR: NNBSP before ':' and '%' (and never a plain space there); ’ never '", () => {
    expect(FR.openItem).toBe(`Ouvrir${NNBSP}: {headline}`);
    expect(EN.pctValue).toBe(`{v}${NNBSP}%`);
    expect(FR.pctValue).toBe(`{v}${NNBSP}%`);
    expect(FR.filingType.insider).toBe("Opération d’initié");
    expect([FR.backToWire, FR.pricedInTitle, FR.filing, FR.filedBy, FR.subject, FR.side.BUY, FR.side.SELL]).toEqual(
      ["Retour au fil", "Intégré aux cours", "Déclaration", "Déclarant", "Société", "↑ Achat", "↓ Vente"]);
    for (const k of NEW_KEYS) for (const [p, v] of leaves(FR[k], k)) {
      expect(v, p).not.toMatch(/ [:;!?%»]/);
      expect(v, p).not.toMatch(/[^\u202F\u00A0][:;!?%]/);
      expect(v, p).not.toContain("'");
    }
  });
  it("record line keeps the ints verbatim ({hits}/{resolved} slots in both)", () => {
    for (const t of [EN, FR]) expect(t.recordLine.match(/\{\w+\}/g)).toEqual(["{hits}", "{resolved}"]);
  });
});

describe("WIR-9-06 source scan", () => {
  it("ItemDetail.tsx and FilingSummary.tsx never parse a number", () => {
    for (const f of ["ItemDetail.tsx", "FilingSummary.tsx"]) {
      const src = readFileSync(join(__dirname, "../../../src/apps/wire", f), "utf8").replace(/\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/\bNumber\s*\(|\bparseFloat\b|\bparseInt\b|Number\.parse|Math\./);
    }
  });
});

describe("?filings= mock hook (QUAY_HOOKS)", () => {
  const frames = (scenario: ConstructorParameters<typeof MockFeed>[0]) => {
    vi.useFakeTimers();
    const f = new MockFeed(scenario, { autoStart: false });
    const got: { ch: string; t: string }[] = [];
    f.subscribe("filings", (r) => got.push(r as { ch: string; t: string }));
    f.subscribe("news", (r) => got.push(r as { ch: string; t: string }));
    vi.advanceTimersByTime(SNAP_DELAY_MS);
    return { f, got };
  };
  it("error: filings gets err, news still snaps; one resync('filings') recovers with the f-1 body", () => {
    try {
      const { f, got } = frames({ filings: "error" });
      expect(got.map((g) => `${g.ch}:${g.t}`)).toEqual(["filings:err", "news:snap"]);
      f.resync("news");
      expect(got).toHaveLength(3); // news re-snaps (it had one), filings untouched
      f.resync("filings");
      const last = got.at(-1) as unknown as { ch: string; t: string; body: { items: { id: string }[] } };
      expect([last.ch, last.t]).toEqual(["filings", "snap"]);
      expect(last.body.items.map((i) => i.id)).toEqual(FILINGS.map((i) => i.id));
    } finally { vi.useRealTimers(); }
  });
  it("loading: filings never snaps and a resync does not wake it; news is live", () => {
    try {
      const { f, got } = frames({ filings: "loading" });
      expect(got.map((g) => `${g.ch}:${g.t}`)).toEqual(["news:snap"]);
      f.resync("filings");
      expect(got.map((g) => g.ch)).toEqual(["news"]);
    } finally { vi.useRealTimers(); }
  });
  it("unset: filings snaps like any channel, and the global feed mode still applies to it", () => {
    try {
      expect(frames({}).got.map((g) => `${g.ch}:${g.t}`)).toEqual(["filings:snap", "news:snap"]);
      vi.useRealTimers();
      expect(frames({ feed: "error" }).got.map((g) => `${g.ch}:${g.t}`)).toEqual(["filings:err", "news:err"]);
    } finally { vi.useRealTimers(); }
  });
});
