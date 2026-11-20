"use client";
// The board's pieces: the generated token icon, the King of the Hill banner, the rug alert, the latest trades bar and the
// coin card. Port of the owner's first version (origin/ui/lp-firstver-board, Board.tsx), fed by the sim's memecoins.
// Display only: every figure arrives in one read of the pools, and a number that moves flashes.
import { useEffect, useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { LPS } from "./strings";
import { agoText, clockText, dateText, pctText, perToken, qty, tickerHash, usd, usdWhole, type Coin, type Rug, type TapeRow } from "./model";

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

/** "up" or "down" for a moment after a number moves, so a live figure is seen moving. */
export function useFlash(v: number): "up" | "down" | undefined {
  const prev = useRef(v);
  const [dir, setDir] = useState<"up" | "down" | undefined>();
  useEffect(() => {
    if (v === prev.current) return;
    setDir(v > prev.current ? "up" : "down");
    prev.current = v;
    const t = setTimeout(() => setDir(undefined), 900);
    return () => clearTimeout(t);
  }, [v]);
  return dir;
}

/** The hour's change as a coloured figure. */
export function Change({ ratio, testid, bare }: { ratio: number | null; testid?: string; bare?: boolean }) {
  if (ratio === null) return <span className="num lpad-chg" data-dir="flat" data-testid={testid} title={LPS.newHint}>{LPS.newCoin}</span>;
  const dir = ratio > 1.0005 ? "up" : ratio < 0.9995 ? "down" : "flat";
  return <span className="num lpad-chg" data-dir={dir} data-testid={testid} title={LPS.hourTitle}>{bare ? pctText(ratio) : `${pctText(ratio)} ${LPS.hourShort}`}</span>;
}

/** A coin's status chips: yours, held, the king, pulled or delisted. */
export function Status({ c, held }: { c: Coin; held: number }) {
  return (
    <span className="lpad-chips">
      {c.mine && <Chip outline>{LPS.yours}</Chip>}
      {held > 0 && <Chip tone="info" outline>{LPS.holding}</Chip>}
      {c.king && <Chip tone="acc" outline>{LPS.kingChip}</Chip>}
      {c.rugged && <Chip tone="loss" data-testid="lp-chip-rugged">{LPS.rugged}</Chip>}
      {!c.live && !c.rugged && <Chip tone="warn" outline data-testid="lp-chip-faded">{LPS.faded}</Chip>}
    </span>
  );
}

/** The King of the Hill: the live coin with the largest market cap, as one line over the board. */
export function KingBanner({ king, now, onOpen }: { king: Coin | null; now: number; onOpen: (id: string) => void }) {
  const dir = useFlash(king?.cap ?? 0);
  if (!king) return null;
  return (
    <button type="button" className="lpad-king" data-testid="lp-king" data-ticker={king.ticker} onClick={() => onOpen(king.id)}>
      <TokenIcon ticker={king.ticker} size={26} />
      <span className="lpad-kicker">{LPS.king}</span>
      <b data-testid="lp-king-name">{king.name}</b>
      <span className="lpad-tick">{king.ticker}</span>
      <span className="lpad-sub num" data-flash={dir}>{LPS.kingLine(usdWhole(king.cap))}</span>
      <Change ratio={king.h1} />
      <span className="lpad-faint lpad-king-age">{LPS.launchedAgo(agoText(king.bornAbs, now))}</span>
    </button>
  );
}

/** A rug is visible the moment it happens: one line for the newest, and how many more there were. */
export function RugAlert({ rugs, now, onOpen }: { rugs: Rug[]; now: number; onOpen: (id: string) => void }) {
  const recent = rugs.filter((r) => now - r.abs < 1440);
  if (recent.length === 0) return null;
  const r = recent[0]!;
  return (
    <div className="lpad-rugs" data-testid="lp-rugs" role="status" aria-live="polite">
      <button type="button" className="lpad-rug" data-testid="lp-rug" data-ticker={r.ticker} onClick={() => onOpen(r.id)}>
        <Chip tone="loss">{LPS.rugged}</Chip>
        <span className="lpad-tick">{r.ticker}</span>
        <span className="lpad-rug-text">{LPS.rugLine(r.mine ? LPS.barYou : r.creatorName, usd(r.cash))}</span>
        <span className="lpad-faint">{agoText(r.abs, now)}</span>
        {recent.length > 1 && <span className="lpad-faint">{`+${recent.length - 1} more`}</span>}
      </button>
    </div>
  );
}

/** The latest trades across all coins, newest first, as one scrolling line, each with its game time. */
export function TradesBar({ rows, onOpen }: { rows: TapeRow[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) return null;
  return (
    <div className="lpad-bar" data-testid="lp-bar" aria-label={LPS.bar}>
      <span className="lpad-kicker">{LPS.bar}</span>
      <ul>
        {rows.slice(0, 10).map((r) => (
          <li key={`${r.coin}-${r.seq}`}>
            <button type="button" className="lpad-bar-row" data-testid="lp-bar-row" onClick={() => onOpen(r.coin)}>
              <span className="lpad-faint num">{clockText(r.abs)}</span>
              <span className={r.mine ? "lpad-creator" : "lpad-who"}>{r.mine ? LPS.barYou : r.name || LPS.barTrader}</span>
              <span data-side={r.side}>{r.side === "buy" ? LPS.bought : LPS.sold}</span>
              <span className="num">{usd(r.cents)}</span>
              <span className="lpad-tick">{r.ticker}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One coin card: the whole card opens the coin's page. Market cap first, then the price, the pool and the trade count. */
export function BoardCard({ c, held, now, onOpen }: { c: Coin; held: number; now: number; onOpen: (id: string) => void }) {
  const p = Math.min(1, c.sold);
  const dir = useFlash(c.cap);
  return (
    <article className="lpad-card" data-testid={`lp-card-${c.ticker}`} data-ended={c.live ? undefined : c.ended || "faded"} data-king={c.king ? "true" : undefined}>
      <button type="button" className="lpad-card-open" data-testid="lp-coin" data-ticker={c.ticker} onClick={() => onOpen(c.id)} aria-label={`${c.name} ${c.ticker}`}>
        <span className="lpad-card-head">
          <TokenIcon ticker={c.ticker} size={48} />
          <span className="lpad-card-id">
            <span className="lpad-name-row"><b>{c.name}</b><span className="lpad-tick">{c.ticker}</span></span>
            <span className="lpad-sub">{LPS.by(c.creatorName)}</span>
            <Status c={c} held={held} />
          </span>
        </span>
        {c.live ? (
          <>
            <span className="lpad-card-cap">
              <span><span className="lpad-kicker">{LPS.mcap}</span><span className="num lpad-cap" data-flash={dir} data-testid={`lp-cap-${c.ticker}`}>{usdWhole(c.cap)}</span></span>
              <span className="lpad-card-px"><span className="num lpad-faint" data-testid={`lp-px-${c.ticker}`}>{`${LPS.price} ${perToken(c.px)}`}</span><Change ratio={c.h1} /></span>
            </span>
            <span className="lpad-curve">
              <span className="lpad-meter" aria-hidden="true"><span style={{ width: `${Math.max(p > 0 ? 1 : 0, p * 100)}%` }} /></span>
              <span className="num lpad-faint" data-testid={`lp-progress-${c.ticker}`}>{LPS.curvePct(`${(p * 100).toFixed(1)}%`)}</span>
            </span>
            <span className="lpad-card-foot">
              <span>{`${LPS.holders(c.holders)} · ${LPS.trades(c.trades)}`}</span>
              <span>{c.trades > 0 ? LPS.lastTrade(clockText(c.lastAbs)) : LPS.noTrade}</span>
            </span>
          </>
        ) : c.rugged ? (
          <span className="lpad-card-end" data-testid={`lp-end-${c.ticker}`}>
            <b>{LPS.ruggedLine(c.mine ? LPS.barYou : c.creatorName, usd(c.rugCash))}</b>
            <span className="lpad-faint">{`${LPS.peakWas(perToken(c.peak))} · ${LPS.trades(c.trades)} · ${agoText(c.endAbs, now)}`}</span>
          </span>
        ) : (
          <span className="lpad-card-end" data-testid={`lp-end-${c.ticker}`}>
            <b>{LPS.fadedLine}</b>
            <span className="lpad-faint">{`${LPS.holders(c.holders)} · ${LPS.windLine(dateText(c.windDay))}`}</span>
            {held > 0 ? <span className="lpad-faint" data-testid={`lp-held-dead-${c.ticker}`}>{LPS.holdLine(qty(held), c.ticker, usd(0))}</span> : null}
          </span>
        )}
        <span className="lpad-faint">{LPS.launchedAt(`${dateText(Math.floor(c.bornAbs / 1440))} ${clockText(c.bornAbs)}`)}</span>
      </button>
    </article>
  );
}
