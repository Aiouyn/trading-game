import type { AppId } from "@/shell/registry";
import { APP_NAMES, S } from "@/shell/strings";

/** Placeholder body for every app with built:false (Spec 1 §2). No accent button. */
export function ComingLater({ app }: { app: AppId }) {
  return (
    <section className="coming-later" data-testid="coming-later">
      <h2 className="section-title">{APP_NAMES[app]}</h2>
      <p className="muted">{S.comingLater}</p>
    </section>
  );
}
