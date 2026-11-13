# Work order 24: accidents, disasters and insurance

You own `sim/modules/insurance/`. Add one `w.use(insurance)` line in `sim/run.ts`, after `property` if present, else after `banking`. Aegis Insurance and Halcyon Mutual exist as firms selling "insurance" as a service; you turn that into real policies and claims. Damage to firms' machinery and to parcels goes through the smallest exported functions you add to banking (capital) and property (condition). Read `AGENTS.md` and `sim/README.md` first.

## Why

Shocks today are price shocks from a list. A port city has fires, storms, floods, ship collisions and plant explosions; who is insured, and whether the insurer can pay, decides whether a disaster is a bad month or a bankruptcy and a crisis.

## Build

1. **Hazards** in a raw file `sim/content/hazards.txt`: kind, frequency, where it strikes (a neighbourhood, a sector, the port), how much damage. Each event destroys machinery and stock at firms, damages parcels, can injure or kill people (psyche, deaths through the normal path).
2. **Policies.** Firms and homeowners buy cover from the insurers at a premium priced from the insurer's own loss history; mortgages require home cover. Premiums go through the ledger; insurers invest the float in bonds.
3. **Claims.** After a disaster, insured losses are paid; firms rebuild (machinery orders), homes are repaired. Uninsured firms may fail (through corporate's bankruptcy if present). An insurer that cannot pay goes bust, and its policyholders lose cover.
4. **Reinsurance** with the rest of the world (abroad module if present) for the largest risks.
5. **Stats line**: disasters, insured and uninsured losses, premiums, claims paid, insurers' capital.

## Done

`node sim/run.ts --years 30 --seed 1` finishes with books balanced every day; at least a few disasters happen, premiums rise after a bad year, and `--explain` on a firm failure after a fire reads as a story. Save and reload still match. Commit after `git pull --rebase`, push, and reply with that chain, the stats for years 10 and 30, and your cost. Then stop.
