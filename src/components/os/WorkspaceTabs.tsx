'use client';

// Workspaces as tabs in the top bar (UX redesign stage 2, item 1). Each tab is a workspace: its windows stay with it,
// and switching is one click (the reducer's switchWs, which the keyboard shortcuts also use). A workspace the rank has
// not unlocked is shown disabled with the unlock note. The windows of a workspace are the wm.ts ones (ws index).
import { t } from '@/i18n';
import { useShell, dispatchWm } from './shellStore';

/** The workspace names in order. Index 0 is Trade (the Broker desk); the rank sets how many are open (ctx.workspaces). */
export const WORKSPACE_NAMES = ['trade', 'portfolio', 'empire'] as const;

export function WorkspaceTabs() {
  const activeWs = useShell((s) => s.shell.activeWs);
  const count = useShell((s) => s.ctx.workspaces);
  return (
    <div className="os-wstabs os-soft" role="tablist" aria-label={t('shell.workspaces')} data-testid="ws-tabs">
      {WORKSPACE_NAMES.map((name, n) => {
        const open = n < count;
        const on = n === activeWs;
        return (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={!open}
            title={open ? t(`shell.ws.${name}`) : t('shell.ws.locked')}
            data-testid={`ws-${n}`}
            data-ws={name}
            className={`os-wstab${on ? ' on' : ''}`}
            onClick={() => dispatchWm({ type: 'switchWs', ws: n })}
          >
            {t(`shell.ws.${name}`)}
          </button>
        );
      })}
    </div>
  );
}
