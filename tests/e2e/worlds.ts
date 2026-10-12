/**
 * The e2e port plan, shared by playwright.config.ts (which starts the servers) and helpers.ts (which picks the world a test talks to).
 *
 * The main projects share one web app and one world: E2E_PORT and E2E_WORLD_PORT. Each close project (the time-advancing specs,
 * see CLOSE_CHAIN) has its own pair, so the close specs never advance a world another spec is reading: the close project k
 * (0 to 15) runs its web app on E2E_PORT + CLOSE_OFFSET + k and its world on E2E_WORLD_PORT + CLOSE_OFFSET + k. The desktop
 * close projects come first in CLOSE_CHAIN's order, then the phone ones (k + 8).
 *
 * No import from @playwright/test here: the config and the helpers both load this module.
 */

/** The time-advancing specs, in run order: the desktop project is named close-<name>, the phone project close-<name>-phone. */
export const CLOSE_CHAIN: { spec: string; name: string }[] = [
  { spec: 'closeCard', name: 'card' },
  { spec: 'shops', name: 'shops' },
  { spec: 'exchangeFunds', name: 'funds' },
  { spec: 'exchangeIpo', name: 'ipo' },
  { spec: 'comeback', name: 'comeback' },
  { spec: 'worldEvents', name: 'events' },
  { spec: 'sixdAuctionBid', name: 'auction' },
  { spec: 'phase7Text', name: 'text' },
];

/** The offset of the close pairs from the base ports. A run reserves base + 0 for its main pair and base + 100..115 for the close pairs. */
export const CLOSE_OFFSET = 100;

/** The close slot of a project (0 to 15, the desktop chain then the phone chain), or -1 for a main project. */
export function closeSlot(project: string): number {
  const phone = project.endsWith('-phone');
  const desktopName = phone ? project.slice(0, -'-phone'.length) : project;
  const i = CLOSE_CHAIN.findIndex(({ name }) => `close-${name}` === desktopName);
  if (i < 0) return -1;
  return phone ? CLOSE_CHAIN.length + i : i;
}

export function isCloseProject(project: string): boolean {
  return closeSlot(project) >= 0;
}

/** The port a project's server uses, for a run whose base port is `base` (E2E_PORT for web, E2E_WORLD_PORT for the world). */
export function slotPort(base: number, project: string): number {
  const k = closeSlot(project);
  return k < 0 ? base : base + CLOSE_OFFSET + k;
}
