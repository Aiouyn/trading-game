"use client";
// The board's pieces: the generated token icon, the King of the Hill banner, the latest trades bar and the coin card. Port
// of the owner's first version (origin/ui/lp-firstver-board, Board.tsx), fed by the sim's memecoins. Display only.
import { Chip } from "@/components/ui/Chip";
import { LPS } from "./strings";
import { agoDays, dayLabel, perToken, tickerHash, usd, type Coin, type TapeRow } from "./model";

const INKS = ["--gain", "--loss", "--info", "--warn", "--steel", "--acc"] as const;
const SHAPES = ["circle", "square", "diamond", "hex"] as const;

/** The shape, fill and glyph a ticker draws. */
export function iconSpec(ticker: string) {
  const h = tickerHash(ticker);
  const a = INKS[(h >>> 3) % INKS.length]!;
  const b = INKS[((h >>> 3) % INKS.length + 1 + ((h >>> 9) % (INKS.length - 1))) % INKS.length]!;
  const mix = 35 + ((h >>> 15) % 6) * 10;
  return { shape: SHAPES[h % SHAPES.length]!, fill: `color-mix(in oklab, var(${a}) ${mix}%, var(${b}))`, glyph: ticker.charAt(0) };
}

/** A token's icon: decorative, since the ticker is printed beside it. */
export function TokenIcon({ ticker, size = 40 }: { ticker: string; size?: number }) {
  const s = iconSpec(ticker);
  return (
    <svg className="lpad-icon" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" data-shape={s.shape}>
      <g style={{ fill: s.fill }}>
        {s.shape === "circle" && <circle cx="32" cy="32" r="30" />}
        {s.shape === "square" && <rect x="3" y="3" width="58" height="58" rx="10" />}
        {s.shape === "diamond" && <polygon points="32,2 62,32 32,62 2,32" />}
        {s.shape === "hex" && <polygon points="32,2 59,17 59,47 32,62 5,47 5,17" />}
      </g>
      <text x="32" y="43" textAnchor="middle" className="lpad-icon-glyph">{s.glyph}</text>
    </svg>
  );
}

/** The King of the Hill: the live coin with the largest market cap, as a banner over the board. */
export function KingBanner({ king, day, onOpen }: { king: Coin | null; day: number; onOpen: (id: string) => void }) {
  if (!king) return null;
  return (
    <button type="button" className="lpad-king" data-testid="lp-king" data-ticker={king.ticker} onClick={() => onOpen(king.id)}>
      <TokenIcon ticker={king.ticker} size={44} />
      <span className="lpad-king-main">
        <span className="lpad-kicker">{LPS.king}</span>
        <span className="lpad-name-row"><b data-testid="lp-king-name">{king.name}</b><span className="lpad-tick">{king.ticker}</span></span>
        <span className="lpad-sub num">{LPS.kingLine(usd(king.cap))}</span>
      </span>
      <span className="lpad-sub">{LPS.launchedAgo(agoDays(king.born, day))}</span>
    </button>
  );
}

/** The latest trades across all coins, newest first. */
export function TradesBar({ rows, day, onOpen }: { rows: TapeRow[]; day: number; onOpen: (id: string) => void }) {
  if (rows.length === 0) return null;
  return (
    <div className="lpad-bar" data-testid="lp-bar" aria-label={LPS.bar}>
      <span className="lpad-kicker">{LPS.bar}</span>
      <ul>
        {rows.map((r) => (
          <li key={`${r.coin}-${r.seq}`}>
            <button type="button" className="lpad-bar-row" data-testid="lp-bar-row" onClick={() => onOpen(r.coin)}>
              <span className={r.mine ? "lpad-creator" : "lpad-who"}>{r.mine ? LPS.barYou : r.name || LPS.barTrader}</span>
              <span data-side={r.side}>{r.side === "buy" ? LPS.bought : LPS.sold}</span>
              <span className="num">{usd(r.cents)}</span>
              <span className="lpad-tick">{r.ticker}</span>
              <span className="lpad-faint">{agoDays(r.day, day)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One coin card: the whole card opens the coin's page. Market cap first, then the price, the pool and the trade count. */
export function BoardCard({ c, held, day, onOpen }: { c: Coin; held: number; day: number; onOpen: (id: string) => void }) {
  const p = Math.min(1, c.sold);
  return (
    <article className="lpad-card" data-testid={`lp-card-${c.ticker}`}>
      <button type="button" className="lpad-card-open" data-testid="lp-coin" data-ticker={c.ticker} onClick={() => onOpen(c.id)} aria-label={`${c.name} ${c.ticker}`}>
        <span className="lpad-card-head">
          <TokenIcon ticker={c.ticker} size={80} />
          <span className="lpad-card-id">
            <span className="lpad-name-row"><b>{c.name}</b><span className="lpad-tick">{c.ticker}</span></span>
            <span className="lpad-sub">{LPS.by(c.creatorName)}</span>
            <span className="lpad-chips">
              {c.mine && <Chip outline>{LPS.yours}</Chip>}
              {held > 0 && <Chip tone="info" outline>{LPS.holding}</Chip>}
            </span>
          </span>
        </span>
        <span className="lpad-card-cap">
          <span><span className="lpad-kicker">{LPS.mcap}</span><span className="num lpad-cap" data-testid={`lp-cap-${c.ticker}`}>{usd(c.cap)}</span></span>
          <span className="num lpad-faint">{`${LPS.price} ${perToken(c.px)}`}</span>
        </span>
        <span className="lpad-curve">
          <span className="lpad-meter" aria-hidden="true"><span style={{ width: `${Math.max(p > 0 ? 1 : 0, p * 100)}%` }} /></span>
          <span className="num lpad-faint" data-testid={`lp-progress-${c.ticker}`}>{LPS.curvePct(`${(p * 100).toFixed(1)}%`)}</span>
        </span>
        <span className="lpad-card-foot">
          <span>{LPS.holders(c.holders)}</span>
          <span>{c.lastDay >= c.born && c.vol > 0 ? LPS.lastTrade(agoDays(c.lastDay, day)) : LPS.noTrade}</span>
        </span>
        <span className="lpad-faint">{dayLabel(c.born)}</span>
      </button>
    </article>
  );
}
