"use client";
/**
 * Binds authSession to the demo trading feed + shell channels.
 * Remounts children on account key so useChannel stores do not keep a prior feed.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { applyGuestDemo, applySignedInDemo } from "@/shell/accountDemoBoundary";
import { isSignedIn, useAuthChrome } from "@/shell/authChrome";
import { useShellStore } from "./ShellContext";

export function AuthAccountBoundary({ query, children }: { query: string; children: ReactNode }) {
  const store = useShellStore();
  const auth = useAuthChrome();
  const applied = useRef<string | null>(null);
  const accountKey = isSignedIn(auth) ? auth.account.accountId : "guest";

  useEffect(() => {
    if (auth.status === "loading") return;
    if (applied.current === accountKey) return;
    applied.current = accountKey;
    if (isSignedIn(auth)) applySignedInDemo(store, auth.account.accountId);
    else applyGuestDemo(store, query);
  }, [auth, accountKey, store, query]);

  // Remount trading/shell surfaces when the account identity changes (incl. logout).
  return <div key={accountKey} data-testid="auth-account-boundary" data-account={accountKey}>{children}</div>;
}
