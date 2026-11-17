// Plain result of one bot on one world. No sim imports, so the parent process can aggregate
// without loading the world.

export interface Job { bot: string; seed: number; years: number }

export interface Jump {
  day: number;
  from: number;
  to: number;
  trace: string[];
}

export interface RunResult {
  bot: string;
  seed: number;
  start: number;
  end: number;
  rel: number;
  indexRel: number;
  days: number;
  years: number;
  bankrupt: boolean;
  calls: number;
  dead: boolean;
  prison: boolean;
  caught: number;
  threw: string[];
  books: string[];
  jumps: Jump[];
  path: { day: number; worth: number }[];
  missing: string;
  ms: number;
  error?: string;
}
