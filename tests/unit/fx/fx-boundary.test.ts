import { describe, expect, it } from "vitest";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cash, parseFrame, parseGenesis, type Command, type Frame } from "@/server/market/fx/model";
import { FileFxStore, FxEngine, readCheckpoint, type FxStore } from "@/server/market/fx/store";
import { convert, frame, genesis, offers } from "../../fixtures/fx";

class UnitMap {}
const exotic = [
  { name: "NaN", value: () => NaN }, { name: "Infinity", value: () => Infinity },
  { name: "undefined", value: () => undefined }, { name: "Date", value: () => new Date(0) },
  { name: "function", value: () => () => 1 }, { name: "class instance", value: () => new UnitMap() },
  { name: "Proxy", value: () => new Proxy({}, {}) },
  { name: "toJSON", value: () => ({ toJSON: () => ({}) }) },
];

describe("FX JSON boundary and real-store durability", () => {
  it.each(exotic)("rejects $name units before genesis save, preserves an existing journal, then restarts validly", async ({ value }) => {
    const dir = await mkdtemp(path.join(tmpdir(), "fx-boundary-genesis-")), file = path.join(dir, "fx.json"), disk = new FileFxStore(file);
    let saves = 0;
    const store: FxStore = { load: () => disk.load(), save: async (c) => { saves++; await disk.save(c); } };
    const g = genesis(); Reflect.set(g.wallets[0]!, "units", value());
    expect(() => parseGenesis(g)).toThrow("INVALID_FX_GENESIS");
    await expect(FxEngine.open(store, g)).rejects.toThrow("INVALID_FX_GENESIS");
    expect(saves).toBe(0); await expect(access(file)).rejects.toThrow();
    const engine = await FxEngine.open(store, genesis()); await engine.observe([frame(0, offers())]);
    const before = engine.snapshot(), bytes = await readFile(file, "utf8"), count = saves;
    await expect(FxEngine.open(store, g)).rejects.toThrow("INVALID_FX_GENESIS");
    expect(saves).toBe(count); expect(await readFile(file, "utf8")).toBe(bytes);
    expect((await FxEngine.open(disk)).snapshot()).toEqual(before);
  });

  const cases: { name: string; make: () => Frame }[] = [
    { name: "sparse controls", make: () => Object.assign(frame(1), { controls: new Array<Frame["controls"][number]>(1) }) },
    { name: "sparse assets", make: () => Object.assign(frame(1), { assets: new Array<Frame["assets"][number]>(1) }) },
    { name: "sparse commands", make: () => Object.assign(frame(1), { commands: new Array<Command>(1) }) },
    { name: "unknown frame field", make: () => Object.assign(frame(1), { extra: null }) },
    { name: "unknown nested field", make: () => {
      const f = frame(1); f.assets = f.assets.map((a) => ({ ...a, extra: null })); return f;
    } },
    { name: "Proxy frame", make: () => new Proxy(frame(1), {}) },
    { name: "Proxy marks", make: () => { const f = frame(1); f.marks = new Proxy(f.marks!, {}); return f; } },
    { name: "getter", make: () => {
      const f = frame(1); Object.defineProperty(f.marks, "EUNFDL", { enumerable: true, get: () => 1100000 }); return f;
    } },
    { name: "class marks", make: () => {
      class Marks { EUNFDL = 1100000; FDLNKR = 2000000; FDLPYN = 100000000; FDLSRL = 5000000; }
      return Object.assign(frame(1), { marks: new Marks() });
    } },
    ...exotic.map(({ name, value }) => ({ name: "nested " + name, make: () => {
      const f = frame(1); Reflect.set(f.marks!, "EUNFDL", value()); return f;
    } })),
  ];
  it.each(cases)("rejects $name before execution/save, keeps bytes, and permits a later valid restart", async ({ make }) => {
    const dir = await mkdtemp(path.join(tmpdir(), "fx-boundary-frame-")), disk = new FileFxStore(path.join(dir, "fx.json"));
    let saves = 0;
    const store: FxStore = { load: () => disk.load(), save: async (c) => { saves++; await disk.save(c); } };
    let engine = await FxEngine.open(store, genesis()); await engine.observe([frame(0, offers())]);
    for (let restart = 0; restart < 2; restart++) {
      if (restart) engine = await FxEngine.open(store);
      const invalid = make(), before = engine.snapshot(), bytes = await readFile(disk.filePath, "utf8"), count = saves;
      expect(() => parseFrame(invalid)).toThrow("INVALID_FX_FRAME");
      await expect(engine.observe([invalid])).rejects.toThrow("INVALID_FX_FRAME");
      expect(saves).toBe(count); expect(engine.snapshot()).toEqual(before); expect(await readFile(disk.filePath, "utf8")).toBe(bytes);
    }
    await engine.observe([frame(1, [convert("valid-after-rejection")])]);
    const accepted = engine.snapshot(); expect(accepted.receipts.at(-1)?.result.kind).toBe("CONVERTED");
    expect((await FxEngine.open(disk)).snapshot()).toEqual(accepted);
    expect(readCheckpoint(JSON.parse(await readFile(disk.filePath, "utf8"))).state).toEqual(accepted);
  });

  it("rejects Proxy traps and getters without invoking them, including revoked proxies", () => {
    let reads = 0;
    const proxy = new Proxy(frame(1), { get() { reads++; throw new Error("trap invoked"); }, ownKeys() { reads++; throw new Error("trap invoked"); } });
    expect(() => parseFrame(proxy)).toThrow("INVALID_FX_FRAME");
    const f = frame(1); Object.defineProperty(f, "controls", { enumerable: true, get() { reads++; return []; } });
    expect(() => parseFrame(f)).toThrow("INVALID_FX_FRAME");
    const revoked = Proxy.revocable(frame(1), {}); revoked.revoke();
    expect(() => parseFrame(revoked.proxy)).toThrow("INVALID_FX_FRAME"); expect(reads).toBe(0);
  });

  it("uses the same boundary to reject malformed direct saves before replacing a valid journal", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "fx-boundary-save-")), disk = new FileFxStore(path.join(dir, "fx.json"));
    const engine = await FxEngine.open(disk, genesis()); await engine.observe([frame(0, offers())]);
    const bytes = await readFile(disk.filePath, "utf8"), state = engine.snapshot();
    for (const mutate of [
      (raw: ReturnType<typeof readCheckpoint>["checkpoint"]) => { Reflect.set(raw.frames[0]!, "controls", new Array(1)); },
      (raw: ReturnType<typeof readCheckpoint>["checkpoint"]) => { Reflect.set(raw.genesis.wallets[0]!, "units", new Date(0)); },
      (raw: ReturnType<typeof readCheckpoint>["checkpoint"]) => { Reflect.set(raw, "extra", true); },
    ]) {
      const raw = readCheckpoint(await disk.load()).checkpoint; mutate(raw);
      await expect(disk.save(raw)).rejects.toThrow(/INVALID_FX_/);
      expect(await readFile(disk.filePath, "utf8")).toBe(bytes);
      expect((await FxEngine.open(disk)).snapshot()).toEqual(state);
    }
    expect(state.wallets[0]?.cash).toEqual(cash(1000000));
  });
});
