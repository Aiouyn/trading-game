"use client";
// UI card 10 News: the `news` items naming this asset (an asset entity whose id is the assetId), newest tick first,
// then id. A row is one button that opens the story in Wire (card 9 detail). `news` has its own states here.
import { Button } from "@/components/ui/Button";
import { KindChip } from "@/apps/wire/WireItemRow";
import { headline, timeLabel, useWireStrings } from "@/apps/wire/strings";
import { useShellStore } from "@/components/shell/ShellContext";
import type { WireItem } from "@/shell/contracts/channels";
import { getFeed, useChannel } from "@/shell/contracts/useChannel";
import type { BrStrings } from "./strings";

/** Stories naming `assetId`, tick desc then id asc. */
export function assetStories(items: readonly WireItem[], assetId: string): WireItem[] {
  return items
    .filter((i) => i.entities.some((e) => e.kind === "asset" && e.id === assetId))
    .sort((a, b) => b.tick - a.tick || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The name is `openStoryAria(headline)` built from content, not an `aria-label`: the sr-only prefix ("Open in Wire: ")
 *  then the visible headline, with the chip and time aria-hidden. An aria-label would drop the visible headline from
 *  the computed text axe compares (label-content-name-mismatch, WCAG 2.5.3), as card 9's Open in Broker found. */
export const storyPrefix = (t: BrStrings, text: string): string => t.openStoryAria(text).slice(0, -text.length);

export function AssetNews({ t, assetId }: { t: BrStrings; assetId: string }) {
  const news = useChannel("news");
  const wt = useWireStrings();
  const store = useShellStore();
  if (news.state === "loading") return <div className="ap-skel" data-testid="ap-news-loading" aria-busy="true" aria-label={t.newsLoading} />;
  if (news.body === null) {
    return (
      <div className="ap-error" data-testid="ap-news-error" data-state={news.state}>
        <span role="alert">{t.couldntLoad}</span>
        <Button size="sm" data-testid="ap-news-retry" onClick={() => getFeed().resync("news")}>{t.retry}</Button>
      </div>
    );
  }
  const stories = assetStories(news.body.items, assetId);
  return (
    <div className="ap-news" data-testid="ap-news" data-state={news.state}>
      {news.state === "stale" && <p className="muted" data-testid="ap-news-updating">{t.updating}</p>}
      {stories.length === 0 ? (
        <div className="ap-empty" data-testid="ap-news-empty">
          <p className="muted">{t.noNews(assetId)}</p>
          <p className="muted">{t.newsHelp}</p>
        </div>
      ) : (
        <ul className="ap-stories">
          {stories.map((item) => {
            const text = headline(item, wt);
            return (
              <li key={item.id}>
                <button type="button" className="ap-story" data-testid="ap-story" data-id={item.id}
                  onClick={() => store.getState().open("wire", item.id)}>
                  <span aria-hidden="true"><KindChip kind={item.kind} t={wt} /></span>
                  <span className="sr-only">{storyPrefix(t, text)}</span>
                  <span className="ap-story-hl" data-testid="ap-story-hl">{text}</span>
                  <time className="ap-story-time" aria-hidden="true">{timeLabel(item.tick, wt)}</time>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
