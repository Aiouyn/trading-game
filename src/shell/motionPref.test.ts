import { describe, expect, it } from 'vitest';
import { PREFS_KEY, defaultPrefs, readPrefs, updatePrefs, type KeyValueStore } from './prefs';

class MemKV implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('Settings > Reduce motion is a device pref', () => {
  it('defaults to undecided, so the system setting decides', () => {
    expect(defaultPrefs().reducedMotion).toBeNull();
    expect(readPrefs(new MemKV()).reducedMotion).toBeNull();
  });

  it('round-trips through tg-prefs and keeps the language written beside it', () => {
    const kv = new MemKV();
    kv.setItem(PREFS_KEY, JSON.stringify({ lang: 'fr' }));
    updatePrefs(kv, (p) => ({ ...p, reducedMotion: true }));
    expect(readPrefs(kv).reducedMotion).toBe(true);
    const raw = JSON.parse(kv.getItem(PREFS_KEY) ?? '{}') as { lang?: string };
    expect(raw.lang).toBe('fr');
  });

  it('drops a non-boolean value back to undecided', () => {
    const kv = new MemKV();
    kv.setItem(PREFS_KEY, JSON.stringify({ reducedMotion: 'yes' }));
    expect(readPrefs(kv).reducedMotion).toBeNull();
  });
});
