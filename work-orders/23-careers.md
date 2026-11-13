# Work order 23: schooling, careers and migration

You own `sim/modules/careers/`. Add one `w.use(careers)` line in `sim/run.ts`, after `psyche`. People's skill and jobs live in the economy's `People` arrays: add the fields you need there through `FIELDS` (the documented way), and change hiring only through the smallest exported hook in `sim/modules/economy/index.ts` (under 40 lines). Read `AGENTS.md` and `sim/README.md` first.

## Why

People today are born with a skill number and keep it. In a real city, children's schooling depends on their parents, skills grow with experience in a trade, some people climb from clerk to finance director while others are stuck, and when jobs are scarce people leave, while immigrants arrive when the port booms.

## Build

1. **Schooling.** Children's schooling (years and quality) depends on family wealth and parents' schooling, with some luck; it sets starting skill and which occupations are open.
2. **Occupations and experience.** Each worker has an occupation (labourer, trade, clerk, engineer, finance, manager...) from a raw file `sim/content/occupations.txt`; firms need a mix by sector; skill in an occupation rises with years in it. Pay differs by occupation and skill.
3. **Careers.** Promotions inside a firm (to manager, to finance director) go to the most skilled and best-liked staff (social familiarity with the chief); finance staff see earnings early (private facts for insider trading); retraining when an occupation is in surplus.
4. **Migration.** When unemployment is high people (mostly young, unattached) emigrate; when the port booms and wages beat abroad (the abroad module's foreign wage if present), immigrants arrive as adults with their own skills and no contacts yet.
5. **Stats line**: share of each occupation, average schooling, promotions, emigrants, immigrants, the wage gap between the top and bottom tenth.

## Done

`node sim/run.ts --years 30 --seed 1` finishes with books balanced every day; mobility exists (some children of poor families end up in the top tenth), migration follows the cycle, and unemployment and inflation stay in their usual ranges. Save and reload still match. Commit after `git pull --rebase`, push, and reply with the stats for years 10, 20, 30 and your cost. Then stop.
