'use client';

// The home room (6D.5): six slots for the owned goods the player places. Off to other players by default: the switch opens
// it to visitors (their profile card), and it shows nothing but the goods and their slots. Consumed experiences cannot go in a
// slot, since they do not stay, so they are not offered.
import { useState } from 'react';
import { LIFE_BY_ID } from '@/content/lifestyle';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Card, CardHeader, Select } from '@/components/ui';
import { refusalVars, sixdRefusal, type SixdRefusal } from './copy';
import { VisibilitySwitch } from './VisibilitySwitch';

/** The owned goods that can sit in a slot (everything but consumed experiences), by uid, with their names. */
export function placeableGoods(lifestyle: { uid: string; itemId: string }[]): { value: string; label: string }[] {
  return lifestyle.flatMap((o) => {
    const item = LIFE_BY_ID.get(o.itemId);
    return item && item.cls !== 'consumed' ? [{ value: o.uid, label: item.name }] : [];
  });
}

export function HomeRoomPanel() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const [refusal, setRefusal] = useState<SixdRefusal | null>(null);
  const home = me.sixd?.home;
  if (!home) return null;
  const goods = placeableGoods(me.player.lifestyle);
  const place = async (slot: number, uid: string) => {
    const r = await act({ type: 'home.place', slot, uid: uid === '' ? null : uid }, { silent: true });
    if (r.ok) setRefusal(null);
    else setRefusal(sixdRefusal(r.error ?? 'unknown', refusalVars(r.data)));
  };
  const placed = new Set(home.slots.flatMap((s) => (s ? [s.uid] : [])));
  const unplaced = goods.filter((g) => !placed.has(g.value)).length;
  return (
    <Card data-testid="home-room">
      <CardHeader title={t('sixd.home.title')} sub={t('sixd.home.intro')} right={<VisibilitySwitch surface="home" on={me.sixd?.visibility.home ?? false} />} />
      <div className="grid grid-cols-2 gap-3 px-4 pb-4 @md:grid-cols-3">
        {home.slots.map((s, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-2 rounded-md border border-ink-3 p-3" data-testid={`home-slot-${i}`}>
            <span className="text-caption text-fg-faint">{t('sixd.home.slot', { n: i + 1 })}</span>
            <span className="min-w-0 truncate text-small text-fg" data-testid={`home-slot-name-${i}`}>{s ? s.name : t('sixd.home.empty')}</span>
            <Select
              label={t('sixd.home.pick', { n: i + 1 })}
              value={s?.uid ?? ''}
              onChange={(uid) => void place(i, uid)}
              options={[{ value: '', label: t('sixd.home.empty') }, ...goods]}
              className="w-full"
              testId={`home-slot-select-${i}`}
            />
          </div>
        ))}
      </div>
      {goods.length === 0 && <p className="px-4 pb-4 text-caption text-fg-muted" data-testid="home-none">{t('sixd.home.none')}</p>}
      {goods.length > 0 && <p className="px-4 pb-4 text-caption text-fg-faint" data-testid="home-unplaced">{t('sixd.home.unplaced', { n: unplaced })}</p>}
      {refusal && (
        <div role="alert" className="mx-4 mb-4 rounded-chip border border-loss/40 p-3 text-caption" data-testid="home-refusal">
          <p className="font-semibold text-fg">{refusal.what}</p>
          <p className="text-fg-muted">{refusal.why}</p>
          <p className="text-fg-muted">{refusal.do}</p>
        </div>
      )}
    </Card>
  );
}
