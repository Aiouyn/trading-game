'use client';

// The collection page (6D.5): the owner's switch, the collectibles (limited and unique goods) and the streak badges and titles.
// A visitor sees the same list on the other player's profile, and only when that player has opened it (VisitSections).
import { useEffect, useState } from 'react';
import { useGame } from '@/game/store';
import { hasKey, t } from '@/i18n';
import { Card, CardHeader, Chip } from '@/components/ui';
import type { VisitPayload } from '@/net/protocol';
import type { CollectionView, HomeView } from '@/world/home';
import { VisibilitySwitch } from './VisibilitySwitch';

/** A badge or title's name from its i18n key, or the raw id when a key is missing. */
export function rewardName(kind: 'badge' | 'title', id: string): string {
  const key = kind === 'badge' ? `sixd.streak.badge.${id}` : `sixd.streak.title.${id}`;
  return hasKey(key) ? t(key) : id;
}

function classLabel(cls: string): string {
  return t(`boutique.cls.${cls}`);
}

/** The owner's collection card, at the top of the Boutique's Collection tab. */
export function CollectionOwnerCard() {
  const me = useGame((s) => s.me)!;
  const coll = me.sixd?.collection;
  if (!coll) return null;
  return (
    <Card data-testid="collection-page">
      <CardHeader
        title={t('sixd.coll.title')}
        sub={t('sixd.coll.intro')}
        right={<VisibilitySwitch surface="collection" on={me.sixd?.visibility.collection ?? false} />}
      />
      <div className="flex flex-col gap-3 px-4 pb-4">
        <CollectionList coll={coll} prefix="coll" />
      </div>
    </Card>
  );
}

/** The collectibles and rewards of a collection, shared by the owner's card and a visitor's view. */
function CollectionList({ coll, prefix }: { coll: CollectionView; prefix: string }) {
  return (
    <>
      <section aria-labelledby={`${prefix}-items`} className="flex flex-col gap-2">
        <h3 id={`${prefix}-items`} className="label">{t('sixd.coll.collectibles')}</h3>
        {coll.collectibles.length === 0
          ? <p className="text-caption text-fg-muted" data-testid={`${prefix}-none`}>{t('sixd.coll.none')}</p>
          : (
            <ul className="flex flex-wrap gap-2" data-testid={`${prefix}-items-list`}>
              {coll.collectibles.map((c) => (
                <li key={c.uid}>
                  <Chip className={c.cls === 'unique' ? 'border-brass/50 text-brass-hi' : 'border-info/50 text-info'}>
                    <span data-testid={`${prefix}-item-${c.itemId}`}>{c.name}</span>
                    <span className="ml-1 text-fg-faint">{classLabel(c.cls)}</span>
                  </Chip>
                </li>
              ))}
            </ul>
          )}
      </section>
      <section aria-labelledby={`${prefix}-badges`} className="flex flex-col gap-2">
        <h3 id={`${prefix}-badges`} className="label">{t('sixd.coll.badges')}</h3>
        {coll.badges.length === 0 && coll.titles.length === 0
          ? <p className="text-caption text-fg-muted" data-testid={`${prefix}-no-badges`}>{t('sixd.coll.noBadges')}</p>
          : (
            <ul className="flex flex-wrap gap-2 text-caption" data-testid={`${prefix}-badges-list`}>
              {coll.badges.map((b) => <li key={b}><Chip><span data-testid={`${prefix}-badge-${b}`}>{rewardName('badge', b)}</span></Chip></li>)}
              {coll.titles.map((x) => <li key={x}><Chip className="border-brass/50 text-brass-hi">{rewardName('title', x)}</Chip></li>)}
            </ul>
          )}
      </section>
    </>
  );
}

/** A slot grid of another player's home room, read-only. */
function HomeGrid({ home }: { home: HomeView }) {
  return (
    <div className="grid grid-cols-2 gap-2 @md:grid-cols-3" data-testid="visit-slots">
      {home.slots.map((s, i) => (
        <div key={i} className="min-w-0 rounded-md border border-ink-3 p-2" data-testid={`visit-slot-${i}`}>
          <span className="text-caption text-fg-faint">{t('sixd.home.slot', { n: i + 1 })}</span>
          <p className="truncate text-small text-fg">{s ? s.name : t('sixd.home.empty')}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * A visitor's view of another player's home room and collection, drawn on their profile. Each section appears only when its
 * owner has opened it; when neither is open, nothing is drawn and nothing says so.
 */
export function VisitSections({ playerId }: { playerId: string }) {
  const loadVisit = useGame((s) => s.loadVisit);
  const [data, setData] = useState<VisitPayload | null>(null);
  useEffect(() => {
    let live = true;
    void loadVisit(playerId).then((v) => { if (live) setData(v); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [playerId, loadVisit]);
  if (!data || (!data.home && !data.collection)) return null;
  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-ink-2 pt-4" data-testid="visit">
      {data.home && (
        <section aria-labelledby="visit-home-title" className="flex flex-col gap-2" data-testid="visit-home">
          <h3 id="visit-home-title" className="label">{t('sixd.home.title')}</h3>
          <HomeGrid home={data.home} />
        </section>
      )}
      {data.collection && (
        <section aria-labelledby="visit-coll-title" className="flex flex-col gap-2" data-testid="visit-collection">
          <h3 id="visit-coll-title" className="label">{t('sixd.coll.title')}</h3>
          <CollectionList coll={data.collection} prefix="visit" />
        </section>
      )}
    </div>
  );
}
