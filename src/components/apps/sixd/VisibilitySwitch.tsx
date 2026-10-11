'use client';

// One opt-in public switch (6D.5): the home room or the collection. Off by default; the state is the owner's and the world
// keeps it. A switch shows its state in words as well as on the control, so the colour is never the only signal.
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Chip } from '@/components/ui';

export function VisibilitySwitch({ surface, on }: { surface: 'home' | 'collection'; on: boolean }) {
  const act = useGame((s) => s.act);
  const label = surface === 'home' ? t('sixd.vis.home') : t('sixd.vis.collection');
  return (
    <div className="flex max-w-full flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => void act({ type: 'visibility.set', surface, on: !on }, { silent: true })}
        className={`flex min-h-9 items-center gap-2 rounded-chip border px-3 py-1 text-caption ${on ? 'border-brass/60 text-brass-hi' : 'border-ink-3 text-fg-muted'}`}
        data-testid={`${surface}-visibility`}
        data-on={on ? 'on' : 'off'}
      >
        <span>{label}</span>
        <Chip><span data-testid={`${surface}-visibility-state`}>{on ? t('sixd.vis.on') : t('sixd.vis.off')}</span></Chip>
      </button>
      <span className="text-caption text-fg-faint">{t('sixd.vis.hint')}</span>
    </div>
  );
}
