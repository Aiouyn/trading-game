import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { ActorBinding } from "@/server/actor-binding";
import {
  actorGuardEnabled,
  assertLiveFarmCommand,
  authorizeFarmCommand,
  bindingForGuard,
  type MemeActorOptions,
} from "./actor";
import { commandFarm, advanceFarm } from "./engine";
import { parseFarm } from "./checkpoint";
import { FARM_LIMITS, parseFarmCommand, parseFarmFrames } from "./boundary";
import type { FarmCommand, FarmFrame, FarmReply, FarmState } from "./model";

export { MEME_ACTOR_DEFAULT_ENABLED } from "./actor";

export interface FarmStore { load(): Promise<FarmState | null>; save(state: FarmState): Promise<void> }
/** Single-owner store. One engine owns a path; never mount the same path in two processes. */
export class FileFarmStore implements FarmStore {
  constructor(private readonly path: string) {}
  async load(): Promise<FarmState | null> {
    let text: string;
    try {
      if ((await stat(this.path)).size > FARM_LIMITS.checkpointBytes) throw new Error("BAD_FARM_CHECKPOINT"); // before reading
      text = await readFile(this.path, "utf8");
    }
    catch (err) { if (err instanceof Error && "code" in err && err.code === "ENOENT") return null; throw err; }
    return parseFarm(JSON.parse(text));
  }
  async save(state: FarmState): Promise<void> {
    const validated = parseFarm(state), json = JSON.stringify(validated);
    if (Buffer.byteLength(json, "utf8") > FARM_LIMITS.checkpointBytes) throw new Error("BAD_FARM_CHECKPOINT"); // before writing
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    try { await writeFile(temp, json, { flag: "wx", mode: 0o600 }); await rename(temp, this.path); }
    finally { await unlink(temp).catch((err: unknown) => { if (!(err instanceof Error && "code" in err && err.code === "ENOENT")) throw err; }); }
  }
}
/** Serializes in-process commands; publish only after the whole checkpoint save succeeds. */
export class FailureFarmEngine {
  private queue: Promise<void> = Promise.resolve();
  private constructor(
    private state: FarmState,
    private readonly store: FarmStore,
    private readonly actorGuard: boolean,
    private readonly binding: ActorBinding | null,
  ) {}
  static async open(store: FarmStore, genesis?: FarmState, options?: { actorGuard?: unknown; binding?: unknown }): Promise<FailureFarmEngine> {
    const actorGuard = actorGuardEnabled(options);
    const binding = actorGuard ? bindingForGuard(options) : null;
    const loaded = await store.load();
    if (loaded) return new FailureFarmEngine(parseFarm(loaded), store, actorGuard, binding);
    if (!genesis) throw new Error("MISSING_FARM_CHECKPOINT");
    const state = parseFarm(genesis); await store.save(state);
    return new FailureFarmEngine(state, store, actorGuard, binding);
  }
  snapshot(): FarmState { return structuredClone(this.state); }
  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = this.queue.then(run); this.queue = result.then(() => undefined, () => undefined); return result;
  }
  private guardOptions(command: FarmCommand, context?: unknown): MemeActorOptions | undefined {
    if (!this.actorGuard) return undefined;
    return {
      actorGuard: true,
      binding: this.binding,
      contexts: context === undefined ? undefined : { [command.key]: context },
    };
  }
  /** Compute a launch or trade reply without writing. Re-peeks immediately before acting when the guard is on. */
  preview(input: unknown, context?: unknown): Promise<FarmReply> {
    let cmd: FarmCommand;
    try { cmd = parseFarmCommand(input); } catch (err) { return Promise.reject(err); }
    return this.enqueue(async () => {
      const options = this.guardOptions(cmd, context);
      if (this.actorGuard) {
        authorizeFarmCommand(cmd, options);
        await assertLiveFarmCommand(cmd, options);
      }
      return commandFarm(this.state, cmd, options).reply;
    });
  }
  execute(input: unknown, context?: unknown): Promise<FarmReply> {
    let cmd: FarmCommand;
    try { cmd = parseFarmCommand(input); } catch (err) { return Promise.reject(err); }
    return this.enqueue(async () => {
      const options = this.guardOptions(cmd, context);
      if (this.actorGuard) {
        authorizeFarmCommand(cmd, options);
        await assertLiveFarmCommand(cmd, options);
      }
      const next = commandFarm(this.state, cmd, options);
      if (next.state !== this.state) {
        if (this.actorGuard) await assertLiveFarmCommand(cmd, options);
        await this.store.save(next.state); this.state = next.state;
      }
      return next.reply;
    });
  }
  advance(input: unknown): Promise<void> {
    let frames: FarmFrame[];
    try { frames = parseFarmFrames(input); } catch (err) { return Promise.reject(err); }
    return this.enqueue(async () => {
      const next = advanceFarm(this.state, frames);
      if (next !== this.state) { await this.store.save(next); this.state = next; }
    });
  }
}
