import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { link, mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { canonicalJson } from "./boundary";
import type { CoreStore } from "./model";
const revisionOf = (bytes: string): string => createHash("sha256").update(bytes).digest("hex");
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
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
async function writeDurably(path: string, bytes: string): Promise<void> {
    const file = await open(path, "wx", 0o600);
    try {
        await file.writeFile(bytes);
        await file.sync();
    }
    finally {
        await file.close();
    }
}
async function syncDirectory(path: string): Promise<void> {
    const dir = await open(path, "r");
    try {
        await dir.sync();
    }
    finally {
        await dir.close();
    }
}
/** Lock owner record. It is published complete with link(), so a reader never sees a half-written owner. */
export interface StoreLockOwner { pid: number; host: string; nonce: string; }
function parseOwner(bytes: string | null): StoreLockOwner | null {
    if (bytes === null)
        return null;
    try {
        const v = JSON.parse(bytes) as Partial<StoreLockOwner>;
        return typeof v.pid === "number" && Number.isSafeInteger(v.pid) && v.pid > 0 && typeof v.host === "string" && typeof v.nonce === "string" ? { pid: v.pid, host: v.host, nonce: v.nonce } : null;
    }
    catch {
        return null;
    }
}
function processAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
}
/**
 * Single path ownership with revision CAS; a stale facade cannot overwrite another committed owner.
 * Crash model: a writer killed at any point leaves either the previous or the new complete checkpoint at `path`
 * (temp file, fsync, rename, directory fsync). A lock left by a dead process on this host is recovered once;
 * a lock held by a live process, by another host, or without a readable owner record is never broken.
 * Limits: pid reuse can make a dead owner look alive (fails closed); multi-host shared filesystems are not supported.
 */
export class FileBankingCoreStore implements CoreStore {
    constructor(private readonly path: string) {
    }
    async load(): Promise<{
        revision: string | null;
        payload: unknown;
    }> {
        const bytes = await bytesAt(this.path);
        return bytes === null ? { revision: null, payload: null } : { revision: revisionOf(bytes), payload: JSON.parse(bytes) };
    }
    private get lockPath(): string {
        return this.path + ".lock";
    }
    /** Publishes our owner record at the lock path, or throws BANKING_CORE_STORE_LOCKED. */
    private async acquire(owner: StoreLockOwner): Promise<void> {
        const staged = this.path + "." + owner.nonce + ".lock-owner";
        await writeDurably(staged, JSON.stringify(owner));
        try {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    await link(staged, this.lockPath);
                    return;
                }
                catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "EEXIST")
                        throw error;
                }
                const held = parseOwner(await bytesAt(this.lockPath));
                if (attempt > 0 || held === null || held.host !== owner.host || processAlive(held.pid))
                    throw new Error("BANKING_CORE_STORE_LOCKED");
                // Move the dead owner's lock aside atomically, then confirm that exact owner moved, not a newer one.
                const aside = this.path + "." + owner.nonce + ".lock-stale";
                try {
                    await rename(this.lockPath, aside);
                }
                catch (error) {
                    if ((error as NodeJS.ErrnoException).code === "ENOENT")
                        continue;
                    throw error;
                }
                const moved = parseOwner(await bytesAt(aside));
                if (moved?.nonce !== held.nonce) {
                    await link(aside, this.lockPath).catch(() => undefined);
                    await unlink(aside).catch(() => undefined);
                    throw new Error("BANKING_CORE_STORE_LOCKED");
                }
                await unlink(aside);
            }
            throw new Error("BANKING_CORE_STORE_LOCKED");
        }
        finally {
            await unlink(staged).catch(() => undefined);
        }
    }
    /**
     * Called only while holding the lock. Temp files are written only by lock holders, so any other temp file belongs
     * to a dead writer. A staged owner file is removed only when its pid is dead; it may belong to a live contender.
     */
    private async removeOrphans(keep: string): Promise<void> {
        const dir = dirname(this.path), name = basename(this.path), escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const orphan = new RegExp("^" + escaped + "\\.(" + UUID + ")\\.(tmp|lock-owner)$");
        for (const entry of await readdir(dir)) {
            const m = orphan.exec(entry);
            if (!m || m[1] === keep)
                continue;
            if (m[2] === "lock-owner") {
                const staged = parseOwner(await bytesAt(join(dir, entry)));
                if (staged !== null && processAlive(staged.pid))
                    continue;
            }
            await unlink(join(dir, entry)).catch(() => undefined);
        }
    }
    async save(payload: unknown, expectedRevision: string | null): Promise<string> {
        const bytes = canonicalJson(payload) + "\n";
        const dir = dirname(this.path);
        await mkdir(dir, { recursive: true });
        const owner: StoreLockOwner = { pid: process.pid, host: hostname(), nonce: randomUUID() };
        await this.acquire(owner);
        const temporary = this.path + "." + owner.nonce + ".tmp";
        try {
            await this.removeOrphans(owner.nonce);
            const previous = await bytesAt(this.path), actual = previous === null ? null : revisionOf(previous);
            if (actual !== expectedRevision)
                throw new Error("BANKING_CORE_STALE_STORE");
            await writeDurably(temporary, bytes);
            await rename(temporary, this.path);
            await syncDirectory(dir);
            return revisionOf(bytes);
        }
        finally {
            await unlink(temporary).catch(() => undefined);
            if (parseOwner(await bytesAt(this.lockPath))?.nonce === owner.nonce)
                await unlink(this.lockPath).catch(() => undefined);
        }
    }
}
