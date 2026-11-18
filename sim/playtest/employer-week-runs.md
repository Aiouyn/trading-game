# employer-week: five playtest runs (work order 108, round two)

Replay a run: put its commands in a file, one per line, then `node sim/play.ts --scenario employer-week --pipe < that-file.txt`.
Each run was played turn by turn from the screen (seed 3, one year, goal: take the chair at Salar Lithium). The command count in each heading is what was typed; the lists keep the moves and the waits, and drop repeated `sheet` reads. Each list replays to the hash at the end of its run.

## saver: a cautious saver (60 commands)

signals; news; quote frm_salar; sheet; help owner; why cash; help bank; deposit 30000; help stake; why stake; wait 1w; signals; news; wait 2w; signals; wait 1w; signals; quote frm_salar; wait 1d; news; sheet; help bond; quote frm_urbana; bond buy 2y 1; wait 1w; signals; sell frm_kestrel_build 80; wait 1d; sheet; desk; wait 1d; sheet; sell frm_kestrel_build 80 @ 225; wait 1w; signals; news; wait 1m; cancel 340428; wait 1m; news; why cash; sell frm_urbana 76; wait 1m; wait 6m; wait 1m; wait 15d

Outcome: goal missed. Net worth $63,100 at day 720 (index 0.81x, you 0.76x). Kestrel and Urbana both missed guidance and fell 30-37%; the market sells at the top did not fill. Hash 191ca9cc.

## trader: a leveraged trader (49 commands)

signals; quote frm_salar; borrow 19000 margin; buy frm_salar 300; signals; wait 1d; sheet; quote frm_salar; desk; buy frm_salar 200 @ 39; wait 1d; quote frm_salar; sheet; wait 1w; signals; sheet; wait 2w; signals; quote frm_salar; short frm_kestrel_build 5; wait 1d; sheet; quote frm_kestrel_build; wait 1w; sheet; news; cancel 312673; buy frm_salar 100 @ 52; borrow 1500 margin; wait 1w; sheet; quote frm_salar; wait 1w; sheet; why cash; repay 16000; wait 1m; signals; wait 9m; wait 15d

Outcome: goal missed. Net worth $44,586 at day 720 (index 0.80x, you 0.53x). The Salar bid vanished after the first fills, so the book was marked at a fraction of its price. The short did not sell: the borrowed shares stayed in the holding. Hash 30ea2795.

## loyal: a loyal worker who protects colleagues (45 commands)

talk 0; talk 1; talk 2; quote frm_salar; mail; signals; sheet; jobs; wait 1w; signals; mail; reply 7 yes; wait 1w; signals; wait 1w; signals; quote frm_salar; wait 1w; signals; why staff; wait 1d; news; sheet; wait 1d; news; quote frm_salar; stake frm_salar 150000 partners; owner; board list; help sell-division; help cut; help union; talk 3; reply 4 no; wait 1d; quote frm_salar; ask 0 frm_salar; ask 2 frm_salar; signals; why staff; protect; wait 1w

Outcome: goal met at Year 2, month 2, day 3 (day 392). Net worth $70,730 (index 0.88x, you 0.85x). Partners put 591 shares under her at $40.87 for $24k of her own cash. Protect paid 11 workers; no layoff was seen in the three days before the win. Hash dafd9d75.

## climber: an ambitious climber (42 commands)

help owner; help board; board list; ask 0 frm_salar; talk 0; signals; quote frm_salar; jobs; sheet; stake frm_salar 30000 cash; sheet; wait 1w; signals; quote frm_salar; stake frm_salar 150000 partners; owner; board list; sheet; help promote; help cut; help refinance; why cash; wait 1w; signals; quote frm_salar; wait 1w; signals; news; wait 1w; signals; wait 2d; news; sheet; quote frm_salar; news; why staff; help sell-division; help union; owner; refinance 20000 guarantee; sheet; wait 1w

Outcome: goal met at Year 2, month 2, day 2 (day 391). Net worth $70,914 (index 0.91x, you 0.85x). Her 919 shares were marked at market (the bid held at $53); the cash stake alone had been marked at a fraction of its price on the day it was bought. Hash 04a2ca8f.

## newcomer: a curious newcomer who reads everything (45 commands)

help; help news; help signals; help quote; help sheet; help why; help tip; why 1; why stake; why price frm_salar; why wage; why rate; signals; quote frm_salar; stake frm_salar 10000 cash; why stake; wait 3w; signals; wait 1w; sheet; wait 1w; signals; quote frm_salar; sheet; why price frm_salar; sell frm_salar 256; wait 1d; sheet; mail; reply 4 yes; talk 0; story; wait 1m; signals; sheet; quote frm_salar; wait 1w; mail; signals; wait 1m; sheet; quote frm_salar; sell frm_salar 233 @ 55; wait 8m; wait 17d

Outcome: goal missed. Net worth $57,922 at day 720 (index 0.80x, you 0.69x). Her market sell of 256 shares filled 23 and the rest expired at the close with no message; she then sold the remaining 233 at a limit. Hash 2ec8efa4.
