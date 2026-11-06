"use client";
/**
 * Single presentation seam for authenticated shell chrome.
 * StatusStrip / PhoneHome / Account all read authSession — do not fork account identity.
 */
import { useEffect } from "react";
import { settingsNav } from "@/apps/settings/sections";
import { authSession, useAuthSession, type AuthUiState } from "@/shell/authSession";
import type { ShellStore } from "@/shell/store";

/** Neutral starter cash for signed-in chrome — not live mock NW ($412k). */
export const DEMO_STARTER_NW = "10000.00";

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
