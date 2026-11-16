// The command log written beside a world snapshot. Replay reads this file, not the snapshot.
import fs from 'node:fs';
import path from 'node:path';
import type { World } from '../../kernel/index.ts';

export interface PlayerLogFile {
  seed: string;
  scenario: { id: string; cash?: number; difficulty?: number; seed?: string } | null;
  commands: { day: number; playerId: string; cmd: unknown; status: 'accepted' | 'rejected'; why?: string }[];
  days: { day: number; hash: string }[];
}

export function writePlayerLog(dir: string, w: World): void {
  const st = w.state.player as {
    log?: PlayerLogFile['commands'];
    days?: PlayerLogFile['days'];
    script?: PlayerLogFile['scenario'];
  } | undefined;
  const body: PlayerLogFile = {
    seed: w.seed,
    scenario: st?.script ?? null,
    commands: st?.log ?? [],
    days: st?.days ?? [],
  };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'commands.json'), JSON.stringify(body));
}

export function readPlayerLog(file: string): PlayerLogFile {
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as PlayerLogFile;
  if (!data || typeof data.seed !== 'string' || !Array.isArray(data.commands) || !Array.isArray(data.days)) {
    throw new Error(`${file} is not a command log`);
  }
  return data;
}
