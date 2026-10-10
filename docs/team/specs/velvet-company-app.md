# Company: the founder's app in Quay
Version 1.5. Owner: Velvet (spec and mocks). Build: Forge. Tests: Tape. Numbers and rules: Quant, `docs/team/specs/quant-company-building.md` v1.7 (this file never overrides it). Brief: Ledger, 2026-10-09 (Mathis: company building in the spirit of STONKS-9800). Shell: `specs/velvet-desktop-os.md` (Quay). Tokens: `handoff/tokens.css` v2, Ink & Brass.

Mocks (2x, sources in `design/redesign/src/`, render with `node design/redesign/src/render.mjs company`):

| Mock | Size | Shows |
|---|---|---|
| `design/redesign/company-founder-desktop.png` | 1440 × 900 | Founder's first week: Overview, Products · R&D window, Wire |
| `design/redesign/company-founder-phone.png` | 390 × 844 | Same state on the phone: Overview tab |
| `design/redesign/company-preipo-desktop.png` | 1440 × 900 | Late tier before IPO: Listing, plus the Q8 filing preview and the trading window (closed) |
| `design/redesign/company-preipo-phone.png` | 390 × 844 | Listing tab on the phone |
| `design/redesign/company-window-desktop.png` | 1440 × 900 | Listed: `windowClosing` toast, the window notice card, Finance › Trading plan, Broker with the window open |
| `design/redesign/company-window-closed-phone.png` | 390 × 844 | Broker on the phone with the locked ticket "Window closed until Day 635" |
| `design/redesign/company-guarantee-phone.png` | 390 × 844 | Finance › Borrow › Sign, with the personal guarantee consequence before signing |

All numbers in the mocks are illustrative. Every rule and number comes from Quant's spec; where I had to pick a value, it's listed under "Assumptions" below.

---

## 1. Purpose
Company is where a player at **R2 Owner** founds and runs one fictional company: products, R&D, people, plants, marketing, money, filings and, one day, a listing on the Port Avalon Exchange. It's a slow game next to Broker's fast one. Decisions land at the day's close and their effects show up days or weeks later.

Three promises shape every screen:
1. **Your plan is yours.** Other players see only what a real company files. Everything else is private, labelled quietly, and kept out of anything another player can reach.
2. **Knowing early must not pay.** The founder trades their own stock and related instruments only in an open window after each filing, or through a fixed plan committed a quarter ahead. The screens explain this calmly and up front.
3. **No surprises you didn't see coming.** Every decision shows its cost, its lag and its range of outcomes before you confirm. Every loan shows what you personally could owe before you sign.

## 2. Views
A left rail on desktop (156 px), pill tabs on the phone. The order is the order of a founder's day.

| View | What it's for | Private? |
|---|---|---|
| **Overview** | Cash, runway, this week's revenue, next close; the one decision due; the checklist (first weeks only); cash runway chart; team summary | Private |
| **Products** | Each product: segment, price, quality vs target, unit cost, margin, share; public competitors table (names, products, prices, filed revenue) | Private, except the competitors table |
| **R&D** | Projects (Quality, Cost, Next-gen): budget, days left, success odds as a ±5-point band, gain as bear / base / bull | Private |
| **People** | Heads by role (Ops, Sales, R&D, G&A), ramping hires (3 gd), wages | Private |
| **Operations** | Plants, cities, capacity, utilization | Private |
| **Marketing** | Spend by product | Private |
| **Finance** | Cash, Borrow (revolver, term loan, guarantee), dividends, buybacks, **Trading plan** | Private |
| **Filings** | Filed statements, the next filing as a preview, weekly signals (listed), the trading window | **Public**, with a founder-only preview |
| **Listing** | Tier ladder, IPO requirements, cap table, IPO prep; after listing, lockup and the sell schedule | Mixed, labelled per card |

The rail carries a small info dot on **Filings**. Its foot states what others see at the current tier: Seed and Growth, "Others see a yearly registry entry, in bands. No trading window until Late tier."; Late and Listed, "Filings is what others see. Everything else is private to you."

### 2.1 "What the market sees"
Every view header has a two-way toggle: **Founder view / What the market sees** (`company-view-toggle`). The market side renders the same screen from `CompanyPublic` only, exactly as another player would see it in Wire, Broker or a rivals list. Private cards collapse to one quiet line, "Not filed". The toggle is a mirror, not a settings switch: it never changes what others see.

### 2.2 Private label
A private card carries a small uppercase **Private** chip in `--faint` on a hairline border (`.priv`). No lock icons, no red. Public cards carry an info-blue **Public** chip (`.publ`) only where the contrast matters (competitors, weekly signals, the market column, committed plans).

## 3. The two states

### 3.1 Founder's first week (Seed, Day 36–42)
*Idea: one decision at a time, with the runway always in view.* A new founder has cash, one product in development and no sales. The Overview leads with four numbers (cash, runway, revenue this week, next close) and a single brass decision card: "How much goes into the House Blend quality project?" The slider shows where you were, the change in success odds, the gain range, and runway before and after. A clock line states the lag in plain words ("Takes 20 game days with one R&D lead. Quality moves on the day the project completes, about Day 62, not before."). Quality reads 49 of 100 against a "ready to ship" mark at 55; the project adds +3 / +5 / +7 if it works. The rail foot says others see only a yearly banded registry entry, and there is no trading window at Seed. A five-step checklist is a guide, not a gate. The runway chart compares "with this decision" against "as now", so the cost of ambition is visible. The second window shows the product's quality bar with the running project hatched, and a **public** competitors table, since that's all a founder can know about rivals.

### 3.2 Late tier, before IPO (Day 500)
*Idea: the path to listing as a checklist you can actually finish, and the line between your books and the market's view drawn on one table.* Listing shows the tier ladder (Seed, Growth, Late, IPO-eligible, Listed), the six requirements with live values, the cap table before and after the float, and IPO prep. IPO prep states the price rule, the money raised, the fee, **"You cash out at the IPO: nothing"**, and the 168 gd lockup. The Filings window puts "Your books" and "Market sees on D507" side by side: public rows match, private rows read "Not filed". Below sit the weekly signals (labelled "from listing") and the trading window card, closed until Day 509.

### 3.3 Listed, around a window (Day 587–594)
*Idea: the window is a calendar fact, not a punishment.* Five days before it shuts, a toast and a brass card say so, list what's covered, show the open orders that will be cancelled, and give the next window's dates. Finance › Trading plan sits right under it, so the calm answer ("make a plan") is one glance away. After the window closes, the Broker ticket on covered names is replaced by a locked card naming the day it reopens.

## 4. Public / private boundary
Sources: Quant §10(a), §11 `CompanyPublic` and `CompanyFounderView`, §6.1–6.5. "Others" means any other player, any shared screen, the Wire, Broker and spectator views. "When" is the moment it becomes visible to others.

| Field | Founder sees | Others see | When |
|---|---|---|---|
| Name, sector, founded day, tier | Yes | Yes | At registration (Wire line "registers on …") |
| Cities, product names, segments, current prices | Yes | Yes | Live (prices are public in a real market) |
| Headcount | Exact, by role | Band (1–10 … 5k+) | Private: annual registry. Listed: each filing and weekly signal |
| Debt | Every loan, rate, guarantee | Total band, rating, covenant status (ok / cure / default) | Live |
| Revenue | To the cent, daily | Seed and Growth: yearly band in the registry entry. Late (private) and Listed: quarterly filing | Filing day F = close + 3 gd, at the open tick |
| Income statement, balance sheet, cash flow (`FilingPublic`) | Live quarter-to-date, plus the frozen preview from close | **Late-tier private and Listed:** full quarterly statements, frozen. Seed and Growth: none (yearly banded registry entry only) | F, never before |
| Cash · total debt | Live | From the filed balance sheet, labelled with its filing day ("filed D507") | F |
| Weekly signals (bookings band, run-rate band, net hires, utilization band, launches, debt drawn) | Yes | Yes | Every 5 gd at the open tick, **listed companies only** (Quant). Quiet Wire line type "Signal" |
| Guidance and credibility C | Yes | Yes | When set / at each filing |
| Insider filings: every founder trade in their own stock **and in derivatives on it** (options, futures), from a plan or in the window | Exact | Instrument, side, size, day (exact) | The **next** game day, as a public insider filing (Filings › Insider filings, Wire line type "Insider filing"). Never announced ahead |
| Trading window schedule (open, opensDay, closesDay) | Yes, from the first quarterly filing (Late tier) | Yes (the schedule is public) | Always, once a window exists. Seed and Growth have none |
| Trading plans | Everything: instrument, days, size per day, locked shares, fills | **Only that a plan exists, with its start and end days** ("Sell plan · D650–D700"). Never instrument, quantity, quantity band, total size or remaining quantity | At commit, on the Wire |
| Plan skipped days and plan endings (`planSkipped`, plan-ending reasons) | Yes, with quantities | **Day and a plain-words reason only.** No quantity, no filled amount | On the day, on the Wire and the public plan line |
| Plan breach filing (fail-safe only; no v1 path leads to a breach) | Yes | Yes: a public breach filing (a plan exists, day, "plan breach"; no size) | The breach day, in Filings and on the Wire |
| Plan escrow (locked shares) | Exact | No | Never (locked shares still count toward net worth) |
| Dividends, buybacks, distress flag | Yes | Yes | When declared / raised |
| Cap table | To the share | Holders ≥ 5% at IPO (prospectus) | At IPO only |
| Cash today, runway, ledger | Yes | No | Never (cash appears only inside a filed balance sheet) |
| Quality, unit cost, margin, share per product | Yes | No | Never |
| R&D projects, split, odds, gain bands, pipeline | Yes | No | Never |
| Marketing split, planned prices, cash forecasts | Yes | No | Never |
| Staff by role, plants, utilization detail | Yes | No (bands via signals only) | Never |
| Related-party contracts | Yes | Lines in the filing | F |
| `windowClosing` warning, the cancelled-orders Wire line | Yes | No | Never |
| Draft (uncommitted) trading plans | Yes | No | Never |

Weekly signals: none before listing. The pre-IPO Filings view may show them to the founder only, under the label "Weekly signals · from listing", as a preview of what would print.

Rule for the UI: the filing preview may show tomorrow's public numbers to the founder, but the "Market sees" column is labelled with the filing day and the note "Numbers freeze at the close; nobody else sees them until D…". The filing moment itself is calm (§7).

## 5. Decisions and lags
- Operating decisions (budgets, prices, hires, marketing) are **staged** and apply at the next day close. The decision card says "Confirm for Day N close" and "You can change it until then."
- Every decision card shows: current value (a "was" tick on the slider), the new value, the cost per week, runway before → after, and outcome **ranges**, never a single promise. R&D odds use Quant's ±5-point band; gains use bear / base / bull.
- A clock line states the lag in plain words with a game day ("about Day 62"). Hiring says 3 gd. Quality moves on the day the project completes. NPC rivals react weekly.
- Confirm is `Enter` on desktop, a full-width button on the phone. The card's value change animates in 220 ms (`--ease-out`). No celebratory motion for a decision; that's saved for filings and the IPO.
- Copy rules: the banned-word voice (no "guaranteed", "risk-free", "easy money", "you should buy"); "the market reacted", never advice. Numbers use U+2212 for minus.

## 6. Trading window and plans
Rules: Quant §6.1 and §6.5 (v1.2). This replaces every earlier blackout, notice and reduce-only design; no screen, id or copy uses "blackout".

### 6.1 Who has a window, and what's covered
The window starts with the company's **first quarterly filing**, so it applies from **Late tier** (private or listed). Seed and Growth founders have **no window** and nothing in their screens mentions one beyond the rail foot's "No trading window until Late tier." A Late-tier private founder's window covers the sector fund and its derivatives only, because there is no stock yet. The index clause (any index where the company is ≥ 5%) starts at listing (Quant v1.7 §6.1, §6.5).

For the founder and every account in their owner set (alts the engine detects, the company treasury, alliance members online; in solo, the player and the treasury), the window covers:
1. the company's stock, every side;
2. options, futures and perps on it;
3. the sector fund (mock: PACF), every order, including reductions;
4. derivatives on that fund;
5. any other index fund where the company's weight is ≥ 5%, frozen at the window's close.

Broad funds under 5% (mock: GXI) and everything else stay open. Card heading copy: "Covered for you and accounts you control:"; when the player is in an alliance (online), "Covered for you, your alliance and accounts you control:". The mocks show a solo player, so they use the first. Copy then lists these in plain words: "Lantern stock, and options or futures on it · The sector fund PACF, and anything built on it · Index funds where Lantern is 5% or more". Items 3–5 only appear once those instruments exist in the engine (Quant §6.5 "Today"); until then, the list shows item 1–2 only.

### 6.2 States and where they show

| State | Days | Where | Copy |
|---|---|---|---|
| Open | F + 2 to F + 21 | Filings card, Broker ticket banner (green hairline, clock glyph) | "Your trading window: open until Day 591" |
| Closing soon | F + 17 (`windowClosing`; 5 trading days counting the close day, F+17 … F+21) | OS toast (`company-window-toast`) and the card at the top of Finance › Trading plan (`company-window-notice`) | "Window closes in 5 days" + covered list + "Open orders in these are cancelled at the D591 close." + next window dates |
| Closed | close+1 to F+1 | Broker ticket replaced by a locked card (`window-closed-ticket`); Filings card | "Window closed until Day 635" + why in one line + next filing day + "Committed plans still run" |
| Closed by cancellation | F + 21 close | Founder-only Wire line, Mine tab | "Trading window closed: 1 order cancelled; reopens Day 635" |

- The locked ticket never shows a disabled Buy button with no reason. Buy/Sell and quantity fade to 45% behind the card, so the layout doesn't jump when the window opens.
- The engine reject `{ code: 'closedWindow', untilDay }` maps to the locked card with `untilDay` as N. The `lockup` reject maps to "Sells locked until Day N" in the ticket summary; `stacking` maps to "This order plus your open orders would exceed a limit".
- The toast follows Quay's toast rules (one at a time, 6 s, never over a pending order confirmation). The card stays until the window closes.
- The backstop line appears once on the window card and the Trading plan screen, in `--muted`, no icon: "Unusual profits in a stock just before its filing raise the odds of an insider-trading investigation through the courts. It is never automatic or certain."

### 6.3 Trading plan (Finance › Trading plan)
Mock: `company-window-desktop.png`, left window.
- **Sell-only (Ledger v1.3, G7):** a plan can only **sell** shares the founder holds (the stock after lockup, or shares of a §6.5 instrument). There are no buy, short or cover plans.
- **Escrow = locked shares.** Committing a plan locks every share it will sell. Sellable = shares − locked. Locked shares still count toward net worth. Margin calls and liquidation never touch them, and they can't be lent for shorting or pledged as collateral.
- **Limits (Ledger):** at most **2 live plans** per founder (a plan is live until its last day has run). Every plan fill goes through the shared impact tally and the **shared ADV cap**; whatever a day can't fill is **skipped and never carried over**. A **sell plan whose first day falls inside the lockup is refused** (not deferred).
- **Minimum sell price (Tape V1), required:** `minSellPrice`, set at commit, at most **0.80 × the commit-day close** (the close before the commit tick when committed intraday; Quant v1.7 §6.3, `planFloorMaxRatio`). Under the field: "At most 24.81 (80% of the last close, 31.02). Days below it are skipped." A plan day with the market below it is a `price` skip.
- **New plan** (private draft): instrument, the side shown as a fixed "Sell only" chip, the required minimum sell price (`company-plan-minprice`), a row per day with a fixed size, total, share of holdings, "Earliest day D650 (one quarter out)", "Live plans after this: 2 of 2" and the reserve line (`company-plan-reserve`): "Reserves now: 45,000 LNTN". The first row shows "lockup ends D680"; the lockup refusal copy covers anything earlier. With 2 live plans, the form is replaced by "You have 2 live plans. A new one can be set up after D660, when the first finishes."
- Under the form, in `--fg`: **"Can't be changed or cancelled once committed."** Then "Trades in LNTN and its options or futures are filed publicly the next day."
- **Hold to commit plan** (`company-plan-commit`): an outlined brass button that fills left to right over 1.2 s while held; release stops and resets. `Enter` held does the same on desktop. Under it: "Let go to stop. Nothing commits until the hold completes." After commit, a quiet brass hairline flash (220 ms) and the plan moves to the list. No confetti.
- **Plans** (`company-plan-list`, header "Plans · 1 of 2 live", **Private** chip, rows `company-plan-row`): read-only cards with instrument, day chips (past days struck through), size per day, "Committed D560" or "Completed D585", and the locked line (`company-plan-locked`) with a brass-outlined `PLAN` pill: "Locked: 1,200 PACF" / "Locked: 45,000 shares", the minimum price ("400 a day · min 44.00"), and after a price skip "300 PACF locked until D648" (`company-plan-locked-until`). Under it, each row shows its **public version** (`company-plan-public`) with an info **Public** chip: "Sell plan · D650–D660", plus any skip days as "D580 skipped: below minimum price". The founder's private row may show quantities ("D580: 120 of 300 filled; the rest skipped (volume cap)"); the public line never does. Footer: "Read-only: no edit, pause or cancel. Skips never carry over; shares unsold on a price skip stay locked 63 days after the plan ends. Locked shares can't be lent or used as collateral." No edit, pause or cancel affordance exists, and no overflow menu.
- **Reasons in plain words** (`company-plan-skip`; public lines carry the day and the reason only). None of these is a breach:

| Reason | Kind | Public line | Founder's private line (example) |
|---|---|---|---|
| `volume` | skip | "D580: part skipped, the trading volume cap was reached." | "D580: 120 of 300 filled; the rest skipped (volume cap)." |
| `price` | skip | "D580: skipped, the market was below the plan's minimum sell price." | "D580: 0 of 300 sold; 45.70 was below your minimum 46.00. 300 PACF locked until D648." |
| `cap` | skip | "D700: part skipped, the founder's 2% daily sell cap was reached." | "D700: 12,000 of 15,000 sold; the rest skipped (2% daily sell cap)." |
| `halt` | skip | "D710: skipped, trading in LNTN was halted." | "D710: 0 of 15,000 sold; trading was halted." |
| `terminated` | plan ends | "Plan ended on D712: the company was delisted, taken private or defaulted." | "Plan ended D712 (delisting / take-private / default); 15,000 shares unlocked." |
| `legal` | plan ends | "Plan ended on D712 by court order, clawback, garnishment or bankruptcy." | "Plan ended D712 by court order; see Legal." |
| `legal` (seizure) | plan continues for a creditor | "D712: plan shares seized by court order; sales continue on schedule for a creditor." | Card: **"Seized · selling on schedule for creditor"**; day chips stay, the proceeds line reads "Proceeds go to the creditor"; no unlock. |
| `tender` | plan ends | "Plan ended on D712: the shares were tendered in a takeover offer." | "Plan ended D712; shares tendered at the offer price." |

  **Price skips keep shares locked:** shares left unsold by a `price` skip stay locked until **63 days after the plan's last day**. The row shows "300 PACF locked until D648" (plan ended D585). All other skips release unsold shares when the plan ends.
  **`margin` isn't a reason any more (Tape V2):** margin calls and liquidation can't touch locked shares, so a `margin` skip can't happen. No v1 path leads to a breach.
- **Breach (fail-safe only; unreachable in v1).** No v1 path leads to a breach. If the engine ever logs one, it goes on a public breach filing, raises the odds of an insider-trading investigation (never automatic or certain), and `planBanned { untilDay }` blocks new plans through the second full quarter after the breach quarter. The form is then replaced by a calm card (`company-plan-blocked`): "New plans open again after Q14 (Day 882): a plan was breached on Day 700." It isn't mocked as a normal state and doesn't appear in the reasons table.
- **Engine rejects and their copy** (shown under the hold button, never as a modal):

| Code | When | Copy |
|---|---|---|
| `{ code: 'planTooSoon', earliestDay }` | First day < commit day + 63 | "The first day must be Day 650 or later (one quarter from today)." |
| `planLimit` | Already 2 live plans | "You already have 2 live plans. A new one can be set up after D660, when the first finishes." |
| `planInLockup` | Sell plan's first day is inside the lockup | "A sell plan can't start before your lockup ends on D680." |
| `planFloorTooHigh` | `minSellPrice` > 0.80 × today's close, or missing | "The minimum price can be at most $24.81 (80% of today's close)." / "Set a minimum sell price." |
| `{ code: 'planUnfunded', shortfall }` | Not enough unlocked shares to lock at commit | "Not enough free shares to lock: 2,000 short." |
| `planImmutable` | Any edit or cancel after commit (API or e2e path; the UI has no such control) | "Committed plans can't be changed or cancelled." |
| `{ code: 'planBanned', untilDay }` | Commit within 2 quarters of a breach | "New plans open again after Q14 (Day 882): a plan was breached on Day 700." |

`planLimit`, `planInLockup`, `planTooSoon` and `planImmutable` are confirmed by Quant; `planUnfunded` confirmed with `shortfall`; `planBanned { untilDay }` confirmed (Quant v1.3): the ban runs through the last day of the second full quarter after the breach quarter, plans open again from `untilDay + 1`.

## 7. Filing day
- The day before F, Filings shows "Files tomorrow". At F's open tick a single Wire line goes out ("Lantern Roasting Co. files Q8: revenue …, net income …"), the founder's Filings view swaps "Preview" for the filed hash and day, and the market column loses its "Market sees on" label.
- The moment is calm: a 1 px brass rule draws across the Filings header in 600 ms, once. No modal, no sound, no number count-up. The trading window opens two days later; the Filings card says so the same day ("Your window opens Day 509").

## 8. Personal guarantee (Finance › Borrow › Sign)
Mock: `company-guarantee-phone.png`. Quant §5.3 and §12 #8.
- Step 3 of 3 shows the loan (lender, term, amount) and, **before any signing control**, a plain box (`company-guarantee-amount`): "If Lantern Roasting Co. can't repay, you personally owe up to $2,000,000.00 plus unpaid interest. It moves to your own debt on default and comes out of your cash and holdings first."
- Two options, same size and weight: **Sign without a guarantee** (selected by default; "Only the company owes. Your stake can still fall to zero.") and **Sign with a guarantee** ("Rate cut by a quarter. You owe the amount above on default."). Each shows its rate per game day: the guarantee is a relative 25% discount, `r_guaranteed = 0.75 · r_debt` per gd (mock: 0.034% a day, with guarantee 0.0255% a day; interest a year 171,360.00 vs 128,520.00 on $2M at 252 gd).
- An acknowledgement checkbox, **unticked by default** (`company-guarantee-ack`), whose text adds "and for me" when the guarantee is chosen.
- **Hold to sign** (`company-guarantee-sign`) stays disabled until the box is ticked. "Back costs nothing."
- No dark patterns: no pre-ticked boxes, no countdowns, no "most founders choose", no colour that makes one option look like the safe default except the selection ring.

## 8.1 Clawback warning (lending to or contracting with another player's company)
On every screen where the player lends to, or signs a contract with, **another player's company** (Finance › Lend, a related-party or supplier contract, a bond or loan offer in Messages or Bank), a plain box (`clawback-warning`) sits above the confirm control:

> If [Company] goes bust within 63 days, early or unusual repayments to you can be clawed back. Scheduled repayments on terms signed 64 or more days before default are safe, unless the lender is an insider. Insider repayments are always clawed back.

Same tone and style as the guarantee box (plain text, `--muted` body, no icon, no red). It's always visible before confirm, never behind a tooltip, and it doesn't need a tick. **One confirm, no extra step.** No mock (it's one box).

Inside the box, a **Details** expander (`clawback-details`, closed by default, chevron + "Details") shows Quant §5.3's terms as they stand in `docs/team/specs/quant-company-building.md` v1.7 (the 63-day lookback, the 64-day safe harbour, the insider test at signing or payment, and locked shares as no shield):

> - **Clawback: payments, not people (Ledger Q12, 2026-10-09):**
>   - Lookback: every covered payment made on a day d with `defaultDay − 63 ≤ d < defaultDay` (inclusive at 63).
>   - **Covered payments:** every company payment to **any player account**, linked or not. There's no attempt to spot alts; the rule follows the money. That means:
>     - dividends;
>     - **repayments (principal and interest) of loans a player made to the company**. The founder's and other insiders' loans are always covered (Tape gap c); outside lenders get the Q28 safe harbour below;
>     - salaries paid to a player account above the cap, which is **max($50/gd, 1% of TTM revenue / 252 per gd)**. Only the excess is clawed back;
>     - related-party payments (§6.3) to any player-controlled entity: player companies, T1 businesses, funds;
>     - loans **from** the company to a player account (the outstanding balance).
>   - **Safe harbour (Ledger, v1.3, Q28; boundary v1.4 rule 5, G8):** these payments to a player who is **not an insider** (below) aren't clawed back, provided their terms were signed **64 or more days before default**, i.e. on a day ≤ defaultDay − 64. A contract signed on defaultDay − 63 (the first lookback day) or later doesn't qualify:
>     - scheduled repayments (principal and interest on the original schedule) to outside lenders;
>     - ordinary contractor payments at a market price (within the §6.3 ±10% band).
>   - **Early, extra or non-ordinary payments** (prepayments, accelerated schedules, terms amended inside the lookback, above-band prices) **are clawed back**.
>   - **Insider loan repayments are always clawed back**, whatever their terms or dates. Insiders are the founder, their owner set, their alliance members, and any account holding ≥ 10% of shares or a CEO role. **Timing (v1.4 rule 6, G9):** a counterparty is an insider for a given payment if they were one **on the contract's signing day or on that payment's day**; either is enough. Status at default doesn't matter.

## 9. IPO ceremony
- Triggered at the listing tick. Reuses the rank-up ceremony rules (`velvet-rank-ups.md`): skippable with `Esc` or a tap, never shown over a pending order confirmation or ticket, never during a halt the player is trading.
- Content: the ticker set in Instrument Serif, the IPO price, shares sold, cash raised for the company, "Your shares: locked until Day N", and "Simulated market. Not financial advice." (Quant §10(c)). Then the Broker opens on the new ticker in a new window.
- Listing view before the IPO states "You cash out at the IPO: nothing" and "You can't buy in the IPO" from any account in your owner set (`company-ipo-no-cashout`; Quant v1.7 §5.1). After it, Listing shows the lockup end and the ≤ 2%/gd sell cap; each sale is filed publicly the next day, with no pre-announcement (settled, Ledger; Quant v1.4).

## 10. Integration
- **Portfolio:** any position with locked shares shows "Locked · `PLAN`" (brass-outlined pill) with the locked count and "Sellable" = shares − locked; locked shares are included in net worth. There is no locked-cash state.
- **Portfolio:** private stake shows as one row, "Lantern Roasting Co. · private", at 0.85 × engine value × ownership, labelled "Estimate". After listing it becomes a normal position with a "Locked until Day N" chip.
- **Broker:** covered tickers carry the window banner (open) or the locked card (closed). On a sell, the ticket shows "Sellable" separately from "Locked · `PLAN`" (`shares-plan-locked`), and the quantity caps at sellable shares. Under the founder's ticket on their own stock or its options/futures: "Your trades in LNTN and its options or futures are filed publicly the next day."
- **Filings › Insider filings** (`company-insider-filings`): a public list, newest first, one row per founder trade in their own stock or a derivative on it: "D589 · Sell · 15,000 LNTN", "D590 · Buy · 20 LNTN Jun 30 calls" (instrument, side, size, day; plan fills included, marked nowhere as plan fills). Filed the next day, never ahead.
- **Filings (fail-safe, unreachable in v1):** a plan breach would appear as its own public filing row ("Plan breach · Day 700"), in the same calm style as quarterly filings, with a Wire line of type "Filing".
- **Wire:** line types: Registration, Filing, Signal (quiet, single line, no headline weight), Insider filing ("Lantern founder sold 15,000 LNTN on D589"; derivatives the same way), Plan filed ("Lantern founder filed a sell plan · D650–D700"), Plan skip / plan ended (day + reason only), and founder-only ("Your company": decisions applied, window closing, orders cancelled, covenant breach, lockup ends).
- **Unlock:** the Company tile appears on the shelf and home grid at **R2 Owner**. Before R2 it's hidden (not locked), as Quay already does for unbuilt apps. A deep link to `/company` before R2 opens Quay home with a toast "Company unlocks at Owner rank".

## 11. Quay plumbing
- App id `company`; glyph: tower block (Quay glyph set).
- Window min size **720 × 560** (rail + one column); default 944 × 794. Below 840 px wide the rail collapses to icons. Compact desktop (768–1199 px) uses the phone's tab bar inside the window.
- Instances: one main Company window plus up to **two** secondary windows, each pinned to a view (e.g. "Company · Products · R&D", "Company · Filings · Q8"). Secondary windows have no rail.
- Deep links (Forge shell §5): `/company`, `/company/<view>` with view ∈ `overview | products | rd | people | operations | marketing | finance | filings | listing`; sub-views `/company/finance/plan`, `/company/finance/borrow`, `/company/finance/borrow/sign`, `/company/filings/q8`. `?market=1` opens the "What the market sees" side.
- Phone: tabs in rail order, scrolling; Listing and Filings move to the front once the company is Late tier (as in the pre-IPO phone mock). The phone app bar shows the view name for sub-screens ("Borrow · Sign").

## 12. Test ids
`win-company`, `win-company-<n>` (secondary), `company-rail`, `company-tab-<view>`, `company-tabs` (phone), `company-view-toggle`, `company-kpi-<cash|runway|revenue|close>`, `company-decision`, `company-decision-confirm`, `company-checklist`, `company-runway-chart`, `company-competitors`, `company-ladder`, `company-listing-reqs`, `company-captable`, `company-ipo-prep`, `company-ipo-no-cashout`, `company-filing-compare`, `company-weekly-signals`, `company-trading-window`, `company-window-state`, `company-window-notice`, `company-window-toast`, `company-window-open-orders`, `window-open-banner`, `window-closed-ticket`, `window-closed-plans`, `company-plan-form`, `company-plan-final`, `company-plan-commit`, `company-plan-list`, `company-plan-row`, `company-guarantee`, `company-guarantee-amount`, `company-guarantee-without`, `company-guarantee-with`, `company-guarantee-ack`, `company-guarantee-sign`, `company-plan-reserve`, `company-plan-locked`, `company-plan-skip`, `company-plan-blocked`, `company-plan-error`, `shares-plan-locked`, `company-plan-public`, `company-insider-filings`, `clawback-warning`, `company-ipo-ceremony`, `priv-chip`, `publ-chip`.

Capital tab ids (Forge, Phase 4 B3; not named above): `company-round`, `company-round-price`, `company-round-max`, `company-round-amount`, `company-round-vote`, `company-round-raise`, `company-round-refusal`, `company-ipo-request`, `company-ipo-float`, `company-ipo-preview`, `company-ipo-book`, `company-ipo-refusal`, `company-ipo-lockup`, `company-window-none`, `company-plan-form`, `company-plan-commit`, `company-plan-commit-refusal` (the refusal under the hold button; `company-plan-blocked` stays reserved for the breach card), `company-plan-qty`, `company-plan-count`, `company-plan-first`, `company-plan-skips`, `company-plan-skip`, `company-plan-cant`, `company-plan-lockup`, `company-plan-min`, `company-buybacks`, `company-buyback-*`, `company-debt`, `company-covenant-*`, `company-borrow`, `company-loan-*`, `company-guarantee-rate`, `company-guarantee-outcome`, `company-dividends`, `company-div-*`, `company-takeover`, `company-stance-*`, `company-take-*`, `company-failure`, `company-bankrupt`, `company-personal-debt`, `company-payouts`, `company-capital` (the tab).

## 13. Acceptance
1. **No private fields where others can reach them (DOM check, Tape).** Seed a company with distinctive private values (sentinels such as quality 61.37, margin 0.4421, R&D split, marketing 412,000.00, a planned price, a draft plan, cash today). Render, as a **second player**, every route they can reach (Wire, Broker on the ticker, rivals list, Portfolio of the second player, spectator views) and the founder's own **"What the market sees"** side of every Company view. Assert none of the sentinel strings appear in `document.body.innerText` or in any attribute, and no element carries `data-private`. Run it before F and after F, private and listed.
2. **Lint:** `no-restricted-imports` blocks `CompanyFounderView` outside `src/app/company/**` (Quant §11). CI fails on a violation.
3. Before F, the market column and Wire contain no number from the coming filing; at F's open tick they match the frozen hash.
4. Every private card has a `priv-chip`. The toggle renders without a network call to private endpoints.
5. Window: on a closed day, `window-closed-ticket` shows the engine's `untilDay`; Buy/Sell cannot fire (no click handler, `aria-disabled`). On F + 17 the toast and `company-window-notice` appear once; at F + 21 close, open covered orders vanish and the founder Wire line names the count.
6. Plans: a third live plan, or a sell plan starting inside the lockup, can't be committed and shows its copy; Seed and Growth companies render no window card, banner or plan screen. Commit requires a full hold; after commit the row has no edit, cancel or menu control (`plan_immutable` at the UI); a plan with first day < today + 63 shows the `planTooSoon` copy with `earliestDay` and doesn't commit.
6a. Escrow: plans are sell-only (no buy/short/cover control exists); after commit, the row shows the locked shares and Broker shows "Locked · PLAN" apart from "Sellable"; a sell ticket can't exceed sellable shares; net worth is unchanged by the lock; no locked-cash line appears anywhere. `planUnfunded` shows the shortfall; `planImmutable` copy appears for an edit/cancel attempt through any entry point.
6b. Skips and endings: each reason (`volume`, `price`, `cap`, `halt`, `terminated`, `legal`, `tender`) renders its plain-words line; a second player sees the day and reason only; a court seizure renders "Seized · selling on schedule for creditor"; no reason renders a breach. After a `price` skip, the unsold shares show "locked until D(end + 63)" and stay unsellable until then.
6f. Minimum price: commit is impossible without `minSellPrice`; a value above 0.80 × today's close shows the `planFloorTooHigh` copy and doesn't commit.
6d. **Plan quantities never public (G7 DOM check).** Seed a plan with sentinel sizes (e.g. 13,579 per day, 40,737 total, 27,158 remaining, a fill of 4,321). As a second player, render every reachable surface (Wire, Filings, Broker, rivals, spectator) and the founder's "What the market sees" side; assert none of those numbers, nor the plan's instrument, appears in text or attributes, and that the public line matches `/^Sell plan · D\d+–D\d+/`.
6e. Insider filings: a founder trade in their own stock or a derivative on it (option, future) on day D (window or plan fill) appears in `company-insider-filings` and on the Wire on D + 1 with side, size and day, and not before.
6c. Clawback: every lend-to or contract-with-a-player-company confirm screen renders `clawback-warning` above the single confirm control, with the counterparty's name; `clawback-details` expands to Quant §5.3's text verbatim; there is no second confirm step.
7. Guarantee: the amount box is in the DOM and visible above the sign control; the checkbox starts unticked; the sign control is disabled until ticked; "without" is selected by default.
8. IPO: the ceremony is skippable, never mounts while a ticket confirmation is open, and shows the simulated-market line.
9. Copy lint: no banned words; minus is U+2212; all names fictional.

## 14. API fields needed from Quant / Forge
Most exist in Quant §11. Needed or to confirm:
- `CompanyFounderView.window` with `{ open, opensDay, closesDay, covered: string[] }` (covered is stored in state; please expose it in both views so the UI never hard-codes §6.5).
- `CompanyFounderView.plans: TradingPlan[]` with per-day fill status (`filled`, `skipped`, `qtyFilled`) for the struck-through chips and `planSkipped` copy.
- `CompanyFounderView.openCoveredOrders` (or a selector over the order book) for the notice card.
- `windowClosing` event (exists), plus the window-close cancellation as an event `{ kind: 'windowClosed', cancelled: OrderRef[], reopensDay }` so the Wire line and Broker update from one source.
- Reject codes: `closedWindow`, `lockup`, `stacking` (exist); `planTooSoon { earliestDay }`, `planLimit`, `planInLockup`, `planImmutable`, `planUnfunded { shortfall }` (confirmed); `planBanned { untilDay }` (confirmed). `planImmutable` replaces `planCommitted`.
- Plan escrow: `TradingPlan.locked: { cash?: number; shares?: number }`, `released` on end; `CompanyFounderView`/account `lockedCash` and per-position `lockedQty`.
- Public event `planSkipped { companyId, day, reason }` (no quantity; founder view adds `qtyFilled`), reasons `volume | price | cap | halt` (no `margin`), a plan-ending event with `reason: 'terminated' | 'legal' | 'tender'`, a seizure state `{ seized: true, creditor }` on the plan, `TradingPlan.minSellPrice`, `lockedUntilDay` for price-skipped shares, reject `planFloorTooHigh`; public plan shape `{ startDay, endDay }` only; `CompanyPublic.insiderTrades { day, side, qty }` filed D + 1 and a public breach filing `{ kind: 'planBreach', planId, day, reason }`; founder `plansBlockedUntilDay`.
- `ipoPreview: { price, sharesNew, raised, fee, lockupUntilDay }` once eligible, and `requirements: { key, met, value }[]` for the Listing checklist.
- Loan offers: `{ lender, amount, termDays, ratePerDay, ratePerDayGuaranteed, covenants }` and the guarantee exposure (`principal + accrued`) for the plain box.
- Decision previews: `previewAction(s, a)` returning runway, pBand and dqBand deltas without mutating state (the decision card needs before/after).
- `qualityScore` (display only, never fed back into the engine): `qualityScore = clamp(round(80 + 30 · ln(q / frontier)), 0, 100)`. A frontier product reads 80; half the frontier reads about 59; one maximal R&D success adds at most about 7.5 points. Gain bands are shown in these points (mock: +3 / +5 / +7). The "ready to ship" mark is a per-segment display threshold (mock: 55).
- Plan rejects `planLimit` and `planInLockup` (Ledger rulings; Quant to name them), and `CompanyFounderView.livePlans` count.
- Loan offers carry both `ratePerDay` and `ratePerDayGuaranteed = 0.75 · ratePerDay`.

## 15. Ledger rulings (2026-10-09) and what's still open
Decided:
1. **Private filings:** Seed and Growth file a yearly banded registry entry; Late-tier private companies file full quarterly statements (as in the pre-IPO mock).
2. **Weekly signals:** none before listing; the founder preview keeps the "from listing" label.
3. **Window:** starts with the first quarterly filing, so it covers Late-tier private founders (sector fund and its derivatives; the ≥ 5% index clause starts at listing, per Quant v1.7). Seed and Growth have no window.
4. **Plans:** at most 2 live; skipped days don't carry over; every fill goes through the shared ADV cap; a sell plan starting inside the lockup is refused.
5. **Public cash:** "Cash · total debt" appears in the market column, labelled with its filing day.
7. **Guarantee:** a relative 25% discount, `r_guaranteed = 0.75 · r_debt` per gd.
8. **Alliance wording:** "you, your alliance and accounts you control" when in an alliance; otherwise "you and accounts you control".
9. **Quality display:** `qualityScore` formula in §14.

Still open:
6. **T1 merge (C4)** is pending Mathis. Nothing here depends on it; if T1 businesses become stage-0 companies, the Seed checklist and Portfolio row need a revisit.

## Assumptions about Quant's numbers (mocks only)
- Calendar: quarter closes at multiples of 63 gd; F = close + 3; window F+2…F+21; warning at F+17. Day 504 close → F 507 → window 509–528; Day 567 → 570 → 572–591 (warning D587); Day 630 → 633 → 635–654.
- Plan block after a breach: read as the two full quarters after the breach quarter (breach D700 in Q12 → new plans after Q14, Day 882); Quant to confirm the exact end day.
- Plan escrow in the mock: 1,200 PACF and 45,000 LNTN locked (sell plans only).
- Founding quality 49 (about 0.36 of the frontier); ready to ship at 55; +3 / +5 / +7 per success.
- Founding on Day 36 with $200k founder equity (≥ $100k); one R&D head at 200/gd; Food quality project T0 = 10 gd with 2 heads, so 20 gd with one.
- Late tier from Day 381; engine equity value $46.8M at Day 500; 7 filed quarters.
- IPO at 0.9 × V; 2,000,000 shares post; 25% float raises ≈ $11.3M before the 5% fee at V = $50M; listed D512 at 22.50; lockup 168 gd → D680; founder 72.0% → 54.0%.
- Term loan $2M at 0.034%/gd without guarantee and 0.0255%/gd with it (171,360.00 vs 128,520.00 a year at 252 gd).
- PACF (sector fund) and GXI (broad index fund) are placeholder names; the engine has no tradeable ETFs yet.

## Changelog
- **v1.5 (Forge, Phase 4 operations half, DECISIONS C5):** corrected to Quant v1.7. The Late-tier index clause now applies from listing (sector fund and derivatives only before it, §6.1). The public plan version drops `company-plan-minprice` (`minSellPrice` is never public). The clawback box cites v1.7 §5.3 (insider and 64-day rules, unchanged text). Owner: Velvet to confirm.
- **v1.5 (Forge, with the Phase 4 build):** brought to Quant v1.7 (`docs/team/specs/quant-company-building.md`). The public plan row carries no minimum price and no size (Quant v1.7 §10(a)): `company-plan-minprice` is removed from it. The Late-tier private window covers the sector fund and its derivatives; the index clause starts at listing. The clawback box states the 64-day safe harbour and the insider rule (signing or payment day). The IPO line adds the owner-set refusal. The capital tab test ids are listed in §12. Derivatives on a company stock are not tradeable in v1, so insider filings carry stock only until listed derivatives exist.
- **v1.4 (2026-10-09), Ledger's answers + Tape V1/V2:** sell-only plans, next-day filing of every founder trade and no pre-announcement are settled (old Quant notes removed); insider filings cover the stock and its options/futures; `price` = below the founder's minimum sell price, plus plain-words lines for `cap`, `terminated`, `legal` (incl. court seizure: "Seized · selling on schedule for creditor"), `tender`; required `minSellPrice` ≤ 0.80 × today's close with `planFloorTooHigh`; price-skipped shares locked until plan end + 63; `margin` removed and the breach path kept only as an unreachable fail-safe; clawback box gains a Details expander with Quant §5.3's text, one confirm. Mocks updated.
- **v1.3 (2026-10-09), Ledger (Tape's no-reveal leak G7):** plans are sell-only and escrow is locked shares only (buy plans, × 1.25 cash escrow and the locked-cash state removed); the public sees only that a plan exists with its start and end days; public skips carry day and reason only; founder trades in their own stock are public insider filings the next day (Filings list, Wire type, ticket copy); plain-words reasons for `volume`, `price`, `cap`, `halt`, `terminated`, `legal`, `tender` (none a breach) and `margin` (breach). Mocks updated.
- **v1.2 (2026-10-09):** `windowClosing` moved to F+17 (D587 in the mocks). Plan codes confirmed and added (`planTooSoon { earliestDay }`, `planImmutable`, `planUnfunded { shortfall }`, `planBanned` pending Quant). Plan escrow (sell locks shares; buy locks commit-day close × 1.25), `PLAN` locked lines, Available vs Locked in Broker, collateral rule. Public `planSkipped` reasons, breach filing and the 2-quarter plan block. Clawback warning when lending to or contracting with another player's company.
- **v1.1 (2026-10-09):** Ledger's rulings applied: private filings by tier, no signals before listing, window from the first quarterly filing (Late tier), plan limits (2 live, no carry-over, shared ADV cap, no sell plan inside lockup), dated public cash, guarantee as 0.75 × rate, alliance wording, `qualityScore` display formula. Mocks updated to match.
- **v1 (2026-10-09):** first spec, aligned to Quant v1.2 (open trading window, scheduled plans, `windowClosing`). All earlier blackout, notice and reduce-only designs are dropped.
- **v1.2.1 (2026-10-09):** `planBanned { untilDay }` confirmed by Quant and Ledger; ban = two full quarters after the breach quarter (breach D700, plans again from D883).
