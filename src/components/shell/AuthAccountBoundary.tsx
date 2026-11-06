"use client";
/**
 * Binds authSession to the demo trading feed + shell channels.
 * Remounts children on account key so useChannel stores do not keep a prior feed.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { applyGuestDemo, applySignedInDemo } from "@/shell/accountDemoBoundary";
import { isSignedIn, useAuthChrome } from "@/shell/authChrome";
import { useShellStore } from "./ShellContext";

export function AuthAccountBoundary({ query, children }: { query: string; children: ReactNode }) {
  const store = useShellStore();
  const auth = useAuthChrome();
  const applied = useRef<string | null>(null);
  const authBoundaryKey = isSignedIn(auth) ? auth.account.accountId : "guest";

  // Layout (before useChannel's passive retain): install the account feed before subscribers
  // rebind. useChannel also tolerates setFeed mid-flight; this keeps the first paint coherent.
  useLayoutEffect(() => {
    if (auth.status === "loading") return;
    if (applied.current === authBoundaryKey) return;
    applied.current = authBoundaryKey;
    if (isSignedIn(auth)) {
      applySignedInDemo(store, auth.account.accountId, auth.world.marketSeed, {
        cashCents: auth.player.cashCents,
      });
    }
    else applyGuestDemo(store, query);
  }, [auth, authBoundaryKey, store, query]);

  // Remount trading/shell surfaces when the account identity changes (incl. logout).
  return <div key={authBoundaryKey} data-testid="auth-account-boundary" data-account={authBoundaryKey}>{children}</div>;
}
