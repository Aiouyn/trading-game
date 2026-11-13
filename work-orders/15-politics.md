# Work order 15: politics and government

You own `sim/modules/politics/`. Add one `w.use(politics)` line in `sim/run.ts`, after `law` and before `history`. The economy's fiscal and central-bank settings are constants and module-level numbers today; add the smallest exported setters to `sim/modules/economy/index.ts` (under 40 lines) so politics can change the income tax band, the profit tax, the dividend tax, the benefit rate, public spending priorities and the central bank's inflation target. Read `AGENTS.md` and `sim/README.md` first.

## Why

Taxes, regulation and the central bank are fixed rules now. In a living world they are chosen by people who want to be re-elected, lobbied by firms and rich families, and judged by voters on the economy they feel. Policy then becomes something a player can read, bet on and even buy.

## Build

1. **Parties and politicians are people.** Two to four parties with platforms (tax levels, spending, regulation, central bank independence), in a raw file `sim/content/politics.txt`. Politicians are people in the arrays: a leader, a finance minister, a central bank governor (appointed), a regulator chief (for the law module).
2. **Elections every 4 years.** Each adult votes from their own situation: employed or not, income change, inflation felt, wealth, and what their contacts think (social). Turnout varies. The winner forms the government; results by party are events.
3. **Policy is chosen.** The governing party moves taxes and spending toward its platform, bends it before an election (spending rises, tax cuts), and reacts to crises (a bailout of a failing bank, stimulus in a slump). A governor appointed by a party that wants low rates is more dovish. Every change is an event whose causes include the party, the election and the economic data.
4. **Lobbying and donations.** Firms and rich people donate to parties through the ledger; a party that receives a lot from a sector favours it (subsidies, lighter regulation). Large donations are news; bribery is an offence the law module can investigate (call its exported functions if they exist; otherwise record the offence for it).
5. **Approval.** A monthly approval rating from the same voter model, so the player can read the political risk.
6. **Stats line**: governing party, approval, last election margin, tax settings, governor's dovishness.

## Done

`node sim/run.ts --years 30 --seed 1` finishes with books balanced every day; there are 7 or 8 elections, power changes hands at least once, tax settings move with the governing party, and unemployment and inflation stay in plausible ranges. Save and reload still match. Commit after `git pull --rebase`, push, and reply with the election history, one `--explain` chain for a tax change, and your cost. Then stop.
