'use client';

// Settings (Velvet 12, P2-175..P2-208). Per device: the palette (free, never sold), the language (saved in
// tg-prefs), and reduce motion. Then the read-only keys list, the profile and the account (moved from the
// old Profile screen), and About with the credits and the intro replay. The view 'about' shows About alone,
// and /credits lands there (P2-119).
import { useState } from 'react';
import { LOCALES, t, useLocale } from '@/i18n';
import { useGame } from '@/game/store';
import { AccountView, ProfileView } from '@/components/Profile';
import { About } from './About';
import { PalettePicker } from './PalettePicker';
import { ShortcutList } from './ShortcutList';
import { useMotion } from './shellStore';

/** Settings > Language. The choice is saved in tg-prefs (the i18n layer) and re-renders the whole tree. */
function LanguagePicker() {
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  return (
    <section className="flex flex-col gap-2" aria-labelledby="language-picker-title" data-testid="settings-language">
      <h3 id="language-picker-title" className="os-label">{t('settings.language')}</h3>
      <p className="text-caption text-fg-faint">{t('settings.language.hint')}</p>
      <div className="os-choices" role="group" aria-labelledby="language-picker-title">
        {LOCALES.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`os-choice ${locale === l.id ? 'text-brass' : ''}`}
            aria-pressed={locale === l.id}
            data-testid={`settings-lang-${l.id}`}
            onClick={() => setLocale(l.id)}
          >
            {l.name}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Settings > Reduce motion. A change applies at once. When the system already asks for less, it is locked on. */
function MotionToggle() {
  const reduced = useMotion((s) => s.reduced);
  const setReduced = useMotion((s) => s.setReduced);
  const system = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const on = system || reduced === true;
  return (
    <section className="flex flex-col gap-2" data-testid="settings-motion">
      <label className="flex min-h-11 items-center gap-2 text-small text-fg">
        <input
          type="checkbox"
          checked={on}
          disabled={system}
          data-testid="settings-motion-toggle"
          onChange={(e) => setReduced(e.target.checked)}
        />
        {t('settings.motion')}
      </label>
      <p className="text-caption text-fg-faint">{system ? t('settings.motion.system') : t('settings.motion.hint')}</p>
    </section>
  );
}

/** Settings > Goals. Off by default. Turning it on shows the goal ladder on Portfolio and under the home widget; it is a server setting on the player's record. */
function GoalsToggle() {
  const ready = useGame((s) => !!s.me);
  const on = useGame((s) => !!s.me?.trading.goals.optIn);
  const act = useGame((s) => s.act);
  // the box shows the learner's choice at once; the server's answer then takes over (and a refusal puts it back)
  const [choice, setChoice] = useState<boolean | null>(null);
  const checked = choice ?? on;
  return (
    <section className="flex flex-col gap-2" data-testid="settings-goals">
      <label className="flex min-h-11 items-center gap-2 text-small text-fg">
        <input
          type="checkbox"
          checked={checked}
          disabled={!ready}
          data-testid="settings-goals-toggle"
          onChange={(e) => {
            const next = e.target.checked;
            setChoice(next);
            void act({ type: 'goals.optIn', on: next }, { silent: true }).then(() => setChoice(null));
          }}
        />
        {t('settings.goals')}
      </label>
      <p className="text-caption text-fg-faint">{t('settings.goals.hint')}</p>
    </section>
  );
}

export function SettingsView({ view }: { view?: string }) {
  if (view === 'about') {
    return (
      <div className="os-body">
        <About />
      </div>
    );
  }
  return (
    <div className="os-body" data-testid="settings">
      <PalettePicker />
      <LanguagePicker />
      <MotionToggle />
      <GoalsToggle />
      <ShortcutList />
      <ProfileView />
      <AccountView />
      <About />
    </div>
  );
}
