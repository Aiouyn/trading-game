// Broker ticket copy (UI card 4, BRK-A), EN + FR. First-load modules must import from `./strings-en` only;
// this barrel re-exports FR for tests and for signed-in / locale=fr callers that want `brStrings` synchronously.
export { FR } from "./strings-fr";
export * from "./strings-en";
import { EN, brLocale, type BrLocale, type BrStrings } from "./strings-en";
import { FR } from "./strings-fr";

export const BR_STRINGS: Record<BrLocale, BrStrings> = { en: EN, fr: FR };
export const brStrings = (locale: string): BrStrings => BR_STRINGS[brLocale(locale)];
