import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJson } from "./boundary";
import type { LiquidityCheckpointStore } from "./model";
const revisionOf = (bytes: string): string => createHash("sha256").update(bytes).digest("hex");
async function bytesAt(path: string): Promise<string | null> {
    try {
        return await readFile(path, "utf8");
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return null;
        throw error;
    }
}
/** Single path ownership with revision CAS; a stale facade cannot overwrite another committed owner. */
export class FileLiquidityCheckpointStore implements LiquidityCheckpointStore {
    constructor(private readonly path: string) {
    }
    async load(): Promise<{
        revision: string | null;
        payload: unknown;
    }> {
        const bytes = await bytesAt(this.path);
        return bytes === null ? { revision: null, payload: null } : { revision: revisionOf(bytes), payload: JSON.parse(bytes) };
    }
    async save(payload: unknown, expectedRevision: string | null): Promise<string> {
        const bytes = canonicalJson(payload) + "\n";
        await mkdir(dirname(this.path), { recursive: true });
        const lock = await open(this.path + ".lock", "wx", 0o600);
        const temporary = this.path + "." + randomUUID() + ".tmp";
        try {
            const previous = await bytesAt(this.path), actual = previous === null ? null : revisionOf(previous);
            if (actual !== expectedRevision)
                throw new Error("LIQUIDITY_STALE_STORE");
            const file = await open(temporary, "wx", 0o600);
            try {
                await file.writeFile(bytes);
                await file.sync();
            }
            finally {
                await file.close();
            }
            await rename(temporary, this.path);
            return revisionOf(bytes);
        }
        finally {
            await lock.close().catch(() => {
            });
            await unlink(temporary).catch(() => {
            });
            await unlink(this.path + ".lock").catch(() => {
            });
        }
    }
}
