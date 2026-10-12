'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { AdminStatus } from '../../../server/admin';
import { worldHttpUrl } from '@/net/client';
import { initLocale, useT } from '@/i18n';

/**
 * The admin page (lead-phase8.md P8-3): the world's readouts and two actions, behind the admin token. The token is typed once and
 * kept in this page's memory only (never in storage), so a reload asks for it again. The page reads the player's saved language
 * (tg-prefs) and every string is an i18n key (P8-4 sweep).
 */

const POLL_MS = 5000;

interface Reply {
  code: number;
  data: Record<string, unknown>;
}

type T = ReturnType<typeof useT>;

async function call(path: string, token: string, method: 'GET' | 'POST', body?: unknown): Promise<Reply> {
  const r = await fetch(`${worldHttpUrl()}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { code: r.status, data };
}

function size(t: T, n: number): string {
  return n >= 1024 * 1024 ? t('admin.size.mb', { n: (n / (1024 * 1024)).toFixed(1) }) : t('admin.size.kb', { n: (n / 1024).toFixed(0) });
}

function ms(n: number | null): string {
  return n === null ? '–' : `${n.toFixed(1)} ms`;
}

function when(at: number): string {
  return new Date(at).toLocaleString();
}

function kind(t: T, k: string): string {
  return ['hourly', 'daily', 'shutdown', 'manual'].includes(k) ? t(`admin.kind.${k}`) : k;
}

const card: CSSProperties = { border: '1px solid #8884', borderRadius: 8, padding: '12px 14px', minWidth: 0 };
const label: CSSProperties = { fontSize: 12, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.4 };
const big: CSSProperties = { fontSize: 22, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' };
const button: CSSProperties = { padding: '8px 14px', borderRadius: 6, border: '1px solid #888', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };

export default function AdminPage() {
  const t = useT();
  const [token, setToken] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    initLocale();
  }, []);

  const load = useCallback(async (tok: string) => {
    try {
      const r = await call('/api/admin/status', tok, 'GET');
      if (r.code === 403) {
        setToken(null);
        setStatus(null);
        setError(t('admin.token.wrong'));
        return;
      }
      if (r.code !== 200) {
        setError(t('admin.world.answered', { code: r.code }));
        return;
      }
      setStatus(r.data as unknown as AdminStatus);
      setError(null);
    } catch {
      setError(t('admin.world.unreachable', { url: worldHttpUrl() }));
    }
  }, [t]);

  // the first read happens where the token is typed (onSubmit below); this only keeps the readouts fresh
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => void load(token), POLL_MS);
    return () => clearInterval(id);
  }, [token, load]);

  const act = async (path: string, body: unknown, done: (r: Reply) => string) => {
    if (!token || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await call(path, token, 'POST', body);
      if (r.code === 403) {
        setToken(null);
        setError(t('admin.token.refused'));
      } else if (r.code !== 200) {
        setNote(String(r.data.error ?? t('admin.world.answered', { code: r.code })));
      } else {
        setNote(done(r));
      }
      if (token) await load(token);
    } catch {
      setNote(t('admin.world.unreachable', { url: worldHttpUrl() }));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 22, margin: '24px 0 8px' }}>{t('admin.title')}</h1>
        <p style={{ opacity: 0.8, margin: '0 0 16px' }}>{t('admin.token.prompt')}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const tok = typed.trim();
            if (!tok) return;
            setTyped('');
            setToken(tok);
            setError(null);
            void load(tok);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <label htmlFor="admin-token" style={label}>{t('admin.token.label')}</label>
          <input
            id="admin-token"
            data-testid="admin-token"
            type="password"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #888', font: 'inherit', background: 'transparent', color: 'inherit', minWidth: 0 }}
          />
          <button type="submit" data-testid="admin-token-submit" style={button}>{t('admin.token.open')}</button>
        </form>
        {error ? <p data-testid="admin-error" role="alert" style={{ color: '#c33', marginTop: 12 }}>{error}</p> : null}
        <p style={{ marginTop: 24 }}><Link href="/">{t('admin.back')}</Link></p>
      </main>
    );
  }

  const s = status;
  return (
    <main data-testid="admin-status" style={{ maxWidth: 1040, margin: '0 auto', padding: 16, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between', margin: '12px 0 16px' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{t('admin.title')}</h1>
        <Link href="/">{t('admin.back')}</Link>
      </header>

      {error ? <p data-testid="admin-error" role="alert" style={{ color: '#c33' }}>{error}</p> : null}
      {!s && !error ? <p>{t('admin.loading')}</p> : null}

      {s ? (
        <>
          <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <div style={card} data-testid="admin-world">
              <div style={label}>{t('admin.tick.label')}</div>
              <div style={big} data-testid="admin-tick">{s.world.tick}</div>
              <div>{t('admin.tick.line', { day: s.world.day, state: s.world.paused ? t('admin.state.paused') : t('admin.state.running'), ms: s.world.tickMs })}</div>
            </div>
            <div style={card} data-testid="admin-players">
              <div style={label}>{t('admin.players.label')}</div>
              <div style={big} data-testid="admin-online">{t('admin.players.online', { n: s.players.online })}</div>
              <div>{t('admin.players.counts', { registered: s.players.registered, inWorld: s.players.inWorld })}</div>
            </div>
            <div style={card} data-testid="admin-ticks">
              <div style={label}>{t('admin.ticks.label')}</div>
              <div style={big}>{t('admin.ticks.p50', { ms: ms(s.ticks.p50Ms) })}</div>
              <div>{t('admin.ticks.p99', { ms: ms(s.ticks.p99Ms), n: s.ticks.lastHour })}</div>
            </div>
            <div style={card} data-testid="admin-db">
              <div style={label}>{t('admin.db.label')}</div>
              <div style={big}>{size(t, s.database.bytes)}</div>
            </div>
            <div style={card} data-testid="admin-tournament">
              <div style={label}>{t('admin.tournament.label')}</div>
              <div style={big}>{s.tournament.running === null ? t('admin.tournament.idle') : t('admin.tournament.running', { week: s.tournament.running })}</div>
              <div>{s.tournament.retryInMs > 0 ? t('admin.tournament.retry', { s: Math.ceil(s.tournament.retryInMs / 1000) }) : t('admin.tournament.noRetry')}</div>
            </div>
          </section>

          <section style={{ ...card, marginTop: 12 }} data-testid="admin-text">
            <div style={label}>{t('admin.text.label')}</div>
            <p style={{ margin: '6px 0' }}>
              {s.text.enabled ? t('admin.text.on', { provider: s.text.provider ?? '', model: s.text.model ?? '' }) : t('admin.text.off')}
              {' · '}{t('admin.text.roles', { roles: s.text.roles.length, overlay: s.text.overlaySize })}
            </p>
            <p style={{ margin: '6px 0' }}>
              {t('admin.text.calls', { calls: s.text.calls, hits: s.text.hits, fallbacks: s.text.fallbacks, cap: s.text.stops.cap, rate: s.text.stops.rate })}
            </p>
            <p style={{ margin: '6px 0' }}>
              {t('admin.text.spent', { spent: `$${s.text.spentToday.toFixed(2)}`, cap: `$${s.text.dailyUsdCap.toFixed(2)}`, reserved: `$${s.text.reservedToday.toFixed(2)}`, day: s.text.day })}
            </p>
            <p style={{ margin: '6px 0', opacity: 0.8 }}>
              {t('admin.text.rejects')} {Object.entries(s.text.rejects).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ') || t('admin.none')}
            </p>
          </section>

          <section style={{ ...card, marginTop: 12 }} data-testid="admin-backups">
            <div style={label}>{t('admin.backups.label')}</div>
            <p style={{ margin: '6px 0' }} data-testid="admin-backup-count">
              {t('admin.backups.count', { count: s.backups.count, hourly: s.backups.keepHourly, daily: s.backups.keepDaily })}
              {s.backups.last
                ? t('admin.backups.last', { when: when(s.backups.last.at), tick: s.backups.last.tick, kind: kind(t, s.backups.last.kind) })
                : t('admin.backups.none')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', margin: '10px 0' }}>
              <button
                type="button"
                data-testid="backup-now"
                style={button}
                disabled={busy}
                onClick={() => void act('/api/admin/backup', {}, (r) => t('admin.backups.done', { tick: (r.data.backup as { tick: number }).tick }))}
              >
                {t('admin.backups.now')}
              </button>
              <button
                type="button"
                data-testid="pause-toggle"
                style={button}
                disabled={busy}
                onClick={() => void act('/api/admin/pause', { paused: !s.world.paused }, (r) => (r.data.paused ? t('admin.world.paused') : t('admin.world.running')))}
              >
                {s.world.paused ? t('admin.world.resume') : t('admin.world.pause')}
              </button>
              {note ? <span data-testid="admin-note" role="status">{note}</span> : null}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table data-testid="backup-list" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', opacity: 0.7 }}>
                    <th style={{ padding: '4px 8px' }}>{t('admin.table.taken')}</th>
                    <th style={{ padding: '4px 8px' }}>{t('admin.table.tick')}</th>
                    <th style={{ padding: '4px 8px' }}>{t('admin.table.kind')}</th>
                    <th style={{ padding: '4px 8px' }}>{t('admin.table.size')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.backups.list.slice(0, 20).map((b) => (
                    <tr key={b.name}>
                      <td style={{ padding: '4px 8px' }}>{when(b.at)}</td>
                      <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{b.tick}</td>
                      <td style={{ padding: '4px 8px' }}>{kind(t, b.kind)}</td>
                      <td style={{ padding: '4px 8px' }}>{size(t, b.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ ...card, marginTop: 12 }} data-testid="admin-actions">
            <div style={label}>{t('admin.actions.label')}</div>
            {s.actions.length === 0 ? <p style={{ margin: '6px 0' }}>{t('admin.actions.none')}</p> : null}
            <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
              {s.actions.slice().reverse().map((a, i) => (
                <li key={`${a.at}-${i}`}>
                  {when(a.at)} · {t(`admin.action.${a.action}`)} · {a.ip} · {a.detail}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
