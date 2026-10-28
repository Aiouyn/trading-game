"use client";
import { useEffect, type ReactNode } from "react";
import { MoneyText, type MoneyCtx } from "@/components/shell/MoneyText";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Label } from "@/components/ui/Label";
import { Glyph } from "@/components/shell/Glyph";
import { PALETTE_IDS, type PaletteId } from "@/styles/tokens";
import { APPS, type AppId } from "@/shell/registry";
import { APP_NAMES } from "@/shell/strings";

const APP_IDS = Object.keys(APPS) as AppId[];

const VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "ghost", "icon"];
const TONES: readonly ChipTone[] = ["neutral", "acc", "gain", "loss", "warn", "info", "signal"];
const CTXS: readonly MoneyCtx[] = ["hero", "table", "list", "chip", "sentence", "delta", "wealth"];
const AMOUNTS = ["12400", "3210000", "1050000000", "4200000000000", "-42.10", "0", "1284.10"];

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ds-row">
      <Label>{title}</Label>
      <div className="ds-items">{children}</div>
    </section>
  );
}

function Buttons({ scope }: { scope: string }) {
  return (
    <div data-testid={`ds-buttons-${scope}`}>
      {VARIANTS.map((v) => (
        <Row key={v} title={`${scope} button ${v}`}>
          {(["md", "sm"] as const).map((size) => (
            <Button key={size} variant={v} size={size} data-testid={`ds-btn-${scope}-${v}-${size}`} aria-label={v === "icon" ? `${v} ${size}` : undefined}>
              {v === "icon" ? <Glyph name="settings" /> : `${v} ${size}`}
            </Button>
          ))}
          <Button variant={v} disabled data-testid={`ds-btn-${scope}-${v}-disabled`} aria-label={v === "icon" ? `${v} disabled` : undefined}>
            {v === "icon" ? <Glyph name="settings" /> : `${v} disabled`}
          </Button>
        </Row>
      ))}
    </div>
  );
}

export function DesignSystemSheet({ palette }: { palette: string }) {
  useEffect(() => {
    if ((PALETTE_IDS as readonly string[]).includes(palette)) document.documentElement.dataset.palette = palette as PaletteId;
  }, [palette]);

  return (
    <main className="ds" data-testid="ds-ready">
      <h1 className="section-title">{"Quay primitives · 17A T1"}</h1>
      <Buttons scope="base" />
      <Row title="chips">
        {TONES.map((t) => <Chip key={t} tone={t} data-testid={`ds-chip-${t}`}>{t}</Chip>)}
        {TONES.map((t) => <Chip key={`o-${t}`} tone={t} outline>{`${t} outline`}</Chip>)}
      </Row>
      <Row title="label">
        <Label>{"Label on win"}</Label>
        <span className="ds-win2"><Label onWin2>{"Label on win2"}</Label></span>
      </Row>
      {CTXS.map((ctx) => (
        <Row key={ctx} title={`money ${ctx}`}>
          {AMOUNTS.map((a) => <span key={a} data-testid={`ds-money-${ctx}-${a}`}><MoneyText amount={a} ctx={ctx} /></span>)}
        </Row>
      ))}
      <Row title="money states">
        <span data-testid="ds-money-estimated"><MoneyText amount="1284.10" estimated /></span>
        <span data-testid="ds-money-estimated-neg"><MoneyText amount="-1284.10" ctx="delta" estimated /></span>
        <span data-testid="ds-money-estimated-pos"><MoneyText amount="1284.10" ctx="delta" estimated /></span>
        <span data-testid="ds-money-chip-neg-big"><MoneyText amount="-3210000" ctx="chip" /></span>
        <span data-testid="ds-money-estimated-zero"><MoneyText amount="0" ctx="delta" estimated /></span>
        <span data-testid="ds-money-ad"><MoneyText amount="500" restricted="AD_GRANT" /></span>
        <span data-testid="ds-money-start"><MoneyText amount="2500" restricted="FRESH_START" /></span>
      </Row>
      <section className="ds-row" data-testid="ds-glyphs">
        <Label>{"glyphs · 24 px and 60 px phone tile (17A T2)"}</Label>
        <div className="ds-glyphs">
          {APP_IDS.map((a) => (
            <figure key={a} className="ds-glyph" data-testid={`ds-glyph-${a}`}>
              <span className="muted"><Glyph name={a} size={24} /></span>
              <span className="tile-phone"><Glyph name={a} size={24} /></span>
              <figcaption className="label">{APP_NAMES[a]}</figcaption>
            </figure>
          ))}
        </div>
      </section>
      <div data-subpalette="shadow" className="ds-shadow" data-testid="ds-shadow">
        <Label>{"inside a Shadow container"}</Label>
        <Buttons scope="shadow" />
        <Row title="shadow wealth"><MoneyText amount="48212.40" ctx="wealth" /></Row>
      </div>
    </main>
  );
}
