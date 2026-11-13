# Work order 22: newspapers, journalists and rumours

You own `sim/modules/media/`. Add one `w.use(media)` line in `sim/run.ts`, after `social`. Publish through social's exported functions (`publish`, facts and knowers); do not change social itself beyond adding the smallest exported function you need. Read `AGENTS.md` and `sim/README.md` first.

## Why

Today news appears when something happens. In a living world, news is made: by journalists at newspapers who need stories, have sources, get things wrong, and can be bought. What the public believes, and when, decides prices.

## Build

1. **Outlets are firms with staff.** The Daily Herald already exists as a firm; add outlets in a raw file `sim/content/media.txt` (name, readership, leaning, sensational or serious). Journalists are people in the arrays with contacts like anyone.
2. **Stories come from sources.** A journalist learns private facts through their contacts (social's spreading), checks them (a serious outlet waits for a second source), and publishes. A scoop moves a price before the firm announces; a wrong story moves it the wrong way and is retracted later.
3. **Rumours.** Unconfirmed claims spread through contacts with a confidence that decays; people trade on rumours by their traits. A rumour can be planted by someone who benefits (a short seller, a raider): that is market manipulation the law module can investigate.
4. **Readership and trust.** Who reads which outlet; an outlet's trust rises with confirmed scoops and falls with retractions; people weigh news by the outlet's trust.
5. **Stats line**: stories, scoops, retractions, rumours spreading, the most trusted outlet.

## Done

`node sim/run.ts --years 20 --seed 1` finishes with books balanced every day; `--explain` on a scoop shows the chain from the private fact through the journalist's contact to the story and the price move. Save and reload still match. Commit after `git pull --rebase`, push, and reply with that chain, the stats for years 5 and 20, and your cost. Then stop.
