'use client';

import { DEFAULT_WORLD_PORT, type AuthRes, type ClientMsg, type HistoryPayload, type NwHistoryPayload, type ServerMsg } from './protocol';
import type { Command } from '@/world/types';
import type { PlayerView } from '@/world/view';
import type { LpPage } from '@/world/launchpad/view';

export interface Ack { ok: boolean; error?: string; data?: unknown; me?: PlayerView }

const TOKEN_KEY = 'tg-token'; // migrated from tycoon.token on boot (shell/prefs migrateLegacy)

/** The world server lives next to the web app (same host, its own port), unless configured. */
export function worldHttpUrl(): string {
  const env = process.env.NEXT_PUBLIC_WORLD_URL;
  if (env) return env.replace(/\/$/, '');
  if (typeof window === 'undefined') return `http://localhost:${DEFAULT_WORLD_PORT}`;
  const port = new URLSearchParams(window.location.search).get('world') ?? String(DEFAULT_WORLD_PORT);
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

export function getToken(): string | null {
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode: the session still works until reload */ }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${worldHttpUrl()}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return (await r.json()) as T;
}

export const api = {
  register: (handle: string, country: string) => post<AuthRes>('/api/register', { handle, country }),
  login: (handle: string, password: string) => post<AuthRes>('/api/login', { handle, password }),
  setPassword: (token: string, password: string) => post<{ ok: boolean; error?: string }>('/api/password', { token, password }),
};

type Handler = (msg: ServerMsg) => void;

/**
 * One WebSocket to the world. Reconnects with backoff; commands resolve with the server's ack.
 */
export class WorldClient {
  private ws: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<number, (v: unknown) => void>();
  private retry = 0;
  private closed = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private token: string, private onMsg: Handler, private onState: (s: 'open' | 'closed' | 'auth-failed') => void) {}

  connect(): void {
    this.closed = false;
    const url = worldHttpUrl().replace(/^http/, 'ws');
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.raw({ t: 'hello', token: this.token });
      this.pingTimer = setInterval(() => this.raw({ t: 'ping' }), 25_000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try { msg = JSON.parse(String(ev.data)) as ServerMsg; } catch { return; }
      if (msg.t === 'welcome') this.onState('open');
      if (msg.t === 'error' && msg.message === 'auth') { this.closed = true; this.onState('auth-failed'); ws.close(); return; }
      if ((msg.t === 'ack' || msg.t === 'history' || msg.t === 'nw-history' || msg.t === 'lp-page') && this.pending.has(msg.id)) {
        const resolve = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        resolve(msg.t === 'ack' ? msg : msg.data);
      }
      this.onMsg(msg);
    };
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      for (const r of this.pending.values()) r({ ok: false, error: 'connection lost' });
      this.pending.clear();
      if (this.closed) return;
      this.onState('closed');
      const wait = Math.min(15_000, 500 * 2 ** this.retry++);
      setTimeout(() => { if (!this.closed) this.connect(); }, wait);
    };
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }

  private raw(m: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private request<T>(build: (id: number) => ClientMsg): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve) => {
      if (this.ws?.readyState !== WebSocket.OPEN) { resolve({ ok: false, error: 'offline' } as T); return; }
      this.pending.set(id, resolve as (v: unknown) => void);
      this.raw(build(id));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); resolve({ ok: false, error: 'timed out' } as T); } }, 15_000);
    });
  }

  command(cmd: Command): Promise<Ack> {
    return this.request<Ack>((id) => ({ t: 'cmd', id, cmd }));
  }

  history(series: string): Promise<HistoryPayload | null> {
    return this.request<HistoryPayload | null>((id) => ({ t: 'history', id, series }));
  }

  nwHistory(): Promise<NwHistoryPayload> {
    return this.request<NwHistoryPayload>((id) => ({ t: 'nw-history', id }));
  }

  lpPage(ticker: string): Promise<LpPage | null> {
    return this.request<LpPage | null>((id) => ({ t: 'lp-page', id, ticker }));
  }
}
