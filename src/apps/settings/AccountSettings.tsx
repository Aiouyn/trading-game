"use client";
// SET-01 Account settings — M1-01 visible register / login / logout (real sessions).
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { MoneyText } from "@/components/shell/MoneyText";
import { cashCentsToMoney } from "@/shell/cashFormat";
import { authErrorCopy, type AuthClientError } from "@/shell/authClient";
import { authSession, useAuthSession } from "@/shell/authSession";
import { Segment } from "./controls";
import { useSettingsStrings } from "./useSettingsStrings";
import { closeSettingsAfterSignUp } from "@/shell/authChrome";

type Mode = "register" | "login";

function isClientError(err: unknown): err is AuthClientError {
  return !!err && typeof err === "object" && "code" in err && typeof (err as AuthClientError).code === "string";
}

export function AccountSettings() {
  const t = useSettingsStrings();
  const store = useShellStore();
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
    if (password.length < 8 || password.length > 128) {
      setError(authErrorCopy({ code: "PASSWORD_WEAK", message: "", status: 400 }, locale));
      return;
    }
    if (handle.trim().length < 3) {
      setError(authErrorCopy({ code: "HANDLE_INVALID", message: "", status: 400 }, locale));
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        await authSession.register(handle.trim(), password);
        closeSettingsAfterSignUp(store);
      } else await authSession.login(handle.trim(), password);
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
          <p className="account-starter" data-testid="account-starter">
            <span className="set-row-label">{t.accountStarterLabel}</span>
            <span data-testid="account-starter-amount"><MoneyText amount={cashCentsToMoney(auth.player.cashCents)} ctx="chip" /></span>
          </p>
          <p className="muted set-hint" data-testid="account-disclaimer">{t.accountDisclaimer}</p>
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
        <p className="muted set-hint" data-testid="account-disclaimer">{t.accountDisclaimer}</p>
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
        <form className="account-form" noValidate onSubmit={(e) => void onSubmit(e)} aria-describedby={error ? errId : undefined}>
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
      </section>
    </div>
  );
}
