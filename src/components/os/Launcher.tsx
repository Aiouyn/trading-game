'use client';

// The launcher (P2-075..P2-080, V:101): a 640 px panel under the strip, opened by Ctrl K or the strip field.
// It searches apps, tickers, commands and this session's recent items. Up and Down move the highlight,
// Enter runs the row, Escape closes it. It never places an order: a ticker row opens a Broker, and only
// the Broker's own Enter sends one (P2-079). It mounts only while open, so it does not follow the tick.
import { type KeyboardEvent, useEffect, useMemo, useRef } from 'react';
import { seriesInfo } from '@/components/Market';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { price, signedPct, tone, toneText } from '@/game/format';
import { APP_IDS, APPS, type AppId } from '@/shell/apps';
import { layoutMode } from '@/shell/geometry';
import {
  type LauncherCommand,
  type LauncherGroup,
  type LauncherItem,
  type LauncherKind,
  type LauncherSource,
  flatItems,
  resultId,
  searchLauncher,
} from '@/shell/launcher';
import { APP_GLYPH } from './appMap';
import { Glyph } from './glyphs';
import { closeLauncher, openApp, runCommand, useLauncher, useRecent, useShell } from './shellStore';

const GROUP_KEY: Record<LauncherKind, string> = {
  app: 'shell.launch.apps',
  ticker: 'shell.launch.tickers',
  command: 'shell.launch.commands',
  recent: 'shell.launch.recent',
};

/** Opens the launcher while it is closed. The panel itself mounts only when open. */
export function Launcher() {
  const open = useLauncher((s) => s.open);
  return open ? <LauncherPanel /> : null;
}

function LauncherPanel() {
  const query = useLauncher((s) => s.query);
  const active = useLauncher((s) => s.active);
  const ctx = useShell((s) => s.ctx);
  const vpW = useShell((s) => s.shell.vp.w);
  const config = useGame((s) => s.config);
  const world = useGame((s) => s.world);
  const me = useGame((s) => s.me);
  const selected = useGame((s) => s.selected);
  const recent = useRecent((s) => s.items);
  const inputRef = useRef<HTMLInputElement>(null);

  const wide = layoutMode(vpW) === 'full';
  const rankId = me?.rank.id ?? 'R0';
  const watchlist = me?.player.watchlist;

  // Built from the facts once per open panel and per tick of the world (prices), never per keystroke.
  const source = useMemo<LauncherSource>(() => {
    const watch = watchlist ?? [];
    const apps = APP_IDS.filter((a) => APPS[a].available && !(APPS[a].hideWhenLocked && !ctx.unlocked(a))).map((a) => {
      const locked = !ctx.unlocked(a);
      return {
        app: a,
        name: t(APPS[a].titleKey),
        locked,
        sub: locked ? t('shell.launch.opensAt', { rank: t(`rank.${APPS[a].minRank ?? 'R0'}`) }) : undefined,
      };
    });
    const listed = config.assets.filter((a) => a.listed !== false).map((a) => a.id);
    const ordered = [...watch.filter((id) => listed.includes(id)), ...listed.filter((id) => !watch.includes(id))];
    const tickers = ordered.map((id) => {
      const def = config.assets.find((a) => a.id === id)!;
      let info: { price: number; changePct: number } | undefined;
      if (world !== null) {
        try {
          const s = seriesInfo(world, id, rankId);
          info = { price: s.price, changePct: s.changePct };
        } catch {
          info = undefined;
        }
      }
      return { id, name: def.name, price: info?.price, changePct: info?.changePct };
    });
    const commands: { cmd: LauncherCommand; label: string }[] = [
      ...(wide
        ? [
            { cmd: 'trade' as const, label: t('shell.cmd.trade') },
            { cmd: 'review' as const, label: t('shell.cmd.review') },
            { cmd: 'research' as const, label: t('shell.cmd.research') },
          ]
        : []),
      { cmd: 'focus', label: t('shell.cmd.focus') },
      { cmd: 'new-broker', label: t('shell.cmd.newBroker') },
    ];
    return {
      apps,
      tickers,
      commands,
      recent: recent.map((r) => ({ app: r.app, ticker: r.ticker, label: r.ticker ?? t(APPS[r.app].titleKey) })),
    };
  }, [ctx, config, world, rankId, watchlist, wide, recent]);

  const groups: LauncherGroup[] = searchLauncher(query, source);
  const items = flatItems(groups);
  const index = new Map(items.map((it, i) => [it, i] as const));
  const cur = items.length === 0 ? undefined : items[Math.min(active, items.length - 1)];

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // The highlighted row stays in view as the arrow keys move through a long list.
  const curId = cur !== undefined ? resultId(cur) : null;
  useEffect(() => {
    if (curId !== null) document.getElementById(curId)?.scrollIntoView?.({ block: 'nearest' });
  }, [curId]);

  const run = (item: LauncherItem): void => {
    // The window that opens takes focus, so the launcher does not hand focus back to the strip.
    closeLauncher(false);
    const a = item.action;
    if (a.type === 'app') {
      openApp(a.app, a.app === 'broker' ? { ticker: selected } : {}, { focus: true });
    } else if (a.type === 'ticker') {
      openApp('broker', { ticker: a.ticker }, { focus: true });
    } else if (a.type === 'command') {
      runCommand(a.cmd, selected);
    } else {
      const props = a.ticker !== undefined ? { ticker: a.ticker } : a.app === 'broker' ? { ticker: selected } : {};
      openApp(a.app as AppId, props, { focus: true });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeLauncher();
      return;
    }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (items.length === 0) return;
      const step = e.code === 'ArrowDown' ? 1 : -1;
      useLauncher.setState({ active: (Math.min(active, items.length - 1) + step + items.length) % items.length });
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (cur !== undefined) run(cur);
    }
  };

  return (
    <>
      <div className="os-launcher-scrim" aria-hidden onMouseDown={() => closeLauncher()} />
      <div className="os-launcher" data-testid="os-launcher">
        <input
          ref={inputRef}
          className="os-launcher-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="os-launcher-list"
          aria-autocomplete="list"
          aria-activedescendant={cur !== undefined ? resultId(cur) : undefined}
          aria-label={t('shell.launch.label')}
          placeholder={t('shell.launch.placeholder')}
          value={query}
          autoComplete="off"
          spellCheck={false}
          data-testid="os-launcher-input"
          onChange={(e) => useLauncher.setState({ query: e.target.value, active: 0 })}
          onKeyDown={onKeyDown}
        />
        <div id="os-launcher-list" role="listbox" aria-label={t('shell.launch.label')} className="os-launcher-list" data-testid="os-launcher-list">
          {groups.map((g) => (
            <div key={g.kind} role="group" aria-label={t(GROUP_KEY[g.kind])}>
              <div className="os-launcher-group os-label" aria-hidden>
                {t(GROUP_KEY[g.kind])}
              </div>
              {g.items.map((it) => {
                const i = index.get(it) ?? 0;
                return (
                  <div
                    key={resultId(it)}
                    id={resultId(it)}
                    role="option"
                    aria-selected={cur === it}
                    aria-disabled={it.locked || undefined}
                    data-testid={resultId(it)}
                    className={`os-launcher-row${it.locked ? ' locked' : ''}`}
                    onMouseEnter={() => useLauncher.setState({ active: i })}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => run(it)}
                  >
                    {it.kind === 'app' && it.action.type === 'app' && <Glyph name={APP_GLYPH[it.action.app]} size={16} />}
                    <span className={it.locked ? 'text-fg-disabled' : 'text-fg'}>{it.label}</span>
                    {it.sub !== undefined && <span className="text-caption text-fg-faint">{it.sub}</span>}
                    {it.price !== undefined && (
                      <span className="os-launcher-price">
                        {price(it.price)}{' '}
                        <span className={toneText[tone(it.changePct ?? 0)]}>{signedPct(it.changePct ?? 0)}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {items.length === 0 && (
            <p role="status" className="os-launcher-group text-caption text-fg-muted">
              {t('shell.launch.empty')}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
