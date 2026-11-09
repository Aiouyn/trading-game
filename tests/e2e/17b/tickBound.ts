// M1-05: which server book a live UI observation must equal. Pure (no Playwright), so the rule has its own unit test
// (tests/unit/17b/M1-05-tick-bound.test.ts).
//
// The observation is bracketed by two GET /api/market reads: `pre` before the UI read and `post` after it. The server
// clock may advance between the reads (5 s ticks; the UI read takes a while), so the UI may legitimately show either
// bracketing tick, never another. The UI's tick must be one the server served inside the window, and the UI's world,
// clock and every quote must equal THAT book exactly. A UI behind `pre` (stale), ahead of `post`, between them with
// no book read (the window spanned 2+ ticks), or showing quotes other than its tick's book is a failure.

export interface ServerBook { worldId: string; tick: number; quotes: { rows: Record<string, { last: string }> } }
export interface UiBook { tick: string; world: string; clock: string; lasts: Record<string, string> }

/** The bracketing book the UI showed, or a reason it is not the server's book at its tick. */
export function bookAtUiTick(pre: ServerBook, ui: UiBook, post: ServerBook): { book: ServerBook } | { error: string } {
  const t = Number(ui.tick);
  if (!Number.isSafeInteger(t)) return { error: `UI tick ${JSON.stringify(ui.tick)} is not a tick` };
  if (post.tick < pre.tick) return { error: `server tick went back (${pre.tick} → ${post.tick})` };
  if (t < pre.tick) return { error: `UI is stale: tick ${t} after the server already served ${pre.tick}` };
  if (t > post.tick) return { error: `UI tick ${t} is ahead of the server (${post.tick})` };
  const book = t === post.tick ? post : t === pre.tick ? pre : null;
  if (!book) return { error: `UI tick ${t} lies between the reads ${pre.tick}..${post.tick}: no book read at it` };
  if (ui.world !== book.worldId) return { error: `UI world ${ui.world} ≠ ${book.worldId}` };
  if (ui.clock !== ui.tick) return { error: `the shell clock shows ${ui.clock}, the Broker ${ui.tick}` };
  for (const [id, row] of Object.entries(book.quotes.rows)) {
    if (ui.lasts[id] !== row.last) return { error: `${id}: UI ${ui.lasts[id]} ≠ server ${row.last} at tick ${t}` };
  }
  for (const id of Object.keys(ui.lasts)) if (!(id in book.quotes.rows)) return { error: `UI shows ${id}, which the server book at ${t} has not` };
  return { book };
}
