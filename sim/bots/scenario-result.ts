// One scenario, one style, one seed. The parent aggregates these into a win-rate table.

export interface ScenarioJob {
  style: string;
  scenario: string;
  seed: number;
}

export interface ScenarioResult {
  style: string;
  scenario: string;
  seed: number;
  win: boolean;
  ruin: boolean;
  start: number;
  end: number;
  days: number;
  outcome: string;
  reason: string;
  ms: number;
  error?: string;
}
