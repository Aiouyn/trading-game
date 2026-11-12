import type { WireStrings } from "./strings";

const EN = {
  waiting: "Stories appear as events happen. You can open Broker while you wait.",
  filtered: "Try All to see the whole feed.",
  reset: "Show all stories",
  openBroker: "Open Broker",
};
const FR: typeof EN = {
  waiting: "Les dépêches apparaissent au fil des événements. Vous pouvez ouvrir le Courtier en attendant.",
  filtered: "Essayez Tout pour voir le fil complet.",
  reset: "Afficher toutes les dépêches",
  openBroker: "Ouvrir le Courtier",
};
export const feedHelp = (locale: WireStrings["locale"]): typeof EN => (locale === "fr" ? FR : EN);
