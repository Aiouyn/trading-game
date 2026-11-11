import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { advancePolicy, parsePolicyState, publicPolicy, type PolicyState } from "./engine";
import { isPlainJson, parseInputs, type CatalogInputs } from "./inputs";

export interface PolicyStore { load(): Promise<PolicyState | null>; save(state: PolicyState): Promise<void> }
export class FilePolicyStore implements PolicyStore {
  constructor(readonly filePath: string) {}
  async load(): Promise<PolicyState | null> {
    try { return parsePolicyState(JSON.parse(await readFile(this.filePath, "utf8"))); }
    catch (e) { if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") return null; throw e; }
  }
  async save(state: PolicyState): Promise<void> {
    const data = JSON.stringify(parsePolicyState(state));
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${randomUUID()}.tmp`;
    try { await writeFile(tmp, data, { encoding: "utf8", mode: 0o600 }); await rename(tmp, this.filePath); }
    catch (e) { await unlink(tmp).catch(() => undefined); throw e; }
  }
}
/** One owner per store path. Save before publication; inputs copied before queueing. */
export class PolicyRecoveryEngine {
  private queue: Promise<void> = Promise.resolve();
  private constructor(private readonly store: PolicyStore, private state: PolicyState) {}
  static async open(store: PolicyStore, genesis?: PolicyState): Promise<PolicyRecoveryEngine> {
    const saved = await store.load();
    if (saved) return new PolicyRecoveryEngine(store, parsePolicyState(saved));
    if (!genesis) throw new Error("POLICY_GENESIS_REQUIRED");
    const state = parsePolicyState(genesis); await store.save(state); return new PolicyRecoveryEngine(store, state);
  }
  snapshot(): PolicyState { return structuredClone(this.state); }
  view() { return publicPolicy(this.state); }
  observe(frames: readonly CatalogInputs[]): Promise<PolicyState> {
    let captured: CatalogInputs[];
    try { if (!isPlainJson(frames)) throw new Error("INVALID_CATALOG_INPUTS"); captured = frames.map(parseInputs); } catch (e) { return Promise.reject(e); }
    const run = this.queue.then(async () => { const next = advancePolicy(this.state, captured); await this.store.save(next); this.state = next; return this.snapshot(); });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }
}
