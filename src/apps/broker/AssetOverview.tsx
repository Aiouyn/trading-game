"use client";
// UI card 10 Overview: the asset's identity (fixture values verbatim), the header's Quote, the trading state and the
// player's position. No daily statistics (Gap 1) and no maths: every value is a server or fixture string.
import { Chip } from "@/components/ui/Chip";
import { compactMoneyText } from "@/components/ui/money";
import { decText } from "@/apps/portfolio/positions/format";
import { getAssetDetail } from "@/shell/contracts/assetDetail";
import type { Position, TickerRow } from "@/shell/contracts/channels";
import type { ReactNode } from "react";
import { Quote } from "./AssetHeader";
import type { BrStrings } from "./strings";

function Row({ k, label, children }: { k: string; label: string; children: ReactNode }) {
  return <div className="ap-row" data-testid="ap-row" data-key={k}><dt>{label}</dt><dd>{children}</dd></div>;
}

export function AssetOverview({ t, locale, assetId, row, position }: {
  t: BrStrings; locale: string; assetId: string; row: TickerRow | undefined; position: Position | undefined;
}) {
  const a = getAssetDetail(assetId, row?.state);
  if (a === null) return <p className="muted" data-testid="ap-unknown">{t.unknownAsset}</p>;
  const f = t.f;
  return (
    <dl className="ap-rows" data-testid="ap-overview">
      <Row k="name" label={f.name}>{a.name}</Row>
      <Row k="ticker" label={f.ticker}>{a.ticker}</Row>
      <Row k="type" label={f.type}>{Object.hasOwn(t.class, a.class) ? t.class[a.class] : a.class}</Row>
      <Row k="sector" label={f.sector}>{a.sector}</Row>
      <Row k="region" label={f.region}>{a.bloc}</Row>
      <Row k="ccy" label={f.ccy}>{a.ccy}</Row>
      <Row k="licence" label={f.licence}>{a.licenseTier}</Row>
      <Row k="quote" label={f.quote}><Quote row={row} locale={locale} t={t} ids="ap" /></Row>
      <Row k="trading" label={f.trading}>
        <span className="ap-state" data-testid="ap-state" data-state={a.tradingState}>{t.st[a.tradingState]}</span>
        {row?.halted && <Chip tone="steel" outline className="br-halted" data-testid="ap-halted">{t.halted}</Chip>}
      </Row>
      <Row k="position" label={f.position}>
        {position
          ? <span className="num" data-testid="ap-position">{t.positionLine(decText(position.qty, locale), compactMoneyText(position.value))}</span>
          : <span className="muted" data-testid="ap-no-position">{t.noPosition}</span>}
      </Row>
    </dl>
  );
}
