/** Card 33: grow $10k → $20k goal and a first-trade path. Copy only — no client maths on NW. */
const EN = {
  title: "Your goal",
  goal: "Grow $10,000 of game money toward a $20,000 (Hustler) goal.",
  now: "Saved net worth now",
  guideTitle: "A first trade",
  step1: "Read the latest Wire so you know what is moving.",
  step2: "Open Broker, review the ticket, and pick a size you can stand to lose.",
  step3: "Place the order when you are ready. Prices can fall. Broker trades and fills are still a demo and are not saved when you reload.",
  openWire: "Open Wire",
  openBroker: "Open Broker",
  hide: "Hide this guide",
  show: "Show the first-trade path",
  guest: "Sign in to start with $10,000 of game money and a $20,000 (Hustler) goal.",
};

const FR: typeof EN = {
  title: "Votre objectif",
  goal: "Faites passer 10\u202F000\u00A0$ d’argent fictif vers un objectif de 20\u202F000\u00A0$ (Hustler).",
  now: "Valeur nette enregistrée maintenant",
  guideTitle: "Un premier échange",
  step1: "Lisez le dernier fil Wire pour voir ce qui bouge.",
  step2: "Ouvrez Broker, relisez le ticket, et choisissez une taille que vous pouvez accepter de perdre.",
  step3: "Passez l’ordre quand vous êtes prêt. Les prix peuvent baisser. Les échanges et exécutions Broker sont encore une démo et ne sont pas enregistrés quand vous rechargez la page.",
  openWire: "Ouvrir Wire",
  openBroker: "Ouvrir Broker",
  hide: "Masquer ce guide",
  show: "Afficher le parcours du premier échange",
  guest: "Connectez-vous pour commencer avec 10\u202F000\u00A0$ d’argent fictif et un objectif de 20\u202F000\u00A0$ (Hustler).",
};

export function goalStrings(locale: string): typeof EN {
  return locale === "fr" ? FR : EN;
}
