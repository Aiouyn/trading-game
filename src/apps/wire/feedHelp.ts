import type { WireStrings } from "./strings";

const EN = {
  waiting: "Market stories appear as events happen. You can explore Broker while you wait.",
  filtered: "Try All to see the whole feed.",
  reset: "Show all stories",
};
const FR: typeof EN = {
  waiting: "Les dépêches apparaissent au fil des événements. Vous pouvez explorer le Courtier en attendant.",
  filtered: "Essayez Tout pour voir le fil complet.",
  reset: "Afficher toutes les dépêches",
};
export const feedHelp = (locale: WireStrings["locale"]): typeof EN => locale === "fr" ? FR : EN;
