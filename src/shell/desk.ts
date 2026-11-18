// What sits on the desk. A new arrival sees almost nothing: the city, the wallet, the markets, and work.
// Every other app appears when the life makes it relevant. The launcher reaches all of them from the start.
import type { AppId } from "./registry";
import type { SimView } from "./simSession";

export const ARRIVAL = "arrival";

const CORE = new Set<string>(["portfolio", "broker", "careers"]);

/** True when `app` belongs on the shelf and home screen. Games that are not an arrival show everything. */
export function onDesk(app: AppId, view: SimView | null, running = false): boolean {
  if (view?.scenario?.id !== ARRIVAL) return true;
  if (running || CORE.has(app) || app.startsWith("city")) return true;
  switch (app) {
    case "bank": return (view.deposits?.length ?? 0) > 0 || view.loans.length > 0;
    case "businesses":
    case "company": return (view.companies?.length ?? 0) > 0;
    case "people":
    case "messages": return (view.contacts?.length ?? 0) > 0;
    case "property": return view.homes.some((h) => h.mine);
    default: return false;
  }
}
