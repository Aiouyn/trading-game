/**
 * Quay routes (F:71-89, DECISIONS "Routing"). Pure: parse and serialize the [[...app]] path.
 *
 *   /                       the desktop (restored layout or Trade)
 *   /broker/<TICKER>        a Broker on that ticker
 *   /portfolio[/journal|/analyst]
 *   /research/<fileId>      a Research file window
 *   /settings/about
 *   /<app>                  any other app id
 *   /credits                redirect to /settings/about
 *
 * Flags kept on every route: ?world ?e2e ?seed ?fresh ?intro. The query aliases ?t and ?file
 * are read when the path does not name the value. On output they are kept only while they agree
 * with the route's own ticker or file (DECISIONS "Routing": preserved across URL updates; a stale
 * alias after the window changed its ticker is dropped). Nothing else is read or written, so a
 * link carries no holdings, orders or player data (T:98).
 */

import { APPS, type AppId, type WinProps, cleanProps, isAppId } from './apps';

export interface RouteFlags {
  world?: string;
  e2e?: true;
  seed?: string;
  fresh?: true;
  intro?: string;
}

export interface ShellRoute {
  /** null is the desktop. */
  app: AppId | null;
  view?: string;
  props: WinProps;
  flags: RouteFlags;
  /** The query aliases as read (?t, ?file). Kept on output only while they match `props`. */
  alias?: { t?: string; file?: string };
}

export type RouteResult = ShellRoute | { notFound: true } | { redirect: string };

const REDIRECTS: Readonly<Record<string, string>> = {
  '/credits': '/settings/about',
};

const MAX_FLAG = 64;

function flagsFrom(q: URLSearchParams): RouteFlags {
  const flags: RouteFlags = {};
  const world = q.get('world');
  if (world !== null && world !== '' && world.length <= MAX_FLAG) flags.world = world;
  if (q.has('e2e')) flags.e2e = true;
  const seed = q.get('seed');
  if (seed !== null && seed !== '' && seed.length <= MAX_FLAG) flags.seed = seed;
  if (q.has('fresh')) flags.fresh = true;
  const intro = q.get('intro');
  if (intro !== null && intro !== '' && intro.length <= 16) flags.intro = intro;
  return flags;
}

/**
 * Parses a path with an optional query, e.g. "/broker/HLCN?e2e&seed=7". Unknown paths return
 * { notFound: true }. Legacy /credits returns { redirect }.
 */
export function parseRoute(input: string): RouteResult {
  const qAt = input.indexOf('?');
  const rawPath = qAt < 0 ? input : input.slice(0, qAt);
  const query = qAt < 0 ? '' : input.slice(qAt + 1);

  let path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const redirect = REDIRECTS[path];
  if (redirect !== undefined) return { redirect };

  const q = new URLSearchParams(query);
  const flags = flagsFrom(q);
  if (path === '/') return { app: null, props: {}, flags };

  const segs = path.slice(1).split('/');
  const head = segs[0]!;
  if (!isAppId(head)) return { notFound: true };
  const app: AppId = head;
  const rest = segs.slice(1);
  const def = APPS[app];
  const props: WinProps = {};
  let view: string | undefined;

  if (rest.length > 1) return { notFound: true };
  if (rest.length === 1) {
    let seg: string;
    try {
      seg = decodeURIComponent(rest[0]!);
    } catch {
      return { notFound: true };
    }
    if (app === 'broker') {
      const c = cleanProps(app, { ticker: seg });
      if (c === null) return { notFound: true };
      Object.assign(props, c);
    } else if (app === 'research') {
      const c = cleanProps(app, { fileId: seg });
      if (c === null) return { notFound: true };
      Object.assign(props, c);
    } else if (def.views.includes(seg)) {
      view = seg;
    } else {
      return { notFound: true };
    }
  }

  // Query aliases. The path wins; a query value fills in only when the path does not name one.
  const alias: { t?: string; file?: string } = {};
  if (app === 'broker' && q.has('t')) {
    const c = cleanProps(app, { ticker: q.get('t') });
    if (c !== null && c.ticker !== undefined) {
      alias.t = c.ticker;
      if (props.ticker === undefined) props.ticker = c.ticker;
    }
  }
  if (app === 'research' && q.has('file')) {
    const c = cleanProps(app, { fileId: q.get('file') });
    if (c !== null && c.fileId !== undefined) {
      alias.file = c.fileId;
      if (props.fileId === undefined) props.fileId = c.fileId;
    }
  }
  // A malformed file alias is not a file id: notFound, the same answer as any unknown link (P2-116).
  // A bare /research opens the Research Desk; a file id opens that file's window.
  if (app === 'research' && q.has('file') && alias.file === undefined) return { notFound: true };

  const out: ShellRoute = { app, props, flags };
  if (view !== undefined) out.view = view;
  if (alias.t !== undefined || alias.file !== undefined) out.alias = alias;
  return out;
}

function flagQuery(f: RouteFlags): string {
  const parts: string[] = [];
  if (f.world !== undefined) parts.push(`world=${encodeURIComponent(f.world)}`);
  if (f.e2e) parts.push('e2e');
  if (f.seed !== undefined) parts.push(`seed=${encodeURIComponent(f.seed)}`);
  if (f.fresh) parts.push('fresh');
  if (f.intro !== undefined) parts.push(`intro=${encodeURIComponent(f.intro)}`);
  return parts.join('&');
}

/** The alias query parts that still agree with the route's props (DECISIONS "Routing"). */
function aliasQuery(r: ShellRoute): string[] {
  const parts: string[] = [];
  if (r.app === 'broker' && r.alias?.t !== undefined && r.alias.t === r.props.ticker) parts.push(`t=${r.alias.t}`);
  if (r.app === 'research' && r.alias?.file !== undefined && r.alias.file === r.props.fileId) {
    parts.push(`file=${encodeURIComponent(r.alias.file)}`);
  }
  return parts;
}

/** The canonical path and query for a route. The inverse of parseRoute for canonical input. */
export function formatRoute(r: ShellRoute): string {
  let path = '/';
  if (r.app !== null) {
    path = `/${r.app}`;
    if (r.app === 'broker' && r.props.ticker !== undefined) path += `/${r.props.ticker}`;
    else if (r.app === 'research' && r.props.fileId !== undefined) path += `/${encodeURIComponent(r.props.fileId)}`;
    else if (r.view !== undefined) path += `/${r.view}`;
  }
  const query = [flagQuery(r.flags), ...aliasQuery(r)].filter((x) => x !== '').join('&');
  return query === '' ? path : `${path}?${query}`;
}
