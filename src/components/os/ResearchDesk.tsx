'use client';

// Research Desk shell (Velvet 7, velvet-research-desk.md; R3 Operator). The desk's content (the "why it
// moved" files, the query bar, the dossier) is Phase 3. Until then the Files list is empty and the note
// says so: this screen never shows sample or made-up files. A file id changes nothing here, so a link to
// a file this save does not have gets the same answer as any other (P2-116).
import { t } from '@/i18n';
import { useShell } from './shellStore';

/** Research files arrive with the research desk (Phase 3). There are none yet, so the list holds nothing. */
const FILES: readonly string[] = [];

export function ResearchDesk() {
  const unlocked = useShell((s) => s.ctx.unlocked);
  const open = unlocked('research');
  return (
    <div className="os-body" data-testid="research">
      <p className="text-small text-fg-muted">{t('research.intro')}</p>
      {!open && (
        <p className="text-small text-fg-muted" data-testid="research-locked">{t('research.locked', { rank: t('rank.R3') })}</p>
      )}
      <section className="flex flex-col gap-2" aria-labelledby="research-files-title">
        <h2 id="research-files-title" className="os-label">{t('research.files')}</h2>
        {FILES.length === 0 ? (
          <p className="text-small text-fg-muted" data-testid="research-files-empty">{t('research.files.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-ink-2 rounded-lg border border-ink-3 bg-ink-1" data-testid="research-files">
            {FILES.map((f) => (
              <li key={f} className="px-4 py-3 text-small text-fg">{f}</li>
            ))}
          </ul>
        )}
        <p className="text-caption text-fg-faint" data-testid="research-note">{t('research.note')}</p>
      </section>
    </div>
  );
}
