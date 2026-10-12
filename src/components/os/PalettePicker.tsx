'use client';

// Palette choice (P2-175, P2-184): saved per device, and the choice is made by the player only; nothing switches by itself.
// Each button names its palette and its one-line character. The three accent palettes are earned on the daily streak (6D.4,
// streak.ts milestones at 3, 7 and 14 days): until the player holds the accent, its button is shown disabled with the streak
// it needs. Ink & Brass, the default, is always open.
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { paletteLocked, paletteStreakDays, PALETTE_KEYS, PALETTE_SLUGS, type PaletteSlug } from './palette';
import { usePalette } from './shellStore';

const NO_ACCENTS: readonly string[] = [];

export function PalettePicker() {
  const current = usePalette((s) => s.palette);
  const setPalette = usePalette((s) => s.setPalette);
  const accents = useGame((s) => s.me?.sixd?.streak?.accents ?? NO_ACCENTS);
  return (
    <section className="flex flex-col gap-2" aria-labelledby="palette-picker-title" data-testid="palette-picker">
      <h3 id="palette-picker-title" className="os-label">{t('settings.palette')}</h3>
      <p className="text-caption text-fg-faint">{t('settings.palette.hint')}</p>
      <div className="os-choices">
        {PALETTE_SLUGS.map((slug: PaletteSlug) => {
          const days = paletteStreakDays(slug);
          const locked = paletteLocked(slug, accents);
          return (
            <button
              key={slug}
              type="button"
              aria-pressed={current === slug}
              disabled={locked}
              onClick={() => setPalette(slug)}
              className={`os-choice ${current === slug ? 'text-brass' : ''}`}
              data-testid={`palette-${slug}`}
              data-locked={locked ? 'true' : 'false'}
            >
              <span className="text-body text-fg">{t(PALETTE_KEYS[slug].name)}</span>
              <span className="text-caption text-fg-muted">
                {locked && days !== null ? t('settings.palette.locked', { days }) : t(PALETTE_KEYS[slug].line)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
