'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { AdminStatus } from '../../../server/admin';
import { worldHttpUrl } from '@/net/client';

/**
 * The admin page (lead-phase8.md P8-3): the world's readouts and two actions, behind the admin token. The token is typed once and
 * kept in this page's memory only (never in storage), so a reload asks for it again. Operator tool: English only.
 */

const POLL_MS = 5000;

interface Reply {
  code: number;
  data: Record<string, unknown>;
}

async function call(path: string, token: string, method: 'GET' | 'POST', body?: unknown): Promise<Reply> {
  const r = await fetch(`${worldHttpUrl()}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { code: r.status, data };
}

function kb(n: number): string {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
}

function ms(n: number | null): string {
  return n === null ? '–' : `${n.toFixed(1)} ms`;
}

function when(at: number): string {
  return new Date(at).toLocaleString();
}

const card: CSSProperties = { border: '1px solid #8884', borderRadius: 8, padding: '12px 14px', minWidth: 0 };
const label: CSSProperties = { fontSize: 12, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.4 };
const big: CSSProperties = { fontSize: 22, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' };
const button: CSSProperties = { padding: '8px 14px', borderRadius: 6, border: '1px solid #888', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (tok: string) => {
    try {
      const r = await call('/api/admin/status', tok, 'GET');
      if (r.code === 403) {
        setToken(null);
        setStatus(null);
        setError('The admin token is not right, or this world has no admin token set (ADMIN_TOKEN).');
        return;
      }
      if (r.code !== 200) {
        setError(`The world answered ${r.code}.`);
        return;
      }
      setStatus(r.data as unknown as AdminStatus);
      setError(null);
    } catch {
      setError(`The world server is not reachable at ${worldHttpUrl()}.`);
    }
  }, []);

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
        setError('The admin token is not right.');
      } else if (r.code !== 200) {
        setNote(String(r.data.error ?? `The world answered ${r.code}.`));
      } else {
        setNote(done(r));
      }
      if (token) await load(token);
    } catch {
      setNote(`The world server is not reachable at ${worldHttpUrl()}.`);
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 22, margin: '24px 0 8px' }}>Admin</h1>
        <p style={{ opacity: 0.8, margin: '0 0 16px' }}>Enter the admin token. It stays in this page only and is asked again after a reload.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = typed.trim();
            if (!t) return;
            setTyped('');
            setToken(t);
            setError(null);
            void load(t);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <label htmlFor="admin-token" style={label}>Admin token</label>
          <input
            id="admin-token"
            data-testid="admin-token"
            type="password"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #888', font: 'inherit', background: 'transparent', color: 'inherit', minWidth: 0 }}
          />
          <button type="submit" data-testid="admin-token-submit" style={button}>Open</button>
        </form>
        {error ? <p data-testid="admin-error" role="alert" style={{ color: '#c33', marginTop: 12 }}>{error}</p> : null}
        <p style={{ marginTop: 24 }}><Link href="/">Back to the game</Link></p>
      </main>
    );
  }

  const s = status;
  return (
    <main data-testid="admin-status" style={{ maxWidth: 1040, margin: '0 auto', padding: 16, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between', margin: '12px 0 16px' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Admin</h1>
        <Link href="/">Back to the game</Link>
      </header>

      {error ? <p data-testid="admin-error" role="alert" style={{ color: '#c33' }}>{error}</p> : null}
      {!s && !error ? <p>Loading…</p> : null}

      {s ? (
        <>
          <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <div style={card} data-testid="admin-world">
              <div style={label}>World tick</div>
              <div style={big} data-testid="admin-tick">{s.world.tick}</div>
              <div>Day {s.world.day} · {s.world.paused ? 'paused' : 'running'} · {s.world.tickMs} ms a tick</div>
            </div>
            <div style={card} data-testid="admin-players">
              <div style={label}>Players</div>
              <div style={big} data-testid="admin-online">{s.players.online} online</div>
              <div>{s.players.registered} registered · {s.players.inWorld} in the world</div>
            </div>
            <div style={card} data-testid="admin-ticks">
              <div style={label}>Tick time, last hour</div>
              <div style={big}>p50 {ms(s.ticks.p50Ms)}</div>
              <div>p99 {ms(s.ticks.p99Ms)} · {s.ticks.lastHour} ticks</div>
            </div>
            <div style={card} data-testid="admin-db">
              <div style={label}>Database</div>
              <div style={big}>{kb(s.database.bytes)}</div>
            </div>
            <div style={card} data-testid="admin-tournament">
              <div style={label}>Tournament job</div>
              <div style={big}>{s.tournament.running === null ? 'idle' : `week ${s.tournament.running} running`}</div>
              <div>{s.tournament.retryInMs > 0 ? `retry in ${Math.ceil(s.tournament.retryInMs / 1000)} s` : 'no retry waiting'}</div>
            </div>
          </section>

          <section style={{ ...card, marginTop: 12 }} data-testid="admin-text">
            <div style={label}>Model text overlay</div>
            <p style={{ margin: '6px 0' }}>
              {s.text.enabled ? `On (${s.text.provider}, ${s.text.model})` : 'Off (template lines only)'} · roles {s.text.roles.length} · overlay {s.text.overlaySize}
            </p>
            <p style={{ margin: '6px 0' }}>
              Calls {s.text.calls} · cache hits {s.text.hits} · fallbacks {s.text.fallbacks} · stopped by cap {s.text.stops.cap}, rate {s.text.stops.rate}
            </p>
            <p style={{ margin: '6px 0' }}>
              Spent today ${s.text.spentToday.toFixed(2)} of ${s.text.dailyUsdCap.toFixed(2)} (reserved ${s.text.reservedToday.toFixed(2)}) · {s.text.day}
            </p>
            <p style={{ margin: '6px 0', opacity: 0.8 }}>
              Rejects: {Object.entries(s.text.rejects).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}
            </p>
          </section>

          <section style={{ ...card, marginTop: 12 }} data-testid="admin-backups">
            <div style={label}>Backups</div>
            <p style={{ margin: '6px 0' }} data-testid="admin-backup-count">
              {s.backups.count} kept (up to {s.backups.keepHourly} hourly and {s.backups.keepDaily} daily)
              {s.backups.last ? ` · last ${when(s.backups.last.at)} at tick ${s.backups.last.tick} (${s.backups.last.kind})` : ' · none yet'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', margin: '10px 0' }}>
              <button type="button" data-testid="backup-now" style={button} disabled={busy} onClick={() => void act('/api/admin/backup', {}, (r) => `Backed up at tick ${(r.data.backup as { tick: number }).tick}.`)}>
                Back up now
              </button>
              <button
                type="button"
                data-testid="pause-toggle"
                style={button}
                disabled={busy}
                onClick={() => void act('/api/admin/pause', { paused: !s.world.paused }, (r) => (r.data.paused ? 'The world is paused.' : 'The world is running again.'))}
              >
                {s.world.paused ? 'Resume world' : 'Pause world'}
              </button>
              {note ? <span data-testid="admin-note" role="status">{note}</span> : null}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table data-testid="backup-list" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', opacity: 0.7 }}>
                    <th style={{ padding: '4px 8px' }}>Taken</th>
                    <th style={{ padding: '4px 8px' }}>Tick</th>
                    <th style={{ padding: '4px 8px' }}>Kind</th>
                    <th style={{ padding: '4px 8px' }}>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {s.backups.list.slice(0, 20).map((b) => (
                    <tr key={b.name}>
                      <td style={{ padding: '4px 8px' }}>{when(b.at)}</td>
                      <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{b.tick}</td>
                      <td style={{ padding: '4px 8px' }}>{b.kind}</td>
                      <td style={{ padding: '4px 8px' }}>{kb(b.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ ...card, marginTop: 12 }} data-testid="admin-actions">
            <div style={label}>Recent admin actions</div>
            {s.actions.length === 0 ? <p style={{ margin: '6px 0' }}>None since the world started.</p> : null}
            <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
              {s.actions.slice().reverse().map((a, i) => (
                <li key={`${a.at}-${i}`}>{when(a.at)} · {a.action} · {a.ip} · {a.detail}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
