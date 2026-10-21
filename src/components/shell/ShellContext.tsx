"use client";
import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { ShellState, ShellStore } from "@/shell/store";

export const ShellCtx = createContext<ShellStore | null>(null);

export function useShellStore(): ShellStore {
  const s = useContext(ShellCtx);
  if (!s) throw new Error("ShellCtx missing");
  return s;
}

export function useShell<T>(sel: (s: ShellState) => T): T {
  return useStore(useShellStore(), sel);
}
