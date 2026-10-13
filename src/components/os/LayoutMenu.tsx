'use client';

// The layout menu on the shelf (P2-043, P2-018, V:70-76): the three built-in layouts, the saved custom
// layouts (five at most, built-ins do not count), and a field that saves the windows on this workspace
// under a name. A layout only moves windows. It never changes an order.
import { type FormEvent, useState } from 'react';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { MAX_LAYOUT_NAME } from '@/shell/apps';
import { applyNamedLayout, dispatchWm, notify, refusalText, useLayoutMenu, useShell } from './shellStore';

export function LayoutMenu() {
  const selected = useGame((s) => s.selected);
  const layouts = useShell((s) => s.shell.layouts);
  // Research places a research file: without one open on this workspace the entry is off, and says why (UX evaluation 6).
  const hasFile = useShell((s) => s.shell.wins.some((w) => w.app === 'research' && w.props.fileId !== undefined && w.ws === s.shell.activeWs));
  const [name, setName] = useState('');

  const apply = (n: string): void => {
    applyNamedLayout(n, selected);
    useLayoutMenu.setState({ open: false });
  };

  const save = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const clean = name.trim();
    const r = dispatchWm({ type: 'saveLayout', name: clean });
    if (r.ok) {
      notify(t('shell.layout.saved', { name: clean }));
      setName('');
      return;
    }
    const text = refusalText(r.reason);
    if (text) notify(text, 'warn');
  };

  return (
    <div className="os-menu" role="group" aria-label={t('shell.layout.menu')} data-testid="layout-menu">
      <button type="button" className="os-menu-item" data-testid="layout-trade" onClick={() => apply('trade')}>
        {t('shell.layout.trade')}
      </button>
      <button type="button" className="os-menu-item" data-testid="layout-review" onClick={() => apply('review')}>
        {t('shell.layout.review')}
      </button>
      <button
        type="button"
        className="os-menu-item"
        data-testid="layout-research"
        disabled={!hasFile}
        aria-describedby={hasFile ? undefined : 'layout-research-why'}
        onClick={() => apply('research')}
      >
        {t('shell.layout.research')}
      </button>
      {!hasFile && (
        <p id="layout-research-why" className="os-menu-hint" data-testid="layout-research-why">
          {t('shell.layout.researchNoFile')}
        </p>
      )}
      <p className="os-label mt-2">{t('shell.layout.custom')}</p>
      {layouts.length === 0 && <p className="text-caption text-fg-faint">{t('shell.layout.none')}</p>}
      {layouts.map((l, i) => (
        <button key={l.name} type="button" className="os-menu-item" data-testid={`layout-custom-${i + 1}`} onClick={() => apply(l.name)}>
          {l.name}
        </button>
      ))}
      <form onSubmit={save} className="mt-2 flex gap-2">
        <input
          className="os-menu-field"
          value={name}
          maxLength={MAX_LAYOUT_NAME}
          placeholder={t('shell.layout.namePlaceholder')}
          aria-label={t('shell.layout.namePlaceholder')}
          data-testid="layout-name"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="os-tool" data-testid="layout-save">
          {t('shell.layout.save')}
        </button>
      </form>
    </div>
  );
}
