import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { clonePlayerPrivate, parsePlayerPrivateRow } from "@/server/player";
import type { AccountRecord, PlayerPrivateRecord, SessionRecord } from "./types";
import {
  clonePlayerWirePost,
  cloneWirePostIntent,
  parsePlayerWirePosts,
  parseWirePostIntents,
  type PlayerWirePost,
  type WirePostIntent,
} from "@/server/wire/playerStatements";

export interface AuthStoreSnapshot {
  readonly accounts: AccountRecord[];
  readonly sessions: SessionRecord[];
  readonly players: PlayerPrivateRecord[];
  /** Public player Wire statements (`soc.wire.post`). Missing key = none. A bad row is skipped, never a store load failure. */
  readonly wirePosts: PlayerWirePost[];
  /** Private idempotency records for Wire posts, never served on GET /api/wire. */
  readonly wirePostIntents: WirePostIntent[];
  /**
   * players[] rows that could not be loaded (corrupt, unknown version, lossy legacy, duplicate).
   * Kept verbatim and re-written on every save — never silently dropped. Their accounts read as
   * LEDGER_QUARANTINED until repaired by hand.
   */
  readonly quarantinedPlayers: QuarantinedPlayerRow[];
  /**
   * The Launchpad section (src/server/launchpad/state.ts), saved as it is: the auth service parses it and, when it cannot,
   * writes the raw value back unchanged. Absent on a store that never had a launch.
   */
  readonly launchpad?: unknown;
}

export interface QuarantinedPlayerRow {
  readonly accountId: string | null;
  readonly reason: string;
  readonly row: unknown;
}

const emptySnapshot = (): AuthStoreSnapshot => ({ accounts: [], sessions: [], players: [], quarantinedPlayers: [], wirePosts: [], wirePostIntents: [] });

function cloneSnapshot(s: AuthStoreSnapshot): AuthStoreSnapshot {
  return {
    accounts: s.accounts.map((a) => ({ ...a })),
    sessions: s.sessions.map((x) => ({ ...x })),
    players: s.players.map(clonePlayerPrivate),
    quarantinedPlayers: s.quarantinedPlayers.map((q) => structuredClone(q)),
    wirePosts: s.wirePosts.map(clonePlayerWirePost),
    wirePostIntents: s.wirePostIntents.map(cloneWirePostIntent),
    ...(s.launchpad === undefined ? {} : { launchpad: structuredClone(s.launchpad) }),
  };
}

export interface AuthStore {
  load(): Promise<AuthStoreSnapshot>;
  save(snapshot: AuthStoreSnapshot): Promise<void>;
}

export class MemoryAuthStore implements AuthStore {
  private snapshot: AuthStoreSnapshot = emptySnapshot();

  async load(): Promise<AuthStoreSnapshot> {
    return cloneSnapshot(this.snapshot);
  }

  async save(snapshot: AuthStoreSnapshot): Promise<void> {
    this.snapshot = cloneSnapshot(snapshot);
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
      if (code === "ENOENT") return emptySnapshot();
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
        quarantinedPlayers: snapshot.quarantinedPlayers,
        wirePosts: snapshot.wirePosts,
        wirePostIntents: snapshot.wirePostIntents,
        launchpad: snapshot.launchpad,
      },
      null,
      0,
    );
    await writeFile(tmp, body, { encoding: "utf8", mode: 0o600 });
    await rename(tmp, this.filePath);
  }
}

function normalizeSnapshot(parsed: unknown): AuthStoreSnapshot {
  if (!parsed || typeof parsed !== "object") return emptySnapshot();
  const obj = parsed as Record<string, unknown>;
  const accounts = Array.isArray(obj.accounts) ? (obj.accounts as AccountRecord[]) : [];
  const sessions = Array.isArray(obj.sessions) ? (obj.sessions as SessionRecord[]) : [];
  const quarantinedPlayers: QuarantinedPlayerRow[] = [];
  if (Array.isArray(obj.quarantinedPlayers)) {
    for (const q of obj.quarantinedPlayers as QuarantinedPlayerRow[]) quarantinedPlayers.push(q);
  }
  const byAccount = new Map<string, PlayerPrivateRecord>();
  const rawById = new Map<string, unknown>();
  if (Array.isArray(obj.players)) {
    for (const row of obj.players) {
      const rowId =
        row && typeof row === "object" && typeof (row as { accountId?: unknown }).accountId === "string"
          ? ((row as { accountId: string }).accountId)
          : null;
      const parsedRow = parsePlayerPrivateRow(row);
      if (!parsedRow.ok) {
        quarantinedPlayers.push({ accountId: rowId, reason: parsedRow.reason, row });
        continue;
      }
      const id = parsedRow.record.accountId;
      if (byAccount.has(id)) {
        // Two ledgers for one account: neither is trustworthy; keep both raw rows.
        quarantinedPlayers.push({ accountId: id, reason: "duplicate ledger row", row: rawById.get(id) });
        quarantinedPlayers.push({ accountId: id, reason: "duplicate ledger row", row });
        byAccount.delete(id);
        continue;
      }
      if (quarantinedPlayers.some((q) => q.accountId === id)) {
        quarantinedPlayers.push({ accountId: id, reason: "ledger row alongside a quarantined row", row });
        continue;
      }
      byAccount.set(id, parsedRow.record);
      rawById.set(id, row);
    }
  }
  return { accounts, sessions, players: [...byAccount.values()], quarantinedPlayers, wirePosts: parsePlayerWirePosts(obj.wirePosts), wirePostIntents: parseWirePostIntents(obj.wirePostIntents), ...(obj.launchpad === undefined ? {} : { launchpad: obj.launchpad }) };
}
