/**
 * Atomic, rotated copies of the on-disk store (M3-05).
 * A snapshot is visible only after its staging directory is renamed into place.
 * Restore checks hashes before it replaces a live directory.
 */
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { BACKUP_LOCK_NAME, LiveLockError, liveServerPid, SERVER_LOCK_NAME, uniqueSnapshotSuffix, withBackupLock } from "@/server/ops/serverLock";

export const BACKUP_KEEP_DEFAULT = 7;
export const MANIFEST_NAME = "manifest.json";
const MANIFEST_VERSION = 1;

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

export interface StoreRoot {
  readonly name: string;
  readonly dir: string;
}

export interface BackupFileEntry {
  readonly root: string;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface BackupManifest {
  readonly v: typeof MANIFEST_VERSION;
  readonly id: string;
  readonly createdAt: string;
  readonly roots: readonly string[];
  readonly files: readonly BackupFileEntry[];
}

export interface BackupPlan {
  readonly id: string;
  readonly dir: string;
  readonly files: readonly BackupFileEntry[];
}

const ID_RE = /^\d{8}T\d{9}Z(?:-[a-z0-9]+)*$/;

export function resolveBackupDir(env: NodeJS.ProcessEnv, cwd: string): string {
  const raw = env.QUAY_BACKUP_DIR?.trim();
  return path.resolve(cwd, raw && raw.length > 0 ? raw : ".data-backups");
}

/** Live store directories. Server env dirs outside QUAY_DATA_DIR are extra roots. */
export function resolveStoreRoots(env: NodeJS.ProcessEnv, cwd: string): StoreRoot[] {
  const data = path.resolve(cwd, env.QUAY_DATA_DIR?.trim() || ".data");
  const roots: StoreRoot[] = [{ name: "data", dir: data }];
  const extras: readonly (readonly [string, string | undefined])[] = [
    ["auth", env.QUAY_AUTH_DATA_DIR],
    ["storm", env.QUAY_STORM_DATA_DIR],
    ["telemetry", env.QUAY_TELEMETRY_DIR],
  ];
  for (const [name, raw] of extras) {
    if (!raw?.trim()) continue;
    const dir = path.resolve(cwd, raw.trim());
    if (roots.some((r) => r.dir === dir || strictlyInside(r.dir, dir))) continue;
    const parent = roots.find((r) => strictlyInside(dir, r.dir));
    if (parent) {
      throw new BackupError(
        `${name} directory ${dir} contains ${parent.dir}. Point QUAY_DATA_DIR at the parent, or keep server directories inside it.`,
      );
    }
    roots.push({ name, dir });
  }
  return roots;
}

function strictlyInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function stamp(d: Date): string {
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1, 2)}${p(d.getUTCDate(), 2)}T${p(d.getUTCHours(), 2)}${p(d.getUTCMinutes(), 2)}${p(d.getUTCSeconds(), 2)}${p(d.getUTCMilliseconds(), 3)}Z`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (err) {
    if (codeOf(err) === "ENOENT") return false;
    throw err;
  }
}

function codeOf(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : undefined;
}

function assertSeparated(roots: readonly StoreRoot[], backupDir: string): void {
  for (const root of roots) {
    if (root.dir === backupDir || strictlyInside(root.dir, backupDir) || strictlyInside(backupDir, root.dir)) {
      throw new BackupError(
        `Backup directory ${backupDir} overlaps store ${root.name} (${root.dir}). Set QUAY_BACKUP_DIR outside the live store.`,
      );
    }
  }
}

async function presentRoots(roots: readonly StoreRoot[]): Promise<StoreRoot[]> {
  const out: StoreRoot[] = [];
  for (const root of roots) {
    try {
      const s = await stat(root.dir);
      if (!s.isDirectory()) throw new BackupError(`${root.name} store is not a directory: ${root.dir}`);
      out.push(root);
    } catch (err) {
      if (err instanceof BackupError) throw err;
      if (codeOf(err) === "ENOENT") continue;
      throw err;
    }
  }
  if (out.length === 0) {
    throw new BackupError("No store directory exists. Create .data or set QUAY_DATA_DIR / QUAY_AUTH_DATA_DIR / QUAY_STORM_DATA_DIR / QUAY_TELEMETRY_DIR.");
  }
  return out;
}

function relPosix(root: string, file: string): string {
  const rel = path.relative(root, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new BackupError(`Refusing to back up a path outside ${root}: ${file}`);
  return rel.split(path.sep).join("/");
}

function snapshotFile(dir: string, file: BackupFileEntry): string {
  const parts = file.path.split("/");
  if (parts.length === 0 || parts.some((p) => p === "" || p === "." || p === "..")) {
    throw new BackupError(`Refusing backup path ${file.path}.`);
  }
  const full = path.resolve(dir, file.root, ...parts);
  const back = path.relative(dir, full);
  if (back.startsWith("..") || path.isAbsolute(back)) throw new BackupError(`Refusing backup path ${file.path}.`);
  return full;
}

function destFromRel(root: string, rel: string): string {
  if (rel.startsWith("/") || rel.includes("\0") || rel.includes("\\")) {
    throw new BackupError(`Refusing backup path ${rel}.`);
  }
  const parts = rel.split("/");
  if (parts.length === 0 || parts.some((p) => p === "" || p === "." || p === "..")) {
    throw new BackupError(`Refusing backup path ${rel}.`);
  }
  const dest = path.resolve(root, ...parts);
  const back = path.relative(root, dest);
  if (back.startsWith("..") || path.isAbsolute(back)) throw new BackupError(`Refusing backup path ${rel}.`);
  return dest;
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === SERVER_LOCK_NAME || ent.name === BACKUP_LOCK_NAME) continue;
    if (ent.name.endsWith(".tmp") || ent.name.startsWith(".partial")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isSymbolicLink()) throw new BackupError(`Refusing to back up a symlink: ${full}`);
    if (ent.isDirectory()) out.push(...await listFiles(full));
    else if (ent.isFile()) out.push(full);
    else throw new BackupError(`Refusing to back up a non-regular file: ${full}`);
  }
  return out;
}

async function fingerprint(file: string): Promise<{ sha256: string; bytes: number }> {
  const buf = await readFile(file);
  return { sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.byteLength };
}

async function uniqueId(backupDir: string, now: Date): Promise<string> {
  const base = `${stamp(now)}-${uniqueSnapshotSuffix()}`;
  for (let n = 0; n < 100; n++) {
    const id = n === 0 ? base : `${base}-${n}`;
    if (!ID_RE.test(id)) throw new BackupError(`Internal backup id ${id} is not safe.`);
    if (!(await exists(path.join(backupDir, id)))) return id;
  }
  throw new BackupError("Could not allocate a backup id.");
}

async function clearPartials(backupDir: string): Promise<void> {
  if (!(await exists(backupDir))) return;
  for (const ent of await readdir(backupDir, { withFileTypes: true })) {
    if (ent.name.startsWith(".partial-")) await rm(path.join(backupDir, ent.name), { recursive: true, force: true });
  }
}

async function lockDown(dir: string): Promise<void> {
  await chmod(dir, 0o700);
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) await lockDown(p);
    else await chmod(p, 0o600);
  }
}

export async function listBackupIds(backupDir: string): Promise<string[]> {
  if (!(await exists(backupDir))) return [];
  const ids: string[] = [];
  for (const ent of await readdir(backupDir, { withFileTypes: true })) {
    if (!ent.isDirectory() || !ID_RE.test(ent.name)) continue;
    if (await exists(path.join(backupDir, ent.name, MANIFEST_NAME))) ids.push(ent.name);
  }
  ids.sort((a, b) => {
    if (a === b) return 0;
    return a < b ? 1 : -1;
  });
  return ids;
}

async function readManifest(dir: string): Promise<BackupManifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path.join(dir, MANIFEST_NAME), "utf8")) as unknown;
  } catch {
    throw new BackupError(`Backup ${dir} has no readable manifest.`);
  }
  if (!parsed || typeof parsed !== "object") throw new BackupError(`Backup manifest in ${dir} is not an object.`);
  const o = parsed as Record<string, unknown>;
  if (o.v !== MANIFEST_VERSION || typeof o.id !== "string" || !ID_RE.test(o.id)) {
    throw new BackupError(`Backup manifest in ${dir} is not version ${MANIFEST_VERSION}.`);
  }
  if (!Array.isArray(o.roots) || !o.roots.every((r) => typeof r === "string")) {
    throw new BackupError(`Backup manifest in ${dir} has no root list.`);
  }
  if (!Array.isArray(o.files)) throw new BackupError(`Backup manifest in ${dir} has no file list.`);
  const files: BackupFileEntry[] = [];
  for (const row of o.files) {
    if (!row || typeof row !== "object") throw new BackupError(`Backup manifest in ${dir} has a bad file row.`);
    const f = row as Record<string, unknown>;
    if (typeof f.root !== "string" || typeof f.path !== "string" || typeof f.sha256 !== "string" || typeof f.bytes !== "number") {
      throw new BackupError(`Backup manifest in ${dir} has a bad file row.`);
    }
    if (!/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes < 0) {
      throw new BackupError(`Backup manifest hash for ${f.path} is not usable.`);
    }
    files.push({ root: f.root, path: f.path, bytes: f.bytes, sha256: f.sha256 });
  }
  return { v: MANIFEST_VERSION, id: o.id, createdAt: typeof o.createdAt === "string" ? o.createdAt : "", roots: o.roots, files };
}

async function assertSnapshotMatches(dir: string, manifest: BackupManifest): Promise<void> {
  const expected = new Set(manifest.files.map((f) => `${f.root}/${f.path}`));
  const seen = new Set<string>();
  async function walk(current: string, rel: string): Promise<void> {
    for (const ent of await readdir(current, { withFileTypes: true })) {
      if (ent.isSymbolicLink()) throw new BackupError(`Backup ${dir} contains a symlink (${ent.name}).`);
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) await walk(full, childRel);
      else if (ent.isFile()) {
        if (childRel === MANIFEST_NAME) continue;
        seen.add(childRel);
      } else throw new BackupError(`Backup ${dir} contains a non-regular file (${childRel}).`);
    }
  }
  await walk(dir, "");
  for (const name of seen) {
    if (!expected.has(name)) throw new BackupError(`Backup ${manifest.id} has an extra file ${name}.`);
  }
  for (const name of expected) {
    if (!seen.has(name)) throw new BackupError(`Backup ${manifest.id} is missing ${name}.`);
  }
  for (const file of manifest.files) {
    const full = snapshotFile(dir, file);
    const got = await fingerprint(full);
    if (got.sha256 !== file.sha256 || got.bytes !== file.bytes) {
      throw new BackupError(`Backup ${manifest.id} failed its hash check for ${file.root}/${file.path}.`);
    }
  }
}

export async function planBackup(opts: {
  readonly roots: readonly StoreRoot[];
  readonly backupDir: string;
  readonly now?: Date;
}): Promise<BackupPlan> {
  assertSeparated(opts.roots, opts.backupDir);
  const roots = await presentRoots(opts.roots);
  const now = opts.now ?? new Date();
  const id = await uniqueId(opts.backupDir, now);
  const files: BackupFileEntry[] = [];
  for (const root of roots) {
    for (const file of (await listFiles(root.dir)).sort()) {
      const fp = await fingerprint(file);
      files.push({ root: root.name, path: relPosix(root.dir, file), ...fp });
    }
  }
  return { id, dir: path.join(opts.backupDir, id), files };
}

export async function backupDataStore(opts: {
  readonly roots: readonly StoreRoot[];
  readonly backupDir: string;
  readonly keep?: number;
  readonly now?: Date;
  readonly dryRun?: boolean;
  /** How long to wait for another backup to finish. Default 30s. */
  readonly lockWaitMs?: number;
}): Promise<BackupPlan> {
  const keep = opts.keep ?? BACKUP_KEEP_DEFAULT;
  if (!Number.isInteger(keep) || keep < 1) throw new BackupError(`Backup keep count must be a positive integer (got ${String(opts.keep)}).`);
  if (opts.dryRun) return planBackup(opts);
  await mkdir(opts.backupDir, { recursive: true, mode: 0o700 });
  await chmod(opts.backupDir, 0o700);
  return withStoreLock(opts.backupDir, opts.lockWaitMs ?? 30_000, async () => publishBackup(opts, keep));
}

async function publishBackup(opts: {
  readonly roots: readonly StoreRoot[];
  readonly backupDir: string;
  readonly now?: Date;
}, keep: number): Promise<BackupPlan> {
  await clearPartials(opts.backupDir);
  const id = await uniqueId(opts.backupDir, opts.now ?? new Date());
  const stage = path.join(opts.backupDir, `.partial-${id}`);
  const finalDir = path.join(opts.backupDir, id);
  let published = false;
  try {
    await mkdir(stage, { recursive: true, mode: 0o700 });
    const files: BackupFileEntry[] = [];
    const roots = await presentRoots(opts.roots);
    for (const root of roots) {
      for (const file of (await listFiles(root.dir)).sort()) {
        const rel = relPosix(root.dir, file);
        const dest = path.join(stage, root.name, ...rel.split("/"));
        await mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
        await copyFile(file, dest);
        const fp = await fingerprint(dest);
        files.push({ root: root.name, path: rel, ...fp });
      }
    }
    const manifest: BackupManifest = {
      v: MANIFEST_VERSION,
      id,
      createdAt: (opts.now ?? new Date()).toISOString(),
      roots: roots.map((r) => r.name),
      files,
    };
    await writeFile(path.join(stage, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await lockDown(stage);
    await rename(stage, finalDir);
    published = true;
    const ids = await listBackupIds(opts.backupDir);
    for (const old of ids.slice(keep)) await rm(path.join(opts.backupDir, old), { recursive: true, force: true });
    return { id, dir: finalDir, files };
  } finally {
    if (!published) await rm(stage, { recursive: true, force: true });
  }
}

export async function planRestore(opts: {
  readonly roots: readonly StoreRoot[];
  readonly backupDir: string;
  readonly id?: string;
}): Promise<{ id: string; files: readonly BackupFileEntry[] }> {
  const ids = await listBackupIds(opts.backupDir);
  const id = opts.id ?? ids[0];
  if (!id || !ID_RE.test(id)) {
    throw new BackupError(
      opts.id
        ? `No completed backup named ${opts.id} in ${opts.backupDir}.`
        : `No completed backup in ${opts.backupDir}. Run scripts/ops/backup-data.ts first.`,
    );
  }
  if (!ids.includes(id)) throw new BackupError(`No completed backup named ${id} in ${opts.backupDir}.`);
  const dir = path.join(opts.backupDir, id);
  const manifest = await readManifest(dir);
  if (manifest.id !== id) throw new BackupError(`Backup directory ${id} does not match its manifest id ${manifest.id}.`);
  await assertSnapshotMatches(dir, manifest);
  for (const name of manifest.roots) {
    if (!opts.roots.some((r) => r.name === name)) {
      throw new BackupError(`Backup ${id} includes store root "${name}", which the current env does not name. Set the matching QUAY_*_DIR before restore.`);
    }
  }
  for (const file of manifest.files) destFromRel(opts.roots.find((r) => r.name === file.root)!.dir, file.path);
  return { id, files: manifest.files };
}

export async function restoreDataStore(opts: {
  readonly roots: readonly StoreRoot[];
  readonly backupDir: string;
  readonly id?: string;
  readonly lockWaitMs?: number;
}): Promise<{ id: string; files: number }> {
  return withStoreLock(opts.backupDir, opts.lockWaitMs ?? 30_000, async () => {
  const plan = await planRestore(opts);
  const dir = path.join(opts.backupDir, plan.id);
  const manifest = await readManifest(dir);
  const dests = manifest.roots.map((name) => opts.roots.find((r) => r.name === name)!.dir);
  await assertDirsIdle(dests);
  const staged: { stage: string; dest: string }[] = [];
  try {
    for (const name of manifest.roots) {
      const root = opts.roots.find((r) => r.name === name)!;
      const stage = path.join(path.dirname(root.dir), `.${path.basename(root.dir)}.staging-${plan.id}`);
      await rm(stage, { recursive: true, force: true });
      await mkdir(stage, { recursive: true, mode: 0o700 });
      for (const file of manifest.files.filter((f) => f.root === name)) {
        const from = snapshotFile(dir, file);
        const to = destFromRel(stage, file.path);
        await mkdir(path.dirname(to), { recursive: true, mode: 0o700 });
        await copyFile(from, to);
        await chmod(to, 0o600);
      }
      await lockDown(stage);
      staged.push({ stage, dest: root.dir });
    }
    await assertDirsIdle(dests);
    const prevs: string[] = [];
    for (const item of staged) {
      const prev = await swapDir(item.stage, item.dest);
      if (prev) prevs.push(prev);
    }
    for (const prev of prevs) await rm(prev, { recursive: true, force: true });
  } catch (err) {
    for (const item of staged) await rm(item.stage, { recursive: true, force: true });
    throw err;
  }
  return { id: plan.id, files: plan.files.length };
  });
}

async function assertDirsIdle(dirs: readonly string[]): Promise<void> {
  for (const dir of dirs) {
    const pid = await liveServerPid(dir);
    if (pid !== null) {
      throw new BackupError(`Refusing to restore ${dir}: server pid ${pid} is still running. Stop it, then run restore again.`);
    }
  }
}

async function withStoreLock<T>(backupDir: string, waitMs: number, fn: () => Promise<T>): Promise<T> {
  try {
    return await withBackupLock(backupDir, waitMs, fn);
  } catch (err) {
    if (err instanceof LiveLockError) throw new BackupError(err.message);
    throw err;
  }
}

/** Returns the path of the previous directory when one was moved aside. */
async function swapDir(stage: string, dest: string): Promise<string | null> {
  await mkdir(path.dirname(dest), { recursive: true });
  const prev = path.join(path.dirname(dest), `.${path.basename(dest)}.prev-${process.pid}-${Date.now()}`);
  let moved = false;
  try {
    await rename(dest, prev);
    moved = true;
  } catch (err) {
    if (codeOf(err) !== "ENOENT") throw err;
  }
  try {
    await rename(stage, dest);
  } catch (err) {
    if (moved) await rename(prev, dest).catch(() => undefined);
    throw err;
  }
  return moved ? prev : null;
}
