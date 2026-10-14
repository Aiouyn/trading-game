import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartDrawing } from '@/world/drawings';

const game = vi.hoisted(() => ({ act: vi.fn(), toast: vi.fn(), loadDrawings: vi.fn() }));
vi.mock('@/game/store', () => ({ useGame: { getState: () => game } }));
import { flushDrawingSaves, refusalText, SAVE_DELAY_MS, useDrawings } from './drawingStore';

const line = (id = 'd1', p = 100): ChartDrawing => ({ id, kind: 'hline', points: [{ t: 10, p }] });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  game.act.mockResolvedValue({ ok: true });
  game.loadDrawings.mockResolvedValue([]);
  useDrawings.setState({ byAsset: {}, loaded: {}, past: {}, future: {}, selected: null });
});

afterEach(async () => {
  flushDrawingSaves();
  await Promise.resolve();
  vi.useRealTimers();
});

describe('drawing persistence and history', () => {
  it('debounces per symbol, flushes the latest edits once, and cancels pending timers', async () => {
    const st = useDrawings.getState();
    st.commit('X', [line()]);
    st.commit('X', [line('d1', 101)]);
    st.commit('Y', [line('d2')]);
    expect(game.act).not.toHaveBeenCalled();
    flushDrawingSaves();
    expect(game.act).toHaveBeenCalledTimes(2);
    expect(game.act).toHaveBeenCalledWith({ type: 'drawings.save', assetId: 'X', drawings: [line('d1', 101)] }, { silent: true });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(game.act).toHaveBeenCalledTimes(2);
  });

  it('undo and redo restore the per-symbol list and persist it', async () => {
    const st = useDrawings.getState();
    st.commit('X', [line()]);
    st.commit('X', [line('d1', 102)]);
    st.commit('Y', [line('d2')]);
    st.undo('X');
    expect(useDrawings.getState().byAsset.X).toEqual([line()]);
    expect(useDrawings.getState().byAsset.Y).toEqual([line('d2')]);
    st.redo('X');
    expect(useDrawings.getState().byAsset.X).toEqual([line('d1', 102)]);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(game.act).toHaveBeenCalledWith({ type: 'drawings.save', assetId: 'X', drawings: [line('d1', 102)] }, { silent: true });
  });

  it('keeps local drawings and explains cap refusals or transport rejections', async () => {
    game.act.mockResolvedValueOnce({ ok: false, error: 'drawingsFull' }).mockRejectedValueOnce(new Error('disconnected'));
    useDrawings.getState().commit('X', [line()]);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(game.toast).toHaveBeenLastCalledWith({ tone: 'loss', text: refusalText('drawingsFull') });
    useDrawings.getState().commit('X', [line('d1', 101)]);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(game.toast).toHaveBeenLastCalledWith({ tone: 'loss', text: refusalText(undefined) });
    expect(useDrawings.getState().byAsset.X).toEqual([line('d1', 101)]);
  });
});

describe('drawing reads', () => {
  it('merges untouched saved drawings while keeping local edits of the same id', async () => {
    let resolve!: (list: ChartDrawing[]) => void;
    game.loadDrawings.mockReturnValueOnce(new Promise<ChartDrawing[]>((done) => { resolve = done; }));
    const pending = useDrawings.getState().load('X');
    useDrawings.getState().commit('X', [line('d1', 102)]);
    resolve([line('d1'), line('d2')]);
    await pending;
    expect(useDrawings.getState().byAsset.X).toEqual([line('d2'), line('d1', 102)]);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(game.act).toHaveBeenCalledWith({ type: 'drawings.save', assetId: 'X', drawings: [line('d2'), line('d1', 102)] }, { silent: true });
  });

  it('loads saved drawings, but a stale response never resurrects local deletions', async () => {
    let resolve!: (list: ChartDrawing[]) => void;
    game.loadDrawings.mockReturnValueOnce(new Promise<ChartDrawing[]>((done) => { resolve = done; }));
    const pending = useDrawings.getState().load('X');
    useDrawings.getState().commit('X', []);
    resolve([line()]);
    await pending;
    expect(useDrawings.getState().byAsset.X).toEqual([]);
    await useDrawings.getState().load('Y');
    expect(useDrawings.getState().byAsset.Y).toEqual([]);
  });

  it('an offline acknowledgement or rejected read leaves the symbol retryable', async () => {
    game.loadDrawings.mockResolvedValueOnce({ ok: false, error: 'offline' }).mockRejectedValueOnce(new Error('disconnected')).mockResolvedValueOnce([line()]);
    await useDrawings.getState().load('X');
    expect(useDrawings.getState().loaded.X).toBeUndefined();
    await useDrawings.getState().load('X');
    expect(useDrawings.getState().loaded.X).toBeUndefined();
    await useDrawings.getState().load('X');
    expect(useDrawings.getState().loaded.X).toBe(true);
    expect(useDrawings.getState().byAsset.X).toEqual([line()]);
  });
});
