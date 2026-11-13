# Work order 11: law, regulators and courts

You own `sim/modules/law/`. Add one `w.use(law)` line in `sim/run.ts`, after `crypto` (and after `player` if it is there) and before `history`. Read the other modules' state; change them only through functions they export. If you need a hook in another module, add the smallest exported function and say so in your reply. Read `AGENTS.md` and `sim/README.md` first.

## Why

People in the world already trade on private facts (`insider.profit` in social), memecoin creators already rug their holders (crypto), and chief executives already run firms into the ground. Nobody is ever caught. A financial world needs a regulator that notices, investigators who can be wrong, courts, fines and prison, so that crime is a real gamble with a real cost, for NPCs now and for the player later.

## Build

1. **Offences, recorded from events that already happen.** Insider trading (a trade by someone who knew a private fact about that firm, `knows()` in social, before it was published), market manipulation (a memecoin rug, a pump of a thinly traded share), fraud (a firm paying dividends while it cannot pay wages, a bank hiding losses), unpaid debts after default. Each offence keeps the cause chain and the people involved.
2. **The regulator is staff, not magic.** A securities regulator is a firm-like body with a budget (from the government) and investigators who are people in the arrays. Each investigator can work a few cases at a time. Detection chance per month depends on the size of the gain, how unusual the trade was against the stock's normal volume, the investigator's skill, and how many people knew the fact (more knowers, more chances someone talks). A small careful insider is rarely caught; a large one usually is, months later.
3. **Cases and courts.** An investigation becomes a charge, a trial (months long), and a verdict that can be wrong in both directions. Penalties go through the ledger: disgorgement of the gain, fines to the government, prison (the person loses their job and income; flag them in the arrays for the sentence). A chief executive charged is removed by the board. A firm convicted of fraud pays a fine and its share price takes the hit through the news (a published fact).
4. **People feel it.** A charge, a trial and a sentence are thoughts in psyche (stress, shame), and news in social: contacts learn about it and trust the person less.
5. **Deterrence.** People who know a fact choose whether to trade on it from their traits and how often others are being caught (a recent conviction in their firm or among contacts makes them more careful). Measure it: insider trades per year should fall after a wave of convictions.
6. **Stats line**: offences, investigations open, charges, convictions, wrongful convictions, fines collected, people in prison.

## Done

`node sim/run.ts --years 30 --seed 1` finishes with books balanced every day, the stats show cases and convictions in plausible numbers (a handful a year at 20,000 people, not hundreds), and `--explain law.verdict` prints a full chain from the private fact to the trade to the sentence. Commit to `v1-build`, push, and reply with that chain, the stats line for years 10, 20 and 30, and your cost. Then stop.
