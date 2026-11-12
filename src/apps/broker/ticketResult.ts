import type { IntentResult, MyFill } from "@/shell/contracts/channels";

/** The fill an ACCEPTED market intent names in `effects` ("fill:{id}"), if `me` carries it. */
export function fillOf(result: IntentResult, fills: readonly MyFill[]): MyFill | null {
  const ids = (result.effects ?? []).filter((e) => e.startsWith("fill:")).map((e) => e.slice(5));
  return fills.find((f) => ids.includes(f.fillId)) ?? null;
}
/** The open order an intent created ("order:{id}"), for the queued-for-reopen label and the resting ack. */
export function orderIdOf(result: IntentResult): string | null {
  const e = (result.effects ?? []).find((x) => x.startsWith("order:"));
  return e ? e.slice(6) : null;
}
