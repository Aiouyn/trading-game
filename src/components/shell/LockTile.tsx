import { APPS, type AppId } from "@/shell/registry";
import { APP_NAMES } from "@/shell/strings";
import { Glyph } from "./Glyph";

/** Body shown for a locked app (deep link to a locked screen). No upsell, no badge. */
export function LockTile({ app }: { app: AppId }) {
  return (
    <section className="lock-body" data-testid="lock-body">
      <span className="disabled"><Glyph name={app} size={32} /></span>
      <h2 className="section-title">{APP_NAMES[app]}</h2>
      <p className="muted">{APPS[app].lockHint}</p>
    </section>
  );
}
