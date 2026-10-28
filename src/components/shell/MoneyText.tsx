"use client";
// MoneyText (17 §3.4.1, §3.5): formats a server decimal string; never computes money (17-AT-05).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { abbreviateDigits, fullDigits, isZero, MINUS, parseAmount, shouldAbbreviate } from "@/components/ui/money";
import { S } from "@/shell/strings";

export type MoneyCtx = "hero" | "table" | "list" | "chip" | "sentence" | "delta" | "wealth";
export type Restricted = "AD" | "START";

export interface MoneyTextProps {
  /** Decimal string from the server, e.g. "-42.10". */
  amount: string;
  ccy?: "FDL";
  ctx?: MoneyCtx;
  /** Shows ≈; muted only for zero/neutral values, a negative estimate stays loss (Studio T1 ruling 7). */
  estimated?: boolean;
  /** Restricted cash: a --steel outline pill beside the amount, --fg-muted text (Studio PF fix a; brass is for hero and rank only). */
  restricted?: Restricted;
}

/** @deprecated Pre-17A props, kept so StatusStrip (T2) and PhoneHome (T4) render unchanged until they migrate. */
export interface LegacyMoneyTextProps { value: string; ctx?: MoneyCtx; compact?: boolean; signed?: boolean }

const ABBREVIATED: ReadonlySet<MoneyCtx> = new Set(["list", "chip", "sentence"]);
const RESTRICTED_TEXT: Record<Restricted, string> = { AD: S.restrictedAD, START: S.restrictedSTART };

/** Spoken form (17 §3.4.6): "-42.10" -> "minus 42.10 dollars". */
export function speakMoney(amount: string, estimated = false): string {
  const p = parseAmount(amount);
  return [estimated && S.moneyAbout, p.negative && S.moneyMinus, fullDigits(p), S.moneyDollars].filter(Boolean).join(" ");
}

export function MoneyText(props: MoneyTextProps | LegacyMoneyTextProps) {
  if ("value" in props) return <LegacyMoneyText {...props} />;
  const { amount, ctx = "list", estimated = false, restricted } = props;
  const p = parseAmount(amount);
  const zero = isZero(p);
  const abbreviated = !zero && ABBREVIATED.has(ctx) && shouldAbbreviate(p);
  const digits = zero ? "0.00" : abbreviated ? abbreviateDigits(p.int) : fullDigits(p);
  const sign = p.negative ? MINUS : ctx === "delta" && !zero ? "+" : "";
  const tone = zero ? "muted" : p.negative ? "loss" : ctx === "delta" ? "gain" : estimated ? "muted" : ctx === "wealth" ? "money-wealth-tone" : "";
  const cls = ["num", "money", `money-${ctx}`, tone].filter(Boolean).join(" ");
  const text = `${estimated ? "≈" : ""}${sign}$${digits}`;
  const dot = text.lastIndexOf(".");
  const body = ctx === "hero" && dot > 0
    ? <><span data-testid="money-int">{text.slice(0, dot)}</span><span className="cents" data-testid="money-cents">{text.slice(dot)}</span></>
    : text;
  const money = (
    <span className={cls} role="img" aria-label={speakMoney(amount, estimated)} title={abbreviated ? `$${fullDigits(p)}` : undefined}>
      {body}
    </span>
  );
  const shown = abbreviated ? <LongPressTip full={`${p.negative ? MINUS : ""}$${fullDigits(p)}`}>{money}</LongPressTip> : money;
  if (!restricted) return shown;
  return <span className="money-restricted">{shown}<Chip tone="steel" outline>{RESTRICTED_TEXT[restricted]}</Chip></span>;
}

export const LONG_PRESS_MS = 500;
export const TIP_LINGER_MS = 1500;

/** Gap between the pill and the amount (or the finger), and the viewport margin it is clamped to. */
const TIP_GAP = 8;
/** Finger contact allowance used when the pill must flip below: it never sits under the finger. */
const FINGER = 44;

/** Studio T1 ruling 5 (+ answers): on touch, a 500 ms long-press shows the full value (mono figures, true sign)
 *  in a pill 8 px above the amount, clamped inside the viewport and never under the finger. It closes 1.5 s
 *  after the finger lifts, or on the next tap. A normal tap shows nothing. aria-label keeps the full value. */
function LongPressTip({ full, children }: { full: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null);
  const host = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const finger = useRef({ x: 0, y: 0 });
  const clear = (t: typeof press) => { if (t.current) clearTimeout(t.current); t.current = null; };
  useEffect(() => () => { clear(press); clear(linger); }, []);
  useLayoutEffect(() => {
    if (!open || !host.current || !tip.current) { setPos(null); return; }
    const a = host.current.getBoundingClientRect(), t = tip.current.getBoundingClientRect(), f = finger.current;
    const left = Math.min(Math.max(TIP_GAP, a.left + a.width / 2 - t.width / 2), innerWidth - TIP_GAP - t.width);
    const above = Math.min(a.top, f.y) - TIP_GAP - t.height;
    setPos({ left, top: above >= TIP_GAP ? above : Math.max(a.bottom, f.y + FINGER / 2) + TIP_GAP });
  }, [open]);
  return (
    <span
      ref={host}
      className="money-tip-wrap"
      onPointerDown={(e) => {
        if (e.pointerType !== "touch") return;
        if (open) { clear(linger); setOpen(false); return; }
        finger.current = { x: e.clientX, y: e.clientY };
        press.current = setTimeout(() => setOpen(true), LONG_PRESS_MS);
      }}
      onPointerUp={() => {
        clear(press);
        if (open) { clear(linger); linger.current = setTimeout(() => setOpen(false), TIP_LINGER_MS); }
      }}
      onPointerCancel={() => clear(press)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
      {open && (
        <span ref={tip} className="money-tip num" data-testid="money-tip" aria-hidden="true"
          style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}>{full}</span>
      )}
    </span>
  );
}

// ---- legacy rendering, byte-for-byte the pre-17A output ----
export function groupMoney(v: string, cents = true): string {
  const neg = v.startsWith("-");
  const [i, f = ""] = v.replace(/^[-+]/, "").split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "\u2212" : ""}$${grouped}${cents ? `.${f.padEnd(2, "0").slice(0, 2)}` : ""}`;
}

export function compactMoney(v: string): string {
  const i = v.replace(/^[-+]/, "").split(".")[0];
  const units: [number, string][] = [[12, "T"], [9, "B"], [6, "M"], [3, "k"]];
  for (const [d, u] of units) {
    if (i.length > d) {
      const head = i.slice(0, i.length - d);
      const dec = i.slice(i.length - d, i.length - d + 1);
      return `${v.startsWith("-") ? "\u2212" : ""}$${head}${head.length < 3 && dec !== "0" ? `.${dec}` : ""}${u}`;
    }
  }
  return `$${i}`;
}

function LegacyMoneyText({ value, ctx = "list", compact = false, signed = false }: LegacyMoneyTextProps) {
  const text = compact ? compactMoney(value) : groupMoney(value);
  const sign = signed && !value.startsWith("-") ? "+" : "";
  if (ctx === "hero" && !compact) {
    const dot = text.lastIndexOf(".");
    return (
      <span className="money money-hero">
        {text.slice(0, dot)}<span className="cents" data-testid="hero-cents">{text.slice(dot)}</span>
      </span>
    );
  }
  return <span className={`num money money-${ctx}`}>{sign + text}</span>;
}

export function PctText({ value }: { value: string }) {
  const neg = value.startsWith("-");
  const text = `${neg ? "\u2212" : "+"}${value.replace(/^[-+]/, "")}%`;
  return <span className={`num ${neg ? "loss" : "gain"}`}>{text}</span>;
}
