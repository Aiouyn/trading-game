'use client';

// The lock screen for an app below its rank. The rank comes from APPS[app].minRank (src/shell/apps.ts),
// the one source the shelf tile and the launcher use too, so the three never disagree.
import { RANKS, rankIndex } from '@/content/lifestyle';
import { compactMoney } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { APPS, type AppId } from '@/shell/apps';
import { Locked } from '@/components/ui';

export function AppLocked({ app, copy }: { app: AppId; copy: (rank: string, amount: string) => string }) {
  const me = useGame((s) => s.me)!;
  const need = RANKS.find((r) => r.id === APPS[app].minRank) ?? RANKS[0]!;
  // The bar fills only when the next rank is the one that unlocks the app.
  const progress = rankIndex(me.player.rankId) === rankIndex(need.id) - 1 ? me.rank.progress : 0;
  return (
    <div data-testid={`locked-${app}`}>
      <Locked what={t(APPS[app].titleKey)} need={copy(t(`rank.${need.id}`), compactMoney(need.threshold))} progress={progress} />
    </div>
  );
}
