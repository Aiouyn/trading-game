// M1-09 copy for the Wire detail's price-effect section and the guest demo label. Only the Wire app (lazy chunk) imports
// it, so the Broker route (which imports strings.ts for headlines) does not carry it.
import { FR, type WireStrings } from "./strings";

export interface StoryStrings {
  /** Guest feed: the stories are fixtures that move nothing. */
  demo: string;
  causeTitle: string;
  effectTitle: string;
  /** "{ticker} {from} → {to} ({pct})" */
  effectLine: string;
  realizedNote: string;
  laterNote: string;
  forecastNote: string;
  easedNote: string;
}

const STORY_EN: StoryStrings = {
  demo: "Example stories · no price effect",
  causeTitle: "Why it matters",
  effectTitle: "Price effect",
  effectLine: "{ticker} {from} → {to} ({pct})",
  realizedNote: "Applied once by the Port Avalon market at {time}.",
  laterNote: "Prices keep moving after this. Later moves aren't part of this story.",
  forecastNote: "A forecast, not an outcome: no price effect. It may not happen.",
  easedNote: "No price effect: the risk passed.",
};

const STORY_FR: StoryStrings = {
  demo: "Dépêches d’exemple · sans effet sur les cours",
  causeTitle: "Pourquoi c’est important",
  effectTitle: "Effet sur le cours",
  effectLine: "{ticker} {from} → {to} ({pct})",
  realizedNote: "Appliqué une fois par le marché de Port Avalon à {time}.",
  laterNote: "Les cours continuent de bouger ensuite. Ces mouvements ne font pas partie de cette dépêche.",
  forecastNote: "Une prévision, pas un résultat : aucun effet sur le cours. Elle peut ne pas se produire.",
  easedNote: "Aucun effet sur le cours : le risque est passé.",
};

/** The story copy in the locale of `t` (the Wire strings already picked by locale). */
export const storyStrings = (t: WireStrings): StoryStrings => (t === FR ? STORY_FR : STORY_EN);
