'use client';

// Learn (Velvet 13, C-38): the glossary of every game term the screens use, searchable in the current
// language, and the lesson slots that arrive in Phase 3. Nothing here reads the save or orders anything.
import { useMemo, useState } from 'react';
import { t, useLocale } from '@/i18n';
import { TextField } from '../ui';
import { GLOSSARY_IDS, LESSON_SLOTS } from './glossary';

export function LearnApp() {
  const locale = useLocale((s) => s.locale);
  const [query, setQuery] = useState('');
  // The rows hold translated text, so they depend on the language as well as the query.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GLOSSARY_IDS.map((id) => ({ id, name: t(`learn.term.${id}.name`), def: t(`learn.term.${id}.def`) }))
      .filter((r) => q === '' || r.name.toLowerCase().includes(q) || r.def.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [query, locale]);

  return (
    <div className="os-body" data-testid="learn">
      <section className="flex flex-col gap-2" aria-labelledby="learn-glossary-title">
        <h2 id="learn-glossary-title" className="font-serif text-title text-fg">{t('learn.glossary')}</h2>
        <TextField value={query} onChange={setQuery} placeholder={t('learn.search')} testId="learn-search" />
        {rows.length === 0 ? (
          <p className="text-small text-fg-muted" data-testid="learn-empty">{t('learn.empty')}</p>
        ) : (
          <dl className="flex flex-col divide-y divide-ink-2 rounded-lg border border-ink-3 bg-ink-1" data-testid="learn-glossary">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 px-4 py-3" data-testid={`learn-term-${r.id}`}>
                <dt className="text-small font-semibold text-fg">{r.name}</dt>
                <dd className="text-caption text-fg-muted">{r.def}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="learn-lessons-title" data-testid="learn-lessons">
        <h2 id="learn-lessons-title" className="font-serif text-title text-fg">{t('learn.lessons')}</h2>
        <p className="text-caption text-fg-faint">{t('learn.lessons.hint')}</p>
        <ul className="flex flex-col divide-y divide-ink-2 rounded-lg border border-ink-3 bg-ink-1">
          {LESSON_SLOTS.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`learn-lesson-${s.id}`}>
              <span className="text-small text-fg">{t(s.title)}</span>
              <span className="text-caption text-fg-faint">{t('learn.soon')}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
