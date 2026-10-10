'use client';

// A refused shop change, in its three parts: what happened, why, and what the owner can do (Phase 4 stage C).
import { t } from '@/i18n';
import { refusalKeys } from './shopPlan';

export function ShopRefusal({ code, vars, testId }: { code: string; vars: Record<string, string | number>; testId?: string }) {
  const k = refusalKeys(code);
  return (
    <div role="alert" data-testid={testId} data-code={code} className="rounded-md border border-loss/50 bg-loss/5 p-3">
      <p className="text-small font-medium text-fg">{t(k.what, vars)}</p>
      <p className="mt-1 text-caption text-fg-muted">{t(k.why, vars)}</p>
      <p className="mt-1 text-caption text-fg-muted">{t(k.do, vars)}</p>
    </div>
  );
}
