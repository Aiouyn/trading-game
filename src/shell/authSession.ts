"use client";
import { useSyncExternalStore } from "react";
import {
  fetchMe,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AuthMeResponse,
  type AuthPublicAccount,
  type AuthPlayerView,
} from "./authClient";

export type AuthUiState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; account: AuthPublicAccount; player: AuthPlayerView; sessionExpiresAtMs: number };

let state: AuthUiState = { status: "loading" };
let boot: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function setState(next: AuthUiState) {
  state = next;
  emit();
}

async function refreshFromServer(): Promise<AuthUiState> {
  try {
    const me = await fetchMe();
    if (!me) {
      setState({ status: "signed_out" });
      return state;
    }
    setState({
      status: "signed_in",
      account: me.account,
      player: me.player,
      sessionExpiresAtMs: me.session.expiresAtMs,
    });
    return state;
  } catch {
    setState({ status: "signed_out" });
    return state;
  }
}

export const authSession = {
  get: () => state,
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  /** Idempotent boot: resolve cookie session once per page load. */
  ensureBoot(): Promise<void> {
    if (!boot) boot = refreshFromServer().then(() => undefined);
    return boot;
  },
  async refresh(): Promise<AuthUiState> {
    return refreshFromServer();
  },
  async register(handle: string, password: string): Promise<AuthMeResponse | AuthUiState> {
    await registerAccount(handle, password);
    return refreshFromServer();
  },
  async login(handle: string, password: string): Promise<AuthUiState> {
    await loginAccount(handle, password);
    return refreshFromServer();
  },
  async logout(): Promise<void> {
    await logoutAccount();
    setState({ status: "signed_out" });
  },
  /** Test helper */
  _resetForTests() {
    state = { status: "loading" };
    boot = null;
  },
};

export function useAuthSession(): AuthUiState {
  return useSyncExternalStore(authSession.subscribe, authSession.get, () => ({ status: "loading" } as AuthUiState));
}
