'use client';

// Learn (Velvet 13, C-38; Phase 3 section 4): three tabs. Lessons are the ten two-minute lessons, each with one check in
// the client sandbox; Practice is the paper-money launcher (practice account, scenarios, the weekly challenge, run files);
// Glossary is every game term, searchable in the current language. Nothing here reads the save or orders in the live game.
import { useMemo, useState } from 'react';
import { t, useLocale } from '@/i18n';
import { Tabs, TextField } from '../ui';
import { LessonsView } from '@/components/apps/practice/LessonsView';
import { PracticeView } from '@/components/apps/practice/PracticeView';
import { GLOSSARY_IDS } from './glossary';

type LearnTab = 'lessons' | 'practice' | 'glossary';

export function LearnApp() {
  const [tab, setTab] = useState<LearnTab>('lessons');
  return (
    <div className="os-body" data-testid="learn">
      <Tabs
        tabs={[
          { id: 'lessons', label: t('learn.tab.lessons') },
          { id: 'practice', label: t('learn.tab.practice') },
          { id: 'glossary', label: t('learn.tab.glossary') },
        ]}
        value={tab}
        onChange={setTab}
        className="shrink-0"
      />
      {tab === 'lessons' && <LessonsView />}
      {tab === 'practice' && <PracticeView />}
      {tab === 'glossary' && <Glossary />}
    </div>
  );
}

function Glossary() {
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
    <section className="flex flex-col gap-2" aria-labelledby="learn-glossary-title" data-testid="learn-glossary-section">
      <h2 id="learn-glossary-title" className="text-body font-semibold text-fg">{t('learn.glossary')}</h2>
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
  );
}
