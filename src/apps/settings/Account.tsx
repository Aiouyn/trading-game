"use client";
// SET-01 Account — M1-01 visible register / login / logout (real sessions).
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { useShell } from "@/components/shell/ShellContext";
import { authErrorCopy, type AuthClientError } from "@/shell/authClient";
import { authSession, useAuthSession } from "@/shell/authSession";
import { Segment } from "./controls";
import { useSettingsStrings } from "./useSettingsStrings";

type Mode = "register" | "login";

function isClientError(err: unknown): err is AuthClientError {
  return !!err && typeof err === "object" && "code" in err && typeof (err as AuthClientError).code === "string";
}

export function Account() {
  const t = useSettingsStrings();
  const locale = useShell((s) => (s.prefs.locale === "fr" ? "fr" : "en"));
  const auth = useAuthSession();
  const [mode, setMode] = useState<Mode>("register");
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleId = useId();
  const passId = useId();
  const errId = useId();

  useEffect(() => {
    void authSession.ensureBoot();
  }, []);

  const fail = (err: unknown) => {
    setError(authErrorCopy(isClientError(err) ? err : { code: "BAD_REQUEST", message: "", status: 400 }, locale));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") await authSession.register(handle.trim(), password);
      else await authSession.login(handle.trim(), password);
      setPassword("");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    setError(null);
    setBusy(true);
    try {
      await authSession.logout();
      setPassword("");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  if (auth.status === "loading") {
    return (
      <div className="account" data-testid="settings-account">
        <h2 className="section-title">{t.section["SET-01"]}</h2>
        <p className="muted set-hint" data-testid="account-loading">{t.accountLoading}</p>
      </div>
    );
  }

  if (auth.status === "signed_in") {
    return (
      <div className="account" data-testid="settings-account">
        <h2 className="section-title">{t.section["SET-01"]}</h2>
        <section className="account-panel" aria-labelledby="account-signed-in">
          <Label id="account-signed-in">{t.accountSignedIn}</Label>
          <p className="account-handle" data-testid="account-handle">{auth.account.handle}</p>
          <p className="muted set-hint" data-testid="account-world">{t.accountWorld(auth.account.worldId)}</p>
          <p className="muted set-hint" data-testid="account-cash-note">{t.accountCashNote}</p>
          {error ? (
            <p className="account-error" role="alert" data-testid="account-error">{error}</p>
          ) : null}
          <div className="account-actions">
            <Button variant="secondary" data-testid="account-logout" disabled={busy} onClick={() => void onLogout()}>
              {t.accountLogout}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="account" data-testid="settings-account">
      <h2 className="section-title">{t.section["SET-01"]}</h2>
      <section className="account-panel" aria-labelledby="account-form-label">
        <Label id="account-form-label">{mode === "register" ? t.accountCreate : t.accountSignIn}</Label>
        <Segment<Mode>
          label={t.accountMode}
          value={mode}
          options={[
            { id: "register", label: t.accountCreate },
            { id: "login", label: t.accountSignIn },
          ]}
          onChange={(v) => {
            setMode(v);
            setError(null);
          }}
          testId="account-mode"
        />
        <form className="account-form" onSubmit={(e) => void onSubmit(e)} aria-describedby={error ? errId : undefined}>
          <div className="set-block">
            <label className="set-row-label" htmlFor={handleId}>{t.accountHandle}</label>
            <input
              id={handleId}
              className="account-input"
              data-testid="account-handle-input"
              name="handle"
              autoComplete="username"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              required
              minLength={3}
              maxLength={32}
              spellCheck={false}
            />
          </div>
          <div className="set-block">
            <label className="set-row-label" htmlFor={passId}>{t.accountPassword}</label>
            <input
              id={passId}
              className="account-input"
              data-testid="account-password-input"
              name="password"
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
            />
          </div>
          {error ? (
            <p id={errId} className="account-error" role="alert" data-testid="account-error">{error}</p>
          ) : null}
          <div className="account-actions">
            <Button variant="primary" type="submit" data-testid="account-submit" disabled={busy}>
              {mode === "register" ? t.accountCreate : t.accountSignIn}
            </Button>
          </div>
        </form>
        <p className="muted set-hint" data-testid="account-disclaimer">{t.accountDisclaimer}</p>
      </section>
    </div>
  );
}
