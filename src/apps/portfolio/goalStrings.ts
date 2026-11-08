// M2-01/M2-02 copy for the first-trade guide and the grow-$10k goal (lazy GoalGuide chunk only). EN + FR; FR = proposed
// translations pending review. The figures in the copy ($10,000 start, $20,000 goal) are the server's starting cash and
// the first rank threshold (RANK_THRESHOLDS[0], DESIGN §6b step 6 "Reach $20k (Hustler)").
import type { PfLocale } from "./strings";

const EN = {
  title: "Your goal",
  goal: "Grow your $10,000 to $20,000 (Hustler).",
  now: "Saved net worth now",
  of: "of",
  below: "Below your $10,000 start. Prices can fall.",
  reached: "Goal reached.",
  progress: "Progress from $10,000 to $20,000",
  guideTitle: "Your first trade",
  step1: "Read a Wire story: it names an asset and why its price moved. Stories are clues, not promises.",
  step2: "In Broker, pick an asset, enter a quantity and press Review order. Check the price, the fee and the total.",
  step3: "Place the order to confirm it. It counts once it fills, and it is saved to your account.",
  openWire: "Open Wire",
  openBroker: "Open Broker",
  waiting: "You have an open order. It counts once it fills.",
  done: "First trade done.",
  sideDone: { BUY: "Bought", SELL: "Sold" } as Record<"BUY" | "SELL", string>,
  doneFill: (side: string, qty: string, ticker: string, price: string, fee: string) => `${side} ${qty} ${ticker} at ${price} · fee ${fee}.`,
  doneSee: "See it in Positions. Prices keep moving: the goal is not guaranteed.",
  hide: "Hide guide",
  show: "Show first-trade guide",
};
type GoalStrings = typeof EN;

const FR: GoalStrings = {
  title: "Votre objectif",
  goal: "Faites passer vos 10\u202F000\u00A0$ à 20\u202F000\u00A0$ (Hustler).",
  now: "Valeur nette enregistrée",
  of: "sur",
  below: "Sous vos 10\u202F000\u00A0$ de départ. Les cours peuvent baisser.",
  reached: "Objectif atteint.",
  progress: "Progression de 10\u202F000\u00A0$ à 20\u202F000\u00A0$",
  guideTitle: "Votre premier ordre",
  step1: "Lisez une dépêche du fil\u202F: elle nomme un actif et explique pourquoi son cours a bougé. C’est un indice, pas une promesse.",
  step2: "Dans le Courtier, choisissez un actif, saisissez une quantité et appuyez sur Vérifier l’ordre. Vérifiez le prix, les frais et le total.",
  step3: "Passez l’ordre pour le confirmer. Il compte une fois exécuté, et il est enregistré sur votre compte.",
  openWire: "Ouvrir le fil",
  openBroker: "Ouvrir le Courtier",
  waiting: "Vous avez un ordre ouvert. Il compte une fois exécuté.",
  done: "Premier ordre exécuté.",
  sideDone: { BUY: "Acheté", SELL: "Vendu" },
  doneFill: (side, qty, ticker, price, fee) => `${side} ${qty} ${ticker} à ${price} · frais ${fee}.`,
  doneSee: "Voyez-le dans Positions. Les cours continuent de bouger\u202F: l’objectif n’est pas garanti.",
  hide: "Masquer le guide",
  show: "Afficher le guide du premier ordre",
};

export const goalStrings = (locale: string): GoalStrings => ((locale as PfLocale) === "fr" ? FR : EN);
