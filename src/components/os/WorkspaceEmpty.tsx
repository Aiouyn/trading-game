'use client';

// An empty workspace says so (UX evaluation 12). It offers the window that is minimized back, or opens the workspace's own app
// when none is minimized. Only a workspace with no open window shows it.
import { t } from '@/i18n';
import { APPS, WORKSPACE_DEFAULT_APP } from '@/shell/apps';
import { openApp, dispatchWm, useFocusHint, useShell } from './shellStore';

export function WorkspaceEmpty() {
  const shell = useShell((s) => s.shell);
  const ctx = useShell((s) => s.ctx);
  if (shell.wins.some((w) => w.ws === shell.activeWs && w.state === 'open')) return null;
  const back = shell.wins.find((w) => w.state === 'collapsed');
  const app = WORKSPACE_DEFAULT_APP[shell.activeWs] ?? null;
  const openable = back === undefined && app !== null && ctx.unlocked(app);
  return (
    <div className="os-wsempty" data-testid="ws-empty" role="status">
      <p>{t('shell.ws.empty')}</p>
      {back !== undefined && (
        <button
          type="button"
          className="os-tool"
          data-testid="ws-empty-restore"
          onClick={() => {
            dispatchWm({ type: 'restore', id: back.id });
            useFocusHint.setState({ id: back.id });
          }}
        >
          {t('shell.tray.restore', { name: t(APPS[back.app].titleKey) })}
        </button>
      )}
      {openable && app !== null && (
        <button
          type="button"
          className="os-tool"
          data-testid="ws-empty-open"
          onClick={() => openApp(app, {}, { focus: true })}
        >
          {t('shell.ws.open', { name: t(APPS[app].titleKey) })}
        </button>
      )}
    </div>
  );
}
