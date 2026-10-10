'use client';

// Products and demand (Velvet 4): each product with its price, quality against the ready mark, unit cost, share and
// marketing, and the public rivals table. A price is set inside the band the engine allows; every refusal is inline.
import { useState } from 'react';
import { money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, NumberField, Td, Th } from '@/components/ui';
import type { CompanyFounderView } from '@/world/company/views';
import { PrivateChip, PublicChip, RefusalNote, Section } from './Shared';
import { numberOrNull, refusalOf, type Refusal } from './model';

type Product = CompanyFounderView['productsPrivate'][number];

export function Products({ co }: { co: CompanyFounderView }) {
  const { limits } = co;
  return (
    <div className="flex flex-col gap-4" data-testid="company-products">
      <Section title={t('company.ui.products.title')} chip={<PrivateChip />} testId="company-products-table">
        {co.productsPrivate.length === 0 ? (
          <p className="text-small text-fg-muted">{t('company.ui.products.none')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr>
                  <Th>{t('company.ui.products.col.product')}</Th>
                  <Th right>{t('company.ui.products.col.price')}</Th>
                  <Th right>{t('company.ui.products.col.quality')}</Th>
                  <Th right>{t('company.ui.products.col.unitCost')}</Th>
                  <Th right>{t('company.ui.products.col.share')}</Th>
                  <Th right>{t('company.ui.products.col.marketing')}</Th>
                </tr>
              </thead>
              <tbody>
                {co.productsPrivate.map((p) => (
                  <ProductRow key={p.id} p={p} companyId={co.id} priceMin={limits.priceMin} priceMax={limits.priceMax} ready={limits.qualityReady} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title={t('company.ui.rivals.title')} chip={<PublicChip />} testId="company-competitors">
        {co.rivals.length === 0 ? (
          <p className="text-small text-fg-muted">{t('company.ui.rivals.none')}</p>
        ) : (
          <table className="w-full text-left">
            <tbody>
              {co.rivals.map((r, i) => (
                <tr key={r.id} className="border-b border-ink-2 last:border-0">
                  <Td>{t('company.ui.rivals.name', { n: i + 1 })}</Td>
                  <Td right num>{money(r.price)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-caption text-fg-faint" data-testid="company-rivals-note">{t('company.ui.rivals.note')}</p>
      </Section>
    </div>
  );
}

function ProductRow({ p, companyId, priceMin, priceMax, ready }: {
  p: Product; companyId: string; priceMin: number; priceMax: number; ready: number;
}) {
  const act = useGame((s) => s.act);
  const [price, setPrice] = useState(String(p.price));
  const [marketing, setMarketing] = useState(String(p.marketing));
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (action: { kind: 'setPrice'; productId: string; price: number } | { kind: 'setMarketing'; productId: string; amount: number }) => {
    setBusy(true);
    const ack = await act({ type: 'company.act', companyId, action }, { silent: true });
    setBusy(false);
    setRefusal(refusalOf(ack));
  };
  const priceValue = numberOrNull(price);
  const marketingValue = numberOrNull(marketing);
  return (
    <>
      <tr className="border-t border-ink-2" data-testid={`company-product-${p.id}`}>
        <Td>
          <span className="text-small text-fg">{p.name}</span>
          <span className="block text-caption text-fg-faint">{t('company.ui.products.band', { min: money(priceMin), max: money(priceMax) })}</span>
        </Td>
        <Td right num>
          <span className="flex items-center justify-end gap-2">
            <NumberField value={price} onChange={setPrice} min={priceMin} step={0.01} testId={`company-price-${p.id}`} label="$" className="h-9 w-28" />
            <Button size="sm" disabled={busy || priceValue === null} onClick={() => { if (priceValue !== null) void submit({ kind: 'setPrice', productId: p.id, price: priceValue }); }} testId={`company-price-set-${p.id}`}>
              {t('company.ui.products.setPrice')}
            </Button>
          </span>
        </Td>
        <Td right num>
          <span>{Math.round(p.qualityScore)}</span>
          <span className="block text-caption text-fg-faint">{t('company.ui.products.ready', { mark: ready })}</span>
        </Td>
        <Td right num>{money(p.unitCost)}</Td>
        <Td right num>{pct(p.share)}</Td>
        <Td right num>
          <span className="flex items-center justify-end gap-2">
            <NumberField value={marketing} onChange={setMarketing} min={0} step={1} testId={`company-marketing-${p.id}`} label="$" className="h-9 w-28" />
            <Button size="sm" disabled={busy || marketingValue === null} onClick={() => { if (marketingValue !== null) void submit({ kind: 'setMarketing', productId: p.id, amount: marketingValue }); }} testId={`company-marketing-set-${p.id}`}>
              {t('company.ui.products.setMarketing')}
            </Button>
          </span>
        </Td>
      </tr>
      {refusal ? (
        <tr>
          <td colSpan={6} className="pb-3 pt-1"><RefusalNote refusal={refusal} /></td>
        </tr>
      ) : null}
    </>
  );
}
