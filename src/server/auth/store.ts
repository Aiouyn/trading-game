import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AccountRecord, PlayerPrivateRecord, SessionRecord } from "./types";

export interface AuthStoreSnapshot {
  readonly accounts: AccountRecord[];
  readonly sessions: SessionRecord[];
  readonly players: PlayerPrivateRecord[];
}

export interface AuthStore {
  load(): Promise<AuthStoreSnapshot>;
  save(snapshot: AuthStoreSnapshot): Promise<void>;
}

export class MemoryAuthStore implements AuthStore {
  private snapshot: AuthStoreSnapshot = { accounts: [], sessions: [], players: [] };

  async load(): Promise<AuthStoreSnapshot> {
    return {
      accounts: this.snapshot.accounts.map((a) => ({ ...a })),
      sessions: this.snapshot.sessions.map((s) => ({ ...s })),
      players: this.snapshot.players.map((p) => ({
        ...p,
        positions: { ...p.positions },
        openOrderIds: [...p.openOrderIds],
      })),
    };
  }

  async save(snapshot: AuthStoreSnapshot): Promise<void> {
    this.snapshot = {
      accounts: snapshot.accounts.map((a) => ({ ...a })),
      sessions: snapshot.sessions.map((s) => ({ ...s })),
      players: snapshot.players.map((p) => ({
        ...p,
        positions: { ...p.positions },
        openOrderIds: [...p.openOrderIds],
      })),
    };
  }
}

/**
 * JSON file store under `.data/auth/` — survives process restart for local M1.
 * Atomic write via temp + rename. Not for multi-instance production (M3 owns hosting).
 */
export class FileAuthStore implements AuthStore {
  readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<AuthStoreSnapshot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      return normalizeSnapshot(parsed);
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
      if (code === "ENOENT") return { accounts: [], sessions: [], players: [] };
      throw err;
    }
  }

  async save(snapshot: AuthStoreSnapshot): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const body = JSON.stringify(
      {
        accounts: snapshot.accounts,
        sessions: snapshot.sessions,
        players: snapshot.players,
      },
      null,
      0,
    );
    await writeFile(tmp, body, { encoding: "utf8", mode: 0o600 });
    await rename(tmp, this.filePath);
  }
}

function normalizeSnapshot(parsed: unknown): AuthStoreSnapshot {
  if (!parsed || typeof parsed !== "object") return { accounts: [], sessions: [], players: [] };
  const obj = parsed as Record<string, unknown>;
  const accounts = Array.isArray(obj.accounts) ? (obj.accounts as AccountRecord[]) : [];
  const sessions = Array.isArray(obj.sessions) ? (obj.sessions as SessionRecord[]) : [];
  const players = Array.isArray(obj.players) ? (obj.players as PlayerPrivateRecord[]) : [];
  return { accounts, sessions, players };
}
