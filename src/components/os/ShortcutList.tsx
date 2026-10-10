'use client';

// Settings > Keys (DECISIONS "Behaviour gaps"): the shortcut list, read only. Remapping is Phase 8 (P2-106).
import { t } from '@/i18n';
import { SHORTCUTS } from '@/shell/keys';

export function ShortcutList() {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="shortcut-list-title" data-testid="settings-keys">
      <h3 id="shortcut-list-title" className="os-label">{t('shell.shortcuts')}</h3>
      <p className="text-caption text-fg-faint">{t('shell.shortcuts.hint')}</p>
      <ul className="flex flex-col divide-y divide-ink-2 rounded-lg border border-ink-3 bg-ink-1">
        {SHORTCUTS.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-2">
            <span className="text-small text-fg">{t(`shell.shortcut.${s.id}`)}</span>
            <kbd className="os-kbd">{s.keys}</kbd>
          </li>
        ))}
      </ul>
    </section>
  );
}
