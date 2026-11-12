/** 04 §3.1 ranks. Rank keys off net worth and is never lost, so it follows peak equity. */
export interface Rank {
  id: string;
  name: string;
  threshold: number;
}

export const RANKS: Rank[] = [
  { id: 'R0', name: 'Broke', threshold: 0 },
  { id: 'R1', name: 'Hustler', threshold: 20_000 },
  { id: 'R2', name: 'Owner', threshold: 250_000 },
  { id: 'R3', name: 'Operator', threshold: 5_000_000 },
  { id: 'R4', name: 'Mogul', threshold: 100_000_000 },
  { id: 'R5', name: 'Titan', threshold: 2_000_000_000 },
];

export interface RankProgress {
  rank: Rank;
  next: Rank | null;
  /** 0..1 toward next, measured on current net worth from the current rank's floor */
  progress: number;
}

export function rankProgress(peakEquity: number, equity: number, startingCash = 5000): RankProgress {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (peakEquity >= RANKS[i]!.threshold) idx = i;
  const rank = RANKS[idx]!;
  const next = RANKS[idx + 1] ?? null;
  if (!next) return { rank, next, progress: 1 };
  const floor = idx === 0 ? startingCash : rank.threshold;
  const progress = Math.min(1, Math.max(0, (equity - floor) / (next.threshold - floor)));
  return { rank, next, progress };
}
