import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The toast clocks follow the screen (P2-086): a notice's hold runs only while the desktop column or the phone banner shows it, so a
// notice queued behind others gets its full hold. The network client is replaced by a stub; no socket is opened here.
vi.mock('@/net/client', () => {
  class WorldClient {
    connect(): void { /* the stub connects nothing */ }
    close(): void { /* nothing to close */ }
    history(): Promise<null> { return Promise.resolve(null); }
    panel(): Promise<{ ok: boolean; error: string }> { return Promise.resolve({ ok: false, error: 'offline' }); }
  }
  return { WorldClient, api: {}, getToken: () => null, setToken: () => undefined, deviceId: () => '' };
});

import { useGame } from '@/game/store';

const ids = (): string[] => useGame.getState().toasts.map((t) => t.id);
const first = (): string => useGame.getState().toasts[0]!.id;

beforeEach(() => {
  vi.useFakeTimers();
  useGame.setState({ toasts: [], notices: [], closeUnread: null });
});

afterEach(() => {
  // a clock left running by one test must not expire a notice of the next
  useGame.getState().syncVisibleToasts([]);
  useGame.setState({ toasts: [] });
  vi.useRealTimers();
});

describe('toast clocks follow what is on screen (P2-086)', () => {
  it('a notice queued behind another is still on screen for its full hold after the first leaves', () => {
    useGame.getState().toast({ tone: 'info', text: 'first' });
    useGame.getState().toast({ tone: 'info', text: 'second' });
    const [a, b] = useGame.getState().toasts.map((t) => t.id);
    // only the first is on screen (the phone banner): its clock starts now
    useGame.getState().syncVisibleToasts([a!]);
    vi.advanceTimersByTime(3_000);
    expect(ids()).toEqual([a, b]);
    vi.advanceTimersByTime(1_000);
    expect(ids()).toEqual([b]);
    // the second comes on screen when the first leaves, and runs its full hold from then
    useGame.getState().syncVisibleToasts([b!]);
    vi.advanceTimersByTime(3_999);
    expect(ids()).toEqual([b]);
    vi.advanceTimersByTime(1);
    expect(ids()).toEqual([]);
  });

  it('a notice that never reaches the screen has no clock: it waits in the queue', () => {
    useGame.getState().toast({ tone: 'info', text: 'first' });
    useGame.getState().toast({ tone: 'info', text: 'queued' });
    const [a, b] = useGame.getState().toasts.map((t) => t.id);
    useGame.getState().syncVisibleToasts([a!]);
    vi.advanceTimersByTime(10_000);
    // the first expired on its own hold; the queued one kept no clock while it waited
    expect(ids()).toEqual([b]);
  });

  it('a notice covered by the trade sheet gives up its clock, and shows again with its full hold', () => {
    useGame.getState().toast({ tone: 'info', text: 'covered' });
    const a = first();
    useGame.getState().syncVisibleToasts([a]);
    vi.advanceTimersByTime(3_000);
    useGame.getState().syncVisibleToasts([]);
    vi.advanceTimersByTime(60_000);
    expect(ids()).toEqual([a]);
    useGame.getState().syncVisibleToasts([a]);
    vi.advanceTimersByTime(3_999);
    expect(ids()).toEqual([a]);
    vi.advanceTimersByTime(1);
    expect(ids()).toEqual([]);
  });

  it('a pause on screen holds the notice, and the hold resumes when the pause ends', () => {
    useGame.getState().toast({ tone: 'info', text: 'hovered' });
    const a = first();
    useGame.getState().syncVisibleToasts([a]);
    vi.advanceTimersByTime(1_000);
    useGame.getState().pauseToast(a);
    vi.advanceTimersByTime(60_000);
    expect(ids()).toEqual([a]);
    useGame.getState().resumeToast(a);
    vi.advanceTimersByTime(2_999);
    expect(ids()).toEqual([a]);
    vi.advanceTimersByTime(1);
    expect(ids()).toEqual([]);
  });

  it('a warning stays until it is read: it gets no clock', () => {
    useGame.getState().toast({ tone: 'warn', text: 'careful' });
    const w = first();
    useGame.getState().syncVisibleToasts([w]);
    vi.advanceTimersByTime(60_000);
    expect(ids()).toEqual([w]);
    useGame.getState().dismissToast(w);
    expect(ids()).toEqual([]);
  });
});

describe('the day close is unread until the Wire shows it', () => {
  it('a close marks the bell, and its notice keeps the day so the bell item opens that card', () => {
    useGame.getState().toast({ tone: 'brass', kind: 'close', day: 4, text: 'close of day 4' });
    expect(useGame.getState().closeUnread).toBe(4);
    expect(useGame.getState().notices.find((n) => n.text === 'close of day 4')?.day).toBe(4);
  });

  it('a close whose toast expired is still unread', () => {
    useGame.getState().toast({ tone: 'brass', kind: 'close', day: 6, text: 'close of day 6' });
    const id = first();
    useGame.getState().syncVisibleToasts([id]);
    vi.advanceTimersByTime(4_000);
    expect(ids()).toEqual([]);
    expect(useGame.getState().closeUnread).toBe(6);
  });

  it('the Wire reading an older close leaves the latest one unread; reading the latest clears the mark', () => {
    useGame.getState().toast({ tone: 'brass', kind: 'close', day: 4, text: 'close of day 4' });
    useGame.getState().toast({ tone: 'brass', kind: 'close', day: 5, text: 'close of day 5' });
    expect(useGame.getState().closeUnread).toBe(5);
    useGame.getState().markCloseRead(4);
    expect(useGame.getState().closeUnread).toBe(5);
    useGame.getState().markCloseRead(5);
    expect(useGame.getState().closeUnread).toBeNull();
  });

  it('other notices do not mark the bell as a close', () => {
    useGame.getState().toast({ tone: 'info', text: 'a fill of ours' });
    expect(useGame.getState().closeUnread).toBeNull();
  });
});
