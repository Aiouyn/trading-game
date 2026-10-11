import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../../server/db';
import { textConfigFromEnv, type TextConfig } from '../../../server/text/config';
import { TextEnricher, dayOf, type EnricherOptions } from '../../../server/text/enricher';
import { enrichItemOf, factsHash, promptFor, type EnrichItem, type ItemFacts } from '../../../server/text/facts';
import { validateReply } from '../../../server/text/validate';
import { createGame, stepGame } from '../../world/game';
import type { WireItem } from '../../world/types';

const FACTS: ItemFacts = { kind: 'earnings', tag: 'EARNINGS', text: 'ACME beat by 12.5%', tone: 'gain', assetId: 'ACME', msg: { key: 'wire.x', vars: { pct: 12.5 } } };
const ITEM: EnrichItem = { id: 'w7', role: 'newsroom', facts: FACTS };
const GOOD = { en: 'Acme beat its estimate.', fr: 'Acme a dépassé son estimation.' };

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tg-text-'));
  store = new Store(dir);
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

function cfg(over: Partial<TextConfig> = {}): TextConfig {
  return { enabled: true, apiKey: 'k-test-123456789012345', model: 'claude-haiku-5-5', dailyUsdCap: 1, roles: new Set(['newsroom']), ratePerMinute: 6, timeoutMs: 1000, maxChars: 200, maxTokens: 300, ...over };
}

/** A mocked Messages API answer: a text block with the reply and the usage. */
function answer(text: string, usage = { input_tokens: 100, output_tokens: 50 }): Response {
  return new Response(JSON.stringify({ content: [{ type: 'text', text }], usage }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function mockFetch(reply: () => Response | Promise<Response>) {
  return vi.fn(async () => reply());
}

function enricher(c: TextConfig, fetchImpl?: typeof fetch, extra: EnricherOptions = {}) {
  return new TextEnricher(c, store, { fetchImpl, now: () => Date.UTC(2026, 9, 11, 12), ...extra });
}

describe('config from the environment', () => {
  it('is off with no environment: nothing is enabled', () => {
    const c = textConfigFromEnv({});
    expect(c.enabled).toBe(false);
    expect(c.dailyUsdCap).toBe(1);
    expect(c.model).toBe('claude-haiku-5-5');
    expect([...c.roles]).toEqual(['newsroom']);
  });

  it('needs both the provider and a key', () => {
    expect(textConfigFromEnv({ TEXT_PROVIDER: 'claude' }).enabled).toBe(false);
    expect(textConfigFromEnv({ ANTHROPIC_API_KEY: 'k' }).enabled).toBe(false);
    const on = textConfigFromEnv({ TEXT_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k', TEXT_DAILY_USD_CAP: '0.25', TEXT_ROLES: 'newsroom,bogus,rival' });
    expect(on.enabled).toBe(true);
    expect(on.dailyUsdCap).toBe(0.25);
    expect([...on.roles].sort()).toEqual(['newsroom', 'rival']);
  });
});

describe('item facts', () => {
  it('takes wire news and nothing private', () => {
    const wire = { id: 'w9', tick: 1, kind: 'move', tag: 'MOVE', text: 'ACME up', tone: 'gain', assetId: 'ACME' } as WireItem;
    expect(enrichItemOf(wire)?.role).toBe('newsroom');
    expect(enrichItemOf({ ...wire, kind: 'chapter' })).toBeNull();
  });

  it('never takes a launchpad line, which names other players (the creator, the plaintiff, the defendant)', () => {
    const lp = { id: 'w11', tick: 1, kind: 'launchpad', tag: 'Launchpad', text: 'maker_one launched ZED', tone: 'brass', assetId: 'ZED',
      msg: { key: 'lp.wire.launch', vars: { name: 'Zed', ticker: 'ZED', creator: 'maker_one' } } } as WireItem;
    expect(enrichItemOf(lp)).toBeNull();
    const suit = { ...lp, id: 'w12', kind: 'court', tag: 'Court', text: 'trader_two is suing you', msg: { key: 'lp.wire.rugSued', vars: { plaintiff: 'trader_two', defendant: 'maker_one', ticker: 'ZED' } } } as WireItem;
    expect(enrichItemOf(suit)).toBeNull();
  });

  it('drops a wire line that names a player handle, in its text or its vars, when the server passes the handles', () => {
    const handles = new Set(['maker_one', 'trader_two']);
    const move = { id: 'w13', tick: 1, kind: 'move', tag: 'MOVE', text: 'ACME up 3%', tone: 'gain', assetId: 'ACME' } as WireItem;
    expect(enrichItemOf(move, handles)?.id).toBe('w13');
    expect(enrichItemOf({ ...move, text: 'trader_two bought ACME' }, handles)).toBeNull();
    expect(enrichItemOf({ ...move, msg: { key: 'wire.x', vars: { who: 'MAKER_ONE' } } }, handles)).toBeNull();
  });

  it('keeps a handle out of the prompt and the cache key: a clean item keeps its facts, a named one is never offered', () => {
    const handles = new Set(['zed_holder_x']);
    const clean = { id: 'w14', tick: 2, kind: 'rumor', tag: 'Rumor', text: 'ACME rumored to buy a rival', tone: 'info', assetId: 'ACME' } as WireItem;
    const it = enrichItemOf(clean, handles);
    expect(it).not.toBeNull();
    expect(promptFor(it!)).not.toMatch(/zed_holder_x/);
    expect(enrichItemOf({ ...clean, text: 'zed_holder_x rumored to buy ACME' }, handles)).toBeNull();
  });

  it('hashes the same facts the same way whatever the key order', () => {
    const a = { x: 1, y: { p: 2, q: [1, 2] } };
    const b = { y: { q: [1, 2], p: 2 }, x: 1 };
    expect(factsHash(a)).toBe(factsHash(b));
    expect(factsHash(a)).not.toBe(factsHash({ ...a, x: 2 }));
  });

  it('builds a prompt from the facts only', () => {
    const p = promptFor(ITEM);
    expect(p.startsWith('ROLE: newsroom\nFACTS: ')).toBe(true);
    expect(p).toContain('"text":"ACME beat by 12.5%"');
  });
});

describe('reply validation (every reject reason)', () => {
  const facts = { text: 'ACME beat by 12.5%' };
  const ok = (o: object) => JSON.stringify({ en: 'Acme beat by 12.5%.', fr: 'Acme a dépassé de 12,5 %.', ...o });

  it('accepts a clean two-locale reply', () => {
    expect(validateReply(ok({}), facts, 200).ok).toBe(true);
  });
  it('rejects text that is not JSON', () => {
    expect(validateReply('Acme beat.', facts, 200)).toEqual({ ok: false, reason: 'json' });
    expect(validateReply('[1,2]', facts, 200)).toEqual({ ok: false, reason: 'json' });
  });
  it('rejects a reply without both locales', () => {
    expect(validateReply(JSON.stringify({ en: 'Acme beat by 12.5%.' }), facts, 200)).toEqual({ ok: false, reason: 'locale' });
    expect(validateReply(JSON.stringify({ en: 'x', fr: '  ' }), facts, 200)).toEqual({ ok: false, reason: 'locale' });
  });
  it('rejects a line over the length cap', () => {
    expect(validateReply(ok({ en: 'a'.repeat(201) }), facts, 200)).toEqual({ ok: false, reason: 'length' });
  });
  it('rejects a number the facts do not give', () => {
    expect(validateReply(ok({ en: 'Acme beat by 15%.' }), facts, 200)).toEqual({ ok: false, reason: 'number' });
    expect(validateReply(ok({ fr: 'Acme a dépassé de 99,9 %.' }), facts, 200)).toEqual({ ok: false, reason: 'number' });
  });
  it('rejects a banned word in either language', () => {
    expect(validateReply(ok({ en: 'Acme should rise.' }), facts, 200)).toEqual({ ok: false, reason: 'banned' });
    expect(validateReply(ok({ fr: 'Acme sera fort.' }), facts, 200)).toEqual({ ok: false, reason: 'banned' });
  });
  it('rejects an advice pattern in either language', () => {
    // the English advice patterns all use buy or sell, which the banned list already catches first
    expect(validateReply(ok({ en: 'You should buy Acme.' }), facts, 200)).toEqual({ ok: false, reason: 'banned' });
    expect(validateReply(ok({ fr: 'Il faut acheter Acme maintenant.' }), facts, 200)).toEqual({ ok: false, reason: 'advice' });
  });
  it('rejects a French line that is English (an English stopword the facts do not hold)', () => {
    expect(validateReply(ok({ fr: 'The stock is up and it rose.' }), facts, 200)).toEqual({ ok: false, reason: 'language' });
    expect(validateReply(ok({ fr: 'Acme rose with its peers.' }), facts, 200)).toEqual({ ok: false, reason: 'language' });
  });
  it('accepts a real French line, and a stopword that the facts themselves contain', () => {
    expect(validateReply(ok({ fr: 'Acme a dépassé son estimation.' }), facts, 200).ok).toBe(true);
    const named = { text: 'The Trust beat by 12.5%' };
    expect(validateReply(JSON.stringify({ en: 'The Trust beat.', fr: 'The Trust a dépassé de 12,5 %.' }), named, 200).ok).toBe(true);
  });
  it('accepts a French thousands space and decimal comma when the facts hold the value', () => {
    const f = { amount: 1234.56 };
    expect(validateReply(JSON.stringify({ en: 'Net worth 1,234.56 dollars.', fr: 'Valeur nette 1 234,56 dollars.' }), f, 200).ok).toBe(true);
  });
});

describe('the enricher', () => {
  it('answers a cached item with no call and no cost', async () => {
    store.textCachePut('newsroom', factsHash(FACTS), 'en', GOOD.en);
    store.textCachePut('newsroom', factsHash(FACTS), 'fr', GOOD.fr);
    const f = mockFetch(() => answer('{}'));
    const e = enricher(cfg(), f as unknown as typeof fetch);
    e.offer(ITEM);
    expect(f).not.toHaveBeenCalled();
    expect(e.overlay()).toEqual({ w7: GOOD });
    expect(e.readout()).toMatchObject({ hits: 1, calls: 0, spentToday: 0 });
  });

  it('calls the Messages API with the documented headers and body, then caches both locales', async () => {
    const f = mockFetch(() => answer(JSON.stringify(GOOD)));
    const e = enricher(cfg(), f as unknown as typeof fetch);
    e.offer(ITEM);
    await e.settled();
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('k-test-123456789012345');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(String(init.body)) as { model: string; max_tokens: number; messages: { content: string }[] };
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.messages[0]!.content).toContain('FACTS:');
    expect(e.since(0)).toEqual({ w7: GOOD });
    expect(e.since(e.version())).toBeNull();
    expect(store.textCacheGet('newsroom', factsHash(FACTS), 'fr')).toBe(GOOD.fr);
  });

  it('counts the spend from the usage tokens and the price table', async () => {
    const f = mockFetch(() => answer(JSON.stringify(GOOD), { input_tokens: 1000, output_tokens: 1000 }));
    const e = enricher(cfg(), f as unknown as typeof fetch);
    e.offer(ITEM);
    await e.settled();
    // 1000 input at $0.10/MTok plus 1000 output at $0.50/MTok
    expect(e.readout().spentToday).toBeCloseTo(0.0006, 10);
    expect(store.textSpendOn(dayOf(Date.UTC(2026, 9, 11, 12)))).toBeCloseTo(0.0006, 10);
  });

  it('stops at the daily cap and does not call the network', async () => {
    store.textSpendAdd(dayOf(Date.UTC(2026, 9, 11, 12)), 1);
    const f = mockFetch(() => answer(JSON.stringify(GOOD)));
    const e = enricher(cfg({ dailyUsdCap: 1 }), f as unknown as typeof fetch);
    e.offer(ITEM);
    await e.settled();
    expect(f).not.toHaveBeenCalled();
    expect(e.readout().stops.cap).toBe(1);
    // the next real day starts at zero again
    const later = new TextEnricher(cfg({ dailyUsdCap: 1 }), store, { fetchImpl: f as unknown as typeof fetch, now: () => Date.UTC(2026, 9, 12, 1) });
    later.offer(ITEM);
    await later.settled();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('rate limits per role', async () => {
    const f = mockFetch(() => answer(JSON.stringify(GOOD)));
    const e = enricher(cfg({ ratePerMinute: 2 }), f as unknown as typeof fetch);
    for (let i = 0; i < 3; i++) e.offer({ ...ITEM, id: `w${i}`, facts: { ...FACTS, text: `line ${i}` } });
    await e.settled();
    expect(f).toHaveBeenCalledTimes(2);
    expect(e.readout().stops.rate).toBe(1);
  });

  it('keeps the template and counts each reject reason', async () => {
    const replies = [
      'not json', JSON.stringify({ en: 'only english' }), JSON.stringify({ en: 'x'.repeat(250), fr: 'y' }),
      JSON.stringify({ en: 'Up 99%.', fr: 'Up 99%.' }), JSON.stringify({ en: 'Acme should go.', fr: 'Acme monte.' }),
      JSON.stringify({ en: 'Acme is up.', fr: 'Il faut acheter maintenant.' }),
      JSON.stringify({ en: 'Acme is up.', fr: 'The stock is up.' }),
    ];
    const seen = replies.length;
    let i = 0;
    const f = mockFetch(() => answer(replies[i++]!));
    const e = enricher(cfg({ ratePerMinute: 100 }), f as unknown as typeof fetch);
    for (let k = 0; k < seen; k++) e.offer({ ...ITEM, id: `r${k}`, facts: { ...FACTS, text: `case ${k}` } });
    await e.settled();
    expect(e.overlay()).toEqual({});
    const r = e.readout().rejects;
    expect(r).toMatchObject({ json: 1, locale: 1, length: 1, number: 1, banned: 1, advice: 1, language: 1 });
    expect(e.readout().fallbacks).toBe(7);
  });

  it('falls back to the template on a timeout, with a counter', async () => {
    const hang = (_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const e = enricher(cfg({ timeoutMs: 5 }), hang as unknown as typeof fetch);
    e.offer(ITEM);
    await e.settled();
    expect(e.overlay()).toEqual({});
    expect(e.readout().rejects.timeout).toBe(1);
  });

  it('falls back on an HTTP error and on a network error', async () => {
    const http = mockFetch(() => new Response('nope', { status: 500 }));
    const e1 = enricher(cfg(), http as unknown as typeof fetch);
    e1.offer(ITEM);
    await e1.settled();
    expect(e1.readout().rejects.http).toBe(1);
    const net = vi.fn(async () => { throw new TypeError('fetch failed'); });
    const e2 = enricher(cfg(), net as unknown as typeof fetch);
    e2.offer(ITEM);
    await e2.settled();
    expect(e2.readout().rejects.network).toBe(1);
  });

  it('does nothing while off, even with a fetch and a key', async () => {
    const f = mockFetch(() => answer(JSON.stringify(GOOD)));
    const e = enricher(cfg({ enabled: false }), f as unknown as typeof fetch);
    e.offer(ITEM);
    await e.settled();
    expect(f).not.toHaveBeenCalled();
    expect(e.readout()).toMatchObject({ enabled: false, calls: 0, overlaySize: 0 });
  });
});

describe('in flight, per connection and at the cap', () => {
  it('gives an identical item that arrives during its twin call the same line (one call, two overlays)', async () => {
    const f = mockFetch(() => answer(JSON.stringify(GOOD)));
    const e = enricher(cfg({ ratePerMinute: 100 }), f as unknown as typeof fetch);
    e.offer({ ...ITEM, id: 'twin-a' });
    e.offer({ ...ITEM, id: 'twin-b' });
    await e.settled();
    expect(f).toHaveBeenCalledTimes(1);
    expect(e.overlay()).toEqual({ 'twin-a': GOOD, 'twin-b': GOOD });
  });

  it('counts the cost of calls in flight against the cap, so two calls cannot both pass it', async () => {
    // one call reserves about 0.00018 USD at the estimate; a cap of 0.0002 admits one call only
    const f = mockFetch(() => answer(JSON.stringify(GOOD)));
    const e = enricher(cfg({ dailyUsdCap: 0.0002, ratePerMinute: 100 }), f as unknown as typeof fetch);
    e.offer({ ...ITEM, id: 'c1', facts: { ...FACTS, text: 'first line' } });
    e.offer({ ...ITEM, id: 'c2', facts: { ...FACTS, text: 'second line' } });
    expect(e.readout()).toMatchObject({ stops: { cap: 1, rate: 0 } });
    expect(e.readout().reservedToday).toBeGreaterThan(0);
    await e.settled();
    expect(f).toHaveBeenCalledTimes(1);
    expect(e.readout().reservedToday).toBe(0);
  });

  it('gives each connection only the lines after its own cursor, so a skipped tick is not lost', async () => {
    const f = mockFetch(() => answer(JSON.stringify(GOOD)));
    const e = enricher(cfg({ ratePerMinute: 100 }), f as unknown as typeof fetch);
    const welcomeCursor = e.version();
    e.offer({ ...ITEM, id: 'k1', facts: { ...FACTS, text: 'one' } });
    await e.settled();
    expect(e.since(welcomeCursor)).toEqual({ k1: GOOD });
    // a connection that did not send at that tick still has its cursor at the welcome, and gets the line later
    expect(e.since(welcomeCursor)).toEqual({ k1: GOOD });
    const afterSent = e.version();
    expect(e.since(afterSent)).toBeNull();
    e.offer({ ...ITEM, id: 'k2', facts: { ...FACTS, text: 'two' } });
    await e.settled();
    expect(e.since(afterSent)).toEqual({ k2: GOOD });
  });
});

describe('the world is unchanged by the enricher', () => {
  /** Steps a world; when `enrich` is set, every wire item goes to a mocked enricher. Returns the state as JSON. */
  async function run(seed: string, ticks: number, enrich: boolean): Promise<{ json: string; calls: number }> {
    const g = createGame(seed, { warmupDays: 0, npcs: false });
    const f = mockFetch(() => answer(JSON.stringify(GOOD)));
    const e = enricher(cfg({ ratePerMinute: 1000 }), f as unknown as typeof fetch);
    for (let t = 0; t < ticks; t++) {
      const out = stepGame(g);
      if (enrich) for (const w of out.wire) {
        const it = enrichItemOf(w);
        if (it) e.offer(it);
      }
      e.since(e.version());
    }
    await e.settled();
    return { json: JSON.stringify(g), calls: enrich ? e.readout().calls : 0 };
  }

  it('replays byte-identical with the enricher on (mocked) and off', async () => {
    const off = await run('p7-text-replay', 240, false);
    const on = await run('p7-text-replay', 240, true);
    expect(on.json).toBe(off.json);
    expect(on.calls).toBeGreaterThan(0);
  });

  it('keeps the overlay out of the world state and its snapshots', async () => {
    const g = createGame('p7-text-snap', { warmupDays: 0, npcs: false });
    const f = mockFetch(() => answer(JSON.stringify({ en: 'Markets were calm today.', fr: 'Les marchés sont restés calmes.' })));
    const e = enricher(cfg({ ratePerMinute: 1000 }), f as unknown as typeof fetch);
    const item: EnrichItem = { id: 'wx', role: 'newsroom', facts: { kind: 'macro', tag: 'MACRO', text: 'Markets were calm today.', tone: 'info' } };
    e.offer(item);
    await e.settled();
    expect(e.overlay().wx).toBeDefined();
    expect(JSON.stringify(g)).not.toContain('Les marchés');
    expect(JSON.stringify(g)).not.toContain('textOverlay');
  });

  it('builds the prompt from the item only (no other player data)', () => {
    const item: EnrichItem = { id: 'w1', role: 'newsroom', facts: FACTS };
    expect(promptFor(item)).not.toMatch(/handle|holding|position|cash/i);
  });
});
