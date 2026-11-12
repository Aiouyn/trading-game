"use client";
// The Launchpad board's pieces, ported from the owner's first version (origin/p10/integration
// src/components/apps/launchpad/{Board,Shared}.tsx and src/world/launchpad/icon.ts): the generated token icon, the King of
// the Hill banner, the live trades bar and the board card (image, name and ticker, creator, market cap first, the curve,
// holders and the last trade). Display only: every figure comes from the server's board read (boardModel.ts).
import { Chip } from "@/components/ui/Chip";
import { TAGLINES, priceText, type TaglineId } from "@/launchpad/rules";
import { ago, capOf, lastTradeOf, progressOf, type BarRow, type BoardCoin } from "./boardModel";
import { LPS } from "./strings";

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctText = (f: number) => `${(f * 100).toFixed(2)}%`;
const px8 = (m: number) => `$${(m / 1e8).toPrecision(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}`;

/** FNV-1a of the ticker (p10 icon.ts tickerHash): the same ticker always draws the same icon. */
function tickerHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** The palette tokens an icon mixes (p10 drew from a hue wheel; main names colours only in tokens.css). */
const INKS = ["--gain", "--loss", "--info", "--warn", "--steel", "--acc"] as const;
const SHAPES = ["circle", "square", "diamond", "hex"] as const;

/** p10 iconSpec: shape, fill and glyph from the ticker's hash. Exported for the unit test. */
export function iconSpec(ticker: string) {
  const h = tickerHash(ticker);
  const a = INKS[(h >>> 3) % INKS.length]!;
  const b = INKS[((h >>> 3) % INKS.length + 1 + ((h >>> 9) % (INKS.length - 1))) % INKS.length]!;
  const mix = 35 + ((h >>> 15) % 6) * 10; // 35..85 % of the first ink
  return { shape: SHAPES[h % SHAPES.length]!, fill: `color-mix(in oklab, var(${a}) ${mix}%, var(${b}))`, glyph: ticker.charAt(0) };
}

/** A token's icon: decorative (the ticker is printed beside it). */
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

export function StatusChip({ c }: { c: BoardCoin }) {
  return c.grad ? <Chip tone="gain" outline data-testid="lp-status-graduated">{LPS.graduated}</Chip> : <Chip tone="warn" outline data-testid="lp-status-live">{LPS.live}</Chip>;
}

/** The King of the Hill (p10): the live coin closest to graduation, as a banner over the board. */
export function KingBanner({ king, now, onOpen }: { king: BoardCoin | null; now: number; onOpen: (t: string) => void }) {
  if (!king) return null;
  return (
    <button type="button" className="lpad-king" data-testid="lp-king" data-ticker={king.ticker} onClick={() => onOpen(king.ticker)}>
      <TokenIcon ticker={king.ticker} size={44} />
      <span className="lpad-king-main">
        <span className="lpad-kicker">{LPS.king}</span>
        <span className="lpad-name-row"><b data-testid="lp-king-name">{king.name}</b><span className="lpad-tick">{king.ticker}</span></span>
        <span className="lpad-sub num">{LPS.kingLine(usd(capOf(king)), pctText(progressOf(king)))}</span>
      </span>
      <span className="lpad-sub">{LPS.launchedAgo(ago(king.createdAtMs, now))}</span>
    </button>
  );
}

/** The live trades bar (p10): the newest public trades across all coins, one line each. */
export function TradesBar({ rows, now, onOpen }: { rows: BarRow[]; now: number; onOpen: (t: string) => void }) {
  if (rows.length === 0) return null;
  return (
    <div className="lpad-bar" data-testid="lp-bar" aria-label={LPS.barLabel}>
      <span className="lpad-kicker">{LPS.barTitle}</span>
      <ul>
        {rows.map((r, i) => (
          <li key={`${r.ticker}-${r.atMs}-${i}`}>
            <button type="button" className="lpad-bar-row" data-testid="lp-bar-row" onClick={() => onOpen(r.ticker)}>
              <span className={r.creator ? "lpad-creator" : "lpad-who"}>{r.creator ? LPS.barCreator : LPS.barTrader}</span>
              <span data-side={r.side}>{r.side === "buy" ? LPS.barBought : LPS.barSold}</span>
              <span className="num">{usd(r.cents)}</span>
              <span className="lpad-tick">{r.ticker}</span>
              <span className="lpad-faint">{ago(r.atMs, now) === "now" ? LPS.now : LPS.agoText(ago(r.atMs, now))}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One board card (p10 BoardCard): the whole card opens the coin's page. */
export function BoardCard({ c, held, now, onOpen }: { c: BoardCoin & { creator: string | null; tagline: TaglineId }; held: number; now: number; onOpen: (t: string) => void }) {
  const p = progressOf(c);
  return (
    <article className="lpad-card" data-testid={`lp-card-${c.ticker}`}>
      <button type="button" className="lpad-card-open" data-testid="lp-coin" data-ticker={c.ticker} onClick={() => onOpen(c.ticker)} aria-label={`${c.name} ${c.ticker}`}>
        <span className="lpad-card-head">
          <TokenIcon ticker={c.ticker} size={80} />
          <span className="lpad-card-id">
            <span className="lpad-name-row"><b>{c.name}</b><span className="lpad-tick">{c.ticker}</span></span>
            <span className="lpad-sub">{LPS.by(c.creator)}</span>
            <span className="lpad-faint lpad-clamp">{TAGLINES[c.tagline] ?? ""}</span>
            <span className="lpad-chips"><StatusChip c={c} />{c.mine && <Chip outline>{LPS.yours}</Chip>}{held > 0 && <Chip tone="info" outline>{LPS.holding}</Chip>}</span>
          </span>
        </span>
        <span className="lpad-card-cap">
          <span><span className="lpad-kicker">{LPS.mcap}</span><span className="num lpad-cap" data-testid={`lp-cap-${c.ticker}`}>{usd(capOf(c))}</span></span>
          <span className="num lpad-faint">{`${LPS.price} ${c.grad ? px8(c.grad.mark ?? c.grad.price) : priceText(c)}`}</span>
        </span>
        {c.grad ? (
          <span className="lpad-sub" data-kind="gain">{LPS.gradAgo(ago(c.grad.atMs, now))}</span>
        ) : (
          <span className="lpad-curve">
            <span className="lpad-meter" aria-hidden="true"><span style={{ width: `${Math.max(p > 0 ? 1 : 0, p * 100)}%` }} /></span>
            <span className="num lpad-faint" data-testid={`lp-progress-${c.ticker}`}>{LPS.curvePct(pctText(p))}</span>
          </span>
        )}
        <span className="lpad-card-foot">
          <span>{LPS.holders(c.holders)}</span>
          <span>{c.tape.length === 0 ? LPS.noTradeYet : LPS.lastTrade(ago(lastTradeOf(c), now))}</span>
        </span>
      </button>
    </article>
  );
}
