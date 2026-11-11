import { isPlainJson } from "./json";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { actorGuardEnabled, authorizeFxCommands, type FxActorOptions } from "./actor";
import { advanceFx, createFx, previewFx, publicFx } from "./engine";
import { canonical, object, parseCommand, parseFrame, parseGenesis, type Frame, type Genesis, type State } from "./model";
export { FX_ACTOR_DEFAULT_ENABLED } from "./actor";
export interface Checkpoint { v: 1; genesis: Genesis; frames: Frame[]; stateSha256: string }
export const stateHash = (s: State) => createHash("sha256").update(canonical(s)).digest("hex");
export function readCheckpoint(raw: unknown): { checkpoint: Checkpoint; state: State } {
  if (!isPlainJson(raw) || !object(raw) || Object.keys(raw).length !== 4 || raw.v !== 1 || !Array.isArray(raw.frames) || typeof raw.stateSha256 !== "string" || !/^[0-9a-f]{64}$/.test(raw.stateSha256)) throw new Error("INVALID_FX_CHECKPOINT");
  const genesis = parseGenesis(raw.genesis), frames = raw.frames.map(parseFrame), state = advanceFx(createFx(genesis), frames);
  if (stateHash(state) !== raw.stateSha256) throw new Error("FX_CHECKPOINT_HASH");
  return { checkpoint: { v: 1, genesis, frames, stateSha256: raw.stateSha256 }, state };
}
export interface FxStore { load(): Promise<unknown | null>; save(checkpoint: Checkpoint): Promise<void> }
export class FileFxStore implements FxStore {
  constructor(readonly filePath: string) {}
  async load(): Promise<unknown | null> {
    try { const value: unknown = JSON.parse(await readFile(this.filePath, "utf8")); if (value === null) throw new Error("INVALID_FX_CHECKPOINT"); return value; }
    catch (e) { if (object(e) && e.code === "ENOENT") return null; throw e; }
  }
  async save(checkpoint: Checkpoint): Promise<void> {
    const content = JSON.stringify(readCheckpoint(checkpoint).checkpoint);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${randomUUID()}.tmp`;
    try { await writeFile(tmp, content, { encoding: "utf8", mode: 0o600 }); await rename(tmp, this.filePath); }
    catch (e) { await unlink(tmp).catch(() => undefined); throw e; }
  }
}
/** One owner per journal; no lock shared with auth or another FxEngine. */
export class FxEngine {
  private queue: Promise<void> = Promise.resolve();
  private constructor(private readonly store: FxStore, private checkpoint: Checkpoint, private state: State, private readonly actorGuard: boolean) {}
  static async open(store: FxStore, config?: unknown, options?: { actorGuard?: unknown }): Promise<FxEngine> {
    const actorGuard = actorGuardEnabled(options);
    const raw = await store.load();
    if (raw !== null) {
      const saved = readCheckpoint(raw);
      if (config !== undefined && canonical(parseGenesis(config)) !== canonical(saved.checkpoint.genesis)) throw new Error("FX_GENESIS_MISMATCH");
      return new FxEngine(store, saved.checkpoint, saved.state, actorGuard);
    }
    if (config === undefined) throw new Error("FX_GENESIS_REQUIRED");
    const genesis = parseGenesis(config), state = createFx(genesis), checkpoint: Checkpoint = { v: 1, genesis, frames: [], stateSha256: stateHash(state) };
    await store.save(checkpoint); return new FxEngine(store, checkpoint, state, actorGuard);
  }
  snapshot(): State { return structuredClone(this.state); }
  view() { return publicFx(this.state); }
  preview(command: unknown, context?: unknown) {
    const options: FxActorOptions | undefined = this.actorGuard
      ? { actorGuard: true, contexts: context === undefined ? undefined : this.contextMap(command, context) }
      : undefined;
    return previewFx(this.state, command, options);
  }
  observe(rawFrames: readonly unknown[], contexts?: unknown): Promise<State> {
    let captured: Frame[];
    try {
      if (!isPlainJson(rawFrames)) throw new Error("INVALID_FX_FRAME");
      captured = rawFrames.map(parseFrame);
      if (this.actorGuard) authorizeFxCommands(captured.flatMap((f) => f.commands), { actorGuard: true, contexts });
    } catch (e) { return Promise.reject(e); }
    const run = this.queue.then(async () => {
      const next = advanceFx(this.state, captured, this.actorGuard ? { actorGuard: true, contexts } : undefined), frames = [...this.checkpoint.frames];
      let lastTick = this.state.tick;
      for (const f of captured) if (f.tick > lastTick) { frames.push(f); lastTick = f.tick; }
      const checkpoint: Checkpoint = { v: 1, genesis: this.checkpoint.genesis, frames, stateSha256: stateHash(next) };
      await this.store.save(checkpoint); this.checkpoint = checkpoint; this.state = next; return this.snapshot();
    });
    this.queue = run.then(() => undefined, () => undefined); return run;
  }
  private contextMap(command: unknown, context: unknown): Record<string, unknown> {
    const parsed = parseCommand(command);
    return { [parsed.id]: context };
  }
}
