"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ASSETS } from "@/market/catalog";
import { getFeed } from "@/shell/contracts/useChannel";
import { fill, type WireStrings } from "./strings";

const LISTED = ASSETS.filter((a) => a.class !== "index");
const MAX = 280;

function newKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

export function Composer({ t }: { t: WireStrings }) {
  const c = t.composer;
  const [text, setText] = useState("");
  const [assets, setAssets] = useState<string[]>(["HALC"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(3);
  const [key, setKey] = useState(newKey);

  const n = [...text].length;
  const canSubmit = !busy && n > 0 && n <= MAX && assets.length >= 1;

  const fee = useMemo(() => fill(c.fee, { n: String(remaining) }), [c.fee, remaining]);

  const toggle = (id: string) => {
    setAssets((cur) => {
      if (cur.includes(id)) return cur.length === 1 ? cur : cur.filter((x) => x !== id);
      if (cur.length >= 3) return cur;
      return [...cur, id];
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wire", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ idempotencyKey: key, text, assetTags: assets }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string }; remainingToday?: number };
      if (!res.ok) {
        const code = body.error?.code ?? "BAD_REQUEST";
        setError(c.errors[code] ?? body.error?.message ?? c.errors.BAD_REQUEST);
        if (typeof body.error?.code === "string" && body.error.code === "DAY_CAP") setRemaining(0);
        return;
      }
      if (typeof body.remainingToday === "number") setRemaining(body.remainingToday);
      setText("");
      setKey(newKey());
      getFeed().resync("news");
      getFeed().resync("me");
    } catch {
      setError(c.errors.BAD_REQUEST);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="wire-composer" data-testid="wire-composer">
      <summary className="wire-composer-summary wire-hit" data-testid="wire-composer-toggle">{c.summary}</summary>
      <form className="wire-composer-form" data-testid="wire-composer-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="wire-composer-label" htmlFor="wire-composer-text">{c.textLabel}</label>
        <textarea
          id="wire-composer-text"
          className="wire-composer-text"
          data-testid="wire-composer-text"
          value={text}
          maxLength={MAX}
          rows={3}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="wire-composer-meta muted" data-testid="wire-composer-count">{fill(c.charCount, { n: String(n) })}</p>
        <fieldset className="wire-composer-assets">
          <legend className="wire-composer-label">{c.assetsLabel}</legend>
          <div className="wire-composer-chips">
            {LISTED.map((a) => {
              const on = assets.includes(a.assetId);
              return (
                <button
                  key={a.assetId}
                  type="button"
                  className="wire-chip"
                  data-testid={`wire-composer-asset-${a.assetId}`}
                  aria-pressed={on}
                  onClick={() => toggle(a.assetId)}
                >
                  <span className="wire-chip-face">{a.ticker}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <p className="wire-composer-meta" data-testid="wire-composer-fee">{fee}</p>
        {error && <p className="wire-composer-error" data-testid="wire-composer-error" role="alert">{error}</p>}
        <Button variant="primary" size="sm" type="submit" disabled={!canSubmit} data-testid="wire-composer-submit">
          {busy ? c.posting : c.submit}
        </Button>
      </form>
    </details>
  );
}
