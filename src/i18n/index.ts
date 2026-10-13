'use client';

import { create } from 'zustand';
import en from './en.json';
import fr from './fr.json';
import { ENGINE_FR } from './engineFr';
import { formatToken, isNumberToken } from './tokens';

export { formatNumberToken, formatToken, isNumberToken } from './tokens';

/**
 * Translations (ROADMAP M03). Every user-facing string goes through t(key, vars).
 * - Keys are flat and dotted: "broker.buy", "rank.R1".
 * - Variables: "{qty} shares" with t('x', { qty: 3 }).
 * - Plurals: when vars.count is set, "key_one" / "key_other" are tried first.
 * - Missing French falls back to English, missing English falls back to the key, so a gap is
 *   visible in development and never crashes.
 * Server-made text (Wire, inbox) travels as { key, vars } descriptors and is rendered here too.
 */
export type Locale = 'en' | 'fr';
export const LOCALES: { id: Locale; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
];

type Dict = Record<string, string>;
const DICTS: Record<Locale, Dict> = { en: en as Dict, fr: fr as Dict };

let current: Locale = 'en';

/** The locale the viewer reads in now: number and money formatting (src/game/format.ts) follows it. */
export function currentLocale(): Locale {
  return current;
}

/**
 * A message variable: a number, a string ("@key" names another key, "#n:v,min,max" is a number in the viewer's locale,
 * "!text" is an engine sentence through engineFr.ts), another message rendered in the same locale, or a list of them
 * joined with " · " (the lab's signal picks).
 */
export type MsgVar = string | number | Msg | readonly Msg[];

export interface Msg {
  key: string;
  vars?: Record<string, MsgVar>;
}

function format(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
}

function lookup(locale: Locale, key: string): string | undefined {
  return DICTS[locale][key];
}

/**
 * A variable that starts with "@" names another key (e.g. {part: "@journal.part.market"}): it is translated in the same
 * locale first, so a sentence built on the server reads in the viewer's language. A "#n:" token is a number in that locale.
 */
export function resolveRefs(locale: Locale, vars?: Record<string, MsgVar>): Record<string, string | number> | undefined {
  if (!vars) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (Array.isArray(v)) out[k] = (v as readonly Msg[]).map((m) => translate(locale, m.key, m.vars)).join(' · ');
    else if (typeof v === 'object') out[k] = translate(locale, (v as Msg).key, (v as Msg).vars);
    else if (typeof v !== 'string') out[k] = v as number;
    // a typed name that starts with "@" or "!" stays as typed unless it really is a key (or an engine sentence)
    else if (v.startsWith('@') && hasKey(v.slice(1))) out[k] = translate(locale, v.slice(1));
    else if (isNumberToken(v)) out[k] = formatToken(locale, v);
    else if (v.startsWith('!')) out[k] = locale === 'fr' ? (ENGINE_FR[v.slice(1)] ?? v.slice(1)) : v.slice(1);
    else out[k] = v;
  }
  return out;
}

export function translate(locale: Locale, key: string, rawVars?: Record<string, MsgVar>): string {
  const vars = resolveRefs(locale, rawVars);
  if (vars && typeof vars.count === 'number') {
    const form = vars.count === 1 ? `${key}_one` : `${key}_other`;
    const p = lookup(locale, form) ?? lookup('en', form);
    if (p) return format(p, vars);
  }
  const s = lookup(locale, key) ?? lookup('en', key) ?? key;
  return format(s, vars);
}

/** Translate with the current locale. */
export function t(key: string, vars?: Record<string, MsgVar>): string {
  return translate(current, key, vars);
}

/**
 * An engine sentence (a refusal toast, a notice without a message key) in the current locale: French when the table has it
 * (engineFr.ts), otherwise the English the world sent. Never a raw key.
 */
export function engineText(s: string): string {
  return current === 'fr' ? (ENGINE_FR[s] ?? s) : s;
}

/** Render a server-made message descriptor (or plain legacy text). */
export function tm(m: Msg | string | undefined, fallback = ''): string {
  if (!m) return engineText(fallback);
  if (typeof m === 'string') return engineText(m);
  return t(m.key, m.vars);
}

export function hasKey(key: string): boolean {
  return key in DICTS.en;
}

interface LocaleStore {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

function readSaved(): Locale {
  try {
    const p = JSON.parse(window.localStorage.getItem('tg-prefs') ?? '{}') as { lang?: string };
    if (p.lang === 'fr' || p.lang === 'en') return p.lang;
    return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

/** Components read the locale from here so a switch re-renders them. */
export const useLocale = create<LocaleStore>((set) => ({
  locale: 'en',
  setLocale(locale) {
    current = locale;
    try {
      const p = JSON.parse(window.localStorage.getItem('tg-prefs') ?? '{}');
      window.localStorage.setItem('tg-prefs', JSON.stringify({ ...p, lang: locale }));
    } catch { /* private mode */ }
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
    set({ locale });
  },
}));

/** Call once on boot (client only). */
export function initLocale(): void {
  useLocale.getState().setLocale(readSaved());
}

/** Hook: re-render on locale change and get t bound to it. */
export function useT(): typeof t {
  useLocale((s) => s.locale);
  return t;
}
