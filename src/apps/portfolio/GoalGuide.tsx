"use client";
// M2-01 / M2-02: the grow-$10k goal and the first-trade guide, for a signed-in player (lazy chunk: guests and the Broker
// route's first load never load it). Every figure is the server's: `me.nw` (saved ledger at server quotes) and
// `me.fills` / `me.positions` / `me.orders`. The guide never places, pre-fills or confirms an order: its buttons only
// open Wire or Broker, and "done" comes from the server ledger alone (a fill or a position), never from a click.
// Hiding the guide is saved on this device per account (localStorage), not on the server.
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyText } from "@/components/shell/MoneyText";
import { useShellStore } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import type { MeTradingBody } from "@/shell/contracts/channels";
import { GOAL_TARGET, goalProgress } from "@/market/goal";
import { byNewest, fillWords } from "./Fills";
import { goalStrings } from "./goalStrings";
import "./goalGuide.css";


export type GuideStage = "start" | "waiting" | "done";
/** Bring the app's window on this workspace to the front (desktop's Trade layout already has Broker and Wire); open it
 *  only when none is there, so the guide never stacks a second Broker over the first. Phone pushes the app screen. */
function show(store: ReturnType<typeof useShellStore>, app: "wire" | "broker") {
  const s = store.getState();
  const w = s.local.windows.filter((x) => x.app === app && x.workspace === s.local.activeWorkspace && !x.collapsed).at(-1);
  if (w && viewportOf(s.vw) === "desktop") s.focus(w); else s.open(app);
}

export function guideStage(me: Pick<MeTradingBody, "fills" | "positions" | "orders">): GuideStage {
  if (me.fills.length > 0 || Object.keys(me.positions).length > 0) return "done";
  return Object.keys(me.orders).length > 0 ? "waiting" : "start";
}

export const hiddenKey = (accountId: string) => `quay.firstTradeGuide.hidden.v1:${accountId}`;
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => { listeners.delete(fn); window.removeEventListener("storage", fn); };
}
function readHidden(accountId: string): boolean {
  try { return window.localStorage.getItem(hiddenKey(accountId)) === "1"; } catch { return false; }
}
function writeHidden(accountId: string, hidden: boolean) {
  try { if (hidden) window.localStorage.setItem(hiddenKey(accountId), "1"); else window.localStorage.removeItem(hiddenKey(accountId)); } catch { /* private mode: not saved */ }
  for (const fn of listeners) fn();
}

export default function GoalGuide({ me, accountId, locale, phone }: { me: MeTradingBody; accountId: string; locale: string; phone: boolean }) {
  const t = goalStrings(locale);
  const store = useShellStore();
  // null on the server render: neither the guide nor "Show" until this device's choice for this account is read.
  const isHidden = useSyncExternalStore(subscribe, () => readHidden(accountId), () => null);
  const setH = (v: boolean) => writeHidden(accountId, v);

  const { pct, below, reached } = goalProgress(me.nw);
  const stage = guideStage(me);
  const last = stage === "done" && me.fills.length > 0 ? [...me.fills].sort(byNewest)[0] : null;
  const w = last ? fillWords(locale, last) : null;
  return (
    <section className={`pf-goal${phone ? " pf-phone" : ""}`} data-testid="pf-goal" data-stage={stage} aria-labelledby="pf-goal-h">
      <h2 id="pf-goal-h" className="pf-goal-title label">{t.title}</h2>
      <p className="pf-goal-line" data-testid="pf-goal-line">{t.goal}</p>
      <div className="pf-goal-bar" data-testid="pf-goal-bar" role="progressbar" aria-label={t.progress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="pf-goal-now muted" data-testid="pf-goal-now">
        {t.now} <MoneyText amount={me.nw} ctx="table" /> {t.of} <MoneyText amount={GOAL_TARGET} ctx="table" />
        {reached ? ` · ${t.reached}` : below ? ` · ${t.below}` : ""}
      </p>
      {isHidden === false && (
        <div className="pf-guide" data-testid="pf-guide">
          <h3 className="pf-guide-title">{t.guideTitle}</h3>
          {stage === "done" ? (
            <div data-testid="pf-guide-done" role="status">
              <p className="pf-guide-done">{t.done}{w && <> <span data-testid="pf-guide-fill">{t.doneFill(t.sideDone[last!.side], w.qty, w.ticker, w.price, w.fee)}</span></>}</p>
              <p className="muted">{t.doneSee}</p>
            </div>
          ) : (
            <ol className="pf-guide-steps" data-testid="pf-guide-steps">
              <li data-testid="pf-guide-step-1"><span>{t.step1}</span><Button size="sm" data-testid="pf-guide-open-wire" onClick={() => show(store, "wire")}>{t.openWire}</Button></li>
              <li data-testid="pf-guide-step-2"><span>{t.step2}</span><Button size="sm" data-testid="pf-guide-open-broker" onClick={() => show(store, "broker")}>{t.openBroker}</Button></li>
              <li data-testid="pf-guide-step-3"><span>{t.step3}</span>{stage === "waiting" && <span className="pf-guide-waiting" data-testid="pf-guide-waiting" role="status">{t.waiting}</span>}</li>
            </ol>
          )}
          <Button size="sm" variant="ghost" data-testid="pf-guide-hide" onClick={() => setH(true)}>{t.hide}</Button>
        </div>
      )}
      {isHidden === true && <Button size="sm" variant="ghost" data-testid="pf-guide-show" onClick={() => setH(false)}>{t.show}</Button>}
    </section>
  );
}
