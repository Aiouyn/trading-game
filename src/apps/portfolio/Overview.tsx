"use client";
// Portfolio overview (UI card 2, 17B PF-A): nominal NW hero, cash summary, restricted cash, stats (when sent) and rank.
// Every number is the contract string, formatted by MoneyText (or its digit formatter for non-FDL codes); nothing here
// converts, sums or divides Money (PF-2-01). Real NW / NWI never reach the hero (AC-17-NW-NOMINAL).
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Label } from "@/components/ui/Label";
import { MINUS, fullDigits, parseAmount } from "@/components/ui/money";
import { MoneyText, type Restricted } from "@/components/shell/MoneyText";
import { useShell } from "@/components/shell/ShellContext";
import type { MeTradingBody, Money, NwStats, RestrictedBucket } from "@/shell/contracts/channels";
import { getFeed, useChannel, type ChannelView } from "@/shell/contracts/useChannel";
import type { RankChannel } from "@/shell/channels";
import { RANK_NAMES } from "@/shell/registry";
import { pfNumberLocale, pfStrings, type ReleaseUnit } from "./strings";

type T = ReturnType<typeof pfStrings>;

const MIN_MS = 60_000, HOUR_MS = 60 * MIN_MS, DAY_MS = 24 * HOUR_MS;

/** Real-time release wording with the unit written (17 §3.4.4). `untilRealMs` is real milliseconds to release; it is a
 *  time, not Money, so rounding it up to whole minutes / hours / days is allowed. */
export function releaseText(untilRealMs: number | null, t: T, locale: string): string {
  if (untilRealMs === null) return t.held;
  const ms = Math.max(untilRealMs, 0);
  const [unit, size]: [ReleaseUnit, number] = ms < HOUR_MS ? ["minute", MIN_MS] : ms < 2 * DAY_MS ? ["hour", HOUR_MS] : ["day", DAY_MS];
  const n = Math.max(1, Math.ceil(ms / size));
  return t.releasesIn(new Intl.NumberFormat(pfNumberLocale(locale)).format(n), unit, n === 1);
}

/** A balance in a non-FDL code: "1,250.00 MDOL" (amount, then code, no symbol; E-61). Digits as sent, regrouped. */
function CodeAmount({ amount, code }: { amount: Money; code: string }) {
  const p = parseAmount(amount);
  const text = `${p.negative ? MINUS : ""}${fullDigits(p)} ${code}`;
  return <span className={`num money money-table${p.negative ? " loss" : ""}`} data-testid={`pf-amount-${code}`}>{text}</span>;
}

function Balance({ code, amount }: { code: string; amount: Money }) {
  return code === "FDL" ? <MoneyText amount={amount} ccy="FDL" ctx="table" /> : <CodeAmount amount={amount} code={code} />;
}

const PILL: Record<string, Restricted> = { AD: "AD", START: "START" };

function RestrictedRows({ buckets, t, locale }: { buckets: RestrictedBucket[]; t: T; locale: string }) {
  return (
    <section className="pf-block pf-restricted" data-testid="pf-restricted" aria-label={t.restricted}>
      <Label className="pf-label">{t.restricted}</Label>
      <table className="pf-rows"><tbody>
        {buckets.map((b, i) => (
          <tr key={`${b.reason}-${i}`} data-testid="pf-restricted-row">
            <td className="pf-cell-amount">
              {PILL[b.reason]
                ? <MoneyText amount={b.amount} ctx="table" restricted={PILL[b.reason]} />
                : <span className="money-restricted"><MoneyText amount={b.amount} ctx="table" /><Chip tone="acc" outline>{b.reason}</Chip></span>}
            </td>
            <td className="pf-cell-note muted" data-testid="pf-release">{releaseText(b.untilRealMs, t, locale)}</td>
          </tr>
        ))}
      </tbody></table>
    </section>
  );
}

function Stats({ stats, t }: { stats: NwStats; t: T }) {
  return (
    <section className="pf-block pf-stats" data-testid="pf-stats" aria-label={t.stats}>
      <table className="pf-rows"><tbody>
        <tr><th scope="row">{t.drawdownReal}</th><td className="num" data-testid="pf-drawdown">{stats.drawdownReal}</td></tr>
        <tr><th scope="row">{t.sharpe}</th><td className="num" data-testid="pf-sharpe">{stats.sharpe ?? t.none}</td></tr>
      </tbody></table>
    </section>
  );
}

function RankBlock({ rank, t }: { rank: RankChannel; t: T }) {
  return (
    <section className="pf-block pf-rank" data-testid="pf-rank" aria-label={t.rank}>
      <Chip tone="acc" data-testid="pf-rank-chip">{`${rank.rank} · ${RANK_NAMES[rank.rank]}`}</Chip>
      <p className="pf-next" data-testid="pf-next">
        {rank.nextAt === null ? t.topRank : <>{t.nextRankAt} <MoneyText amount={rank.nextAt} /></>}
      </p>
    </section>
  );
}

function Hero({ me, t, stale }: { me: MeTradingBody; t: T; stale: boolean }) {
  return (
    <section className="pf-hero" data-testid="pf-hero" aria-label={t.netWorth}>
      <Label className="pf-label">{t.netWorth}</Label>
      <div className="pf-hero-nw" data-testid="pf-hero-nw"><MoneyText amount={me.nw} ctx="hero" /></div>
      {stale && <p className="pf-updating muted" role="status" data-testid="pf-updating">{t.updating}</p>}
    </section>
  );
}

export interface OverviewViewProps {
  view: ChannelView<MeTradingBody>;
  rank: RankChannel;
  locale: string;
  phone: boolean;
  onRetry: () => void;
}

/** Pure view of one `me` channel state (unit-testable without a feed). */
export function OverviewView({ view, rank, locale, phone, onRetry }: OverviewViewProps) {
  const t = pfStrings(locale);
  const cls = `pf-ov${phone ? " pf-phone" : ""}`;
  if (view.state === "loading") {
    return (
      <div className={cls} data-testid="pf-overview" data-state="loading">
        <section className="pf-hero" data-testid="pf-hero" aria-busy="true" aria-label={t.loading}>
          <Label className="pf-label">{t.netWorth}</Label>
          <div className="pf-skel" data-testid="pf-loading" />
        </section>
      </div>
    );
  }
  if (view.body === null) { // denied | error
    return (
      <div className={cls} data-testid="pf-overview" data-state={view.state}>
        <div className="pf-error" data-testid="pf-error">
          <span role="alert">{t.couldntLoad}</span>
          <Button className="pf-retry" data-testid="pf-retry" onClick={onRetry}>{t.retry}</Button>
        </div>
      </div>
    );
  }
  const me = view.body;
  const empty = Object.keys(me.positions).length === 0;
  return (
    <div className={cls} data-testid="pf-overview" data-state={view.state} data-stats={me.nwStats ? "1" : "0"}>
      <Hero me={me} t={t} stale={view.state === "stale"} />
      <RankBlock rank={rank} t={t} />
      <section className="pf-block pf-summary" data-testid="pf-summary" aria-label={t.balances}>
        <table className="pf-rows"><tbody>
          {Object.entries(me.balances).map(([code, amount]) => (
            <tr key={code} data-testid={`pf-balance-${code}`}><th scope="row">{t.cash(code)}</th><td><Balance code={code} amount={amount} /></td></tr>
          ))}
        </tbody></table>
        {empty && <p className="pf-empty muted" data-testid="pf-empty">{t.emptyCash}</p>}
      </section>
      {me.restricted.length > 0 && <RestrictedRows buckets={me.restricted} t={t} locale={locale} />}
      {me.nwStats && <Stats stats={me.nwStats} t={t} />}
    </div>
  );
}

export function Overview({ phone }: { phone: boolean }) {
  const view = useChannel("me");
  const rank = useShell((s) => s.channels.rank);
  const locale = useShell((s) => s.prefs.locale);
  return <OverviewView view={view} rank={rank} locale={locale} phone={phone} onRetry={() => getFeed().resync("me")} />;
}
