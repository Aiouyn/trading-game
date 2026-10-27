// Settings EN/FR copy (Designer FR fixes, #38) and the CREDITS shape.
import { describe, expect, it } from "vitest";
import { CREDITS } from "@/apps/settings/about-data";
import { SETTINGS_STRINGS } from "@/apps/settings/strings";

const { en, fr } = SETTINGS_STRINGS;

describe("17B settings strings", () => {
  it("FR fixes", () => {
    expect(fr.systemState(true)).toBe("Système\u00A0: activé");
    expect(fr.integrity).toBe("Rapport d’intégrité public");
    expect(fr.newTab).toBe("(s’ouvre dans un nouvel onglet)");
    expect(fr.copied).toBe("Copiée");
    expect(fr.colorBlind).toBe("Mode daltonien");
    expect(fr.colorBlindHint).toBe("Phosphor est pensée pour ça.");
    expect(fr.previewNw).toBe("Patrimoine net");
    expect(fr.comingLater).toBe("Bientôt");
    expect(fr.section["SET-07"]).toBe("Ordres");
    expect(fr.section["SET-05"]).toBe("Raccourcis"); // 17 §7.2: SET-05 Keys = shortcut remap table
  });
  it("verbatim in FR: TradingView attribution and palette names", () => {
    expect(fr.chartsBy).toBe("Charts by TradingView");
    expect(fr.paletteNames).toEqual(en.paletteNames);
  });
  it("no straight apostrophes in FR copy", () => {
    const flat = JSON.stringify(fr);
    expect(flat).not.toMatch(/[a-zé]'[a-zé]/i);
  });
  it("cosmetic shell names derive from cos_shell_ ids", () => {
    expect(en.cosmeticName("cos_shell_glass")).toBe("Glass · Cosmetic");
    expect(fr.cosmeticName("cos_shell_night_glass")).toBe("Night glass · Cosmétique");
  });
  it("CREDITS are {name, roleKey} with EN and FR roles", () => {
    for (const c of CREDITS) {
      expect(Object.keys(c).sort()).toEqual(["name", "roleKey"]);
      expect(en.roles[c.roleKey]).toBeTruthy();
      expect(fr.roles[c.roleKey]).toBeTruthy();
    }
    expect(CREDITS.map((c) => fr.roles[c.roleKey])).toEqual(["conception", "interface et applis", "Port Avalon", "marchés", "Quay"]);
    expect(CREDITS.map((c) => en.roles[c.roleKey])).toEqual(["design", "shell and apps", "Port Avalon", "markets", "Quay"]);
  });
});
