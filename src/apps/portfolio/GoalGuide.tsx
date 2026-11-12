"use client";
// Card 33: signed-in Portfolio goal + first-trade path. Buttons only open Wire / Broker — no pre-fill or submit.
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { MoneyText } from "@/components/shell/MoneyText";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import type { MeTradingBody } from "@/shell/contracts/channels";
import { goalStrings } from "./goalStrings";
import "./goalGuide.css";

const HIDE_KEY = "avalon.pf.goal-guide.hidden";

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

export function GoalGuide({ me, phone }: { me: MeTradingBody; phone: boolean }) {
  const locale = useShell((s) => (s.prefs.locale === "fr" ? "fr" : "en"));
  const store = useShellStore();
  const t = goalStrings(locale);
  const [hidden, setHidden] = useState(readHidden);
  const setH = (v: boolean) => {
    setHidden(v);
    try {
      localStorage.setItem(HIDE_KEY, v ? "1" : "0");
    } catch {
      /* private-mode / blocked storage */
    }
  };
  return (
    <section className={`pf-goal${phone ? " pf-phone" : ""}`} data-testid="pf-goal" aria-label={t.title}>
      <Label className="pf-goal-title">{t.title}</Label>
      <p className="pf-goal-line">{t.goal}</p>
      <p className="pf-goal-now muted" data-testid="pf-goal-now">
        {t.now} <MoneyText amount={me.nw} ctx="table" />
      </p>
      {!hidden && (
        <div className="pf-guide" data-testid="pf-guide">
          <h3 className="pf-guide-title">{t.guideTitle}</h3>
          <ol className="pf-guide-steps" data-testid="pf-guide-steps">
            <li data-testid="pf-guide-step-1">
              <span>{t.step1}</span>
              <Button size="sm" type="button" data-testid="pf-open-wire" onClick={() => store.getState().open("wire")}>{t.openWire}</Button>
            </li>
            <li data-testid="pf-guide-step-2">
              <span>{t.step2}</span>
              <Button size="sm" type="button" data-testid="pf-open-broker" onClick={() => store.getState().open("broker")}>{t.openBroker}</Button>
            </li>
            <li data-testid="pf-guide-step-3"><span>{t.step3}</span></li>
          </ol>
          <Button size="sm" variant="ghost" type="button" data-testid="pf-guide-hide" onClick={() => setH(true)}>{t.hide}</Button>
        </div>
      )}
      {hidden && (
        <Button size="sm" variant="ghost" type="button" data-testid="pf-guide-show" onClick={() => setH(false)}>{t.show}</Button>
      )}
    </section>
  );
}
