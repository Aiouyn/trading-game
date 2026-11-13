# Work order 07: health, mood, relationships, habits and generational memory

You own `sim/modules/psyche/` and one `w.use(psyche)` line in `sim/run.ts` (after `social`). You may add fields to `FIELDS` in `sim/modules/economy/people.ts`, extend `thought()` there, and add arrays to the `Social` state in `sim/modules/social/index.ts` next to `fam` and `trust`. Nothing else outside your directory. Read `AGENTS.md` and `sim/README.md` first, especially "People are parallel arrays".

Design source: Mathis's doc "Port Avalon — People stats from the Dwarf Fortress decompilation" (https://claude.ai/artifact/V79az2jqm4MSTJj1RFYttM). Build its simulation half. The player-facing half (bars, choices, heir play) is for a later order. Where this order and the doc differ, this order wins.

## Build

1. **Five relationship values.** Extend the social module's per-contact arrays (16 contacts per person, beside `fam` and `trust`) with respect, fear, loyalty and friendship, one byte each. Conversations move them. They drive:
   - **Respect**: who a board picks in `succession()` when there is no heir. Add a small weight for staff respect to the skill pick.
   - **Loyalty**: the chance a worker refuses to be poached in the economy's poaching step. Read it through an exported function; do not edit the economy's hiring code. If the economy offers no hook, export `loyaltyOf(w, person)` and stop there.
   - **Friendship**: who marries whom. In `yearlyLifePass` pairing, prefer a single contact with high friendship over the next person by age.
   - **Fear** and **trust**: whether an employee leaks a firm's fact (work order 04 gossip). Fear of the chief lowers leaking.
2. **Health.** A byte per person, 0 to 100, with a condition code. It falls with age, with long periods of high stress, and in steps when the `broke` counter keeps rising: "cannot cover the week", then "cannot afford healthcare", then a condition. Healthy people buy `HEALTHCARE` as part of their basket today; sick people buy more of it if they can afford it, and recover. Health below 30 raises the yearly death chance and lowers productivity (skill counts at 70% in `f.eff`).
3. **Mood.** A byte per person, moved by thoughts (positive ones too: a raise, a wedding, a birth, a good year on their shares). A firm's **staff morale** is the average mood of its staff. Expose it, and let morale scale the firm's effective output between 0.9 and 1.05.
4. **Three kinds of breakdown** instead of one. When stress crosses the threshold, the person's traits choose:
   - **Quits**: leaves their job.
   - **Withdraws**: stays employed but stops contributing to `f.eff` for 60 days.
   - **Gambles**: puts a share of their savings into the riskiest stock they can find through the markets module's `submitOrder`.
   These are DF-inspired, not decompiled.
5. **Coping habits** on DF's verified alcohol mechanism (formulas §1.4), converted to the 30-day calendar. Consuming the habit good resets a timer to 45 days. After it runs out, a withdrawal counter rises. Every 8 days, stage = counter ÷ 90 days, and a stress thought of stage × 10 fires. Habit goods: `ENTERTAINMENT` (leisure), buying shares (gambling), `AIR_TRAVEL` (escape). A person picks up a habit after a breakdown, from their traits.
6. **Four personality facets** that change with experience: anxiety, greed, family, diligence, one byte each. A person who loses more than 20% of their wealth in a year gains anxiety for life. Malmendier and Nagel found people who lived through poor market returns take less financial risk for decades. Anxiety lowers the person's target share of stocks (read by markets through a new exported function; markets itself is not edited here), so a crash generation invests less.
7. **Repeated thoughts.** A repeated thought of the same kind refreshes the existing memory instead of piling up. Keep a small per-person ring of the last 4 thought kinds with counts. Do not copy the DF "habituation" divisors: what DF's `+0xc` field holds is not confirmed.
8. **Detail cap.** Steps 6 and 7 (memories, facet drift) run only for people with a role: shareholders, chief executives, staff of firms in the news this month, and their families. That is the Dwarf Fortress idea of detailed figures. Everyone else keeps health, mood and the relationship bytes.
9. **Causality.** Each breakdown kind, habit, condition and facet shift is an event whose causes include the thought that triggered it.
10. **Stats.** Average health, average mood, breakdowns by kind, people with a habit, and the morale of the best and worst firm.

## Done

`SIM_POP=6000 node sim/run.ts --years 30 --seed 1` and `--seed 2` finish with books balanced. No year has inflation above 15%. `--explain person.breakdown` reads as a human story. `SIM_POP=200000 node sim/run.ts --years 3` stays under 18 seconds per year. Commit to `v1-build`, push, and reply with both tables, your run time and cost. Then stop.
