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

export { DEMO_STARTER_NW };

export function isSignedIn(auth: AuthUiState): auth is Extract<AuthUiState, { status: "signed_in" }> {
  return auth.status === "signed_in";
}

/** Session cookie check has not resolved. Chrome must not paint guest or signed-in identity yet. */
export function isAuthPending(auth: AuthUiState): boolean {
  return auth.status === "loading";
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
