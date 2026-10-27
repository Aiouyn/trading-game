// C-16 scope (pure): which branches the Spec 2 path check applies to, and its verdict.
// Spec 2 §1 ownership. package.json / package-lock.json and the city workflow are approved
// exceptions (Producer).

export const OWNED = [/^src\/city\//, /^public\/city\//, /^tests\/unit\/city\//, /^tests\/e2e\/city\//, /^docs\/city\//];
// next.config.ts: the NEXT_PUBLIC_CITY_E2E define (Producer-authorized, prod hook leak);
// playwright.config.ts: NEXT_PUBLIC_CITY_E2E=1 in the app e2e build env (Producer, #32 re-gate).
export const APPROVED_EXCEPTIONS = new Set(['package.json', 'package-lock.json', '.github/workflows/city.yml', 'next.config.ts', 'playwright.config.ts']);

/** City Dev's branches: v3/city-* and city/*. Every other branch belongs to someone else. */
export const isCityBranch = (branch: string): boolean => /^(v3\/city-|city\/)/.test(branch.replace(/^refs\/heads\//, ''));

export type C16Verdict =
  | { status: 'pass' }
  | { status: 'fail'; outside: string[] }
  | { status: 'skip'; reason: string };

export function c16Verdict(branch: string | null, changed: readonly string[]): C16Verdict {
  if (!branch) return { status: 'skip', reason: 'C-16: branch unknown (no GITHUB_HEAD_REF, GITHUB_REF_NAME or git branch)' };
  if (!isCityBranch(branch)) return { status: 'skip', reason: `C-16: '${branch}' is not a City Dev branch (v3/city-*, city/*); not checked` };
  const outside = [...new Set(changed)].filter((p) => p && !APPROVED_EXCEPTIONS.has(p) && !OWNED.some((r) => r.test(p)));
  return outside.length ? { status: 'fail', outside } : { status: 'pass' };
}

/** The branch under test: GITHUB_HEAD_REF (PRs), then GITHUB_REF_NAME, then git. */
export function currentBranch(env: Record<string, string | undefined>, git: () => string | null): string | null {
  const fromEnv = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
  if (fromEnv) return fromEnv;
  const b = git();
  return b && b !== 'HEAD' ? b : null;
}
