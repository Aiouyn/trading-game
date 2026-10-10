// Desktop URL sync (DECISIONS "Routing", P2-111..P2-113). Pure: the shell state and the location in,
// the URL out. The query flags (?world, ?e2e, ?seed, ?fresh, ?intro) and the aliases (?t, ?file) are
// kept from the first load; a route carries no holdings, prices or player data (P2-120).
import { type RouteFlags, type RouteResult, type ShellRoute, formatRoute, parseRoute } from '@/shell/route';
import { focusedId, type ShellState } from '@/shell/wm';

export interface UrlBase {
  flags: RouteFlags;
  alias?: ShellRoute['alias'];
}

/** Parses a location. The flags come from a second parse of the query alone, so they survive an unknown path. */
export function parseLocation(pathname: string, search: string): { route: RouteResult; base: UrlBase } {
  const route = parseRoute(pathname + search);
  const onlyQuery = parseRoute('/' + search);
  const flags: RouteFlags = 'flags' in onlyQuery ? onlyQuery.flags : {};
  const base: UrlBase = { flags };
  if ('app' in route && route.alias !== undefined) base.alias = route.alias;
  return { route, base };
}

/** The URL for the focused window. Desktop with nothing focused is "/" with the flags. */
export function routeUrl(shell: ShellState, base: UrlBase): string {
  const id = focusedId(shell);
  const w = id === null ? undefined : shell.wins.find((x) => x.id === id);
  if (w === undefined) return formatRoute({ app: null, props: {}, flags: base.flags });
  const r: ShellRoute = { app: w.app, props: w.props, flags: base.flags };
  if (w.props.view !== undefined) r.view = w.props.view;
  if (base.alias !== undefined) r.alias = base.alias;
  return formatRoute(r);
}
