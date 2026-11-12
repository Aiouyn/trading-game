"use client";
// English copy is sync (first-load). French is a separate chunk; this hook suspends until it lands
// so a ?locale=fr first paint never flashes English.
import { EN, brLocale, type BrStrings } from "./strings-en";

let frValue: BrStrings | null = null;
let frPromise: Promise<BrStrings> | null = null;

function loadFr(): Promise<BrStrings> {
  frPromise ??= import("./strings-fr").then((m) => {
    frValue = m.FR;
    return m.FR;
  });
  return frPromise;
}

export function useBrStrings(locale: string): BrStrings {
  if (brLocale(locale) !== "fr") return EN;
  if (frValue) return frValue;
  throw loadFr();
}
