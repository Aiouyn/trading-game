'use client';

// Palette choice (P2-175, P2-184): four free palettes, saved per device. The choice is made by the
// player only; nothing switches by itself. Each button names its palette and its one-line character.
import { t } from '@/i18n';
import { PALETTE_KEYS, PALETTE_SLUGS, type PaletteSlug } from './palette';
import { usePalette } from './shellStore';

export function PalettePicker() {
  const current = usePalette((s) => s.palette);
  const setPalette = usePalette((s) => s.setPalette);
  return (
    <section className="flex flex-col gap-2" aria-labelledby="palette-picker-title" data-testid="palette-picker">
      <h3 id="palette-picker-title" className="os-label">{t('settings.palette')}</h3>
      <p className="text-caption text-fg-faint">{t('settings.palette.hint')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {PALETTE_SLUGS.map((slug: PaletteSlug) => (
          <button
            key={slug}
            type="button"
            aria-pressed={current === slug}
            onClick={() => setPalette(slug)}
            className={`os-tool flex-col items-start gap-0.5 py-2 text-left ${current === slug ? 'text-brass' : ''}`}
          >
            <span className="text-body text-fg">{t(PALETTE_KEYS[slug].name)}</span>
            <span className="text-caption text-fg-muted">{t(PALETTE_KEYS[slug].line)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
