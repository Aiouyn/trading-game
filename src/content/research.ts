/**
 * AI research tree (bible 05): the Algorithm input A. Each node is a timed research project that
 * permanently multiplies capability or unlocks a product line. Costs climb steeply so the late
 * tree is a real money sink.
 */
export interface ResearchNode {
  id: string;
  name: string;
  era: 'Handcrafted' | 'Classic ML' | 'Deep learning' | 'Transformers' | 'Scaling' | 'Frontier' | 'Secret sauce';
  cost: number;
  /** game days to complete */
  days: number;
  requires: string[];
  /** multiplier on A */
  aMult: number;
  unlocks?: string;
  blurb: string;
}

export const RESEARCH: ResearchNode[] = [
  { id: 'rules', name: 'Rule-based scripts', era: 'Handcrafted', cost: 5_000, days: 0.5, requires: [], aMult: 1.05, unlocks: 'Trading bots (momentum, mean reversion)', blurb: 'If price goes up, buy. A start.' },
  { id: 'features', name: 'Feature engineering', era: 'Handcrafted', cost: 15_000, days: 1, requires: ['rules'], aMult: 1.08, blurb: 'Moving averages, volume spikes, the classics.' },
  { id: 'regression', name: 'Regression models', era: 'Classic ML', cost: 40_000, days: 1, requires: ['features'], aMult: 1.1, unlocks: 'Analyst signals', blurb: 'Fit a line, then a better line.' },
  { id: 'trees', name: 'Gradient-boosted trees', era: 'Classic ML', cost: 90_000, days: 2, requires: ['regression'], aMult: 1.12, unlocks: 'Value bots', blurb: 'The workhorse of tabular data.' },
  { id: 'nlp', name: 'News sentiment', era: 'Classic ML', cost: 150_000, days: 2, requires: ['regression'], aMult: 1.08, unlocks: 'Earnings bots', blurb: 'Reads the Wire faster than you do.' },
  { id: 'cnn', name: 'Deep networks', era: 'Deep learning', cost: 400_000, days: 3, requires: ['trees'], aMult: 1.15, blurb: 'Layers on layers.' },
  { id: 'rl', name: 'Reinforcement learning', era: 'Deep learning', cost: 900_000, days: 3, requires: ['cnn'], aMult: 1.15, unlocks: 'Trend bots', blurb: 'Learns by trading against itself.' },
  { id: 'anomaly', name: 'Anomaly detection', era: 'Deep learning', cost: 600_000, days: 2, requires: ['cnn'], aMult: 1.05, unlocks: 'Security models', blurb: 'Notices what does not belong.' },
  { id: 'attention', name: 'Attention', era: 'Transformers', cost: 2_500_000, days: 4, requires: ['rl', 'nlp'], aMult: 1.2, blurb: 'All you need, reportedly.' },
  { id: 'pretrain', name: 'Large-scale pretraining', era: 'Transformers', cost: 6_000_000, days: 5, requires: ['attention'], aMult: 1.2, blurb: 'Read everything first, specialize later.' },
  { id: 'rlhf', name: 'Fine-tuning from feedback', era: 'Transformers', cost: 9_000_000, days: 5, requires: ['pretrain'], aMult: 1.12, blurb: 'Humans grade the homework.' },
  { id: 'moe', name: 'Mixture of experts', era: 'Scaling', cost: 25_000_000, days: 6, requires: ['pretrain'], aMult: 1.18, blurb: 'Many specialists, one router.' },
  { id: 'distributed', name: 'Distributed training', era: 'Scaling', cost: 40_000_000, days: 6, requires: ['moe'], aMult: 1.1, unlocks: 'Faster training runs (−30% time)', blurb: 'Ten thousand GPUs in lockstep.' },
  { id: 'synthdata', name: 'Synthetic data pipelines', era: 'Scaling', cost: 30_000_000, days: 5, requires: ['rlhf'], aMult: 1.05, unlocks: 'Synthetic share limit 60% before collapse', blurb: 'Models that teach models, carefully.' },
  { id: 'reasoning', name: 'Reasoning models', era: 'Frontier', cost: 150_000_000, days: 8, requires: ['moe', 'rlhf'], aMult: 1.25, blurb: 'Thinks before it trades.' },
  { id: 'agents', name: 'Autonomous agents', era: 'Frontier', cost: 300_000_000, days: 10, requires: ['reasoning'], aMult: 1.2, unlocks: 'Bots run every tick', blurb: 'Plans, acts, checks its own work.' },
  { id: 'watermark', name: 'Watermark forensics', era: 'Frontier', cost: 120_000_000, days: 6, requires: ['anomaly', 'pretrain'], aMult: 1.02, unlocks: 'Stronger evidence against model thieves', blurb: 'Finds your fingerprints in other people\'s models.' },
  { id: 'world-model', name: 'Market world model', era: 'Secret sauce', cost: 900_000_000, days: 12, requires: ['agents'], aMult: 1.3, blurb: 'Simulates Port Avalon itself.' },
  { id: 'self-improve', name: 'Recursive self-improvement', era: 'Secret sauce', cost: 3_000_000_000, days: 16, requires: ['world-model'], aMult: 1.35, blurb: 'The last invention. Or the first.' },
];

export const RESEARCH_BY_ID = new Map(RESEARCH.map((r) => [r.id, r]));

/** Data sources (bible 05 §2): price per DQU relative to the Data commodity, and legal risk. */
export const DATA_SOURCES: { id: string; name: string; priceMult: number; legalRisk: number; synthetic: boolean; blurb: string }[] = [
  { id: 'broker', name: 'Licensed data broker', priceMult: 1.2, legalRisk: 0, synthetic: false, blurb: 'Clean, licensed, expensive.' },
  { id: 'partnership', name: 'Business partnerships', priceMult: 0.8, legalRisk: 0, synthetic: false, blurb: 'Data from partner companies.' },
  { id: 'scrape', name: 'Web scraping', priceMult: 0.35, legalRisk: 0.05, synthetic: false, blurb: 'Cheap, fast, legally grey: regulators fine some scrapers.' },
  { id: 'synthetic', name: 'Synthetic generation', priceMult: 0.15, legalRisk: 0, synthetic: true, blurb: 'Nearly free, but too much of it collapses your model.' },
];

/** MCS thresholds that name a model's tier (bible 05 §6 progression). */
export const MCS_TIERS = [
  { tier: 0, name: 'Laptop script', min: 0 },
  { tier: 1, name: 'Garage model', min: 20 },
  { tier: 2, name: 'Startup model', min: 60 },
  { tier: 3, name: 'Scale-up model', min: 200 },
  { tier: 4, name: 'Frontier model', min: 600 },
  { tier: 5, name: 'Hegemon model', min: 2000 },
];

export function mcsTier(mcs: number): number {
  let t = 0;
  for (const x of MCS_TIERS) if (mcs >= x.min) t = x.tier;
  return t;
}

/** Bot cadence by model tier (bible decision A1): ticks between decisions. */
export const BOT_CADENCE = [36, 24, 12, 6, 3, 1];
