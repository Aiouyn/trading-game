import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { BindingError, makeCheckpoint, parseCheckpoint, type BindingCheckpoint } from "./model";

function isErrno(err: unknown): err is { code?: string } {
  return typeof err === "object" && err !== null && "code" in err;
}

export interface BindingStore {
  load(): Promise<unknown | null>;
  save(checkpoint: BindingCheckpoint): Promise<void>;
}

export class MemoryBindingStore implements BindingStore {
  private payload: BindingCheckpoint | null = null;

  async load(): Promise<unknown | null> {
    return this.payload === null ? null : structuredClone(this.payload);
  }

  async save(checkpoint: BindingCheckpoint): Promise<void> {
    this.payload = structuredClone(parseCheckpoint(checkpoint));
  }
}

export class FileBindingStore implements BindingStore {
  constructor(readonly filePath: string) {}

  async load(): Promise<unknown | null> {
    try {
      const value: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (value === null) throw new BindingError("INVALID_BINDING_CHECKPOINT");
      return value;
    } catch (err) {
      if (isErrno(err) && err.code === "ENOENT") return null;
      throw err;
    }
  }

  async save(checkpoint: BindingCheckpoint): Promise<void> {
    const content = `${JSON.stringify(makeCheckpoint(parseCheckpoint(checkpoint).bindings))}\n`;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, content, { encoding: "utf8", mode: 0o600 });
      await rename(tmp, this.filePath);
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      throw err;
    }
  }
}
