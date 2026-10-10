'use client';

import { createSandboxClient, type SandboxClient } from '@/sandbox/client';
import { SandboxError, type ActResult, type MarketSnapshot, type SandboxCommand, type SandboxPlan, type SandboxSpec, type SandboxView, type StepResult } from '@/sandbox/sandbox';
import type { BoardEntry } from '@/sandbox/board';

/**
 * The page's one sandbox client. Everything a practice, lesson, scenario or challenge does goes through here and
 * nowhere else: the live store, the server and the net layer are never imported by the sandbox, and the sandbox never
 * sends a request. The client is created on first use (a Worker where the browser has one).
 */

let client: SandboxClient | null = null;

function rpc(): SandboxClient {
  client ??= createSandboxClient();
  return client;
}

/** A sandbox the page holds: its id in the worker, its plan (what it is built from), and where it came from. */
export interface OpenedSandbox {
  id: string;
  plan: SandboxPlan;
  origin: 'live' | 'imported';
  tick: number;
}

function call<T>(req: unknown): Promise<T> {
  return rpc().call<T>(req);
}

export const sandboxRpc = {
  create: (spec: SandboxSpec) => call<OpenedSandbox>({ op: 'create', spec }),
  importRun: (text: string) => call<OpenedSandbox>({ op: 'import', text }),
  step: (id: string, ticks: number) => call<StepResult>({ op: 'step', id, ticks }),
  act: (id: string, command: SandboxCommand) => call<ActResult>({ op: 'act', id, command }),
  view: (id: string) => call<SandboxView>({ op: 'view', id }),
  market: (id: string) => call<MarketSnapshot>({ op: 'market', id }),
  assets: (id: string) => call<{ id: string; assetClass: string }[]>({ op: 'assets', id }),
  exportRun: (id: string) => call<{ text: string }>({ op: 'export', id }),
  submit: (id: string) => call<BoardEntry>({ op: 'submit', id }),
  leaderboard: (weekKey: string) => call<BoardEntry[]>({ op: 'leaderboard', weekKey }),
  close: (id: string) => call<{ ok: boolean }>({ op: 'close', id }),
};

/** The stable code of a failed sandbox call ('internal' for anything else). */
export function sandboxErrorCode(e: unknown): string {
  return e instanceof SandboxError ? e.code : 'internal';
}
