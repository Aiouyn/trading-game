// UI card 10: BR-10-12 copy (EN/FR keys, the card's FR column, FR typography), BR-10-04 source scan of the new broker
// files, and the asset page CSS rules (no brass, no transitions, hit targets).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BR_STRINGS } from "@/apps/broker/strings";

const { en: EN, fr: FR } = BR_STRINGS;
const NNBSP = "\u202F";
const DIR = "src/apps/broker";
const NEW_FILES = ["AssetPage.tsx", "AssetOverview.tsx", "AssetNews.tsx", "../../shell/contracts/assetDetail.ts"];
const strip = (s: string) => s.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
const css = readFileSync(join(DIR, "assetPage.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every card 10 string, functions called with samples, flattened. */
const card10 = (L: typeof EN): string[] => [
  L.viewTrade, L.viewAbout, L.viewAria, L.tabsAria, L.tabOverview, L.tabNews, L.backToTrade,
  ...Object.values(L.f), ...Object.values(L.class), ...Object.values(L.st),
  L.positionLine("40", "$1.2K"), L.noPosition, L.noNews("HALC"), L.newsHelp, L.openStoryAria("Halcyon beats"), L.unknownAsset,
  L.newsLoading, L.assetOption("HALC", "Halcyon Shipping"),
];

describe("BR-10-12 strings", () => {
  it("every card 10 key exists in both locales with the same shape", () => {
    for (const k of ["f", "class", "st"] as const) expect(Object.keys(FR[k]).sort()).toEqual(Object.keys(EN[k]).sort());
    expect(card10(FR)).toHaveLength(card10(EN).length);
    for (const s of [...card10(EN), ...card10(FR)]) expect(s.trim()).not.toBe("");
  });
  it("EN and FR columns of the card's copy table", () => {
    expect([EN.viewTrade, EN.viewAbout, EN.tabOverview, EN.tabNews, EN.backToTrade, EN.noPosition, EN.newsHelp, EN.unknownAsset])
      .toEqual(["Trade", "About", "Overview", "News", "Back to trade", "You don't hold this asset.", "Only recent stories are kept.", "Details for this asset aren't available."]);
    expect([FR.viewTrade, FR.viewAbout, FR.tabOverview, FR.tabNews, FR.backToTrade, FR.noPosition, FR.newsHelp, FR.unknownAsset])
      .toEqual(["Trader", "À propos", "Aperçu", "Actualités", "Retour au trading", "Vous ne détenez pas cet actif.", "Seules les dépêches récentes sont conservées.", "Les détails de cet actif ne sont pas disponibles."]);
    expect(Object.values(FR.f)).toEqual(["Nom", "Code", "Type", "Secteur", "Région", "Devise", "Licence", "Cours", "Cotation", "Votre position"]);
    expect(Object.values(EN.f)).toEqual(["Name", "Ticker", "Type", "Sector", "Region", "Currency", "Licence", "Price", "Trading", "Your position"]);
    expect([FR.class.equity, FR.class.index, EN.class.equity, EN.class.index]).toEqual(["Action", "Indice", "Stock", "Index"]);
    expect([EN.positionLine("40", "$1.2K"), FR.positionLine("40", "1,2 k$")]).toEqual(["40 shares · $1.2K", "40 titres · 1,2 k$"]);
    expect([EN.noNews("HALC"), FR.noNews("HALC")]).toEqual(["No stories about HALC in your feed yet.", "Aucune dépêche sur HALC dans votre fil pour l’instant."]);
    expect([EN.openStoryAria("X"), FR.openStoryAria("X")]).toEqual(["Open in Wire: X", `Ouvrir dans le fil${NNBSP}: X`]);
    expect([EN.assetOption("HALC", "Halcyon Shipping"), FR.assetOption("HALC", "Halcyon Shipping")]).toEqual(["HALC · Halcyon Shipping", "HALC · Halcyon Shipping"]);
    expect(FR.st).toEqual({
      CLOSED: "Fermé", PRE_OPEN: "Pré-ouverture", OPENING_AUCTION: "Enchère d’ouverture", CONTINUOUS: "Ouvert", CLOSING_AUCTION: "Enchère de clôture",
      AFTER_HOURS: "Après-bourse", HALTED: "Suspendu temporairement", VOL_INTERRUPTION: "Pause de volatilité", LIMIT_LOCKED: "Bloqué en limite", SUSPENDED: "Suspendu",
    });
    expect(EN.st).toEqual({
      CLOSED: "Closed", PRE_OPEN: "Pre-open", OPENING_AUCTION: "Opening auction", CONTINUOUS: "Open", CLOSING_AUCTION: "Closing auction",
      AFTER_HOURS: "After hours", HALTED: "Halted", VOL_INTERRUPTION: "Volatility pause", LIMIT_LOCKED: "Limit locked", SUSPENDED: "Suspended",
    });
  });
  it("FR typography: NNBSP before : ? ! %, ’ not ', «…» not \"…\"", () => {
    for (const s of card10(FR)) {
      expect(s, s).not.toMatch(/[ \u00A0][:?!%]/);
      expect(s, s).not.toMatch(/[^\u202F][:?!%]/);
      expect(s, s).not.toContain("'");
      expect(s, s).not.toContain('"');
    }
  });
});

describe("BR-10-04 source scan", () => {
  it.each(NEW_FILES)("%s: no Number( / parseFloat / parseInt / Math.", (f) => {
    expect(strip(readFileSync(join(DIR, f), "utf8"))).not.toMatch(/\bNumber\s*\(|\bparseFloat\b|\bparseInt\b|Number\.parse|Math\./);
  });
});

describe("asset page CSS", () => {
  it("never brass, no transitions or animations; gain/loss only via the shared Quote", () => {
    expect(css).not.toMatch(/--acc\b|transition|animation|--gain|--loss/);
  });
  it("targets: rows ≥ --hit-pointer, ≥ --hit-touch on phone and coarse pointers", () => {
    expect(css).toMatch(/\.ap-story \{[^}]*min-height: var\(--hit-pointer\)/);
    expect(css).toMatch(/\.br-phone \.ap-story \{ min-height: var\(--hit-touch\); \}/);
    expect(css).toMatch(/@media \(pointer: coarse\) \{ \.ap-story \{ min-height: var\(--hit-touch\); \} \}/);
  });
});
