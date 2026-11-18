# employer-week: five playtest runs (work order 103)

Replay a run: put its commands in a file, one per line, then `node sim/play.ts --scenario employer-week --pipe < that-file.txt`.
Each run was played turn by turn from the screen. Seed 3, one year, goal: take the chair at Salar Lithium.

## saver: a cautious saver (20 commands)

signals; deposit 30000; help bank; wait 1w; signals; wait 2w; signals; wait 1d; signals; news; wait 2d; signals; wait 1w; news; why cash; sheet; wait 1m; sheet; signals; wait 1y

Outcome: goal missed. Net worth $81,183 at day 720 (start $103,452). A time deposit and the two starting holdings only. The game recorded an insider trade in the player's name (day 443, 30 Salar shares) that no command placed.

## trader: a leveraged trader (23 commands)

quote frm_salar; borrow 20000 margin; buy frm_salar 300; signals; wait 1d; sheet; wait 3w; signals; wait 1d; signals; borrow 1500 margin; buy frm_salar 200; wait 1w; sheet; quote frm_salar; why cash; sell frm_salar 500; wait 2d; repay 20000; sheet; sell frm_salar 65; repay 903; wait 1y

Outcome: goal missed. Net worth $104,452 after the Salar round trip, then $74,429 at day 720. Insider trades and short puts and calls were booked to the player on days 533, 593, 683 and later.

## climber: an ambitious climber (9 commands)

stake frm_salar 150000 partners; stake frm_salar 25000 cash; owner; help owner; protect; cut 3; promote best; wait 1d; wait 1m

Outcome: goal met at Year 2, month 2, day 1 (the goal is checked at month end). Net worth $58.9k at the win, down $44.6k from the start, because the block is marked on a thin market.

## loyal: a loyal worker who protects colleagues (6 commands)

talk 0; stake frm_salar 150000 partners; protect; union deal; why staff; wait 1m

Outcome: goal met at Year 2, month 2, day 1. Net worth $89,578 (index 1.10x). Union rep Rose Ororwick protected. Salar laid off staff on day 13 despite the protect promise.

## newcomer: a curious newcomer who reads everything (14 commands)

help; help owner; help news; why cash; signals; news; stake frm_salar 10000 cash; why stake; wait 3w; signals; quote frm_salar; wait 1w; quote frm_salar; wait 1y

Outcome: goal missed. Net worth $74,253 at Year 3, month 1, day 1 (index 1.12x). The Salar print is missing from `news` and visible only in `quote`.
