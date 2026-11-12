import {
  ActorBinding,
  BindingError,
  isIssuedActorContext,
  isPlainJson,
  isPlainObject,
  requireBoundActor,
  type ActorContext,
} from "@/server/actor-binding";
import type { BankCommand } from "./internal/banking/model";
import type { CreditCommand } from "./internal/credit/model";
import type { LiquidityIntent } from "./internal/liquidity/model";
import type { MarginCcpCommand } from "./internal/ccp/model";
import type { CoreFrame, CoreState } from "./model";

export const BANKING_CORE_ACTOR_DEFAULT_ENABLED = false;

export type BankingCoreActorOptions = {
  readonly actorGuard?: unknown;
  readonly contexts?: unknown;
  readonly binding?: unknown;
};

export type PlayerCommand =
  | { feature: "banking"; command: BankCommand }
  | { feature: "credit"; bankId: string; command: CreditCommand }
  | { feature: "liquidity"; command: LiquidityIntent }
  | { feature: "ccp"; command: MarginCcpCommand };

export function actorGuardEnabled(options?: { actorGuard?: unknown }): boolean {
  return options != null && typeof options === "object" && !Array.isArray(options)
    && Object.hasOwn(options, "actorGuard") && options.actorGuard === true;
}

function isCommandId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2000;
}

export function parseActorContext(raw: unknown): ActorContext {
  if (!isIssuedActorContext(raw)) throw new BindingError("FORGED_CONTEXT");
  return raw;
}

export function bindingForGuard(options?: { binding?: unknown }): ActorBinding {
  if (options != null && typeof options === "object" && !Array.isArray(options)
    && Object.hasOwn(options, "binding") && options.binding instanceof ActorBinding) {
    return options.binding;
  }
  throw new BindingError("SESSION_REJECTED");
}

export async function assertLiveCoreCommands(frames: readonly CoreFrame[], options?: BankingCoreActorOptions): Promise<void> {
  if (!actorGuardEnabled(options)) return;
  const binding = bindingForGuard(options);
  const contexts = parseActorContexts(options?.contexts);
  for (const item of collectPlayerCommands(frames)) {
    const context = contexts.get(item.command.id);
    if (context === undefined) throw new BindingError("MISSING_SESSION");
    await binding.assertLiveSession(context);
  }
}

export function parseActorContexts(raw: unknown): Map<string, ActorContext> {
  if (raw === undefined) return new Map();
  if (!isPlainObject(raw) || !isPlainJson(raw)) throw new BindingError("CLAIM_MALFORMED");
  const out = new Map<string, ActorContext>();
  for (const [key, value] of Object.entries(raw)) {
    if (!isCommandId(key)) throw new BindingError("CLAIM_MALFORMED");
    out.set(key, parseActorContext(value));
  }
  return out;
}

export function collectPlayerCommands(frames: readonly CoreFrame[]): PlayerCommand[] {
  const out: PlayerCommand[] = [];
  for (const frame of frames) {
    if (frame.banking) for (const command of frame.banking.commands) out.push({ feature: "banking", command });
    for (const row of frame.credit) for (const command of row.frame.commands) out.push({ feature: "credit", bankId: row.bankId, command });
    if (frame.liquidity) for (const command of frame.liquidity.commands) out.push({ feature: "liquidity", command });
    if (frame.ccp) for (const command of frame.ccp.commands) out.push({ feature: "ccp", command });
  }
  return out;
}

function accountOwner(state: CoreState, accountId: string): string | undefined {
  return state.accounts.find((account) => account.id === accountId)?.owner;
}

function creditLoanClient(state: CoreState, bankId: string, loanId: string): string | undefined {
  const book = state.creditBooks.find((row) => row.bankId === bankId);
  return book?.loans.find((loan) => loan.id === loanId)?.clientId
    ?? book?.offers.find((offer) => offer.id === loanId)?.clientId;
}

function claimedOwners(item: PlayerCommand, state: CoreState): string[] {
  const owners = new Set<string>([item.command.actor]);
  const add = (id: string | undefined | null) => { if (id) owners.add(id); };
  if (item.feature === "banking") {
    const command = item.command;
    if (command.kind === "DEPOSIT" || command.kind === "WITHDRAW") add(accountOwner(state, command.depositId));
    else if (command.kind === "MOVE") {
      add(accountOwner(state, command.from));
      add(accountOwner(state, command.to));
    } else if (command.kind === "PAY") add(accountOwner(state, command.from));
  } else if (item.feature === "credit") {
    const command = item.command;
    if (command.kind === "APPLY") add(accountOwner(state, command.receivingAccountId));
    else if (command.kind === "ACCEPT") {
      const book = state.creditBooks.find((row) => row.bankId === item.bankId);
      add(book?.offers.find((offer) => offer.id === command.offerId)?.clientId);
    } else if (command.kind === "DRAW" || command.kind === "REPAY" || command.kind === "CLOSE_LINE") {
      add(creditLoanClient(state, item.bankId, command.loanId));
    }
  } else if (item.feature === "liquidity") {
    const command = item.command;
    if (command.kind === "MOVE") {
      add(accountOwner(state, command.from));
      add(accountOwner(state, command.to));
    } else if (command.kind === "CAPITAL") {
      add(accountOwner(state, command.accountId));
      const bank = state.banks.find((row) => row.id === command.bankId);
      if (bank) add(accountOwner(state, bank.ownerAccountId));
    } else if (command.kind === "BID") {
      const buyer = state.banks.find((row) => row.id === command.buyerBankId);
      if (buyer) add(accountOwner(state, buyer.ownerAccountId));
    }
  } else {
    const command = item.command;
    const members = state.ccpMeta?.members ?? state.config.ccp?.members ?? [];
    if (command.kind === "POST_MARGIN") add(members.find((member) => member.id === command.memberId)?.owner);
    else {
      const call = state.ccpMeta?.fundingCalls.find((row) => row.id === command.callId);
      if (call) add(members.find((member) => member.id === call.memberId)?.owner);
    }
  }
  return [...owners];
}

export function authorizeCoreCommands(
  frames: readonly CoreFrame[],
  options?: BankingCoreActorOptions,
  state?: CoreState,
): void {
  if (!actorGuardEnabled(options)) return;
  const contexts = parseActorContexts(options?.contexts);
  for (const item of collectPlayerCommands(frames)) {
    const context = contexts.get(item.command.id);
    if (context === undefined) throw new BindingError("MISSING_SESSION");
    if (state === undefined) requireBoundActor(context, item.command.actor);
    else for (const owner of claimedOwners(item, state)) requireBoundActor(context, owner);
  }
}
