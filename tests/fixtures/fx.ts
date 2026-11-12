import { cash, legIds, parseCommand, parseFrame, parseGenesis, walletId, type Command, type Frame, type Genesis, type LegId, type OfferSide } from "@/server/market/fx/model";
import { advanceFx, createFx } from "@/server/market/fx/engine";
export const EPOCH = "fx-proof-epoch";
export const MARKS = { EUNFDL: 1100000, FDLNKR: 2000000, FDLPYN: 100000000, FDLSRL: 5000000 };
export function genesis(): Genesis {
  const actor = (id: string) => ({ id, cash: cash(1000000), units: {}, access: { kind: "ACTOR", license: 2, held: false } });
  const system = (id: string, amount = 0) => ({ id, cash: cash(amount), units: {}, access: { kind: "SYSTEM" } });
  return parseGenesis({ epoch: EPOCH, startTick: 0, feeWallet: "fees", banks: [{ id: "retail", inventory: "bank", income: "bank-income" }], wallets: [actor("alice"), actor("bob"), ...legIds().map((k) => actor("maker-" + k)), system("fees"), system("bank", 1000000), system("bank-income"), { ...system("seller"), units: { STOCK: 100 } }] });
}
export function command(raw: unknown): Command { return parseCommand(raw); }
export function offer(id: string, leg: LegId, side: OfferSide, rate: number, amount = 500000): Command { return command({ kind: "OFFER", id, account: "maker-" + leg, leg, side, rate, amount }); }
export function offers(): Command[] { return legIds().flatMap((leg) => [offer("ask-" + leg, leg, "SELL_BASE", Math.ceil(MARKS[leg] * 1.001)), offer("bid-" + leg, leg, "BUY_BASE", Math.floor(MARKS[leg] * .999))]); }
export function frame(tick: number, commands: Command[] = [], extra: Partial<Frame> = {}): Frame { return parseFrame({ epoch: EPOCH, tick, marks: MARKS, controls: [], assets: [{ asset: "STOCK", seller: "seller", ccy: "NKR", unitPrice: 10000 }], commands, ...extra }); }
export const seeded = (g = genesis()) => advanceFx(createFx(g), [frame(0, offers())]);
export function convert(id: string, from = "FDL", to = "NKR", want = 10000, maxInput = 1000000): Command { return command({ kind: "CONVERT", id, account: "alice", from, to, want, maxInput }); }
export function bank(id: string, from = "FDL", to = "NKR", spend = 10000): Command { return command({ kind: "BANK", id, account: "alice", bank: "retail", from, to, spend, minOutput: 1 }); }
export function auto(id: string, extra: Record<string, unknown> = {}): Command { return command({ kind: "AUTO", id, account: "alice", from: "EUN", asset: "STOCK", qty: 1, estimate: 10000, maxInput: 1000000, ...extra }); }
export const findWallet = (s: ReturnType<typeof seeded>, id: string) => { const w = s.wallets.find((w) => w.id === walletId(id)); if (!w) throw new Error("FIXTURE_WALLET"); return w; };
export function autoGenesis(): Genesis { const g = genesis(); const a = g.wallets.find((w) => w.id === "alice"); if (!a) throw new Error("FIXTURE"); a.cash.NKR = cash().NKR; return g; }
