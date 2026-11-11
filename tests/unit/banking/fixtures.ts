export const micro = (dollars: number): string => (BigInt(dollars) * BigInt(1_000_000)).toString();
export function bankGenesis() {
  return { world: "funded-bank-v1", ccy: "FDL", initialPolicyPpm: 5_000, initialOnrPpm: 5_000,
    banks: [
      { id: "bankA", cash: micro(1_000_000), sightRatePpm: 0, savingsRatePpm: 36_400, tolerancePpm: 20_000, enabled: true },
      { id: "bankB", cash: "0", sightRatePpm: 0, savingsRatePpm: 36_400, tolerancePpm: 20_000, enabled: true },
      { id: "bankC", cash: "0", sightRatePpm: 0, savingsRatePpm: 0, tolerancePpm: 20_000, enabled: false },
    ], clients: [
      { kind: "PERSON", id: "alice", cash: micro(1_000_000_000), presence: ["bankA", "bankB", "bankC"] },
      { kind: "PERSON", id: "bob", cash: micro(1_000), presence: ["bankA"] },
      { kind: "BUSINESS", id: "company", cash: "0", presence: ["bankA", "bankB", "bankC"] },
    ] };
}
export function bankMarket(pdB = 0, pdC = 0, fearPpm = 0) {
  return { fearPpm, policyPpm: 5_000, dfrPpm: 0, mlfrPpm: 10_000, risks: [{ bankId: "bankA", pdPpm: 0 }, { bankId: "bankB", pdPpm: pdB }, { bankId: "bankC", pdPpm: pdC }] };
}
export function bankFrame(tick: number, commands: unknown[] = [], market: unknown = tick % 30 === 29 ? bankMarket() : null) { return { tick, commands, market }; }
export const openDeposit = (id: string, depositId: string, bankId = "bankB", product = "SIGHT", actor = "alice") => ({ id, actor, kind: "OPEN", depositId, bankId, product });
export const deposit = (id: string, depositId: string, dollars: number, actor = "alice") => ({ id, actor, kind: "DEPOSIT", depositId, amount: micro(dollars) });
export function through(target: number, frames: ReturnType<typeof bankFrame>[] = [], marketAt: (tick: number) => unknown = () => bankMarket()) {
  const all = new Map(frames.map((f) => [f.tick, structuredClone(f)]));
  for (let tick = 29; tick <= target; tick += 30) if (!all.has(tick)) all.set(tick, bankFrame(tick, [], marketAt(tick)));
  return [...all.values()].sort((a, b) => a.tick - b.tick);
}

export function interbankGenesis() { const g = bankGenesis(); g.banks[1].cash = micro(50_000); return g; }
export function interbankDemand(id = "b", bankId = "bankB", dollars = 5_000_000) {
  return [openDeposit("open-" + id, id, bankId, "SIGHT", "company"), { kind: "LEND", id: "business-" + id, actor: bankId, depositId: id, amount: micro(dollars), ratePpm: 0, maturityTick: 30 * 720 + 719 }];
}
