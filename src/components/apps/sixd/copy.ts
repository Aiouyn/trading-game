import { hasKey, t } from '@/i18n';

/** A refusal in three parts: what happened, why, and what to do (the same shape as the other apps' refusals). */
export interface SixdRefusal {
  what: string;
  why: string;
  do: string;
}

/**
 * The copy of a 6D refusal code (insurance, auction, streak, tournament, home). The world gives the code and its numbers in
 * `data`; the client turns them into the three parts here. An unknown code falls back to the generic refusal.
 */
export function sixdRefusal(code: string, vars: Record<string, string | number> = {}): SixdRefusal {
  const base = `sixd.refuse.${code}`;
  if (!hasKey(`${base}.what`)) {
    return { what: t('sixd.refuse.unknown.what'), why: t('sixd.refuse.unknown.why'), do: t('sixd.refuse.unknown.do') };
  }
  return { what: t(`${base}.what`, vars), why: t(`${base}.why`, vars), do: t(`${base}.do`, vars) };
}

/** The numbers a refusal carries, read from the command's data (strings and numbers only). */
export function refusalVars(data: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v === 'number' || typeof v === 'string') out[k] = v;
    }
  }
  return out;
}

/** The rank's display name, from the rank key the world names (a refusal's `rank` is a rank id). */
export function rankName(id: string | number | undefined): string {
  return typeof id === 'string' && hasKey(`rank.${id}`) ? t(`rank.${id}`) : String(id ?? '');
}
