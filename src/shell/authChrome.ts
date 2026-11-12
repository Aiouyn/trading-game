"use client";
/**
 * Single presentation seam for authenticated shell chrome.
 * StatusStrip / PhoneHome / Account all read authSession — do not fork account identity.
 */
import { useEffect } from "react";
import { settingsNav } from "@/apps/settings/sections";
import { DEMO_STARTER_NW } from "@/shell/accountDemoBoundary";
import { authSession, useAuthSession, type AuthUiState } from "@/shell/authSession";
import type { ShellStore } from "@/shell/store";
import { viewportOf } from "@/shell/wm";

export { DEMO_STARTER_NW };

export function isSignedIn(auth: AuthUiState): auth is Extract<AuthUiState, { status: "signed_in" }> {
  return auth.status === "signed_in";
}

export function useAuthChrome() {
  const auth = useAuthSession();
  useEffect(() => {
    void authSession.ensureBoot();
  }, []);
  return auth;
}

/** Open Settings → Account (desktop window or phone push). */
export function openAccountSettings(store: ShellStore): void {
  settingsNav.open("SET-01");
  store.getState().open("settings", undefined, { deepLink: true });
}

/** After a successful sign-up, close Settings so the Portfolio goal/guide is visible (playtest d08). */
export function closeSettingsAfterSignUp(store: ShellStore): void {
  const s = store.getState();
  if (viewportOf(s.vw) === "phone") {
    if (s.phoneApp?.app === "settings") store.setState({ phoneApp: null });
    return;
  }
  const w = s.local.windows.find((x) => x.app === "settings");
  if (w) s.close(w);
}
